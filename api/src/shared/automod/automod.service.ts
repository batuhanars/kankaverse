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
 *  1. Küçük harf (TR locale: İ→i, Ş→ş, I→ı, vb.)
 *  2. TR özgün karakterleri ASCII'ye indir — AMA `ı`'yı ASLA `i` YAPMA.
 *     `ı` ve `i` Türkçede AYRI harf: `sık`(sık/sıkıntı) ≠ `sik`(küfür),
 *     `şık`(giyim) ≠ `şik`. `ı→i` katlaması `sıkıntı`/`sık sık`/`şık` gibi
 *     günlük kelimeleri yanlışlıkla bloklardı (false-pozitif felaketi).
 *  3. Apostrof/tırnak temizle (Kur'an → kuran).
 *  4. Tekrarlı harfleri teke indir (sikkk→sik, ooooo→o).
 *
 * Eşleşme (sözleşme §2 "kelime-sınırı"):
 *  - Tek kelimeler → **token başı (prefix)** eşleşmesi. Türkçe sondan-eklemeli
 *    olduğundan ek'li biçimler yakalanır (`orospusun`, `şerefsizsin`); ama
 *    kelime ORTASINDAKİ rastlantı yakalanmaz (`klasik`/`kapıcı`/`bisiklet` GEÇER).
 *  - Çok kelimeli ifadeler (kutsal-değer küfürleri) → tam metin substring
 *    (yeterince özgül; false-pozitif riski yok).
 *  Zincir kırma (s+ı+k boşluklu kaçış) → V2 ML konusu, bilinçle kapsam dışı.
 */
@Injectable()
export class AutomodService {
  private readonly bannedWords: string[]; // tek kelime — prefix eşleşmesi
  private readonly bannedPhrases: string[]; // çok kelime — substring eşleşmesi

  constructor() {
    const normalized = AUTOMOD_WORDS.map((w) => this.normalize(w));
    this.bannedWords = normalized.filter((w) => w.length > 0 && !w.includes(' '));
    this.bannedPhrases = normalized.filter((w) => w.includes(' '));
  }

  check(content: string): AutomodResult {
    const normalized = this.normalize(content);

    // Çok kelimeli ifade (kutsal-değer küfürü vb.) → tam metin substring
    if (this.bannedPhrases.some((phrase) => normalized.includes(phrase))) {
      return { blocked: true };
    }

    // Tek kelime → token başı (prefix). `ı` normalize'de korunduğu için token
    // sınıfına dahil; gerisi a-z0-9.
    const tokens = normalized.split(/[^a-z0-9ı]+/).filter(Boolean);
    const blocked = tokens.some((token) =>
      this.bannedWords.some((word) => token.startsWith(word)),
    );
    return { blocked };
  }

  private normalize(text: string): string {
    // 1. Küçük harf — TR locale: İ→i, I→ı (Türkçe büyük/küçük kuralı)
    let result = text.toLocaleLowerCase('tr-TR');

    // 2. TR özgün → ASCII — `ı` HARİÇ (ı≠i, ayrı harf; bkz. sınıf yorumu)
    result = result
      .replace(/ş/g, 's')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ö/g, 'o')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/û/g, 'u');

    // 3. Apostrof/tırnak temizle (Kur'an → kuran, kaçış girişimini de daraltır)
    result = result.replace(/['’`´]/g, '');

    // 4. Tekrarlı harfleri teke indir (siikkk → sik, çok boşluk → tek boşluk)
    result = result.replace(/(.)\1+/g, '$1');

    return result;
  }
}
