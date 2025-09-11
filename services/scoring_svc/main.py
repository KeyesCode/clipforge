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

# Import segment creation functions
from segment_creators import (
    create_speech_based_segments, create_audio_peak_segments, 
    create_vision_event_segments, create_fusion_segments,
    score_highlight_segment, calculate_segment_confidence,
    get_segment_score_breakdown, get_segment_reasons,
    remove_overlapping_segments
)

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
        print(f"🎯 SCORING: Starting job for stream {stream_id}")
        print(f"🎯 SCORING: Received {len(request.chunks)} chunks")
        
        # Update status
        processing_jobs[stream_id]["status"] = "processing"
        processing_jobs[stream_id]["started_at"] = datetime.utcnow().isoformat()
        
        # Analyze chunks and generate highlights
        highlights = await analyze_and_score_chunks(request.chunks)
        
        print(f"🎯 SCORING: Generated {len(highlights)} highlights for stream {stream_id}")
        
        # Update with results
        processing_jobs[stream_id].update({
            "status": "completed",
            "completed_at": datetime.utcnow().isoformat(),
            "highlights": highlights
        })
        
        # Notify orchestrator via webhook
        await notify_orchestrator_webhook(stream_id, highlights)
        
    except Exception as e:
        print(f"🎯 SCORING ERROR: {e}")
        logger.error("Scoring job failed", stream_id=stream_id, error=str(e))
        processing_jobs[stream_id].update({
            "status": "failed", 
            "error": str(e),
            "failed_at": datetime.utcnow().isoformat()
        })

async def analyze_and_score_chunks(chunks: List[ChunkInput]) -> List[Dict[str, Any]]:
    """Core scoring logic with content-aware highlight detection"""
    highlights = []
    
    print(f"🎯 ANALYZE: Processing {len(chunks)} chunks with threshold {HIGHLIGHT_THRESHOLD}")
    
    for i, chunk in enumerate(chunks):
        print(f"🎯 CHUNK {i+1}: ID={chunk.chunkId}")
        print(f"🎯 CHUNK {i+1}: Has transcription: {bool(chunk.chunkData.transcription)}")
        print(f"🎯 CHUNK {i+1}: Has vision: {bool(chunk.chunkData.vision)}")
        print(f"🎯 CHUNK {i+1}: Has audio: {bool(chunk.chunkData.audioFeatures)}")
        
        # Find optimal highlight segments within this chunk
        highlight_segments = await find_highlight_segments_in_chunk(chunk)
        
        print(f"🎯 CHUNK {i+1}: Found {len(highlight_segments)} potential segments")
        
        # Add qualifying segments to highlights
        for segment in highlight_segments:
            if segment["score"] >= HIGHLIGHT_THRESHOLD:
                print(f"🎯 SEGMENT: ✅ HIGHLIGHT! Score={segment['score']:.3f}, Duration={segment['duration']:.1f}s")
                highlights.append({
                    "chunkId": chunk.chunkId,
                    "score": segment["score"],
                    "breakdown": segment["breakdown"],
                    "suggestedSegments": [{
                        "startTime": segment["startTime"],  # Relative to chunk start
                        "duration": segment["duration"],
                        "confidence": segment["confidence"],
                        "reason": segment["reason"],
                        "absoluteStartTime": chunk.chunkData.startTime + segment["startTime"]  # Absolute time in stream
                    }],
                    "reasons": segment["reasons"],
                    "metadata": {
                        "chunk_duration": chunk.chunkData.duration,
                        "transcription_length": len(extract_transcription_text(chunk.chunkData.transcription)) if chunk.chunkData.transcription else 0,
                        "face_detected": chunk.chunkData.vision.get("faces_detected", False) if chunk.chunkData.vision else False
                    }
                })
            else:
                print(f"🎯 SEGMENT: ❌ Below threshold, score={segment['score']:.3f}")
    
    print(f"🎯 ANALYZE: Found {len(highlights)} highlights from {len(chunks)} chunks")
    
    # Sort by score descending
    highlights.sort(key=lambda x: x["score"], reverse=True)
    return highlights

