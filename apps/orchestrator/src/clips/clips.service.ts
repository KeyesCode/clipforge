import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Clip, ClipStatus } from './clip.entity';
import { Stream } from '../streams/stream.entity';
import { Chunk } from '../chunks/chunk.entity';
import {
  CreateClipDto,
  UpdateClipDto,
  ClipQueryDto,
  ReviewClipDto,
} from './dto';

export interface ClipListResponse {
  clips: Clip[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClipStats {
  total: number;
  byStatus: Record<ClipStatus, number>;
  byApprovalStatus: Record<string, number>;
  averageScore: number;
  averageDuration: number;
  totalDuration: number;
  highlightsCount: number;
  needsReviewCount: number;
}

@Injectable()
export class ClipsService {
  constructor(
    @InjectRepository(Clip)
    private clipsRepository: Repository<Clip>,
    @InjectRepository(Stream)
    private streamsRepository: Repository<Stream>,
    @InjectRepository(Chunk)
    private chunksRepository: Repository<Chunk>,
    @InjectQueue('render')
    private renderQueue: Queue,
    @InjectQueue('publish')
    private publishQueue: Queue,
  ) {}

  async create(createClipDto: CreateClipDto): Promise<Clip> {
    // Validate stream exists
    const stream = await this.streamsRepository.findOne({
      where: { id: createClipDto.streamId },
    });

    if (!stream) {
      throw new NotFoundException(
        `Stream with ID ${createClipDto.streamId} not found`,
      );
    }

    // Validate chunk if provided
    if (createClipDto.chunkId) {
      const chunk = await this.chunksRepository.findOne({
        where: { id: createClipDto.chunkId },
      });

      if (!chunk) {
        throw new NotFoundException(
          `Chunk with ID ${createClipDto.chunkId} not found`,
        );
      }

      // Ensure chunk belongs to the stream
      if (chunk.streamId !== createClipDto.streamId) {
        throw new BadRequestException(
          'Chunk does not belong to the specified stream',
        );
      }
    }

    // Validate timing
    if (createClipDto.endTime <= createClipDto.startTime) {
      throw new BadRequestException(
        'End time must be greater than start time',
      );
    }

    const duration = createClipDto.endTime - createClipDto.startTime;

    // Check for overlapping clips (optional business rule)
    const overlappingClips = await this.clipsRepository
      .createQueryBuilder('clip')
      .where('clip.streamId = :streamId', { streamId: createClipDto.streamId })
      .andWhere('clip.status != :failedStatus', {
        failedStatus: ClipStatus.FAILED,
      })
      .andWhere('(clip.startTime < :endTime AND clip.endTime > :startTime)', {
        startTime: createClipDto.startTime,
        endTime: createClipDto.endTime,
      })
      .getCount();

    if (overlappingClips > 0) {
      console.warn(
        `Creating overlapping clip for stream ${createClipDto.streamId}`,
      );
    }

    // Create clip entity
    const clip = this.clipsRepository.create({
      ...createClipDto,
      duration,
      status: ClipStatus.PENDING,
      highlightScore: createClipDto.highlightScore || 0,
      retryCount: 0,
      approvalStatus: 'pending',
    });

    const savedClip = await this.clipsRepository.save(clip);

    // Queue for rendering if we have render settings
    if (savedClip.renderSettings) {
      await this.queueForRendering(savedClip.id);
    }

    return savedClip;
  }

  async findAll(query: ClipQueryDto): Promise<ClipListResponse> {
    const {
      streamId,
      chunkId,
      status,
      approvalStatus,
      aspectRatio,
      minScore,
      maxScore,
      minDuration,
      maxDuration,
      reviewedBy,
      highlightsOnly,
      needsReview,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = 20,
      offset = 0,
    } = query;

    const queryBuilder = this.clipsRepository
      .createQueryBuilder('clip')
      .leftJoinAndSelect('clip.stream', 'stream')
      .leftJoinAndSelect('clip.chunk', 'chunk')
      .leftJoinAndSelect('stream.streamer', 'streamer');

    // Apply filters
    if (streamId) {
      queryBuilder.andWhere('clip.streamId = :streamId', { streamId });
    }

    if (chunkId) {
      queryBuilder.andWhere('clip.chunkId = :chunkId', { chunkId });
    }

    if (status) {
      queryBuilder.andWhere('clip.status = :status', { status });
    }

    if (approvalStatus) {
      queryBuilder.andWhere('clip.approvalStatus = :approvalStatus', { approvalStatus });
    }

    if (aspectRatio) {
      queryBuilder.andWhere(
        "clip.renderSettings->>'aspectRatio' = :aspectRatio",
        { aspectRatio },
      );
    }

    if (minScore !== undefined) {
      queryBuilder.andWhere('clip.highlightScore >= :minScore', { minScore });
    }

    if (maxScore !== undefined) {
      queryBuilder.andWhere('clip.highlightScore <= :maxScore', { maxScore });
    }

    if (minDuration !== undefined) {
      queryBuilder.andWhere('clip.duration >= :minDuration', { minDuration });
    }

    if (maxDuration !== undefined) {
      queryBuilder.andWhere('clip.duration <= :maxDuration', { maxDuration });
    }

    if (reviewedBy) {
      queryBuilder.andWhere('clip.reviewedBy = :reviewedBy', { reviewedBy });
    }

    if (highlightsOnly) {
      queryBuilder.andWhere('clip.highlightScore >= 0.7');
    }

    if (needsReview) {
      queryBuilder.andWhere('clip.approvalStatus = :pending', {
        pending: 'pending',
      });
      queryBuilder.andWhere('clip.status IN (:...completedStatuses)', {
        completedStatuses: [ClipStatus.RENDERED, ClipStatus.PUBLISHED],
      });
    }

    if (search) {
      queryBuilder.andWhere(
        '(LOWER(clip.title) LIKE LOWER(:search) OR LOWER(clip.description) LIKE LOWER(:search))',
        { search: `%${search}%` }
      );
    }

    // Apply sorting
    const allowedSortFields = ['createdAt', 'updatedAt', 'highlightScore', 'duration', 'title', 'startTime'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(`clip.${sortField}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(offset).take(limit);

    const clips = await queryBuilder.getMany();

    return {
      clips,
      total,
      limit,
      offset,
    };
  }

  async findOne(id: string): Promise<Clip> {
    const clip = await this.clipsRepository.findOne({
      where: { id },
      relations: ['stream', 'stream.streamer', 'chunk'],
    });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${id} not found`);
    }

    return clip;
  }

  async update(id: string, updateClipDto: UpdateClipDto): Promise<Clip> {
    const clip = await this.findOne(id);

    // Validate timing if updated
    if (updateClipDto.startTime !== undefined || updateClipDto.endTime !== undefined) {
      const startTime = updateClipDto.startTime ?? clip.startTime;
      const endTime = updateClipDto.endTime ?? clip.endTime;

      if (endTime <= startTime) {
        throw new BadRequestException('End time must be greater than start time');
      }

      // Calculate duration for the update
      const duration = endTime - startTime;
      updateClipDto = { ...updateClipDto, duration };
    }

    // Don't allow updates to certain fields if clip is being processed
    if (clip.status === ClipStatus.RENDERING) {
      const forbiddenFields = ['startTime', 'endTime', 'renderSettings', 'captionSettings'];
      const hasRestrictedUpdates = forbiddenFields.some(
        field => (updateClipDto as any)[field] !== undefined
      );
      
      if (hasRestrictedUpdates) {
        throw new ConflictException('Cannot update timing or render settings while clip is being rendered');
      }
    }

    // Validate chunk if being changed
    if (updateClipDto.chunkId && updateClipDto.chunkId !== clip.chunkId) {
      const chunk = await this.chunksRepository.findOne({
        where: { id: updateClipDto.chunkId }
      });

      if (!chunk) {
        throw new NotFoundException(`Chunk with ID ${updateClipDto.chunkId} not found`);
      }

      if (chunk.streamId !== clip.streamId) {
        throw new BadRequestException('Chunk does not belong to the clip\'s stream');
      }
    }

    Object.assign(clip, updateClipDto);
    return await this.clipsRepository.save(clip);
  }

  async remove(id: string): Promise<void> {
    const clip = await this.findOne(id);

    // Don't allow deletion if clip is being processed
    if (clip.status === ClipStatus.RENDERING) {
      throw new ConflictException('Cannot delete clip while it is being rendered');
    }

    await this.clipsRepository.remove(clip);
  }

  async review(id: string, reviewDto: ReviewClipDto): Promise<Clip> {
    const clip = await this.findOne(id);

    if (!clip.isCompleted) {
      throw new BadRequestException('Can only review completed clips');
    }

    clip.setReview(reviewDto.reviewedBy, reviewDto.approvalStatus, reviewDto.reviewNotes);
    
    const updatedClip = await this.clipsRepository.save(clip);

    // Queue for publishing if approved and has publish settings
    if (reviewDto.approvalStatus === 'approved' && 
        clip.publishSettings?.platforms && 
        clip.publishSettings.platforms.length > 0) {
      await this.queueForPublishing(clip.id);
    }

    return updatedClip;
  }

  async queueForRendering(clipId: string): Promise<void> {
    const clip = await this.findOne(clipId);

    if (clip.status !== ClipStatus.PENDING) {
      throw new BadRequestException('Only pending clips can be queued for rendering');
    }

    // Update status to indicate rendering is queued
    clip.updateStatus(ClipStatus.RENDERING);
    await this.clipsRepository.save(clip);

    // Add to render queue
    await this.renderQueue.add('renderClip', {
      clipId: clip.id,
      streamId: clip.streamId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      renderSettings: clip.renderSettings,
      captionSettings: clip.captionSettings,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  }

  async queueForPublishing(clipId: string): Promise<void> {
    const clip = await this.findOne(clipId);

    if (!clip.isApproved) {
      throw new BadRequestException('Only approved clips can be queued for publishing');
    }

    if (!clip.renderedFilePath) {
      throw new BadRequestException('Clip must be rendered before publishing');
    }

    if (!clip.publishSettings?.platforms.length) {
      throw new BadRequestException('No publish platforms specified');
    }

    // Add to publish queue
    await this.publishQueue.add('publishClip', {
      clipId: clip.id,
      filePath: clip.renderedFilePath,
      publishSettings: clip.publishSettings,
    }, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 10000,
      },
      removeOnComplete: 5,
      removeOnFail: 3,
    });
  }

  async markRenderingComplete(clipId: string, filePath: string, metadata?: any): Promise<Clip> {
    const clip = await this.findOne(clipId);

    clip.renderedFilePath = filePath;
    clip.metadata = metadata;
    clip.updateStatus(ClipStatus.RENDERED);

    return await this.clipsRepository.save(clip);
  }

  async markRenderingFailed(clipId: string, errorMessage: string): Promise<Clip> {
    const clip = await this.findOne(clipId);
    
    clip.updateStatus(ClipStatus.FAILED, errorMessage);

    return await this.clipsRepository.save(clip);
  }

  async markPublished(clipId: string, publishedUrls: Record<string, string>): Promise<Clip> {
    const clip = await this.findOne(clipId);

    clip.publishedUrls = { ...clip.publishedUrls, ...publishedUrls };
    clip.updateStatus(ClipStatus.PUBLISHED);

    return await this.clipsRepository.save(clip);
  }

  async retryFailed(id: string): Promise<Clip> {
    const clip = await this.findOne(id);

    if (!clip.canRetry) {
      throw new BadRequestException('Clip cannot be retried (not failed or too many retries)');
    }

    clip.updateStatus(ClipStatus.PENDING);
    clip.errorMessage = undefined;
    
    const updatedClip = await this.clipsRepository.save(clip);
    
    // Queue for rendering again
    await this.queueForRendering(clip.id);

    return updatedClip;
  }

  async getStats(streamId?: string): Promise<ClipStats> {
    const queryBuilder = this.clipsRepository.createQueryBuilder('clip');

    if (streamId) {
      queryBuilder.where('clip.streamId = :streamId', { streamId });
    }

    const clips = await queryBuilder.getMany();

    const total = clips.length;
    const byStatus = clips.reduce((acc, clip) => {
      acc[clip.status] = (acc[clip.status] || 0) + 1;
      return acc;
    }, {} as Record<ClipStatus, number>);

    const byApprovalStatus = clips.reduce((acc, clip) => {
      acc[clip.approvalStatus] = (acc[clip.approvalStatus] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalScore = clips.reduce((sum, clip) => sum + clip.highlightScore, 0);
    const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);
    const highlightsCount = clips.filter(clip => clip.isHighlight).length;
    const needsReviewCount = clips.filter(clip => clip.needsReview).length;

    return {
      total,
      byStatus,
      byApprovalStatus,
      averageScore: total > 0 ? totalScore / total : 0,
      averageDuration: total > 0 ? totalDuration / total : 0,
      totalDuration,
      highlightsCount,
      needsReviewCount,
    };
  }

  async getByStream(streamId: string, query?: Partial<ClipQueryDto>): Promise<ClipListResponse> {
    return this.findAll({ ...query, streamId });
  }

  async getHighlights(query?: Partial<ClipQueryDto>): Promise<ClipListResponse> {
    return this.findAll({ ...query, highlightsOnly: true });
  }

  async getPendingReview(query?: Partial<ClipQueryDto>): Promise<ClipListResponse> {
    return this.findAll({ ...query, needsReview: true });
  }
}