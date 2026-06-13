import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddChannelMemberDto {
  @ApiProperty({ example: 'clxxxxx', description: 'Kanala eklenecek kullanıcının ID\'si' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
