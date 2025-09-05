import 'reflect-metadata';
import 'dotenv/config';
import { Logger } from 'winston';
import { createLogger, format, transports } from 'winston';
import Redis from 'ioredis';
import Queue from 'bull';
import { YouTubePublisher } from './youtube';
import { XPublisher } from './x';

// Types for job data
interface PublishJobData {
  clipId: string;
  platform: 'youtube' | 'x';
  videoPath: string;
  thumbnailPath?: string;
  title: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface PublishResult {
  success: boolean;
  platformId?: string;
  url?: string;
  error?: string;
}

class PublisherService {
  private logger: Logger;
  private redis: Redis;
  private publishQueue: Queue.Queue<PublishJobData>;
  private youtubePublisher: YouTubePublisher;
  private xPublisher: XPublisher;

  constructor() {
    this.setupLogger();
    this.setupRedis();
    this.setupQueue();
    this.setupPublishers();
  }

  private setupLogger(): void {
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
      ),
      defaultMeta: { service: 'publisher' },
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.simple()
          )
        }),
        new transports.File({ 
          filename: 'logs/publisher-error.log', 
          level: 'error' 
        }),
        new transports.File({ 
          filename: 'logs/publisher-combined.log' 
        })
      ]
    });
  }

  private setupRedis(): void {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    };

    this.redis = new Redis(redisConfig);

    this.redis.on('connect', () => {
      this.logger.info('Connected to Redis');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });
  }

  private setupQueue(): void {
    this.publishQueue = new Queue('publish', {
      redis: {
        host: process.env.QUEUE_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.QUEUE_REDIS_PORT || process.env.REDIS_PORT || '6379'),
        db: parseInt(process.env.QUEUE_REDIS_DB || '1'),
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Process publish jobs
    this.publishQueue.process('publish-clip', 5, async (job) => {
      return this.processPublishJob(job.data);
    });

    // Queue event handlers
    this.publishQueue.on('completed', (job, result) => {
      this.logger.info(`Job ${job.id} completed successfully`, { 
        jobId: job.id, 
        clipId: job.data.clipId,
        platform: job.data.platform,
        result 
      });
    });

    this.publishQueue.on('failed', (job, error) => {
      this.logger.error(`Job ${job.id} failed`, { 
        jobId: job.id, 
        clipId: job.data.clipId,
        platform: job.data.platform,
        error: error.message 
      });
    });

    this.publishQueue.on('stalled', (job) => {
      this.logger.warn(`Job ${job.id} stalled`, { 
        jobId: job.id, 
        clipId: job.data.clipId 
      });
    });
  }

  private setupPublishers(): void {
    this.youtubePublisher = new YouTubePublisher({
      clientId: process.env.YOUTUBE_CLIENT_ID!,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirectUri: process.env.YOUTUBE_REDIRECT_URI!,
      refreshToken: process.env.YOUTUBE_REFRESH_TOKEN!,
    });

    this.xPublisher = new XPublisher({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: process.env.X_ACCESS_TOKEN!,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
    });
  }

  private async processPublishJob(data: PublishJobData): Promise<PublishResult> {
    this.logger.info(`Processing publish job for clip ${data.clipId} on ${data.platform}`);

    try {
      let result: PublishResult;

      switch (data.platform) {
        case 'youtube':
          result = await this.youtubePublisher.publishShort({
            videoPath: data.videoPath,
            thumbnailPath: data.thumbnailPath,
            title: data.title,
            description: data.description,
            tags: data.tags,
            metadata: data.metadata,
          });
          break;

        case 'x':
          result = await this.xPublisher.publishVideo({
            videoPath: data.videoPath,
            text: data.title,
            metadata: data.metadata,
          });
          break;

        default:
          throw new Error(`Unsupported platform: ${data.platform}`);
      }

      // Update clip status in orchestrator
      await this.updateClipStatus(data.clipId, data.platform, result);

      return result;
    } catch (error) {
      this.logger.error(`Failed to publish clip ${data.clipId} on ${data.platform}:`, error);
      
      // Update clip status with error
      await this.updateClipStatus(data.clipId, data.platform, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  private async updateClipStatus(
    clipId: string, 
    platform: string, 
    result: PublishResult
  ): Promise<void> {
    try {
      const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:3000';
      const axios = require('axios');

      await axios.patch(`${orchestratorUrl}/api/clips/${clipId}/publish-status`, {
        platform,
        status: result.success ? 'published' : 'failed',
        platformId: result.platformId,
        url: result.url,
        error: result.error,
        publishedAt: result.success ? new Date().toISOString() : null,
      });

      this.logger.info(`Updated clip ${clipId} status for ${platform}`, result);
    } catch (error) {
      this.logger.error(`Failed to update clip ${clipId} status:`, error);
    }
  }

  public async addPublishJob(data: PublishJobData): Promise<void> {
    await this.publishQueue.add('publish-clip', data, {
      priority: data.platform === 'youtube' ? 10 : 5, // YouTube has higher priority
      delay: 0,
    });

    this.logger.info(`Added publish job for clip ${data.clipId} on ${data.platform}`);
  }

  public async getQueueStats(): Promise<any> {
    const waiting = await this.publishQueue.getWaiting();
    const active = await this.publishQueue.getActive();
    const completed = await this.publishQueue.getCompleted();
    const failed = await this.publishQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  }

  public async start(): Promise<void> {
    this.logger.info('Starting Publisher Service...');
    
    // Health check endpoint
    const express = require('express');
    const app = express();
    const port = process.env.PORT || 3002;

    app.use(express.json());

    // Health check
    app.get('/health', (req: any, res: any) => {
      res.json({ 
        status: 'healthy', 
        service: 'publisher',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // Queue stats
    app.get('/stats', async (req: any, res: any) => {
      try {
        const stats = await this.getQueueStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get queue stats' });
      }
    });

    // Manual publish endpoint (for testing)
    app.post('/publish', async (req: any, res: any) => {
      try {
        await this.addPublishJob(req.body);
        res.json({ success: true, message: 'Job added to queue' });
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    app.listen(port, () => {
      this.logger.info(`Publisher service listening on port ${port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      this.logger.info('Received SIGTERM, shutting down gracefully...');
      await this.publishQueue.close();
      await this.redis.disconnect();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      this.logger.info('Received SIGINT, shutting down gracefully...');
      await this.publishQueue.close();
      await this.redis.disconnect();
      process.exit(0);
    });

    this.logger.info('Publisher Service started successfully');
  }
}

// Bootstrap the service
async function bootstrap(): Promise<void> {
  try {
    const publisherService = new PublisherService();
    await publisherService.start();
  } catch (error) {
    console.error('Failed to start Publisher Service:', error);
    process.exit(1);
  }
}

// Start the service if this file is run directly
if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  });
}

export { PublisherService, PublishJobData, PublishResult };