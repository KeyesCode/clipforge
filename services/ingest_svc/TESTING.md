# ClipForge Ingest Service - Testing Guide

## Overview
The Ingest Service downloads VODs from streaming platforms and chunks them into manageable segments for analysis.

## Service Information
- **Port**: 8001
- **Health Check**: `GET /health`
- **Purpose**: Download and chunk video content
- **Dependencies**: Redis, FFmpeg, yt-dlp

## Quick Health Check
```bash
curl http://localhost:8001/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-05T23:xx:xx.xxxZ",
  "service": "ingest_svc",
  "version": "1.0.0"
}
```

## API Endpoints

### 1. Download VOD
```bash
curl -X POST http://localhost:8001/download \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "test-stream-123",
    "vodUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "title": "Test Video",
    "platform": "youtube"
  }'
```

### 2. Chunk Video
```bash
curl -X POST http://localhost:8001/chunk \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "test-stream-123",
    "videoPath": "/path/to/video.mp4",
    "chunkDuration": 300
  }'
```

### 3. Get Download Status
```bash
curl http://localhost:8001/status/test-stream-123
```

### 4. List Available Downloads
```bash
curl http://localhost:8001/downloads
```

## Testing Scenarios

### Test 1: YouTube Video Download
```bash
# Start download
curl -X POST http://localhost:8001/download \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "youtube-test-001",
    "vodUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up",
    "platform": "youtube"
  }'

# Check status
curl http://localhost:8001/status/youtube-test-001

# Expected response:
# {
#   "streamId": "youtube-test-001",
#   "status": "downloading", // or "completed", "failed"
#   "progress": 45.2,
#   "downloadedBytes": 15728640,
#   "totalBytes": 34816000,
#   "error": null
# }
```

### Test 2: Twitch VOD Download
```bash
curl -X POST http://localhost:8001/download \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "twitch-test-001",
    "vodUrl": "https://www.twitch.tv/videos/123456789",
    "title": "Epic Gaming Stream",
    "platform": "twitch"
  }'
```

### Test 3: Direct Video URL
```bash
curl -X POST http://localhost:8001/download \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "direct-test-001",
    "vodUrl": "https://example.com/video.mp4",
    "title": "Direct Video Test",
    "platform": "direct"
  }'
```

## File System Testing

### Check Downloaded Files
```bash
# List downloaded videos (from inside container or local mount)
ls -la ./data/downloads/

# Check video info
ffprobe ./data/downloads/youtube-test-001/video.mp4

# Check chunks
ls -la ./data/chunks/youtube-test-001/
```

### Verify Chunk Quality
```bash
# Play a chunk (if you have media players)
ffplay ./data/chunks/youtube-test-001/chunk_000.mp4

# Get chunk information
ffprobe -v quiet -print_format json -show_format -show_streams \
  ./data/chunks/youtube-test-001/chunk_000.mp4
```

## Queue Integration Testing

### Check Redis Queue
```bash
# Connect to Redis
redis-cli -h localhost -p 6379 -a redis_secure_password_2024

# Check ingest queue
> LLEN ingest_queue
> LRANGE ingest_queue 0 -1

# Check for job completion events
> LLEN events
```

### Monitor Processing
```bash
# Watch logs for processing updates
docker logs -f clipforge_ingest

# Look for patterns like:
# - "Starting download for stream: youtube-test-001"
# - "Download completed: youtube-test-001"
# - "Chunking started for: youtube-test-001"
# - "Created 12 chunks for stream: youtube-test-001"
```

## Error Testing

### Test Invalid URL
```bash
curl -X POST http://localhost:8001/download \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "error-test-001",
    "vodUrl": "https://invalid-url-that-does-not-exist.com/video.mp4",
    "title": "Error Test",
    "platform": "youtube"
  }'

# Should return error response
```

### Test Private Video
```bash
curl -X POST http://localhost:8001/download \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "private-test-001",
    "vodUrl": "https://www.youtube.com/watch?v=private_video_id",
    "title": "Private Video Test",
    "platform": "youtube"
  }'

# Should fail with permission error
```

## Performance Testing

### Test Large Video
```bash
# Test with a longer video (be careful with bandwidth)
curl -X POST http://localhost:8001/download \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "large-test-001",
    "vodUrl": "https://www.youtube.com/watch?v=long_video_id",
    "title": "Large Video Test",
    "platform": "youtube"
  }'
```

### Monitor Resource Usage
```bash
# Check disk space
df -h

# Check memory usage
docker stats clipforge_ingest

# Check processing time
time curl -X POST http://localhost:8001/download \
  -H "Content-Type: application/json" \
  -d '{...}'
```

## Configuration Testing

### Environment Variables
```bash
# Test different chunk durations
export CHUNK_DURATION=180  # 3 minutes instead of 5
export MAX_RESOLUTION=720  # Lower resolution
export AUDIO_BITRATE=96k   # Lower audio quality

# Restart service and test
```

### Custom Settings
```bash
curl -X POST http://localhost:8001/download \
  -H "Content-Type: application/json" \
  -d '{
    "streamId": "custom-test-001",
    "vodUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "title": "Custom Settings Test",
    "platform": "youtube",
    "options": {
      "maxResolution": "480p",
      "audioBitrate": "128k",
      "chunkDuration": 240
    }
  }'
```

## Expected Output Structure

### Download Completion
```json
{
  "streamId": "youtube-test-001",
  "status": "completed",
  "downloadPath": "/app/storage/downloads/youtube-test-001/video.mp4",
  "chunks": [
    {
      "id": "chunk_000",
      "path": "/app/storage/chunks/youtube-test-001/chunk_000.mp4",
      "startTime": 0,
      "duration": 300,
      "size": 52428800
    }
  ],
  "totalChunks": 12,
  "totalDuration": 3542,
  "videoInfo": {
    "format": "mp4",
    "resolution": "1920x1080",
    "fps": 30,
    "bitrate": "1500k"
  }
}
```

## Troubleshooting

### Common Issues
1. **yt-dlp outdated**: Update with `pip install -U yt-dlp`
2. **FFmpeg not found**: Ensure FFmpeg is installed
3. **Permission errors**: Check file system permissions
4. **Network issues**: Check internet connectivity
5. **Storage full**: Check available disk space

### Debug Commands
```bash
# Test yt-dlp directly
yt-dlp --list-formats "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Test FFmpeg
ffmpeg -version

# Check service logs
docker logs clipforge_ingest | tail -50
```