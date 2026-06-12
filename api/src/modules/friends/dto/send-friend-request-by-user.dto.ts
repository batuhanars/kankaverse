import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendFriendRequestByUserDto {
  @ApiProperty({ description: 'Hedef kullanıcının ID\'si (tıkla-ekle)' })
  @IsString()
  userId: string;
}
