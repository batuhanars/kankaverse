import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendFriendRequestDto {
  @ApiProperty({ example: 'K7M2QX' })
  @IsString()
  @Length(6, 6, { message: 'Kanka kodu tam 6 karakter olmalıdır.' })
  friendCode: string;
}
