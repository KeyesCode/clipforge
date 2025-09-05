-- ClipForge Database Initialization Script
-- This script sets up the initial database schema and configurations

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create enum types for better type safety
CREATE TYPE streamer_platform AS ENUM ('twitch', 'youtube', 'kick', 'other');
CREATE TYPE stream_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE job_type AS ENUM ('ingest', 'transcribe', 'analyze_vision', 'score_highlights', 'generate_clips', 'render', 'publish');
CREATE TYPE clip_status AS ENUM ('draft', 'approved', 'rejected', 'published');
CREATE TYPE publish_platform AS ENUM ('youtube_shorts', 'tiktok', 'twitter', 'instagram_reels');

-- Performance settings (will be overridden by actual config)
-- These are just examples of what might be configured
COMMENT ON DATABASE clipforge IS 'ClipForge - AI Stream Clipper Database';

-- Log the initialization
DO $$ 
BEGIN
    RAISE NOTICE 'ClipForge database initialization completed successfully';
END $$;