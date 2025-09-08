import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { Stream, StreamStatus } from '../streams/stream.entity';
import { Chunk, ChunkStatus } from '../chunks/chunk.entity';
import { Clip, ClipStatus } from '../clips/clip.entity';

export interface ProcessingJobData {
  streamId: string;
  chunkId?: string;
  jobType: 'asr' | 'vision' | 'scoring' | 'rendering';
  inputData?: any;
  metadata?: any;
}

export interface ASRJobData extends ProcessingJobData {
  jobType: 'asr';
  chunkId: string;
  audioS3Url: string;
  audioS3Key: string;
}

export interface VisionJobData extends ProcessingJobData {
  jobType: 'vision';
  chunkId: string;
  videoS3Url: string;
  videoS3Key: string;
}

export interface ScoringJobData extends ProcessingJobData {
  jobType: 'scoring';
  streamId: string;
  chunks: Array<{
    chunkId: string;
    transcription?: any;
    vision?: any;
    audioFeatures?: any;
    duration: number;
    startTime: number;
  }>;
}

export interface RenderingJobData extends ProcessingJobData {
  jobType: 'rendering';
  clipId: string;
  sourceChunkId: string;
  startTime: number;
  duration: number;
  scoreData: any;
}

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    @InjectQueue('processing') private processingQueue: Queue,
    @InjectRepository(Stream) private streamRepository: Repository<Stream>,
    @InjectRepository(Chunk) private chunkRepository: Repository<Chunk>,
    @InjectRepository(Clip) private clipRepository: Repository<Clip>,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  /**
   * Start the complete processing pipeline for a stream
   */
  async startProcessing(streamId: string): Promise<void> {
    this.logger.log(`Starting processing pipeline for stream: ${streamId}`);

    // Get stream and its chunks
    const stream = await this.streamRepository.findOne({
      where: { id: streamId },
      relations: ['chunks'],
    });

    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    if (!stream.chunks || stream.chunks.length === 0) {
      throw new Error(`Stream ${streamId} has no chunks to process`);
    }

    // Update stream status
    stream.status = StreamStatus.PROCESSING;
    await this.streamRepository.save(stream);

    // Stage 1: Queue ASR jobs for all chunks
    this.logger.log(`Queuing ASR jobs for ${stream.chunks.length} chunks`);
    
    const asrJobs = stream.chunks.map((chunk, index) => ({
      name: 'asr-chunk',
      data: {
        streamId,
        chunkId: chunk.id,
        jobType: 'asr' as const,
        audioS3Url: chunk.videoPath, // For now, using video path for audio extraction
        audioS3Key: chunk.videoPath,
        metadata: {
          chunkIndex: index,
          totalChunks: stream!.chunks.length,
        },
      } as ASRJobData,
      opts: {
        priority: 10, // High priority
        delay: index * 1000, // Stagger jobs by 1 second
      },
    }));

    // Add all ASR jobs to the queue
    await this.processingQueue.addBulk(asrJobs);

    this.logger.log(`Successfully queued ${asrJobs.length} ASR jobs for stream ${streamId}`);
  }

  /**
   * Handle ASR job completion and trigger Vision jobs
   */
  async onASRComplete(streamId: string, chunkId: string, asrResult: any): Promise<void> {
    this.logger.log(`ASR completed for chunk ${chunkId}`);

    // Store ASR results
    const chunk = await this.chunkRepository.findOne({ where: { id: chunkId } });
    if (chunk) {
      chunk.transcription = asrResult;
      chunk.status = ChunkStatus.TRANSCRIBED;
      await this.chunkRepository.save(chunk);
    }

    // Check if all chunks in the stream have ASR completed
    const stream = await this.streamRepository.findOne({
      where: { id: streamId },
      relations: ['chunks'],
    });

    const transcribedChunks = stream!.chunks.filter(c => c.status === ChunkStatus.TRANSCRIBED || c.status === ChunkStatus.ANALYZED);
    const totalChunks = stream!.chunks.length;

    this.logger.log(`ASR Progress: ${transcribedChunks.length}/${totalChunks} chunks completed`);

    if (transcribedChunks.length === totalChunks) {
      // All ASR jobs completed, start Vision analysis
      await this.startVisionAnalysis(streamId);
    }
  }

  /**
   * Start Vision analysis for all chunks
   */
  private async startVisionAnalysis(streamId: string): Promise<void> {
    this.logger.log(`Starting Vision analysis for stream: ${streamId}`);

    const stream = await this.streamRepository.findOne({
      where: { id: streamId },
      relations: ['chunks'],
    });

    // Queue Vision jobs for all chunks
    const visionJobs = stream!.chunks.map((chunk, index) => ({
      name: 'vision-chunk',
      data: {
        streamId,
        chunkId: chunk.id,
        jobType: 'vision' as const,
        videoS3Url: chunk.videoPath,
        videoS3Key: chunk.videoPath,
        metadata: {
          chunkIndex: index,
          totalChunks: stream!.chunks.length,
        },
      } as VisionJobData,
      opts: {
        priority: 8, // Medium priority
        delay: index * 2000, // Stagger by 2 seconds (vision is more intensive)
      },
    }));

    await this.processingQueue.addBulk(visionJobs);
    this.logger.log(`Queued ${visionJobs.length} Vision jobs for stream ${streamId}`);
  }

  /**
   * Handle Vision job completion and trigger Scoring
   */
  async onVisionComplete(streamId: string, chunkId: string, visionResult: any): Promise<void> {
    this.logger.log(`Vision analysis completed for chunk ${chunkId}`);

    // Store Vision results
    const chunk = await this.chunkRepository.findOne({ where: { id: chunkId } });
    if (chunk) {
      chunk.visionAnalysis = visionResult;
      chunk.status = ChunkStatus.ANALYZED;
      await this.chunkRepository.save(chunk);
    }

    // Check if all chunks have Vision completed
    const stream = await this.streamRepository.findOne({
      where: { id: streamId },
      relations: ['chunks'],
    });

    const analyzedChunks = stream!.chunks.filter(c => c.status === ChunkStatus.ANALYZED);
    const totalChunks = stream!.chunks.length;

    this.logger.log(`Vision Progress: ${analyzedChunks.length}/${totalChunks} chunks completed`);

    if (analyzedChunks.length === totalChunks) {
      // All Vision jobs completed, start Scoring
      await this.startScoring(streamId);
    }
  }

  /**
   * Start Scoring analysis for the entire stream
   */
  private async startScoring(streamId: string): Promise<void> {
    this.logger.log(`Starting Scoring analysis for stream: ${streamId}`);

    const stream = await this.streamRepository.findOne({
      where: { id: streamId },
      relations: ['chunks'],
    });

    // Prepare data for scoring
    const chunksData = stream!.chunks.map(chunk => ({
      chunkId: chunk.id,
      transcription: chunk.transcription,
      vision: chunk.visionAnalysis,
      duration: chunk.duration,
      startTime: chunk.startTime,
      audioFeatures: {
        // Extract audio features from transcription or add dedicated audio analysis
        hasLaughter: chunk.transcription?.text?.toLowerCase().includes('haha'),
        exclamationCount: (chunk.transcription?.text?.match(/!/g) || []).length,
        emotionalWords: this.extractEmotionalWords(chunk.transcription?.text || ''),
      },
    }));

    // Queue single scoring job for entire stream
    await this.processingQueue.add('scoring-stream', {
      streamId,
      jobType: 'scoring',
      chunks: chunksData,
    } as ScoringJobData, {
      priority: 6,
    });

    this.logger.log(`Queued scoring job for stream ${streamId}`);
  }

  /**
   * Handle Scoring completion and trigger Rendering for high-scoring clips
   */
  async onScoringComplete(streamId: string, scoringResult: any): Promise<void> {
    this.logger.log(`Scoring completed for stream ${streamId}`);

    // Update chunk scores - scoringResult contains highlights array
    const highlights = scoringResult.highlights || [];
    for (const highlight of highlights) {
      const chunk = await this.chunkRepository.findOne({ 
        where: { id: highlight.chunkId } 
      });
      
      if (chunk) {
        chunk.highlightScore = highlight.score;
        chunk.scoreBreakdown = highlight.reasons;
        chunk.status = ChunkStatus.SCORED;
        await this.chunkRepository.save(chunk);
      }
    }

    // Get high-scoring chunks for clip creation
    const highScoringChunks = highlights
      .filter((h: any) => h.score >= 0.7) // Configurable threshold
      .sort((a: any, b: any) => b.score - a.score) // Sort by score descending
      .slice(0, 10); // Top 10 clips maximum

    this.logger.log(`Found ${highScoringChunks.length} high-scoring chunks for rendering`);

    if (highScoringChunks.length > 0) {
      await this.startRendering(streamId, highScoringChunks);
    }

    // Update stream status
    const stream = await this.streamRepository.findOne({ where: { id: streamId } });
    stream!.status = StreamStatus.PROCESSED;
    await this.streamRepository.save(stream!);
  }

  /**
   * Start Rendering for high-scoring chunks
   */
  private async startRendering(streamId: string, highScoringChunks: any[]): Promise<void> {
    this.logger.log(`Starting rendering for ${highScoringChunks.length} clips`);

    const renderJobs = [];

    for (const [index, chunkScore] of highScoringChunks.entries()) {
      // Create clip entity
      const clip = new Clip();
      clip.streamId = streamId;
      clip.sourceChunkId = chunkScore.chunkId;
      clip.title = this.generateClipTitle(chunkScore);
      clip.startTime = chunkScore.suggestedStartTime || 0;
      clip.duration = chunkScore.suggestedDuration || 30;
      clip.score = chunkScore.score;
      clip.status = ClipStatus.PENDING_RENDER;
      
      const savedClip = await this.clipRepository.save(clip);

      // Queue render job
      renderJobs.push({
        name: 'render-clip',
        data: {
          streamId,
          jobType: 'rendering',
          clipId: savedClip.id,
          sourceChunkId: chunkScore.chunkId,
          startTime: clip.startTime,
          duration: clip.duration,
          scoreData: chunkScore,
          metadata: {
            clipIndex: index,
            totalClips: highScoringChunks.length,
          },
        } as RenderingJobData,
        opts: {
          priority: 4, // Lower priority, rendering is resource intensive
          delay: index * 5000, // Stagger by 5 seconds
        },
      });
    }

    await this.processingQueue.addBulk(renderJobs);
    this.logger.log(`Queued ${renderJobs.length} rendering jobs`);
  }

  /**
   * Handle Rendering completion
   */
  async onRenderingComplete(clipId: string, renderResult: any): Promise<void> {
    this.logger.log(`Rendering completed for clip ${clipId}`);

    const clip = await this.clipRepository.findOne({ where: { id: clipId } });
    if (clip) {
      clip.renderedFilePath = renderResult.renderedS3Url;
      clip.thumbnailPath = renderResult.thumbnailS3Url;
      clip.status = ClipStatus.RENDERED;
      clip.renderedAt = new Date();
      await this.clipRepository.save(clip);
    }
  }

  /**
   * Get processing status for a stream
   */
  async getProcessingStatus(streamId: string): Promise<any> {
    const stream = await this.streamRepository.findOne({
      where: { id: streamId },
      relations: ['chunks', 'clips'],
    });

    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    const totalChunks = stream!.chunks.length;
    const transcribedChunks = stream.chunks.filter(c => ['transcribed', 'analyzed', 'scored'].includes(c.status)).length;
    const analyzedChunks = stream.chunks.filter(c => ['analyzed', 'scored'].includes(c.status)).length;
    const scoredChunks = stream.chunks.filter(c => c.status === 'scored').length;
    const pendingClips = stream.clips.filter(c => c.status === 'pending_render').length;
    const renderedClips = stream.clips.filter(c => c.status === 'rendered').length;

    return {
      streamId,
      status: stream.status,
      progress: {
        totalChunks,
        asr: {
          completed: transcribedChunks,
          total: totalChunks,
          percentage: Math.round((transcribedChunks / totalChunks) * 100),
        },
        vision: {
          completed: analyzedChunks,
          total: totalChunks,
          percentage: Math.round((analyzedChunks / totalChunks) * 100),
        },
        scoring: {
          completed: scoredChunks,
          total: totalChunks,
          percentage: Math.round((scoredChunks / totalChunks) * 100),
        },
        rendering: {
          pending: pendingClips,
          completed: renderedClips,
          total: pendingClips + renderedClips,
        },
      },
    };
  }

  /**
   * Utility: Extract emotional words from transcription
   */
  private extractEmotionalWords(text: string): string[] {
    const emotionalWords = [
      'amazing', 'incredible', 'insane', 'wow', 'omg', 'no way', 'unbelievable',
      'epic', 'sick', 'crazy', 'clutch', 'poggers', 'huge', 'massive',
      'perfect', 'flawless', 'godlike', 'nuts', 'wild', 'mental'
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    return emotionalWords.filter(word => 
      words.some(w => w.includes(word) || word.includes(w))
    );
  }

  /**
   * Utility: Generate clip title based on score data
   */
  private generateClipTitle(chunkScore: any): string {
    const templates = [
      'Epic Gaming Moment!',
      'Incredible Highlight!',
      'Amazing Play!',
      'Clutch Moment!',
      'Insane Reaction!',
    ];
    
    // Use score or transcription to pick appropriate title
    if (chunkScore.breakdown?.emotional_intensity > 0.8) {
      return 'INSANE Gaming Moment! 🔥';
    } else if (chunkScore.breakdown?.skill_display > 0.8) {
      return 'Perfect Play! 🎯';
    } else if (chunkScore.breakdown?.surprise_factor > 0.8) {
      return 'You Won\'t Believe This! 😱';
    }
    
    return templates[Math.floor(Math.random() * templates.length)];
  }
}