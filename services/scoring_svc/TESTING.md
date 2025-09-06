# ClipForge Scoring Service - Testing Guide

## Overview
The Scoring Service analyzes video chunks and their metadata (transcription, vision analysis) to calculate highlight scores that determine clip-worthiness.

## Service Information
- **Port**: 8004
- **Health Check**: `GET /health`
- **Purpose**: Score video chunks based on multiple analysis factors
- **Dependencies**: Redis, scikit-learn, numpy

## Quick Health Check
```bash
curl http://localhost:8004/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-05T23:xx:xx.xxxZ",
  "service": "scoring_svc",
  "models": {
    "highlight_scorer": "loaded",
    "engagement_predictor": "loaded"
  },
  "version": "1.0.0"
}
```

## API Endpoints

### 1. Score Video Chunk
```bash
curl -X POST http://localhost:8004/score \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "chunk-123",
    "chunkData": {
      "videoPath": "/path/to/chunk.mp4",
      "duration": 300,
      "transcription": {
        "text": "Oh my god, that was insane! Did you see that headshot?",
        "confidence": 0.95,
        "segments": [...],
        "emotions": ["excited", "surprised"]
      },
      "vision": {
        "scenes": [...],
        "faces": [...],
        "avgMotion": 0.75
      },
      "metadata": {
        "chunkIndex": 5,
        "streamDuration": 7200
      }
    }
  }'
```

### 2. Score Multiple Chunks (Batch)
```bash
curl -X POST http://localhost:8004/score-batch \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "stream-456",
    "chunks": [
      {
        "chunkId": "chunk-001",
        "chunkData": {...}
      },
      {
        "chunkId": "chunk-002", 
        "chunkData": {...}
      }
    ]
  }'
```

### 3. Get Scoring Result
```bash
curl http://localhost:8004/score/chunk-123
```

### 4. Get Stream Highlights
```bash
curl http://localhost:8004/highlights/stream-456?limit=10&minScore=0.7
```

## Testing Scenarios

### Test 1: High-Action Gaming Moment
```bash
curl -X POST http://localhost:8004/score \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "gaming-action-001",
    "chunkData": {
      "videoPath": "/app/test-data/epic-clutch.mp4",
      "duration": 45,
      "transcription": {
        "text": "NO WAY! THAT WAS ABSOLUTELY INSANE! I cannot believe I just pulled that off! Chat, did you see that?!",
        "confidence": 0.92,
        "segments": [
          {"start": 0.0, "end": 2.1, "text": "NO WAY! THAT WAS ABSOLUTELY INSANE!", "confidence": 0.95},
          {"start": 2.1, "end": 4.8, "text": "I cannot believe I just pulled that off!", "confidence": 0.89},
          {"start": 4.8, "end": 6.2, "text": "Chat, did you see that?!", "confidence": 0.94}
        ],
        "emotions": ["excited", "surprised", "triumphant"],
        "keywords": ["insane", "pulled off", "chat"],
        "exclamationCount": 4
      },
      "vision": {
        "scenes": [
          {"sceneId": 1, "startTime": 0.0, "endTime": 45.0, "confidence": 0.95, "type": "intense_gameplay"}
        ],
        "faces": [
          {"faceId": "streamer", "avgConfidence": 0.91, "dominantEmotion": "excited", "emotionIntensity": 0.88}
        ],
        "avgMotion": 0.85,
        "sceneTransitions": 0,
        "visualIntensity": 0.92
      },
      "audioFeatures": {
        "avgVolume": 0.78,
        "volumeSpikes": 3,
        "speechRate": 180,
        "pauseCount": 1
      },
      "metadata": {
        "chunkIndex": 12,
        "streamDuration": 7200,
        "gameTitle": "Valorant",
        "streamType": "competitive"
      }
    }
  }'
```

Expected high score response:
```json
{
  "chunkId": "gaming-action-001",
  "status": "completed",
  "score": {
    "overall": 0.92,
    "breakdown": {
      "transcription": 0.89,
      "vision": 0.88,
      "audio": 0.85,
      "engagement": 0.94,
      "context": 0.76
    },
    "factors": {
      "emotional_intensity": 0.91,
      "keyword_relevance": 0.87,
      "visual_activity": 0.85,
      "audience_engagement_indicators": 0.89,
      "surprise_factor": 0.93,
      "speech_excitement": 0.88
    },
    "highlights": [
      {
        "type": "reaction",
        "timeRange": [0.0, 2.1],
        "intensity": 0.95,
        "reason": "high_emotion_exclamation"
      },
      {
        "type": "achievement",
        "timeRange": [2.1, 4.8], 
        "intensity": 0.87,
        "reason": "accomplishment_statement"
      }
    ],
    "clipPotential": "very_high",
    "recommendedClipDuration": 15,
    "bestClipStart": 0.0
  },
  "processing_time": 0.45
}
```

