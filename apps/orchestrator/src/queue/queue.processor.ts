import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobType, JobStatus } from '../jobs/job.entity';
import { Stream, StreamStatus } from '../streams/stream.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

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
      const ingestResponse = await firstValueFrom(
        this.httpService.post('http://clipforge_ingest:8001/ingest', {
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

      // Simulate processing work
      await new Promise(resolve => setTimeout(resolve, 5000));

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
}
