#!/usr/bin/env python3
"""
ClipForge Vision Service
Handles scene detection, face recognition, and visual analysis using PySceneDetect and InsightFace
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

# Computer vision imports
import cv2
import numpy as np
import torch
import torchvision.transforms as transforms
from PIL import Image
import scenedetect
from scenedetect import detect, ContentDetector, ThresholdDetector
from scenedetect.stats_manager import StatsManager
from scenedetect.video_manager import VideoManager
import insightface
from insightface.app import FaceAnalysis
from insightface.data import get_image as ins_get_image

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
SERVICE_PORT = int(os.getenv("VISION_SERVICE_PORT", "8003"))
CHUNK_STORAGE_PATH = os.getenv("CHUNK_STORAGE_PATH", "/data/chunks")
ANALYSIS_STORAGE_PATH = os.getenv("ANALYSIS_STORAGE_PATH", "/data/analysis")
FACE_MODEL_NAME = os.getenv("FACE_MODEL_NAME", "buffalo_l")
MAX_CONCURRENT_JOBS = int(os.getenv("MAX_CONCURRENT_VISION_JOBS", "2"))
SCENE_THRESHOLD = float(os.getenv("SCENE_THRESHOLD", "30.0"))
MIN_SCENE_LENGTH = float(os.getenv("MIN_SCENE_LENGTH", "3.0"))

# Pydantic models
class ChunkAnalysisRequest(BaseModel):
    chunk_id: str = Field(..., description="Unique chunk identifier")
    chunk_path: str = Field(..., description="Path to video chunk file")
    stream_id: str = Field(..., description="Parent stream identifier")
    job_id: Optional[str] = Field(None, description="Optional job correlation ID")
    analysis_types: List[str] = Field(default=["scenes", "faces"], description="Types of analysis to perform")

class SceneInfo(BaseModel):
    scene_id: int
    start_time: float
    end_time: float
    duration: float
    shot_changes: int
    avg_brightness: float
    motion_intensity: float
    color_variance: float

class FaceInfo(BaseModel):
    face_id: str
    confidence: float
    bbox: List[float]  # [x, y, width, height]
    landmarks: List[List[float]]  # 5 key points
    age: Optional[float] = None
    gender: Optional[str] = None
    emotion: Optional[str] = None
    embedding: Optional[List[float]] = None

class FrameAnalysis(BaseModel):
    timestamp: float
    brightness: float
    motion_score: float
    faces: List[FaceInfo]
    dominant_colors: List[List[int]]  # RGB values
    sharpness_score: float

class VisionAnalysisResult(BaseModel):
    chunk_id: str
    stream_id: str
    analysis_types: List[str]
    scenes: List[SceneInfo]
    key_frames: List[FrameAnalysis]
    face_summary: Dict[str, int]  # face counts, unique faces, etc.
    processing_time: float
    video_metadata: Dict[str, Any]

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    service: str = "vision_svc"
    face_model: str
    redis_connected: bool
    gpu_available: bool

# Global variables
app = FastAPI(title="Vision Service", version="1.0.0")
redis_client: Optional[redis.Redis] = None
face_analyzer: Optional[FaceAnalysis] = None
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

def init_face_analyzer():
    """Initialize InsightFace analyzer"""
    global face_analyzer
    try:
        logger.info("Initializing Face Analysis model", model=FACE_MODEL_NAME)
        
        face_analyzer = FaceAnalysis(name=FACE_MODEL_NAME)
        face_analyzer.prepare(ctx_id=0 if torch.cuda.is_available() else -1, det_size=(640, 640))
        
        logger.info("Face Analysis model loaded successfully")
    except Exception as e:
        logger.error("Failed to load Face Analysis model", error=str(e))
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
            "source": "vision_svc",
            "correlationId": correlation_id,
            "data": data
        }
        
        await redis_client.publish("clipforge.events", json.dumps(event))
        logger.info("Event published", event_type=event_type, correlation_id=correlation_id)
    except Exception as e:
        logger.error("Failed to publish event", event_type=event_type, error=str(e))
        raise

def detect_scenes(video_path: str) -> List[SceneInfo]:
    """Detect scenes in video using PySceneDetect"""
    try:
        # Create video manager
        video_manager = VideoManager([video_path])
        stats_manager = StatsManager()
        
        # Detect scenes using content detector
        scene_list = detect(video_path, ContentDetector(threshold=SCENE_THRESHOLD))
        
        scenes = []
        for i, (start_time, end_time) in enumerate(scene_list):
            duration = (end_time - start_time).get_seconds()
            
            # Skip scenes shorter than minimum length
            if duration < MIN_SCENE_LENGTH:
                continue
                
            # Analyze scene properties
            scene_info = analyze_scene_properties(video_path, start_time.get_seconds(), end_time.get_seconds())
            
            scenes.append(SceneInfo(
                scene_id=i,
                start_time=start_time.get_seconds(),
                end_time=end_time.get_seconds(),
                duration=duration,
                shot_changes=scene_info.get("shot_changes", 0),
                avg_brightness=scene_info.get("avg_brightness", 0.0),
                motion_intensity=scene_info.get("motion_intensity", 0.0),
                color_variance=scene_info.get("color_variance", 0.0)
            ))
        
        logger.info("Scene detection completed", 
                   video_path=video_path, 
                   scenes_found=len(scenes))
        
        return scenes
        
    except Exception as e:
        logger.error("Scene detection failed", video_path=video_path, error=str(e))
        raise

def analyze_scene_properties(video_path: str, start_time: float, end_time: float) -> Dict[str, float]:
    """Analyze visual properties of a scene"""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    
    start_frame = int(start_time * fps)
    end_frame = int(end_time * fps)
    
    brightness_values = []
    motion_values = []
    color_variances = []
    shot_changes = 0
    
    prev_frame = None
    prev_hist = None
    
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    
    for frame_idx in range(start_frame, min(end_frame, int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))):
        ret, frame = cap.read()
        if not ret:
            break
        
        # Calculate brightness
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = np.mean(gray)
        brightness_values.append(brightness)
        
        # Calculate motion (optical flow magnitude)
        if prev_frame is not None:
            flow = cv2.calcOpticalFlowPyrLK(prev_frame, gray, None, None)
            if flow[0] is not None:
                motion = np.mean(np.sqrt(flow[0][:, 0]**2 + flow[0][:, 1]**2))
                motion_values.append(motion)
        
        # Calculate color variance
        color_var = np.var(frame.reshape(-1, 3), axis=0).mean()
        color_variances.append(color_var)
        
        # Detect shot changes using histogram comparison
        if prev_hist is not None:
            hist = cv2.calcHist([frame], [0, 1, 2], None, [50, 50, 50], [0, 256, 0, 256, 0, 256])
            correlation = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL)
            if correlation < 0.7:  # Threshold for shot change
                shot_changes += 1
        
        prev_frame = gray
        prev_hist = cv2.calcHist([frame], [0, 1, 2], None, [50, 50, 50], [0, 256, 0, 256, 0, 256])
    
    cap.release()
    
    return {
        "avg_brightness": np.mean(brightness_values) if brightness_values else 0.0,
        "motion_intensity": np.mean(motion_values) if motion_values else 0.0,
        "color_variance": np.mean(color_variances) if color_variances else 0.0,
        "shot_changes": shot_changes
    }

def extract_key_frames(video_path: str, num_frames: int = 10) -> List[Tuple[float, np.ndarray]]:
    """Extract key frames from video for analysis"""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps
    
    # Calculate frame indices to extract
    frame_indices = np.linspace(0, total_frames - 1, num_frames, dtype=int)
    key_frames = []
    
    for frame_idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        
        if ret:
            timestamp = frame_idx / fps
            key_frames.append((timestamp, frame))
    
    cap.release()
    return key_frames

def analyze_frame(frame: np.ndarray, timestamp: float) -> FrameAnalysis:
    """Analyze a single frame for visual features"""
    # Calculate brightness
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    
    # Calculate sharpness using Laplacian variance
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    
    # Extract dominant colors
    pixels = frame.reshape(-1, 3)
    from sklearn.cluster import KMeans
    kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
    kmeans.fit(pixels)
    dominant_colors = [color.astype(int).tolist() for color in kmeans.cluster_centers_]
    
    # Face detection
    faces = []
    if face_analyzer:
        try:
            # Convert BGR to RGB for InsightFace
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            detected_faces = face_analyzer.get(rgb_frame)
            
            for i, face in enumerate(detected_faces):
                face_info = FaceInfo(
                    face_id=f"face_{timestamp}_{i}",
                    confidence=float(face.det_score),
                    bbox=face.bbox.tolist(),
                    landmarks=face.kps.tolist(),
                    age=float(face.age) if hasattr(face, 'age') else None,
                    gender=face.gender if hasattr(face, 'gender') else None,
                    embedding=face.embedding.tolist() if hasattr(face, 'embedding') else None
                )
                faces.append(face_info)
        except Exception as e:
            logger.warning("Face detection failed for frame", timestamp=timestamp, error=str(e))
    
    return FrameAnalysis(
        timestamp=timestamp,
        brightness=brightness,
        motion_score=0.0,  # Motion calculation would require previous frame
        faces=faces,
        dominant_colors=dominant_colors,
        sharpness_score=sharpness
    )

async def analyze_chunk(chunk_path: str, analysis_types: List[str]) -> Dict[str, Any]:
    """Perform comprehensive analysis on video chunk"""
    start_time = datetime.utcnow()
    
    try:
        # Verify file exists
        if not os.path.exists(chunk_path):
            raise FileNotFoundError(f"Chunk file not found: {chunk_path}")
        
        # Get video metadata
        cap = cv2.VideoCapture(chunk_path)
        video_metadata = {
            "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            "fps": cap.get(cv2.CAP_PROP_FPS),
            "frame_count": int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
            "duration": int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) / cap.get(cv2.CAP_PROP_FPS)
        }
        cap.release()
        
        results = {
            "scenes": [],
            "key_frames": [],
            "face_summary": {"total_faces": 0, "unique_faces": 0, "avg_confidence": 0.0}
        }
        
        # Scene detection
        if "scenes" in analysis_types:
            logger.info("Performing scene detection", chunk_path=chunk_path)
            results["scenes"] = detect_scenes(chunk_path)
        
        # Frame analysis
        if "faces" in analysis_types or "frames" in analysis_types:
            logger.info("Extracting and analyzing key frames", chunk_path=chunk_path)
            key_frames = extract_key_frames(chunk_path, num_frames=15)
            
            frame_analyses = []
            total_faces = 0
            face_confidences = []
            
            for timestamp, frame in key_frames:
                frame_analysis = analyze_frame(frame, timestamp)
                frame_analyses.append(frame_analysis)
                
                total_faces += len(frame_analysis.faces)
                face_confidences.extend([face.confidence for face in frame_analysis.faces])
            
            results["key_frames"] = frame_analyses
            results["face_summary"] = {
                "total_faces": total_faces,
                "unique_faces": len(set(f.face_id for fa in frame_analyses for f in fa.faces)),
                "avg_confidence": float(np.mean(face_confidences)) if face_confidences else 0.0
            }
        
        processing_time = (datetime.utcnow() - start_time).total_seconds()
        
        return {
            "analysis_types": analysis_types,
            "scenes": results["scenes"],
            "key_frames": results["key_frames"],
            "face_summary": results["face_summary"],
            "processing_time": processing_time,
            "video_metadata": video_metadata
        }
        
    except Exception as e:
        logger.error("Chunk analysis failed", chunk_path=chunk_path, error=str(e))
        raise

async def save_analysis(chunk_id: str, analysis_data: Dict[str, Any]):
    """Save analysis results to storage"""
    try:
        os.makedirs(ANALYSIS_STORAGE_PATH, exist_ok=True)
        analysis_file = os.path.join(ANALYSIS_STORAGE_PATH, f"{chunk_id}_vision.json")
        
        # Convert Pydantic models to dict for JSON serialization
        serializable_data = {}
        for key, value in analysis_data.items():
            if hasattr(value, 'dict'):
                serializable_data[key] = [item.dict() for item in value] if isinstance(value, list) else value.dict()
            else:
                serializable_data[key] = value
        
        with open(analysis_file, 'w', encoding='utf-8') as f:
            json.dump(serializable_data, f, indent=2, ensure_ascii=False, default=str)
        
        logger.info("Analysis saved", chunk_id=chunk_id, file_path=analysis_file)
    except Exception as e:
        logger.error("Failed to save analysis", chunk_id=chunk_id, error=str(e))
        raise

async def process_vision_job(request: ChunkAnalysisRequest):
    """Background job to process chunk vision analysis"""
    correlation_id = request.job_id or str(uuid.uuid4())
    
    async with processing_semaphore:
        try:
            logger.info("Starting vision analysis job", 
                       chunk_id=request.chunk_id,
                       analysis_types=request.analysis_types,
                       correlation_id=correlation_id)
            
            # Publish job started event
            await publish_event("job.status_changed", {
                "jobId": correlation_id,
                "status": "processing",
                "service": "vision_svc",
                "chunkId": request.chunk_id
            }, correlation_id)
            
            # Perform analysis
            analysis_result = await analyze_chunk(
                request.chunk_path, 
                request.analysis_types
            )
            
            # Add metadata
            analysis_result.update({
                "chunk_id": request.chunk_id,
                "stream_id": request.stream_id
            })
            
            # Save analysis
            await save_analysis(request.chunk_id, analysis_result)
            
            # Publish analysis completed event
            await publish_event("chunk.vision_analyzed", {
                "chunkId": request.chunk_id,
                "streamId": request.stream_id,
                "analysis": analysis_result
            }, correlation_id)
            
            # Publish job completed event
            await publish_event("job.status_changed", {
                "jobId": correlation_id,
                "status": "completed",
                "service": "vision_svc",
                "chunkId": request.chunk_id
            }, correlation_id)
            
            logger.info("Vision analysis job completed", 
                       chunk_id=request.chunk_id,
                       correlation_id=correlation_id,
                       processing_time=analysis_result["processing_time"])
            
        except Exception as e:
            logger.error("Vision analysis job failed", 
                        chunk_id=request.chunk_id,
                        correlation_id=correlation_id,
                        error=str(e))
            
            # Publish job failed event
            await publish_event("job.status_changed", {
                "jobId": correlation_id,
                "status": "failed",
                "service": "vision_svc",
                "chunkId": request.chunk_id,
                "error": str(e)
            }, correlation_id)

# API Endpoints
@app.post("/analyze", response_model=Dict[str, str])
async def analyze_chunk_endpoint(
    request: ChunkAnalysisRequest,
    background_tasks: BackgroundTasks
):
    """Start vision analysis job for a chunk"""
    try:
        correlation_id = request.job_id or str(uuid.uuid4())
        
        # Validate chunk file exists
        if not os.path.exists(request.chunk_path):
            raise HTTPException(status_code=404, detail=f"Chunk file not found: {request.chunk_path}")
        
        # Add background task
        background_tasks.add_task(process_vision_job, request)
        
        logger.info("Vision analysis job queued", 
                   chunk_id=request.chunk_id,
                   correlation_id=correlation_id)
        
        return {
            "status": "accepted",
            "chunk_id": request.chunk_id,
            "correlation_id": correlation_id,
            "message": "Vision analysis job started"
        }
        
    except Exception as e:
        logger.error("Failed to start vision analysis job", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/analysis/{chunk_id}")
async def get_analysis(chunk_id: str):
    """Get vision analysis results for a chunk"""
    try:
        analysis_file = os.path.join(ANALYSIS_STORAGE_PATH, f"{chunk_id}_vision.json")
        
        if not os.path.exists(analysis_file):
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        with open(analysis_file, 'r', encoding='utf-8') as f:
            analysis_data = json.load(f)
        
        return analysis_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to retrieve analysis", chunk_id=chunk_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/analysis/{chunk_id}")
async def delete_analysis(chunk_id: str):
    """Delete vision analysis results for a chunk"""
    try:
        analysis_file = os.path.join(ANALYSIS_STORAGE_PATH, f"{chunk_id}_vision.json")
        
        if os.path.exists(analysis_file):
            os.remove(analysis_file)
            logger.info("Analysis deleted", chunk_id=chunk_id)
            return {"status": "deleted", "chunk_id": chunk_id}
        else:
            raise HTTPException(status_code=404, detail="Analysis not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete analysis", chunk_id=chunk_id, error=str(e))
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
        
        # Check face analyzer
        face_model_loaded = face_analyzer is not None
        gpu_available = torch.cuda.is_available()
        
        status = "healthy" if redis_connected and face_model_loaded else "unhealthy"
        
        return HealthResponse(
            status=status,
            timestamp=datetime.utcnow().isoformat(),
            face_model=FACE_MODEL_NAME,
            redis_connected=redis_connected,
            gpu_available=gpu_available
        )
        
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stats")
async def get_service_stats():
    """Get service statistics"""
    try:
        # Count analysis files
        analysis_count = 0
        if os.path.exists(ANALYSIS_STORAGE_PATH):
            analysis_count = len([f for f in os.listdir(ANALYSIS_STORAGE_PATH) if f.endswith('_vision.json')])
        
        return {
            "service": "vision_svc",
            "face_model": FACE_MODEL_NAME,
            "gpu_available": torch.cuda.is_available(),
            "max_concurrent_jobs": MAX_CONCURRENT_JOBS,
            "total_analyses": analysis_count,
            "storage_path": ANALYSIS_STORAGE_PATH,
            "scene_threshold": SCENE_THRESHOLD,
            "min_scene_length": MIN_SCENE_LENGTH
        }
        
    except Exception as e:
        logger.error("Failed to get stats", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize service on startup"""
    logger.info("Starting Vision Service", port=SERVICE_PORT)
    
    # Create storage directories
    os.makedirs(ANALYSIS_STORAGE_PATH, exist_ok=True)
    
    # Initialize connections and models
    await init_redis()
    init_face_analyzer()
    
    logger.info("Vision Service started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Vision Service")
    
    if redis_client:
        await redis_client.close()
    
    logger.info("Vision Service shutdown complete")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORT)