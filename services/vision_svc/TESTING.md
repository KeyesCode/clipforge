# ClipForge Vision Service - Testing Guide

## Overview
The Vision Service handles scene detection, face recognition, and visual analysis of video chunks to identify highlight-worthy moments.

## Service Information
- **Port**: 8003
- **Health Check**: `GET /health`
- **Purpose**: Analyze video frames for scene changes and face detection
- **Dependencies**: Redis, OpenCV, MTCNN, torch

## Quick Health Check
```bash
curl http://localhost:8003/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-05T23:xx:xx.xxxZ",
  "service": "vision_svc",
  "models_loaded": {
    "mtcnn": true,
    "scene_detector": true
  },
  "device": "cpu"
}
```

## API Endpoints

### 1. Analyze Video Chunk
```bash
curl -X POST http://localhost:8003/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "chunk-123",
    "videoPath": "/path/to/video-chunk.mp4",
    "analysisType": "full"
  }'
```

### 2. Scene Detection Only
```bash
curl -X POST http://localhost:8003/detect-scenes \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "scene-test-001",
    "videoPath": "/path/to/video.mp4",
    "threshold": 30.0
  }'
```

### 3. Face Detection Only
```bash
curl -X POST http://localhost:8003/detect-faces \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "face-test-001",
    "videoPath": "/path/to/video.mp4",
    "minConfidence": 0.9
  }'
```

### 4. Get Analysis Result
```bash
curl http://localhost:8003/analysis/chunk-123
```

## Testing Scenarios

### Test 1: Scene Detection with Gaming Content
```bash
# Test with gaming footage that has clear scene transitions
curl -X POST http://localhost:8003/detect-scenes \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "gaming-scenes-001",
    "videoPath": "/app/test-data/gaming-montage.mp4",
    "threshold": 25.0,
    "options": {
      "minSceneDuration": 2.0,
      "adaptiveThreshold": true
    }
  }'
```

Expected response:
```json
{
  "chunkId": "gaming-scenes-001",
  "status": "completed",
  "scenes": [
    {
      "sceneId": 1,
      "startFrame": 0,
      "endFrame": 89,
      "startTime": 0.0,
      "endTime": 2.97,
      "confidence": 0.85,
      "type": "menu"
    },
    {
      "sceneId": 2,
      "startFrame": 90,
      "endFrame": 450,
      "startTime": 3.0,
      "endTime": 15.0,
      "confidence": 0.92,
      "type": "gameplay"
    }
  ],
  "totalScenes": 8,
  "avgSceneDuration": 12.5,
  "processing_time": 3.45
}
```

### Test 2: Face Detection in Streaming Content
```bash
# Test face detection with webcam footage
curl -X POST http://localhost:8003/detect-faces \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "streamer-faces-001",
    "videoPath": "/app/test-data/webcam-footage.mp4",
    "minConfidence": 0.85,
    "options": {
      "trackFaces": true,
      "faceRecognition": false,
      "extractEmotions": true
    }
  }'
```

Expected response:
```json
{
  "chunkId": "streamer-faces-001",
  "status": "completed",
  "faces": [
    {
      "faceId": "face_001",
      "detections": [
        {
          "frame": 30,
          "timestamp": 1.0,
          "bbox": [245, 180, 67, 67],
          "confidence": 0.95,
          "landmarks": {
            "left_eye": [260, 195],
            "right_eye": [290, 195],
            "nose": [275, 210],
            "mouth_left": [265, 225],
            "mouth_right": [285, 225]
          },
          "emotion": {
            "dominant": "happy",
            "confidence": 0.78,
            "all_emotions": {
              "happy": 0.78,
              "surprised": 0.12,
              "neutral": 0.08,
              "excited": 0.02
            }
          }
        }
      ],
      "totalDetections": 245,
      "avgConfidence": 0.91,
      "trackDuration": 8.17
    }
  ],
  "uniqueFaces": 1,
  "totalDetections": 245,
  "processing_time": 12.34
}
```

### Test 3: Full Analysis (Combined Scene + Face Detection)
```bash
curl -X POST http://localhost:8003/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "full-analysis-001",
    "videoPath": "/app/test-data/stream-highlight.mp4",
    "analysisType": "full",
    "options": {
      "sceneThreshold": 30.0,
      "faceConfidence": 0.85,
      "extractKeyframes": true,
      "detectObjects": false
    }
  }'
```

## Video Preparation for Testing

### Create Test Videos
```bash
# Extract a 30-second test clip
ffmpeg -i /path/to/long-video.mp4 -t 30 -c copy test-30sec.mp4

# Create test videos with different characteristics
# 1. High motion gaming footage
ffmpeg -i gaming-stream.mp4 -t 60 -vf "scale=1280:720" gaming-test.mp4

# 2. Webcam footage with face
ffmpeg -i webcam-stream.mp4 -t 45 -vf "scale=640:480" face-test.mp4

# 3. Scene transition heavy content
ffmpeg -i montage-video.mp4 -t 120 scene-test.mp4
```

### Test Different Video Formats
```bash
# MP4 (most common)
curl -X POST http://localhost:8003/analyze \
  -d '{"chunkId": "format-mp4", "videoPath": "/app/test-data/test.mp4"}'

# WebM
curl -X POST http://localhost:8003/analyze \
  -d '{"chunkId": "format-webm", "videoPath": "/app/test-data/test.webm"}'

# AVI
curl -X POST http://localhost:8003/analyze \
  -d '{"chunkId": "format-avi", "videoPath": "/app/test-data/test.avi"}'
```

