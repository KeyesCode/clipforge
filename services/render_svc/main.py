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
            print(f"🎬 S3: Starting download - bucket: {self.bucket_name}, key: {s3_key}")
            logger.info("Attempting S3 download", bucket=self.bucket_name, s3_key=s3_key, local_path=local_path)
            
            # First check if file exists
            print(f"🎬 S3: Checking if file exists...")
            try:
                self.s3_client.head_object(Bucket=self.bucket_name, Key=s3_key)
                print(f"🎬 S3: File exists, proceeding with download...")
            except ClientError as head_error:
                print(f"🎬 S3: File does not exist! Error: {head_error}")
                logger.error("S3 file not found", bucket=self.bucket_name, s3_key=s3_key, error=str(head_error))
                return False
            
            print(f"🎬 S3: Starting actual download...")
            self.s3_client.download_file(self.bucket_name, s3_key, local_path)
            print(f"🎬 S3: Download completed successfully!")
            logger.info("Downloaded from S3", s3_key=s3_key, local_path=local_path)
            return True
        except ClientError as e:
            print(f"🎬 S3: Download failed with ClientError: {e}")
            logger.error("S3 download failed", bucket=self.bucket_name, s3_key=s3_key, error=str(e))
            return False
        except Exception as e:
            print(f"🎬 S3: Download failed with unexpected error: {e}")
            logger.error("S3 download failed with unexpected error", bucket=self.bucket_name, s3_key=s3_key, error=str(e))
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
        print(f"🎬 JOB: Starting background render job for clip {clip_id}")
        
        # Update status
        processing_jobs[clip_id]["status"] = "processing"
        processing_jobs[clip_id]["started_at"] = datetime.utcnow().isoformat()
        processing_jobs[clip_id]["progress"] = 0
        
        def update_progress(percentage: int, message: str):
            processing_jobs[clip_id]["progress"] = percentage
            processing_jobs[clip_id]["progress_message"] = message
            print(f"🎬 PROGRESS: [{percentage:3d}%] {message}")
            logger.info("Render progress", clip_id=clip_id, progress=percentage, message=message)
        
        print(f"🎬 JOB: Updated job status to processing, calling render_video_clip...")
        
        # Process the render
        result = await render_video_clip(request, update_progress)
        
        print(f"🎬 JOB: render_video_clip completed successfully!")
        
        # Update with results
        processing_jobs[clip_id].update({
            "status": "completed",
            "completed_at": datetime.utcnow().isoformat(),
            **result
        })
        
        print(f"🎬 JOB: About to notify orchestrator webhook...")
        
        # Notify orchestrator via webhook
        await notify_orchestrator_webhook(clip_id, result)
        
        print(f"🎬 JOB: Webhook notification completed successfully!")
        
    except Exception as e:
        print(f"🎬 JOB: Render job failed with error: {e}")
        print(f"🎬 JOB: Error type: {type(e)}")
        logger.error("Render job failed", clip_id=clip_id, error=str(e))
        processing_jobs[clip_id].update({
            "status": "failed",
            "error": str(e),
            "failed_at": datetime.utcnow().isoformat()
        })

