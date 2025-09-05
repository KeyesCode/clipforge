import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
  ParseUUIDPipe,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { ChunksService } from './chunks.service';
import { Chunk } from './chunk.entity';

export class CreateChunkDto {
  streamId: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  filePath?: string;
  thumbnailPath?: string;
}

export class UpdateChunkDto {
  title?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  transcription?: any;
  audioFeatures?: any;
  visualFeatures?: any;
  highlightScore?: number;
  scoreBreakdown?: any;
  processingError?: string;
}

export class ChunkFiltersDto {
  streamId?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  minScore?: number;
  maxScore?: number;
  hasTranscription?: boolean;
  limit?: number;
  offset?: number;
}

@Controller('chunks')
export class ChunksController {
  constructor(private readonly chunksService: ChunksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(ValidationPipe) createChunkDto: CreateChunkDto,
  ): Promise<Chunk> {
    return this.chunksService.create(createChunkDto);
  }

  @Get()
  async findAll(@Query() filters: ChunkFiltersDto) {
    return this.chunksService.findAll(filters);
  }

  @Get('highlights')
  async getHighlights(
    @Query('streamId') streamId?: string,
    @Query('limit') limit?: number,
    @Query('minScore') minScore?: number,
  ) {
    return this.chunksService.getHighlights({
      streamId,
      limit: limit ? parseInt(limit.toString()) : 10,
      minScore: minScore ? parseFloat(minScore.toString()) : 0.7,
    });
  }

  @Get('stream/:streamId')
  async findByStream(
    @Param('streamId', ParseUUIDPipe) streamId: string,
    @Query() filters: Omit<ChunkFiltersDto, 'streamId'>,
  ) {
    return this.chunksService.findAll({ ...filters, streamId });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Chunk> {
    return this.chunksService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) updateChunkDto: UpdateChunkDto,
  ): Promise<Chunk> {
    return this.chunksService.update(id, updateChunkDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.chunksService.remove(id);
  }

  @Post(':id/process')
  async processChunk(@Param('id', ParseUUIDPipe) id: string) {
    return this.chunksService.processChunk(id);
  }

  @Post(':id/score')
  async scoreChunk(@Param('id', ParseUUIDPipe) id: string) {
    return this.chunksService.scoreChunk(id);
  }

  @Get(':id/transcription')
  async getTranscription(@Param('id', ParseUUIDPipe) id: string) {
    return this.chunksService.getTranscription(id);
  }

  @Post(':id/transcription')
  async updateTranscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() transcriptionData: any,
  ) {
    return this.chunksService.updateTranscription(id, transcriptionData);
  }

  @Get(':id/features')
  async getFeatures(@Param('id', ParseUUIDPipe) id: string) {
    return this.chunksService.getFeatures(id);
  }

  @Post(':id/features/audio')
  async updateAudioFeatures(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() audioFeatures: any,
  ) {
    return this.chunksService.updateAudioFeatures(id, audioFeatures);
  }

  @Post(':id/features/visual')
  async updateVisualFeatures(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() visualFeatures: any,
  ) {
    return this.chunksService.updateVisualFeatures(id, visualFeatures);
  }

  @Get(':id/stats')
  async getChunkStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.chunksService.getChunkStats(id);
  }

  @Post('batch/process')
  async processBatch(@Body() chunkIds: string[]) {
    return this.chunksService.processBatch(chunkIds);
  }

  @Post('batch/score')
  async scoreBatch(@Body() chunkIds: string[]) {
    return this.chunksService.scoreBatch(chunkIds);
  }

  @Get('analytics/distribution')
  async getScoreDistribution(
    @Query('streamId') streamId?: string,
    @Query('bins') bins?: number,
  ) {
    return this.chunksService.getScoreDistribution({
      streamId,
      bins: bins ? parseInt(bins.toString()) : 10,
    });
  }

  @Get('analytics/timeline')
  async getTimelineAnalytics(
    @Query('streamId') streamId: string,
    @Query('interval') interval?: number,
  ) {
    return this.chunksService.getTimelineAnalytics(streamId, {
      interval: interval ? parseInt(interval.toString()) : 60,
    });
  }
}