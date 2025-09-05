import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewClipDto {
  @ApiProperty({
    description: 'Approval status for the clip',
    enum: ['approved', 'rejected'],
    example: 'approved'
  })
  @IsEnum(['approved', 'rejected'])
  approvalStatus: 'approved' | 'rejected';

  @ApiProperty({ description: 'Reviewer identifier (username or ID)' })
  @IsString()
  @Transform(({ value }) => value?.trim())
  reviewedBy: string;

  @ApiPropertyOptional({ description: 'Review notes or feedback', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => value?.trim())
  reviewNotes?: string;
}