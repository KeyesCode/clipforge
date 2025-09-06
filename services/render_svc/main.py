#!/usr/bin/env python3
"""
ClipForge Render Service
Handles video rendering with captions, crops, and effects using FFmpeg
"""

import os
import json
import asyncio
import uuid
import tempfile
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

import structlog
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential

# Video processing imports
import ffmpeg
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import subprocess
import tempfile

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Environment configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://:redis_secure_password_2024@redis:6379")
SERVICE_PORT = int(os.getenv("RENDER_SERVICE_PORT", "8004"))
CLIPS_STORAGE_PATH = os.getenv("CLIPS_STORAGE_PATH", "./data/clips")
TEMP_RENDER_PATH = os.getenv("TEMP_RENDER_PATH", "./tmp/render")
FONTS_PATH = os.getenv("FONTS_PATH", "/usr/share/fonts")
MAX_CONCURRENT_RENDERS = int(os.getenv("MAX_CONCURRENT_RENDERS", "2"))
DEFAULT_FONT_SIZE = int(os.getenv("DEFAULT_FONT_SIZE", "36"))
DEFAULT_RESOLUTION = os.getenv("DEFAULT_RESOLUTION", "1920x1080")

# Pydantic models
class CaptionStyle(BaseModel):
    font_family: str = "Arial"
    font_size: int = DEFAULT_FONT_SIZE
    font_color: str = "#FFFFFF"
    background_color: str = "#000000"
    background_opacity: float = 0.7
    position: str = "bottom"  # top, center, bottom
    margin: int = 50
    max_width: Optional[int] = None
    text_align: str = "center"  # left, center, right
    stroke_color: Optional[str] = "#000000"
    stroke_width: int = 2

class CropSettings(BaseModel):
    aspect_ratio: str = "16:9"  # 16:9, 9:16, 1:1, 4:3
    position: str = "center"  # center, top, bottom, left, right
    smart_crop: bool = True  # Use face detection for crop positioning

class RenderSettings(BaseModel):
    resolution: str = DEFAULT_RESOLUTION
    fps: int = 30
    bitrate: str = "5M"
    codec: str = "libx264"
    preset: str = "medium"
    crf: int = 23
    audio_codec: str = "aac"
    audio_bitrate: str = "128k"

class ClipRenderRequest(BaseModel):
    clip_id: str = Field(..., description="Unique clip identifier")
    source_path: str = Field(..., description="Path to source video file")
    start_time: float = Field(..., description="Start time in seconds")
    end_time: float = Field(..., description="End time in seconds")
    captions: List[Dict[str, Any]] = Field(default=[], description="Caption segments with timing")
    caption_style: CaptionStyle = Field(default_factory=CaptionStyle)
    crop_settings: Optional[CropSettings] = Field(None, description="Crop settings")
    render_settings: RenderSettings = Field(default_factory=RenderSettings)
    effects: List[str] = Field(default=[], description="Video effects to apply")
    job_id: Optional[str] = Field(None, description="Optional job correlation ID")

class RenderJob(BaseModel):
    job_id: str
    clip_id: str
    status: str
    progress: float
    output_path: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    service: str = "render_svc"
    ffmpeg_available: bool
    redis_connected: bool
    temp_storage_available: bool

# Global variables
app = FastAPI(title="Render Service", version="1.0.0")
redis_client: Optional[redis.Redis] = None
render_semaphore = asyncio.Semaphore(MAX_CONCURRENT_RENDERS)
active_jobs: Dict[str, RenderJob] = {}

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def init_redis():
    """Initialize Redis connection"""
    global redis_client
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        await redis_client.ping()
        logger.info("Redis connection established", redis_url=REDIS_URL)
    except Exception as e:
        logger.error("Failed to connect to Redis", error=str(e))
        raise

def check_ffmpeg():
    """Check if FFmpeg is available"""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
async def publish_event(event_type: str, data: Dict[str, Any], correlation_id: str):
    """Publish event to Redis with retry logic"""
    try:
        event = {
            "eventId": str(uuid.uuid4()),
            "eventType": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0",
            "source": "render_svc",
            "correlationId": correlation_id,
            "data": data
        }
        
        await redis_client.publish("clipforge.events", json.dumps(event))
        logger.info("Event published", event_type=event_type, correlation_id=correlation_id)
    except Exception as e:
        logger.error("Failed to publish event", event_type=event_type, error=str(e))
        raise

