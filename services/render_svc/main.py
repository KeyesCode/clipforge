#!/usr/bin/env python3
"""
ClipForge Rendering Service
Handles video rendering with captions, effects, and S3 integration for orchestrator
"""

import os
import asyncio
import tempfile
import shutil
from datetime import datetime
from typing import Dict, List, Optional, Any
import structlog
import aiohttp
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import boto3
from botocore.exceptions import ClientError

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

# Configuration
RENDER_SERVICE_PORT = int(os.getenv("RENDER_SERVICE_PORT", "8005"))
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:3001")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "clipforge-storage")
TEMP_DIR = os.getenv("TEMP_DIR", "/tmp/clipforge_render")

# Ensure temp directory exists
os.makedirs(TEMP_DIR, exist_ok=True)

# FastAPI app and job tracking
app = FastAPI(title="ClipForge Rendering Service")
processing_jobs: Dict[str, Dict[str, Any]] = {}

class RenderConfig(BaseModel):
    format: str = "mp4"
    resolution: str = "1080p"
    platform: str = "youtube_shorts"

class CaptionSegment(BaseModel):
    text: str
    start: float
    end: float

class CaptionConfig(BaseModel):
    segments: List[CaptionSegment]
    style: str = "gaming"

class RenderRequest(BaseModel):
    clipId: str
    sourceVideo: str  # S3 URL
    startTime: float
    duration: float
    renderConfig: RenderConfig
    captions: CaptionConfig
    effects: List[Dict[str, Any]] = []

class S3Client:
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            endpoint_url=os.getenv('S3_ENDPOINT_URL'),
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
        )
        self.bucket_name = S3_BUCKET_NAME

    def download_file(self, s3_key: str, local_path: str) -> bool:
        """Download file from S3 to local path"""
        try:
            self.s3_client.download_file(self.bucket_name, s3_key, local_path)
            logger.info("Downloaded from S3", s3_key=s3_key, local_path=local_path)
            return True
        except ClientError as e:
            logger.error("S3 download failed", s3_key=s3_key, error=str(e))
            return False

    def upload_file(self, local_path: str, s3_key: str) -> bool:
        """Upload file from local path to S3"""
        try:
            self.s3_client.upload_file(local_path, self.bucket_name, s3_key)
            logger.info("Uploaded to S3", local_path=local_path, s3_key=s3_key)
            return True
        except ClientError as e:
            logger.error("S3 upload failed", local_path=local_path, error=str(e))
            return False

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "render_svc"
    }

