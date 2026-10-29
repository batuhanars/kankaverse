import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { DmPolicy } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BANNER_PRESET_KEYS } from '../../../common/banner-presets';
import { DEFAULT_QUICK_REACTIONS, IsQuickReactions } from '../../../common/quick-reactions';

/**
 * PATCH /users/me body. Yalnız verilen alanlar güncellenir (undefined → değişmez).
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 512, description: 'Profil metni (≤512). Boş bırakılabilir.' })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(512, { message: 'Bio en fazla 512 karakter olabilir.' })
  bio?: string;

  @ApiPropertyOptional({ enum: DmPolicy, description: 'DM gizlilik tercihi.' })
  @IsOptional()
  @IsEnum(DmPolicy, { message: 'Geçersiz DM tercihi.' })
  dmPolicy?: DmPolicy;

  // Profil afiş rengi (preset anahtar; allowlist). null → varsayılan (marka Kor). Görsel afiş ileride.
  @ApiPropertyOptional({
    example: 'blue',
    enum: BANNER_PRESET_KEYS,
    nullable: true,
    description: 'Profil afiş rengi preset anahtarı (veya null).',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(BANNER_PRESET_KEYS, { message: 'Geçersiz afiş rengi.' })
  bannerColor?: string | null;

  // C12 §2 — okundu bilgisi paylaşımı. KARŞILIKLI: false yapan kendi okumasını paylaşmaz VE
  // karşı tarafınkini göremez (karar `dm.service.ts` `visibleReadAt`, R7). Tek yönlü kullanım yok.
  @ApiPropertyOptional({
    description: 'Okundu bilgisi paylaşımı (karşılıklı: kapatan karşı tarafınkini de göremez).',
  })
  @IsOptional()
  @IsBoolean({ message: 'Okundu bilgisi tercihi geçersiz.' })
  readReceipts?: boolean;

  // C31b §2: "Oynadığım oyunu göster". Verilmezse değişmez; sunucu varsayılanı yaşa göre hesaplar
  // (me cevabındaki `gameActivityEffective`), istemci yeniden hesaplamaz.
  @ApiPropertyOptional({ description: 'Oynadığım oyunu göster (kapalıysa oyun yayılmaz).' })
  @IsOptional()
  @IsBoolean({ message: 'Oyun paylaşım tercihi geçersiz.' })
  showGameActivity?: boolean;

  // C24: hızlı tepki şeridi. Boş dizi = varsayılana dön; aksi halde tam 5 farklı tek-emoji.
  @ApiPropertyOptional({
    type: [String],
    example: DEFAULT_QUICK_REACTIONS,
    description: 'Hızlı tepkiler: boş dizi (varsayılana dön) veya tam 5 farklı emoji.',
  })
  @IsOptional()
  @IsQuickReactions()
  quickReactions?: string[];
}
