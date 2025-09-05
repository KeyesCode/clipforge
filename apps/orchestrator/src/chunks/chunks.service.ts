import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Chunk, ChunkStatus } from './chunk.entity';

type CreateChunkDto = {
  streamId: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  filePath?: string;
  thumbnailPath?: string;
};

type UpdateChunkDto = {
  title?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  transcription?: any;
  audioFeatures?: any;
  visualFeatures?: any;
  highlightScore?: number;
  scoreBreakdown?: any;
  processingError?: string;
};

type ChunkFiltersDto = {
  streamId?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  minScore?: number;
  maxScore?: number;
  hasTranscription?: boolean;
  limit?: number;
  offset?: number;
};

@Injectable()
export class ChunksService {
  constructor(
    @InjectRepository(Chunk)
    private readonly chunksRepo: Repository<Chunk>,
  ) {}

  async create(dto: CreateChunkDto): Promise<Chunk> {
    const entity = this.chunksRepo.create({
      ...dto,
      status: ChunkStatus.PENDING,
      highlightScore: 0,
      retryCount: 0,
    });
    return this.chunksRepo.save(entity);
  }

  async findAll(filters: ChunkFiltersDto) {
    const {
      streamId,
      status,
      minScore,
      maxScore,
      hasTranscription,
      limit = 50,
      offset = 0,
    } = filters || {};

    const where: FindOptionsWhere<Chunk> = {};
    if (streamId) where.streamId = streamId;
    if (status) where.status = status as ChunkStatus;

    // Build query for score + transcription conditions
    let qb = this.chunksRepo
      .createQueryBuilder('chunk')
      .where(where)
      .orderBy('chunk.startTime', 'ASC')
      .skip(offset)
      .take(limit);

    if (typeof minScore === 'number') {
      qb = qb.andWhere('chunk.highlightScore >= :minScore', { minScore });
    }
    if (typeof maxScore === 'number') {
      qb = qb.andWhere('chunk.highlightScore <= :maxScore', { maxScore });
    }
    if (typeof hasTranscription === 'boolean') {
      if (hasTranscription) {
        qb = qb.andWhere('chunk.transcription IS NOT NULL');
      } else {
        qb = qb.andWhere('chunk.transcription IS NULL');
      }
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, limit, offset };
  }

  async getHighlights(params: { streamId?: string; limit?: number; minScore?: number }) {
    const { streamId, limit = 10, minScore = 0.7 } = params || {};
    let qb = this.chunksRepo
      .createQueryBuilder('chunk')
      .where('chunk.highlightScore >= :minScore', { minScore })
      .andWhere('chunk.status = :status', { status: ChunkStatus.COMPLETED })
      .orderBy('chunk.highlightScore', 'DESC')
      .take(limit);

    if (streamId) qb = qb.andWhere('chunk.streamId = :streamId', { streamId });

    return qb.getMany();
  }

