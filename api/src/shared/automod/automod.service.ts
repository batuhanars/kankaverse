import { Injectable } from '@nestjs/common';
import { AUTOMOD_WORDS } from '../../config/automod-words';

export interface AutomodResult {
  blocked: boolean;
}

/**
 * Türkçe yasak-kelime filtresi (block-on-send, kayıtsız).
 *
 * Kapsam: yalnız guild kanalı mesajları (messages.service.create çağırır).
 * DM hariç — özel alan, mahremiyet; DM automod ayrı/sonraki karar.
 *
 * Normalize adımları (basit, over-engineering yok):
 *  1. Küçük harf (TR karakter farkındalıklı: İ→i, Ş→ş, vb.)
 *  2. TR özgün karakterleri ASCII karşılığına indir (ş→s, ç→c, ğ→g, ü→u, ö→o, ı→i, â→a)
 *     → yazan "sik" de "şik" de "sîk" de yakalanır
 *  3. Tekrarlı harfleri teke indir (sikkk→sik, ooooo→o)
 *
 * Eşleşme: normalize edilmiş içerikte kelime-sınırı veya substring eşleşmesi.
 * Liste kısa tutulur; uzayan zinciri kırma (s+ı+k gibi) V2 ML konusudur.
 */
@Injectable()
export class AutomodService {
  private readonly normalizedWords: string[];

  constructor() {
    this.normalizedWords = AUTOMOD_WORDS.map((w) => this.normalize(w));
  }

  check(content: string): AutomodResult {
    const normalized = this.normalize(content);
    const blocked = this.normalizedWords.some((word) => normalized.includes(word));
    return { blocked };
  }

  private normalize(text: string): string {
    // 1. Küçük harf — TR: İ→i, büyük harfler için locale kullan
    let result = text.toLocaleLowerCase('tr-TR');

    // 2. TR özgün → ASCII (yaygın kaçış girişimleri de yakalanır)
    result = result
      .replace(/ş/g, 's')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ö/g, 'o')
      .replace(/ı/g, 'i')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/û/g, 'u');

    // 3. Tekrarlı harfleri teke indir (siikkk → sik)
    result = result.replace(/(.)\1+/g, '$1');

    return result;
  }
}
