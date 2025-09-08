import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

import { ProcessingService } from './processing.service';
import { ProcessingController } from './processing.controller';
import { ProcessingProcessor } from './processing.processor';

// Import entities
import { Stream } from '../streams/stream.entity';
import { Chunk } from '../chunks/chunk.entity';
import { Clip } from '../clips/clip.entity';

@Module({
  imports: [
    // Bull queue for processing jobs
    BullModule.registerQueue({
      name: 'processing',
    }),
    
    // TypeORM entities
    TypeOrmModule.forFeature([Stream, Chunk, Clip]),
    
    // HTTP module for service calls
    HttpModule,
    
    // Config module
    ConfigModule,
  ],
  controllers: [ProcessingController],
  providers: [ProcessingService, ProcessingProcessor],
  exports: [ProcessingService],
})
export class ProcessingModule {}