#!/usr/bin/env python3
"""
ClipForge Scoring Service
Multi-modal highlight scoring and clip generation service
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
import pandas as pd
import redis.asyncio as redis
import yaml
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

# Load configuration
CONFIG_PATH = Path(__file__).parent / "config" / "scoring.yaml"
with open(CONFIG_PATH, 'r') as f:
    config = yaml.safe_load(f)

# Pydantic models
class ChunkAnalysisRequest(BaseModel):
    stream_id: str
    chunk_id: str
    chunk_path: str
    transcription_data: Optional[Dict] = None
    vision_data: Optional[Dict] = None
    job_id: Optional[str] = None

class HighlightScoringRequest(BaseModel):
    stream_id: str
    job_id: Optional[str] = None

class ClipGenerationRequest(BaseModel):
    stream_id: str
    max_clips: Optional[int] = None
    min_score_threshold: Optional[float] = None
    job_id: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    service: str = "scoring_svc"
    version: str = "1.0.0"
    redis_connected: bool

class ScoringService:
    def __init__(self):
        self.redis_client = None
        self.app = FastAPI(title="ClipForge Scoring Service", version="1.0.0")
        self.setup_routes()
        
    async def setup_redis(self):
        """Initialize Redis connection"""
        try:
            self.redis_client = redis.Redis(
                host=config['redis']['host'],
                port=config['redis']['port'],
                password=config['redis'].get('password'),
                db=config['redis']['db'],
                decode_responses=True
            )
            await self.redis_client.ping()
            logger.info("Redis connection established")
        except Exception as e:
            logger.error("Failed to connect to Redis", error=str(e))
            raise

    def setup_routes(self):
        """Setup FastAPI routes"""
        
        @self.app.on_event("startup")
        async def startup_event():
            await self.setup_redis()
            logger.info("Scoring service started")

        @self.app.on_event("shutdown")
        async def shutdown_event():
            if self.redis_client:
                await self.redis_client.close()
            logger.info("Scoring service stopped")

        @self.app.get("/health", response_model=HealthResponse)
        async def health_check():
            redis_connected = False
            try:
                if self.redis_client:
                    await self.redis_client.ping()
                    redis_connected = True
            except:
                pass
                
            return HealthResponse(
                status="healthy" if redis_connected else "degraded",
                timestamp=datetime.utcnow().isoformat(),
                redis_connected=redis_connected
            )

        @self.app.post("/analyze-chunk")
        async def analyze_chunk(request: ChunkAnalysisRequest, background_tasks: BackgroundTasks):
            """Analyze individual chunk for scoring features"""
            correlation_id = str(uuid.uuid4())
            
            logger.info("Starting chunk analysis", 
                       chunk_id=request.chunk_id,
                       stream_id=request.stream_id,
                       correlation_id=correlation_id)
            
            background_tasks.add_task(
                self._process_chunk_analysis,
                request,
                correlation_id
            )
            
            return {
                "status": "processing",
                "correlation_id": correlation_id,
                "chunk_id": request.chunk_id
            }

        @self.app.post("/score-highlights")
        async def score_highlights(request: HighlightScoringRequest, background_tasks: BackgroundTasks):
            """Score highlights for entire stream"""
            correlation_id = str(uuid.uuid4())
            
            logger.info("Starting highlight scoring",
                       stream_id=request.stream_id,
                       correlation_id=correlation_id)
            
            background_tasks.add_task(
                self._process_highlight_scoring,
                request,
                correlation_id
            )
            
            return {
                "status": "processing",
                "correlation_id": correlation_id,
                "stream_id": request.stream_id
            }

        @self.app.post("/generate-clips")
        async def generate_clips(request: ClipGenerationRequest, background_tasks: BackgroundTasks):
            """Generate clips from scored highlights"""
            correlation_id = str(uuid.uuid4())
            
            logger.info("Starting clip generation",
                       stream_id=request.stream_id,
                       correlation_id=correlation_id)
            
            background_tasks.add_task(
                self._process_clip_generation,
                request,
                correlation_id
            )
            
            return {
                "status": "processing",
                "correlation_id": correlation_id,
                "stream_id": request.stream_id
            }

    async def _process_chunk_analysis(self, request: ChunkAnalysisRequest, correlation_id: str):
        """Process chunk analysis in background"""
        try:
            # Extract features from chunk
            features = await self._extract_chunk_features(request)
            
            # Store features in Redis
            feature_key = f"chunk_features:{request.chunk_id}"
            await self.redis_client.hset(feature_key, mapping=features)
            await self.redis_client.expire(feature_key, config['redis']['result_ttl'])
            
            # Publish chunk analyzed event
            event = {
                "eventId": str(uuid.uuid4()),
                "eventType": "chunk.analyzed",
                "timestamp": datetime.utcnow().isoformat(),
                "version": "1.0",
                "source": "scoring_svc",
                "correlationId": correlation_id,
                "data": {
                    "chunkId": request.chunk_id,
                    "streamId": request.stream_id,
                    "features": features,
                    "jobId": request.job_id
                }
            }
            
            await self.redis_client.publish("events", json.dumps(event))
            logger.info("Chunk analysis completed", chunk_id=request.chunk_id)
            
        except Exception as e:
            logger.error("Chunk analysis failed", 
                        chunk_id=request.chunk_id, 
                        error=str(e))
            await self._publish_error_event("chunk.analysis_failed", request.chunk_id, str(e), correlation_id)

    async def _extract_chunk_features(self, request: ChunkAnalysisRequest) -> Dict[str, float]:
        """Extract scoring features from chunk data"""
        features = {
            "audio_energy": 0.0,
            "speech_activity": 0.0,
            "visual_activity": 0.0,
            "face_presence": 0.0,
            "emotion_intensity": 0.0,
            "scene_changes": 0.0
        }
        
        # Process transcription data
        if request.transcription_data:
            features.update(self._analyze_speech_features(request.transcription_data))
        
        # Process vision data
        if request.vision_data:
            features.update(self._analyze_visual_features(request.vision_data))
        
        return features

    def _analyze_speech_features(self, transcription_data: Dict) -> Dict[str, float]:
        """Analyze speech-based features"""
        features = {}
        
        if 'segments' in transcription_data:
            segments = transcription_data['segments']
            
            # Speech activity (percentage of time with speech)
            total_duration = sum(seg.get('end', 0) - seg.get('start', 0) for seg in segments)
            features['speech_activity'] = min(total_duration / 30.0, 1.0)  # Normalize to 30s chunks
            
            # Average confidence as proxy for clarity
            confidences = [seg.get('confidence', 0.0) for seg in segments if 'confidence' in seg]
            features['speech_confidence'] = np.mean(confidences) if confidences else 0.0
            
            # Word density (words per second)
            word_count = sum(len(seg.get('text', '').split()) for seg in segments)
            features['word_density'] = word_count / max(total_duration, 1.0)
            
            # Excitement indicators (caps, exclamation marks)
            text = ' '.join(seg.get('text', '') for seg in segments)
            caps_ratio = sum(1 for c in text if c.isupper()) / max(len(text), 1)
            exclamation_count = text.count('!')
            features['excitement_score'] = min((caps_ratio * 2 + exclamation_count * 0.1), 1.0)
        
        return features

    def _analyze_visual_features(self, vision_data: Dict) -> Dict[str, float]:
        """Analyze vision-based features"""
        features = {}
        
        # Scene changes
        if 'scene_cuts' in vision_data:
            features['scene_changes'] = min(len(vision_data['scene_cuts']) / 5.0, 1.0)  # Normalize
        
        # Face presence
        if 'faces' in vision_data:
            faces = vision_data['faces']
            if faces:
                # Average face confidence
                face_confidences = [face.get('confidence', 0.0) for face in faces]
                features['face_presence'] = np.mean(face_confidences)
                
                # Face size (larger faces = more prominent)
                face_sizes = [face.get('bbox', {}).get('area', 0.0) for face in faces]
                features['face_prominence'] = np.mean(face_sizes) if face_sizes else 0.0
        
        # Motion intensity
        if 'motion_intensity' in vision_data:
            features['visual_activity'] = min(vision_data['motion_intensity'] / 100.0, 1.0)
        
        # Emotion detection
        if 'emotions' in vision_data:
            emotions = vision_data['emotions']
            if emotions:
                # High-energy emotions (excitement, surprise, anger)
                high_energy_emotions = ['happy', 'surprise', 'angry', 'fear']
                emotion_scores = [
                    emotions.get(emotion, 0.0) 
                    for emotion in high_energy_emotions
                ]
                features['emotion_intensity'] = np.mean(emotion_scores)
        
        return features

    async def _process_highlight_scoring(self, request: HighlightScoringRequest, correlation_id: str):
        """Process highlight scoring for entire stream"""
        try:
            # Get all chunk features for stream
            chunk_features = await self._get_stream_chunk_features(request.stream_id)
            
            if not chunk_features:
                raise ValueError(f"No chunk features found for stream {request.stream_id}")
            
            # Calculate highlight scores
            highlight_scores = self._calculate_highlight_scores(chunk_features)
            
            # Apply temporal analysis
            smoothed_scores = self._apply_temporal_smoothing(highlight_scores)
            
            # Store scores
            scores_key = f"highlight_scores:{request.stream_id}"
            await self.redis_client.hset(scores_key, mapping={
                chunk_id: str(score) for chunk_id, score in smoothed_scores.items()
            })
            await self.redis_client.expire(scores_key, config['redis']['result_ttl'])
            
            # Publish highlights scored event
            event = {
                "eventId": str(uuid.uuid4()),
                "eventType": "highlights.scored",
                "timestamp": datetime.utcnow().isoformat(),
                "version": "1.0",
                "source": "scoring_svc",
                "correlationId": correlation_id,
                "data": {
                    "streamId": request.stream_id,
                    "totalChunks": len(smoothed_scores),
                    "averageScore": np.mean(list(smoothed_scores.values())),
                    "maxScore": max(smoothed_scores.values()) if smoothed_scores else 0.0,
                    "jobId": request.job_id
                }
            }
            
            await self.redis_client.publish("events", json.dumps(event))
            logger.info("Highlight scoring completed", stream_id=request.stream_id)
            
        except Exception as e:
            logger.error("Highlight scoring failed", 
                        stream_id=request.stream_id, 
                        error=str(e))
            await self._publish_error_event("highlights.scoring_failed", request.stream_id, str(e), correlation_id)

    async def _get_stream_chunk_features(self, stream_id: str) -> Dict[str, Dict[str, float]]:
        """Get all chunk features for a stream"""
        chunk_features = {}
        
        # Get chunk IDs for stream (this would typically come from orchestrator)
        # For now, scan for chunk feature keys
        pattern = f"chunk_features:*"
        keys = await self.redis_client.keys(pattern)
        
        for key in keys:
            chunk_id = key.split(':')[1]
            features = await self.redis_client.hgetall(key)
            
            # Convert string values back to float
            chunk_features[chunk_id] = {
                k: float(v) for k, v in features.items()
            }
        
        return chunk_features

    def _calculate_highlight_scores(self, chunk_features: Dict[str, Dict[str, float]]) -> Dict[str, float]:
        """Calculate highlight scores using weighted feature fusion"""
        scores = {}
        weights = config['scoring']['weights']
        
        for chunk_id, features in chunk_features.items():
            # Base feature scores
            audio_score = features.get('audio_energy', 0.0) * weights['audio_energy']
            speech_score = features.get('speech_activity', 0.0) * weights['speech_activity']
            visual_score = features.get('visual_activity', 0.0) * weights['visual_activity']
            face_score = features.get('face_presence', 0.0) * weights['face_presence']
            
            # Bonus features
            emotion_bonus = features.get('emotion_intensity', 0.0) * weights.get('emotion_intensity', 0.1)
            excitement_bonus = features.get('excitement_score', 0.0) * weights.get('excitement_score', 0.1)
            scene_bonus = features.get('scene_changes', 0.0) * weights.get('scene_changes', 0.05)
            
            # Combined score
            base_score = audio_score + speech_score + visual_score + face_score
            bonus_score = emotion_bonus + excitement_bonus + scene_bonus
            
            final_score = min(base_score + bonus_score, 1.0)
            scores[chunk_id] = final_score
        
        return scores

    def _apply_temporal_smoothing(self, scores: Dict[str, float]) -> Dict[str, float]:
        """Apply temporal smoothing to highlight scores"""
        if not scores:
            return scores
        
        # Convert to sorted list by chunk ID (assuming chronological order)
        sorted_items = sorted(scores.items())
        chunk_ids = [item[0] for item in sorted_items]
        score_values = [item[1] for item in sorted_items]
        
        # Apply moving average smoothing
        window_size = config['scoring']['temporal_analysis']['smoothing_window']
        smoothed_values = []
        
        for i in range(len(score_values)):
            start_idx = max(0, i - window_size // 2)
            end_idx = min(len(score_values), i + window_size // 2 + 1)
            window_scores = score_values[start_idx:end_idx]
            smoothed_values.append(np.mean(window_scores))
        
        return dict(zip(chunk_ids, smoothed_values))

    async def _process_clip_generation(self, request: ClipGenerationRequest, correlation_id: str):
        """Process clip generation from scored highlights"""
        try:
            # Get highlight scores
            scores_key = f"highlight_scores:{request.stream_id}"
            score_data = await self.redis_client.hgetall(scores_key)
            
            if not score_data:
                raise ValueError(f"No highlight scores found for stream {request.stream_id}")
            
            # Convert scores and sort
            scores = {k: float(v) for k, v in score_data.items()}
            
            # Generate clips
            clips = self._generate_clips_from_scores(
                scores, 
                request.max_clips or config['clip_generation']['max_clips_per_stream'],
                request.min_score_threshold or config['clip_generation']['min_score_threshold']
            )
            
            # Store clip candidates
            for i, clip in enumerate(clips):
                clip_id = f"{request.stream_id}_clip_{i+1}"
                clip_key = f"clip_candidate:{clip_id}"
                
                clip_data = {
                    "clip_id": clip_id,
                    "stream_id": request.stream_id,
                    "start_chunk": clip['start_chunk'],
                    "end_chunk": clip['end_chunk'],
                    "score": str(clip['score']),
                    "duration": str(clip['duration']),
                    "created_at": datetime.utcnow().isoformat()
                }
                
                await self.redis_client.hset(clip_key, mapping=clip_data)
                await self.redis_client.expire(clip_key, config['redis']['result_ttl'])
            
            # Publish clip generation event
            event = {
                "eventId": str(uuid.uuid4()),
                "eventType": "clip.generated",
                "timestamp": datetime.utcnow().isoformat(),
                "version": "1.0",
                "source": "scoring_svc",
                "correlationId": correlation_id,
                "data": {
                    "streamId": request.stream_id,
                    "clipsGenerated": len(clips),
                    "clips": [
                        {
                            "clipId": f"{request.stream_id}_clip_{i+1}",
                            "score": clip['score'],
                            "duration": clip['duration']
                        }
                        for i, clip in enumerate(clips)
                    ],
                    "jobId": request.job_id
                }
            }
            
            await self.redis_client.publish("events", json.dumps(event))
            logger.info("Clip generation completed", 
                       stream_id=request.stream_id, 
                       clips_generated=len(clips))
            
        except Exception as e:
            logger.error("Clip generation failed", 
                        stream_id=request.stream_id, 
                        error=str(e))
            await self._publish_error_event("clip.generation_failed", request.stream_id, str(e), correlation_id)

    def _generate_clips_from_scores(self, scores: Dict[str, float], max_clips: int, min_threshold: float) -> List[Dict]:
        """Generate clip candidates from highlight scores"""
        # Filter scores above threshold
        filtered_scores = {k: v for k, v in scores.items() if v >= min_threshold}
        
        if not filtered_scores:
            return []
        
        # Sort by score descending
        sorted_scores = sorted(filtered_scores.items(), key=lambda x: x[1], reverse=True)
        
        clips = []
        used_chunks = set()
        
        clip_config = config['clip_generation']
        min_duration = clip_config['min_duration_seconds']
        max_duration = clip_config['max_duration_seconds']
        
        for chunk_id, score in sorted_scores:
            if len(clips) >= max_clips:
                break
                
            if chunk_id in used_chunks:
                continue
            
            # Create clip around this high-scoring chunk
            clip = self._create_clip_around_chunk(
                chunk_id, score, scores, min_duration, max_duration
            )
            
            if clip:
                clips.append(clip)
                # Mark chunks as used
                for chunk in clip['chunks']:
                    used_chunks.add(chunk)
        
        return clips

    def _create_clip_around_chunk(self, center_chunk: str, score: float, all_scores: Dict[str, float], 
                                 min_duration: int, max_duration: int) -> Optional[Dict]:
        """Create a clip centered around a high-scoring chunk"""
        # For simplicity, assume chunk IDs are sortable and represent chronological order
        sorted_chunks = sorted(all_scores.keys())
        
        try:
            center_idx = sorted_chunks.index(center_chunk)
        except ValueError:
            return None
        
        # Start with just the center chunk (assume 30s chunks)
        chunk_duration = 30  # seconds
        current_duration = chunk_duration
        start_idx = center_idx
        end_idx = center_idx
        
        # Expand clip while under max duration and scores are decent
        expansion_threshold = score * 0.7  # Require 70% of center score
        
        # Expand backwards
        while (start_idx > 0 and 
               current_duration + chunk_duration <= max_duration and
               all_scores.get(sorted_chunks[start_idx - 1], 0) >= expansion_threshold):
            start_idx -= 1
            current_duration += chunk_duration
        
        # Expand forwards
        while (end_idx < len(sorted_chunks) - 1 and 
               current_duration + chunk_duration <= max_duration and
               all_scores.get(sorted_chunks[end_idx + 1], 0) >= expansion_threshold):
            end_idx += 1
            current_duration += chunk_duration
        
        # Ensure minimum duration
        while current_duration < min_duration and (start_idx > 0 or end_idx < len(sorted_chunks) - 1):
            if start_idx > 0:
                start_idx -= 1
                current_duration += chunk_duration
            elif end_idx < len(sorted_chunks) - 1:
                end_idx += 1
                current_duration += chunk_duration
            else:
                break
        
        if current_duration < min_duration:
            return None
        
        return {
            "start_chunk": sorted_chunks[start_idx],
            "end_chunk": sorted_chunks[end_idx],
            "chunks": sorted_chunks[start_idx:end_idx + 1],
            "score": score,
            "duration": current_duration
        }

    async def _publish_error_event(self, event_type: str, resource_id: str, error: str, correlation_id: str):
        """Publish error event to Redis"""
        event = {
            "eventId": str(uuid.uuid4()),
            "eventType": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0",
            "source": "scoring_svc",
            "correlationId": correlation_id,
            "data": {
                "resourceId": resource_id,
                "error": error
            }
        }
        
        await self.redis_client.publish("events", json.dumps(event))

# Create service instance
service = ScoringService()
app = service.app

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8004))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_config=None  # Use structlog instead
    )