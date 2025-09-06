import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { QueueService } from './queue.service';
import { CreateQueueDto, UpdateQueueDto, QueueQueryDto, QueueResponseDto, QueueStatsDto } from './dto';

@Controller('queues')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createQueueDto: CreateQueueDto): Promise<QueueResponseDto> {
    return this.queueService.create(createQueueDto);
  }

  @Get()
  async findAll(@Query() query: QueueQueryDto): Promise<{
    queues: QueueResponseDto[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const { queues, total } = await this.queueService.findAll(query);
    return {
      queues,
      total,
      limit: query.limit || 20,
      offset: query.offset || 0,
    };
  }

  @Get('stats')
  async getStats(): Promise<QueueStatsDto> {
    return this.queueService.getStats();
  }

  @Get('health')
  async getHealth(): Promise<{
    status: string;
    healthy: number;
    total: number;
    overloaded: number;
    errors: number;
  }> {
    const stats = await this.queueService.getStats();
    return {
      status: stats.healthyQueues === stats.totalQueues ? 'healthy' : 'degraded',
      healthy: stats.healthyQueues,
      total: stats.totalQueues,
      overloaded: stats.overloadedQueues,
      errors: stats.errorQueues,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<QueueResponseDto> {
    return this.queueService.findOne(id);
  }

  @Get('name/:name')
  async findByName(@Param('name') name: string): Promise<QueueResponseDto> {
    return this.queueService.findByName(name);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateQueueDto: UpdateQueueDto,
  ): Promise<QueueResponseDto> {
    return this.queueService.update(id, updateQueueDto);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  async pause(@Param('id') id: string): Promise<QueueResponseDto> {
    return this.queueService.pause(id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resume(@Param('id') id: string): Promise<QueueResponseDto> {
    return this.queueService.resume(id);
  }

  @Post(':id/clear')
  @HttpCode(HttpStatus.OK)
  async clear(@Param('id') id: string): Promise<QueueResponseDto> {
    return this.queueService.clear(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.queueService.delete(id);
  }

  // Job management endpoints
  @Post(':id/jobs')
  @HttpCode(HttpStatus.CREATED)
  async addJob(
    @Param('id') id: string,
    @Body() jobData: { data: any; options?: any },
  ): Promise<{ jobId: string }> {
    const queue = await this.queueService.findOne(id);
    const job = await this.queueService.addJob(queue.type, jobData.data, jobData.options);
    return { jobId: job.id.toString() };
  }

  @Get(':id/jobs/:jobId')
  async getJob(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ): Promise<any> {
    const queue = await this.queueService.findOne(id);
    return this.queueService.getJob(queue.type, jobId);
  }

  @Delete(':id/jobs/:jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeJob(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ): Promise<void> {
    const queue = await this.queueService.findOne(id);
    return this.queueService.removeJob(queue.type, jobId);
  }
}
