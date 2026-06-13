import { IsEnum, IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModActionType } from '@prisma/client';

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
}
