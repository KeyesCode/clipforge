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
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ClipsService, ClipListResponse, ClipStats } from './clips.service';
import { Clip } from './clip.entity';
import { 
  CreateClipDto, 
  UpdateClipDto, 
  ClipQueryDto, 
  ReviewClipDto 
} from './dto';

@ApiTags('clips')
@Controller('clips')
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create a new clip',
    description: 'Creates a new clip from a stream or chunk with specified settings'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Clip created successfully',
    type: Clip
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Stream or chunk not found' })
  async create(@Body() createClipDto: CreateClipDto): Promise<Clip> {
    try {
      return await this.clipsService.create(createClipDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to create clip: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get all clips',
    description: 'Retrieve clips with optional filtering, sorting, and pagination'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Clips retrieved successfully',
  })
  @ApiQuery({ name: 'streamId', required: false, description: 'Filter by stream ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by clip status' })
  @ApiQuery({ name: 'approvalStatus', required: false, description: 'Filter by approval status' })
  @ApiQuery({ name: 'minScore', required: false, description: 'Minimum highlight score' })
  @ApiQuery({ name: 'maxScore', required: false, description: 'Maximum highlight score' })
  @ApiQuery({ name: 'highlightsOnly', required: false, description: 'Show only highlights' })
  @ApiQuery({ name: 'needsReview', required: false, description: 'Show only clips needing review' })
  @ApiQuery({ name: 'search', required: false, description: 'Search in title and description' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order (asc/desc)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items to return' })
  @ApiQuery({ name: 'offset', required: false, description: 'Number of items to skip' })
  async findAll(@Query() query: ClipQueryDto): Promise<ClipListResponse> {
    try {
      return await this.clipsService.findAll(query);
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve clips: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Get clip statistics',
    description: 'Retrieve aggregated statistics for all clips or clips from a specific stream'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Statistics retrieved successfully',
  })
  @ApiQuery({ name: 'streamId', required: false, description: 'Filter statistics by stream ID' })
  async getStats(@Query('streamId') streamId?: string): Promise<ClipStats> {
    try {
      return await this.clipsService.getStats(streamId);
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve statistics: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('highlights')
  @ApiOperation({ 
    summary: 'Get highlight clips',
    description: 'Retrieve clips with high highlight scores (>= 0.7)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Highlights retrieved successfully',
  })
  async getHighlights(@Query() query: ClipQueryDto): Promise<ClipListResponse> {
    try {
      return await this.clipsService.getHighlights(query);
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve highlights: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('pending-review')
  @ApiOperation({ 
    summary: 'Get clips pending review',
    description: 'Retrieve clips that are completed and need review'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Pending review clips retrieved successfully',
  })
  async getPendingReview(@Query() query: ClipQueryDto): Promise<ClipListResponse> {
    try {
      return await this.clipsService.getPendingReview(query);
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve pending review clips: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stream/:streamId')
  @ApiOperation({ 
    summary: 'Get clips by stream',
    description: 'Retrieve all clips for a specific stream'
  })
  @ApiParam({ name: 'streamId', description: 'Stream UUID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Stream clips retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Stream not found' })
  async getByStream(
    @Param('streamId', ParseUUIDPipe) streamId: string,
    @Query() query: ClipQueryDto,
  ): Promise<ClipListResponse> {
    try {
      return await this.clipsService.getByStream(streamId, query);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retrieve stream clips: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get a clip by ID',
    description: 'Retrieve a specific clip with all its details and relationships'
  })
  @ApiParam({ name: 'id', description: 'Clip UUID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Clip retrieved successfully',
    type: Clip
  })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Clip> {
    try {
      return await this.clipsService.findOne(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retrieve clip: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: 'Update a clip',
    description: 'Update clip properties. Some fields cannot be updated while rendering.'
  })
  @ApiParam({ name: 'id', description: 'Clip UUID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Clip updated successfully',
    type: Clip
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  @ApiResponse({ status: 409, description: 'Cannot update clip while rendering' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClipDto: UpdateClipDto,
  ): Promise<Clip> {
    try {
      return await this.clipsService.update(id, updateClipDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update clip: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: 'Delete a clip',
    description: 'Delete a clip. Cannot delete clips that are currently being rendered.'
  })
  @ApiParam({ name: 'id', description: 'Clip UUID' })
  @ApiResponse({ status: 204, description: 'Clip deleted successfully' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete clip while rendering' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    try {
      await this.clipsService.remove(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to delete clip: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/review')
  @ApiOperation({ 
    summary: 'Review a clip',
    description: 'Approve or reject a completed clip. Approved clips with publish settings will be queued for publishing.'
  })
  @ApiParam({ name: 'id', description: 'Clip UUID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Clip reviewed successfully',
    type: Clip
  })
  @ApiResponse({ status: 400, description: 'Invalid review data or clip not ready for review' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reviewDto: ReviewClipDto,
  ): Promise<Clip> {
    try {
      return await this.clipsService.review(id, reviewDto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to review clip: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/render')
  @ApiOperation({ 
    summary: 'Queue clip for rendering',
    description: 'Add a pending clip to the render queue'
  })
  @ApiParam({ name: 'id', description: 'Clip UUID' })
  @ApiResponse({ status: 202, description: 'Clip queued for rendering' })
  @ApiResponse({ status: 400, description: 'Clip cannot be queued for rendering' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  async queueForRendering(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    try {
      await this.clipsService.queueForRendering(id);
      return { message: 'Clip queued for rendering' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to queue clip for rendering: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/publish')
  @ApiOperation({ 
    summary: 'Queue clip for publishing',
    description: 'Add an approved, rendered clip to the publish queue'
  })
  @ApiParam({ name: 'id', description: 'Clip UUID' })
  @ApiResponse({ status: 202, description: 'Clip queued for publishing' })
  @ApiResponse({ status: 400, description: 'Clip cannot be queued for publishing' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  async queueForPublishing(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    try {
      await this.clipsService.queueForPublishing(id);
      return { message: 'Clip queued for publishing' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to queue clip for publishing: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/retry')
  @ApiOperation({ 
    summary: 'Retry failed clip',
    description: 'Retry a failed clip by resetting it to pending status and re-queuing for rendering'
  })
  @ApiParam({ name: 'id', description: 'Clip UUID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Clip retry initiated',
    type: Clip
  })
  @ApiResponse({ status: 400, description: 'Clip cannot be retried' })
  @ApiResponse({ status: 404, description: 'Clip not found' })
  async retryFailed(@Param('id', ParseUUIDPipe) id: string): Promise<Clip> {
    try {
      return await this.clipsService.retryFailed(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retry clip: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Internal endpoints for render/publish services
  @Patch(':id/render/complete')
  @ApiOperation({ 
    summary: 'Mark rendering complete (Internal)',
    description: 'Internal endpoint for render service to mark clip rendering as complete'
  })
  @ApiParam({ name: 'id', description: 'Clip UUID' })
  async markRenderingComplete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { filePath: string; metadata?: any },
  ): Promise<Clip> {
    try {
      return await this.clipsService.markRenderingComplete(id, body.filePath, body.metadata);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to mark rendering complete: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':id/render/failed')
  @ApiOperation({ 
    summary: 'Mark rendering failed (Internal)',
    description: 'Internal endpoint for render service to mark clip rendering as failed'
  })
  @ApiParam({ name: 'id', description: 'Clip UUID' })
  async markRenderingFailed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { errorMessage: string },
  ): Promise<Clip> {
    try {
      return await this.clipsService.markRenderingFailed(id, body.errorMessage);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to mark rendering failed: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':id/published')
  @ApiOperation({ 
    summary: 'Mark clip as published (Internal)',
    description: 'Internal endpoint for publisher service to mark clip as published'
  })
  @ApiParam({ name: 'id', description: 'Clip UUID' })
  async markPublished(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { publishedUrls: Record<string, string> },
  ): Promise<Clip> {
    try {
      return await this.clipsService.markPublished(id, body.publishedUrls);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to mark clip as published: ' + (error as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}