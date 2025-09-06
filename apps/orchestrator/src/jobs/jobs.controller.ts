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
import { JobsService } from './jobs.service';
import { CreateJobDto, UpdateJobDto, JobQueryDto, JobResponseDto } from './dto';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createJobDto: CreateJobDto): Promise<JobResponseDto> {
    return this.jobsService.create(createJobDto);
  }

  @Get()
  async findAll(@Query() query: JobQueryDto): Promise<{
    jobs: JobResponseDto[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const { jobs, total } = await this.jobsService.findAll(query);
    return {
      jobs,
      total,
      limit: query.limit || 20,
      offset: query.offset || 0,
    };
  }

  @Get('stats')
  async getStats(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    return this.jobsService.getJobStats();
  }

  @Get('active')
  async getActiveJobs(@Query('workerId') workerId?: string): Promise<JobResponseDto[]> {
    const jobs = await this.jobsService.getActiveJobs(workerId);
    return jobs.map(job => new JobResponseDto(job));
  }

  @Get('pending')
  async getPendingJobs(@Query('limit') limit?: number): Promise<JobResponseDto[]> {
    const jobs = await this.jobsService.getPendingJobs(limit);
    return jobs.map(job => new JobResponseDto(job));
  }

  @Get('failed')
  async getFailedJobs(@Query('limit') limit?: number): Promise<JobResponseDto[]> {
    const jobs = await this.jobsService.getFailedJobs(limit);
    return jobs.map(job => new JobResponseDto(job));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<JobResponseDto> {
    return this.jobsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateJobDto: UpdateJobDto,
  ): Promise<JobResponseDto> {
    return this.jobsService.update(id, updateJobDto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string): Promise<JobResponseDto> {
    return this.jobsService.cancel(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  async retry(@Param('id') id: string): Promise<JobResponseDto> {
    return this.jobsService.retry(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.jobsService.delete(id);
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  async cleanupOldJobs(@Query('days') days?: number): Promise<{ deleted: number }> {
    const deleted = await this.jobsService.cleanupOldJobs(days);
    return { deleted };
  }
}
