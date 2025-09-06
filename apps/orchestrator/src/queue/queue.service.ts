import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository, FindManyOptions, Between, Like } from 'typeorm';
import { Queue as BullQueue } from 'bull';
import { Queue, QueueType, QueueStatus } from './queue.entity';
import { CreateQueueDto, UpdateQueueDto, QueueQueryDto, QueueResponseDto, QueueStatsDto } from './dto';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectRepository(Queue)
    private readonly queueRepository: Repository<Queue>,
    @InjectQueue('ingest') private readonly ingestQueue: BullQueue,
    @InjectQueue('transcribe') private readonly transcribeQueue: BullQueue,
    @InjectQueue('vision') private readonly visionQueue: BullQueue,
    @InjectQueue('scoring') private readonly scoringQueue: BullQueue,
    @InjectQueue('render') private readonly renderQueue: BullQueue,
    @InjectQueue('publish') private readonly publishQueue: BullQueue,
    @InjectQueue('notification') private readonly notificationQueue: BullQueue,
  ) {}

  private getBullQueue(type: QueueType): BullQueue {
    const queueMap = {
      [QueueType.INGEST]: this.ingestQueue,
      [QueueType.TRANSCRIBE]: this.transcribeQueue,
      [QueueType.VISION]: this.visionQueue,
      [QueueType.SCORING]: this.scoringQueue,
      [QueueType.RENDER]: this.renderQueue,
      [QueueType.PUBLISH]: this.publishQueue,
      [QueueType.NOTIFICATION]: this.notificationQueue,
    };
    return queueMap[type];
  }

  async create(createQueueDto: CreateQueueDto): Promise<QueueResponseDto> {
    // Check if queue with same name already exists
    const existingQueue = await this.queueRepository.findOne({
      where: { name: createQueueDto.name },
    });

    if (existingQueue) {
      throw new BadRequestException(`Queue with name '${createQueueDto.name}' already exists`);
    }

    const queue = this.queueRepository.create(createQueueDto);
    const savedQueue = await this.queueRepository.save(queue);

    // Initialize the Bull queue with the configuration
    const bullQueue = this.getBullQueue(queue.type);
    if (bullQueue) {
      await this.updateBullQueueConfig(bullQueue, queue.config);
    }

    this.logger.log(`Created queue: ${queue.name} (${queue.type})`);
    return new QueueResponseDto(savedQueue);
  }

  async findAll(query: QueueQueryDto): Promise<{ queues: QueueResponseDto[]; total: number }> {
    const {
      type,
      status,
      search,
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const where: any = {};

    if (type) where.type = type;
    if (status) where.status = status;

    const findOptions: FindManyOptions<Queue> = {
      where,
      order: { [sortBy]: sortOrder },
      take: limit,
      skip: offset,
    };

    // Add search functionality
    if (search) {
      findOptions.where = [
        { ...where, name: Like(`%${search}%`) },
        { ...where, description: Like(`%${search}%`) },
      ];
    }

    const [queues, total] = await this.queueRepository.findAndCount(findOptions);

    // Update queue stats from Bull queues
    const updatedQueues = await Promise.all(
      queues.map(async (queue) => {
        const bullQueue = this.getBullQueue(queue.type);
        if (bullQueue) {
          const stats = await this.getBullQueueStats(bullQueue);
          Object.assign(queue, stats);
          await this.queueRepository.save(queue);
        }
        return queue;
      }),
    );

    return {
      queues: updatedQueues.map(queue => new QueueResponseDto(queue)),
      total,
    };
  }

  async findOne(id: string): Promise<QueueResponseDto> {
    const queue = await this.queueRepository.findOne({ where: { id } });

    if (!queue) {
      throw new NotFoundException(`Queue with ID ${id} not found`);
    }

    // Update stats from Bull queue
    const bullQueue = this.getBullQueue(queue.type);
    if (bullQueue) {
      const stats = await this.getBullQueueStats(bullQueue);
      Object.assign(queue, stats);
      await this.queueRepository.save(queue);
    }

    return new QueueResponseDto(queue);
  }

  async findByName(name: string): Promise<QueueResponseDto> {
    const queue = await this.queueRepository.findOne({ where: { name } });

    if (!queue) {
      throw new NotFoundException(`Queue with name '${name}' not found`);
    }

    // Update stats from Bull queue
    const bullQueue = this.getBullQueue(queue.type);
    if (bullQueue) {
      const stats = await this.getBullQueueStats(bullQueue);
      Object.assign(queue, stats);
      await this.queueRepository.save(queue);
    }

    return new QueueResponseDto(queue);
  }

  async update(id: string, updateQueueDto: UpdateQueueDto): Promise<QueueResponseDto> {
    const queue = await this.queueRepository.findOne({ where: { id } });

    if (!queue) {
      throw new NotFoundException(`Queue with ID ${id} not found`);
    }

    // Update queue properties
    Object.assign(queue, updateQueueDto);

    // Update Bull queue configuration if config changed
    if (updateQueueDto.config) {
      const bullQueue = this.getBullQueue(queue.type);
      if (bullQueue) {
        await this.updateBullQueueConfig(bullQueue, updateQueueDto.config);
      }
    }

    const savedQueue = await this.queueRepository.save(queue);
    this.logger.log(`Updated queue: ${queue.name}`);
    return new QueueResponseDto(savedQueue);
  }

  async delete(id: string): Promise<void> {
    const queue = await this.queueRepository.findOne({ where: { id } });

    if (!queue) {
      throw new NotFoundException(`Queue with ID ${id} not found`);
    }

    // Pause and drain the Bull queue before deletion
    const bullQueue = this.getBullQueue(queue.type);
    if (bullQueue) {
      await bullQueue.pause();
      await bullQueue.obliterate({ force: true });
    }

    await this.queueRepository.delete(id);
    this.logger.log(`Deleted queue: ${queue.name}`);
  }

  async pause(id: string): Promise<QueueResponseDto> {
    const queue = await this.queueRepository.findOne({ where: { id } });

    if (!queue) {
      throw new NotFoundException(`Queue with ID ${id} not found`);
    }

    const bullQueue = this.getBullQueue(queue.type);
    if (bullQueue) {
      await bullQueue.pause();
    }

    queue.status = QueueStatus.PAUSED;
    const savedQueue = await this.queueRepository.save(queue);

    this.logger.log(`Paused queue: ${queue.name}`);
    return new QueueResponseDto(savedQueue);
  }

  async resume(id: string): Promise<QueueResponseDto> {
    const queue = await this.queueRepository.findOne({ where: { id } });

    if (!queue) {
      throw new NotFoundException(`Queue with ID ${id} not found`);
    }

    const bullQueue = this.getBullQueue(queue.type);
    if (bullQueue) {
      await bullQueue.resume();
    }

    queue.status = QueueStatus.ACTIVE;
    const savedQueue = await this.queueRepository.save(queue);

    this.logger.log(`Resumed queue: ${queue.name}`);
    return new QueueResponseDto(savedQueue);
  }

  async clear(id: string): Promise<QueueResponseDto> {
    const queue = await this.queueRepository.findOne({ where: { id } });

    if (!queue) {
      throw new NotFoundException(`Queue with ID ${id} not found`);
    }

    const bullQueue = this.getBullQueue(queue.type);
    if (bullQueue) {
      await bullQueue.obliterate({ force: true });
    }

    // Reset queue counters
    queue.waiting = 0;
    queue.active = 0;
    queue.completed = 0;
    queue.failed = 0;
    queue.delayed = 0;
    queue.paused = 0;

    const savedQueue = await this.queueRepository.save(queue);

    this.logger.log(`Cleared queue: ${queue.name}`);
    return new QueueResponseDto(savedQueue);
  }

  async getStats(): Promise<QueueStatsDto> {
    const queues = await this.queueRepository.find();
    
    let totalQueues = queues.length;
    let activeQueues = 0;
    let pausedQueues = 0;
    let errorQueues = 0;
    let totalJobs = 0;
    let totalWaiting = 0;
    let totalActive = 0;
    let totalCompleted = 0;
    let totalFailed = 0;
    let totalDelayed = 0;
    let totalPaused = 0;
    let totalSuccessRate = 0;
    let totalErrorRate = 0;
    let overloadedQueues = 0;
    let healthyQueues = 0;

    for (const queue of queues) {
      // Update stats from Bull queue
      const bullQueue = this.getBullQueue(queue.type);
      if (bullQueue) {
        const stats = await this.getBullQueueStats(bullQueue);
        Object.assign(queue, stats);
        await this.queueRepository.save(queue);
      }

      // Count by status
      if (queue.status === QueueStatus.ACTIVE) activeQueues++;
      else if (queue.status === QueueStatus.PAUSED) pausedQueues++;
      else if (queue.status === QueueStatus.ERROR) errorQueues++;

      // Aggregate job counts
      totalJobs += queue.totalJobs;
      totalWaiting += queue.waiting;
      totalActive += queue.active;
      totalCompleted += queue.completed;
      totalFailed += queue.failed;
      totalDelayed += queue.delayed;
      totalPaused += queue.paused;

      // Aggregate rates
      totalSuccessRate += queue.successRate;
      totalErrorRate += queue.errorRate;

      // Count special conditions
      if (queue.isOverloaded) overloadedQueues++;
      if (queue.isHealthy) healthyQueues++;
    }

    const averageSuccessRate = totalQueues > 0 ? totalSuccessRate / totalQueues : 0;
    const averageErrorRate = totalQueues > 0 ? totalErrorRate / totalQueues : 0;

    return new QueueStatsDto({
      totalQueues,
      activeQueues,
      pausedQueues,
      errorQueues,
      totalJobs,
      totalWaiting,
      totalActive,
      totalCompleted,
      totalFailed,
      totalDelayed,
      totalPaused,
      averageSuccessRate,
      averageErrorRate,
      overloadedQueues,
      healthyQueues,
      lastUpdated: new Date(),
    });
  }

  private async getBullQueueStats(bullQueue: BullQueue): Promise<Partial<Queue>> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        bullQueue.getWaiting(),
        bullQueue.getActive(),
        bullQueue.getCompleted(),
        bullQueue.getFailed(),
        bullQueue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: 0, // Bull doesn't have a getPaused method
        lastProcessedAt: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get Bull queue stats: ${errorMessage}`);
      return {
        lastErrorAt: new Date(),
        lastError: errorMessage,
      };
    }
  }

  private async updateBullQueueConfig(bullQueue: BullQueue, config: any): Promise<void> {
    try {
      // Note: Bull queue configuration is typically set during queue creation
      // These options would need to be set when creating the queue instance
      this.logger.log(`Queue config update requested for ${bullQueue.name}: ${JSON.stringify(config)}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to update Bull queue config: ${errorMessage}`);
    }
  }

  // Utility methods for job management
  async addJob(queueType: QueueType, jobData: any, options?: any): Promise<any> {
    const bullQueue = this.getBullQueue(queueType);
    if (!bullQueue) {
      throw new BadRequestException(`Queue type ${queueType} not found`);
    }

    return await bullQueue.add(jobData, options);
  }

  async getJob(queueType: QueueType, jobId: string): Promise<any> {
    const bullQueue = this.getBullQueue(queueType);
    if (!bullQueue) {
      throw new BadRequestException(`Queue type ${queueType} not found`);
    }

    return await bullQueue.getJob(jobId);
  }

  async removeJob(queueType: QueueType, jobId: string): Promise<void> {
    const bullQueue = this.getBullQueue(queueType);
    if (!bullQueue) {
      throw new BadRequestException(`Queue type ${queueType} not found`);
    }

    const job = await bullQueue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }
}
