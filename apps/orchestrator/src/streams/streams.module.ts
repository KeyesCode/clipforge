import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { Stream } from './stream.entity';
import { Streamer } from '../streamers/streamer.entity';
import { Chunk } from '../chunks/chunk.entity';
import { Clip } from '../clips/clip.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stream, Streamer, Chunk, Clip]),
    BullModule.registerQueue({
      name: 'ingest',
    }),
    BullModule.registerQueue({
      name: 'processing',
    }),
  ],
  controllers: [StreamsController],
  providers: [StreamsService],
  exports: [StreamsService],
})
export class StreamsModule {}