# ClipForge - AI Stream Clipper

**Local-first system that ingests streamer VODs, finds highlights automatically, renders clips with captions, provides review UI, and publishes to social platforms**

## 🎯 Overview

ClipForge is a comprehensive AI-powered video processing pipeline designed to automatically extract highlights from streaming VODs (Video on Demand), generate engaging clips with captions, and publish them to social media platforms. The system uses advanced machine learning techniques including speech recognition, computer vision, and multi-modal feature fusion to identify the most engaging moments in long-form content.

## 🏗️ Architecture

ClipForge follows a microservices architecture with the following components:

### Core Applications
- **Orchestrator** (`apps/orchestrator/`) - NestJS API server with job orchestration and database management
- **Web UI** (`apps/web/`) - Next.js reviewer interface for clip management and approval
- **Publisher** (`apps/publisher/`) - Node.js service for social media publishing

### Processing Services
- **Ingest Service** (`services/ingest_svc/`) - VOD download and segmentation using yt-dlp
- **ASR Service** (`services/asr_svc/`) - Speech transcription using Faster Whisper
- **Vision Service** (`services/vision_svc/`) - Scene detection and face recognition
- **Scoring Service** (`services/scoring_svc/`) - ML-based highlight scoring and ranking
- **Render Service** (`services/render_svc/`) - Video rendering with captions and crops

### Shared Components
- **Proto** (`packages/proto/`) - Shared JSON schemas for inter-service communication
- **FFmpeg Presets** (`packages/ffmpeg_presets/`) - Reusable video processing configurations

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- Python 3.9+ (for local development)
- GPU with CUDA support (recommended for faster processing)

### Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd clipforge
```

2. **Set up environment variables:**
```bash
cp deploy/.env.example deploy/.env
# Edit deploy/.env with your configuration
```

3. **Start the services:**
```bash
cd deploy
docker compose up --build
```

4. **Initialize the database:**
```bash
docker compose exec orchestrator npm run typeorm:migrate
python scripts/seed_db.py
```

5. **Access the application:**
- Web UI: http://localhost:3000
- API Documentation: http://localhost:3001/api
- Orchestrator API: http://localhost:3001

## 📁 Project Structure

```
clipforge/
├── apps/
│   ├── orchestrator/           # NestJS API + job orchestration
│   │   ├── src/
│   │   │   ├── main.ts        # Application bootstrap
│   │   │   ├── app.module.ts  # Root module configuration
│   │   │   ├── streamers/     # Streamer management
│   │   │   ├── streams/       # Stream processing
│   │   │   ├── chunks/        # Video chunk handling
│   │   │   ├── clips/         # Clip management
│   │   │   ├── jobs/          # Job processing
│   │   │   └── queue/         # Queue management
│   │   ├── package.json       # Dependencies and scripts
│   │   ├── Dockerfile         # Container configuration
│   │   └── .env              # Environment variables
│   ├── web/                   # Next.js reviewer UI
│   │   ├── src/
│   │   │   ├── pages/         # Next.js pages
│   │   │   ├── components/    # React components
│   │   │   └── lib/           # Utility libraries
│   │   ├── package.json       # Frontend dependencies
│   │   ├── Dockerfile         # Container configuration
│   │   └── tailwind.config.js # Styling configuration
│   └── publisher/             # Node/TS publishing workers
│       ├── src/
│       │   ├── main.ts        # Publisher service entry
│       │   ├── youtube.ts     # YouTube Shorts integration
│       │   └── x.ts           # X (Twitter) integration
│       ├── package.json       # Publisher dependencies
│       └── Dockerfile         # Container configuration
├── services/
│   ├── ingest_svc/            # Python: download/segment
│   ├── asr_svc/               # Python: Whisper transcription
│   ├── vision_svc/            # Python: scene cuts, face detection
│   ├── scoring_svc/           # Python: feature fusion + ranking
│   └── render_svc/            # Python: caption burning, crops
├── packages/
│   ├── proto/                 # Shared JSON schemas
│   └── ffmpeg_presets/        # Reusable FFmpeg configs
├── deploy/
│   ├── docker-compose.yml     # Service orchestration
│   ├── .env                   # Environment configuration
│   └── Makefile              # Build automation
├── scripts/
│   ├── ingest_local.sh        # Local ingestion script
│   └── seed_db.py            # Database seeding
└── README.md                  # This file
```

## 🔧 Configuration

### Environment Variables

Key configuration options in `deploy/.env`:

#### Database & Redis
```env
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_USERNAME=clipforge
DATABASE_PASSWORD=your_password
DATABASE_NAME=clipforge

REDIS_HOST=redis
REDIS_PORT=6379
QUEUE_REDIS_DB=1
```

#### Microservices
```env
INGEST_SERVICE_URL=http://ingest_svc:8000
ASR_SERVICE_URL=http://asr_svc:8001
VISION_SERVICE_URL=http://vision_svc:8002
SCORING_SERVICE_URL=http://scoring_svc:8003
RENDER_SERVICE_URL=http://render_svc:8004
```

#### Processing Parameters
```env
MAX_CONCURRENT_JOBS=3
CHUNK_DURATION_SECONDS=30
MIN_CLIP_DURATION_SECONDS=15
MAX_CLIP_DURATION_SECONDS=60
```

#### Social Media APIs
```env
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
```

## 🎬 Usage Workflow

### 1. Add Streamer
```bash
curl -X POST http://localhost:3001/api/streamers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "StreamerName",
    "platform": "twitch",
    "channel_url": "https://twitch.tv/streamername"
  }'
```

### 2. Ingest VOD
```bash
curl -X POST http://localhost:3001/api/streams \
  -H "Content-Type: application/json" \
  -d '{
    "streamer_id": 1,
    "vod_url": "https://www.twitch.tv/videos/123456789",
    "title": "Epic Gaming Session"
  }'
