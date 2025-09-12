import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobType, JobStatus } from '../jobs/job.entity';
import { Stream, StreamStatus } from '../streams/stream.entity';
import { Chunk, ChunkStatus } from '../chunks/chunk.entity';
import { Clip, ClipStatus, ClipAspectRatio } from '../clips/clip.entity';
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
    @InjectRepository(Clip)
    private clipRepository: Repository<Clip>,
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
        // Get fresh chunk data with updated transcription and vision analysis
        const freshChunks = await this.chunkRepository.find({
          where: { streamId, status: ChunkStatus.ANALYZED },
          order: { startTime: 'ASC' },
        });
        
        await this.processScoring(streamId, freshChunks);
        
        // Update all successfully processed chunks to scored status
        await this.chunkRepository.update(
          { streamId, status: ChunkStatus.ANALYZED },
          { status: ChunkStatus.SCORED, scoredAt: new Date() }
        );
      } catch (error) {
        this.logger.error(`Scoring failed for stream ${streamId}:`, error);
        // Don't fail the job, but log the error
      }

      // Step 4: Render Service - Now handled via segment-based rendering in scoring step
      this.logger.log(`Segment-based rendering already processed during scoring for stream ${streamId}`);
      
      // Mark processed chunks as completed
      try {
        await this.chunkRepository.update(
          { streamId, status: ChunkStatus.SCORED },
          { status: ChunkStatus.COMPLETED, processedAt: new Date() }
        );
        this.logger.log(`Marked chunks as completed for stream ${streamId}`);
      } catch (error) {
        this.logger.error(`Failed to mark chunks as completed for stream ${streamId}:`, error);
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

      // ASR service returns "accepted" response, we need to poll for completion
      const asrResult = response.data;
      this.logger.log(`ASR job accepted for chunk ${chunk.id}:`, JSON.stringify(asrResult, null, 2));
      
      if (asrResult && asrResult.status === 'accepted') {
        // Poll for ASR completion and get results
        const transcriptionResult = await this.pollASRCompletion(asrServiceUrl, chunk.id);
        if (transcriptionResult && transcriptionResult.transcription) {
          await this.chunkRepository.update(chunk.id, {
            transcription: transcriptionResult.transcription,
            updatedAt: new Date(),
          });
          this.logger.log(`Saved ASR transcription for chunk ${chunk.id}`);
        } else {
          this.logger.warn(`No transcription data received for chunk ${chunk.id}`);
        }
      } else {
        this.logger.warn(`Unexpected ASR response format for chunk ${chunk.id}`);
      }

      this.logger.log(`ASR completed for chunk ${chunk.id}`);
      
    } catch (error) {
      this.logger.error(`ASR service failed for chunk ${chunk.id}:`, error);
      throw error;
    }
  }

  /**
   * Poll ASR service for completion and get transcription results
   */
  private async pollASRCompletion(asrServiceUrl: string, chunkId: string): Promise<any> {
    const maxRetries = 30; // 5 minutes at 10 second intervals
    const pollInterval = 10000; // 10 seconds
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const statusResponse = await firstValueFrom(
          this.httpService.get(`${asrServiceUrl}/transcription/${chunkId}`)
        );
        
        const statusData = statusResponse.data;
        
        if (statusData.status === 'completed' && statusData.transcription) {
          this.logger.log(`ASR polling successful for chunk ${chunkId} after ${attempt + 1} attempts`);
          return statusData;
        } else if (statusData.status === 'failed') {
          this.logger.error(`ASR processing failed for chunk ${chunkId}: ${statusData.error || 'Unknown error'}`);
          return null;
        }
        
        // Still processing, continue polling
        this.logger.log(`ASR still processing for chunk ${chunkId}, attempt ${attempt + 1}/${maxRetries}`);
        
      } catch (error) {
        this.logger.warn(`ASR polling error for chunk ${chunkId}, attempt ${attempt + 1}:`, error);
        // Continue polling unless it's the last attempt
        if (attempt === maxRetries - 1) {
          throw error;
        }
      }
    }
    
    this.logger.error(`ASR polling timeout for chunk ${chunkId} after ${maxRetries} attempts`);
    return null;
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

      // Vision service returns "accepted" response, we need to poll for completion
      const visionResult = response.data;
      this.logger.log(`Vision job accepted for chunk ${chunk.id}:`, JSON.stringify(visionResult, null, 2));
      
      if (visionResult && visionResult.status === 'accepted') {
        // Poll for Vision completion and get results
        const analysisResult = await this.pollVisionCompletion(visionServiceUrl, chunk.id);
        if (analysisResult && analysisResult.analysis) {
          await this.chunkRepository.update(chunk.id, {
            visionAnalysis: analysisResult.analysis,
            updatedAt: new Date(),
          });
          this.logger.log(`Saved Vision analysis for chunk ${chunk.id}`);
        } else {
          this.logger.warn(`No analysis data received for chunk ${chunk.id}`);
        }
      } else {
        this.logger.warn(`Unexpected Vision response format for chunk ${chunk.id}`);
      }

      this.logger.log(`Vision analysis completed for chunk ${chunk.id}`);
      
    } catch (error) {
      this.logger.error(`Vision service failed for chunk ${chunk.id}:`, error);
      throw error;
    }
  }

  /**
   * Poll Vision service for completion and get analysis results
   */
  private async pollVisionCompletion(visionServiceUrl: string, chunkId: string): Promise<any> {
    const maxRetries = 30; // 5 minutes at 10 second intervals
    const pollInterval = 10000; // 10 seconds
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const statusResponse = await firstValueFrom(
          this.httpService.get(`${visionServiceUrl}/analysis/${chunkId}`)
        );
        
        const statusData = statusResponse.data;
        
        if (statusData.status === 'completed' && statusData.analysis) {
          this.logger.log(`Vision polling successful for chunk ${chunkId} after ${attempt + 1} attempts`);
          return statusData;
        } else if (statusData.status === 'failed') {
          this.logger.error(`Vision processing failed for chunk ${chunkId}: ${statusData.error || 'Unknown error'}`);
          return null;
        }
        
        // Still processing, continue polling
        this.logger.log(`Vision still processing for chunk ${chunkId}, attempt ${attempt + 1}/${maxRetries}`);
        
      } catch (error) {
        this.logger.warn(`Vision polling error for chunk ${chunkId}, attempt ${attempt + 1}:`, error);
        // Continue polling unless it's the last attempt
        if (attempt === maxRetries - 1) {
          throw error;
        }
      }
    }
    
    this.logger.error(`Vision polling timeout for chunk ${chunkId} after ${maxRetries} attempts`);
    return null;
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

      // Scoring service returns "accepted" response, we need to poll for completion
      const scoringResult = response.data;
      this.logger.log(`Scoring job accepted for stream ${streamId}:`, JSON.stringify(scoringResult, null, 2));
      
      if (scoringResult && scoringResult.status === 'accepted') {
        // Poll for Scoring completion and get results
        const scoresResult = await this.pollScoringCompletion(scoringServiceUrl, streamId);
        if (scoresResult && scoresResult.highlights) {
          // Update chunks with their highlight scores AND process suggested segments
          for (const highlight of scoresResult.highlights) {
            await this.chunkRepository.update(highlight.chunkId, {
              highlightScore: highlight.score,
              scoreBreakdown: highlight.breakdown,
              updatedAt: new Date(),
            });

            // Process suggested segments for rendering (NEW)
            if (highlight.suggestedSegments && highlight.suggestedSegments.length > 0) {
              for (const segment of highlight.suggestedSegments) {
                this.logger.log(`Creating clip for suggested segment in chunk ${highlight.chunkId}:`, {
                  startTime: segment.startTime,
                  duration: segment.duration,
                  absoluteStartTime: segment.absoluteStartTime,
                  reason: segment.reason
                });

                // Get the chunk data for rendering
                const chunk = await this.chunkRepository.findOne({ where: { id: highlight.chunkId } });
                if (chunk) {
                  await this.processRenderForSegment(chunk, segment, highlight);
                }
              }
            }
          }
          this.logger.log(`Saved highlight scores for ${scoresResult.highlights.length} chunks and processed ${scoresResult.highlights.reduce((acc: number, h: any) => acc + (h.suggestedSegments?.length || 0), 0)} segments`);
        } else {
          this.logger.warn(`No scores data received for stream ${streamId}`);
        }
      } else {
        this.logger.warn(`Unexpected Scoring response format for stream ${streamId}`);
      }

      this.logger.log(`Scoring completed for stream ${streamId} with ${chunks.length} chunks`);
      
    } catch (error) {
      this.logger.error(`Scoring service failed for stream ${streamId}:`, error);
      throw error;
    }
  }

  /**
   * Poll Scoring service for completion and get scores results
   */
  private async pollScoringCompletion(scoringServiceUrl: string, streamId: string): Promise<any> {
    const maxRetries = 30; // 5 minutes at 10 second intervals
    const pollInterval = 10000; // 10 seconds
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const statusResponse = await firstValueFrom(
          this.httpService.get(`${scoringServiceUrl}/highlights/${streamId}`)
        );
        
        const statusData = statusResponse.data;
        
        if (statusData.status === 'completed' && statusData.highlights !== undefined) {
          this.logger.log(`Scoring polling successful for stream ${streamId} after ${attempt + 1} attempts`);
          return statusData;
        } else if (statusData.status === 'failed') {
          this.logger.error(`Scoring processing failed for stream ${streamId}: ${statusData.error || 'Unknown error'}`);
          return null;
        }
        
        // Still processing, continue polling
        this.logger.log(`Scoring still processing for stream ${streamId}, attempt ${attempt + 1}/${maxRetries}`);
        
      } catch (error) {
        this.logger.warn(`Scoring polling error for stream ${streamId}, attempt ${attempt + 1}:`, error);
        // Continue polling unless it's the last attempt
        if (attempt === maxRetries - 1) {
          throw error;
        }
      }
    }
    
    this.logger.error(`Scoring polling timeout for stream ${streamId} after ${maxRetries} attempts`);
    return null;
  }

  /**
   * Process a specific segment within a chunk for rendering (NEW)
   */
  private async processRenderForSegment(chunk: Chunk, segment: any, highlight: any): Promise<void> {
    const renderServiceUrl = this.configService.get<string>('RENDER_SERVICE_URL', 'http://localhost:8005');
    
    try {
      // Create a clip entity for this specific segment
      const clip = this.clipRepository.create({
        streamId: chunk.streamId,
        chunkId: chunk.id,
        sourceChunkId: chunk.id,
        title: `Highlight: ${segment.reason || 'Auto-detected moment'}`,
        description: `Smart highlight detected with confidence ${segment.confidence} - ${segment.reason}`,
        status: ClipStatus.RENDERING,
        startTime: segment.absoluteStartTime, // Absolute time in stream
        endTime: segment.absoluteStartTime + segment.duration,
        duration: segment.duration,
        score: highlight.score,
        highlightScore: highlight.score,
        scoreBreakdown: highlight.breakdown,
        renderSettings: {
          aspectRatio: ClipAspectRatio.VERTICAL,
          quality: 'high' as const,
        },
        captionSettings: {
          enabled: true,
          style: 'gaming',
          fontSize: 24,
          fontFamily: 'Arial',
          color: '#ffffff',
          backgroundColor: '#000000',
          position: 'bottom' as const,
          maxWordsPerLine: 4,
          wordsPerSecond: 2.5,
        },
        retryCount: 0,
        approvalStatus: 'pending' as const,
      });
      
      const savedClip = await this.clipRepository.save(clip);
      this.logger.log(`Created clip entity ${savedClip.id} for segment in chunk ${chunk.id}`);
      
      // Extract caption segments for this time range
      const originalSegments = chunk.transcription?.segments || [];
      const extractedCaptions = this.extractCaptionSegmentsForTimeRange(
        originalSegments, 
        segment.absoluteStartTime, 
        segment.absoluteStartTime + segment.duration
      );

      this.logger.log(`Caption extraction for segment ${segment.absoluteStartTime}-${segment.absoluteStartTime + segment.duration}:`, {
        originalSegmentCount: originalSegments.length,
        extractedCaptionCount: extractedCaptions.length,
        extractedCaptions: extractedCaptions.slice(0, 3), // Show first 3
        segmentTimeRange: `${segment.absoluteStartTime} - ${segment.absoluteStartTime + segment.duration}`
      });

      // Calculate the render timing relative to the chunk's source video
      const renderRequest = {
        clipId: savedClip.id,
        sourceVideo: chunk.videoPath,
        startTime: segment.startTime, // Use chunk-relative time since we're rendering from chunk file
        duration: segment.duration, // Use the precise segment duration
        renderConfig: {
          format: 'mp4',
          resolution: '1080p',
          platform: 'youtube_shorts',
        },
        captions: {
          segments: extractedCaptions,
          style: 'gaming',
        },
        effects: [],
      };

      this.logger.log(`Sending render request for segment in chunk ${chunk.id} -> clip ${savedClip.id}:`, {
        clipId: renderRequest.clipId,
        sourceVideo: renderRequest.sourceVideo,
        startTime: renderRequest.startTime, // Now chunk-relative
        duration: renderRequest.duration,
        absoluteStartTime: segment.absoluteStartTime, // For reference
        segmentReason: segment.reason,
        segmentConfidence: segment.confidence
      });

      const response = await firstValueFrom(
        this.httpService.post(`${renderServiceUrl}/render`, renderRequest, {
          timeout: 300000, // 5 minutes timeout
        })
      );

      const renderResult = response.data;
      this.logger.log(`Render job accepted for segment clip ${savedClip.id}:`, JSON.stringify(renderResult, null, 2));
      
      this.logger.log(`Render started for segment in chunk ${chunk.id} -> clip ${savedClip.id} - processing in background`);
      
    } catch (error) {
      this.logger.error(`Render service failed for segment in chunk ${chunk.id}:`, error);
      
      // Mark clip as failed if we created one
      try {
        const failedClip = await this.clipRepository.findOne({ 
          where: { chunkId: chunk.id, status: ClipStatus.RENDERING } 
        });
        if (failedClip) {
          failedClip.status = ClipStatus.FAILED;
          failedClip.errorMessage = error instanceof Error ? error.message : String(error);
          failedClip.retryCount += 1;
          await this.clipRepository.save(failedClip);
        }
      } catch (updateError) {
        this.logger.error(`Failed to update clip status after render error:`, updateError);
      }
      
      throw error;
    }
  }

  /**
   * Extract caption segments for a specific time range
   */
  private extractCaptionSegmentsForTimeRange(segments: any[], startTime: number, endTime: number): any[] {
    if (!segments || !Array.isArray(segments)) {
      return [];
    }

    return segments.filter(seg => {
      const segStart = seg.start || 0;
      const segEnd = seg.end || segStart + 1;
      
      // Include segment if it overlaps with our time range
      return segStart < endTime && segEnd > startTime;
    }).map(seg => ({
      ...seg,
      // Adjust timing to be relative to the clip start
      start: Math.max(0, (seg.start || 0) - startTime),
      end: Math.max(0, (seg.end || seg.start + 1) - startTime)
    }));
  }

  /**
   * Process chunk through Render service (LEGACY - still used for fallback)
   */
  private async processRender(chunk: Chunk): Promise<void> {
    const renderServiceUrl = this.configService.get<string>('RENDER_SERVICE_URL', 'http://localhost:8005');
    
    try {
      // First, create a clip entity for this chunk
      const clip = this.clipRepository.create({
        streamId: chunk.streamId,
        chunkId: chunk.id,
        sourceChunkId: chunk.id,
        title: `Highlight from ${chunk.title || 'Stream'}`,
        description: `Auto-generated highlight with score ${chunk.highlightScore}`,
        status: ClipStatus.RENDERING,
        startTime: chunk.startTime,
        endTime: chunk.startTime + chunk.duration,
        duration: chunk.duration,
        score: chunk.highlightScore,
        highlightScore: chunk.highlightScore,
        scoreBreakdown: chunk.scoreBreakdown,
        renderSettings: {
          aspectRatio: ClipAspectRatio.VERTICAL,
          quality: 'high' as const,
        },
        captionSettings: {
          enabled: true,
          style: 'gaming',
          fontSize: 24,
          fontFamily: 'Arial',
          color: '#ffffff',
          backgroundColor: '#000000',
          position: 'bottom' as const,
          maxWordsPerLine: 4,
          wordsPerSecond: 2.5,
        },
        retryCount: 0,
        approvalStatus: 'pending' as const,
      });
      
      const savedClip = await this.clipRepository.save(clip);
      this.logger.log(`Created clip entity ${savedClip.id} for chunk ${chunk.id}`);
      
      const renderRequest = {
        clipId: savedClip.id,
        sourceVideo: chunk.videoPath,
        startTime: chunk.startTime, // Start time within the source video
        duration: chunk.duration, // Duration of the segment to extract
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
      };

      this.logger.log(`Sending render request for chunk ${chunk.id} -> clip ${savedClip.id}:`, {
        clipId: renderRequest.clipId,
        sourceVideo: renderRequest.sourceVideo,
        startTime: renderRequest.startTime,
        duration: renderRequest.duration,
      });

      const response = await firstValueFrom(
        this.httpService.post(`${renderServiceUrl}/render`, renderRequest, {
          timeout: 300000, // 5 minutes timeout for job acceptance (includes S3 download and processing)
        })
      );

      // Render service returns "accepted" response, we don't wait for completion
      const renderResult = response.data;
      this.logger.log(`Render job accepted for chunk ${chunk.id}:`, JSON.stringify(renderResult, null, 2));
      
      // The render service will complete in background and send webhook when done
      this.logger.log(`Render started for chunk ${chunk.id} -> clip ${savedClip.id} - processing in background`);
      
    } catch (error) {
      this.logger.error(`Render service failed for chunk ${chunk.id}:`, error);
      
      // Mark clip as failed if we created one
      try {
        const failedClip = await this.clipRepository.findOne({ 
          where: { chunkId: chunk.id, status: ClipStatus.RENDERING } 
        });
        if (failedClip) {
          failedClip.status = ClipStatus.FAILED;
          failedClip.errorMessage = error instanceof Error ? error.message : String(error);
          failedClip.retryCount += 1;
          await this.clipRepository.save(failedClip);
        }
      } catch (updateError) {
        this.logger.error(`Failed to update clip status after render error:`, updateError);
      }
      
      throw error;
    }
  }
}
