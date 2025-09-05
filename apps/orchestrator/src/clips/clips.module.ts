import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Clip } from './clip.entity';
import { Stream } from '../streams/stream.entity';
import { Chunk } from '../chunks/chunk.entity';
import { ClipsService } from './clips.service';
import { ClipsController } from './clips.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Clip, Stream, Chunk]),
    BullModule.registerQueue(
      {
        name: 'render',
      },
      {
        name: 'publish',
      },
    ),
  ],
  controllers: [ClipsController],
  providers: [ClipsService],
  exports: [TypeOrmModule, ClipsService],
})
export class ClipsModule {}