def create_subtitle_file(captions: List[Dict[str, Any]], temp_dir: str) -> str:
    """Create SRT subtitle file from captions"""
    subtitle_path = os.path.join(temp_dir, "subtitles.srt")
    
    with open(subtitle_path, 'w', encoding='utf-8') as f:
        for i, caption in enumerate(captions, 1):
            start_time = caption.get('start_time', 0)
            end_time = caption.get('end_time', start_time + 3)
            text = caption.get('text', '')
            
            # Convert seconds to SRT time format
            start_srt = seconds_to_srt_time(start_time)
            end_srt = seconds_to_srt_time(end_time)
            
            f.write(f"{i}\n")
            f.write(f"{start_srt} --> {end_srt}\n")
            f.write(f"{text}\n\n")
    
    return subtitle_path

def seconds_to_srt_time(seconds: float) -> str:
    """Convert seconds to SRT time format (HH:MM:SS,mmm)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def calculate_crop_dimensions(source_width: int, source_height: int, aspect_ratio: str) -> Tuple[int, int, int, int]:
    """Calculate crop dimensions based on aspect ratio"""
    ar_map = {
        "16:9": (16, 9),
        "9:16": (9, 16),
        "1:1": (1, 1),
        "4:3": (4, 3),
        "21:9": (21, 9)
    }
    
    if aspect_ratio not in ar_map:
        return 0, 0, source_width, source_height
    
    target_w_ratio, target_h_ratio = ar_map[aspect_ratio]
    
    # Calculate target dimensions while maintaining aspect ratio
    target_aspect = target_w_ratio / target_h_ratio
    source_aspect = source_width / source_height
    
    if source_aspect > target_aspect:
        # Source is wider, crop width
        new_width = int(source_height * target_aspect)
        new_height = source_height
        x = (source_width - new_width) // 2
        y = 0
    else:
        # Source is taller, crop height
        new_width = source_width
        new_height = int(source_width / target_aspect)
        x = 0
        y = (source_height - new_height) // 2
    
    return x, y, new_width, new_height

def create_ffmpeg_filters(request: ClipRenderRequest, video_info: Dict[str, Any]) -> List[str]:
    """Create FFmpeg filter chain based on render settings"""
    filters = []
    
    # Crop filter
    if request.crop_settings:
        source_width = video_info.get('width', 1920)
        source_height = video_info.get('height', 1080)
        
        x, y, width, height = calculate_crop_dimensions(
            source_width, source_height, request.crop_settings.aspect_ratio
        )
        
        if x > 0 or y > 0 or width != source_width or height != source_height:
            filters.append(f"crop={width}:{height}:{x}:{y}")
    
    # Scale filter for resolution
    target_width, target_height = map(int, request.render_settings.resolution.split('x'))
    filters.append(f"scale={target_width}:{target_height}:flags=lanczos")
    
    # Effects
    for effect in request.effects:
        if effect == "stabilize":
            filters.append("vidstabdetect=stepsize=6:shakiness=10:accuracy=15")
        elif effect == "denoise":
            filters.append("nlmeans=s=2.0")
        elif effect == "sharpen":
            filters.append("unsharp=5:5:1.0:5:5:0.0")
        elif effect == "brightness":
            filters.append("eq=brightness=0.1")
        elif effect == "contrast":
            filters.append("eq=contrast=1.2")
    
    # FPS filter
    if request.render_settings.fps != video_info.get('fps', 30):
        filters.append(f"fps={request.render_settings.fps}")
    
    return filters

def get_video_info(video_path: str) -> Dict[str, Any]:
    """Get video information using FFprobe"""
    try:
        probe = ffmpeg.probe(video_path)
        video_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'video'), None)
        
        if not video_stream:
            raise ValueError("No video stream found")
        
        return {
            'width': int(video_stream['width']),
            'height': int(video_stream['height']),
            'fps': eval(video_stream['r_frame_rate']),
            'duration': float(video_stream.get('duration', 0)),
            'codec': video_stream['codec_name']
        }
    except Exception as e:
        logger.error("Failed to get video info", video_path=video_path, error=str(e))
        raise

async def render_clip(request: ClipRenderRequest, progress_callback=None) -> str:
    """Render clip with all specified settings"""
    temp_dir = tempfile.mkdtemp(dir=TEMP_RENDER_PATH)
    
    try:
        # Generate output filename
        output_filename = f"{request.clip_id}_{int(datetime.utcnow().timestamp())}.mp4"
        output_path = os.path.join(CLIPS_STORAGE_PATH, output_filename)
        
        # Ensure output directory exists
        os.makedirs(CLIPS_STORAGE_PATH, exist_ok=True)
        
        # Get video information
        video_info = get_video_info(request.source_path)
        
        # Create subtitle file if captions provided
        subtitle_path = None
        if request.captions:
            subtitle_path = create_subtitle_file(request.captions, temp_dir)
        
        # Build FFmpeg command
        input_stream = ffmpeg.input(
            request.source_path, 
            ss=request.start_time, 
            t=request.end_time - request.start_time
        )
        
        # Apply video filters
        video_filters = create_ffmpeg_filters(request, video_info)
        video = input_stream['v']
        
        if video_filters:
            video = video.filter(','.join(video_filters))
        
        # Add subtitles if available
        if subtitle_path:
            # Create subtitle filter with styling
            style = request.caption_style
            subtitle_filter = f"subtitles={subtitle_path}:force_style='FontName={style.font_family},FontSize={style.font_size},PrimaryColour=&H{style.font_color[1:]},BackColour=&H{style.background_color[1:]},Bold=1,Outline=2'"
            video = video.filter('subtitles', subtitle_path, force_style=subtitle_filter)
        
        # Audio stream
        audio = input_stream['a']
        
        # Output with settings
        output = ffmpeg.output(
            video, audio, output_path,
            vcodec=request.render_settings.codec,
            acodec=request.render_settings.audio_codec,
            preset=request.render_settings.preset,
            crf=request.render_settings.crf,
            video_bitrate=request.render_settings.bitrate,
            audio_bitrate=request.render_settings.audio_bitrate,
            movflags='faststart'  # Optimize for web streaming
        )
        
        # Run FFmpeg
        logger.info("Starting FFmpeg render", 
                   clip_id=request.clip_id,
                   output_path=output_path)
        
        if progress_callback:
            await progress_callback(0.1, "Starting render")
        
        # Execute with progress monitoring
        process = await asyncio.create_subprocess_exec(
            *ffmpeg.compile(output),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown FFmpeg error"
            logger.error("FFmpeg render failed", 
                        clip_id=request.clip_id, 
                        error=error_msg)
            raise Exception(f"Render failed: {error_msg}")
        
        if progress_callback:
            await progress_callback(1.0, "Render complete")
        
        logger.info("Clip rendered successfully", 
                   clip_id=request.clip_id,
                   output_path=output_path,
                   file_size=os.path.getsize(output_path))
        
        return output_path
        
    finally:
        # Cleanup temp directory
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

async def process_render_job(request: ClipRenderRequest):
    """Background job to process clip rendering"""
    correlation_id = request.job_id or str(uuid.uuid4())
    job = RenderJob(
        job_id=correlation_id,
        clip_id=request.clip_id,
        status="processing",
        progress=0.0,
        created_at=datetime.utcnow()
    )
    active_jobs[correlation_id] = job
    
    async def update_progress(progress: float, message: str):
        job.progress = progress
        active_jobs[correlation_id] = job
        await publish_event("job.progress_updated", {
            "jobId": correlation_id,
            "progress": progress,
            "message": message
        }, correlation_id)
    
    async with render_semaphore:
        try:
            logger.info("Starting render job", 
                       clip_id=request.clip_id,
                       correlation_id=correlation_id)
            
            # Publish job started event
            await publish_event("job.status_changed", {
                "jobId": correlation_id,
                "status": "processing",
                "service": "render_svc",
                "clipId": request.clip_id
            }, correlation_id)
            
            # Validate source file
            if not os.path.exists(request.source_path):
                raise FileNotFoundError(f"Source file not found: {request.source_path}")
            
            await update_progress(0.1, "Validating source file")
            
            # Render clip
            output_path = await render_clip(request, update_progress)
            
            job.status = "completed"
            job.output_path = output_path
            job.completed_at = datetime.utcnow()
            job.progress = 1.0
            active_jobs[correlation_id] = job
            
            # Publish clip rendered event
            await publish_event("clip.rendered", {
                "clipId": request.clip_id,
                "outputPath": output_path,
                "fileSize": os.path.getsize(output_path),
                "duration": request.end_time - request.start_time
            }, correlation_id)
            
            # Publish job completed event
            await publish_event("job.status_changed", {
                "jobId": correlation_id,
                "status": "completed",
                "service": "render_svc",
                "clipId": request.clip_id
            }, correlation_id)
            
            logger.info("Render job completed", 
                       clip_id=request.clip_id,
                       correlation_id=correlation_id,
                       output_path=output_path)
            
        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
            active_jobs[correlation_id] = job
            
            logger.error("Render job failed", 
                        clip_id=request.clip_id,
                        correlation_id=correlation_id,
                        error=str(e))
            
            # Publish job failed event
            await publish_event("job.status_changed", {
                "jobId": correlation_id,
                "status": "failed",
                "service": "render_svc",
                "clipId": request.clip_id,
                "error": str(e)
            }, correlation_id)

# API Endpoints
@app.post("/render", response_model=Dict[str, str])
async def render_clip_endpoint(
    request: ClipRenderRequest,
    background_tasks: BackgroundTasks
):
    """Start clip rendering job"""
    try:
        correlation_id = request.job_id or str(uuid.uuid4())
        
        # Validate source file exists
        if not os.path.exists(request.source_path):
            raise HTTPException(status_code=404, detail=f"Source file not found: {request.source_path}")
        
        # Add background task
        background_tasks.add_task(process_render_job, request)
        
        logger.info("Render job queued", 
                   clip_id=request.clip_id,
                   correlation_id=correlation_id)
        
        return {
            "status": "accepted",
            "clip_id": request.clip_id,
            "correlation_id": correlation_id,
            "message": "Render job started"
        }
        
    except Exception as e:
        logger.error("Failed to start render job", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/job/{job_id}")
async def get_job_status(job_id: str):
    """Get render job status"""
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = active_jobs[job_id]
    return job.dict()

@app.get("/clip/{clip_id}")
async def get_rendered_clip(clip_id: str):
    """Get information about rendered clip"""
    try:
        # Search for clip files
        clip_files = [f for f in os.listdir(CLIPS_STORAGE_PATH) if f.startswith(clip_id)]
        
        if not clip_files:
            raise HTTPException(status_code=404, detail="Clip not found")
        
        clip_file = clip_files[0]
        clip_path = os.path.join(CLIPS_STORAGE_PATH, clip_file)
        
        # Get file info
        file_stat = os.stat(clip_path)
        video_info = get_video_info(clip_path)
        
        return {
            "clip_id": clip_id,
            "file_path": clip_path,
            "file_size": file_stat.st_size,
            "created_at": datetime.fromtimestamp(file_stat.st_ctime).isoformat(),
            "duration": video_info.get('duration', 0),
            "resolution": f"{video_info.get('width', 0)}x{video_info.get('height', 0)}",
            "fps": video_info.get('fps', 0)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get clip info", clip_id=clip_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/clip/{clip_id}")
async def delete_rendered_clip(clip_id: str):
    """Delete rendered clip"""
    try:
        # Find clip files
        clip_files = [f for f in os.listdir(CLIPS_STORAGE_PATH) if f.startswith(clip_id)]
        
        if not clip_files:
            raise HTTPException(status_code=404, detail="Clip not found")
        
        deleted_files = []
        for clip_file in clip_files:
            clip_path = os.path.join(CLIPS_STORAGE_PATH, clip_file)
            os.remove(clip_path)
            deleted_files.append(clip_file)
        
        logger.info("Clip deleted", clip_id=clip_id, files=deleted_files)
        
        return {
            "status": "deleted",
            "clip_id": clip_id,
            "deleted_files": deleted_files
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete clip", clip_id=clip_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    try:
        # Check Redis connection
        redis_connected = False
        try:
            await redis_client.ping()
            redis_connected = True
        except:
            pass
        
        # Check FFmpeg
        ffmpeg_available = check_ffmpeg()
        
        # Check temp storage
        temp_storage_available = os.path.exists(TEMP_RENDER_PATH) and os.access(TEMP_RENDER_PATH, os.W_OK)
        
        status = "healthy" if redis_connected and ffmpeg_available and temp_storage_available else "unhealthy"
        
        return HealthResponse(
            status=status,
            timestamp=datetime.utcnow().isoformat(),
            ffmpeg_available=ffmpeg_available,
            redis_connected=redis_connected,
            temp_storage_available=temp_storage_available
        )
        
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stats")
async def get_service_stats():
    """Get service statistics"""
    try:
        # Count rendered clips
        clip_count = 0
        total_size = 0
        if os.path.exists(CLIPS_STORAGE_PATH):
            for filename in os.listdir(CLIPS_STORAGE_PATH):
                if filename.endswith('.mp4'):
                    clip_count += 1
                    total_size += os.path.getsize(os.path.join(CLIPS_STORAGE_PATH, filename))
        
        return {
            "service": "render_svc",
            "ffmpeg_available": check_ffmpeg(),
            "max_concurrent_renders": MAX_CONCURRENT_RENDERS,
            "active_jobs": len(active_jobs),
            "total_clips": clip_count,
            "total_storage_size": total_size,
            "clips_path": CLIPS_STORAGE_PATH,
            "temp_path": TEMP_RENDER_PATH
        }
        
    except Exception as e:
        logger.error("Failed to get stats", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize service on startup"""
    logger.info("Starting Render Service", port=SERVICE_PORT)
    
    # Create storage directories
    os.makedirs(CLIPS_STORAGE_PATH, exist_ok=True)
    os.makedirs(TEMP_RENDER_PATH, exist_ok=True)
    
    # Initialize Redis connection
    await init_redis()
    
    # Check FFmpeg availability
    if not check_ffmpeg():
        logger.warning("FFmpeg not available - rendering will fail")
    
    logger.info("Render Service started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Render Service")
    
    if redis_client:
        await redis_client.close()
    
    logger.info("Render Service shutdown complete")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORT)