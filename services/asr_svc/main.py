#!/usr/bin/env python3
"""
ASR Service - Automatic Speech Recognition using faster-whisper
Processes audio chunks and generates transcriptions with word-level timestamps
"""

import os
import json
import asyncio
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime

import structlog
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential

# Whisper and audio processing
from faster_whisper import WhisperModel
import torch
import torchaudio
import librosa
import soundfile as sf
import numpy as np
from pydub import AudioSegment

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
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
SERVICE_PORT = int(os.getenv("ASR_SERVICE_PORT", "8002"))
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "auto")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
CHUNK_STORAGE_PATH = os.getenv("CHUNK_STORAGE_PATH", "/data/chunks")
TRANSCRIPTION_STORAGE_PATH = os.getenv("TRANSCRIPTION_STORAGE_PATH", "/data/transcriptions")
MAX_CONCURRENT_JOBS = int(os.getenv("MAX_CONCURRENT_ASR_JOBS", "2"))

# Pydantic models
class ChunkTranscribeRequest(BaseModel):
    chunk_id: str = Field(..., description="Unique chunk identifier")
    chunk_path: str = Field(..., description="Path to audio/video chunk file")
    stream_id: str = Field(..., description="Parent stream identifier")
    job_id: Optional[str] = Field(None, description="Optional job correlation ID")
    language: Optional[str] = Field(None, description="Expected language code (e.g., 'en')")
    
class TranscriptionSegment(BaseModel):
    id: int
    seek: int
    start: float
    end: float
    text: str
    tokens: List[int]
    temperature: float
    avg_logprob: float
    compression_ratio: float
    no_speech_prob: float
    words: Optional[List[Dict[str, Any]]] = None

class TranscriptionResult(BaseModel):
    chunk_id: str
    stream_id: str
    language: str
    language_probability: float
    duration: float
    segments: List[TranscriptionSegment]
    processing_time: float
    model_info: Dict[str, str]

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    service: str = "asr_svc"
    whisper_model: str
    device: str
    redis_connected: bool

# Global variables
app = FastAPI(title="ASR Service", version="1.0.0")
redis_client: Optional[redis.Redis] = None
whisper_model: Optional[WhisperModel] = None
processing_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)

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

def init_whisper():
    """Initialize Whisper model"""
    global whisper_model
    try:
        # Determine device
        device = WHISPER_DEVICE
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        
        logger.info("Initializing Whisper model", 
                   model_size=WHISPER_MODEL_SIZE, 
                   device=device,
                   compute_type=WHISPER_COMPUTE_TYPE)
        
        whisper_model = WhisperModel(
            WHISPER_MODEL_SIZE, 
            device=device, 
            compute_type=WHISPER_COMPUTE_TYPE
        )
        
        logger.info("Whisper model loaded successfully")
    except Exception as e:
        logger.error("Failed to load Whisper model", error=str(e))
        raise

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
async def publish_event(event_type: str, data: Dict[str, Any], correlation_id: str):
    """Publish event to Redis with retry logic"""
    try:
        event = {
            "eventId": str(uuid.uuid4()),
            "eventType": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0",
            "source": "asr_svc",
            "correlationId": correlation_id,
            "data": data
        }
        
        await redis_client.publish("clipforge.events", json.dumps(event))
        logger.info("Event published", event_type=event_type, correlation_id=correlation_id)
    except Exception as e:
        logger.error("Failed to publish event", event_type=event_type, error=str(e))
        raise

def preprocess_audio(file_path: str) -> str:
    """Preprocess audio file for optimal Whisper performance"""
    try:
        # Create temp processed file path
        processed_path = f"{file_path}_processed.wav"
        
        # Load audio with librosa for preprocessing
        audio, sr = librosa.load(file_path, sr=16000, mono=True)
        
        # Apply noise reduction and normalization
        audio = librosa.util.normalize(audio)
        
        # Save processed audio
        sf.write(processed_path, audio, 16000)
        
        return processed_path
    except Exception as e:
        logger.warning("Audio preprocessing failed, using original", error=str(e))
        return file_path

def extract_audio_from_video(video_path: str) -> str:
    """Extract audio from video file"""
    try:
        audio_path = f"{video_path}_audio.wav"
        
        # Use pydub to extract audio
        video = AudioSegment.from_file(video_path)
        audio = video.set_channels(1).set_frame_rate(16000)
        audio.export(audio_path, format="wav")
        
        return audio_path
    except Exception as e:
        logger.error("Failed to extract audio from video", error=str(e))
        raise

