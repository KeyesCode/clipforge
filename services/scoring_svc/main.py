#!/usr/bin/env python3
"""
ClipForge Scoring Service
Multi-modal highlight scoring service for orchestrator integration
"""

import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import logging

import numpy as np
import aiohttp
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
import structlog

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
SCORING_SERVICE_PORT = int(os.getenv("SCORING_SERVICE_PORT", "8004"))
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:3001")
HIGHLIGHT_THRESHOLD = float(os.getenv("HIGHLIGHT_THRESHOLD", "0.3"))
MIN_HIGHLIGHT_DURATION = float(os.getenv("MIN_HIGHLIGHT_DURATION", "5.0"))
MAX_HIGHLIGHT_DURATION = float(os.getenv("MAX_HIGHLIGHT_DURATION", "60.0"))

# Pydantic models
class ChunkData(BaseModel):
    transcription: Optional[Dict[str, Any]] = None
    vision: Optional[Dict[str, Any]] = None
    audioFeatures: Optional[Dict[str, Any]] = None
    duration: float
    startTime: float

class ChunkInput(BaseModel):
    chunkId: str
    chunkData: ChunkData

class ScoringRequest(BaseModel):
    streamId: str
    chunks: List[ChunkInput]

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    service: str = "scoring_svc"
    version: str = "1.0.0"

# FastAPI app and job tracking
app = FastAPI(title="ClipForge Scoring Service", version="1.0.0")
processing_jobs: Dict[str, Dict[str, Any]] = {}

@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow().isoformat()
    )

