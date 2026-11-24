import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';

/**
 * Automod kelime listeleri repoda TUTULMAZ (2026-11-24, sahip kararı: repo public): liste açık olursa
 * filtrenin etrafından dolaşmak kolaylaşır. Liste sunucuda, repo dışındaki bir JSON dosyasındadır;
 * yolu `AUTOMOD_WORDS_FILE` verir (prod: `docker-compose.prod.yml` dosyayı salt okunur bağlar).
 * Listeyi değiştirmek: sunucudaki dosyayı düzenle, api'yi yeniden başlat (deploy gerekmez).
 *
 * Dosya biçimi `api/config/automod-words.example.json` ile aynı:
 *   { "words": [...], "safePrefixes": [...] }
 * - `words`: tek kelimeler token başı (prefix) eşleşir, boşluklu ifadeler tam metin içinde aranır.
 * - `safePrefixes`: masum kökler (ör. `ş→s` katlamasıyla bir yasak öneke düşen kelime). Kök hiçbir
 *   yasak kelimenin çekiminin öneki OLMAMALI (normalize sonrası biçimle düşün).
 * Gerçek Türkçe yazımla yazılır; `AutomodService` normalize eder. `ı` ve `i` ayrı harftir: yasak kelime
 * `ı` içeriyorsa `i` yazımı da ayrıca eklenir.
 *
 * 🔴 Prod'da dosya yoksa ya da bozuksa API BAŞLAMAZ: filtre sessizce boş listeyle çalışmasın.
 * Geliştirmede değişken verilmezse liste boştur (uyarı loglanır).
 */
export interface AutomodLists {
  words: string[];
  safePrefixes: string[];
}

export const AUTOMOD_LISTS = Symbol('AUTOMOD_LISTS');

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function loadAutomodLists(env: NodeJS.ProcessEnv = process.env): AutomodLists {
  const path = env.AUTOMOD_WORDS_FILE;
  if (!path) {
    if (env.NODE_ENV === 'production') {
      throw new Error('AUTOMOD_WORDS_FILE tanımlı değil: prod automod listesiz başlatılmaz');
    }
    new Logger('Automod').warn(
      'AUTOMOD_WORDS_FILE yok, automod boş listeyle çalışıyor (yalnız geliştirme)',
    );
    return { words: [], safePrefixes: [] };
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const { words, safePrefixes } = (parsed ?? {}) as Record<string, unknown>;
  if (!isStringArray(words) || !isStringArray(safePrefixes) || words.length === 0) {
    throw new Error(`Automod listesi geçersiz: ${path} (words dolu, safePrefixes dizi olmalı)`);
  }
  return { words, safePrefixes };
}
