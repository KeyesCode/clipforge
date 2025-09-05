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
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:3000")
STORAGE_PATH = Path(os.getenv("STORAGE_PATH", "./app/storage"))
CHUNK_DURATION = int(os.getenv("CHUNK_DURATION", "300"))  # 5 minutes
MAX_CONCURRENT_DOWNLOADS = int(os.getenv("MAX_CONCURRENT_DOWNLOADS", "3"))
SERVICE_NAME = "ingest_svc"

# Ensure storage directory exists
STORAGE_PATH.mkdir(parents=True, exist_ok=True)

# Pydantic models
class StreamIngestRequest(BaseModel):
    stream_url: str = Field(..., description="URL of the stream/VOD to ingest")
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
    file_path: str
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
    download_path: str
    thumbnail_path: Optional[str] = None

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

                metadata = StreamMetadata(
                    stream_id=stream_id,
                    original_url=stream_url,
                    title=info.get('title', 'Unknown'),
                    duration=float(info.get('duration', 0)),
                    resolution=f"{video_track.width}x{video_track.height}",
                    fps=float(video_track.frame_rate or 30),
                    file_size=video_path.stat().st_size,
                    download_path=str(video_path),
                    thumbnail_path=thumbnail_path
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
                    if response.status == 200:
                        logger.info("Orchestrator notified", endpoint=endpoint)
                    else:
                        logger.error("Failed to notify orchestrator", 
                                   endpoint=endpoint, 
                                   status=response.status)
        except Exception as e:
            logger.error("Error notifying orchestrator", endpoint=endpoint, error=str(e))

    async def process_ingest_job(self, request: StreamIngestRequest, correlation_id: str):
        """Process complete ingestion job"""
        stream_id = str(uuid.uuid4())
        
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

            # Update progress
            await self.publish_event("job.status_changed", {
                "jobId": request.job_id,
                "status": "processing",
                "stage": "chunking",
                "progress": 50
            }, correlation_id)

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

            # Notify orchestrator
            await self.notify_orchestrator("streams", {
                "streamId": stream_id,
                "streamerId": request.streamer_id,
                "metadata": stream_metadata.dict(),
                "chunks": [chunk.dict() for chunk in chunks]
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
async def ingest_stream(request: StreamIngestRequest, background_tasks: BackgroundTasks):
    """Ingest a stream/VOD"""
    correlation_id = str(uuid.uuid4())
    
    logger.info("Received ingest request", 
               url=request.stream_url,
               streamer_id=request.streamer_id,
               correlation_id=correlation_id)
    
    # Add background task
    background_tasks.add_task(
        ingest_service.process_ingest_job, 
        request, 
        correlation_id
    )
    
    return {
        "message": "Ingestion started",
        "correlationId": correlation_id,
        "jobId": request.job_id
    }

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