async def transcribe_chunk(chunk_path: str, language: Optional[str] = None) -> Dict[str, Any]:
    """Transcribe audio chunk using Whisper"""
    start_time = datetime.utcnow()
    
    try:
        # Check if file exists
        if not os.path.exists(chunk_path):
            raise FileNotFoundError(f"Chunk file not found: {chunk_path}")
        
        # Determine if we need to extract audio from video
        file_ext = Path(chunk_path).suffix.lower()
        if file_ext in ['.mp4', '.mkv', '.avi', '.mov']:
            audio_path = extract_audio_from_video(chunk_path)
        else:
            audio_path = chunk_path
        
        # Preprocess audio
        processed_audio_path = preprocess_audio(audio_path)
        
        # Get audio duration
        audio_info = sf.info(processed_audio_path)
        duration = audio_info.duration
        
        # Transcribe with Whisper
        segments, info = whisper_model.transcribe(
            processed_audio_path,
            language=language,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        # Convert segments to list with word-level timestamps
        segment_list = []
        for segment in segments:
            segment_dict = {
                "id": segment.id,
                "seek": segment.seek,
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "tokens": segment.tokens,
                "temperature": segment.temperature,
                "avg_logprob": segment.avg_logprob,
                "compression_ratio": segment.compression_ratio,
                "no_speech_prob": segment.no_speech_prob,
                "words": []
            }
            
            # Add word-level timestamps if available
            if hasattr(segment, 'words') and segment.words:
                for word in segment.words:
                    segment_dict["words"].append({
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": word.probability
                    })
            
            segment_list.append(segment_dict)
        
        processing_time = (datetime.utcnow() - start_time).total_seconds()
        
        # Cleanup temporary files
        if audio_path != chunk_path:
            try:
                os.remove(audio_path)
            except:
                pass
        if processed_audio_path != audio_path:
            try:
                os.remove(processed_audio_path)
            except:
                pass
        
        return {
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": duration,
            "segments": segment_list,
            "processing_time": processing_time,
            "model_info": {
                "model_size": WHISPER_MODEL_SIZE,
                "device": WHISPER_DEVICE,
                "compute_type": WHISPER_COMPUTE_TYPE
            }
        }
        
    except Exception as e:
        logger.error("Transcription failed", chunk_path=chunk_path, error=str(e))
        raise

async def save_transcription(chunk_id: str, transcription_data: Dict[str, Any]):
    """Save transcription results to storage"""
    try:
        os.makedirs(TRANSCRIPTION_STORAGE_PATH, exist_ok=True)
        transcription_file = os.path.join(TRANSCRIPTION_STORAGE_PATH, f"{chunk_id}.json")
        
        with open(transcription_file, 'w', encoding='utf-8') as f:
            json.dump(transcription_data, f, indent=2, ensure_ascii=False)
        
        logger.info("Transcription saved", chunk_id=chunk_id, file_path=transcription_file)
    except Exception as e:
        logger.error("Failed to save transcription", chunk_id=chunk_id, error=str(e))
        raise

async def process_transcription_job(request: ChunkTranscribeRequest):
    """Background job to process chunk transcription"""
    correlation_id = request.job_id or str(uuid.uuid4())
    
    async with processing_semaphore:
        try:
            logger.info("Starting transcription job", 
                       chunk_id=request.chunk_id,
                       correlation_id=correlation_id)
            
            # Publish job started event
            await publish_event("job.status_changed", {
                "jobId": correlation_id,
                "status": "processing",
                "service": "asr_svc",
                "chunkId": request.chunk_id
            }, correlation_id)
            
            # Perform transcription
            transcription_result = await transcribe_chunk(
                request.chunk_path, 
                request.language
            )
            
            # Add metadata
            transcription_result.update({
                "chunk_id": request.chunk_id,
                "stream_id": request.stream_id
            })
            
            # Save transcription
            await save_transcription(request.chunk_id, transcription_result)
            
            # Publish transcription completed event
            await publish_event("chunk.transcribed", {
                "chunkId": request.chunk_id,
                "streamId": request.stream_id,
                "transcription": transcription_result
            }, correlation_id)
            
            # Publish job completed event
            await publish_event("job.status_changed", {
                "jobId": correlation_id,
                "status": "completed",
                "service": "asr_svc",
                "chunkId": request.chunk_id
            }, correlation_id)
            
            logger.info("Transcription job completed", 
                       chunk_id=request.chunk_id,
                       correlation_id=correlation_id,
                       processing_time=transcription_result["processing_time"])
            
        except Exception as e:
            logger.error("Transcription job failed", 
                        chunk_id=request.chunk_id,
                        correlation_id=correlation_id,
                        error=str(e))
            
            # Publish job failed event
            await publish_event("job.status_changed", {
                "jobId": correlation_id,
                "status": "failed",
                "service": "asr_svc",
                "chunkId": request.chunk_id,
                "error": str(e)
            }, correlation_id)

# API Endpoints
@app.post("/transcribe", response_model=Dict[str, str])
async def transcribe_chunk_endpoint(
    request: ChunkTranscribeRequest,
    background_tasks: BackgroundTasks
):
    """Start transcription job for a chunk"""
    try:
        correlation_id = request.job_id or str(uuid.uuid4())
        
        # Validate chunk file exists
        if not os.path.exists(request.chunk_path):
            raise HTTPException(status_code=404, detail=f"Chunk file not found: {request.chunk_path}")
        
        # Add background task
        background_tasks.add_task(process_transcription_job, request)
        
        logger.info("Transcription job queued", 
                   chunk_id=request.chunk_id,
                   correlation_id=correlation_id)
        
        return {
            "status": "accepted",
            "chunk_id": request.chunk_id,
            "correlation_id": correlation_id,
            "message": "Transcription job started"
        }
        
    except Exception as e:
        logger.error("Failed to start transcription job", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/transcription/{chunk_id}")
async def get_transcription(chunk_id: str):
    """Get transcription results for a chunk"""
    try:
        transcription_file = os.path.join(TRANSCRIPTION_STORAGE_PATH, f"{chunk_id}.json")
        
        if not os.path.exists(transcription_file):
            raise HTTPException(status_code=404, detail="Transcription not found")
        
        with open(transcription_file, 'r', encoding='utf-8') as f:
            transcription_data = json.load(f)
        
        return transcription_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to retrieve transcription", chunk_id=chunk_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/transcription/{chunk_id}")
async def delete_transcription(chunk_id: str):
    """Delete transcription results for a chunk"""
    try:
        transcription_file = os.path.join(TRANSCRIPTION_STORAGE_PATH, f"{chunk_id}.json")
        
        if os.path.exists(transcription_file):
            os.remove(transcription_file)
            logger.info("Transcription deleted", chunk_id=chunk_id)
            return {"status": "deleted", "chunk_id": chunk_id}
        else:
            raise HTTPException(status_code=404, detail="Transcription not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete transcription", chunk_id=chunk_id, error=str(e))
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
        
        # Check Whisper model
        model_loaded = whisper_model is not None
        
        status = "healthy" if redis_connected and model_loaded else "unhealthy"
        
        return HealthResponse(
            status=status,
            timestamp=datetime.utcnow().isoformat(),
            whisper_model=WHISPER_MODEL_SIZE,
            device=WHISPER_DEVICE,
            redis_connected=redis_connected
        )
        
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stats")
async def get_service_stats():
    """Get service statistics"""
    try:
        # Count transcription files
        transcription_count = 0
        if os.path.exists(TRANSCRIPTION_STORAGE_PATH):
            transcription_count = len([f for f in os.listdir(TRANSCRIPTION_STORAGE_PATH) if f.endswith('.json')])
        
        return {
            "service": "asr_svc",
            "whisper_model": WHISPER_MODEL_SIZE,
            "device": WHISPER_DEVICE,
            "compute_type": WHISPER_COMPUTE_TYPE,
            "max_concurrent_jobs": MAX_CONCURRENT_JOBS,
            "total_transcriptions": transcription_count,
            "storage_path": TRANSCRIPTION_STORAGE_PATH
        }
        
    except Exception as e:
        logger.error("Failed to get stats", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize service on startup"""
    logger.info("Starting ASR Service", port=SERVICE_PORT)
    
    # Create storage directories
    os.makedirs(TRANSCRIPTION_STORAGE_PATH, exist_ok=True)
    
    # Initialize connections and models
    await init_redis()
    init_whisper()
    
    logger.info("ASR Service started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down ASR Service")
    
    if redis_client:
        await redis_client.close()
    
    logger.info("ASR Service shutdown complete")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORT)