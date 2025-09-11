import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Queue } from './queue.entity';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { IngestQueueProcessor, ProcessingQueueProcessor } from './queue.processor';
import { Job } from '../jobs/job.entity';
import { Stream } from '../streams/stream.entity';
import { Chunk } from '../chunks/chunk.entity';
import { Clip } from '../clips/clip.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Queue, Job, Stream, Chunk, Clip]),
    HttpModule,
    ConfigModule,
    BullModule.registerQueue(
      { name: 'ingest' },
      { name: 'transcribe' },
      { name: 'vision' },
      { name: 'scoring' },
      { name: 'render' },
      { name: 'publish' },
      { name: 'notification' },
      { name: 'processing' },
    ),
  ],
  controllers: [QueueController],
  providers: [QueueService, IngestQueueProcessor, ProcessingQueueProcessor],
  exports: [QueueService],
})
export class QueueModule {}
