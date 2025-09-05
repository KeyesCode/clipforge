import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { StreamersService } from './streamers.service';
import { Streamer } from './streamer.entity';

@Controller('streamers')
export class StreamersController {
  constructor(private readonly streamersService: StreamersService) {}

  @Get()
  async findAll(
    @Query('platform') platform?: string,
    @Query('active') active?: string,
  ): Promise<Streamer[]> {
    const filters: any = {};
    if (platform) filters.platform = platform;
    if (active !== undefined) filters.active = active === 'true';
    
    return this.streamersService.findAll(filters);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Streamer> {
    return this.streamersService.findOne(id);
  }

  @Post()
  async create(@Body() createStreamerDto: Partial<Streamer>): Promise<Streamer> {
    return this.streamersService.create(createStreamerDto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateStreamerDto: Partial<Streamer>,
  ): Promise<Streamer> {
    return this.streamersService.update(id, updateStreamerDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.streamersService.remove(id);
  }

  @Post(':id/sync')
  async syncStreamer(@Param('id') id: string): Promise<{ message: string }> {
    await this.streamersService.syncStreamer(id);
    return { message: 'Streamer sync initiated' };
  }

  @Get(':id/streams')
  async getStreamerStreams(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.streamersService.getStreamerStreams(
      id,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Put(':id/settings')
  async updateSettings(
    @Param('id') id: string,
    @Body() settings: Record<string, any>,
  ): Promise<Streamer> {
    return this.streamersService.updateSettings(id, settings);
  }
}