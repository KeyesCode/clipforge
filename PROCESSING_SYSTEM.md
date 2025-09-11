# ClipForge Processing System Architecture

## Overview

ClipForge is a microservices-based AI video processing system that automatically extracts highlights from live streams and gaming videos. The system processes videos through multiple AI services to create engaging short-form clips optimized for social media platforms.

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js Web   │    │  NestJS         │    │   Docker        │
│   Frontend      │────│  Orchestrator   │────│   Services      │
│   (Port 3000)   │    │   (Port 3001)   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │   Database      │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   S3/LocalStack │
                    │   File Storage  │
                    └─────────────────┘
```

## Core Components

### 1. NestJS Orchestrator (Port 3001)

The central hub that coordinates all processing activities:

- **Queue Management**: Uses Bull queues for job processing
- **Database Management**: PostgreSQL with TypeORM entities
- **Microservice Communication**: HTTP calls + webhook responses
- **File Management**: S3/LocalStack integration

### 2. Python Microservices (Docker)

Four specialized AI processing services:

#### ASR Service (Port 8002)
- **Purpose**: Speech recognition and transcription
- **Input**: Audio/video files from S3
- **Output**: Transcribed text with timestamps
- **Technology**: Whisper AI model

#### Vision Service (Port 8003)  
- **Purpose**: Visual analysis and scene detection
- **Input**: Video files from S3
- **Output**: Face detection, scene changes, motion analysis
- **Technology**: Computer vision models

#### Scoring Service (Port 8004)
- **Purpose**: Highlight scoring and ranking
- **Input**: Combined transcription + vision data
- **Output**: Engagement scores for each chunk
- **Technology**: Multi-modal scoring algorithms

#### Render Service (Port 8005)
- **Purpose**: Video clip generation
- **Input**: Source video + highlight metadata
- **Output**: Rendered clips with captions
- **Technology**: FFmpeg video processing

### 3. Storage Layer

#### PostgreSQL Database
- **Streams**: Source video metadata
- **Chunks**: Video segments (30-60s each)
- **Clips**: Generated highlight clips
- **Jobs**: Processing task tracking

#### S3/LocalStack Storage
- **Source Videos**: Original uploaded content
- **Chunk Files**: Segmented video pieces
- **Rendered Clips**: Final processed highlights
- **Thumbnails**: Clip preview images

## Processing Pipeline

### 1. Upload & Ingestion
```
User Upload → Ingest Service → Video Segmentation → S3 Storage → Database Records
```

### 2. Unified Processing Pipeline (ProcessingQueueProcessor)

The system uses a **unified processing pipeline** that coordinates all AI services:

```mermaid
graph TD
    A[Stream Upload] --> B[Chunk Segmentation]
    B --> C[Queue: ASR Processing]
    C --> D[ASR Service: Transcription]
    D --> E[Queue: Vision Processing]
    E --> F[Vision Service: Analysis]
    F --> G[Queue: Scoring]
    G --> H[Scoring Service: Ranking]
    H --> I[Queue: Render Top Clips]
    I --> J[Render Service: Video Creation]
    J --> K[Completed Clips]
```

#### Processing Stages:

**Stage 1: ASR (Automatic Speech Recognition)**
- Processes all chunks in parallel
- Extracts speech and converts to text
- Stores transcription with word-level timestamps
- Updates chunk status to `TRANSCRIBED`

**Stage 2: Vision Analysis**
- Analyzes video content for visual features
- Detects faces, scene changes, motion intensity
- Identifies visual engagement indicators
- Updates chunk status to `ANALYZED`

**Stage 3: Scoring & Ranking**
- Combines transcription + vision data
- Calculates engagement scores using:
  - Emotional words ("amazing", "incredible", "wow")
  - Action indicators ("clutch", "perfect", "insane")  
  - Clip requests ("clip it", "clip that")
  - Visual activity (faces, motion, scene changes)
- Ranks chunks by highlight potential
- Updates chunk status to `SCORED`

**Stage 4: Rendering**
- Selects top-scoring chunks (threshold: 0.3+)
- Generates clips with automated captions
- Creates thumbnails and metadata
- Uploads final clips to S3
- Updates clip status to `RENDERED`

## Key Features

### Real-Time Processing
- Webhook-based communication between services
- Asynchronous job queues for scalability
- Progress tracking and status updates

### AI-Powered Scoring
- Multi-modal analysis combining audio and visual data
- Gaming-optimized scoring algorithms
- Customizable highlight thresholds

### Automated Video Production
- Dynamic caption generation
- Multiple aspect ratios (9:16, 1:1, 16:9)
- Platform-optimized formatting (YouTube Shorts, TikTok, Instagram)

### Robust Error Handling
- Retry mechanisms for failed jobs
- Graceful degradation when services unavailable
- Comprehensive logging and monitoring

## API Endpoints

### Orchestrator (Port 3001)

#### Processing Control
- `POST /api/v1/processing/start/:streamId` - Start processing pipeline
- `GET /api/v1/processing/status/:streamId` - Get processing status

#### Webhook Receivers
- `POST /api/v1/processing/webhooks/asr-complete` - ASR completion
- `POST /api/v1/processing/webhooks/vision-complete` - Vision completion
- `POST /api/v1/processing/webhooks/scoring-complete` - Scoring completion
- `POST /api/v1/processing/webhooks/render-complete` - Render completion

### Python Services

Each service exposes:
- `GET /health` - Health check endpoint
- `POST /{service-action}` - Main processing endpoint
- `GET /{job-id}` - Job status polling

## Configuration

### Environment Variables

#### Orchestrator
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/clipforge
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:4566
S3_BUCKET=clipforge-storage
```

