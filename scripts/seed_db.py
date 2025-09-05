#!/usr/bin/env python3
"""
Database seeding script for ClipForge
Creates sample streamers, streams, and test data for development
"""

import os
import sys
import json
import asyncio
import asyncpg
from datetime import datetime, timedelta
from typing import List, Dict, Any
import uuid

# Database configuration from environment
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': int(os.getenv('POSTGRES_PORT', '5432')),
    'user': os.getenv('POSTGRES_USER', 'clipforge'),
    'password': os.getenv('POSTGRES_PASSWORD', 'clipforge_dev'),
    'database': os.getenv('POSTGRES_DB', 'clipforge')
}

# Sample data
SAMPLE_STREAMERS = [
    {
        'name': 'xQc',
        'display_name': 'xQcOW',
        'platform': 'twitch',
        'platform_id': 'xqcow',
        'avatar_url': 'https://static-cdn.jtvnw.net/jtv_user_pictures/xqcow-profile_image-9298dca608632101-300x300.jpeg',
        'description': 'Variety streamer and former Overwatch pro',
        'subscriber_count': 11500000,
        'is_active': True,
        'settings': {
            'auto_clip': True,
            'min_clip_duration': 15,
            'max_clip_duration': 60,
            'highlight_threshold': 0.7,
            'preferred_aspect_ratios': ['9:16', '1:1'],
            'auto_publish': False
        }
    },
    {
        'name': 'Pokimane',
        'display_name': 'pokimane',
        'platform': 'twitch',
        'platform_id': 'pokimane',
        'avatar_url': 'https://static-cdn.jtvnw.net/jtv_user_pictures/pokimane-profile_image-4f78704c09f7567c-300x300.png',
        'description': 'Variety content creator and gamer',
        'subscriber_count': 9200000,
        'is_active': True,
        'settings': {
            'auto_clip': True,
            'min_clip_duration': 20,
            'max_clip_duration': 45,
            'highlight_threshold': 0.8,
            'preferred_aspect_ratios': ['9:16'],
            'auto_publish': True
        }
    },
    {
        'name': 'Shroud',
        'display_name': 'shroud',
        'platform': 'twitch',
        'platform_id': 'shroud',
        'avatar_url': 'https://static-cdn.jtvnw.net/jtv_user_pictures/shroud-profile_image-7e4b7d5c8e4c4b4a-300x300.jpeg',
        'description': 'FPS gaming legend and content creator',
        'subscriber_count': 10100000,
        'is_active': True,
        'settings': {
            'auto_clip': True,
            'min_clip_duration': 10,
            'max_clip_duration': 30,
            'highlight_threshold': 0.75,
            'preferred_aspect_ratios': ['16:9', '9:16'],
            'auto_publish': False
        }
    },
    {
        'name': 'HasanAbi',
        'display_name': 'HasanAbi',
        'platform': 'twitch',
        'platform_id': 'hasanabi',
        'avatar_url': 'https://static-cdn.jtvnw.net/jtv_user_pictures/hasanabi-profile_image-f6c7c3f5c5c5c5c5-300x300.jpeg',
        'description': 'Political commentary and react content',
        'subscriber_count': 2100000,
        'is_active': True,
        'settings': {
            'auto_clip': True,
            'min_clip_duration': 30,
            'max_clip_duration': 90,
            'highlight_threshold': 0.6,
            'preferred_aspect_ratios': ['9:16', '1:1'],
            'auto_publish': True
        }
    },
    {
        'name': 'Ludwig',
        'display_name': 'Ludwig',
        'platform': 'youtube',
        'platform_id': 'UCHSRZk4k6e-S5Q3G5TyXAuw',
        'avatar_url': 'https://yt3.ggpht.com/ytc/AKedOLT8yGNlLb8k8k8k8k8k8k8k8k8k8k8k8k8k8k8=s300-c-k-c0x00ffffff-no-rj',
        'description': 'Gaming content creator and entertainer',
        'subscriber_count': 3500000,
        'is_active': True,
        'settings': {
            'auto_clip': True,
            'min_clip_duration': 25,
            'max_clip_duration': 60,
            'highlight_threshold': 0.8,
            'preferred_aspect_ratios': ['9:16'],
            'auto_publish': False
        }
    }
]

