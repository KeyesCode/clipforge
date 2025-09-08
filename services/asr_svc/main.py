#!/usr/bin/env python3
"""
ASR Service - Automatic Speech Recognition using faster-whisper
Processes audio chunks and generates transcriptions with word-level timestamps
Integrated with ClipForge orchestrator webhook system
"""

import os
import json
import asyncio
import uuid
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime

import structlog
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential

# S3 integration
from s3_utils.s3_client import S3Client

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
SERVICE_PORT = int(os.getenv("ASR_SERVICE_PORT", "8002"))
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "auto")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
TRANSCRIPTION_STORAGE_PATH = os.getenv("TRANSCRIPTION_STORAGE_PATH", "./data/transcriptions")
MAX_CONCURRENT_JOBS = int(os.getenv("MAX_CONCURRENT_ASR_JOBS", "2"))

# Orchestrator webhook configuration
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:3001")
ASR_WEBHOOK_ENDPOINT = "/api/v1/processing/webhooks/asr-complete"

# S3 configuration
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "clipforge-storage")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "http://localhost:4566")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "test")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "test")
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")

# Pydantic models
class ChunkTranscribeRequest(BaseModel):
    chunkId: str = Field(..., description="Unique chunk identifier")
    audioPath: str = Field(..., description="S3 URL to audio/video chunk file")
    streamId: str = Field(..., description="Parent stream identifier")
    language: Optional[str] = Field("en", description="Expected language code (e.g., 'en')")
    options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Transcription options")
    
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
    status: str = "completed"
    transcription: Dict[str, Any]
    error: Optional[str] = None

class TranscriptionStatus(BaseModel):
    status: str  # "processing", "completed", "failed"
    transcription: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    service: str = "asr_svc"
    whisper_model: str
    device: str

# Global variables
app = FastAPI(title="ASR Service", version="1.0.0")
whisper_model: Optional[WhisperModel] = None
s3_client: Optional[S3Client] = None
processing_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)
processing_jobs: Dict[str, Dict[str, Any]] = {}  # Store job status

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def init_s3():
    """Initialize S3 client"""
    global s3_client
    try:
        s3_client = S3Client()
        logger.info("S3 client initialized", 
                   bucket=S3_BUCKET_NAME, 
                   endpoint=S3_ENDPOINT_URL)
    except Exception as e:
        logger.error("Failed to initialize S3 client", error=str(e))
        raise