```

### 3. Monitor Processing
- Check job status via API: `GET /api/jobs`
- View real-time updates in Web UI
- WebSocket updates at `ws://localhost:3001`

### 4. Review Clips
- Access Web UI at http://localhost:3000
- Review auto-generated clips
- Approve/reject clips for publishing
- Edit captions and metadata

### 5. Publish to Social Media
- Approved clips are automatically queued for publishing
- Supports YouTube Shorts and X (Twitter)
- Custom scheduling and metadata per platform

## 🧠 AI Features

### Speech Recognition
- **Faster Whisper** for high-accuracy transcription
- Multi-language support
- Automatic punctuation and capitalization
- Speaker diarization capabilities

### Computer Vision
- **PySceneDetect** for automatic scene boundary detection
- **InsightFace** for face detection and recognition
- Action recognition for gaming content
- Visual excitement scoring

### Highlight Detection
- Multi-modal feature fusion (audio, visual, text)
- Machine learning-based scoring algorithms
- Customizable scoring weights per content type
- Audience engagement prediction

### Caption Generation
- Automatic subtitle generation from transcripts
- Dynamic styling and positioning
- Multi-format support (SRT, ASS, VTT)
- Accessibility compliance

## 🔌 API Reference

### Streamers API
- `GET /api/streamers` - List all streamers
- `POST /api/streamers` - Add new streamer
- `PUT /api/streamers/:id` - Update streamer
- `DELETE /api/streamers/:id` - Remove streamer

### Streams API
- `GET /api/streams` - List streams
- `POST /api/streams` - Start VOD ingestion
- `GET /api/streams/:id` - Get stream details
- `DELETE /api/streams/:id` - Delete stream

### Clips API
- `GET /api/clips` - List generated clips
- `GET /api/clips/:id` - Get clip details
- `PUT /api/clips/:id` - Update clip metadata
- `POST /api/clips/:id/approve` - Approve for publishing
- `POST /api/clips/:id/reject` - Reject clip

### Jobs API
- `GET /api/jobs` - List processing jobs
- `GET /api/jobs/:id` - Get job status
- `POST /api/jobs/:id/cancel` - Cancel job

## 🛠️ Development

### Local Development Setup

1. **Install dependencies:**
```bash
# Orchestrator
cd apps/orchestrator && npm install

# Web UI
cd apps/web && npm install

# Publisher
cd apps/publisher && npm install

# Python services
cd services/ingest_svc && pip install -r requirements.txt
cd services/asr_svc && pip install -r requirements.txt
cd services/vision_svc && pip install -r requirements.txt
cd services/scoring_svc && pip install -r requirements.txt
cd services/render_svc && pip install -r requirements.txt
```

2. **Start development servers:**
```bash
# Start infrastructure
docker compose -f deploy/docker-compose.yml up postgres redis

# Start orchestrator
cd apps/orchestrator && npm run start:dev

# Start web UI
cd apps/web && npm run dev

# Start Python services
cd services/ingest_svc && python main.py
cd services/asr_svc && python main.py
cd services/vision_svc && python main.py
cd services/scoring_svc && python main.py
cd services/render_svc && python main.py
```

### Testing

```bash
# Unit tests
cd apps/orchestrator && npm test
cd apps/web && npm test

# Integration tests
cd apps/orchestrator && npm run test:e2e

# Python service tests
cd services/ingest_svc && python -m pytest
```

### Database Migrations

```bash
# Generate migration
cd apps/orchestrator && npm run typeorm:migration:generate -- -n MigrationName

# Run migrations
npm run typeorm:migration:run

# Revert migration
npm run typeorm:migration:revert
```

## 📊 Monitoring & Logging

### Logging
- Structured JSON logging across all services
- Centralized log aggregation via Docker logging drivers
- Log levels: ERROR, WARN, INFO, DEBUG

### Metrics
- Job processing metrics
- API response times
- Queue depth monitoring
- Resource utilization tracking

### Health Checks
- Service health endpoints: `/health`
- Database connectivity checks
- Redis connectivity verification
- External service availability

## 🔒 Security

### Authentication
- JWT-based API authentication
- Session management for Web UI
- API key authentication for external services

### Data Protection
- Encrypted storage for sensitive configuration
- Secure handling of social media credentials
- Input validation and sanitization

### Network Security
- Internal service communication via Docker networks
- HTTPS termination at load balancer
- Rate limiting on public APIs

## 🚀 Deployment

### Production Deployment

1. **Configure environment:**
```bash
cp deploy/.env.example deploy/.env.prod
# Update with production values
```

2. **Deploy with Docker Compose:**
```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml up -d
```

3. **Set up reverse proxy (Nginx example):**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
    }
    
    location /api {
        proxy_pass http://localhost:3001;
    }
}
```

### Scaling

- Horizontal scaling of Python services
- Load balancing with multiple orchestrator instances
- Redis Cluster for high availability
- PostgreSQL read replicas for performance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript/Python coding standards
- Write comprehensive tests
- Update documentation for new features
- Use conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Faster Whisper** - High-performance speech recognition
- **PySceneDetect** - Video scene boundary detection
- **InsightFace** - Face analysis and recognition
- **NestJS** - Progressive Node.js framework
- **Next.js** - React framework for production
- **FFmpeg** - Multimedia processing framework

## 📞 Support

- **Documentation:** [Wiki](https://github.com/your-org/clipforge/wiki)
- **Issues:** [GitHub Issues](https://github.com/your-org/clipforge/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-org/clipforge/discussions)
- **Email:** support@clipforge.dev

---

**ClipForge** - Transforming long-form content into viral clips with the power of AI 🎬✨