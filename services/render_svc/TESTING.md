# ClipForge Render Service - Testing Guide

## Overview
The Render Service creates final video clips from scored chunks, adding captions, overlays, and social media optimizations.

## Service Information
- **Port**: 8005
- **Health Check**: `GET /health`
- **Purpose**: Render final clips with captions and optimizations
- **Dependencies**: Redis, FFmpeg, Pillow, opencv-python

## Quick Health Check
```bash
curl http://localhost:8005/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-05T23:xx:xx.xxxZ",
  "service": "render_svc",
  "ffmpeg_version": "4.4.2",
  "available_codecs": ["h264", "h265", "vp9"],
  "gpu_acceleration": false
}
```

## API Endpoints

### 1. Render Video Clip
```bash
curl -X POST http://localhost:8005/render \
  -H "Content-Type: application/json" \
  -d '{
    "clipId": "clip-123",
    "sourceVideo": "/path/to/source-chunk.mp4",
    "startTime": 15.5,
    "duration": 30,
    "renderConfig": {
      "format": "mp4",
      "resolution": "1080p",
      "platform": "youtube_shorts"
    },
    "captions": {
      "text": "OH MY GOD THAT WAS INSANE!",
      "segments": [
        {"start": 0.0, "end": 2.1, "text": "OH MY GOD"},
        {"start": 2.1, "end": 4.5, "text": "THAT WAS INSANE!"}
      ],
      "style": "gaming"
    }
  }'
```

### 2. Get Render Status
```bash
curl http://localhost:8005/render/clip-123
```

### 3. Render with Custom Overlays
```bash
curl -X POST http://localhost:8005/render \
  -H "Content-Type: application/json" \
  -d '{
    "clipId": "overlay-test-001",
    "sourceVideo": "/path/to/chunk.mp4",
    "startTime": 0,
    "duration": 15,
    "overlays": [
      {
        "type": "text",
        "content": "EPIC MOMENT",
        "position": {"x": "center", "y": "top"},
        "style": {
          "fontFamily": "Arial Black",
          "fontSize": 48,
          "color": "#FF0000",
          "stroke": {"color": "#FFFFFF", "width": 2}
        },
        "animation": "fade_in",
        "startTime": 1.0,
        "duration": 3.0
      },
      {
        "type": "image", 
        "content": "/app/assets/logo.png",
        "position": {"x": "bottom-right", "y": "bottom-right"},
        "scale": 0.3,
        "opacity": 0.8
      }
    ]
  }'
```

### 4. Batch Render Multiple Clips
```bash
curl -X POST http://localhost:8005/render-batch \
  -H "Content-Type: application/json" \
  -d '{
    "batchId": "batch-001",
    "clips": [
      {"clipId": "clip-001", "sourceVideo": "...", "startTime": 10, "duration": 15},
      {"clipId": "clip-002", "sourceVideo": "...", "startTime": 45, "duration": 20},
      {"clipId": "clip-003", "sourceVideo": "...", "startTime": 120, "duration": 12}
    ],
    "batchConfig": {
      "format": "mp4",
      "resolution": "1080p",
      "platform": "tiktok"
    }
  }'
```

## Testing Scenarios

### Test 1: YouTube Shorts Clip
```bash
curl -X POST http://localhost:8005/render \
  -H "Content-Type: application/json" \
  -d '{
    "clipId": "youtube-short-001",
    "sourceVideo": "/app/test-data/gaming-highlight.mp4",
    "startTime": 12.5,
    "duration": 28,
    "renderConfig": {
      "format": "mp4",
      "resolution": "1080x1920",
      "aspectRatio": "9:16",
      "framerate": 30,
      "bitrate": "8000k",
      "platform": "youtube_shorts",
      "codec": "h264"
    },
    "captions": {
      "segments": [
        {"start": 0.0, "end": 1.8, "text": "WAIT FOR IT..."},
        {"start": 1.8, "end": 3.2, "text": "NO WAY!"},
        {"start": 3.2, "end": 5.5, "text": "THAT WAS INSANE!"},
        {"start": 5.5, "end": 8.0, "text": "Did you see that headshot?"}
      ],
      "style": {
        "fontFamily": "Impact",
        "fontSize": 36,
        "color": "#FFFF00",
        "backgroundColor": "rgba(0,0,0,0.8)",
        "position": "bottom_center",
        "animation": "typewriter"
      }
    },
    "effects": [
      {
        "type": "zoom",
        "startTime": 1.5,
        "duration": 2.0,
        "intensity": 1.2,
        "center": [0.5, 0.3]
      },
      {
        "type": "slow_motion",
        "startTime": 2.8,
        "duration": 1.5,
        "speed": 0.5
      }
    ]
  }'
```