async def render_video_clip(request: RenderRequest, update_progress=None) -> Dict[str, Any]:
    """Core video rendering logic"""
    import ffmpeg
    
    s3_client = S3Client()
    clip_id = request.clipId
    
    logger.info("Starting render job", clip_id=clip_id, source_video=request.sourceVideo)
    
    if update_progress:
        update_progress(5, "Initializing render job")
    
    # Create working directory
    work_dir = os.path.join(TEMP_DIR, clip_id)
    os.makedirs(work_dir, exist_ok=True)
    
    if update_progress:
        update_progress(10, "Created working directory")
    
    try:
        # Download source video from S3
        # Handle different source video formats
        logger.info("Parsing source video URL", source_video=request.sourceVideo, bucket_name=S3_BUCKET_NAME)
        
        # Add explicit logging for debugging
        print(f"🎬 RENDER: Starting URL parsing for {request.sourceVideo}")
        print(f"🎬 RENDER: Bucket name is {S3_BUCKET_NAME}")
        
        if request.sourceVideo.startswith("s3://"):
            # Full S3 URL format: s3://bucket-name/path/to/file
            source_s3_key = request.sourceVideo.split(f"{S3_BUCKET_NAME}/")[-1]
            logger.info("Parsed as S3 URL", s3_key=source_s3_key)
        elif request.sourceVideo.startswith("http"):
            # HTTP URL format like http://localhost:4566/clipforge-storage/chunks/...
            # Extract everything after the bucket name
            print(f"🎬 RENDER: Parsing HTTP URL: {request.sourceVideo}")
            logger.info("Parsing HTTP URL", url=request.sourceVideo)
            parts = request.sourceVideo.split(f"{S3_BUCKET_NAME}/")
            print(f"🎬 RENDER: Split result: {parts}")
            logger.info("Split by bucket name", parts=parts, bucket_name=S3_BUCKET_NAME)
            if len(parts) > 1:
                source_s3_key = parts[-1]
                print(f"🎬 RENDER: Extracted S3 key: {source_s3_key}")
                logger.info("Extracted S3 key from split", s3_key=source_s3_key)
            else:
                # Fallback: extract from URL path
                from urllib.parse import urlparse
                parsed_url = urlparse(request.sourceVideo)
                path = parsed_url.path.lstrip('/')
                logger.info("Fallback URL parsing", parsed_path=path)
                if path.startswith(f"{S3_BUCKET_NAME}/"):
                    source_s3_key = path[len(f"{S3_BUCKET_NAME}/"):]
                    logger.info("Extracted S3 key from path", s3_key=source_s3_key)
                else:
                    source_s3_key = path
                    logger.info("Using full path as S3 key", s3_key=source_s3_key)
        else:
            # Assume it's already a relative S3 key (e.g., "chunks/stream-id/chunk-id.mp4")
            source_s3_key = request.sourceVideo
            logger.info("Using direct S3 key", s3_key=source_s3_key)
            
        source_local_path = os.path.join(work_dir, "source.mp4")
        
        print(f"🎬 RENDER: About to download S3 file")
        print(f"🎬 RENDER: S3 Key: {source_s3_key}")
        print(f"🎬 RENDER: Local Path: {source_local_path}")
        logger.info("Final S3 download parameters", s3_key=source_s3_key, bucket=S3_BUCKET_NAME, local_path=source_local_path)
        
        if update_progress:
            update_progress(15, "Starting S3 download...")
            
        print(f"🎬 RENDER: Starting S3 download...")
        success = s3_client.download_file(source_s3_key, source_local_path)
        print(f"🎬 RENDER: S3 download result: {success}")
        
        if not success:
            print(f"🎬 RENDER: S3 download failed!")
            raise Exception(f"Failed to download source video: {source_s3_key}")
        
        if update_progress:
            update_progress(30, "S3 download completed")
            
        print(f"🎬 RENDER: S3 download successful, continuing with processing...")
        
        # Generate output paths
        output_filename = f"{clip_id}.mp4"
        thumbnail_filename = f"{clip_id}_thumbnail.jpg"
        output_local_path = os.path.join(work_dir, output_filename)
        thumbnail_local_path = os.path.join(work_dir, thumbnail_filename)
        
        # Extract and render video segment
        if update_progress:
            update_progress(40, "Starting video segment extraction")
            
        print(f"🎬 RENDER: Extracting segment - start: {request.startTime}s, duration: {request.duration}s")
        logger.info("Video segment extraction parameters", 
                   start_time=request.startTime, 
                   duration=request.duration,
                   source=source_local_path,
                   output=output_local_path)
            
        await extract_video_segment(
            source_local_path,
            output_local_path,
            request.startTime,
            request.duration,
            request.renderConfig
        )
        
        if update_progress:
            update_progress(60, "Video segment extraction completed")
        
        # Add captions if provided
        if request.captions.segments:
            if update_progress:
                update_progress(70, "Adding captions to video")
                
            captioned_path = os.path.join(work_dir, f"{clip_id}_captioned.mp4")
            await add_captions_to_video(
                output_local_path,
                captioned_path, 
                request.captions,
                request.startTime
            )
            output_local_path = captioned_path
            
            if update_progress:
                update_progress(80, "Caption overlay completed")
        
        # Generate thumbnail  
        if update_progress:
            progress_val = 82 if not request.captions.segments else 82
            update_progress(progress_val, "Generating thumbnail")
            
        print(f"🎬 RENDER: About to generate thumbnail...")
        print(f"🎬 RENDER: Video file: {output_local_path}")
        print(f"🎬 RENDER: Thumbnail target: {thumbnail_local_path}")
        await generate_thumbnail(output_local_path, thumbnail_local_path)
        print(f"🎬 RENDER: Thumbnail generation completed")
        
        if update_progress:
            update_progress(85, "Thumbnail generation completed")
        
        # Upload to S3
        if update_progress:
            update_progress(90, "Uploading to S3")
            
        output_s3_key = f"rendered/{output_filename}"
        thumbnail_s3_key = f"thumbnails/{thumbnail_filename}"
        
        output_upload_success = s3_client.upload_file(output_local_path, output_s3_key)
        thumbnail_upload_success = s3_client.upload_file(thumbnail_local_path, thumbnail_s3_key)
        
        if update_progress:
            update_progress(95, "S3 upload completed")
        
        if not output_upload_success:
            raise Exception("Failed to upload rendered video to S3")
        
        # Get file metadata
        file_size = os.path.getsize(output_local_path)
        
        if update_progress:
            update_progress(100, "Render job completed successfully")
        
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
    
    # Get target resolution, defaulting to 1080p if not found
    target_resolution = resolution_map.get(render_config.platform, "1920x1080")
    if 'x' not in target_resolution:
        target_resolution = "1920x1080"  # Fallback
    
    width, height = map(int, target_resolution.split('x'))
    
    print(f"🎬 EXTRACT: Render config platform: {render_config.platform}")
    print(f"🎬 EXTRACT: Target resolution: {target_resolution} ({width}x{height})")
    
    try:
        print(f"🎬 EXTRACT: Starting video segment extraction")
        print(f"🎬 EXTRACT: Source: {source_path}")
        print(f"🎬 EXTRACT: Output: {output_path}")
        print(f"🎬 EXTRACT: Start time: {start_time}s")
        print(f"🎬 EXTRACT: Duration: {duration}s")
        print(f"🎬 EXTRACT: Target resolution: {width}x{height}")
        
        # FFmpeg pipeline for video extraction and formatting
        # Use ss (seek start) and t (duration) for precise segment extraction
        print(f"🎬 EXTRACT: Creating input stream with ss={start_time}, t={duration}")
        
        # Simplified approach: extract segment first, then scale
        output_stream = ffmpeg.input(source_path, ss=start_time, t=duration).output(
            output_path,
            vf=f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black',
            vcodec='libx264',
            acodec='aac',
            crf=23,
            preset='medium',
            movflags='faststart',
            strict='-2',
            loglevel='info'  # Enable more logging
        )
        
        print(f"🎬 EXTRACT: Running FFmpeg command...")
        
        # Run with verbose output for debugging
        print(f"🎬 EXTRACT: About to run FFmpeg command")
        result = ffmpeg.run(output_stream, overwrite_output=True, capture_stdout=True, capture_stderr=True)
        print(f"🎬 EXTRACT: FFmpeg command completed")
        
        print(f"🎬 EXTRACT: ✅ Video segment extraction completed successfully!")
        
        # Check the output file properties
        if os.path.exists(output_path):
            file_size = os.path.getsize(output_path)
            print(f"🎬 EXTRACT: Output file size: {file_size} bytes ({file_size / 1024 / 1024:.2f} MB)")
            
            # Try to get video info
            try:
                probe = ffmpeg.probe(output_path)
                video_info = next(s for s in probe['streams'] if s['codec_type'] == 'video')
                audio_streams = [s for s in probe['streams'] if s['codec_type'] == 'audio']
                
                print(f"🎬 EXTRACT: Output resolution: {video_info.get('width', 'unknown')}x{video_info.get('height', 'unknown')}")
                print(f"🎬 EXTRACT: Output duration: {video_info.get('duration', 'unknown')}s")
                print(f"🎬 EXTRACT: Audio streams found: {len(audio_streams)}")
                
                if audio_streams:
                    audio_info = audio_streams[0]
                    print(f"🎬 EXTRACT: Audio codec: {audio_info.get('codec_name', 'unknown')}")
                    print(f"🎬 EXTRACT: Audio bitrate: {audio_info.get('bit_rate', 'unknown')}")
                else:
                    print(f"🎬 EXTRACT: ❌ WARNING: No audio streams found in output!")
                    
            except Exception as probe_error:
                print(f"🎬 EXTRACT: Could not probe output file: {probe_error}")
        else:
            print(f"🎬 EXTRACT: ❌ ERROR: Output file was not created!")
        
        logger.info("Video segment extracted successfully", 
                   source=source_path, 
                   output=output_path,
                   start_time=start_time,
                   duration=duration,
                   resolution=f"{width}x{height}")
        
    except ffmpeg.Error as e:
        print(f"🎬 EXTRACT: ❌ FFmpeg error: {e}")
        stderr_output = ""
        if hasattr(e, 'stderr') and e.stderr:
            stderr_output = e.stderr.decode() if isinstance(e.stderr, bytes) else str(e.stderr)
            print(f"🎬 EXTRACT: FFmpeg stderr: {stderr_output}")
            logger.error("FFmpeg stderr", stderr=stderr_output)
        
        # Also try to get stdout
        stdout_output = ""
        if hasattr(e, 'stdout') and e.stdout:
            stdout_output = e.stdout.decode() if isinstance(e.stdout, bytes) else str(e.stdout)
            print(f"🎬 EXTRACT: FFmpeg stdout: {stdout_output}")
        
        logger.error("FFmpeg error during extraction", error=str(e), stderr=stderr_output, stdout=stdout_output)
        raise Exception(f"Video extraction failed: {e} | stderr: {stderr_output}")
    except Exception as e:
        print(f"🎬 EXTRACT: ❌ Unexpected error: {e}")
        logger.error("Unexpected error during extraction", error=str(e))
        raise Exception(f"Video extraction failed: {e}")