## Performance Testing

### Benchmark Analysis Speed
```bash
# Test analysis speed with different video lengths
# 30 seconds
time curl -X POST http://localhost:8003/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "perf-30sec",
    "videoPath": "/app/test-data/30sec-video.mp4",
    "analysisType": "full"
  }'

# 5 minutes (typical chunk size)
time curl -X POST http://localhost:8003/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "perf-5min",
    "videoPath": "/app/test-data/5min-video.mp4",
    "analysisType": "full"
  }'
```

### Test Different Resolutions
```bash
# 4K resolution
curl -X POST http://localhost:8003/analyze \
  -d '{
    "chunkId": "res-4k",
    "videoPath": "/app/test-data/4k-video.mp4"
  }'

# 1080p
curl -X POST http://localhost:8003/analyze \
  -d '{
    "chunkId": "res-1080p", 
    "videoPath": "/app/test-data/1080p-video.mp4"
  }'

# 720p
curl -X POST http://localhost:8003/analyze \
  -d '{
    "chunkId": "res-720p",
    "videoPath": "/app/test-data/720p-video.mp4"
  }'
```

## Configuration Testing

### Test Scene Detection Parameters
```bash
# Very sensitive (more scenes)
curl -X POST http://localhost:8003/detect-scenes \
  -d '{
    "chunkId": "sensitive-scenes",
    "videoPath": "/app/test-data/test-video.mp4",
    "threshold": 15.0
  }'

# Less sensitive (fewer scenes)
curl -X POST http://localhost:8003/detect-scenes \
  -d '{
    "chunkId": "conservative-scenes", 
    "videoPath": "/app/test-data/test-video.mp4",
    "threshold": 45.0
  }'
```

### Test Face Detection Parameters
```bash
# High confidence (fewer false positives)
curl -X POST http://localhost:8003/detect-faces \
  -d '{
    "chunkId": "high-confidence-faces",
    "videoPath": "/app/test-data/webcam.mp4",
    "minConfidence": 0.95
  }'

# Lower confidence (more detections)
curl -X POST http://localhost:8003/detect-faces \
  -d '{
    "chunkId": "low-confidence-faces",
    "videoPath": "/app/test-data/webcam.mp4", 
    "minConfidence": 0.7
  }'
```

## Error Testing

### Test Invalid Video Files
```bash
# Non-existent file
curl -X POST http://localhost:8003/analyze \
  -d '{
    "chunkId": "error-nofile",
    "videoPath": "/app/test-data/does-not-exist.mp4"
  }'

# Corrupted video file
curl -X POST http://localhost:8003/analyze \
  -d '{
    "chunkId": "error-corrupt",
    "videoPath": "/app/test-data/corrupted.mp4"
  }'

# Empty video file
curl -X POST http://localhost:8003/analyze \
  -d '{
    "chunkId": "error-empty",
    "videoPath": "/app/test-data/empty.mp4"
  }'
```

### Test Invalid Parameters
```bash
# Invalid threshold
curl -X POST http://localhost:8003/detect-scenes \
  -d '{
    "chunkId": "invalid-threshold",
    "videoPath": "/app/test-data/test.mp4",
    "threshold": -5.0
  }'
```

## Redis Integration Testing

### Check Analysis Results Storage
```bash
# Connect to Redis and check stored results
redis-cli -h localhost -p 6379 -a redis_secure_password_2024

# Check vision analysis results
> KEYS vision:*
> GET vision:chunk-123

# Check scene detection results
> KEYS scenes:*
> GET scenes:chunk-123
```

## Resource Monitoring

### Monitor GPU/CPU Usage
```bash
# Monitor GPU usage (if available)
nvidia-smi -l 1

# Monitor CPU and memory
docker stats clipforge_vision

# Check processing logs
docker logs -f clipforge_vision
```

## Expected Results

### Quality Metrics
- **Scene Detection Accuracy**: >85% for clear scene transitions
- **Face Detection Recall**: >90% for frontal faces with good lighting
- **Processing Speed**: <0.5x real-time (30sec video processed in <15sec)
- **Memory Usage**: <2GB for 1080p video analysis

### Typical Gaming Content Results
- **Scenes per 5min chunk**: 8-15 scenes
- **Face detection in webcam overlay**: 90-95% frame coverage
- **Scene types detected**: menu, gameplay, cutscene, loading

## Troubleshooting

### Common Issues
1. **CUDA out of memory**: Reduce video resolution or batch size
2. **OpenCV errors**: Check video codec compatibility
3. **MTCNN model loading fails**: Verify model files are accessible
4. **Slow processing**: Check if GPU acceleration is working
5. **False face detections**: Increase confidence threshold

### Debug Commands
```bash
# Check OpenCV installation
python -c "import cv2; print(cv2.__version__)"

# Check torch and CUDA
python -c "import torch; print(torch.cuda.is_available())"

# Test video file directly
ffprobe /path/to/video.mp4

# Check service logs
docker logs clipforge_vision | grep ERROR
```

### Model Verification
```bash
# Test MTCNN face detection
curl -X POST http://localhost:8003/detect-faces \
  -d '{
    "chunkId": "model-test",
    "videoPath": "/app/test-data/single-face.mp4",
    "minConfidence": 0.9
  }'

# Verify scene detector
curl -X POST http://localhost:8003/detect-scenes \
  -d '{
    "chunkId": "scene-model-test",
    "videoPath": "/app/test-data/scene-transitions.mp4"
  }'
```