SAMPLE_STREAMS = [
    {
        'title': 'VALORANT RANKED GRIND - RADIANT OR BUST',
        'platform_url': 'https://www.twitch.tv/videos/1234567890',
        'platform_id': 'v1234567890',
        'duration': 14400,  # 4 hours
        'game_name': 'VALORANT',
        'viewer_count': 45000,
        'language': 'en',
        'tags': ['fps', 'competitive', 'ranked'],
        'thumbnail_url': 'https://static-cdn.jtvnw.net/cf_vods/d2nvs31859zcd8/twitchtracker/valorant_thumbnail.jpg'
    },
    {
        'title': 'Just Chatting with Chat - Q&A and Reacts',
        'platform_url': 'https://www.twitch.tv/videos/1234567891',
        'platform_id': 'v1234567891',
        'duration': 10800,  # 3 hours
        'game_name': 'Just Chatting',
        'viewer_count': 28000,
        'language': 'en',
        'tags': ['chatting', 'react', 'qa'],
        'thumbnail_url': 'https://static-cdn.jtvnw.net/cf_vods/d2nvs31859zcd8/twitchtracker/justchatting_thumbnail.jpg'
    },
    {
        'title': 'CS2 Premier Mode - Road to Global Elite',
        'platform_url': 'https://www.twitch.tv/videos/1234567892',
        'platform_id': 'v1234567892',
        'duration': 12600,  # 3.5 hours
        'game_name': 'Counter-Strike 2',
        'viewer_count': 67000,
        'language': 'en',
        'tags': ['fps', 'cs2', 'competitive'],
        'thumbnail_url': 'https://static-cdn.jtvnw.net/cf_vods/d2nvs31859zcd8/twitchtracker/cs2_thumbnail.jpg'
    },
    {
        'title': 'Political News Review and Commentary',
        'platform_url': 'https://www.twitch.tv/videos/1234567893',
        'platform_id': 'v1234567893',
        'duration': 16200,  # 4.5 hours
        'game_name': 'Just Chatting',
        'viewer_count': 15000,
        'language': 'en',
        'tags': ['politics', 'news', 'commentary'],
        'thumbnail_url': 'https://static-cdn.jtvnw.net/cf_vods/d2nvs31859zcd8/twitchtracker/politics_thumbnail.jpg'
    },
    {
        'title': 'Bro vs Pro Challenge - Gaming Skills Test',
        'platform_url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'platform_id': 'dQw4w9WgXcQ',
        'duration': 7200,  # 2 hours
        'game_name': 'Various Games',
        'viewer_count': 125000,
        'language': 'en',
        'tags': ['challenge', 'gaming', 'entertainment'],
        'thumbnail_url': 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
    }
]

SAMPLE_JOBS = [
    {
        'type': 'ingest_stream',
        'status': 'completed',
        'priority': 1,
        'data': {
            'stream_url': 'https://www.twitch.tv/videos/1234567890',
            'streamer_name': 'xQc',
            'quality': '720p'
        },
        'result': {
            'chunks_created': 24,
            'total_duration': 14400,
            'file_size': 2147483648
        },
        'error_message': None,
        'retry_count': 0,
        'max_retries': 3
    },
    {
        'type': 'generate_highlights',
        'status': 'processing',
        'priority': 2,
        'data': {
            'stream_id': None,  # Will be set after stream creation
            'min_score': 0.7,
            'max_clips': 10
        },
        'result': None,
        'error_message': None,
        'retry_count': 0,
        'max_retries': 3
    },
    {
        'type': 'render_clip',
        'status': 'pending',
        'priority': 3,
        'data': {
            'clip_id': None,  # Will be set after clip creation
            'aspect_ratio': '9:16',
            'quality': '1080p'
        },
        'result': None,
        'error_message': None,
        'retry_count': 0,
        'max_retries': 3
    }
]

