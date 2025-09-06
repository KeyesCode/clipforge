# ClipForge Publisher Service - Testing Guide

## Overview
The Publisher Service handles uploading and publishing rendered clips to various social media platforms (YouTube, X/Twitter, TikTok, etc.).

## Service Information
- **Port**: 3002
- **Health Check**: `GET /health`
- **Purpose**: Publish clips to social media platforms
- **Dependencies**: Redis, Bull Queue, Platform APIs

## Quick Health Check
```bash
curl http://localhost:3002/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "publisher",
  "timestamp": "2025-09-05T23:xx:xx.xxxZ",
  "uptime": 3600.45
}
```

## API Endpoints

### 1. Queue Clip for Publishing
```bash
curl -X POST http://localhost:3002/publish \
  -H "Content-Type: application/json" \
  -d '{
    "clipId": "clip-123",
    "platform": "youtube",
    "videoPath": "/app/data/rendered/clip-123.mp4",
    "thumbnailPath": "/app/data/thumbnails/clip-123.jpg",
    "title": "INSANE Gaming Moment! 🔥",
    "description": "You wont believe what happens in this clip! #gaming #epic",
    "tags": ["gaming", "highlight", "epic", "moments"],
    "metadata": {
      "streamerName": "ProGamer123",
      "gameTitle": "Valorant",
      "originalStreamDate": "2025-09-05"
    }
  }'
```

### 2. Check Queue Statistics
```bash
curl http://localhost:3002/stats
```

Expected response:
```json
{
  "waiting": 3,
  "active": 1,
  "completed": 15,
  "failed": 2,
  "total": 21
}
```

### 3. Get Publishing Status (via Orchestrator)
```bash
curl http://localhost:3001/api/clips/clip-123/publish-status
```

## Platform-Specific Testing

### Test 1: YouTube Shorts Publishing
```bash
curl -X POST http://localhost:3002/publish \
  -H "Content-Type: application/json" \
  -d '{
    "clipId": "youtube-short-001",
    "platform": "youtube",
    "videoPath": "/app/data/rendered/vertical-clip.mp4",
    "thumbnailPath": "/app/data/thumbnails/epic-moment.jpg",
    "title": "CLUTCH 1v5 ACE! 🎯 #Shorts",
    "description": "Incredible 1v5 clutch in ranked! Drop a 🔥 if this was insane!\n\n#gaming #valorant #clutch #ace #shorts #highlight #epic",
    "tags": ["gaming", "valorant", "clutch", "ace", "highlights", "shorts", "epic", "insane"],
    "metadata": {
      "category": "Gaming",
      "privacy": "public",
      "madeForKids": false,
      "shorts": true,
      "streamerName": "ProGamer123",
      "gameTitle": "Valorant"
    }
  }'
```

Expected processing flow:
1. Job queued successfully
2. YouTube API authentication 
3. Video upload with metadata
4. Thumbnail upload
5. Publish status update to orchestrator
6. Job completion

### Test 2: X (Twitter) Video Publishing
```bash
curl -X POST http://localhost:3002/publish \
  -H "Content-Type: application/json" \
  -d '{
    "clipId": "twitter-clip-001", 
    "platform": "x",
    "videoPath": "/app/data/rendered/highlight-16x9.mp4",
    "title": "When the squad clutches in overtime 🔥 #gaming #clutch #teamwork",
    "metadata": {
      "streamerHandle": "@ProGamer123",
      "gameTitle": "Valorant",
      "tags": ["gaming", "clutch", "teamwork", "valorant"]
    }
  }'
```

### Test 3: Batch Publishing (Multiple Platforms)
```bash
# Publish same clip to multiple platforms
curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "multi-platform-001",
    "platform": "youtube",
    "videoPath": "/app/data/rendered/epic-moment-9x16.mp4",
    "title": "EPIC Gaming Moment! 🎮",
    "description": "...",
    "tags": [...]
  }'

curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "multi-platform-001-twitter",
    "platform": "x", 
    "videoPath": "/app/data/rendered/epic-moment-16x9.mp4",
    "title": "EPIC Gaming Moment! 🎮 #gaming",
    "metadata": {...}
  }'
```

## Authentication Testing

### Test YouTube API Credentials
```bash
# Test with valid credentials (requires actual API keys)
curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "auth-test-youtube",
    "platform": "youtube",
    "videoPath": "/app/test-data/test-video.mp4",
    "title": "Test Upload"
  }'

# Should succeed and return job ID
```

