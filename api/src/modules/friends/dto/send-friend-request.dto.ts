import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendFriendRequestDto {
  @ApiProperty({ example: 'nadir#4511' })
  @IsString()
  handle: string;
}
