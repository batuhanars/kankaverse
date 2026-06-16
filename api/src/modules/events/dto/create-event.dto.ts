import {
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  IsDateString,
  Length,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * CreateEventDto — Sprint V3 §6 (sözleşme birebir).
 *
 * Konum doğrulaması (channelId VOICE ise zorunlu / externalLocation EXTERNAL ise
 * zorunlu) ve geçmiş-tarih / kanal-tür kontrolleri SERVİSTE yapılır (EVENT_LOCATION_REQUIRED,
 * EVENT_START_IN_PAST, INVALID_EVENT_CHANNEL) — DTO yalnız şekil/tip doğrular.
 *
 * recurrence: MVP yalnız 'NONE' kabul (@IsIn ile). Diğer enum değerleri yarın açılır.
 */
export class CreateEventDto {
  @ApiProperty({ example: 'Pazar Akşamı Oyun Gecesi', description: 'Etkinlik konusu (zorunlu)' })
  @IsString()
  @Length(1, 100, { message: 'Etkinlik adı 1-100 karakter olmalıdır.' })
  name: string;

  @ApiPropertyOptional({ example: 'Birlikte Among Us oynuyoruz.', description: 'Açıklama (markdown)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Açıklama en fazla 1000 karakter olabilir.' })
  description?: string;

  @ApiProperty({ enum: ['VOICE_CHANNEL', 'EXTERNAL'], example: 'VOICE_CHANNEL' })
  @IsEnum(['VOICE_CHANNEL', 'EXTERNAL'] as const, { message: 'Geçersiz konum türü.' })
  locationType: 'VOICE_CHANNEL' | 'EXTERNAL';

  @ApiPropertyOptional({ example: 'channel-id', description: 'Ses kanalı ID — VOICE_CHANNEL ise zorunlu' })
  @IsOptional()
  @IsString()
  channelId?: string;

  @ApiPropertyOptional({ example: 'Kadıköy Sahil', description: 'Dış konum (düz metin) — EXTERNAL ise zorunlu' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Konum en fazla 200 karakter olabilir.' })
  externalLocation?: string;

  @ApiProperty({ example: '2026-06-20T19:00:00.000Z', description: 'Başlangıç (ISO, gelecekte)' })
  @IsDateString({}, { message: 'Geçerli bir başlangıç tarihi girin.' })
  startAt: string;

  @ApiPropertyOptional({ example: '2026-06-20T21:00:00.000Z', description: 'Bitiş (ISO, opsiyonel, > startAt)' })
  @IsOptional()
  @IsDateString({}, { message: 'Geçerli bir bitiş tarihi girin.' })
  endAt?: string;

  @ApiPropertyOptional({ enum: ['NONE'], example: 'NONE', description: 'Tekrarlama — MVP yalnız NONE' })
  @IsOptional()
  @IsIn(['NONE'], { message: 'Şu an yalnızca tek seferlik etkinlik oluşturulabilir.' })
  recurrence?: 'NONE';
}
