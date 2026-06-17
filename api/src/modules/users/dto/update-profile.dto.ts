import { IsEnum, IsOptional, IsString, MaxLength, IsIn, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { DmPolicy } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BANNER_PRESET_KEYS } from '../../../common/banner-presets';

/**
 * PATCH /users/me body. Yalnız verilen alanlar güncellenir (undefined → değişmez).
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 512, description: 'Profil metni (≤512). Boş bırakılabilir.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(512, { message: 'Bio en fazla 512 karakter olabilir.' })
  bio?: string;

  @ApiPropertyOptional({ enum: DmPolicy, description: 'DM gizlilik tercihi.' })
  @IsOptional()
  @IsEnum(DmPolicy, { message: 'Geçersiz DM tercihi.' })
  dmPolicy?: DmPolicy;

  // Profil afiş rengi (preset anahtar; allowlist). null → varsayılan (marka Kor). Görsel afiş ileride.
  @ApiPropertyOptional({ example: 'blue', enum: BANNER_PRESET_KEYS, nullable: true, description: 'Profil afiş rengi preset anahtarı (veya null).' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(BANNER_PRESET_KEYS, { message: 'Geçersiz afiş rengi.' })
  bannerColor?: string | null;
}