Expected response:
```json
{
  "clipId": "youtube-short-001",
  "status": "processing",
  "estimated_completion": "2025-09-05T23:15:30.000Z",
  "progress": 0,
  "renderSettings": {
    "outputFormat": "mp4",
    "resolution": "1080x1920",
    "duration": 28,
    "fileSize": "estimated_12mb"
  },
  "jobId": "render_job_12345"
}
```

### Test 2: TikTok Vertical Clip
```bash
curl -X POST http://localhost:8005/render \
  -H "Content-Type: application/json" \
  -d '{
    "clipId": "tiktok-001",
    "sourceVideo": "/app/test-data/funny-fail.mp4",
    "startTime": 5.0,
    "duration": 15,
    "renderConfig": {
      "format": "mp4",
      "resolution": "1080x1920",
      "aspectRatio": "9:16",
      "framerate": 30,
      "platform": "tiktok",
      "optimization": "mobile"
    },
    "captions": {
      "segments": [
        {"start": 0.0, "end": 3.0, "text": "When you think you are good at gaming..."},
        {"start": 8.0, "end": 12.0, "text": "But reality hits different 😅"}
      ],
      "style": {
        "fontFamily": "Arial Bold",
        "fontSize": 32,
        "color": "#FFFFFF",
        "stroke": {"color": "#000000", "width": 1},
        "position": "center",
        "animation": "slide_up"
      }
    },
    "music": {
      "track": "/app/assets/epic-fail-sound.mp3",
      "volume": 0.3,
      "fadeIn": 1.0,
      "fadeOut": 2.0
    }
  }'
```

### Test 3: X (Twitter) Landscape Clip
```bash
curl -X POST http://localhost:8005/render \
  -H "Content-Type: application/json" \
  -d '{
    "clipId": "twitter-001",
    "sourceVideo": "/app/test-data/achievement-moment.mp4", 
    "startTime": 20.0,
    "duration": 25,
    "renderConfig": {
      "format": "mp4",
      "resolution": "1280x720",
      "aspectRatio": "16:9", 
      "framerate": 30,
      "platform": "twitter",
      "maxFileSize": "512mb"
    },
    "captions": {
      "segments": [
        {"start": 0.0, "end": 4.0, "text": "FIRST TRY! 🎯"},
        {"start": 15.0, "end": 20.0, "text": "Chat went WILD! 🔥"}
      ],
      "style": "twitter_gaming"
    },
    "branding": {
      "watermark": "/app/assets/streamer-logo.png",
      "position": "bottom_right",
      "opacity": 0.7,
      "scale": 0.2
    }
  }'
```

## Advanced Rendering Features

### Test Caption Styles
```bash
# Gaming style captions
curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "gaming-captions-001",
    "captions": {
      "style": "gaming",
      "segments": [...]
    }
  }'

# Meme style captions  
curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "meme-captions-001",
    "captions": {
      "style": "meme",
      "segments": [...]
    }
  }'

# Clean/minimal captions
curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "clean-captions-001",
    "captions": {
      "style": "minimal",
      "segments": [...]
    }
  }'
```

### Test Video Effects
```bash
# Test transition effects
curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "effects-test-001",
    "effects": [
      {
        "type": "fade_in",
        "startTime": 0.0,
        "duration": 1.0
      },
      {
        "type": "zoom_and_pan",
        "startTime": 5.0,
        "duration": 3.0,
        "keyframes": [
          {"time": 0.0, "scale": 1.0, "x": 0, "y": 0},
          {"time": 1.5, "scale": 1.3, "x": -0.1, "y": -0.2},
          {"time": 3.0, "scale": 1.0, "x": 0, "y": 0}
        ]
      },
      {
        "type": "fade_out", 
        "startTime": 28.0,
        "duration": 2.0
      }
    ]
  }'
```

### Test Audio Processing
```bash
curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "audio-test-001",
    "audio": {
      "originalVolume": 0.8,
      "musicTrack": "/app/assets/background-music.mp3",
      "musicVolume": 0.2,
      "audioEffects": [
        {
          "type": "amplify",
          "startTime": 10.0,
          "duration": 5.0,
          "factor": 1.5
        },
        {
          "type": "echo",
          "startTime": 15.0,
          "duration": 2.0,
          "delay": 0.5,
          "decay": 0.3
        }
      ],
      "noiseReduction": true,
      "normalize": true
    }
  }'
```

## Quality Testing

### Test Different Resolutions
```bash
# 4K rendering
curl -X POST http://localhost:8005/render \
  -d '{
    "renderConfig": {
      "resolution": "3840x2160",
      "bitrate": "25000k"
    }
  }'

# 1080p standard
curl -X POST http://localhost:8005/render \
  -d '{
    "renderConfig": {
      "resolution": "1920x1080", 
      "bitrate": "8000k"
    }
  }'

# 720p mobile optimized
curl -X POST http://localhost:8005/render \
  -d '{
    "renderConfig": {
      "resolution": "1280x720",
      "bitrate": "4000k"
    }
  }'
```

