import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Between, Like } from 'typeorm';
import { Job, JobType, JobStatus } from './job.entity';
import { CreateJobDto, UpdateJobDto, JobQueryDto, JobResponseDto } from './dto';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
  ) {}

  async create(createJobDto: CreateJobDto): Promise<JobResponseDto> {
    const job = this.jobRepository.create(createJobDto);
    const savedJob = await this.jobRepository.save(job);
    return new JobResponseDto(savedJob);
  }

  async findAll(query: JobQueryDto): Promise<{ jobs: JobResponseDto[]; total: number }> {
    const {
      type,
      status,
      streamerId,
      streamId,
      clipId,
      workerId,
      createdAfter,
      createdBefore,
      search,
      limit = 20,
      offset = 0,
    } = query;

    const where: any = {};

    if (type) where.type = type;
    if (status) where.status = status;
    if (streamerId) where.streamerId = streamerId;
    if (streamId) where.streamId = streamId;
    if (clipId) where.clipId = clipId;
    if (workerId) where.workerId = workerId;

    if (createdAfter || createdBefore) {
      where.createdAt = {};
      if (createdAfter) where.createdAt = Between(createdAfter, createdBefore || new Date());
      if (createdBefore && !createdAfter) where.createdAt = Between(new Date(0), createdBefore);
    }

    const findOptions: FindManyOptions<Job> = {
      where,
      relations: ['streamer', 'stream', 'clip'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    };

    // Add search functionality
    if (search) {
      findOptions.where = [
        { ...where, errorMessage: Like(`%${search}%`) },
        { ...where, progressMessage: Like(`%${search}%`) },
      ];
    }

    const [jobs, total] = await this.jobRepository.findAndCount(findOptions);

    return {
      jobs: jobs.map(job => new JobResponseDto(job)),
      total,
    };
  }

  async findOne(id: string): Promise<JobResponseDto> {
    const job = await this.jobRepository.findOne({
      where: { id },
      relations: ['streamer', 'stream', 'clip'],
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    return new JobResponseDto(job);
  }

  async update(id: string, updateJobDto: UpdateJobDto): Promise<JobResponseDto> {
    const job = await this.jobRepository.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    // Update job properties
    Object.assign(job, updateJobDto);

    // Handle status transitions
    if (updateJobDto.status === JobStatus.RUNNING && !job.startedAt) {
      job.startedAt = new Date();
    }

    if (updateJobDto.status === JobStatus.COMPLETED && !job.completedAt) {
      job.completedAt = new Date();
    }

    if (updateJobDto.status === JobStatus.FAILED && !job.completedAt) {
      job.completedAt = new Date();
    }

    const savedJob = await this.jobRepository.save(job);
    return new JobResponseDto(savedJob);
  }

  async cancel(id: string): Promise<JobResponseDto> {
    const job = await this.jobRepository.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    if (!job.canCancel) {
      throw new BadRequestException(`Job with ID ${id} cannot be cancelled in its current status: ${job.status}`);
    }

    job.status = JobStatus.CANCELLED;
    job.completedAt = new Date();

    const savedJob = await this.jobRepository.save(job);
    return new JobResponseDto(savedJob);
  }

  async retry(id: string): Promise<JobResponseDto> {
    const job = await this.jobRepository.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    if (!job.canRetry) {
      throw new BadRequestException(`Job with ID ${id} cannot be retried. Max retries exceeded or status not failed.`);
    }

    job.status = JobStatus.PENDING;
    job.retryCount += 1;
    job.errorMessage = null;
    job.errorStack = null;
    job.startedAt = null;
    job.completedAt = null;
    job.progress = 0;
    job.progressMessage = null;

    const savedJob = await this.jobRepository.save(job);
    return new JobResponseDto(savedJob);
  }

  async delete(id: string): Promise<void> {
    const result = await this.jobRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
  }

  // Utility methods for job management
  async getActiveJobs(workerId?: string): Promise<Job[]> {
    const where: any = { status: JobStatus.RUNNING };
    if (workerId) where.workerId = workerId;

    return this.jobRepository.find({
      where,
      relations: ['streamer', 'stream', 'clip'],
      order: { priority: 'DESC', createdAt: 'ASC' },
    });
  }

  async getPendingJobs(limit: number = 10): Promise<Job[]> {
    return this.jobRepository.find({
      where: { status: JobStatus.PENDING },
      relations: ['streamer', 'stream', 'clip'],
      order: { priority: 'DESC', createdAt: 'ASC' },
      take: limit,
    });
  }

  async getFailedJobs(limit: number = 50): Promise<Job[]> {
    return this.jobRepository.find({
      where: { status: JobStatus.FAILED },
      relations: ['streamer', 'stream', 'clip'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getJobStats(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const stats = await this.jobRepository
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('job.status')
      .getRawMany();

    const result = {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    stats.forEach(stat => {
      const count = parseInt(stat.count);
      result.total += count;
      result[stat.status] = count;
    });

    return result;
  }

  async cleanupOldJobs(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.jobRepository
      .createQueryBuilder()
      .delete()
      .where('status IN (:...statuses)', {
        statuses: [JobStatus.COMPLETED, JobStatus.CANCELLED],
      })
      .andWhere('completedAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}
