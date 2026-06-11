import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmTokenDto {
  @ApiProperty({ description: 'E-posta linkinden alınan token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
