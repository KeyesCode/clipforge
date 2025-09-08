import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobType, JobStatus } from '../jobs/job.entity';
import { Stream, StreamStatus } from '../streams/stream.entity';
import { Chunk, ChunkStatus } from '../chunks/chunk.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

@Processor('ingest')
@Injectable()
export class IngestQueueProcessor {
  private readonly logger = new Logger(IngestQueueProcessor.name);

  constructor(
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
    @InjectRepository(Stream)
    private streamRepository: Repository<Stream>,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  @Process('download-stream')
  async handleDownloadStream(job: any) {
    const { streamId, url, platform, streamerName } = job.data;
    const jobId = job.id;
    
    this.logger.log(`Processing download job ${jobId} for stream ${streamId}`);

    let savedJob: Job | null = null;
    try {
      // Create job record in database
      const dbJob = this.jobRepository.create({
        type: JobType.DOWNLOAD_STREAM,
        status: JobStatus.PENDING,
        data: {
          streamId,
          url,
          platform,
          streamerName,
        },
        progress: 0,
        progressMessage: 'Starting download...',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      savedJob = await this.jobRepository.save(dbJob);
      this.logger.log(`Created job record ${savedJob.id} in database`);

      // Update job status to processing
      await this.jobRepository.update(savedJob.id, {
        status: JobStatus.PROCESSING,
        startedAt: new Date(),
        progressMessage: 'Downloading stream...',
      });

      // Call ingest service
      const ingestServiceUrl = this.configService.get<string>('INGEST_SERVICE_URL', 'http://localhost:8001');
      const ingestResponse = await firstValueFrom(
        this.httpService.post(`${ingestServiceUrl}/ingest`, {
          stream_url: url,
          stream_id: streamId,  // Pass the actual stream ID
          streamer_id: streamId, // Keep this for backward compatibility
          stream_title: `Stream from ${streamerName}`,
          job_id: jobId,
        })
      );

      this.logger.log(`Ingest service response for job ${savedJob.id}:`, (ingestResponse as any).data);

      // Update job status to completed
      await this.jobRepository.update(savedJob.id, {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        progress: 100,
        progressMessage: 'Download completed successfully',
      });

      // Update stream status to downloaded
      await this.streamRepository.update(streamId, {
        status: StreamStatus.DOWNLOADED,
        updatedAt: new Date(),
      });

      this.logger.log(`Job ${savedJob.id} completed successfully`);
      return { success: true, jobId: savedJob.id, streamId };

    } catch (error) {
      this.logger.error(`Job ${jobId} failed:`, error);
      
      // Update job status to failed (only if we have a saved job)
      if (savedJob) {
        await this.jobRepository.update(savedJob.id, {
          status: JobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }

      // Update stream status to failed
      await this.streamRepository.update(streamId, {
        status: StreamStatus.FAILED,
        updatedAt: new Date(),
      });

      throw error;
    }
  }

  @OnQueueActive()
  onActive(job: any) {
    this.logger.log(`Job ${job.id} started processing`);
  }

  @OnQueueCompleted()
  onCompleted(job: any, result: any) {
    this.logger.log(`Job ${job.id} completed:`, result);
  }

  @OnQueueFailed()
  onFailed(job: any, error: any) {
    this.logger.error(`Job ${job.id} failed:`, error);
  }
}

@Processor('processing')
@Injectable()
export class ProcessingQueueProcessor {
  private readonly logger = new Logger(ProcessingQueueProcessor.name);

  constructor(
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
    @InjectRepository(Stream)
    private streamRepository: Repository<Stream>,
    @InjectRepository(Chunk)
    private chunkRepository: Repository<Chunk>,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  @Process('process-stream')
  async handleProcessStream(job: any) {
    const { streamId } = job.data;
    const jobId = job.id;
    
    this.logger.log(`Processing stream job ${jobId} for stream ${streamId}`);

    let savedJob: Job | null = null;
    try {
      // Create job record in database
      const dbJob = this.jobRepository.create({
        type: JobType.PROCESS_STREAM,
        status: JobStatus.PENDING,
        data: { streamId },
        progress: 0,
        progressMessage: 'Starting stream processing...',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      savedJob = await this.jobRepository.save(dbJob);

      // Update job status to processing
      await this.jobRepository.update(savedJob.id, {
        status: JobStatus.PROCESSING,
        startedAt: new Date(),
        progressMessage: 'Processing stream...',
      });

      // Update stream status to processing
      await this.streamRepository.update(streamId, {
        status: StreamStatus.PROCESSING,
        updatedAt: new Date(),
      });

      // Get all chunks for this stream
      const chunks = await this.chunkRepository.find({
        where: { streamId },
        order: { startTime: 'ASC' },
      });

      if (chunks.length === 0) {
        throw new Error('No chunks found for processing');
      }

      this.logger.log(`Found ${chunks.length} chunks to process for stream ${streamId}`);

      // Process each chunk through the ML pipeline
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const progress = Math.round(((i + 1) / chunks.length) * 100);
        
        try {
          // Update chunk status to processing
          await this.chunkRepository.update(chunk.id, {
            status: ChunkStatus.PROCESSING,
            updatedAt: new Date(),
          });

          // Update job progress
          await this.jobRepository.update(savedJob.id, {
            progress: Math.round((i / chunks.length) * 100),
            progressMessage: `Processing chunk ${i + 1}/${chunks.length}: ${chunk.title}`,
          });

          // Step 1: ASR Service - Speech recognition and transcription
          this.logger.log(`Starting ASR processing for chunk ${chunk.id}`);
          await this.processASR(chunk);
          
          await this.chunkRepository.update(chunk.id, {
            status: ChunkStatus.TRANSCRIBED,
            transcribedAt: new Date(),
          });

          // Step 2: Vision Service - Visual analysis and scene detection
          this.logger.log(`Starting Vision processing for chunk ${chunk.id}`);
          await this.processVision(chunk);
          
          await this.chunkRepository.update(chunk.id, {
            status: ChunkStatus.ANALYZED,
            analyzedAt: new Date(),
          });

          // Update job progress
          await this.jobRepository.update(savedJob.id, {
            progress: Math.round(((i + 0.8) / chunks.length) * 100),
            progressMessage: `Chunk ${i + 1}/${chunks.length} analyzed, starting scoring...`,
          });

        } catch (error) {
          this.logger.error(`Failed to process chunk ${chunk.id}:`, error);
          await this.chunkRepository.update(chunk.id, {
            status: ChunkStatus.FAILED,
            errorMessage: error instanceof Error ? error.message : String(error),
            retryCount: chunk.retryCount + 1,
          });
          // Continue with other chunks instead of failing the entire job
          continue;
        }
      }

      // Step 3: Scoring Service - Score all chunks together for ranking
      this.logger.log(`Starting Scoring analysis for stream ${streamId}`);
      try {
        await this.processScoring(streamId, chunks);
        
        // Update all successfully processed chunks to scored status
        await this.chunkRepository.update(
          { streamId, status: ChunkStatus.ANALYZED },
          { status: ChunkStatus.SCORED, scoredAt: new Date() }
        );
      } catch (error) {
        this.logger.error(`Scoring failed for stream ${streamId}:`, error);
        // Don't fail the job, but log the error
      }

      // Step 4: Render Service - Create highlight clips from top-scored chunks
      this.logger.log(`Starting Render processing for stream ${streamId}`);
      try {
        const topChunks = await this.chunkRepository.find({
          where: { streamId, status: ChunkStatus.SCORED },
          order: { highlightScore: 'DESC' },
          take: 5, // Render top 5 highlights
        });

        for (const chunk of topChunks) {
          if ((chunk.highlightScore ?? 0) > 0.5) { // Only render high-scoring chunks
            await this.processRender(chunk);
          }
        }

        // Mark processed chunks as completed
        await this.chunkRepository.update(
          { streamId, status: ChunkStatus.SCORED },
          { status: ChunkStatus.COMPLETED, processedAt: new Date() }
        );
      } catch (error) {
        this.logger.error(`Render processing failed for stream ${streamId}:`, error);
        // Don't fail the job, but log the error
      }

      // Update job status to completed
      await this.jobRepository.update(savedJob.id, {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        progress: 100,
        progressMessage: 'Stream processing completed',
      });

      // Update stream status to completed
      await this.streamRepository.update(streamId, {
        status: StreamStatus.COMPLETED,
        updatedAt: new Date(),
      });

      this.logger.log(`Processing job ${savedJob.id} completed successfully`);
      return { success: true, jobId: savedJob.id, streamId };

    } catch (error) {
      this.logger.error(`Processing job ${jobId} failed:`, error);
      
      // Update job status to failed (only if we have a saved job)
      if (savedJob) {
        await this.jobRepository.update(savedJob.id, {
          status: JobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }

      // Update stream status to failed
      await this.streamRepository.update(streamId, {
        status: StreamStatus.FAILED,
        updatedAt: new Date(),
      });

      throw error;
    }
  }

  /**
   * Process chunk through ASR (Automatic Speech Recognition) service
   */
  private async processASR(chunk: Chunk): Promise<void> {
    const asrServiceUrl = this.configService.get<string>('ASR_SERVICE_URL', 'http://localhost:8002');
    
    // Use audioPath if available, otherwise fallback to videoPath (ASR can extract audio from video)
    const audioPath = chunk.audioPath || chunk.videoPath;
    
    if (!audioPath) {
      throw new Error(`No audio or video path available for chunk ${chunk.id}`);
    }
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${asrServiceUrl}/transcribe`, {
          chunkId: chunk.id,
          audioPath: audioPath,
          streamId: chunk.streamId,
        })
      );

      this.logger.log(`ASR completed for chunk ${chunk.id}`);
      // The ASR service will webhook back to us with transcription results
      
    } catch (error) {
      this.logger.error(`ASR service failed for chunk ${chunk.id}:`, error);
      throw error;
    }
  }

  /**
   * Process chunk through Vision service
   */
  private async processVision(chunk: Chunk): Promise<void> {
    const visionServiceUrl = this.configService.get<string>('VISION_SERVICE_URL', 'http://localhost:8003');
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${visionServiceUrl}/analyze`, {
          chunkId: chunk.id,
          videoPath: chunk.videoPath,
          streamId: chunk.streamId,
        })
      );

      this.logger.log(`Vision analysis completed for chunk ${chunk.id}`);
      // The Vision service will webhook back to us with analysis results
      
    } catch (error) {
      this.logger.error(`Vision service failed for chunk ${chunk.id}:`, error);
      throw error;
    }
  }

  /**
   * Process all chunks through Scoring service
   */
  private async processScoring(streamId: string, chunks: Chunk[]): Promise<void> {
    const scoringServiceUrl = this.configService.get<string>('SCORING_SERVICE_URL', 'http://localhost:8004');
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${scoringServiceUrl}/score-batch`, {
          streamId,
          chunks: chunks.map(chunk => ({
            chunkId: chunk.id,
            chunkData: {
              startTime: chunk.startTime,
              duration: chunk.duration,
              transcription: chunk.transcription,
              audioFeatures: chunk.audioFeatures,
              vision: chunk.visionAnalysis,
              metadata: {
                chunkIndex: chunks.indexOf(chunk),
                streamDuration: chunks.reduce((total, c) => total + c.duration, 0),
              }
            }
          })),
        })
      );

      this.logger.log(`Scoring completed for stream ${streamId} with ${chunks.length} chunks`);
      // The Scoring service will webhook back to us with highlight scores
      
    } catch (error) {
      this.logger.error(`Scoring service failed for stream ${streamId}:`, error);
      throw error;
    }
  }

  /**
   * Process chunk through Render service
   */
  private async processRender(chunk: Chunk): Promise<void> {
    const renderServiceUrl = this.configService.get<string>('RENDER_SERVICE_URL', 'http://localhost:8005');
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${renderServiceUrl}/render`, {
          clipId: chunk.id,
          sourceVideo: chunk.videoPath,
          startTime: chunk.startTime,
          duration: chunk.duration,
          renderConfig: {
            format: 'mp4',
            resolution: '1080p',
            platform: 'youtube_shorts',
          },
          captions: {
            segments: chunk.transcription?.segments || [],
            style: 'gaming',
          },
          effects: [],
        })
      );

      this.logger.log(`Render started for chunk ${chunk.id}`);
      // The Render service will webhook back to us with the rendered clip
      
    } catch (error) {
      this.logger.error(`Render service failed for chunk ${chunk.id}:`, error);
      throw error;
    }
  }
}