@app.post("/score-batch")
async def score_batch_endpoint(
    request: ScoringRequest,
    background_tasks: BackgroundTasks
):
    """Start scoring job for stream chunks (matches orchestrator call format)"""
    try:
        stream_id = request.streamId
        
        # Add background task
        background_tasks.add_task(process_scoring_job, request)
        
        # Initialize job tracking
        processing_jobs[stream_id] = {
            "status": "accepted",
            "accepted_at": datetime.utcnow().isoformat()
        }
        
        logger.info("Scoring job accepted", stream_id=stream_id, chunk_count=len(request.chunks))
        return {"status": "accepted", "streamId": stream_id}
        
    except Exception as e:
        logger.error("Failed to accept scoring job", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to accept scoring job")

@app.get("/highlights/{stream_id}")
async def get_highlights(stream_id: str):
    """Get highlights for stream (polling endpoint for orchestrator)"""
    if stream_id not in processing_jobs:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    return processing_jobs[stream_id]


async def process_scoring_job(request: ScoringRequest):
    """Background task to process scoring"""
    stream_id = request.streamId
    
    try:
        # Update status
        processing_jobs[stream_id]["status"] = "processing"
        processing_jobs[stream_id]["started_at"] = datetime.utcnow().isoformat()
        
        # Analyze chunks and generate highlights
        highlights = await analyze_and_score_chunks(request.chunks)
        
        # Update with results
        processing_jobs[stream_id].update({
            "status": "completed",
            "completed_at": datetime.utcnow().isoformat(),
            "highlights": highlights
        })
        
        # Notify orchestrator via webhook
        await notify_orchestrator_webhook(stream_id, highlights)
        
    except Exception as e:
        logger.error("Scoring job failed", stream_id=stream_id, error=str(e))
        processing_jobs[stream_id].update({
            "status": "failed", 
            "error": str(e),
            "failed_at": datetime.utcnow().isoformat()
        })

async def analyze_and_score_chunks(chunks: List[ChunkInput]) -> List[Dict[str, Any]]:
    """Core scoring logic"""
    highlights = []
    
    for chunk in chunks:
        score = calculate_chunk_score(chunk)
        
        if score >= HIGHLIGHT_THRESHOLD:
            highlights.append({
                "chunkId": chunk.chunkId,
                "score": score,
                "startTime": chunk.chunkData.startTime,
                "duration": chunk.chunkData.duration,
                "reasons": get_scoring_reasons(chunk, score),
                "metadata": {
                    "transcription_length": len(chunk.chunkData.transcription.get("text", "")) if chunk.chunkData.transcription else 0,
                    "face_detected": chunk.chunkData.vision.get("faces_detected", False) if chunk.chunkData.vision else False
                }
            })
    
    # Sort by score descending
    highlights.sort(key=lambda x: x["score"], reverse=True)
    return highlights

def calculate_chunk_score(chunk: ChunkInput) -> float:
    """Calculate engagement score for chunk"""
    score = 0.0
    
    # Transcription scoring
    if chunk.chunkData.transcription:
        text = chunk.chunkData.transcription.get("text", "")
        score += score_transcription(text)
    
    # Vision scoring  
    if chunk.chunkData.vision:
        score += score_vision_data(chunk.chunkData.vision)
    
    # Audio features scoring
    if chunk.chunkData.audioFeatures:
        score += score_audio_features(chunk.chunkData.audioFeatures)
    
    # Duration penalty for very short/long chunks
    duration = chunk.chunkData.duration
    if duration < 3:
        score *= 0.5  # Penalty for short clips
    elif duration > 30:
        score *= 0.8  # Slight penalty for long clips
    
    return min(score, 1.0)  # Cap at 1.0

def score_transcription(text: str) -> float:
    """Score transcription content"""
    if not text:
        return 0.0
    
    score = 0.0
    text_lower = text.lower()
    
    # Base score for having any transcription
    score += 0.2
    
    # Action words boost (expanded list)
    action_words = ["amazing", "incredible", "wow", "unbelievable", "insane", "perfect", "epic", 
                   "awesome", "fantastic", "great", "excellent", "outstanding", "brilliant"]
    score += sum(0.1 for word in action_words if word in text_lower)
    
    # Emotion indicators (expanded)
    emotion_words = ["excited", "shocked", "surprised", "happy", "angry", "love", "hate", 
                    "crazy", "wild", "intense", "fun", "funny", "hilarious"]
    score += sum(0.05 for word in emotion_words if word in text_lower)
    
    # Gaming/streaming terms
    gaming_words = ["clutch", "play", "win", "lose", "kill", "death", "score", "points", "level"]
    score += sum(0.03 for word in gaming_words if word in text_lower)
    
    # Length scoring (optimal around 50-200 chars)
    length_score = min(len(text) / 100, 1.0) * 0.3
    score += length_score
    
    return min(score, 0.8)  # Increased cap for transcription contribution

def score_vision_data(vision_data: Dict[str, Any]) -> float:
    """Score vision analysis data"""
    score = 0.0
    
    # Base score for having vision data
    score += 0.1
    
    # Face detection boost
    if vision_data.get("faces_detected", False) or vision_data.get("faces"):
        score += 0.2
    
    # Scene changes indicate action
    scene_changes = vision_data.get("scene_changes", 0)
    if isinstance(scene_changes, list):
        scene_changes = len(scene_changes)
    score += min(scene_changes * 0.1, 0.3)
    
    # Motion intensity
    motion = vision_data.get("motion_intensity", 0)
    if motion > 0:
        score += min(motion * 0.1, 0.2)
    
    return min(score, 0.6)  # Increased cap for vision contribution

def score_audio_features(audio_features: Dict[str, Any]) -> float:
    """Score audio characteristics"""
    if not audio_features:
        return 0.0
    
    score = 0.0
    
    # Base score for having audio features
    score += 0.1
    
    # Energy/volume indicators
    if audio_features.get("energy"):
        energy = audio_features["energy"]
        if isinstance(energy, list) and energy:
            avg_energy = sum(energy) / len(energy)
            score += min(avg_energy * 0.2, 0.3)
    
    # Loudness indicators
    loudness = audio_features.get("loudness", 0)
    if loudness > 0:
        score += min(loudness * 0.05, 0.2)
    
    return min(score, 0.4)

def get_scoring_reasons(chunk: ChunkInput, score: float) -> List[str]:
    """Get human-readable scoring reasons"""
    reasons = []
    
    if chunk.chunkData.transcription:
        text = chunk.chunkData.transcription.get("text", "").lower()
        if any(word in text for word in ["amazing", "incredible", "wow", "unbelievable"]):
            reasons.append("high_engagement_words")
    
    if chunk.chunkData.vision and chunk.chunkData.vision.get("faces_detected"):
        reasons.append("face_detected")
        
    if score > 0.8:
        reasons.append("high_overall_score")
    
    return reasons

async def notify_orchestrator_webhook(stream_id: str, highlights: List[Dict[str, Any]]):
    """Notify orchestrator of completed scoring"""
    try:
        webhook_url = f"{ORCHESTRATOR_URL}/api/v1/processing/webhooks/scoring-complete"
        
        async with aiohttp.ClientSession() as session:
            await session.post(webhook_url, json={
                "streamId": stream_id,
                "result": {"highlights": highlights}
            })
        
        logger.info("Scoring webhook sent", stream_id=stream_id)
    except Exception as e:
        logger.error("Failed to send scoring webhook", stream_id=stream_id, error=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=SCORING_SERVICE_PORT)