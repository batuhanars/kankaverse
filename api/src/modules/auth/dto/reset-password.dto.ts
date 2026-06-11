import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Şifre sıfırlama tokeni (URL\'den)' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ description: 'Yeni şifre (min 8, max 128 karakter)' })
  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır.' })
  @MaxLength(128, { message: 'Şifre en fazla 128 karakter olabilir.' })
  newPassword: string;
}