  async findOne(id: string): Promise<Chunk> {
    const entity = await this.chunksRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Chunk ${id} not found`);
    return entity;
  }

  async update(id: string, dto: UpdateChunkDto): Promise<Chunk> {
    const entity = await this.findOne(id);
    // Map controller’s status strings to enum
    let mappedStatus: ChunkStatus | undefined;
    if (dto.status) {
      mappedStatus = dto.status as ChunkStatus;
    }

    Object.assign(entity, {
      ...dto,
      ...(mappedStatus ? { status: mappedStatus } : {}),
    });
    return this.chunksRepo.save(entity);
  }

  async remove(id: string): Promise<void> {
    const res = await this.chunksRepo.delete({ id });
    if (!res.affected) throw new NotFoundException(`Chunk ${id} not found`);
  }

  /**
   * Processing hooks (stubbed)
   * Wire these to your queue workers later.
   */
  async processChunk(id: string) {
    const chunk = await this.findOne(id);
    chunk.status = ChunkStatus.PROCESSING;
    chunk.processingError = null;
    await this.chunksRepo.save(chunk);

    // TODO: enqueue to ingest/asr/vision pipeline
    return { queued: true, id };
  }

  async scoreChunk(id: string) {
    const chunk = await this.findOne(id);
    // TODO: call scoring_svc or queue an event
    // For now, keep state the same and return a placeholder
    return { queued: true, id };
  }

  /**
   * Transcription & features
   */
  async getTranscription(id: string) {
    const chunk = await this.findOne(id);
    return chunk.transcription ?? null;
  }

  async updateTranscription(id: string, transcriptionData: any) {
    const chunk = await this.findOne(id);
    chunk.transcription = transcriptionData;
    return this.chunksRepo.save(chunk);
  }

  async getFeatures(id: string) {
    const chunk = await this.findOne(id);
    return {
      audio: chunk.audioFeatures ?? null,
      visual: chunk.visualFeatures ?? null,
    };
  }

  async updateAudioFeatures(id: string, audioFeatures: any) {
    const chunk = await this.findOne(id);
    chunk.audioFeatures = audioFeatures;
    return this.chunksRepo.save(chunk);
  }

  async updateVisualFeatures(id: string, visualFeatures: any) {
    const chunk = await this.findOne(id);
    chunk.visualFeatures = visualFeatures;
    return this.chunksRepo.save(chunk);
  }

  /**
   * Stats & analytics
   */
  async getChunkStats(id: string) {
    const chunk = await this.findOne(id);
    return {
      id: chunk.id,
      duration: chunk.duration,
      highlightScore: chunk.highlightScore ?? 0,
      hasTranscription: !!chunk.transcription,
      createdAt: chunk.createdAt,
      updatedAt: chunk.updatedAt,
      status: chunk.status,
    };
  }

  async processBatch(chunkIds: string[]) {
    const results = [];
    for (const id of chunkIds) {
      try {
        results.push(await this.processChunk(id));
      } catch (e) {
        results.push({ id, error: (e as Error).message });
      }
    }
    return results;
  }

  async scoreBatch(chunkIds: string[]) {
    const results = [];
    for (const id of chunkIds) {
      try {
        results.push(await this.scoreChunk(id));
      } catch (e) {
        results.push({ id, error: (e as Error).message });
      }
    }
    return results;
  }

  async getScoreDistribution(params: { streamId?: string; bins?: number }) {
    const { streamId, bins = 10 } = params || {};
    let qb = this.chunksRepo.createQueryBuilder('chunk').select([
      'chunk.id',
      'chunk.highlightScore',
    ]);
    if (streamId) qb = qb.where('chunk.streamId = :streamId', { streamId });

    const rows = await qb.getMany();
    const scores = rows
      .map((c) => c.highlightScore ?? 0)
      .filter((s) => typeof s === 'number');

    if (!scores.length) {
      return { bins, histogram: Array(bins).fill(0), min: 0, max: 0 };
    }

    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const width = (max - min || 1) / bins;
    const histogram = Array(bins).fill(0);
    for (const s of scores) {
      let idx = Math.floor((s - min) / width);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      histogram[idx] += 1;
    }
    return { bins, min, max, histogram };
  }

  async getTimelineAnalytics(streamId: string, opts: { interval: number }) {
    const { interval } = opts;
    // Get chunks of the stream
    const chunks = await this.chunksRepo.find({
      where: { streamId },
      order: { startTime: 'ASC' as const },
    });

    // Aggregate average score per interval window (seconds)
    const buckets: Record<number, { sum: number; count: number }> = {};
    for (const c of chunks) {
      const score = c.highlightScore ?? 0;
      const bucket = Math.floor((c.startTime ?? 0) / interval);
      if (!buckets[bucket]) buckets[bucket] = { sum: 0, count: 0 };
      buckets[bucket].sum += score;
      buckets[bucket].count += 1;
    }

    const points = Object.entries(buckets)
      .map(([b, { sum, count }]) => ({
        t: Number(b) * interval,
        avgScore: count ? sum / count : 0,
        count,
      }))
      .sort((a, b) => a.t - b.t);

    return { interval, points };
  }
}
