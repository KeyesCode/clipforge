import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreamersController } from './streamers.controller';
import { StreamersService } from './streamers.service';
import { Streamer } from './streamer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Streamer])
  ],
  controllers: [StreamersController],
  providers: [StreamersService],
  exports: [StreamersService, TypeOrmModule]
})
export class StreamersModule {}