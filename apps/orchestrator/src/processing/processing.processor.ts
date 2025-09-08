import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { 
  ProcessingJobData, 
  ASRJobData, 
  VisionJobData, 
  ScoringJobData, 
  RenderingJobData 
} from './processing.service';

@Processor('processing')
export class ProcessingProcessor {
  private readonly logger = new Logger(ProcessingProcessor.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  @Process('asr-chunk')
  async processASR(job: Job<ASRJobData>) {
    const { streamId, chunkId, audioS3Url, audioS3Key } = job.data;
    
    this.logger.log(`Processing ASR job for chunk: ${chunkId}`);

    try {
      // Call ASR service
      const asrServiceUrl = this.configService.get<string>('ASR_SERVICE_URL');
      
      const response = await firstValueFrom(
        this.httpService.post(`${asrServiceUrl}/transcribe`, {
          chunkId,
          audioPath: audioS3Url,
          streamId, // Add streamId for ASR service
          language: 'en', // TODO: Make configurable
          options: {
            beam_size: 5,
            best_of: 5,
            temperature: 0.0,
          },
        })
      );

      // Poll for result
      let result = null;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max wait

      while (!result && attempts < maxAttempts) {
        await this.sleep(5000); // Wait 5 seconds
        
        try {
          const resultResponse = await firstValueFrom(
            this.httpService.get(`${asrServiceUrl}/transcription/${chunkId}`)
          );
          
          if (resultResponse.data.status === 'completed') {
            result = resultResponse.data;
            break;
          } else if (resultResponse.data.status === 'failed') {
            throw new Error(`ASR failed: ${resultResponse.data.error}`);
          }
        } catch (error: any) {
          if (error.response?.status !== 404) {
            throw error;
          }
        }
        
        attempts++;
      }

      if (!result) {
        throw new Error(`ASR timed out after ${maxAttempts * 5} seconds`);
      }

      this.logger.log(`ASR completed for chunk ${chunkId}`);

      // Notify orchestrator via webhook
      await this.notifyWebhook('processing/webhooks/asr-complete', {
        streamId,
        chunkId,
        result: result.transcription,
      });

      return result;

    } catch (error: any) {
      this.logger.error(`ASR job failed for chunk ${chunkId}:`, error.message);
      throw error;
    }
  }

  @Process('vision-chunk')
  async processVision(job: Job<VisionJobData>) {
    const { streamId, chunkId, videoS3Url, videoS3Key } = job.data;
    
    this.logger.log(`Processing Vision job for chunk: ${chunkId}`);

    try {
      // Call Vision service
      const visionServiceUrl = this.configService.get<string>('VISION_SERVICE_URL');
      
      const response = await firstValueFrom(
        this.httpService.post(`${visionServiceUrl}/analyze`, {
          chunkId,
          videoPath: videoS3Url,
          streamId, // Add streamId for Vision service
          analysisType: 'full', // Scene detection + face detection
        })
      );

      // Poll for result
      let result = null;
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max wait (vision takes longer)

      while (!result && attempts < maxAttempts) {
        await this.sleep(5000);
        
        try {
          const resultResponse = await firstValueFrom(
            this.httpService.get(`${visionServiceUrl}/analysis/${chunkId}`)
          );
          
          if (resultResponse.data.status === 'completed') {
            result = resultResponse.data;
            break;
          } else if (resultResponse.data.status === 'failed') {
            throw new Error(`Vision analysis failed: ${resultResponse.data.error}`);
          }
        } catch (error: any) {
          if (error.response?.status !== 404) {
            throw error;
          }
        }
        
        attempts++;
      }

      if (!result) {
        throw new Error(`Vision analysis timed out after ${maxAttempts * 5} seconds`);
      }

      this.logger.log(`Vision analysis completed for chunk ${chunkId}`);

      // Notify orchestrator via webhook
      await this.notifyWebhook('processing/webhooks/vision-complete', {
        streamId,
        chunkId,
        result: result.analysis,
      });

      return result;

    } catch (error: any) {
      this.logger.error(`Vision job failed for chunk ${chunkId}:`, error.message);
      throw error;
    }
  }

  @Process('scoring-stream')
  async processScoring(job: Job<ScoringJobData>) {
    const { streamId, chunks } = job.data;
    
    this.logger.log(`Processing Scoring job for stream: ${streamId}`);

    try {
      // Call Scoring service
      const scoringServiceUrl = this.configService.get<string>('SCORING_SERVICE_URL');
      
      const response = await firstValueFrom(
        this.httpService.post(`${scoringServiceUrl}/score-batch`, {
          streamId,
          chunks: chunks.map(chunk => ({
            chunkId: chunk.chunkId,
            chunkData: {
              transcription: chunk.transcription,
              vision: chunk.vision,
              audioFeatures: chunk.audioFeatures,
              duration: chunk.duration,
              startTime: chunk.startTime,
            },
          })),
        })
      );

      // Poll for result
      let result = null;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max wait

      while (!result && attempts < maxAttempts) {
        await this.sleep(5000);
        
        try {
          const resultResponse = await firstValueFrom(
            this.httpService.get(`${scoringServiceUrl}/highlights/${streamId}`)
          );
          
          if (resultResponse.data.status === 'completed') {
            result = resultResponse.data;
            break;
          } else if (resultResponse.data.status === 'failed') {
            throw new Error(`Scoring failed: ${resultResponse.data.error}`);
          }
        } catch (error: any) {
          if (error.response?.status !== 404) {
            throw error;
          }
        }
        
        attempts++;
      }

      if (!result) {
        throw new Error(`Scoring timed out after ${maxAttempts * 5} seconds`);
      }

      this.logger.log(`Scoring completed for stream ${streamId}`);

      // Notify orchestrator via webhook
      await this.notifyWebhook('processing/webhooks/scoring-complete', {
        streamId,
        result: result.highlights,
      });

      return result;

    } catch (error: any) {
      this.logger.error(`Scoring job failed for stream ${streamId}:`, error.message);
      throw error;
    }
  }

  @Process('render-clip')
  async processRendering(job: Job<RenderingJobData>) {
    const { streamId, clipId, sourceChunkId, startTime, duration, scoreData } = job.data;
    
    this.logger.log(`Processing Rendering job for clip: ${clipId}`);

    try {
      // Call Render service
      const renderServiceUrl = this.configService.get<string>('RENDER_SERVICE_URL');
      
      // Get source chunk details
      const sourceVideoUrl = scoreData.sourceVideoUrl || `http://localhost:4566/clipforge-storage/chunks/${streamId}/${sourceChunkId}.mp4`;
      
      const response = await firstValueFrom(
        this.httpService.post(`${renderServiceUrl}/render`, {
          clipId,
          sourceVideo: sourceVideoUrl,
          startTime,
          duration,
          renderConfig: {
            format: 'mp4',
            resolution: '1080p',
            platform: 'youtube_shorts', // Default, could be configurable
          },
          captions: {
            segments: scoreData.transcription?.segments || [],
            style: 'gaming',
          },
          effects: scoreData.effects || [],
        })
      );

      // Poll for result
      let result = null;
      let attempts = 0;
      const maxAttempts = 240; // 20 minutes max wait (rendering is slow)

      while (!result && attempts < maxAttempts) {
        await this.sleep(5000);
        
        try {
          const resultResponse = await firstValueFrom(
            this.httpService.get(`${renderServiceUrl}/render/${clipId}`)
          );
          
          if (resultResponse.data.status === 'completed') {
            result = resultResponse.data;
            break;
          } else if (resultResponse.data.status === 'failed') {
            throw new Error(`Rendering failed: ${resultResponse.data.error}`);
          }
        } catch (error: any) {
          if (error.response?.status !== 404) {
            throw error;
          }
        }
        
        attempts++;
      }

      if (!result) {
        throw new Error(`Rendering timed out after ${maxAttempts * 5} seconds`);
      }

      this.logger.log(`Rendering completed for clip ${clipId}`);

      // Notify orchestrator via webhook
      await this.notifyWebhook('processing/webhooks/rendering-complete', {
        clipId,
        result: {
          renderedS3Url: result.outputPath,
          thumbnailS3Url: result.thumbnailPath,
          metadata: result.metadata,
        },
      });

      return result;

    } catch (error: any) {
      this.logger.error(`Rendering job failed for clip ${clipId}:`, error.message);
      throw error;
    }
  }

  /**
   * Helper method to notify orchestrator webhooks
   */
  private async notifyWebhook(endpoint: string, data: any): Promise<void> {
    try {
      const orchestratorUrl = this.configService.get<string>('ORCHESTRATOR_URL', 'http://localhost:3001');
      await firstValueFrom(
        this.httpService.post(`${orchestratorUrl}/api/v1/${endpoint}`, data)
      );
    } catch (error: any) {
      this.logger.error(`Failed to notify webhook ${endpoint}:`, error.message);
      // Don't throw - webhook failure shouldn't fail the job
    }
  }

  /**
   * Helper method for async sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}