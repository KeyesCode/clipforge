import { ClipStatus } from './../clips/clip.entity';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Stream, StreamStatus } from './stream.entity';
import { Streamer } from '../streamers/streamer.entity';
import { Chunk, ChunkStatus } from '../chunks/chunk.entity';
import { Clip } from '../clips/clip.entity';

@Injectable()
export class StreamsService {
  constructor(
    @InjectRepository(Stream)
    private streamsRepository: Repository<Stream>,
    @InjectRepository(Streamer)
    private streamersRepository: Repository<Streamer>,
    @InjectRepository(Chunk)
    private chunksRepository: Repository<Chunk>,
    @InjectRepository(Clip)
    private clipsRepository: Repository<Clip>,
    @InjectQueue('ingest')
    private ingestQueue: Queue,
    @InjectQueue('processing')
    private processingQueue: Queue,
  ) {}

  private toStreamStatus(value: string): StreamStatus {
    switch ((value || '').toLowerCase()) {
      case 'pending':
        return StreamStatus.PENDING;
      case 'downloading':
        return StreamStatus.DOWNLOADING;
      case 'processing':
        return StreamStatus.PROCESSING;
      case 'downloaded':
        return StreamStatus.DOWNLOADED;
      case 'completed':
        return StreamStatus.COMPLETED;
      case 'failed':
        return StreamStatus.FAILED;
      case 'published':
        return StreamStatus.PUBLISHED;
      default:
        throw new Error(`Invalid StreamStatus: ${value}`);
    }
  }