@app.post("/render")
async def render_clip_endpoint(
    request: RenderRequest,
    background_tasks: BackgroundTasks
):
    """Start render job for clip (matches orchestrator call format)"""
    try:
        clip_id = request.clipId
        
        # Add background task
        background_tasks.add_task(process_render_job, request)
        
        # Initialize job tracking
        processing_jobs[clip_id] = {
            "status": "accepted",
            "accepted_at": datetime.utcnow().isoformat()
        }
        
        logger.info("Render job accepted", clip_id=clip_id, duration=request.duration)
        return {"status": "accepted", "clipId": clip_id}
        
    except Exception as e:
        logger.error("Failed to accept render job", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to accept render job")

@app.get("/render/{clip_id}")
async def get_render_status(clip_id: str):
    """Get render status for clip (polling endpoint for orchestrator)"""
    if clip_id not in processing_jobs:
        raise HTTPException(status_code=404, detail="Clip not found")
    
    return processing_jobs[clip_id]

async def process_render_job(request: RenderRequest):
    """Background task to process rendering"""
    clip_id = request.clipId
    
    try:
        # Update status
        processing_jobs[clip_id]["status"] = "processing"
        processing_jobs[clip_id]["started_at"] = datetime.utcnow().isoformat()
        
        # Process the render
        result = await render_video_clip(request)
        
        # Update with results
        processing_jobs[clip_id].update({
            "status": "completed",
            "completed_at": datetime.utcnow().isoformat(),
            **result
        })
        
        # Notify orchestrator via webhook
        await notify_orchestrator_webhook(clip_id, result)
        
    except Exception as e:
        logger.error("Render job failed", clip_id=clip_id, error=str(e))
        processing_jobs[clip_id].update({
            "status": "failed",
            "error": str(e),
            "failed_at": datetime.utcnow().isoformat()
        })

async def render_video_clip(request: RenderRequest) -> Dict[str, Any]:
    """Core video rendering logic"""
    import ffmpeg
    
    s3_client = S3Client()
    clip_id = request.clipId
    
    # Create working directory
    work_dir = os.path.join(TEMP_DIR, clip_id)
    os.makedirs(work_dir, exist_ok=True)
    
    try:
        # Download source video from S3
        source_s3_key = request.sourceVideo.split(f"{S3_BUCKET_NAME}/")[-1]
        source_local_path = os.path.join(work_dir, "source.mp4")
        
        success = s3_client.download_file(source_s3_key, source_local_path)
        if not success:
            raise Exception(f"Failed to download source video: {source_s3_key}")
        
        # Generate output paths
        output_filename = f"{clip_id}.mp4"
        thumbnail_filename = f"{clip_id}_thumbnail.jpg"
        output_local_path = os.path.join(work_dir, output_filename)
        thumbnail_local_path = os.path.join(work_dir, thumbnail_filename)
        
        # Extract and render video segment
        await extract_video_segment(
            source_local_path,
            output_local_path,
            request.startTime,
            request.duration,
            request.renderConfig
        )
        
        # Add captions if provided
        if request.captions.segments:
            captioned_path = os.path.join(work_dir, f"{clip_id}_captioned.mp4")
            await add_captions_to_video(
                output_local_path,
                captioned_path, 
                request.captions,
                request.startTime
            )
            output_local_path = captioned_path
        
        # Generate thumbnail
        await generate_thumbnail(output_local_path, thumbnail_local_path)
        
        # Upload to S3
        output_s3_key = f"rendered/{output_filename}"
        thumbnail_s3_key = f"thumbnails/{thumbnail_filename}"
        
        output_upload_success = s3_client.upload_file(output_local_path, output_s3_key)
        thumbnail_upload_success = s3_client.upload_file(thumbnail_local_path, thumbnail_s3_key)
        
        if not output_upload_success:
            raise Exception("Failed to upload rendered video to S3")
        
        # Get file metadata
        file_size = os.path.getsize(output_local_path)
        
        return {
            "outputPath": f"s3://{S3_BUCKET_NAME}/{output_s3_key}",
            "thumbnailPath": f"s3://{S3_BUCKET_NAME}/{thumbnail_s3_key}" if thumbnail_upload_success else None,
            "metadata": {
                "duration": request.duration,
                "resolution": request.renderConfig.resolution,
                "fileSize": file_size,
                "platform": request.renderConfig.platform
            }
        }
        
    finally:
        # Cleanup working directory
        shutil.rmtree(work_dir, ignore_errors=True)

async def extract_video_segment(
    source_path: str,
    output_path: str, 
    start_time: float,
    duration: float,
    render_config: RenderConfig
):
    """Extract video segment using FFmpeg"""
    import ffmpeg
    
    # Platform-specific resolution mapping
    resolution_map = {
        "youtube_shorts": "1080x1920",
        "tiktok": "1080x1920", 
        "instagram_reels": "1080x1920",
        "1080p": "1920x1080",
        "720p": "1280x720"
    }
    
    target_resolution = resolution_map.get(render_config.platform, render_config.resolution)
    width, height = map(int, target_resolution.split('x'))
    
    try:
        # FFmpeg pipeline for video extraction and formatting
        stream = ffmpeg.input(source_path, ss=start_time, t=duration)
        stream = ffmpeg.filter(stream, 'scale', width, height)
        stream = ffmpeg.output(stream, output_path, 
                             vcodec='libx264',
                             acodec='aac',
                             crf=23,
                             preset='medium')
        ffmpeg.run(stream, overwrite_output=True, quiet=True)
        
    except ffmpeg.Error as e:
        logger.error("FFmpeg error during extraction", error=str(e))
        raise Exception(f"Video extraction failed: {e}")

async def add_captions_to_video(
    input_path: str,
    output_path: str,
    captions: CaptionConfig,
    video_start_time: float
):
    """Add captions overlay to video"""
    import ffmpeg
    
    # Create subtitle file
    srt_path = input_path.replace('.mp4', '.srt')
    
    with open(srt_path, 'w') as f:
        for i, segment in enumerate(captions.segments, 1):
            # Adjust timing relative to video start
            start_adjusted = max(0, segment.start - video_start_time)
            end_adjusted = max(0, segment.end - video_start_time)
            
            if start_adjusted >= 0 and end_adjusted > start_adjusted:
                f.write(f"{i}\n")
                f.write(f"{format_srt_time(start_adjusted)} --> {format_srt_time(end_adjusted)}\n")
                f.write(f"{segment.text}\n\n")
    
    try:
        # Apply captions with gaming style
        stream = ffmpeg.input(input_path)
        stream = ffmpeg.filter(stream, 'subtitles', srt_path,
                             force_style='FontName=Arial Bold,FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2')
        stream = ffmpeg.output(stream, output_path,
                             vcodec='libx264',
                             acodec='aac', 
                             crf=23)
        ffmpeg.run(stream, overwrite_output=True, quiet=True)
        
        # Cleanup subtitle file
        os.remove(srt_path)
        
    except ffmpeg.Error as e:
        logger.error("FFmpeg error during caption overlay", error=str(e))
        raise Exception(f"Caption overlay failed: {e}")

async def generate_thumbnail(video_path: str, thumbnail_path: str):
    """Generate video thumbnail"""
    import ffmpeg
    
    try:
        stream = ffmpeg.input(video_path, ss=1)  # Take frame at 1 second
        stream = ffmpeg.filter(stream, 'scale', 480, 270)  # Thumbnail size
        stream = ffmpeg.output(stream, thumbnail_path, vframes=1)
        ffmpeg.run(stream, overwrite_output=True, quiet=True)
        
    except ffmpeg.Error as e:
        logger.error("Thumbnail generation failed", error=str(e))
        # Don't fail the job if thumbnail fails
        pass

def format_srt_time(seconds: float) -> str:
    """Format time for SRT subtitle format"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    millisecs = int((secs % 1) * 1000)
    secs = int(secs)
    
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millisecs:03d}"

async def notify_orchestrator_webhook(clip_id: str, result: Dict[str, Any]):
    """Notify orchestrator of completed rendering"""
    try:
        webhook_url = f"{ORCHESTRATOR_URL}/api/processing/webhooks/rendering-complete"
        
        async with aiohttp.ClientSession() as session:
            await session.post(webhook_url, json={
                "clipId": clip_id,
                "result": result
            })
        
        logger.info("Rendering webhook sent", clip_id=clip_id)
    except Exception as e:
        logger.error("Failed to send rendering webhook", clip_id=clip_id, error=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=RENDER_SERVICE_PORT)