### Test Invalid/Missing Credentials
```bash
# Test without API credentials configured
# (Temporarily rename .env variables to simulate missing creds)

curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "auth-fail-test",
    "platform": "youtube", 
    "videoPath": "/app/test-data/test-video.mp4"
  }'

# Should fail with authentication error
```

## Queue Management Testing

### Test Queue Processing
```bash
# Add multiple jobs to test queue processing
for i in {1..5}; do
  curl -X POST http://localhost:3002/publish \
    -d '{
      "clipId": "queue-test-'$i'",
      "platform": "youtube",
      "videoPath": "/app/test-data/test-clip-'$i'.mp4",
      "title": "Queue Test '$i'"
    }'
done

# Monitor queue stats
watch -n 2 "curl -s http://localhost:3002/stats"
```

### Test Queue Priorities
```bash
# Add high priority YouTube job
curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "priority-high", 
    "platform": "youtube",
    "videoPath": "/app/test-data/important-clip.mp4",
    "title": "High Priority Clip"
  }'

# Add lower priority X job  
curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "priority-low",
    "platform": "x",
    "videoPath": "/app/test-data/normal-clip.mp4", 
    "title": "Normal Priority Clip"
  }'

# YouTube jobs should process first due to higher priority
```

## Error Handling Testing

### Test File Not Found
```bash
curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "error-no-file",
    "platform": "youtube",
    "videoPath": "/app/data/rendered/does-not-exist.mp4",
    "title": "Missing File Test"
  }'

# Should fail with file not found error
```

### Test Invalid Video Format
```bash
curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "error-bad-format",
    "platform": "youtube",
    "videoPath": "/app/test-data/corrupted-video.mp4",
    "title": "Corrupted File Test"
  }'

# Should fail during upload with format error
```

### Test Platform-Specific Errors
```bash
# Test video too long for YouTube Shorts
curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "error-too-long",
    "platform": "youtube", 
    "videoPath": "/app/test-data/5-minute-video.mp4",
    "title": "Too Long For Shorts"
  }'

# Test video too large for X
curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "error-too-large",
    "platform": "x",
    "videoPath": "/app/test-data/large-video.mp4", 
    "title": "Large File Test"
  }'
```

## Integration Testing

### Test Orchestrator Integration
```bash
# Create and process a full clip through orchestrator
# 1. Create a clip
curl -X POST http://localhost:3001/api/clips \
  -d '{
    "streamId": "stream-123",
    "chunkId": "chunk-456", 
    "title": "Integration Test Clip",
    "startTime": 10,
    "duration": 30
  }'

# 2. Render the clip
curl -X POST http://localhost:3001/api/clips/{clip-id}/render

# 3. Publish the clip
curl -X POST http://localhost:3001/api/clips/{clip-id}/publish \
  -d '{
    "platforms": ["youtube", "x"],
    "title": "Integration Test",
    "description": "Testing full pipeline"
  }'

# 4. Check status updates
curl http://localhost:3001/api/clips/{clip-id}
```

### Test Redis Queue Integration
```bash
# Connect to Redis and monitor publisher queues
redis-cli -h localhost -p 6379 -a redis_secure_password_2024

# Check publisher queue
> KEYS *publish*
> LLEN bull:publish:wait
> LRANGE bull:publish:active 0 -1
```

## Performance Testing

### Test Upload Speed
```bash
# Test upload time for different file sizes
# Small file (5MB)
time curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "perf-small",
    "platform": "youtube",
    "videoPath": "/app/test-data/small-5mb.mp4"
  }'

# Medium file (25MB)  
time curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "perf-medium",
    "platform": "youtube", 
    "videoPath": "/app/test-data/medium-25mb.mp4"
  }'

# Large file (100MB)
time curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "perf-large",
    "platform": "youtube",
    "videoPath": "/app/test-data/large-100mb.mp4"
  }'
```

### Test Concurrent Publishing
```bash
# Start multiple publish jobs simultaneously
for i in {1..10}; do
  curl -X POST http://localhost:3002/publish \
    -d '{
      "clipId": "concurrent-'$i'",
      "platform": "youtube", 
      "videoPath": "/app/test-data/test-'$i'.mp4",
      "title": "Concurrent Test '$i'"
    }' &
done

# Monitor queue processing
watch "curl -s http://localhost:3002/stats"
```