#### Python Services
```env
ORCHESTRATOR_URL=http://localhost:3001
S3_ENDPOINT=http://localhost:4566
S3_BUCKET=clipforge-storage
```

## Database Schema

### Core Entities

#### Streams
- `id`: Unique identifier
- `title`: Stream title
- `status`: Processing status
- `originalUrl`: Source video URL
- `duration`: Total duration
- `platform`: Source platform (Twitch, YouTube, etc.)

#### Chunks
- `id`: Unique identifier
- `streamId`: Parent stream reference
- `startTime`: Start timestamp
- `duration`: Chunk duration
- `videoPath`: S3 path to video file
- `transcription`: Speech-to-text results
- `visionAnalysis`: Visual analysis data
- `highlightScore`: Engagement score (0-1)
- `status`: Processing status

#### Clips
- `id`: Unique identifier
- `streamId`: Source stream
- `sourceChunkId`: Source chunk
- `title`: Generated title
- `startTime`: Start time in source
- `duration`: Clip duration
- `renderedFilePath`: S3 path to rendered clip
- `thumbnailPath`: S3 path to thumbnail
- `highlightScore`: Final score
- `status`: Render status

## Monitoring & Debugging

### Logging
- Structured JSON logging across all services
- Correlation IDs for request tracing
- Performance metrics and timing data

### Status Tracking
- Real-time job progress updates
- Detailed error reporting and stack traces
- Processing stage visibility

### Health Checks
- Service availability monitoring
- Database connection status
- S3 storage accessibility

## Recent Improvements

### Unified Processing System
- **Problem**: Dual processing systems causing conflicts
- **Solution**: Disabled legacy `ProcessingProcessor`, using only `ProcessingQueueProcessor`
- **Benefit**: Eliminated duplicate jobs and file path conflicts

### Enhanced Scoring Algorithm
- **Improvements**: Better transcription text extraction from Whisper format
- **New Features**: Gaming-specific keywords, clip request detection
- **Tuning**: Lowered thresholds for more highlight generation

### Robust Error Handling
- **Webhook Retries**: Automatic retry mechanisms for failed webhooks
- **Graceful Degradation**: Continue processing when individual services fail
- **Better Logging**: Detailed request/response logging for debugging

## Troubleshooting

### Common Issues

1. **No Clips Generated**
   - Check scoring thresholds (default: 0.3)
   - Verify transcription quality
   - Review scoring algorithm weights

2. **Processing Stuck**
   - Check service health endpoints
   - Review webhook delivery status
   - Verify queue processing status

3. **File Not Found Errors**
   - Validate S3 paths in database
   - Check LocalStack container status
   - Verify file upload completion

### Debug Commands
```bash
# Check service status
docker-compose ps

# View service logs
docker-compose logs orchestrator
docker-compose logs scoring_svc
docker-compose logs render_svc

# Database inspection
psql -d clipforge -c "SELECT * FROM chunks WHERE status = 'failed';"

# S3 file verification
aws s3 ls s3://clipforge-storage/ --endpoint-url=http://localhost:4566
```

This unified system provides a robust, scalable solution for automated video highlight generation with comprehensive monitoring and error handling capabilities.