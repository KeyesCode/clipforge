import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Streamer } from './streamer.entity';
import { Stream } from '../streams/stream.entity';

@Injectable()
export class StreamersService {
  constructor(
    @InjectRepository(Streamer)
    private streamersRepository: Repository<Streamer>,
    @InjectRepository(Stream)
    private streamsRepository: Repository<Stream>,
  ) {}

  async findAll(filters?: { platform?: string; active?: boolean }): Promise<Streamer[]> {
    const queryBuilder = this.streamersRepository.createQueryBuilder('streamer');
    
    if (filters?.platform) {
      queryBuilder.andWhere('streamer.platform = :platform', { platform: filters.platform });
    }
    
    if (filters?.active !== undefined) {
      queryBuilder.andWhere('streamer.isActive = :active', { active: filters.active });
    }
    
    return queryBuilder.getMany();
  }

  async findOne(id: string): Promise<Streamer> {
    const streamer = await this.streamersRepository.findOne({
      where: { id },
      relations: ['streams'],
    });
    
    if (!streamer) {
      throw new NotFoundException(`Streamer with ID ${id} not found`);
    }
    
    return streamer;
  }

  async create(createStreamerDto: Partial<Streamer>): Promise<Streamer> {
    const streamer = this.streamersRepository.create({
      ...createStreamerDto,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    return this.streamersRepository.save(streamer);
  }

  async update(id: string, updateStreamerDto: Partial<Streamer>): Promise<Streamer> {
    const streamer = await this.findOne(id);
    
    Object.assign(streamer, {
      ...updateStreamerDto,
      updatedAt: new Date(),
    });
    
    return this.streamersRepository.save(streamer);
  }

  async remove(id: string): Promise<void> {
    const streamer = await this.findOne(id);
    await this.streamersRepository.remove(streamer);
  }

  async syncStreamer(id: string): Promise<{ message: string }> {
    const streamer = await this.findOne(id);
    
    // Update last sync time
    streamer.lastSyncAt = new Date();
    streamer.updatedAt = new Date();
    await this.streamersRepository.save(streamer);
    
    // TODO: Trigger actual sync job via queue
    // This would typically enqueue a job to fetch latest streams/videos
    
    return { message: `Sync initiated for streamer ${streamer.displayName}` };
  }

  async getStreamerStreams(
    id: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ streams: Stream[]; total: number }> {
    const streamer = await this.findOne(id);
    
    const [streams, total] = await this.streamsRepository.findAndCount({
      where: { streamerId: id },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['chunks', 'clips'],
    });
    
    return { streams, total };
  }

  async updateSettings(id: string, settings: Record<string, any>): Promise<Streamer> {
    const streamer = await this.findOne(id);
    
    streamer.settings = {
      ...streamer.settings,
      ...settings,
    };
    streamer.updatedAt = new Date();
    
    return this.streamersRepository.save(streamer);
  }

  async findByPlatformId(platform: string, platformId: string): Promise<Streamer | null> {
    return this.streamersRepository.findOne({
      where: { platform, platformId },
    });
  }

  async findActiveStreamers(): Promise<Streamer[]> {
    return this.streamersRepository.find({
      where: { isActive: true },
      order: { lastSyncAt: 'ASC' },
    });
  }

  async updateLastActivity(id: string): Promise<void> {
    await this.streamersRepository.update(id, {
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async getStreamerStats(id: string): Promise<{
    totalStreams: number;
    totalClips: number;
    totalDuration: number;
    avgViewers: number;
  }> {
    const streamer = await this.findOne(id);
    
    const stats = await this.streamsRepository
      .createQueryBuilder('stream')
      .leftJoin('stream.clips', 'clip')
      .where('stream.streamerId = :id', { id })
      .select([
        'COUNT(DISTINCT stream.id) as totalStreams',
        'COUNT(DISTINCT clip.id) as totalClips',
        'SUM(stream.duration) as totalDuration',
        'AVG(stream.viewerCount) as avgViewers',
      ])
      .getRawOne();
    
    return {
      totalStreams: parseInt(stats.totalStreams) || 0,
      totalClips: parseInt(stats.totalClips) || 0,
      totalDuration: parseInt(stats.totalDuration) || 0,
      avgViewers: parseFloat(stats.avgViewers) || 0,
    };
  }
}