## Monitoring and Logging

### Check Service Logs
```bash
# View publisher service logs
docker logs -f clipforge_publisher

# Look for specific patterns:
docker logs clipforge_publisher | grep "Publishing completed"
docker logs clipforge_publisher | grep "ERROR"
docker logs clipforge_publisher | grep "YouTube upload"
```

### Monitor Queue Health
```bash
# Check for stuck jobs
redis-cli -h localhost -p 6379 -a redis_secure_password_2024
> LLEN bull:publish:active
> LLEN bull:publish:stalled

# Check failed jobs
> ZRANGE bull:publish:failed 0 -1
```

## Configuration Testing

### Test Different Platform Configs
```bash
# Test YouTube with different privacy settings
curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "privacy-private",
    "platform": "youtube",
    "videoPath": "/app/test-data/test.mp4",
    "metadata": {"privacy": "private"}
  }'

curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "privacy-unlisted", 
    "platform": "youtube",
    "videoPath": "/app/test-data/test.mp4",
    "metadata": {"privacy": "unlisted"}
  }'
```

### Test Retry Configuration
```bash
# Test job retry on failure
# (Temporarily disable internet or API access)
curl -X POST http://localhost:3002/publish \
  -d '{
    "clipId": "retry-test",
    "platform": "youtube",
    "videoPath": "/app/test-data/test.mp4"
  }'

# Should retry 3 times with exponential backoff
```

## Expected Results

### Successful Publishing
```json
{
  "success": true,
  "platformId": "dQw4w9WgXcQ",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

### Performance Benchmarks
- **15MB video to YouTube**: 30-60 seconds
- **50MB video to YouTube**: 2-5 minutes  
- **5MB video to X**: 15-30 seconds
- **Queue processing rate**: 5-10 jobs per minute

### Error Responses
```json
{
  "success": false,
  "error": "YouTube API quota exceeded",
  "retryAfter": "2025-09-06T00:00:00.000Z"
}
```

## Quality Assurance

### Verify Published Content
After successful publishing, manually verify:

1. **YouTube**:
   - Video uploaded correctly
   - Title and description accurate
   - Tags applied
   - Thumbnail uploaded
   - Privacy settings correct

2. **X (Twitter)**:
   - Video posted with correct text
   - Hashtags included
   - Video quality acceptable

3. **Platform Compliance**:
   - Video meets platform requirements
   - No copyright issues
   - Appropriate content ratings

## Troubleshooting

### Common Issues
1. **API quota exceeded**: Wait for quota reset or upgrade plan
2. **Video format rejected**: Check platform-specific requirements
3. **Authentication failures**: Verify API credentials and scopes
4. **Upload timeouts**: Check network connection and file size
5. **Queue stuck**: Restart publisher service or clear Redis queue

### Debug Commands
```bash
# Test API credentials manually
curl -H "Authorization: Bearer $YOUTUBE_ACCESS_TOKEN" \
  https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true

# Check video file properties
ffprobe -v quiet -print_format json -show_format \
  /app/data/rendered/clip-123.mp4

# Clear stuck queue
redis-cli -h localhost -p 6379 -a redis_secure_password_2024
> DEL bull:publish:active
> DEL bull:publish:wait

# Restart publisher service
docker restart clipforge_publisher
```

### Health Monitoring
```bash
# Set up monitoring alerts for:
# - Queue depth > 50 jobs
# - Failed job rate > 10%
# - Average processing time > 5 minutes
# - Service uptime < 99%

# Example monitoring script
#!/bin/bash
STATS=$(curl -s http://localhost:3002/stats)
WAITING=$(echo $STATS | jq '.waiting')
FAILED=$(echo $STATS | jq '.failed') 
TOTAL=$(echo $STATS | jq '.total')

if [ $WAITING -gt 50 ]; then
  echo "ALERT: Publisher queue depth high: $WAITING"
fi

if [ $TOTAL -gt 0 ]; then
  FAIL_RATE=$(echo "scale=2; $FAILED * 100 / $TOTAL" | bc)
  if (( $(echo "$FAIL_RATE > 10" | bc -l) )); then
    echo "ALERT: High failure rate: $FAIL_RATE%"
  fi
fi
```