### Test 2: Calm Commentary (Should Score Low)
```bash
curl -X POST http://localhost:8004/score \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "calm-commentary-001", 
    "chunkData": {
      "videoPath": "/app/test-data/calm-talk.mp4",
      "duration": 120,
      "transcription": {
        "text": "So we are going to work on building this base here. I think the best strategy is to place these blocks in a grid pattern. This should give us good coverage.",
        "confidence": 0.94,
        "segments": [...],
        "emotions": ["calm", "focused"],
        "keywords": ["strategy", "building", "coverage"],
        "exclamationCount": 0
      },
      "vision": {
        "scenes": [...],
        "faces": [...],
        "avgMotion": 0.25,
        "visualIntensity": 0.35
      },
      "audioFeatures": {
        "avgVolume": 0.45,
        "volumeSpikes": 0,
        "speechRate": 125,
        "pauseCount": 8
      }
    }
  }'
```

Expected low score response:
```json
{
  "chunkId": "calm-commentary-001",
  "score": {
    "overall": 0.31,
    "breakdown": {
      "transcription": 0.28,
      "vision": 0.25,
      "audio": 0.30,
      "engagement": 0.25,
      "context": 0.45
    },
    "clipPotential": "low",
    "recommendedClipDuration": 0,
    "reason": "insufficient_highlight_markers"
  }
}
```

### Test 3: Funny Moment with Chat Interaction
```bash
curl -X POST http://localhost:8004/score \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "funny-moment-001",
    "chunkData": {
      "transcription": {
        "text": "Wait, what?! Did I just... oh no, I think I accidentally deleted my entire base! Chat is going to roast me so hard for this one. HAHAHAHA this is actually hilarious!",
        "emotions": ["surprised", "embarrassed", "amused"],
        "keywords": ["accidentally", "deleted", "base", "chat", "roast", "hilarious"],
        "laughterDetected": true,
        "chatMentions": 2
      },
      "vision": {
        "faces": [
          {"dominantEmotion": "surprised", "emotionTransition": ["surprised", "embarrassed", "amused"]}
        ],
        "avgMotion": 0.65
      },
      "audioFeatures": {
        "laughterSegments": [{"start": 15.2, "end": 18.1, "intensity": 0.85}],
        "avgVolume": 0.72
      }
    }
  }'
```

## Scoring Algorithm Testing

### Test Different Content Types
```bash
# Achievement moments
curl -X POST http://localhost:8004/score \
  -d '{
    "chunkId": "achievement-test",
    "chunkData": {
      "transcription": {"keywords": ["victory", "won", "achieved", "unlocked"], "emotions": ["triumphant"]}
    }
  }'

# Fail moments
curl -X POST http://localhost:8004/score \
  -d '{
    "chunkId": "fail-test", 
    "chunkData": {
      "transcription": {"keywords": ["failed", "died", "nooo", "mistake"], "emotions": ["frustrated", "disappointed"]}
    }
  }'

# Skill displays
curl -X POST http://localhost:8004/score \
  -d '{
    "chunkId": "skill-test",
    "chunkData": {
      "transcription": {"keywords": ["perfect", "flawless", "headshot", "combo"], "emotions": ["confident"]}
    }
  }'
```

### Test Scoring Thresholds
```bash
# Get highlights with different score thresholds
curl "http://localhost:8004/highlights/stream-456?minScore=0.9"  # Only top moments
curl "http://localhost:8004/highlights/stream-456?minScore=0.7"  # Good moments
curl "http://localhost:8004/highlights/stream-456?minScore=0.5"  # Decent moments
```

## Batch Processing Testing