async def find_highlight_segments_in_chunk(chunk: ChunkInput) -> List[Dict[str, Any]]:
    """Find optimal highlight segments within a chunk using content analysis"""
    segments = []
    duration = chunk.chunkData.duration
    
    print(f"🎯 SEGMENT_ANALYSIS: Analyzing chunk {chunk.chunkId} (duration: {duration}s)")
    
    # Extract all available data
    transcription_segments = extract_transcription_segments(chunk.chunkData.transcription)
    audio_peaks = analyze_audio_peaks(chunk.chunkData.audioFeatures, duration)
    vision_events = analyze_vision_events(chunk.chunkData.vision, duration)
    
    # Create candidate segments based on different approaches
    candidates = []
    
    # Approach 1: Transcription-based segments (speech events)
    candidates.extend(create_speech_based_segments(transcription_segments, duration))
    
    # Approach 2: Audio peak-based segments (energy spikes)
    candidates.extend(create_audio_peak_segments(audio_peaks, duration))
    
    # Approach 3: Vision event-based segments (scene changes, motion)
    candidates.extend(create_vision_event_segments(vision_events, duration))
    
    # Approach 4: Multi-modal fusion segments (combine all data)
    candidates.extend(create_fusion_segments(transcription_segments, audio_peaks, vision_events, duration))
    
    print(f"🎯 SEGMENT_ANALYSIS: Generated {len(candidates)} candidate segments")
    
    # Score and filter candidates
    for candidate in candidates:
        candidate["score"] = score_highlight_segment(
            candidate, chunk, transcription_segments, audio_peaks, vision_events
        )
        candidate["confidence"] = calculate_segment_confidence(candidate, chunk)
        candidate["breakdown"] = get_segment_score_breakdown(candidate, chunk)
        candidate["reasons"] = get_segment_reasons(candidate, chunk)
    
    # Filter by minimum duration and score
    valid_candidates = [
        c for c in candidates 
        if c["duration"] >= MIN_HIGHLIGHT_DURATION 
        and c["duration"] <= MAX_HIGHLIGHT_DURATION
        and c["score"] > 0.1
    ]
    
    # Remove overlapping segments, keeping highest scored
    final_segments = remove_overlapping_segments(valid_candidates)
    
    print(f"🎯 SEGMENT_ANALYSIS: Selected {len(final_segments)} final segments")
    
    return final_segments

def extract_transcription_text(transcription: Optional[Dict[str, Any]]) -> str:
    """Extract text from transcription data"""
    if not transcription:
        return ""
    
    if isinstance(transcription, str):
        return transcription
    elif isinstance(transcription, dict):
        # Try getting text field first
        text = transcription.get("text", "")
        
        # If no text field, extract from segments (Whisper format)
        if not text and transcription.get("segments"):
            segments = transcription["segments"]
            if isinstance(segments, list):
                text_parts = []
                for seg in segments:
                    if isinstance(seg, dict) and seg.get("text"):
                        text_parts.append(seg["text"].strip())
                text = " ".join(text_parts)
        
        # Fallback: try getting from 'transcript' field
        if not text and transcription.get("transcript"):
            text = transcription["transcript"]
        
        return text
    
    return ""

