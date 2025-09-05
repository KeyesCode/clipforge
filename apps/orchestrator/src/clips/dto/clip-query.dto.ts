import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClipStatus, ClipAspectRatio } from '../clip.entity';

export class ClipQueryDto {
  @ApiPropertyOptional({ description: 'Filter by stream ID' })
  @IsOptional()
  @IsUUID()
  streamId?: string;

  @ApiPropertyOptional({ description: 'Filter by chunk ID' })
  @IsOptional()
  @IsUUID()
  chunkId?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by clip status',
    enum: ClipStatus
  })
  @IsOptional()
  @IsEnum(ClipStatus)
  status?: ClipStatus;

  @ApiPropertyOptional({
    description: 'Filter by approval status',
    enum: ['pending', 'approved', 'rejected']
  })
  @IsOptional()
  @IsEnum(['pending', 'approved', 'rejected'])
  approvalStatus?: 'pending' | 'approved' | 'rejected';

  @ApiPropertyOptional({
    description: 'Filter by aspect ratio',
    enum: ClipAspectRatio
  })
  @IsOptional()
  @IsEnum(ClipAspectRatio)
  aspectRatio?: ClipAspectRatio;

  @ApiPropertyOptional({ description: 'Minimum highlight score (0-1)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minScore?: number;

  @ApiPropertyOptional({ description: 'Maximum highlight score (0-1)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  maxScore?: number;

  @ApiPropertyOptional({ description: 'Minimum duration in seconds' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minDuration?: number;

  @ApiPropertyOptional({ description: 'Maximum duration in seconds' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDuration?: number;

  @ApiPropertyOptional({ description: 'Filter by reviewer' })
  @IsOptional()
  @IsString()
  reviewedBy?: string;

  @ApiPropertyOptional({ description: 'Only show highlights (score >= 0.7)' })
  @IsOptional()
  @Transform(({ value }: { value: any }) => value === 'true' || value === true)
  @IsBoolean()
  highlightsOnly?: boolean;

  @ApiPropertyOptional({ description: 'Only show clips that need review' })
  @IsOptional()
  @Transform(({ value }: { value: any }) => value === 'true' || value === true)
  @IsBoolean()
  needsReview?: boolean;

  @ApiPropertyOptional({ description: 'Search in title and description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field', default: 'createdAt' })
  @IsOptional()
  @IsEnum([
    'createdAt',
    'updatedAt', 
    'highlightScore',
    'duration',
    'title',
    'startTime'
  ])
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', default: 'desc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'Number of items to return', default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Number of items to skip', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;
}