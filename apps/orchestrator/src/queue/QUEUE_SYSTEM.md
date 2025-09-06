# Queue Management System

## Overview

The Queue Management System provides comprehensive queue monitoring and management capabilities for ClipForge's Redis Bull queues. It bridges the gap between the database-stored job records and the actual Redis queue operations.

## Architecture

### Components

1. **Queue Entity** (`queue.entity.ts`) - Database representation of queue metadata
2. **Queue Service** (`queue.service.ts`) - Business logic and Redis Bull integration
3. **Queue Controller** (`queue.controller.ts`) - REST API endpoints
4. **Queue Module** (`queue.module.ts`) - NestJS module configuration
5. **DTOs** - Data transfer objects for API requests/responses

### Queue Types

- `INGEST` - VOD download and chunking
- `TRANSCRIBE` - Speech recognition processing
- `VISION` - Scene detection and face recognition
- `SCORING` - ML-based highlight scoring
- `RENDER` - Video rendering and caption burning
- `PUBLISH` - Social media publishing
- `NOTIFICATION` - System notifications

### Queue Status

- `ACTIVE` - Queue is running normally
- `PAUSED` - Queue is paused (jobs won't be processed)
- `DRAINING` - Queue is finishing current jobs before stopping
- `ERROR` - Queue has encountered an error

## API Endpoints

### Queue Management

```bash
# Get all queues with filtering
GET /api/queues?type=INGEST&status=ACTIVE&limit=10&offset=0

# Get queue statistics
GET /api/queues/stats

# Get queue health status
GET /api/queues/health

# Get specific queue by ID
GET /api/queues/{id}

# Get specific queue by name
GET /api/queues/name/{name}

# Create new queue
POST /api/queues
{
  "name": "custom-queue",
  "type": "INGEST",
  "concurrency": 5,
  "config": {
    "maxRetries": 3,
    "removeOnComplete": 10,
    "backoff": {
      "type": "exponential",
      "delay": 2000
    }
  }
}

# Update queue configuration
PATCH /api/queues/{id}
{
  "concurrency": 10,
  "status": "PAUSED"
}

# Pause queue
POST /api/queues/{id}/pause

# Resume queue
POST /api/queues/{id}/resume

# Clear all jobs from queue
POST /api/queues/{id}/clear

# Delete queue
DELETE /api/queues/{id}
```

### Job Management

```bash
# Add job to queue
POST /api/queues/{id}/jobs
{
  "data": {
    "streamId": "uuid",
    "chunkId": "uuid"
  },
  "options": {
    "priority": 1,
    "delay": 5000
  }
}

# Get specific job
GET /api/queues/{id}/jobs/{jobId}

# Remove specific job
DELETE /api/queues/{id}/jobs/{jobId}
```

## Features

### Real-time Statistics

The system automatically syncs statistics from Redis Bull queues to the database:

- **Job Counts**: waiting, active, completed, failed, delayed, paused
- **Performance Metrics**: success rate, error rate, processing time
- **Health Indicators**: queue health, overload detection
- **Worker Information**: current worker assignments

### Queue Monitoring

- **Health Checks**: Monitor queue status and error conditions
- **Overload Detection**: Identify queues with excessive job backlogs
- **Performance Tracking**: Success rates, processing times, error rates
- **Real-time Updates**: Statistics are refreshed on each API call

### Queue Operations

- **Pause/Resume**: Control queue processing without losing jobs
- **Clear**: Remove all jobs from a queue
- **Configuration**: Update concurrency, retry settings, cleanup policies
- **Job Management**: Add, remove, and inspect individual jobs

### Integration with Existing Jobs System

The Queue system complements the existing Jobs system:

- **Jobs Entity**: Tracks individual job records and status
- **Queue Entity**: Tracks queue-level metadata and statistics
- **Bull Queues**: Actual Redis queue processing
- **Orchestrator**: Coordinates between all systems

## Usage Examples

### Monitor Queue Health

```typescript
// Get overall system health
const health = await fetch('/api/queues/health');
// Returns: { status: 'healthy', healthy: 5, total: 5, overloaded: 0, errors: 0 }

// Get detailed statistics
const stats = await fetch('/api/queues/stats');
// Returns comprehensive queue statistics
```

### Manage Queue Processing

```typescript
// Pause a queue for maintenance
await fetch('/api/queues/ingest-queue-id/pause', { method: 'POST' });

// Update concurrency for better performance
await fetch('/api/queues/ingest-queue-id', {
  method: 'PATCH',
  body: JSON.stringify({ concurrency: 10 })
});

// Resume processing
await fetch('/api/queues/ingest-queue-id/resume', { method: 'POST' });
```

### Add Jobs Programmatically

```typescript
// Add a transcription job
await fetch('/api/queues/transcribe-queue-id/jobs', {
  method: 'POST',
  body: JSON.stringify({
    data: {
      chunkId: 'chunk-uuid',
      streamId: 'stream-uuid',
      audioPath: '/path/to/audio.wav'
    },
    options: {
      priority: 1,
      attempts: 3
    }
  })
});
```

## Configuration

### Queue Defaults

```typescript
const defaultConfig = {
  concurrency: 1,
  maxRetries: 3,
  removeOnComplete: 10,
  removeOnFail: 50,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
};
```

### Environment Variables

The queue system uses the same Redis configuration as the main application:

```env
REDIS_HOST=redis
REDIS_PORT=6379
QUEUE_REDIS_DB=1
```

## Database Schema

### Queue Table

```sql
CREATE TABLE queues (
  id UUID PRIMARY KEY,
  name VARCHAR UNIQUE NOT NULL,
  type VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'active',
  concurrency INTEGER DEFAULT 1,
  waiting INTEGER DEFAULT 0,
  active INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  delayed INTEGER DEFAULT 0,
  paused INTEGER DEFAULT 0,
  config JSONB,
  metrics JSONB,
  description TEXT,
  worker_id VARCHAR,
  last_processed_at TIMESTAMP,
  last_error_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Error Handling

The system includes comprehensive error handling:

- **Queue Not Found**: 404 for non-existent queues
- **Invalid Operations**: 400 for operations not allowed in current state
- **Redis Connection**: Graceful handling of Redis connectivity issues
- **Job Management**: Proper error responses for job operations

## Monitoring and Alerting

### Health Indicators

- **Queue Status**: Active, Paused, Error states
- **Job Backlog**: Waiting job counts
- **Error Rates**: Failed job percentages
- **Processing Speed**: Jobs processed per minute

### Recommended Alerts

- Queue status changes to ERROR
- Job backlog exceeds 100 jobs
- Error rate exceeds 10%
- Queue has been paused for more than 1 hour
- No jobs processed in the last 30 minutes

## Integration with ClipForge Pipeline

The Queue system integrates seamlessly with the ClipForge processing pipeline:

1. **Ingest Queue**: Manages VOD download and chunking jobs
2. **Transcribe Queue**: Handles speech recognition processing
3. **Vision Queue**: Processes scene detection and face recognition
4. **Scoring Queue**: Manages ML-based highlight scoring
5. **Render Queue**: Handles video rendering and caption burning
6. **Publish Queue**: Manages social media publishing jobs
7. **Notification Queue**: Handles system notifications and alerts

Each queue can be monitored, configured, and managed independently while maintaining the overall system health and performance.
