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

### 1. Ingest Stream/VOD
```bash
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "streamer_id": "test-streamer-123",
    "stream_title": "Test Video",
    "job_id": "test-job-123"
  }'
```

### 2. Get Stream Status
```bash
curl http://localhost:8001/status/test-stream-123
```

### 3. Cleanup Stream Files
```bash
curl -X DELETE http://localhost:8001/cleanup/test-stream-123
```

## Testing Scenarios

### Test 1: YouTube Video Ingest
```bash
# Start ingestion
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "streamer_id": "youtube-test-001",
    "stream_title": "Rick Astley - Never Gonna Give You Up",
    "job_id": "job-001"
  }'

# Check status
curl http://localhost:8001/status/youtube-test-001

# Expected response:
# {
#   "streamId": "youtube-test-001",
#   "downloadExists": true,
#   "chunksExist": true,
#   "chunkCount": 12
# }
```

### Test 2: Twitch VOD Ingest
```bash
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://www.twitch.tv/videos/123456789",
    "streamer_id": "twitch-test-001",
    "stream_title": "Epic Gaming Stream",
    "job_id": "job-002"
  }'
```

### Test 3: Direct Video URL
```bash
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://example.com/video.mp4",
    "streamer_id": "direct-test-001",
    "stream_title": "Direct Video Test",
    "job_id": "job-003"
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
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://invalid-url-that-does-not-exist.com/video.mp4",
    "streamer_id": "error-test-001",
    "stream_title": "Error Test",
    "job_id": "job-error-001"
  }'

# Should return error response
```

### Test Private Video
```bash
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://www.youtube.com/watch?v=private_video_id",
    "streamer_id": "private-test-001",
    "stream_title": "Private Video Test",
    "job_id": "job-private-001"
  }'

# Should fail with permission error
```

## Performance Testing

### Test Large Video
```bash
# Test with a longer video (be careful with bandwidth)
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://www.youtube.com/watch?v=long_video_id",
    "streamer_id": "large-test-001",
    "stream_title": "Large Video Test",
    "job_id": "job-large-001"
  }'
```

### Monitor Resource Usage
```bash
# Check disk space
df -h

# Check memory usage
docker stats clipforge_ingest

# Check processing time
time curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "streamer_id": "perf-test-001",
    "stream_title": "Performance Test",
    "job_id": "job-perf-001"
  }'
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
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "streamer_id": "custom-test-001",
    "stream_title": "Custom Settings Test",
    "job_id": "job-custom-001"
  }'
```

## Expected Output Structure

### Ingest Response
```json
{
  "message": "Ingestion started",
  "correlationId": "461b514a-65da-428c-952f-705c24c81175",
  "jobId": "test-job-123"
}
```

### Status Response
```json
{
  "streamId": "youtube-test-001",
  "downloadExists": true,
  "chunksExist": true,
  "chunkCount": 12
}
```

### Health Check Response
```json
{
  "status": "healthy",
  "service": "ingest_svc",
  "timestamp": "2025-09-06T00:21:07.904575+00:00",
  "redis_connected": true
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