class DatabaseSeeder:
    def __init__(self):
        self.conn = None
        
    async def connect(self):
        """Connect to PostgreSQL database"""
        try:
            self.conn = await asyncpg.connect(**DB_CONFIG)
            print(f"✅ Connected to database: {DB_CONFIG['database']}")
        except Exception as e:
            print(f"❌ Failed to connect to database: {e}")
            sys.exit(1)
    
    async def disconnect(self):
        """Close database connection"""
        if self.conn:
            await self.conn.close()
            print("✅ Database connection closed")
    
    async def check_tables_exist(self) -> bool:
        """Check if required tables exist"""
        tables = ['streamers', 'streams', 'chunks', 'clips']
        
        for table in tables:
            result = await self.conn.fetchval(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)",
                table
            )
            if not result:
                print(f"❌ Table '{table}' does not exist. Please run migrations first.")
                return False
        
        print("✅ All required tables exist")
        return True
    
    async def clear_existing_data(self):
        """Clear existing seed data (optional)"""
        print("🧹 Clearing existing data...")
        
        # Delete in reverse dependency order
        # await self.conn.execute("DELETE FROM jobs WHERE type LIKE 'seed_%'")  # TODO: Uncomment when jobs table is created
        await self.conn.execute("DELETE FROM clips WHERE id IN (SELECT id FROM clips WHERE \"created_at\" > NOW() - INTERVAL '1 day')")
        await self.conn.execute("DELETE FROM chunks WHERE id IN (SELECT id FROM chunks WHERE \"createdAt\" > NOW() - INTERVAL '1 day')")
        await self.conn.execute("DELETE FROM streams WHERE \"videoId\" LIKE 'v123456789%' OR \"videoId\" = 'dQw4w9WgXcQ'")
        await self.conn.execute("DELETE FROM streamers WHERE username IN ('xQc', 'Pokimane', 'Shroud', 'HasanAbi', 'Ludwig')")
        
        print("✅ Existing seed data cleared")
    
    async def seed_streamers(self) -> Dict[str, str]:
        """Insert sample streamers"""
        print("👤 Seeding streamers...")
        streamer_ids = {}
        
        for streamer_data in SAMPLE_STREAMERS:
            streamer_id = str(uuid.uuid4())
            
            await self.conn.execute("""
                INSERT INTO streamers (
                    id, username, "displayName", platform, "platformId", "avatarUrl",
                    description, "isActive", settings, "createdAt", "updatedAt"
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """, 
                streamer_id,
                streamer_data['name'],
                streamer_data['display_name'],
                streamer_data['platform'],
                streamer_data['platform_id'],
                streamer_data['avatar_url'],
                streamer_data['description'],
                streamer_data['is_active'],
                json.dumps(streamer_data['settings']),
                datetime.utcnow(),
                datetime.utcnow()
            )
            
            streamer_ids[streamer_data['name']] = streamer_id
            print(f"  ✅ Created streamer: {streamer_data['display_name']}")
        
        return streamer_ids
    
    async def seed_streams(self, streamer_ids: Dict[str, str]) -> List[str]:
        """Insert sample streams"""
        print("📺 Seeding streams...")
        stream_ids = []
        
        streamer_names = list(streamer_ids.keys())
        
        for i, stream_data in enumerate(SAMPLE_STREAMS):
            stream_id = str(uuid.uuid4())
            streamer_name = streamer_names[i % len(streamer_names)]
            streamer_id = streamer_ids[streamer_name]
            
            # Create stream start time (random time in the last 7 days)
            stream_start = datetime.utcnow() - timedelta(
                days=i + 1,
                hours=2,
                minutes=30
            )
            
            await self.conn.execute("""
                INSERT INTO streams (
                    id, "streamerId", title, "originalUrl", "videoId", duration,
                    platform, status, "thumbnailUrl", "localVideoPath", "fileSize",
                    "streamDate", "viewCount", metadata, "createdAt", "updatedAt"
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            """,
                stream_id,
                streamer_id,
                stream_data['title'],
                stream_data['platform_url'],
                stream_data['platform_id'],
                stream_data['duration'],
                'twitch' if 'twitch' in stream_data['platform_url'] else 'youtube',  # platform
                'completed',  # status
                stream_data['thumbnail_url'],
                f"/data/streams/{stream_data['platform_id']}.mp4",  # localVideoPath
                2147483648,  # fileSize (2GB)
                stream_start,
                stream_data['viewer_count'],
                json.dumps({
                    'game_name': stream_data['game_name'],
                    'language': stream_data['language'],
                    'tags': stream_data['tags']
                }),
                datetime.utcnow(),
                datetime.utcnow()
            )
            
            stream_ids.append(stream_id)
            print(f"  ✅ Created stream: {stream_data['title'][:50]}...")
        
        return stream_ids
    
    async def seed_chunks(self, stream_ids: List[str]) -> List[str]:
        """Insert sample chunks for streams"""
        print("🧩 Seeding chunks...")
        chunk_ids = []
        
        for stream_id in stream_ids:
            # Create 8-12 chunks per stream
            num_chunks = 10
            chunk_duration = 600  # 10 minutes per chunk
            
            for i in range(num_chunks):
                chunk_id = str(uuid.uuid4())
                start_time = i * chunk_duration
                end_time = start_time + chunk_duration
                
                await self.conn.execute("""
                    INSERT INTO chunks (
                        id, "streamId", title, description, "startTime", "endTime", duration, "videoPath",
                        transcription, "visualFeatures", "audioFeatures",
                        status, "createdAt", "updatedAt"
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                """,
                    chunk_id,
                    stream_id,
                    f"Chunk {i+1}",  # title
                    f"Video chunk {i+1} from stream",  # description
                    start_time,
                    end_time,
                    chunk_duration,
                    f"/data/chunks/{chunk_id}.mp4",
                    json.dumps({
                        "segments": [
                            {
                                "start": start_time,
                                "end": end_time,
                                "text": f"Sample transcription for chunk {i+1}",
                                "confidence": 0.95
                            }
                        ],
                        "language": "en"
                    }),
                    json.dumps({
                        "scene_cuts": [start_time + 120, start_time + 300, start_time + 480],
                        "face_detections": [
                            {"timestamp": start_time + 60, "confidence": 0.9, "bbox": [100, 100, 200, 200]}
                        ],
                        "motion_intensity": 0.7
                    }),
                    json.dumps({
                        "energy_level": 0.8,
                        "silence_ratio": 0.1,
                        "speech_ratio": 0.7
                    }),
                    'completed',
                    datetime.utcnow(),
                    datetime.utcnow()
                )
                
                chunk_ids.append(chunk_id)
        
        print(f"  ✅ Created {len(chunk_ids)} chunks")
        return chunk_ids
    
    async def seed_clips(self, chunk_ids: List[str], stream_ids: List[str]) -> List[str]:
        """Insert sample clips"""
        print("🎬 Seeding clips...")
        clip_ids = []
        
        # Create 2-3 clips per stream (using some chunks)
        selected_chunks = chunk_ids[::3]  # Every 3rd chunk
        
        for i, chunk_id in enumerate(selected_chunks[:15]):  # Limit to 15 clips
            clip_id = str(uuid.uuid4())
            # Get the stream_id for this chunk (chunks are created per stream)
            stream_id = stream_ids[i // 10] if i // 10 < len(stream_ids) else stream_ids[0]
            
            await self.conn.execute("""
                INSERT INTO clips (
                    id, "stream_id", "chunk_id", title, "start_time", "end_time", duration,
                    "highlight_score", "score_breakdown", status,
                    "source_file_path", "thumbnail_path", metadata,
                    "render_settings", "caption_settings",
                    "created_at", "updated_at"
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            """,
                clip_id,
                stream_id,  # stream_id
                chunk_id,
                f"Epic Highlight #{i+1}",
                30,  # start_time within chunk
                60,  # end_time within chunk
                30,  # duration
                0.85 + (i * 0.02),  # highlight_score
                json.dumps({
                    "audio_energy": 0.9,
                    "visual_activity": 0.8,
                    "speech_clarity": 0.85,
                    "face_presence": 0.7,
                    "scene_changes": 0.6
                }),
                'rendered',  # status
                f"/data/clips/{clip_id}.mp4",
                f"/data/clips/{clip_id}_thumb.jpg",
                json.dumps({
                    "tags": ["highlight", "gaming", "epic"],
                    "auto_generated": True,
                    "confidence": 0.85,
                    "aspect_ratio": "9:16"
                }),
                json.dumps({
                    "quality": "1080p",
                    "aspect_ratio": "9:16",
                    "fps": 30,
                    "bitrate": 5000
                }),
                json.dumps({
                    "enabled": True,
                    "font_size": 24,
                    "font_family": "Arial",
                    "position": "bottom",
                    "color": "#FFFFFF",
                    "background": "#000000"
                }),
                datetime.utcnow(),
                datetime.utcnow()
            )
            
            clip_ids.append(clip_id)
        
        print(f"  ✅ Created {len(clip_ids)} clips")
        return clip_ids
    
    # TODO: Uncomment when jobs table is created
    # async def seed_jobs(self, stream_ids: List[str], clip_ids: List[str]):
    #     """Insert sample jobs"""
    #     print("⚙️ Seeding jobs...")
    #     
    #     for i, job_data in enumerate(SAMPLE_JOBS):
    #         job_id = str(uuid.uuid4())
    #         
    #         # Update job data with actual IDs
    #         if job_data['type'] == 'generate_highlights' and stream_ids:
    #             job_data['data']['stream_id'] = stream_ids[0]
    #         elif job_data['type'] == 'render_clip' and clip_ids:
    #             job_data['data']['clip_id'] = clip_ids[0]
    #         
    #         # Set timestamps
    #         created_at = datetime.utcnow() - timedelta(hours=i)
    #         started_at = created_at + timedelta(minutes=5) if job_data['status'] != 'pending' else None
    #         completed_at = started_at + timedelta(minutes=30) if job_data['status'] == 'completed' else None
    #         
    #         await self.conn.execute("""
    #             INSERT INTO jobs (
    #                 id, type, status, priority, data, result, error_message,
    #                 retry_count, max_retries, created_at, started_at, completed_at, updated_at
    #             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    #         """,
    #             job_id,
    #             job_data['type'],
    #             job_data['status'],
    #             job_data['priority'],
    #             json.dumps(job_data['data']),
    #             json.dumps(job_data['result']) if job_data['result'] else None,
    #             job_data['error_message'],
    #             job_data['retry_count'],
    #             job_data['max_retries'],
    #             created_at,
    #             started_at,
    #             completed_at,
    #             datetime.utcnow()
    #         )
    #         
    #         print(f"  ✅ Created job: {job_data['type']} ({job_data['status']})")
    
    async def verify_seeded_data(self):
        """Verify that data was seeded correctly"""
        print("🔍 Verifying seeded data...")
        
        # Count records
        streamer_count = await self.conn.fetchval("SELECT COUNT(*) FROM streamers")
        stream_count = await self.conn.fetchval("SELECT COUNT(*) FROM streams")
        chunk_count = await self.conn.fetchval("SELECT COUNT(*) FROM chunks")
        clip_count = await self.conn.fetchval("SELECT COUNT(*) FROM clips")
        # job_count = await self.conn.fetchval("SELECT COUNT(*) FROM jobs")  # TODO: Uncomment when jobs table is created
        
        print(f"  📊 Streamers: {streamer_count}")
        print(f"  📊 Streams: {stream_count}")
        print(f"  📊 Chunks: {chunk_count}")
        print(f"  📊 Clips: {clip_count}")
        # print(f"  📊 Jobs: {job_count}")  # TODO: Uncomment when jobs table is created
        
        # Sample some data
        sample_streamer = await self.conn.fetchrow("SELECT username, \"displayName\" FROM streamers LIMIT 1")
        if sample_streamer:
            print(f"  🎯 Sample streamer: {sample_streamer['displayName']} ({sample_streamer['username']})")
        
        sample_stream = await self.conn.fetchrow("SELECT title, metadata FROM streams LIMIT 1")
        if sample_stream:
            metadata = json.loads(sample_stream['metadata']) if sample_stream['metadata'] else {}
            game_name = metadata.get('game_name', 'Unknown')
            print(f"  🎯 Sample stream: {sample_stream['title'][:40]}... ({game_name})")
        
        print("✅ Data verification complete")

async def main():
    """Main seeding function"""
    print("🌱 ClipForge Database Seeder")
    print("=" * 50)
    
    seeder = DatabaseSeeder()
    
    try:
        # Connect to database
        await seeder.connect()
        
        # Check if tables exist
        if not await seeder.check_tables_exist():
            print("❌ Please run database migrations first:")
            print("   docker compose exec orchestrator npm run typeorm:migrate")
            return
        
        # Optional: Clear existing data
        if len(sys.argv) > 1 and sys.argv[1] == '--clear':
            await seeder.clear_existing_data()
        
        # Seed data
        print("\n🚀 Starting data seeding...")
        
        streamer_ids = await seeder.seed_streamers()
        stream_ids = await seeder.seed_streams(streamer_ids)
        chunk_ids = await seeder.seed_chunks(stream_ids)
        clip_ids = await seeder.seed_clips(chunk_ids, stream_ids)
        # await seeder.seed_jobs(stream_ids, clip_ids)  # TODO: Uncomment when jobs table is created
        
        # Verify results
        print("\n" + "=" * 50)
        await seeder.verify_seeded_data()
        
        print("\n🎉 Database seeding completed successfully!")
        print("\nYou can now:")
        print("  • Access the web UI at http://localhost:3000")
        print("  • Use the API at http://localhost:3001")
        print("  • Test ingestion with scripts/ingest_local.sh")
        
    except Exception as e:
        print(f"❌ Seeding failed: {e}")
        sys.exit(1)
    
    finally:
        await seeder.disconnect()

if __name__ == "__main__":
    # Check for required packages
    try:
        import asyncpg
    except ImportError:
        print("❌ Missing required package: asyncpg")
        print("Install with: pip install asyncpg")
        sys.exit(1)
    
    # Run the seeder
    asyncio.run(main())