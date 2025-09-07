import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { HttpModule } from '@nestjs/axios';
import { join } from 'path';
import { diskStorage } from 'multer';

// Services
import { S3Service } from './common/services/s3.service';

// Feature modules
import { StreamersModule } from './streamers/streamers.module';
import { StreamsModule } from './streams/streams.module';
import { ChunksModule } from './chunks/chunks.module';
import { ClipsModule } from './clips/clips.module';
import { JobsModule } from './jobs/jobs.module';
import { QueueModule } from './queue/queue.module';
import { ProcessingModule } from './processing/processing.module';

// Database entities
import { Streamer } from './streamers/streamer.entity';
import { Stream } from './streams/stream.entity';
import { Chunk } from './chunks/chunk.entity';
import { Clip } from './clips/clip.entity';
import { Job } from './jobs/job.entity';
import { Queue } from './queue/queue.entity';

@Module({
  imports: [
    // Configuration module - loads environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database configuration with TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: configService.get('DATABASE_PORT', 5432),
        username: configService.get('DATABASE_USERNAME', 'clipforge'),
        password: configService.get('DATABASE_PASSWORD', 'clipforge'),
        database: configService.get('DATABASE_NAME', 'clipforge'),
        entities: [Streamer, Stream, Chunk, Clip, Job, Queue],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
        migrations: ['dist/migrations/*.js'],
        migrationsRun: false,
      }),
      inject: [ConfigService],
    }),

    // Redis Bull Queue configuration
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('QUEUE_REDIS_HOST', 'localhost'),
          port: configService.get('QUEUE_REDIS_PORT', 6379),
          db: configService.get('QUEUE_REDIS_DB', 0),
          password: configService.get('QUEUE_REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),

    // File upload configuration with Multer
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        storage: diskStorage({
          destination: configService.get('UPLOAD_PATH', './uploads'),
          filename: (req, file, callback) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            callback(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
          },
        }),
        limits: {
          fileSize: configService.get('MAX_FILE_SIZE', 1024 * 1024 * 1024), // 1GB default
        },
        fileFilter: (req, file, callback) => {
          // Allow video files and subtitle files
          const allowedMimes = [
            'video/mp4',
            'video/webm',
            'video/avi',
            'video/mov',
            'video/mkv',
            'text/plain',
            'application/x-subrip',
          ];
          if (allowedMimes.includes(file.mimetype)) {
            callback(null, true);
          } else {
            callback(new Error('Invalid file type'), false);
          }
        },
      }),
      inject: [ConfigService],
    }),

    // Note: Static file serving removed - now using S3 URLs directly

    // HTTP Module for external service calls
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),

    // Feature modules
    StreamersModule,
    StreamsModule,
    ChunksModule,
    ClipsModule,
    JobsModule,
    QueueModule,
    ProcessingModule,
  ],
  controllers: [],
  providers: [S3Service],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    // Log configuration on startup
    console.log('🚀 ClipForge Orchestrator Starting...');
    console.log(`📊 Environment: ${this.configService.get('NODE_ENV', 'development')}`);
    console.log(`🗄️  Database: ${this.configService.get('DATABASE_HOST')}:${this.configService.get('DATABASE_PORT')}`);
    console.log(`🔄 Redis Queue: ${this.configService.get('QUEUE_REDIS_HOST')}:${this.configService.get('QUEUE_REDIS_PORT')}`);
    console.log(`📁 Upload Path: ${this.configService.get('UPLOAD_PATH', './uploads')}`);
    
    // Log microservice endpoints
    console.log('🔗 Microservice Endpoints:');
    console.log(`  📥 Ingest: ${this.configService.get('INGEST_SERVICE_URL', 'http://localhost:3001')}`);
    console.log(`  🎤 ASR: ${this.configService.get('ASR_SERVICE_URL', 'http://localhost:3002')}`);
    console.log(`  👁️  Vision: ${this.configService.get('VISION_SERVICE_URL', 'http://localhost:3003')}`);
    console.log(`  🎯 Scoring: ${this.configService.get('SCORING_SERVICE_URL', 'http://localhost:3004')}`);
    console.log(`  🎬 Render: ${this.configService.get('RENDER_SERVICE_URL', 'http://localhost:3005')}`);
    
    // Log processing configuration
    console.log('⚙️  Processing Configuration:');
    console.log(`  🔢 Max Concurrent Jobs: ${this.configService.get('MAX_CONCURRENT_JOBS', 5)}`);
    console.log(`  ⏱️  Chunk Duration: ${this.configService.get('CHUNK_DURATION_SECONDS', 30)}s`);
    console.log(`  📏 Clip Duration: ${this.configService.get('MIN_CLIP_DURATION_SECONDS', 15)}s - ${this.configService.get('MAX_CLIP_DURATION_SECONDS', 60)}s`);
  }
}