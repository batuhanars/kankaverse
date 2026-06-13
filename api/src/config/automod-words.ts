/**
 * Türkçe platform yasak-kelime listesi (block-on-send, kayıtsız).
 *
 * Liste config — ton/kapsam PM/sahip günceller; genişletilebilir, kod-dışı.
 * Normalize edilmiş (küçük harf + TR→ASCII + tekrar daralt) formda tutulur;
 * AutomodService.check() metni aynı normalize adımlarıyla karşılaştırır.
 *
 * Sprint 7B — Option A: yalnız ağır küfür + slur (PM kararı 2026-06-13).
 * V2: per-ortam özel liste, moderasyon kuyruğu (Sprint 4B+).
 *
 * Liste dışı (içerik-politikası, pazarlık yok):
 *  - Etnik/dini kimlik adları (yahudi, ermeni) — hakaret değil, bloklamak ayrımcılık.
 *  - Yanlış-pozitifler (mal=eşya, oğlak=keçi).
 *  - Normalleşmiş kısaltmalar (amk, aq, lan, la) — TR konuşma dilinde doldurucu.
 *  - Hafif hakaretler (aptal, salak, gerzek, dangalak, nobran) — Option A gereği dışarıda.
 *  - Hafif kaba ama severe değil (bok, göt, amina fragment) — dışarıda.
 */
export const AUTOMOD_WORDS: string[] = [
  // ── Ağır cinsel küfür ────────────────────────────────────────────────────────
  'orospu',
  'orospucocugu',
  'aminakoyim',
  'aminakoyayim',
  'sik',
  'sikerim',
  'sikeyim',
  // ── Ağır hakaret / homofobik / ırkçı slur ───────────────────────────────────
  'pic',      // piç → normalize → pic
  'piclik',   // piçlik → normalize → piclik
  'ibne',
  'kahpe',
  'kaltak',
  'serefsiz', // şerefsiz → normalize → serefsiz
  'gavat',
  'pezevenk',
  'pust',     // puşt → normalize → pust
  'surtuk',   // sürtük → normalize → surtuk
  'neger',
  'zenci',
  // ── Kutsal değerlere hakaret ─────────────────────────────────────────────────
  // config — sahip günceller; 4B insan-onaylı ban'a yükseltilecek
  // Normalize form: küçük harf + TR→ASCII + tekrar-daralt
  // Yaygın uncaught varyantlar (sikeyim gibi mevcut kelimelerle zaten yakalananlar eklenmedi)
  'alahini satayim',   // allahını satayım
  'alahina koyayim',   // allahına koyayım
  'alahinin gotune',   // allahının götüne
  'dinini satayim',    // dinini satayım
  'peygamberi satayim', // peygamberi satayım
  'kurani satayim',    // Kur'an'ı satayım
];
