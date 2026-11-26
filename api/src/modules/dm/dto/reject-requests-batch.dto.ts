import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

/** Bir seferde topluca reddedilebilecek istek sayısı üst sınırı. */
export const REJECT_BATCH_MAX = 100;

/**
 * C75 Rev.7 — "Tümünü reddet" gövdesi. Kimlikler istemcinin onay anında EKRANDA gördükleridir:
 * sunucu "hepsini" değil yalnız bunları reddeder, böylece arada gelen ve görülmemiş istek etkilenmez.
 * Engelleme bilinçli olarak YOK (kişiye özel karar, toplu yapılmaz).
 */
export class RejectRequestsBatchDto {
  @ApiProperty({ type: [String], description: 'Reddedilecek istek kanal kimlikleri (1..100).' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(REJECT_BATCH_MAX)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  channelIds!: string[];
}
