import { PartialType } from '@nestjs/mapped-types';
import { CreateQueueDto } from './create-queue.dto';
import { IsOptional, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { QueueStatus } from '../queue.entity';

export class UpdateQueueDto extends PartialType(CreateQueueDto) {
  @IsOptional()
  @IsEnum(QueueStatus)
  status?: QueueStatus;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  concurrency?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waiting?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  active?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  completed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  failed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  delayed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paused?: number;
}
