import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreamersController } from './streamers.controller';
import { StreamersService } from './streamers.service';
import { Streamer } from './streamer.entity';
import { Stream } from '../streams/stream.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stream, Streamer])
  ],
  controllers: [StreamersController],
  providers: [StreamersService],
  exports: [StreamersService, TypeOrmModule]
})
export class StreamersModule {}