async def add_captions_to_video(
    input_path: str,
    output_path: str,
    captions: CaptionConfig,
    video_start_time: float
):
    """Add captions overlay to video"""
    import ffmpeg
    
    # Skip captions if no segments provided
    if not captions.segments:
        logger.info("No caption segments provided, copying video without captions")
        # Just copy the file without captions
        import shutil
        shutil.copy2(input_path, output_path)
        return
    
    # Create subtitle file
    srt_path = input_path.replace('.mp4', '.srt')
    logger.info(f"Creating subtitle file: {srt_path}")
    
    subtitle_count = 0
    with open(srt_path, 'w', encoding='utf-8') as f:
        for i, segment in enumerate(captions.segments, 1):
            # Adjust timing relative to video start
            start_adjusted = max(0, segment.start - video_start_time)
            end_adjusted = max(0, segment.end - video_start_time)
            
            if start_adjusted >= 0 and end_adjusted > start_adjusted and segment.text.strip():
                f.write(f"{i}\n")
                f.write(f"{format_srt_time(start_adjusted)} --> {format_srt_time(end_adjusted)}\n")
                f.write(f"{segment.text.strip()}\n\n")
                subtitle_count += 1
    
    logger.info(f"Created {subtitle_count} subtitle entries")
    
    # If no valid subtitles, just copy the video
    if subtitle_count == 0:
        logger.info("No valid subtitles found, copying video without captions")
        import shutil
        shutil.copy2(input_path, output_path)
        if os.path.exists(srt_path):
            os.remove(srt_path)
        return
    
    try:
        # Apply captions with simpler, more reliable approach
        logger.info("Applying captions with FFmpeg")
        stream = ffmpeg.input(input_path)
        stream = ffmpeg.filter(stream, 'subtitles', srt_path,
                             force_style='FontName=Arial,FontSize=20,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=1')
        stream = ffmpeg.output(stream, output_path,
                             vcodec='libx264',
                             acodec='aac', 
                             crf=23,
                             preset='medium')
        ffmpeg.run(stream, overwrite_output=True, quiet=False, capture_stdout=True, capture_stderr=True)
        
        logger.info("Caption overlay completed successfully")
        
        # Cleanup subtitle file
        if os.path.exists(srt_path):
            os.remove(srt_path)
        
    except ffmpeg.Error as e:
        logger.error("FFmpeg error during caption overlay", error=str(e), stderr=e.stderr.decode() if e.stderr else "No stderr")
        
        # Fallback: copy video without captions
        logger.info("Falling back to video without captions")
        try:
            import shutil
            shutil.copy2(input_path, output_path)
            logger.info("Fallback copy completed")
        except Exception as copy_error:
            logger.error("Fallback copy failed", error=str(copy_error))
            raise Exception(f"Caption overlay failed and fallback copy failed: {copy_error}")
        
        # Cleanup subtitle file
        if os.path.exists(srt_path):
            os.remove(srt_path)

