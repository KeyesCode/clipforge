import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { StreamsService } from './streams.service';
import { Stream } from './stream.entity';

@Controller('streams')
export class StreamsController {
  constructor(private readonly streamsService: StreamsService) {}

  @Get()
  async findAll(
    @Query('platform') platform?: string,
    @Query('status') status?: string,
    @Query('streamerId') streamerId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ data: Stream[]; total: number; limit: number; offset: number; hasNext: boolean; hasPrev: boolean }> {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 50;
      const offsetNum = offset ? parseInt(offset, 10) : 0;
      const filters = {
        platform,
        status,
        streamerId,
        limitNum,
        offsetNum
      };
      
      const result = await this.streamsService.findAll(filters);
      
      return {
        data: result.streams,
        total: result.total,
        limit: limitNum,
        offset: offsetNum,
        hasNext: offsetNum + limitNum < result.total,
        hasPrev: offsetNum > 0
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve streams',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Stream> {
    try {
      const stream = await this.streamsService.findOne(id);
      if (!stream) {
        throw new HttpException('Stream not found', HttpStatus.NOT_FOUND);
      }
      return stream;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retrieve stream',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  async create(@Body() createStreamDto: Partial<Stream>): Promise<Stream> {
    try {
      return await this.streamsService.create(createStreamDto);
    } catch (error) {
      throw new HttpException(
        'Failed to create stream',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateStreamDto: Partial<Stream>,
  ): Promise<Stream> {
    try {
      const stream = await this.streamsService.update(id, updateStreamDto);
      if (!stream) {
        throw new HttpException('Stream not found', HttpStatus.NOT_FOUND);
      }
      return stream;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update stream',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    try {
      await this.streamsService.remove(id);
      return { message: 'Stream deleted successfully' };
    } catch (error) {
      throw new HttpException(
        'Failed to delete stream',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/ingest')
  async ingestStream(@Param('id') id: string): Promise<{ message: string }> {
    try {
      return await this.streamsService.ingestStream(id);
    } catch (error) {
      throw new HttpException(
        'Failed to start stream ingestion',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/process')
  async processStream(@Param('id') id: string): Promise<{ message: string }> {
    try {
      return await this.streamsService.processStream(id);
    } catch (error) {
      throw new HttpException(
        'Failed to start stream processing',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/chunks')
  async getStreamChunks(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 50;
      const offsetNum = offset ? parseInt(offset, 10) : 0;
      
      return await this.streamsService.getStreamChunks(id, limitNum, offsetNum);
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve stream chunks',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/clips')
  async getStreamClips(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 50;
      const offsetNum = offset ? parseInt(offset, 10) : 0;
      
      return await this.streamsService.getStreamClips(id, limitNum, offsetNum);
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve stream clips',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/stats')
  async getStreamStats(@Param('id') id: string) {
    try {
      return await this.streamsService.getStreamStats(id);
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve stream statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ): Promise<Stream> {
    try {
      return await this.streamsService.updateStatus(id, status);
    } catch (error) {
      throw new HttpException(
        'Failed to update stream status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}