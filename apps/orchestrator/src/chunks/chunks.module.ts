import { ChunksController } from './chunks.controller';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chunk } from './chunk.entity';
import { ChunksService } from './chunks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Chunk])
  ],
  controllers: [ChunksController],
  exports: [ChunksService, TypeOrmModule],
  providers: [ChunksService],
})
export class ChunksModule {}