/**
 * Türkçe platform yasak-kelime listesi (block-on-send, kayıtsız).
 *
 * Liste config — ton/kapsam PM/sahip günceller; genişletilebilir, kod-dışı.
 * AutomodService normalize edip saklar; sen GERÇEK Türkçe yazımla yaz
 * (ş/ç/ğ/ü/ö/â serbest), servis ASCII'ye indirir.
 *
 * ⚠️ `ı` ve `i` AYRI HARF, servis KATLAMAZ. Sonuçları:
 *  - `sik`(küfür, i) ≠ `sık`/`sıkıntı`/`sık sık`/`şık`(masum, ı) → ayrışır, masum geçer. ✓
 *  - AMA profanite `ı` içeriyorsa (`amına`, `satayım`), tembel `i` yazan
 *    kullanıcıyı kaçırmamak için BURADA hem `ı` hem `i` biçimini yaz.
 *    (İkisi de küfür → masum kelimeyle çakışma yok, güvenli.)
 *
 * Eşleşme: tek kelimeler **token başı (prefix)** → `sik` tek başına `sikmek`
 * çekimlerini (sikiyorum/siktir/sikeyim) ve ek'li biçimi (orospusun) yakalar;
 * kelime ORTASI yakalanmaz (`klasik`/`kapıcı`/`bisiklet` GEÇER).
 * Çok kelimeli ifadeler tam substring.
 *
 * Sprint 7B — Option A: yalnız ağır küfür + slur (PM kararı 2026-06-13).
 * Geniş/vetlenmiş liste genişletmesi → sistem mimarı DB'si (sonraki tur, aynı ı/i disiplini).
 * V2: per-ortam özel liste, moderasyon kuyruğu (Sprint 4B+).
 *
 * Liste dışı (içerik-politikası, pazarlık yok):
 *  - Etnik/dini kimlik adları (yahudi, ermeni) — hakaret değil, bloklamak ayrımcılık.
 *  - Masum GEÇER: mal=eşya, sık/sıkıntı/sık sık (ı≠i), şık (giyim),
 *    klasik/kapıcı/bisiklet (kelime-ortası, prefix yakalamaz).
 *  - Normalleşmiş kısaltmalar (amk, aq, lan, la) — TR konuşma dilinde doldurucu.
 *  - Hafif hakaretler (aptal, salak, gerzek, dangalak, nobran) — Option A gereği dışarıda.
 *  - Hafif kaba ama severe değil (bok, göt) — dışarıda.
 *  - Bilinen ARTIK (nadir, kabul): `sik` prefix'i `siklet`/`siklon`/`sikke`/`siklamen`
 *    gibi seyrek kelimeleri yakalar — düşük frekans, `sıkıntı` kurtarmaya değer.
 */
export const AUTOMOD_WORDS: string[] = [
  // ── Ağır cinsel küfür ────────────────────────────────────────────────────────
  'orospu',
  'orospuçocuğu',
  'amınakoyim', 'aminakoyim', // ı ve i yazımı — ikisi de küfür, çakışma yok
  'amınakoyayım', 'aminakoyayim',
  'sik', // prefix → sikiyorum/siktir/sikeyim hepsi; `sık`/`şık` ı farkıyla ayrışır
  'yarak', // yarrak→daralt; `yaralı`/`yaramaz`/`yaratık` güvenli (4. harf ayrışır)
  'amcık', 'amcik', // ı ve i yazımı; `amca`/`amaç`/`amcam` güvenli
  // ── Ağır hakaret / homofobik / ırkçı slur ───────────────────────────────────
  'piç',
  'piçlik',
  'ibne',
  'ipne', // ibne varyantı; `ipek`/`iplik` güvenli
  'kahpe',
  'kaltak',
  'şerefsiz',
  'gavat',
  'godoş', // pezevenk-slur; çakışma yok
  'pezevenk',
  'puşt',
  'sürtük',
  'götveren', 'göt veren', // homofobik; tek-kelime + boşluklu yazım (göt tek başına hariç)
  'götlek',
  'neger',
  'zenci',
  // ── Kutsal değerlere hakaret (çok kelimeli — tam substring; ı + i yazımı) ─────
  // config — sahip günceller; 4B insan-onaylı ban'a yükseltilecek
  'allahını satayım', 'allahini satayim',
  'allahına koyayım', 'allahina koyayim',
  'allahının götüne', 'allahinin gotune',
  'dinini satayım', 'dinini satayim',
  'peygamberi satayım', 'peygamberi satayim',
  'kuranı satayım', 'kurani satayim',
];
