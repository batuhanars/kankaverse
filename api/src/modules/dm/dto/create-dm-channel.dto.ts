import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDmChannelDto {
  @ApiProperty()
  @IsString()
  userId: string;
}
