import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Login2faDto {
  @ApiProperty({ description: 'Login\'den dönen challenge token (5 dk geçerli)' })
  @IsString()
  @IsNotEmpty()
  challengeToken: string;

  @ApiProperty({ description: 'TOTP kodu (6 hane) veya kurtarma kodu (XXXX-XXXX-XXXX-XXXX)' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
