import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsObject,
  IsArray,
  ValidateNested,
  IsUUID,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClipAspectRatio } from '../clip.entity';

export class CaptionSettingsDto {
  @ApiProperty({ description: 'Enable captions on the clip' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ description: 'Caption style template' })
  @IsOptional()
  @IsString()
  style?: string;

  @ApiPropertyOptional({ description: 'Caption font size', minimum: 8, maximum: 72 })
  @IsOptional()
  @IsNumber()
  @Min(8)
  @Max(72)
  fontSize?: number;

  @ApiPropertyOptional({ description: 'Caption font family' })
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional({ description: 'Caption text color (hex)', example: '#FFFFFF' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Caption background color (hex)', example: '#000000' })
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @ApiPropertyOptional({ 
    description: 'Caption position',
    enum: ['top', 'center', 'bottom'],
    example: 'bottom'
  })
  @IsOptional()
  @IsEnum(['top', 'center', 'bottom'])
  position?: 'top' | 'center' | 'bottom';

  @ApiPropertyOptional({ description: 'Maximum words per line', minimum: 1, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxWordsPerLine?: number;

  @ApiPropertyOptional({ description: 'Words per second display rate', minimum: 0.5, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(5)
  wordsPerSecond?: number;
}

export class RenderSettingsDto {
  @ApiProperty({ 
    description: 'Aspect ratio for the clip',
    enum: ClipAspectRatio,
    example: ClipAspectRatio.VERTICAL
  })
  @IsEnum(ClipAspectRatio)
  aspectRatio: ClipAspectRatio;

  @ApiProperty({ 
    description: 'Video quality',
    enum: ['low', 'medium', 'high', 'ultra'],
    example: 'high'
  })
  @IsEnum(['low', 'medium', 'high', 'ultra'])
  quality: 'low' | 'medium' | 'high' | 'ultra';

  @ApiPropertyOptional({ description: 'Target file size in bytes' })
  @IsOptional()
  @IsNumber()
  @Min(1024) // At least 1KB
  targetFileSize?: number;

  @ApiPropertyOptional({ description: 'Custom crop settings' })
  @IsOptional()
  @IsObject()
  cropSettings?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  @ApiPropertyOptional({ description: 'Video filters to apply', example: ['sharpen', 'denoise'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filters?: string[];
}

export class PublishSettingsDto {
  @ApiProperty({ description: 'Platforms to publish to', example: ['youtube_shorts', 'tiktok'] })
  @IsArray()
  @IsString({ each: true })
  platforms: string[];

  @ApiProperty({ description: 'Video title', maxLength: 100 })
  @IsString()
  @Transform(({ value }) => value?.trim())
  title: string;

  @ApiProperty({ description: 'Video description', maxLength: 5000 })
  @IsString()
  @Transform(({ value }) => value?.trim())
  description: string;

  @ApiProperty({ description: 'Video tags', example: ['gaming', 'highlights', 'twitch'] })
  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @ApiPropertyOptional({ description: 'Custom thumbnail URL' })
  @IsOptional()
  @IsString()
  thumbnail?: string;

  @ApiPropertyOptional({ description: 'Scheduled publish time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiProperty({ 
    description: 'Video privacy setting',
    enum: ['public', 'unlisted', 'private'],
    example: 'public'
  })
  @IsEnum(['public', 'unlisted', 'private'])
  privacy: 'public' | 'unlisted' | 'private';
}

export class CreateClipDto {
  @ApiProperty({ description: 'Stream ID that this clip belongs to' })
  @IsUUID()
  streamId: string;

  @ApiPropertyOptional({ description: 'Specific chunk ID if clip is from a single chunk' })
  @IsOptional()
  @IsUUID()
  chunkId?: string;

  @ApiProperty({ description: 'Clip title', maxLength: 255 })
  @IsString()
  @Transform(({ value }) => value?.trim())
  title: string;

  @ApiPropertyOptional({ description: 'Clip description' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiProperty({ description: 'Start time in seconds', minimum: 0 })
  @IsNumber()
  @Min(0)
  startTime: number;

  @ApiProperty({ description: 'End time in seconds', minimum: 0 })
  @IsNumber()
  @Min(0)
  endTime: number;

  @ApiPropertyOptional({ description: 'Highlight score (0-1)', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  highlightScore?: number;

  @ApiPropertyOptional({ description: 'Detailed score breakdown' })
  @IsOptional()
  @IsObject()
  scoreBreakdown?: {
    audioEnergy: number;
    visualActivity: number;
    speechClarity: number;
    faceDetection: number;
    sceneChanges: number;
    chatActivity?: number;
    viewerReactions?: number;
  };

  @ApiProperty({ description: 'Render settings for the clip' })
  @ValidateNested()
  @Type(() => RenderSettingsDto)
  renderSettings: RenderSettingsDto;

  @ApiProperty({ description: 'Caption settings for the clip' })
  @ValidateNested()
  @Type(() => CaptionSettingsDto)
  captionSettings: CaptionSettingsDto;

  @ApiPropertyOptional({ description: 'Publishing settings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PublishSettingsDto)
  publishSettings?: PublishSettingsDto;
}