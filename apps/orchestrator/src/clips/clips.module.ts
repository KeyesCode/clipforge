import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clip } from './clip.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Clip])
  ],
  exports: [TypeOrmModule]
})
export class ClipsModule {}