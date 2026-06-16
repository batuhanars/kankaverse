import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { DmPolicy } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
}
