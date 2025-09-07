import { Controller, Post, Get, Param, Body, HttpStatus, HttpException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ProcessingService } from './processing.service';

@ApiTags('Processing')
@Controller('processing')
export class ProcessingController {
  private readonly logger = new Logger(ProcessingController.name);

  constructor(private readonly processingService: ProcessingService) {}

  @Post('streams/:streamId/start')
  @ApiOperation({ 
    summary: 'Start processing pipeline for a stream',
    description: 'Initiates the complete processing pipeline: ASR → Vision → Scoring → Rendering'
  })
  @ApiParam({ name: 'streamId', description: 'Stream ID to process' })
  @ApiResponse({ status: 200, description: 'Processing started successfully' })
  @ApiResponse({ status: 404, description: 'Stream not found' })
  @ApiResponse({ status: 400, description: 'Stream has no chunks or invalid state' })
  async startProcessing(@Param('streamId') streamId: string) {
    try {
      this.logger.log(`Starting processing for stream: ${streamId}`);
      await this.processingService.startProcessing(streamId);
      
      return {
        success: true,
        message: `Processing pipeline started for stream ${streamId}`,
        streamId,
        pipeline: ['ASR', 'Vision', 'Scoring', 'Rendering']
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start processing for stream ${streamId}:`, errorMessage);
      
      if (errorMessage.includes('not found')) {
        throw new HttpException(errorMessage, HttpStatus.NOT_FOUND);
      } else if (errorMessage.includes('no chunks')) {
        throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
      }
      
      throw new HttpException(
        `Failed to start processing: ${errorMessage}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('streams/:streamId/status')
  @ApiOperation({ 
    summary: 'Get processing status for a stream',
    description: 'Returns detailed progress of ASR, Vision, Scoring, and Rendering stages'
  })
  @ApiParam({ name: 'streamId', description: 'Stream ID to check status' })
  @ApiResponse({ status: 200, description: 'Processing status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Stream not found' })
  async getProcessingStatus(@Param('streamId') streamId: string) {
    try {
      const status = await this.processingService.getProcessingStatus(streamId);
      return {
        success: true,
        data: status
      };
    } catch (error) {
      this.logger.error(`Failed to get processing status for stream ${streamId}:`, error.message);
      
      if (error.message.includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      
      throw new HttpException(
        `Failed to get processing status: ${error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('webhooks/asr-complete')
  @ApiOperation({ 
    summary: 'Webhook for ASR completion',
    description: 'Called by ASR service when transcription is complete'
  })
  @ApiResponse({ status: 200, description: 'ASR completion processed' })
  async handleASRComplete(@Body() data: { streamId: string; chunkId: string; result: any }) {
    try {
      await this.processingService.onASRComplete(data.streamId, data.chunkId, data.result);
      return { success: true, message: 'ASR completion processed' };
    } catch (error) {
      this.logger.error(`Failed to handle ASR completion:`, error.message);
      throw new HttpException(
        `Failed to process ASR completion: ${error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('webhooks/vision-complete')
  @ApiOperation({ 
    summary: 'Webhook for Vision completion',
    description: 'Called by Vision service when analysis is complete'
  })
  @ApiResponse({ status: 200, description: 'Vision completion processed' })
  async handleVisionComplete(@Body() data: { streamId: string; chunkId: string; result: any }) {
    try {
      await this.processingService.onVisionComplete(data.streamId, data.chunkId, data.result);
      return { success: true, message: 'Vision completion processed' };
    } catch (error) {
      this.logger.error(`Failed to handle Vision completion:`, error.message);
      throw new HttpException(
        `Failed to process Vision completion: ${error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('webhooks/scoring-complete')
  @ApiOperation({ 
    summary: 'Webhook for Scoring completion',
    description: 'Called by Scoring service when analysis is complete'
  })
  @ApiResponse({ status: 200, description: 'Scoring completion processed' })
  async handleScoringComplete(@Body() data: { streamId: string; result: any }) {
    try {
      await this.processingService.onScoringComplete(data.streamId, data.result);
      return { success: true, message: 'Scoring completion processed' };
    } catch (error) {
      this.logger.error(`Failed to handle Scoring completion:`, error.message);
      throw new HttpException(
        `Failed to process Scoring completion: ${error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('webhooks/rendering-complete')
  @ApiOperation({ 
    summary: 'Webhook for Rendering completion',
    description: 'Called by Rendering service when clip is rendered'
  })
  @ApiResponse({ status: 200, description: 'Rendering completion processed' })
  async handleRenderingComplete(@Body() data: { clipId: string; result: any }) {
    try {
      await this.processingService.onRenderingComplete(data.clipId, data.result);
      return { success: true, message: 'Rendering completion processed' };
    } catch (error) {
      this.logger.error(`Failed to handle Rendering completion:`, error.message);
      throw new HttpException(
        `Failed to process Rendering completion: ${error.message}`, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('queue/stats')
  @ApiOperation({ 
    summary: 'Get processing queue statistics',
    description: 'Returns statistics about active, waiting, and completed jobs'
  })
  @ApiResponse({ status: 200, description: 'Queue statistics retrieved' })
  async getQueueStats() {
    // This would integrate with Bull queue statistics
    return {
      success: true,
      message: 'Queue statistics endpoint - to be implemented with Bull queue integration'
    };
  }
}