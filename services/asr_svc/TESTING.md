# ClipForge ASR Service - Testing Guide

## Overview
The ASR (Automatic Speech Recognition) service transcribes audio from video chunks using the Whisper model.

## Service Information
- **Port**: 8002
- **Health Check**: `GET /health`
- **Model**: OpenAI Whisper (faster-whisper)
- **Dependencies**: Redis, faster-whisper, torch

## Quick Health Check
```bash
curl http://localhost:8002/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-05T23:xx:xx.xxxZ",
  "service": "asr_svc",
  "model": "base",
  "device": "cpu"
}
```

## API Endpoints

### 1. Transcribe Audio Chunk
```bash
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "chunk-123",
    "audioPath": "/path/to/audio.wav",
    "language": "en"
  }'
```

### 2. Get Transcription Result
```bash
curl http://localhost:8002/transcription/chunk-123
```

### 3. Batch Transcribe
```bash
curl -X POST http://localhost:8002/transcribe/batch \
  -H "Content-Type: application/json" \
  -d '{
    "chunks": [
      {
        "chunkId": "chunk-001",
        "audioPath": "/path/to/chunk1.wav"
      },
      {
        "chunkId": "chunk-002", 
        "audioPath": "/path/to/chunk2.wav"
      }
    ],
    "language": "en"
  }'
```

## Testing with Audio Files

### Test 1: Simple English Speech
```bash
# First, you need an audio file. Create a test file or use existing chunk
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "test-english-001",
    "audioPath": "/app/test-data/english-speech.wav",
    "language": "en",
    "options": {
      "beam_size": 5,
      "best_of": 5,
      "temperature": 0.0
    }
  }'

# Check result
curl http://localhost:8002/transcription/test-english-001
```

Expected response:
```json
{
  "chunkId": "test-english-001",
  "status": "completed",
  "transcription": {
    "text": "Hello, this is a test of the speech recognition system.",
    "segments": [
      {
        "start": 0.0,
        "end": 2.5,
        "text": "Hello, this is a test",
        "confidence": 0.95
      },
      {
        "start": 2.5,
        "end": 4.8,
        "text": "of the speech recognition system.",
        "confidence": 0.92
      }
    ],
    "language": "en",
    "duration": 4.8,
    "no_speech_prob": 0.1
  },
  "processing_time": 1.23
}
```

### Test 2: Multiple Languages
```bash
# Spanish audio
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "test-spanish-001",
    "audioPath": "/app/test-data/spanish-speech.wav",
    "language": "es"
  }'

# Auto-detect language
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "test-auto-001",
    "audioPath": "/app/test-data/unknown-language.wav",
    "language": "auto"
  }'
```

### Test 3: Gaming Audio (with background noise)
```bash
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "gaming-audio-001",
    "audioPath": "/app/test-data/gaming-clip.wav",
    "language": "en",
    "options": {
      "vad_filter": true,
      "vad_threshold": 0.5,
      "suppress_blank": true,
      "suppress_tokens": [-1]
    }
  }'
```

## Audio File Preparation

### Extract Audio from Video Chunk
```bash
# Extract audio from video for testing
ffmpeg -i /path/to/video-chunk.mp4 \
       -vn -acodec pcm_s16le -ar 16000 -ac 1 \
       /path/to/audio-chunk.wav

# Create test audio files
# 1. Record your voice
# 2. Use text-to-speech tools
# 3. Download free speech samples
```

### Test Audio Formats
```bash
# Test different audio formats
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "format-test-wav",
    "audioPath": "/app/test-data/speech.wav",
    "language": "en"
  }'

curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "format-test-mp3",
    "audioPath": "/app/test-data/speech.mp3", 
    "language": "en"
  }'
```

## Quality Testing

### Test Audio Quality Variations
```bash
# High quality audio (48kHz, stereo)
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "quality-high-001",
    "audioPath": "/app/test-data/high-quality.wav",
    "language": "en"
  }'

# Low quality audio (8kHz, mono)
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "quality-low-001", 
    "audioPath": "/app/test-data/low-quality.wav",
    "language": "en"
  }'

# Noisy audio
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "noisy-audio-001",
    "audioPath": "/app/test-data/noisy-speech.wav",
    "language": "en",
    "options": {
      "condition_on_previous_text": false,
      "compression_ratio_threshold": 2.4,
      "logprob_threshold": -1.0
    }
  }'
```

