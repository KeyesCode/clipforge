FROM python:3.10-slim-bookworm

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system dependencies and audio libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libsndfile1 \
    libsox-dev \
    sox \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libavdevice-dev \
    libavutil-dev \
    libswresample-dev \
    libavfilter-dev \
    libasound2-dev \
    portaudio19-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for better layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip wheel setuptools && \
    pip install --no-cache-dir -r requirements.txt

# Set environment to handle potential ctranslate2 executable stack issues
ENV PYTHONPATH=/usr/local/lib/python3.10/site-packages:$PYTHONPATH

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /data/chunks /data/transcriptions /app/logs

# Expose service port
EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=40s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8002/health')" || exit 1

# Run the application
CMD ["python", "main.py"]