#!/usr/bin/env python3
"""
ClipForge Vision Service
Handles scene detection, face recognition, and visual analysis using PySceneDetect and InsightFace
Integrated with ClipForge orchestrator webhook system
"""

import os
import json
import asyncio
import uuid
import tempfile
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

import structlog
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential

# S3 integration
from s3_utils.s3_client import S3Client

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
SERVICE_PORT = int(os.getenv("VISION_SERVICE_PORT", "8003"))
ANALYSIS_STORAGE_PATH = os.getenv("ANALYSIS_STORAGE_PATH", "./data/analysis")
FACE_MODEL_NAME = os.getenv("FACE_MODEL_NAME", "buffalo_l")
MAX_CONCURRENT_JOBS = int(os.getenv("MAX_CONCURRENT_VISION_JOBS", "2"))
SCENE_THRESHOLD = float(os.getenv("SCENE_THRESHOLD", "30.0"))
MIN_SCENE_LENGTH = float(os.getenv("MIN_SCENE_LENGTH", "3.0"))

# Orchestrator webhook configuration
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:3001")
VISION_WEBHOOK_ENDPOINT = "/api/processing/webhooks/vision-complete"

# S3 configuration
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "clipforge-storage")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "http://localhost:4566")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "test")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "test")
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")

# Pydantic models
class ChunkAnalysisRequest(BaseModel):
    chunkId: str = Field(..., description="Unique chunk identifier")
    videoPath: str = Field(..., description="S3 URL to video chunk file")
    streamId: str = Field(..., description="Parent stream identifier")
    analysisType: str = Field("full", description="Type of analysis to perform")
    options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Analysis options")

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

class VisionAnalysisResponse(BaseModel):
    status: str = "completed"
    analysis: Dict[str, Any]
    error: Optional[str] = None

class VisionAnalysisStatus(BaseModel):
    status: str  # "processing", "completed", "failed"
    analysis: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    service: str = "vision_svc"
    face_model: str
    gpu_available: bool

# Global variables
face_analyzer: Optional[FaceAnalysis] = None
s3_client: Optional[S3Client] = None
processing_semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)
processing_jobs: Dict[str, Dict[str, Any]] = {}  # Store job status

# Lifespan event handler
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Vision Service", port=SERVICE_PORT)
    
    # Create storage directories
    os.makedirs(ANALYSIS_STORAGE_PATH, exist_ok=True)
    
    # Initialize S3 client
    init_s3()
    # Note: Face analyzer initialization is optional for basic functionality
    # init_face_analyzer()  # Commented out for now to simplify startup
    
    logger.info("Vision Service started successfully", 
               s3_bucket=S3_BUCKET_NAME,
               face_model=FACE_MODEL_NAME)
    
    yield
    
    # Shutdown
    logger.info("Shutting down Vision Service")

# Create app with lifespan
app = FastAPI(title="Vision Service", lifespan=lifespan)