## Performance Testing

### Benchmark Transcription Speed
```bash
# Time the transcription process
time curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "benchmark-001",
    "audioPath": "/app/test-data/5min-speech.wav",
    "language": "en"
  }'

# Test batch processing performance
time curl -X POST http://localhost:8002/transcribe/batch \
  -H "Content-Type: application/json" \
  -d '{
    "chunks": [
      {"chunkId": "batch-001", "audioPath": "/app/test-data/chunk1.wav"},
      {"chunkId": "batch-002", "audioPath": "/app/test-data/chunk2.wav"},
      {"chunkId": "batch-003", "audioPath": "/app/test-data/chunk3.wav"}
    ],
    "language": "en"
  }'
```

### Monitor Resource Usage
```bash
# Monitor CPU and memory during transcription
docker stats clipforge_asr

# Check GPU usage (if using CUDA)
nvidia-smi

# Monitor service logs
docker logs -f clipforge_asr
```

## Model Configuration Testing

### Test Different Whisper Models
```bash
# Test with different model sizes (requires restart with new env var)
# WHISPER_MODEL=tiny (fastest, less accurate)
# WHISPER_MODEL=base (default)
# WHISPER_MODEL=small (better quality)
# WHISPER_MODEL=medium (even better)
# WHISPER_MODEL=large (best quality, slowest)

# After changing model, restart service and test
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "model-test-001",
    "audioPath": "/app/test-data/test-speech.wav",
    "language": "en"
  }'
```

### Test Compute Types
```bash
# CPU with different compute types
# WHISPER_COMPUTE_TYPE=int8 (faster, less accurate)
# WHISPER_COMPUTE_TYPE=float16 (better quality, needs CUDA)
# WHISPER_COMPUTE_TYPE=float32 (highest quality, slowest)
```

## Error Handling Tests

### Test Invalid Audio Files
```bash
# Non-existent file
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "error-test-001",
    "audioPath": "/app/test-data/does-not-exist.wav",
    "language": "en"
  }'

# Corrupted audio file  
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "error-test-002",
    "audioPath": "/app/test-data/corrupted.wav",
    "language": "en"
  }'

# Empty audio file
curl -X POST http://localhost:8002/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "chunkId": "error-test-003",
    "audioPath": "/app/test-data/empty.wav",
    "language": "en"
  }'
```

## Redis Integration Testing

### Check Queue Processing
```bash
# Connect to Redis and monitor ASR queue
redis-cli -h localhost -p 6379 -a redis_secure_password_2024

# Check ASR queue length
> LLEN asr_queue

# Monitor transcription results
> KEYS transcription:*
> GET transcription:chunk-123
```

## Real-World Testing

### Gaming Content
Create test audio with typical gaming content:
- Player commentary
- Game sound effects
- Background music
- Multiple speakers
- Excited speech/shouting

### Streaming Content  
Test with various streaming scenarios:
- Solo commentary
- Co-op gameplay with multiple people
- Interview/podcast style
- Music mixed with speech
- Different languages

## Expected Results

### Quality Metrics
- **Accuracy**: >90% for clear speech
- **Speed**: Real-time factor <1.0 (faster than audio duration)
- **Confidence**: >0.8 for good transcriptions
- **Language Detection**: >95% accuracy for supported languages

### Common Transcription Patterns
- Gaming terms: "GG", "noob", "epic", "clutch"
- Streaming phrases: "Thanks for the follow", "What's up chat"
- Technical terms: Brand names, game titles, technical jargon

## Troubleshooting

### Common Issues
1. **Model loading fails**: Check memory availability
2. **CUDA errors**: Verify GPU drivers or use CPU mode
3. **Audio format issues**: Convert to WAV 16kHz mono
4. **Out of memory**: Reduce batch size or use smaller model
5. **Slow transcription**: Check CPU/GPU utilization

### Debug Commands
```bash
# Check Whisper model loading
curl http://localhost:8002/health | jq '.model'

# Check service logs for errors
docker logs clipforge_asr | grep ERROR

# Test audio file directly
ffprobe /path/to/audio.wav
```