async def generate_thumbnail(video_path: str, thumbnail_path: str):
    """Generate video thumbnail"""
    import ffmpeg
    
    try:
        print(f"🎬 THUMBNAIL: Starting thumbnail generation")
        print(f"🎬 THUMBNAIL: Source video: {video_path}")
        print(f"🎬 THUMBNAIL: Target thumbnail: {thumbnail_path}")
        
        # Check if source video exists
        if not os.path.exists(video_path):
            print(f"🎬 THUMBNAIL: ERROR - Source video does not exist!")
            logger.error("Thumbnail generation failed", error=f"Source video not found: {video_path}")
            return
        
        print(f"🎬 THUMBNAIL: Source video exists, generating thumbnail...")
        stream = ffmpeg.input(video_path, ss=1)  # Take frame at 1 second
        stream = ffmpeg.filter(stream, 'scale', 480, 270)  # Thumbnail size
        stream = ffmpeg.output(stream, thumbnail_path, vframes=1)
        
        print(f"🎬 THUMBNAIL: Running FFmpeg command...")
        ffmpeg.run(stream, overwrite_output=True, quiet=False)  # Enable output for debugging
        
        # Check if thumbnail was created
        if os.path.exists(thumbnail_path):
            print(f"🎬 THUMBNAIL: ✅ Thumbnail generated successfully!")
            logger.info("Thumbnail generated successfully", thumbnail_path=thumbnail_path)
        else:
            print(f"🎬 THUMBNAIL: ❌ Thumbnail file not found after FFmpeg!")
            logger.error("Thumbnail file not created", thumbnail_path=thumbnail_path)
        
    except ffmpeg.Error as e:
        print(f"🎬 THUMBNAIL: FFmpeg error: {e}")
        print(f"🎬 THUMBNAIL: FFmpeg stderr: {e.stderr}")
        logger.error("Thumbnail generation failed", error=str(e), stderr=e.stderr.decode() if e.stderr else None)
        # Don't fail the job if thumbnail fails
        pass
    except Exception as e:
        print(f"🎬 THUMBNAIL: Unexpected error: {e}")
        logger.error("Thumbnail generation unexpected error", error=str(e))
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
        webhook_url = f"{ORCHESTRATOR_URL}/api/v1/processing/webhooks/rendering-complete"
        
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