def init_whisper():
    """Initialize Whisper model"""
    global whisper_model
    try:
        # Determine device and compute type
        device = WHISPER_DEVICE
        compute_type = WHISPER_COMPUTE_TYPE
        
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Adjust compute type for CPU if necessary
        if device == "cpu" and compute_type == "float16":
            compute_type = "int8"
            logger.info("Adjusted compute type to int8 for CPU device")
        
        logger.info("Initializing Whisper model", 
                   model_size=WHISPER_MODEL_SIZE, 
                   device=device,
                   compute_type=compute_type)
        
        # Try with the determined settings first
        try:
            whisper_model = WhisperModel(
                WHISPER_MODEL_SIZE, 
                device=device, 
                compute_type=compute_type
            )
            logger.info("Whisper model loaded successfully", device=device, compute_type=compute_type)
        except RuntimeError as cuda_error:
            if "CUDA" in str(cuda_error) and device != "cpu":
                logger.warning(f"CUDA error encountered, falling back to CPU: {cuda_error}")
                # Force CPU with appropriate compute type
                device = "cpu"
                compute_type = "int8"
                whisper_model = WhisperModel(
                    WHISPER_MODEL_SIZE, 
                    device=device, 
                    compute_type=compute_type
                )
                logger.info("Whisper model loaded successfully on CPU fallback", device=device, compute_type=compute_type)
            else:
                raise
        
    except Exception as e:
        logger.error("Failed to load Whisper model", error=str(e))
        raise

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
async def notify_orchestrator(stream_id: str, chunk_id: str, transcription_result: Dict[str, Any]):
    """Notify orchestrator about transcription completion via webhook"""
    try:
        webhook_url = f"{ORCHESTRATOR_URL}{ASR_WEBHOOK_ENDPOINT}"
        payload = {
            "streamId": stream_id,
            "chunkId": chunk_id,
            "result": transcription_result
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(webhook_url, json=payload) as response:
                if response.status == 200:
                    logger.info("Orchestrator webhook called successfully", 
                               chunk_id=chunk_id, webhook_url=webhook_url)
                else:
                    error_text = await response.text()
                    logger.error("Orchestrator webhook failed", 
                                chunk_id=chunk_id, 
                                status=response.status,
                                error=error_text)
                    
    except Exception as e:
        logger.error("Failed to notify orchestrator", chunk_id=chunk_id, error=str(e))
        # Don't re-raise - webhook failures shouldn't fail the job

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

async def transcribe_chunk_from_s3(s3_url: str, chunk_id: str, language: Optional[str] = None) -> Dict[str, Any]:
    """Transcribe audio chunk from S3 URL using Whisper"""
    start_time = datetime.utcnow()
    local_file_path = None
    audio_path = None
    processed_audio_path = None
    
    try:
        # Download file from S3 to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
            local_file_path = temp_file.name
        
        # Extract S3 key from URL
        s3_key = s3_url.split(f"{S3_BUCKET_NAME}/")[-1]
        
        # Download file from S3
        success = s3_client.download_file(s3_key, local_file_path)
        if not success:
            raise Exception(f"Failed to download file from S3: {s3_url}")
        
        logger.info("Downloaded chunk from S3", chunk_id=chunk_id, s3_key=s3_key)
        
        # Determine if we need to extract audio from video
        file_ext = Path(local_file_path).suffix.lower()
        if file_ext in ['.mp4', '.mkv', '.avi', '.mov']:
            audio_path = extract_audio_from_video(local_file_path)
        else:
            audio_path = local_file_path
        
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
        cleanup_files = [local_file_path, audio_path, processed_audio_path]
        for file_path in cleanup_files:
            if file_path and file_path != local_file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except:
                    pass
        
        # Clean up main temp file last
        if local_file_path and os.path.exists(local_file_path):
            try:
                os.remove(local_file_path)
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
        logger.error("Transcription failed", chunk_id=chunk_id, s3_url=s3_url, error=str(e))
        
        # Cleanup on error
        cleanup_files = [local_file_path, audio_path, processed_audio_path]
        for file_path in cleanup_files:
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except:
                    pass
        
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

async def process_transcription_job(request: ChunkTranscribeRequest, stream_id: str):
    """Background job to process chunk transcription"""
    chunk_id = request.chunkId
    
    # Update job status
    processing_jobs[chunk_id] = {
        "status": "processing",
        "started_at": datetime.utcnow().isoformat()
    }
    
    async with processing_semaphore:
        try:
            logger.info("Starting transcription job", 
                       chunk_id=chunk_id,
                       s3_url=request.audioPath)
            
            # Perform transcription
            transcription_result = await transcribe_chunk_from_s3(
                request.audioPath, 
                chunk_id,
                request.language
            )
            
            # Save transcription locally
            await save_transcription(chunk_id, transcription_result)
            
            # Update job status
            processing_jobs[chunk_id] = {
                "status": "completed",
                "transcription": transcription_result,
                "completed_at": datetime.utcnow().isoformat()
            }
            
            # Notify orchestrator via webhook
            await notify_orchestrator(stream_id, chunk_id, transcription_result)
            
            logger.info("Transcription job completed", 
                       chunk_id=chunk_id,
                       processing_time=transcription_result["processing_time"])
            
        except Exception as e:
            error_msg = str(e)
            logger.error("Transcription job failed", 
                        chunk_id=chunk_id,
                        error=error_msg)
            
            # Update job status with error
            processing_jobs[chunk_id] = {
                "status": "failed",
                "error": error_msg,
                "failed_at": datetime.utcnow().isoformat()
            }

# API Endpoints
@app.post("/transcribe")
async def transcribe_chunk_endpoint(
    request: ChunkTranscribeRequest,
    background_tasks: BackgroundTasks
):
    """Start transcription job for a chunk (matches orchestrator call format)"""
    try:
        chunk_id = request.chunkId
        stream_id = request.streamId
        
        # Add background task
        background_tasks.add_task(process_transcription_job, request, stream_id)
        
        # Initialize job tracking
        processing_jobs[chunk_id] = {
            "status": "accepted",
            "accepted_at": datetime.utcnow().isoformat()
        }
        
        logger.info("Transcription job queued", 
                   chunk_id=chunk_id,
                   audio_path=request.audioPath)
        
        return {
            "status": "accepted",
            "chunkId": chunk_id,
            "message": "Transcription job started"
        }
        
    except Exception as e:
        logger.error("Failed to start transcription job", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/transcription/{chunk_id}", response_model=TranscriptionStatus)
async def get_transcription_status(chunk_id: str):
    """Get transcription status for a chunk (matches orchestrator polling)"""
    try:
        # Check in-memory job status first
        if chunk_id in processing_jobs:
            job_status = processing_jobs[chunk_id]
            
            if job_status["status"] == "completed":
                return TranscriptionStatus(
                    status="completed",
                    transcription=job_status["transcription"]
                )
            elif job_status["status"] == "failed":
                return TranscriptionStatus(
                    status="failed",
                    error=job_status.get("error", "Unknown error")
                )
            else:
                return TranscriptionStatus(
                    status="processing"
                )
        
        # Check saved transcription file as fallback
        transcription_file = os.path.join(TRANSCRIPTION_STORAGE_PATH, f"{chunk_id}.json")
        
        if os.path.exists(transcription_file):
            with open(transcription_file, 'r', encoding='utf-8') as f:
                transcription_data = json.load(f)
            
            return TranscriptionStatus(
                status="completed",
                transcription=transcription_data
            )
        
        # Job not found
        raise HTTPException(status_code=404, detail="Transcription job not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to retrieve transcription status", chunk_id=chunk_id, error=str(e))
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
        # Check Whisper model
        model_loaded = whisper_model is not None
        
        # Check S3 connectivity
        s3_connected = s3_client is not None
        
        status = "healthy" if model_loaded and s3_connected else "unhealthy"
        
        return HealthResponse(
            status=status,
            timestamp=datetime.utcnow().isoformat(),
            whisper_model=WHISPER_MODEL_SIZE,
            device=WHISPER_DEVICE
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
    
    # Initialize S3 client and Whisper model
    init_s3()
    init_whisper()
    
    logger.info("ASR Service started successfully", 
               whisper_model=WHISPER_MODEL_SIZE,
               s3_bucket=S3_BUCKET_NAME)

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down ASR Service")
    
    # Clean up any processing jobs
    processing_jobs.clear()
    
    logger.info("ASR Service shutdown complete")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORT)