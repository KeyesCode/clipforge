#!/usr/bin/env python3
"""
ClipForge Ingest Service
Handles VOD ingestion, downloading, and chunking using yt-dlp and FFmpeg.
Integrates with Redis queue system for job orchestration.
"""

import asyncio
import json
import logging
import os
import shutil
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any
from urllib.parse import urlparse

import aiohttp
import ffmpeg
import redis.asyncio as redis
import structlog
import yt_dlp
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from pymediainfo import MediaInfo
from tenacity import retry, stop_after_attempt, wait_exponential

# Import S3 utilities from local directory  
from s3_utils import S3Client, get_s3_client

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
REDIS_URL = os.getenv("REDIS_URL", "redis://:redis_secure_password_2024@redis:6379")
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:3001")
STORAGE_PATH = Path(os.getenv("STORAGE_PATH", "./app/storage"))
CHUNK_DURATION = int(os.getenv("CHUNK_DURATION", "300"))  # 5 minutes
MAX_CONCURRENT_DOWNLOADS = int(os.getenv("MAX_CONCURRENT_DOWNLOADS", "3"))
SERVICE_NAME = "ingest_svc"

# Ensure storage directory exists
STORAGE_PATH.mkdir(parents=True, exist_ok=True)

# Pydantic models
class StreamIngestRequest(BaseModel):
    stream_url: str = Field(..., description="URL of the stream/VOD to ingest")
    stream_id: Optional[str] = Field(None, description="ID of the stream to update")
    streamer_id: str = Field(..., description="ID of the streamer")
    stream_title: Optional[str] = Field(None, description="Title of the stream")
    stream_date: Optional[datetime] = Field(None, description="Date of the stream")
    job_id: Optional[str] = Field(None, description="Associated job ID")
    
    @validator('stream_url')
    def validate_url(cls, v):
        parsed = urlparse(v)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError('Invalid URL format')
        return v

class ChunkMetadata(BaseModel):
    chunk_id: str
    stream_id: str
    start_time: float
    end_time: float
    duration: float
    file_path: str  # Local path for processing
    s3_url: Optional[str] = None  # S3 public URL
    s3_key: Optional[str] = None  # S3 object key
    file_size: int
    resolution: str
    fps: float
    bitrate: int

class StreamMetadata(BaseModel):
    stream_id: str
    original_url: str
    title: str
    duration: float
    resolution: str
    fps: float
    file_size: int
    download_path: str  # Local path for processing
    s3_url: Optional[str] = None  # S3 public URL
    s3_key: Optional[str] = None  # S3 object key
    thumbnail_path: Optional[str] = None  # Local thumbnail path
    thumbnail_s3_url: Optional[str] = None  # S3 thumbnail URL
    thumbnail_s3_key: Optional[str] = None  # S3 thumbnail key

