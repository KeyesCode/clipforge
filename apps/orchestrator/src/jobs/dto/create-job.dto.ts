import { IsEnum, IsOptional, IsObject, IsString, IsUUID, IsInt, Min, Max } from 'class-validator';
import { JobType } from '../job.entity';

export class CreateJobDto {
  @IsEnum(JobType)
  type: JobType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number = 1;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number = 3;

  @IsOptional()
  @IsUUID()
  streamerId?: string;

  @IsOptional()
  @IsUUID()
  streamId?: string;

  @IsOptional()
  @IsUUID()
  clipId?: string;

  @IsOptional()
  @IsString()
  workerId?: string;

  @IsOptional()
  scheduledFor?: Date;
}