  async findAll(filters: {
    platform?: string;
    status?: string;
    streamerId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ streams: Stream[]; total: number }> {
    const { platform, status, streamerId, limit = 50, offset = 0 } = filters;

    const queryBuilder = this.streamsRepository
      .createQueryBuilder('stream')
      .leftJoinAndSelect('stream.streamer', 'streamer')
      .leftJoinAndSelect('stream.chunks', 'chunks')
      .leftJoinAndSelect('stream.clips', 'clips');

    if (platform) {
      queryBuilder.andWhere('stream.platform = :platform', { platform });
    }

    if (status) {
      queryBuilder.andWhere('stream.status = :status', { status });
    }

    if (streamerId) {
      queryBuilder.andWhere('stream.streamerId = :streamerId', { streamerId });
    }

    queryBuilder
      .orderBy('stream.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [streams, total] = await queryBuilder.getManyAndCount();

    return { streams, total };
  }

  async findOne(id: string): Promise<Stream> {
    const stream = await this.streamsRepository.findOne({
      where: { id },
      relations: ['streamer', 'chunks', 'clips'],
    });

    if (!stream) {
      throw new NotFoundException(`Stream with ID ${id} not found`);
    }

    return stream;
  }

  async create(createStreamDto: Partial<Stream>): Promise<Stream> {
    // Validate required fields
    if (!createStreamDto.streamerId || !createStreamDto.title || !createStreamDto.originalUrl || !createStreamDto.platform) {
      throw new BadRequestException('Missing required fields: streamerId, title, originalUrl, platform');
    }

    // Verify streamer exists
    const streamer = await this.streamersRepository.findOne({
      where: { id: createStreamDto.streamerId },
    });

    if (!streamer) {
      throw new NotFoundException(`Streamer with ID ${createStreamDto.streamerId} not found`);
    }

    // Create stream with default values
    const stream = this.streamsRepository.create({
      ...createStreamDto,
      status: StreamStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return await this.streamsRepository.save(stream);
  }

  async update(id: string, updateStreamDto: Partial<Stream>): Promise<Stream> {
    const stream = await this.findOne(id);

    // Update fields
    Object.assign(stream, updateStreamDto);
    stream.updatedAt = new Date();

    return await this.streamsRepository.save(stream);
  }

  async remove(id: string): Promise<{ message: string }> {
    const stream = await this.findOne(id);
    
    // Check if stream has dependent data
    const chunkCount = await this.chunksRepository.count({ where: { streamId: id } });
    const clipCount = await this.clipsRepository.count({ where: { streamId: id } });

    if (chunkCount > 0 || clipCount > 0) {
      throw new BadRequestException('Cannot delete stream with existing chunks or clips');
    }

    await this.streamsRepository.remove(stream);
    return { message: `Stream ${id} deleted successfully` };
  }

  async ingestStream(id: string): Promise<{ message: string }> {
    const stream = await this.findOne(id);

    if (stream.status !== 'pending') {
      throw new BadRequestException(`Stream status must be 'pending' to start ingestion. Current status: ${stream.status}`);
    }

    // Update status to downloading
    await this.update(id, { status: StreamStatus.DOWNLOADING });

    // Add job to ingest queue
    await this.ingestQueue.add('download-stream', {
      streamId: id,
      url: stream.originalUrl,
      platform: stream.platform,
      streamerName: stream.streamer?.displayName ?? stream.streamer?.username ?? 'unknown'

    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    return { message: `Stream ingestion started for ${id}` };
  }

  async processStream(id: string): Promise<{ message: string }> {
    const stream = await this.findOne(id);

    if (stream.status !== 'downloaded') {
      throw new BadRequestException(`Stream must be downloaded before processing. Current status: ${stream.status}`);
    }

    // Update status to processing
    await this.update(id, { status: StreamStatus.PROCESSING });

    // Add jobs to processing queue
    await this.processingQueue.add('segment-stream', {
      streamId: id,
      localVideoPath: stream.localVideoPath,
      duration: stream.duration,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    return { message: `Stream processing started for ${id}` };
  }

  async getStreamChunks(id: string, limit = 50, offset = 0): Promise<{
    chunks: Chunk[];
    total: number;
    stream: Stream;
  }> {
    const stream = await this.findOne(id);

    const [chunks, total] = await this.chunksRepository.findAndCount({
      where: { streamId: id },
      order: { startTime: 'ASC' },
      skip: offset,
      take: limit,
    });

    return { chunks, total, stream };
  }

  async getStreamClips(id: string, limit = 50, offset = 0): Promise<{
    clips: Clip[];
    total: number;
    stream: Stream;
  }> {
    const stream = await this.findOne(id);

    const [clips, total] = await this.clipsRepository.findAndCount({
      where: { streamId: id },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    return { clips, total, stream };
  }

  async getStreamStats(id: string): Promise<{
    stream: Stream;
    stats: {
      totalChunks: number;
      processedChunks: number;
      totalClips: number;
      approvedClips: number;
      publishedClips: number;
      averageHighlightScore: number;
      processingProgress: number;
    };
  }> {
    const stream = await this.findOne(id);

    const totalChunks = await this.chunksRepository.count({ where: { streamId: id } });
    const processedChunks = await this.chunksRepository.count({ 
      where: { streamId: id, status: ChunkStatus.COMPLETED } 
    });
    
    const totalClips = await this.clipsRepository.count({ where: { streamId: id } });
    const approvedClips = await this.clipsRepository.count({ 
      where: { streamId: id, approvalStatus: 'approved' } 
    });
    const publishedClips = await this.clipsRepository.count({ 
      where: { streamId: id, status: ClipStatus.PUBLISHED } 
    });

    // Calculate average highlight score
    const chunks = await this.chunksRepository.find({
      where: { streamId: id, highlightScore: { $ne: null } } as any,
      select: ['highlightScore'],
    });
    
    const averageHighlightScore = chunks.length > 0 
      ? chunks.reduce((sum, chunk) => sum + (chunk.highlightScore || 0), 0) / chunks.length
      : 0;

    const processingProgress = totalChunks > 0 ? (processedChunks / totalChunks) * 100 : 0;

    return {
      stream,
      stats: {
        totalChunks,
        processedChunks,
        totalClips,
        approvedClips,
        publishedClips,
        averageHighlightScore: Math.round(averageHighlightScore * 100) / 100,
        processingProgress: Math.round(processingProgress * 100) / 100,
      },
    };
  }

  async updateStatus(id: string, status: string): Promise<Stream> {
    const validStatuses = ['pending', 'downloading', 'downloaded', 'processing', 'completed', 'failed'];
    
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const stream = await this.streamsRepository.findOne({ where: { id } });
    if (!stream) throw new Error(`Stream with ID ${id} not found`);

    stream.status = this.toStreamStatus(status);

    return this.streamsRepository.save(stream);
  }

  // Helper methods for queue job processing
  async handleIngestComplete(streamId: string, result: {
    filePath: string;
    duration: number;
    fileSize: number;
    resolution: string;
    fps: number;
    bitrate: number;
  }): Promise<void> {
    await this.update(streamId, {
      status: StreamStatus.DOWNLOADED,
      localVideoPath: result.filePath,
      duration: result.duration,
      fileSize: result.fileSize,
      fps: result.fps,
      bitrate: result.bitrate,
    });
  }

  async handleIngestError(streamId: string, error: string): Promise<void> {
    await this.update(streamId, {
      status: StreamStatus.FAILED,
      errorMessage: error,
    });
  }

  async handleProcessingComplete(streamId: string): Promise<void> {
    await this.update(streamId, {
      status: StreamStatus.COMPLETED,
    });
  }

  async handleProcessingError(streamId: string, error: string): Promise<void> {
    await this.update(streamId, {
      status: StreamStatus.FAILED,
      errorMessage: error,
    });
  }
}