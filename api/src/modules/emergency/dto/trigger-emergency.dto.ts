import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A4 — Acil yardım tetikleme girdisi.
 * channelId opsiyonel: istemci aktif ses/video kanalındaysa gönderir. Boşsa global tetik
 * (aktif VoiceSession'dan bağlam türetilir). Hiçbir kullanıcı içeriği TAŞINMAZ — yalnız bağlam referansı.
 */
export class TriggerEmergencyDto {
  @ApiPropertyOptional({ description: 'Tetik anında aktif olunan ses/video kanalı ID (varsa)' })
  @IsOptional()
  @IsString()
  channelId?: string;
}
