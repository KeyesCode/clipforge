import { PartialType, OmitType } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { CreateClipDto } from './create-clip.dto';

export class UpdateClipDto extends PartialType(
  OmitType(CreateClipDto, ['streamId'] as const)
) {
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number;
}