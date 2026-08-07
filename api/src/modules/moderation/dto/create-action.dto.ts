import { IsEnum, IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModActionType } from '@prisma/client';

/**
 * C8/R7 — `MEDIA_REMOVE` aksiyonunun hedefi (DTO-seviyesi enum; Prisma enum DEĞİL).
 * USER_* → dto.targetUserId'nin alanı; GUILD_* → dto.scope (guildId) altındaki guild'in alanı.
 */
export enum MediaTarget {
  USER_AVATAR = 'USER_AVATAR',
  USER_BANNER = 'USER_BANNER',
  GUILD_BANNER = 'GUILD_BANNER',
  GUILD_ICON = 'GUILD_ICON',
}

export class CreateActionDto {
  @ApiProperty()
  @IsString()
  targetUserId: string;

  @ApiProperty({ enum: ModActionType })
  @IsEnum(ModActionType)
  type: ModActionType;

  @ApiPropertyOptional({ description: 'guildId (guild-scope) veya boş (global)' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiProperty()
  @IsString()
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relatedReportId?: string;

  @ApiPropertyOptional({ description: 'Geçici aksiyon: saat cinsinden süre' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInHours?: number;

  @ApiPropertyOptional({
    enum: MediaTarget,
    description:
      'MEDIA_REMOVE aksiyonu için zorunlu hedef (USER_AVATAR|USER_BANNER|GUILD_BANNER|GUILD_ICON).',
  })
  @IsOptional()
  @IsEnum(MediaTarget)
  mediaTarget?: MediaTarget;
}