### Test Platform Optimizations
```bash
# YouTube optimized
curl -X POST http://localhost:8005/render \
  -d '{
    "renderConfig": {
      "platform": "youtube",
      "optimization": "quality"
    }
  }'

# TikTok optimized  
curl -X POST http://localhost:8005/render \
  -d '{
    "renderConfig": {
      "platform": "tiktok",
      "optimization": "mobile_data"
    }
  }'

# Instagram optimized
curl -X POST http://localhost:8005/render \
  -d '{
    "renderConfig": {
      "platform": "instagram",
      "optimization": "engagement"
    }
  }'
```

## Performance Testing

### Benchmark Render Speed
```bash
# Test render time for different durations
time curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "perf-15sec",
    "duration": 15,
    "renderConfig": {"resolution": "1080p"}
  }'

time curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "perf-30sec",
    "duration": 30,
    "renderConfig": {"resolution": "1080p"}
  }'

time curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "perf-60sec", 
    "duration": 60,
    "renderConfig": {"resolution": "1080p"}
  }'
```

### Test Batch Processing
```bash
# Render multiple clips simultaneously
curl -X POST http://localhost:8005/render-batch \
  -d '{
    "batchId": "batch-perf-test",
    "clips": [
      {"clipId": "batch-001", "duration": 15},
      {"clipId": "batch-002", "duration": 20},
      {"clipId": "batch-003", "duration": 12},
      {"clipId": "batch-004", "duration": 18},
      {"clipId": "batch-005", "duration": 25}
    ]
  }'

# Monitor batch progress
curl http://localhost:8005/batch/batch-perf-test
```

## Error Testing

### Test Invalid Video Files
```bash
# Non-existent source video
curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "error-no-file",
    "sourceVideo": "/app/test-data/does-not-exist.mp4"
  }'

# Corrupted video file
curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "error-corrupt",
    "sourceVideo": "/app/test-data/corrupted.mp4"
  }'

# Invalid time ranges
curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "error-time-range",
    "sourceVideo": "/app/test-data/30sec-video.mp4",
    "startTime": 45,
    "duration": 30
  }'
```

### Test Resource Limits
```bash
# Very long clip (should fail or warn)
curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "error-too-long",
    "duration": 600
  }'

# Very high resolution (memory test)
curl -X POST http://localhost:8005/render \
  -d '{
    "clipId": "error-high-res",
    "renderConfig": {
      "resolution": "7680x4320"
    }
  }'
```

## File Output Testing

### Verify Rendered Files
```bash
# Check output directory
ls -la /app/data/rendered/

# Verify video properties  
ffprobe /app/data/rendered/clip-123.mp4

# Check file size
du -h /app/data/rendered/clip-123.mp4

# Test video playback
ffplay /app/data/rendered/clip-123.mp4
```

### Validate Video Quality
```bash
# Check video metadata
ffprobe -v quiet -print_format json -show_format -show_streams \
  /app/data/rendered/clip-123.mp4

# Analyze quality metrics
ffmpeg -i /app/data/rendered/clip-123.mp4 -vf "ssim=reference.mp4" -f null -

# Check for encoding artifacts
ffmpeg -i /app/data/rendered/clip-123.mp4 -vf "blackdetect=d=2" -f null -
```

## Redis Integration Testing

### Check Render Queue
```bash
# Connect to Redis
redis-cli -h localhost -p 6379 -a redis_secure_password_2024

# Check render queue
> LLEN render_queue
> LRANGE render_queue 0 -1

# Check completed renders
> KEYS rendered:*
> GET rendered:clip-123
```

## Expected Results

### Performance Benchmarks
- **15-second clip**: <30 seconds render time
- **30-second clip**: <60 seconds render time
- **File size (1080p, 15s)**: 8-15MB
- **File size (720p, 15s)**: 4-8MB

### Quality Standards
- **Caption readability**: Clear at target resolution
- **Audio sync**: <50ms deviation
- **Video quality**: No visible compression artifacts
- **Platform compliance**: Meets platform specifications

## Troubleshooting

### Common Issues
1. **FFmpeg errors**: Check codec support and input format
2. **Out of memory**: Reduce resolution or batch size
3. **Slow rendering**: Check hardware acceleration availability
4. **Caption positioning issues**: Verify font availability
5. **Audio sync problems**: Check frame rate consistency

### Debug Commands
```bash
# Test FFmpeg directly
ffmpeg -i /app/test-data/test-video.mp4 -t 10 test-output.mp4

# Check available fonts
fc-list

# Check GPU acceleration
ffmpeg -hwaccels

# Monitor service logs
docker logs -f clipforge_render

# Check disk space
df -h /app/data/rendered/
```

### Resource Monitoring
```bash
# Monitor render service resources
docker stats clipforge_render

# Check render queue status
curl http://localhost:8005/stats

# Monitor file system usage
watch "du -sh /app/data/rendered/"
```