### Test Stream Processing
```bash
curl -X POST http://localhost:8004/score-batch \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "full-stream-001",
    "chunks": [
      {"chunkId": "chunk-001", "chunkData": {...}},
      {"chunkId": "chunk-002", "chunkData": {...}},
      {"chunkId": "chunk-003", "chunkData": {...}},
      {"chunkId": "chunk-004", "chunkData": {...}},
      {"chunkId": "chunk-005", "chunkData": {...}}
    ],
    "options": {
      "highlightThreshold": 0.7,
      "maxHighlights": 10,
      "diversityFactor": 0.3
    }
  }'
```

### Performance Testing
```bash
# Test batch scoring performance
time curl -X POST http://localhost:8004/score-batch \
  -d '{
    "streamId": "perf-test-001",
    "chunks": [/* 50 chunks */]
  }'
```

## Model Configuration Testing

### Test Scoring Weights
```bash
# Test with custom scoring weights
curl -X POST http://localhost:8004/score \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "custom-weights-test",
    "chunkData": {...},
    "scoringConfig": {
      "weights": {
        "transcription": 0.4,
        "vision": 0.3,
        "audio": 0.2, 
        "engagement": 0.1
      },
      "emotionMultiplier": 1.5,
      "keywordBoost": 1.2
    }
  }'
```

### Test Different Game Types
```bash
# FPS game
curl -X POST http://localhost:8004/score \
  -d '{
    "chunkData": {
      "metadata": {"gameType": "fps"},
      "transcription": {"keywords": ["headshot", "clutch", "ace"]}
    }
  }'

# Strategy game
curl -X POST http://localhost:8004/score \
  -d '{
    "chunkData": {
      "metadata": {"gameType": "strategy"},
      "transcription": {"keywords": ["victory", "strategy", "conquered"]}
    }
  }'
```

## Error Testing

### Invalid Input Testing
```bash
# Missing required fields
curl -X POST http://localhost:8004/score \
  -d '{"chunkId": "error-test-001"}'

# Invalid score threshold
curl "http://localhost:8004/highlights/stream-456?minScore=2.0"

# Malformed chunk data
curl -X POST http://localhost:8004/score \
  -d '{
    "chunkId": "malformed-test",
    "chunkData": {
      "transcription": "not an object"
    }
  }'
```

## Redis Integration Testing

### Check Scored Results
```bash
# Connect to Redis
redis-cli -h localhost -p 6379 -a redis_secure_password_2024

# Check scored chunks
> KEYS scores:*
> GET scores:chunk-123

# Check stream highlights
> KEYS highlights:*
> ZRANGE highlights:stream-456 0 -1 WITHSCORES
```

## Expected Results

### Score Ranges
- **0.0 - 0.3**: Low engagement, unlikely to be clipped
- **0.3 - 0.5**: Moderate content, possible clip with editing
- **0.5 - 0.7**: Good content, likely clip candidate
- **0.7 - 0.9**: High engagement, strong clip potential
- **0.9 - 1.0**: Exceptional moments, must-clip content

### Typical Gaming Stream Results
- **Highlights per hour**: 5-8 moments above 0.7 threshold
- **Average score distribution**: 80% below 0.5, 15% between 0.5-0.7, 5% above 0.7
- **Processing time**: <100ms per chunk for scoring

## Quality Metrics

### Algorithm Performance
- **Precision**: >85% for scores above 0.8
- **Recall**: >90% for obvious highlight moments
- **Processing Speed**: >100 chunks per second
- **Memory Usage**: <512MB for scoring service

### Content Type Recognition
- **Action moments**: 90%+ detection rate
- **Emotional peaks**: 85%+ detection rate  
- **Chat interactions**: 80%+ detection rate
- **Fails/funny moments**: 75%+ detection rate

## Troubleshooting

### Common Issues
1. **Low scores for obvious highlights**: Check scoring weights and thresholds
2. **High scores for boring content**: Review keyword lists and emotion detection
3. **Slow batch processing**: Check Redis connection and memory usage
4. **Inconsistent scoring**: Verify transcription and vision data quality

### Debug Commands
```bash
# Check scoring model status
curl http://localhost:8004/health

# Get detailed scoring breakdown
curl -X POST http://localhost:8004/score?debug=true \
  -d '{...}'

# Check service logs
docker logs clipforge_scoring | grep ERROR
```

### Model Tuning
```bash
# Test scoring accuracy with known highlights
curl -X POST http://localhost:8004/score \
  -d '{
    "chunkId": "known-highlight",
    "chunkData": {...},
    "expectedScore": 0.85
  }'
```