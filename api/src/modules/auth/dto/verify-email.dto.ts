import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ description: 'E-posta doğrulama tokeni (URL\'den)' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