def extract_transcription_segments(transcription: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract timed segments from transcription data"""
    segments = []
    
    if not transcription or not isinstance(transcription, dict):
        return segments
    
    # Whisper format with segments
    if transcription.get("segments"):
        whisper_segments = transcription["segments"]
        if isinstance(whisper_segments, list):
            for seg in whisper_segments:
                if isinstance(seg, dict) and all(k in seg for k in ["start", "end", "text"]):
                    segments.append({
                        "start": seg["start"],
                        "end": seg["end"],
                        "duration": seg["end"] - seg["start"],
                        "text": seg["text"].strip(),
                        "confidence": seg.get("confidence", 1.0)
                    })
    
    return segments

def analyze_audio_peaks(audio_features: Optional[Dict[str, Any]], duration: float) -> List[Dict[str, Any]]:
    """Analyze audio data to find energy peaks and interesting moments"""
    peaks = []
    
    if not audio_features or not isinstance(audio_features, dict):
        return peaks
    
    # Energy-based peaks
    if audio_features.get("energy"):
        energy_data = audio_features["energy"]
        if isinstance(energy_data, list) and len(energy_data) > 0:
            # Find peaks in energy data
            energy_peaks = find_peaks_in_signal(energy_data, duration)
            peaks.extend([{**peak, "type": "energy"} for peak in energy_peaks])
    
    # Volume-based peaks
    if audio_features.get("volume"):
        volume_data = audio_features["volume"]
        if isinstance(volume_data, list) and len(volume_data) > 0:
            volume_peaks = find_peaks_in_signal(volume_data, duration)
            peaks.extend([{**peak, "type": "volume"} for peak in volume_peaks])
    
    # Spectral features (if available)
    if audio_features.get("spectral_features"):
        spectral = audio_features["spectral_features"]
        if isinstance(spectral, dict):
            # Look for spectral changes that might indicate interesting moments
            if spectral.get("mfcc"):
                mfcc_peaks = analyze_spectral_changes(spectral["mfcc"], duration)
                peaks.extend([{**peak, "type": "spectral"} for peak in mfcc_peaks])
    
    return peaks

def analyze_vision_events(vision_data: Optional[Dict[str, Any]], duration: float) -> List[Dict[str, Any]]:
    """Analyze vision data to find interesting visual events"""
    events = []
    
    if not vision_data or not isinstance(vision_data, dict):
        return events
    
    # Scene changes
    if vision_data.get("scene_changes"):
        scene_changes = vision_data["scene_changes"]
        if isinstance(scene_changes, list):
            for change in scene_changes:
                if isinstance(change, dict) and "timestamp" in change:
                    events.append({
                        "start": max(0, change["timestamp"] - 2),
                        "end": min(duration, change["timestamp"] + 3),
                        "type": "scene_change",
                        "intensity": change.get("intensity", 0.5)
                    })
    
    # Motion intensity peaks
    if vision_data.get("motion_intensity"):
        motion = vision_data["motion_intensity"]
        if isinstance(motion, list):
            motion_events = find_peaks_in_signal(motion, duration, threshold=0.6)
            events.extend([{**event, "type": "motion"} for event in motion_events])
    
    # Face detection events
    if vision_data.get("face_tracking"):
        face_data = vision_data["face_tracking"]
        if isinstance(face_data, list):
            for face_event in face_data:
                if isinstance(face_event, dict) and "timestamp" in face_event:
                    events.append({
                        "start": max(0, face_event["timestamp"] - 1),
                        "end": min(duration, face_event["timestamp"] + 4),
                        "type": "face_detected",
                        "confidence": face_event.get("confidence", 0.5)
                    })
    
    return events

def find_peaks_in_signal(signal_data: List[float], duration: float, threshold: float = 0.7) -> List[Dict[str, Any]]:
    """Find peaks in a signal array"""
    peaks = []
    
    if not signal_data or len(signal_data) < 3:
        return peaks
    
    # Calculate time step
    time_step = duration / len(signal_data)
    
    # Find local maxima above threshold
    for i in range(1, len(signal_data) - 1):
        current = signal_data[i]
        prev_val = signal_data[i-1]
        next_val = signal_data[i+1]
        
        # Check if it's a local maximum above threshold
        if (current > prev_val and current > next_val and current > threshold):
            peak_time = i * time_step
            # Create a segment around the peak
            segment_start = max(0, peak_time - 5)  # 5 seconds before
            segment_end = min(duration, peak_time + 10)  # 10 seconds after
            
            peaks.append({
                "start": segment_start,
                "end": segment_end,
                "peak_time": peak_time,
                "intensity": current
            })
    
    return peaks

def analyze_spectral_changes(mfcc_data: List[List[float]], duration: float) -> List[Dict[str, Any]]:
    """Analyze spectral changes in MFCC data"""
    changes = []
    
    if not mfcc_data or len(mfcc_data) < 2:
        return changes
    
    time_step = duration / len(mfcc_data)
    
    # Calculate spectral flux (measure of change)
    for i in range(1, len(mfcc_data)):
        if isinstance(mfcc_data[i], list) and isinstance(mfcc_data[i-1], list):
            # Calculate euclidean distance between consecutive MFCC vectors
            diff = sum((a - b) ** 2 for a, b in zip(mfcc_data[i], mfcc_data[i-1]) 
                      if isinstance(a, (int, float)) and isinstance(b, (int, float)))
            flux = diff ** 0.5
            
            # If change is significant, mark as interesting
            if flux > 2.0:  # Threshold for significant spectral change
                change_time = i * time_step
                changes.append({
                    "start": max(0, change_time - 3),
                    "end": min(duration, change_time + 7),
                    "change_time": change_time,
                    "intensity": min(flux / 5.0, 1.0)  # Normalize
                })
    
    return changes

def calculate_chunk_score(chunk: ChunkInput) -> float:
    """Calculate engagement score for chunk"""
    score = 0.0
    
    # Debug logging
    logger.info("Scoring chunk", 
                chunk_id=chunk.chunkId, 
                has_transcription=bool(chunk.chunkData.transcription),
                has_vision=bool(chunk.chunkData.vision), 
                has_audio=bool(chunk.chunkData.audioFeatures),
                duration=chunk.chunkData.duration)
    
    # Transcription scoring
    if chunk.chunkData.transcription:
        # Improved text extraction
        transcription = chunk.chunkData.transcription
        text = ""
        
        if isinstance(transcription, str):
            text = transcription
        elif isinstance(transcription, dict):
            # Try getting text field first
            text = transcription.get("text", "")
            
            # If no text field, extract from segments (Whisper format)
            if not text and transcription.get("segments"):
                segments = transcription["segments"]
                if isinstance(segments, list):
                    text_parts = []
                    for seg in segments:
                        if isinstance(seg, dict) and seg.get("text"):
                            text_parts.append(seg["text"].strip())
                    text = " ".join(text_parts)
                    print(f"🎯 SCORING: Extracted {len(text_parts)} segments from Whisper format")
            
            # Fallback: try getting from 'transcript' field
            if not text and transcription.get("transcript"):
                text = transcription["transcript"]
        
        transcription_score = score_transcription(text)
        score += transcription_score
        logger.info("Transcription scoring", chunk_id=chunk.chunkId, text_length=len(text), transcription_score=transcription_score)
    
    # Vision scoring  
    if chunk.chunkData.vision:
        vision_score = score_vision_data(chunk.chunkData.vision)
        score += vision_score
        logger.info("Vision scoring", chunk_id=chunk.chunkId, vision_score=vision_score)
    
    # Audio features scoring
    if chunk.chunkData.audioFeatures:
        audio_score = score_audio_features(chunk.chunkData.audioFeatures)
        score += audio_score
        logger.info("Audio scoring", chunk_id=chunk.chunkId, audio_score=audio_score)
    
    # If no data sources, give a minimal base score
    if not chunk.chunkData.transcription and not chunk.chunkData.vision and not chunk.chunkData.audioFeatures:
        score = 0.2  # Minimal score for chunks without analysis data
        logger.info("No analysis data, using base score", chunk_id=chunk.chunkId)
    
    # Duration penalty for very short/long chunks
    duration = chunk.chunkData.duration
    if duration < 3:
        score *= 0.5  # Penalty for short clips
    elif duration > 30:
        score *= 0.8  # Slight penalty for long clips
    
    final_score = min(score, 1.0)  # Cap at 1.0
    logger.info("Final chunk score", chunk_id=chunk.chunkId, score=final_score, threshold=HIGHLIGHT_THRESHOLD)
    
    return final_score

def score_transcription(text: str) -> float:
    """Score transcription content"""
    if not text:
        return 0.0
    
    score = 0.0
    text_lower = text.lower()
    
    # Base score for having any transcription
    score += 0.2
    
    # High-priority clip request terms (explicit requests for clipping)
    clip_request_terms = ["clip it", "clip that", "make a clip", "that's a clip", "clipworthy", "clip worthy"]
    score += sum(0.3 for term in clip_request_terms if term in text_lower)
    
    # Action words boost (expanded list)
    action_words = ["amazing", "incredible", "wow", "unbelievable", "insane", "perfect", "epic", 
                   "awesome", "fantastic", "great", "excellent", "outstanding", "brilliant"]
    score += sum(0.1 for word in action_words if word in text_lower)
    
    # Emotion indicators (expanded)
    emotion_words = ["excited", "shocked", "surprised", "happy", "angry", "love", "hate", 
                    "crazy", "wild", "intense", "fun", "funny", "hilarious"]
    score += sum(0.05 for word in emotion_words if word in text_lower)
    
    # Gaming/streaming terms
    gaming_words = ["clutch", "play", "win", "lose", "kill", "death", "score", "points", "level",
                   "good fight", "gg", "nice", "skilled", "combo", "finish", "victory", "defeat"]
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