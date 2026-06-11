import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReauthFieldsDto {
  @ApiProperty({ description: 'Mevcut şifre (kimlik doğrulama)' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiPropertyOptional({ description: '2FA etkinse TOTP kodu (6 hane)' })
  @IsString()
  @IsOptional()
  totpCode?: string;
}
