import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendFriendRequestDto {
  @ApiProperty({ example: 'K7M2QX9F' })
  @IsString()
  @Length(8, 8)
  friendCode: string;
}
