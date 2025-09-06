# ClipForge Orchestrator Service - Testing Guide

## Overview
The Orchestrator is the main API gateway and workflow coordinator for ClipForge. It manages streams, clips, chunks, and coordinates with all microservices.

## Service Information
- **Port**: 3001
- **Health Check**: `GET /health`
- **API Documentation**: `GET /api/docs` (Swagger UI)
- **Database**: PostgreSQL
- **Queue**: Redis + Bull

## Quick Health Check
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-09-05T23:xx:xx.xxxZ",
  "database": "connected",
  "redis": "connected"
}
```

## API Endpoints to Test

### 1. Streamers Management
```bash
# Get all streamers
curl http://localhost:3001/api/streamers

# Create a new streamer
curl -X POST http://localhost:3001/api/streamers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TestStreamer",
    "platform": "twitch",
    "channelUrl": "https://twitch.tv/teststreamer"
  }'

# Get specific streamer
curl http://localhost:3001/api/streamers/{streamer-id}
```

### 2. Streams Management
```bash
# Get all streams
curl http://localhost:3001/api/streams

# Create a new stream
curl -X POST http://localhost:3001/api/streams \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Stream",
    "streamerId": "{streamer-id}",
    "vodUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "platform": "youtube"
  }'

# Get specific stream
curl http://localhost:3001/api/streams/{stream-id}

# Ingest a stream (starts processing)
curl -X POST http://localhost:3001/api/streams/{stream-id}/ingest

# Process a stream (starts analysis)
curl -X POST http://localhost:3001/api/streams/{stream-id}/process
```

### 3. Chunks Management
```bash
# Get chunks for a stream
curl http://localhost:3001/api/chunks/stream/{stream-id}

# Get all chunks
curl http://localhost:3001/api/chunks

# Get highlights (high-scored chunks)
curl http://localhost:3001/api/chunks/highlights

# Process a specific chunk
curl -X POST http://localhost:3001/api/chunks/{chunk-id}/process
```

### 4. Clips Management
```bash
# Get all clips
curl http://localhost:3001/api/clips

# Get clips for a stream
curl http://localhost:3001/api/clips/stream/{stream-id}

# Get pending review clips
curl http://localhost:3001/api/clips/pending-review

# Get clip statistics
curl http://localhost:3001/api/clips/stats

# Review a clip (approve/reject)
curl -X POST http://localhost:3001/api/clips/{clip-id}/review \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "feedback": "Great highlight!"
  }'

# Render a clip
curl -X POST http://localhost:3001/api/clips/{clip-id}/render

# Publish a clip
curl -X POST http://localhost:3001/api/clips/{clip-id}/publish \
  -H "Content-Type: application/json" \
  -d '{
    "platforms": ["youtube", "x"],
    "title": "Epic Gaming Moment",
    "description": "Amazing clip from the stream!"
  }'
```

## Testing Workflow

### Complete Stream Processing Flow
1. **Create Streamer**:
   ```bash
   curl -X POST http://localhost:3001/api/streamers \
     -H "Content-Type: application/json" \
     -d '{
       "name": "TestGamer",
       "platform": "youtube",
       "channelUrl": "https://youtube.com/@testgamer"
     }'
   ```

2. **Create Stream**:
   ```bash
   curl -X POST http://localhost:3001/api/streams \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Epic Gaming Session",
       "streamerId": "{streamer-id-from-step-1}",
       "vodUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
     }'
   ```

3. **Start Ingestion**:
   ```bash
   curl -X POST http://localhost:3001/api/streams/{stream-id}/ingest
   ```

4. **Monitor Progress**:
   ```bash
   # Check stream status
   curl http://localhost:3001/api/streams/{stream-id}
   
   # Check for chunks
   curl http://localhost:3001/api/chunks/stream/{stream-id}
   ```

5. **Process Stream** (after ingestion):
   ```bash
   curl -X POST http://localhost:3001/api/streams/{stream-id}/process
   ```

6. **Check Generated Clips**:
   ```bash
   curl http://localhost:3001/api/clips/stream/{stream-id}
   ```

## Queue Management

### Check Queue Status
The orchestrator uses Bull queues. You can check queue status through Redis:

```bash
# Connect to Redis and check queue keys
redis-cli -h localhost -p 6379 -a redis_secure_password_2024
> KEYS *queue*
> LLEN ingest_queue
> LLEN process_queue
> LLEN render_queue
```

## Error Handling

### Common Error Responses
- **400 Bad Request**: Invalid input data
- **404 Not Found**: Resource doesn't exist
- **500 Internal Server Error**: Service or database issue

### Troubleshooting
1. **Service won't start**:
   - Check PostgreSQL connection
   - Check Redis connection
   - Verify environment variables

2. **Database errors**:
   - Ensure PostgreSQL is running
   - Check database credentials
   - Verify migrations have run

3. **Queue errors**:
   - Check Redis connection
   - Verify Redis authentication
   - Check queue job processing

## Environment Variables
```bash
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/clipforge
REDIS_URL=redis://:password@localhost:6379
JWT_SECRET=your-secret-key
```

## Expected Service Dependencies
- PostgreSQL (database)
- Redis (queues)
- All microservices should be running for full functionality

## WebSocket Testing
The orchestrator also provides WebSocket connections for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3001');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Real-time update:', data);
};
```