# Add CORS middleware
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
async def notify_orchestrator(stream_id: str, chunk_id: str, vision_result: Dict[str, Any]):
    """Notify orchestrator about vision analysis completion via webhook"""
    try:
        webhook_url = f"{ORCHESTRATOR_URL}{VISION_WEBHOOK_ENDPOINT}"
        payload = {
            "streamId": stream_id,
            "chunkId": chunk_id,
            "result": vision_result
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

async def analyze_chunk_from_s3(s3_url: str, chunk_id: str, analysis_type: str = "full") -> Dict[str, Any]:
    """Analyze video chunk from S3 URL using computer vision"""
    start_time = datetime.utcnow()
    local_file_path = None
    
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
        
        # Perform basic video analysis
        analysis_result = {
            "sceneChanges": [],
            "faces": [],
            "motionIntensity": [],
            "colorHistogram": [],
            "processing_time": 0,
            "metadata": {}
        }
        
        # Get video metadata using OpenCV
        cap = cv2.VideoCapture(local_file_path)
        if cap.isOpened():
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration = frame_count / fps if fps > 0 else 0
            
            analysis_result["metadata"] = {
                "fps": fps,
                "frame_count": frame_count,
                "width": width,
                "height": height,
                "duration": duration
            }
            
            # Simple scene analysis - sample frames every 2 seconds
            scene_changes = []
            frame_interval = int(fps * 2) if fps > 0 else 30
            
            for frame_num in range(0, frame_count, frame_interval):
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
                ret, frame = cap.read()
                if ret:
                    timestamp = frame_num / fps if fps > 0 else 0
                    scene_changes.append({
                        "timestamp": timestamp,
                        "frame_num": frame_num,
                        "brightness": np.mean(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
                    })
            
            analysis_result["sceneChanges"] = scene_changes
            cap.release()
        
        processing_time = (datetime.utcnow() - start_time).total_seconds()
        analysis_result["processing_time"] = processing_time
        
        # Cleanup temporary file
        if local_file_path and os.path.exists(local_file_path):
            try:
                os.remove(local_file_path)
            except:
                pass
        
        return analysis_result
        
    except Exception as e:
        logger.error("Vision analysis failed", chunk_id=chunk_id, s3_url=s3_url, error=str(e))
        
        # Cleanup on error
        if local_file_path and os.path.exists(local_file_path):
            try:
                os.remove(local_file_path)
            except:
                pass
        
        raise

async def process_vision_job(request: ChunkAnalysisRequest, stream_id: str):
    """Background job to process chunk vision analysis with S3 integration"""
    chunk_id = request.chunkId
    
    # Update job status
    processing_jobs[chunk_id] = {
        "status": "processing",
        "started_at": datetime.utcnow().isoformat()
    }
    
    async with processing_semaphore:
        try:
            logger.info("Starting vision analysis job", 
                       chunk_id=chunk_id,
                       s3_url=request.videoPath)
            
            # Download video from S3 and perform analysis
            analysis_result = await analyze_chunk_from_s3(
                request.videoPath, 
                chunk_id,
                request.analysisType
            )
            
            # Save analysis locally
            await save_analysis(chunk_id, analysis_result)
            
            # Update job status
            processing_jobs[chunk_id] = {
                "status": "completed",
                "analysis": analysis_result,
                "completed_at": datetime.utcnow().isoformat()
            }
            
            # Notify orchestrator via webhook
            await notify_orchestrator(stream_id, chunk_id, analysis_result)
            
            logger.info("Vision analysis job completed", 
                       chunk_id=chunk_id,
                       processing_time=analysis_result.get("processing_time", 0))
            
        except Exception as e:
            error_msg = str(e)
            logger.error("Vision analysis job failed", 
                        chunk_id=chunk_id,
                        error=error_msg)
            
            # Update job status with error
            processing_jobs[chunk_id] = {
                "status": "failed",
                "error": error_msg,
                "failed_at": datetime.utcnow().isoformat()
            }

# API Endpoints
@app.post("/analyze")
async def analyze_chunk_endpoint(
    request: ChunkAnalysisRequest,
    background_tasks: BackgroundTasks
):
    """Start vision analysis job for a chunk (matches orchestrator call format)"""
    try:
        chunk_id = request.chunkId
        stream_id = request.streamId
        
        # Add background task
        background_tasks.add_task(process_vision_job, request, stream_id)
        
        # Initialize job tracking
        processing_jobs[chunk_id] = {
            "status": "accepted",
            "accepted_at": datetime.utcnow().isoformat()
        }
        
        logger.info("Vision analysis job queued", 
                   chunk_id=chunk_id,
                   video_path=request.videoPath)
        
        return {
            "status": "accepted",
            "chunkId": chunk_id,
            "message": "Vision analysis job started"
        }
        
    except Exception as e:
        logger.error("Failed to start vision analysis job", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/analysis/{chunk_id}", response_model=VisionAnalysisStatus)
async def get_analysis_status(chunk_id: str):
    """Get vision analysis status for a chunk (matches orchestrator polling)"""
    try:
        # Check in-memory job status first
        if chunk_id in processing_jobs:
            job_status = processing_jobs[chunk_id]
            
            if job_status["status"] == "completed":
                return VisionAnalysisStatus(
                    status="completed",
                    analysis=job_status["analysis"]
                )
            elif job_status["status"] == "failed":
                return VisionAnalysisStatus(
                    status="failed",
                    error=job_status.get("error", "Unknown error")
                )
            else:
                return VisionAnalysisStatus(
                    status="processing"
                )
        
        # Check saved analysis file as fallback
        analysis_file = os.path.join(ANALYSIS_STORAGE_PATH, f"{chunk_id}_vision.json")
        
        if os.path.exists(analysis_file):
            with open(analysis_file, 'r', encoding='utf-8') as f:
                analysis_data = json.load(f)
            
            return VisionAnalysisStatus(
                status="completed",
                analysis=analysis_data
            )
        
        # Job not found
        raise HTTPException(status_code=404, detail="Vision analysis job not found")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to retrieve analysis status", chunk_id=chunk_id, error=str(e))
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORT)