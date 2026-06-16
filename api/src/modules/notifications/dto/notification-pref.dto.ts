import { IsEnum, IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationLevel, NotifTargetType } from '@prisma/client';

/** İstemciye dönen tercih şekli (sözleşme: targetType, targetId, muted, level). */
export interface NotificationPrefDto {
  targetType: NotifTargetType; // GUILD | CHANNEL
  targetId: string;
  muted: boolean;
  level: NotificationLevel; // ALL | MENTIONS | NONE
}

/** PUT /notifications/prefs body — upsert (kısmi update; verilmeyen alan korunur). */
export class SetNotificationPrefDto {
  @ApiProperty({ enum: NotifTargetType, example: 'CHANNEL' })
  @IsEnum(NotifTargetType, { message: 'Geçersiz hedef türü.' })
  targetType: NotifTargetType;

  @ApiProperty({ example: 'channel-id', description: 'GUILD → guildId, CHANNEL → channelId' })
  @IsString()
  @IsNotEmpty({ message: 'Hedef ID boş olamaz.' })
  targetId: string;

  @ApiPropertyOptional({ example: true, description: 'Sustur (varsayılan false)' })
  @IsOptional()
  @IsBoolean()
  muted?: boolean;

  @ApiPropertyOptional({ enum: NotificationLevel, example: 'MENTIONS', description: 'Bildirim seviyesi (varsayılan ALL)' })
  @IsOptional()
  @IsEnum(NotificationLevel, { message: 'Geçersiz bildirim seviyesi.' })
  level?: NotificationLevel;
}
