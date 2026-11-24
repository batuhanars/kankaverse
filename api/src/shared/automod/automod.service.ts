import { Inject, Injectable, Optional } from '@nestjs/common';
import { AUTOMOD_LISTS, loadAutomodLists, type AutomodLists } from './automod-lists';

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
  private readonly safePrefixes: string[]; // masum kök — tek kelime eşleşmesini atlatır

  // Liste repoda değil, sunucudaki dosyadan gelir (bkz. `automod-lists.ts`). Testler kendi kurgusal
  // listesini verir; uygulamada sağlayıcı yoksa dosyadan okunur.
  constructor(@Optional() @Inject(AUTOMOD_LISTS) lists?: AutomodLists) {
    const { words, safePrefixes } = lists ?? loadAutomodLists();
    const normalized = words.map((w) => this.normalize(w));
    this.bannedWords = normalized.filter((w) => w.length > 0 && !w.includes(' '));
    this.bannedPhrases = normalized.filter((w) => w.includes(' '));
    this.safePrefixes = safePrefixes.map((w) => this.normalize(w));
  }

  check(content: string): AutomodResult {
    const normalized = this.normalize(content);

    // Çok kelimeli ifade (kutsal-değer küfürü vb.) → tam metin substring
    if (this.bannedPhrases.some((phrase) => normalized.includes(phrase))) {
      return { blocked: true };
    }

    // Tek kelime → token başı (prefix). `ı` normalize'de korunduğu için token
    // sınıfına dahil; gerisi a-z0-9.
    // Masum kök istisnası (`şikayet` → `sikayet`): kök SİLİNİR, kalan kısım yine denetlenir.
    // Tümden serbest bırakmak kaçış yolu olurdu (kökün ardına küfür yapıştırmak).
    const tokens = normalized
      .split(/[^a-z0-9ı]+/)
      .filter(Boolean)
      .map((t) => this.stripSafePrefix(t));
    const blocked = tokens.some((token) => this.bannedWords.some((word) => token.startsWith(word)));
    return { blocked };
  }

  private stripSafePrefix(token: string): string {
    const safe = this.safePrefixes.find((s) => token.startsWith(s));
    return safe ? token.slice(safe.length) : token;
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
