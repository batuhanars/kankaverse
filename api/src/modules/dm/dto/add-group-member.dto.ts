import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddGroupMemberDto {
  @ApiProperty({ description: 'Gruba eklenecek kullanıcı ID' })
  @IsString()
  userId: string;
}
