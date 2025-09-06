import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Queue } from './queue.entity';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Queue]),
    BullModule.registerQueue(
      { name: 'ingest' },
      { name: 'transcribe' },
      { name: 'vision' },
      { name: 'scoring' },
      { name: 'render' },
      { name: 'publish' },
      { name: 'notification' },
    ),
  ],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
