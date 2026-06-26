import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * AdminUserDto — admin kullanıcı genel-bakış satırı (yalnız isModerator okur).
 * Hassas alanlar (passwordHash, totpSecret) KASTEN dışarıda — bu DTO bir
 * denetim/genel-bakış görünümüdür, kimlik-doğrulama yüzeyi değil (R7).
 */
export class AdminUserDto {
  @ApiProperty() id: string;
  @ApiProperty() username: string;
  @ApiProperty() email: string;
  @ApiProperty({ description: 'E-posta doğrulandı mı' }) emailVerified: boolean;
  @ApiProperty({ description: 'Hesap reşit-olmayan mı (T&S)' }) isMinor: boolean;
  @ApiProperty({ description: 'Platform admin mi' }) isModerator: boolean;
  @ApiProperty({ description: 'e-Devlet doğrulama durumu' }) verificationStatus: string;
  @ApiPropertyOptional({ nullable: true, description: 'Kaydolurken kullanılan davet kodu' })
  invitedViaCode: string | null;
  @ApiProperty({ description: 'Kayıt tarihi (ISO)' }) createdAt: string;
}
