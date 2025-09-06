import { IsEnum, IsString, IsNumber, IsOptional, IsObject, Min, Max, IsNotEmpty } from 'class-validator';
import { QueueType, QueueStatus } from '../queue.entity';

export class CreateQueueDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEnum(QueueType)
  type: QueueType;

  @IsOptional()
  @IsEnum(QueueStatus)
  status?: QueueStatus = QueueStatus.ACTIVE;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  concurrency?: number = 1;

  @IsOptional()
  @IsObject()
  config?: {
    maxRetries?: number;
    retryDelay?: number;
    removeOnComplete?: number;
    removeOnFail?: number;
    backoff?: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
    attempts?: number;
  };

  @IsOptional()
  @IsString()
  description?: string;
}