# FastAPI app
app = FastAPI(
    title="ClipForge Ingest Service",
    description="VOD ingestion and chunking service",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Redis connection
redis_client: Optional[redis.Redis] = None

class IngestService:
    def __init__(self):
        self.download_semaphore = asyncio.Semaphore(MAX_CONCURRENT_DOWNLOADS)
        self.active_downloads: Dict[str, Dict] = {}
        self.s3_client = get_s3_client()

    async def initialize_redis(self):
        """Initialize Redis connection"""
        global redis_client
        try:
            redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
            logger.info("Redis connection established")
        except Exception as e:
            logger.error("Failed to connect to Redis", error=str(e))
            raise

    async def publish_event(self, event_type: str, data: Dict[str, Any], correlation_id: str = None):
        """Publish event to Redis for orchestrator"""
        if not redis_client:
            logger.error("Redis client not initialized")
            return

        event = {
            "eventId": str(uuid.uuid4()),
            "eventType": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": "1.0",
            "source": SERVICE_NAME,
            "correlationId": correlation_id or str(uuid.uuid4()),
            "data": data
        }

        try:
            await redis_client.publish("clipforge:events", json.dumps(event))
            logger.info("Event published", event_type=event_type, correlation_id=correlation_id)
        except Exception as e:
            logger.error("Failed to publish event", event_type=event_type, error=str(e))

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def download_stream(self, stream_url: str, stream_id: str) -> StreamMetadata:
        """Download stream using yt-dlp"""
        download_dir = STORAGE_PATH / "downloads" / stream_id
        download_dir.mkdir(parents=True, exist_ok=True)

        # Progress tracking
        self.active_downloads[stream_id] = {
            'downloaded_bytes': 0,
            'total_bytes': 0,
            'start_time': datetime.now(timezone.utc),
            'last_update': datetime.now(timezone.utc)
        }

        def progress_hook(d):
            if d['status'] == 'downloading':
                if 'total_bytes' in d and d['total_bytes']:
                    self.active_downloads[stream_id]['total_bytes'] = d['total_bytes']
                if 'downloaded_bytes' in d and d['downloaded_bytes']:
                    self.active_downloads[stream_id]['downloaded_bytes'] = d['downloaded_bytes']
                
                # Calculate progress
                total_bytes = self.active_downloads[stream_id]['total_bytes']
                downloaded_bytes = self.active_downloads[stream_id]['downloaded_bytes']
                
                if total_bytes > 0:
                    progress = int((downloaded_bytes / total_bytes) * 100)
                    
                    # Calculate ETA
                    now = datetime.now(timezone.utc)
                    elapsed = (now - self.active_downloads[stream_id]['start_time']).total_seconds()
                    
                    if elapsed > 0 and downloaded_bytes > 0:
                        rate = downloaded_bytes / elapsed
                        remaining_bytes = total_bytes - downloaded_bytes
                        eta_seconds = int(remaining_bytes / rate) if rate > 0 else 0
                    else:
                        eta_seconds = 0
                    
                    # Format progress message
                    total_gb = total_bytes / (1024**3)
                    downloaded_gb = downloaded_bytes / (1024**3)
                    progress_message = f"Downloading {total_gb:.1f}GB... {progress}% complete"
                    
                    # Update progress in database via orchestrator
                    asyncio.create_task(self.update_stream_progress(
                        stream_id, 
                        progress, 
                        'downloading', 
                        progress_message, 
                        eta_seconds,
                        downloaded_bytes,
                        total_bytes
                    ))

        # yt-dlp options
        ydl_opts = {
            'format': 'best[height<=1080]',
            'outtmpl': str(download_dir / '%(title)s.%(ext)s'),
            'writeinfojson': True,
            'writethumbnail': True,
            'writesubtitles': False,
            'writeautomaticsub': False,
            'ignoreerrors': False,
            'no_warnings': False,
            'extractflat': False,
            'progress_hooks': [progress_hook],
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Extract info first
                info = ydl.extract_info(stream_url, download=False)
                
                # Update download template with actual title
                safe_title = "".join(c for c in info.get('title', 'stream') if c.isalnum() or c in (' ', '-', '_')).rstrip()
                ydl_opts['outtmpl'] = str(download_dir / f'{safe_title}.%(ext)s')
                
                # Download
                with yt_dlp.YoutubeDL(ydl_opts) as ydl_download:
                    ydl_download.download([stream_url])

                # Find downloaded video file
                video_files = list(download_dir.glob('*.mp4')) + list(download_dir.glob('*.mkv')) + list(download_dir.glob('*.webm'))
                if not video_files:
                    raise Exception("No video file found after download")
                
                video_path = video_files[0]
                
                # Get media info
                media_info = MediaInfo.parse(str(video_path))
                video_track = next((track for track in media_info.tracks if track.track_type == 'Video'), None)
                
                if not video_track:
                    raise Exception("No video track found in downloaded file")

                # Find thumbnail
                thumbnail_files = list(download_dir.glob('*.jpg')) + list(download_dir.glob('*.png')) + list(download_dir.glob('*.webp'))
                thumbnail_path = str(thumbnail_files[0]) if thumbnail_files else None
                
                # Upload main video to S3
                video_s3_key = f"streams/{stream_id}/video{video_path.suffix}"
                logger.info("Uploading video to S3", stream_id=stream_id, s3_key=video_s3_key)
                video_s3_url = self.s3_client.upload_file(str(video_path), video_s3_key)
                
                if not video_s3_url:
                    logger.error("Failed to upload video to S3", stream_id=stream_id)
                    raise Exception("Failed to upload video to S3")
                
                # Upload thumbnail to S3 if exists
                thumbnail_s3_url = None
                thumbnail_s3_key = None
                if thumbnail_path:
                    thumbnail_ext = Path(thumbnail_path).suffix
                    thumbnail_s3_key = f"streams/{stream_id}/thumbnail{thumbnail_ext}"
                    logger.info("Uploading thumbnail to S3", stream_id=stream_id, s3_key=thumbnail_s3_key)
                    thumbnail_s3_url = self.s3_client.upload_file(thumbnail_path, thumbnail_s3_key)
                    
                    if not thumbnail_s3_url:
                        logger.warning("Failed to upload thumbnail to S3", stream_id=stream_id)

                metadata = StreamMetadata(
                    stream_id=stream_id,
                    original_url=stream_url,
                    title=info.get('title', 'Unknown'),
                    duration=float(info.get('duration', 0)),
                    resolution=f"{video_track.width}x{video_track.height}",
                    fps=float(video_track.frame_rate or 30),
                    file_size=video_path.stat().st_size,
                    download_path=str(video_path),
                    s3_url=video_s3_url,
                    s3_key=video_s3_key,
                    thumbnail_path=thumbnail_path,
                    thumbnail_s3_url=thumbnail_s3_url,
                    thumbnail_s3_key=thumbnail_s3_key
                )

                logger.info("Stream downloaded successfully", 
                           stream_id=stream_id, 
                           title=metadata.title,
                           duration=metadata.duration,
                           file_size=metadata.file_size)

                return metadata

        except Exception as e:
            logger.error("Failed to download stream", stream_id=stream_id, error=str(e))
            raise

    async def chunk_video(self, stream_metadata: StreamMetadata) -> List[ChunkMetadata]:
        """Chunk video into segments using FFmpeg"""
        chunks = []
        input_path = Path(stream_metadata.download_path)
        chunks_dir = STORAGE_PATH / "chunks" / stream_metadata.stream_id
        chunks_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Calculate number of chunks
            total_duration = stream_metadata.duration
            num_chunks = max(1, int(total_duration / CHUNK_DURATION))
            actual_chunk_duration = total_duration / num_chunks

            logger.info("Starting video chunking", 
                       stream_id=stream_metadata.stream_id,
                       total_duration=total_duration,
                       num_chunks=num_chunks,
                       chunk_duration=actual_chunk_duration)

            for i in range(num_chunks):
                chunk_id = f"{stream_metadata.stream_id}_chunk_{i:04d}"
                start_time = i * actual_chunk_duration
                end_time = min((i + 1) * actual_chunk_duration, total_duration)
                duration = end_time - start_time

                chunk_path = chunks_dir / f"{chunk_id}.mp4"

                # Use FFmpeg to extract chunk
                try:
                    (
                        ffmpeg
                        .input(str(input_path), ss=start_time, t=duration)
                        .output(
                            str(chunk_path),
                            vcodec='libx264',
                            acodec='aac',
                            preset='medium',
                            crf=23,
                            movflags='faststart'
                        )
                        .overwrite_output()
                        .run(quiet=True, capture_stdout=True)
                    )

                    # Get chunk file info
                    chunk_size = chunk_path.stat().st_size
                    
                    # Upload chunk to S3
                    chunk_s3_key = f"chunks/{stream_metadata.stream_id}/{chunk_id}.mp4"
                    logger.info("Uploading chunk to S3", chunk_id=chunk_id, s3_key=chunk_s3_key)
                    chunk_s3_url = self.s3_client.upload_file(str(chunk_path), chunk_s3_key)
                    
                    if not chunk_s3_url:
                        logger.error("Failed to upload chunk to S3", chunk_id=chunk_id)
                        continue  # Skip this chunk if upload fails
                    
                    # Get media info for chunk
                    media_info = MediaInfo.parse(str(chunk_path))
                    video_track = next((track for track in media_info.tracks if track.track_type == 'Video'), None)
                    
                    chunk_metadata = ChunkMetadata(
                        chunk_id=chunk_id,
                        stream_id=stream_metadata.stream_id,
                        start_time=start_time,
                        end_time=end_time,
                        duration=duration,
                        file_path=str(chunk_path),
                        s3_url=chunk_s3_url,
                        s3_key=chunk_s3_key,
                        file_size=chunk_size,
                        resolution=f"{video_track.width}x{video_track.height}" if video_track else stream_metadata.resolution,
                        fps=float(video_track.frame_rate or stream_metadata.fps),
                        bitrate=int(video_track.bit_rate or 0)
                    )

                    chunks.append(chunk_metadata)
                    
                    logger.info("Chunk created", 
                               chunk_id=chunk_id,
                               start_time=start_time,
                               duration=duration,
                               file_size=chunk_size)

                except ffmpeg.Error as e:
                    logger.error("FFmpeg error creating chunk", 
                                chunk_id=chunk_id, 
                                error=e.stderr.decode() if e.stderr else str(e))
                    continue

            logger.info("Video chunking completed", 
                       stream_id=stream_metadata.stream_id,
                       chunks_created=len(chunks))

            return chunks

        except Exception as e:
            logger.error("Failed to chunk video", 
                        stream_id=stream_metadata.stream_id, 
                        error=str(e))
            raise

    async def notify_orchestrator(self, endpoint: str, data: Dict[str, Any]):
        """Send notification to orchestrator"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{ORCHESTRATOR_URL}/api/{endpoint}", json=data) as response:
                    if response.status in [200, 201]:
                        logger.info("Orchestrator notified", endpoint=endpoint, status=response.status)
                    else:
                        error_text = await response.text()
                        logger.error("Failed to notify orchestrator", 
                                   endpoint=endpoint, 
                                   status=response.status,
                                   error=error_text)
        except Exception as e:
            logger.error("Error notifying orchestrator", endpoint=endpoint, error=str(e))

    async def update_stream_progress(self, stream_id: str, progress: int, stage: str, 
                                   message: str, eta_seconds: int, 
                                   downloaded_bytes: int, total_bytes: int):
        """Update stream progress in orchestrator"""
        try:
            await self.notify_orchestrator(f"streams/{stream_id}/progress", {
                "processingProgress": progress,
                "currentStage": stage,
                "progressMessage": message,
                "estimatedTimeRemaining": eta_seconds,
                "downloadedBytes": downloaded_bytes,
                "totalBytes": total_bytes
            })
        except Exception as e:
            logger.error("Failed to update stream progress", stream_id=stream_id, error=str(e))

    async def process_ingest_job(self, request: StreamIngestRequest, correlation_id: str):
        """Process complete ingestion job"""
        # Use the provided stream_id if available, otherwise generate a new one
        stream_id = getattr(request, 'stream_id', None) or str(uuid.uuid4())
        
        try:
            # Update job status
            await self.publish_event("job.status_changed", {
                "jobId": request.job_id,
                "status": "processing",
                "stage": "downloading",
                "progress": 0
            }, correlation_id)

            # Download stream
            logger.info("Starting stream ingestion", 
                       stream_id=stream_id, 
                       url=request.stream_url)
            
            stream_metadata = await self.download_stream(request.stream_url, stream_id)
            
            # Publish stream ingested event
            await self.publish_event("stream.ingested", {
                "streamId": stream_id,
                "streamerId": request.streamer_id,
                "metadata": {
                    "originalUrl": stream_metadata.original_url,
                    "title": stream_metadata.title,
                    "duration": stream_metadata.duration,
                    "resolution": stream_metadata.resolution,
                    "fps": stream_metadata.fps,
                    "fileSize": stream_metadata.file_size,
                    "downloadPath": stream_metadata.download_path,
                    "thumbnailPath": stream_metadata.thumbnail_path
                }
            }, correlation_id)

            # Update progress for fixing stage
            await self.update_stream_progress(
                stream_id, 
                50, 
                'fixing', 
                'Fixing video format...', 
                0,
                stream_metadata.file_size,
                stream_metadata.file_size
            )

            # Update progress for chunking stage
            await self.update_stream_progress(
                stream_id, 
                75, 
                'chunking', 
                'Creating video chunks...', 
                0,
                stream_metadata.file_size,
                stream_metadata.file_size
            )

            # Chunk video
            chunks = await self.chunk_video(stream_metadata)
            
            # Publish chunked event
            chunks_data = []
            for chunk in chunks:
                chunks_data.append({
                    "chunkId": chunk.chunk_id,
                    "streamId": chunk.stream_id,
                    "startTime": chunk.start_time,
                    "endTime": chunk.end_time,
                    "duration": chunk.duration,
                    "filePath": chunk.file_path,
                    "fileSize": chunk.file_size,
                    "resolution": chunk.resolution,
                    "fps": chunk.fps,
                    "bitrate": chunk.bitrate
                })

            await self.publish_event("stream.chunked", {
                "streamId": stream_id,
                "chunks": chunks_data
            }, correlation_id)

            # Update progress for completion
            await self.update_stream_progress(
                stream_id, 
                100, 
                'completed', 
                f'Completed! Created {len(chunks)} chunks', 
                0,
                stream_metadata.file_size,
                stream_metadata.file_size
            )

            # Notify orchestrator to complete ingestion
            await self.notify_orchestrator(f"streams/{stream_id}/complete-ingestion", {
                "title": stream_metadata.title,
                "originalUrl": stream_metadata.original_url,
                "platform": "youtube",  # TODO: Extract from URL or make configurable
                "status": "downloaded",
                "duration": int(stream_metadata.duration),
                "thumbnailUrl": stream_metadata.thumbnail_s3_url,
                "videoS3Url": stream_metadata.s3_url,
                "videoS3Key": stream_metadata.s3_key,
                "thumbnailS3Key": stream_metadata.thumbnail_s3_key,
                "localVideoPath": stream_metadata.download_path,
                "localThumbnailPath": stream_metadata.thumbnail_path,
                "fileSize": stream_metadata.file_size,
                "width": int(stream_metadata.resolution.split('x')[0]) if 'x' in stream_metadata.resolution else None,
                "height": int(stream_metadata.resolution.split('x')[1]) if 'x' in stream_metadata.resolution else None,
                "fps": stream_metadata.fps,
                "streamDate": datetime.now(timezone.utc).isoformat(),
                "metadata": {
                    "chunks": [chunk.dict() for chunk in chunks],
                    "chunkCount": len(chunks)
                }
            })

            # Complete job
            await self.publish_event("job.status_changed", {
                "jobId": request.job_id,
                "status": "completed",
                "stage": "completed",
                "progress": 100,
                "result": {
                    "streamId": stream_id,
                    "chunksCreated": len(chunks)
                }
            }, correlation_id)

            logger.info("Ingestion job completed successfully", 
                       stream_id=stream_id,
                       chunks_created=len(chunks))

        except Exception as e:
            logger.error("Ingestion job failed", 
                        stream_id=stream_id, 
                        error=str(e))
            
            # Publish failure event
            await self.publish_event("job.status_changed", {
                "jobId": request.job_id,
                "status": "failed",
                "error": str(e)
            }, correlation_id)
            
            raise

# Global service instance
ingest_service = IngestService()

@app.on_event("startup")
async def startup_event():
    """Initialize service on startup"""
    logger.info("Starting Ingest Service")
    await ingest_service.initialize_redis()

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Ingest Service")
    if redis_client:
        await redis_client.close()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        if redis_client:
            await redis_client.ping()
        return {
            "status": "healthy",
            "service": SERVICE_NAME,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "redis_connected": redis_client is not None
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")

@app.post("/ingest")
async def ingest_stream(request: StreamIngestRequest):
    """Ingest a stream/VOD"""
    correlation_id = str(uuid.uuid4())
    
    logger.info("Received ingest request", 
               url=request.stream_url,
               streamer_id=request.streamer_id,
               correlation_id=correlation_id)
    
    # Process job synchronously for debugging
    try:
        await ingest_service.process_ingest_job(request, correlation_id)
        return {
            "message": "Ingestion completed",
            "correlationId": correlation_id,
            "jobId": request.job_id
        }
    except Exception as e:
        logger.error("Ingestion failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

@app.get("/status/{stream_id}")
async def get_stream_status(stream_id: str):
    """Get status of a stream ingestion"""
    # Check if files exist
    download_path = STORAGE_PATH / "downloads" / stream_id
    chunks_path = STORAGE_PATH / "chunks" / stream_id
    
    return {
        "streamId": stream_id,
        "downloadExists": download_path.exists(),
        "chunksExist": chunks_path.exists(),
        "chunkCount": len(list(chunks_path.glob("*.mp4"))) if chunks_path.exists() else 0
    }

@app.delete("/cleanup/{stream_id}")
async def cleanup_stream(stream_id: str):
    """Clean up stream files"""
    try:
        download_path = STORAGE_PATH / "downloads" / stream_id
        chunks_path = STORAGE_PATH / "chunks" / stream_id
        
        if download_path.exists():
            shutil.rmtree(download_path)
        
        if chunks_path.exists():
            shutil.rmtree(chunks_path)
        
        logger.info("Stream files cleaned up", stream_id=stream_id)
        
        return {"message": "Cleanup completed", "streamId": stream_id}
    
    except Exception as e:
        logger.error("Cleanup failed", stream_id=stream_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_config=None  # Use structlog instead
    )