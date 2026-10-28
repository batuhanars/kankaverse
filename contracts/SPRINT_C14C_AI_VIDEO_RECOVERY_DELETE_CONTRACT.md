# SPRINT C14c: Yapay zeka video, dayanıklı indirme + kurtarma, silme, ses bilgisi

> Durum: **TASARIM KİLİTLİ (2026-10-28).** PM compose (Opus). C14 + C14b'nin devamı; yazılmayan her şey aynen.
> Sıra: **api → web.** Mobil YOK. **R7-nötr** (kapı, ek yolu, rozet değişmez; silme yalnız kullanıcının kendi
> üretim geçmişine dokunur).

---

## §0 Neden

1. **Kusur (para):** `cmvryrzz5000n01k6uxvuo2vh` Pika'da `completed` + `settled 200000`; bizde `FAILED
   AI_VIDEO_PROVIDER_ERROR`, `costMicroUsd` boş. Sebep: Pika CDN o objeyi ~28 KB/s veriyor (sunucudan ve yerel
   makineden ölçüldü; başka objeler 10 MB/s). Bizim indirme toplam 120 sn zaman aşımı × 3 deneme doldu.
   Sonuç: ödenmiş video kayboldu, tavan eksik saydı.
2. **Sahip isteği:** önceki üretimleri tek tek sil + hepsini temizle.
3. **Sahip karışıklığı:** Pika 2.5 sessiz, Wan sesli (varsayılan), Kling her zaman sesli; arayüz söylemiyor.

## §1 Dayanıklı indirme (api)

- **Maliyet indirmeden bağımsız:** Pika `completed` + `billing.settled` görüldüğü anda `costMicroUsd` yazılır
  (indirme başarısız olsa da). `pending` mevcut davranış.
- **Toplam zaman aşımı yerine boşta kalma (idle) zaman aşımı:** akışta 30 sn hiç bayt gelmezse kes; toplam üst sınır
  15 dk. Boyut tavanı aynen.
- **İndirme başarısızsa satır `FAILED` olmaz.** Satır `RUNNING` kalır, `errorCode = 'AI_VIDEO_DOWNLOAD_PENDING'`
  (yalnız iç işaret, istemciye "Kaydediliyor" gösterilir). Yoklayıcı sonraki turlarda indirmeyi yeniden dener, artan
  aralıkla (1, 2, 5, 10 dk ...). **Pika `completed` gördükten sonra 24 saat** başarısızsa `FAILED
  AI_VIDEO_DOWNLOAD_FAILED` (maliyet kayıtlı kalır).
- C14'teki 15 dk iş zaman aşımı yalnız Pika `queued/running` iken işler; indirme aşamasında işlemez.
- Şema değişikliği gerekiyorsa minimum: `AiVideoGeneration.providerCompletedAt DateTime?` (24 sa sayacı, yeniden
  başlatmada bellek içi `firstSeen` sorununu da çözer). Migration uygulanır.

### §1.1 Kurtarma (tek seferlik, kodla)
Açılışta bir kez: `status = FAILED` + `errorCode = AI_VIDEO_PROVIDER_ERROR` + `providerJobId` dolu + `outputKey` boş
satırlar için Pika işine bakılır; `completed` ise satır `RUNNING` + `DOWNLOAD_PENDING` yapılır (maliyet yazılır) ve
normal indirme döngüsüne girer. Yalnız son 7 günün satırları. Log satırı yazılır. Bu yolla `cmvryrzz5…` geri gelir.

## §2 Silme (api)

- Şema: `AiVideoGeneration.deletedAt DateTime?`.
- `DELETE /ai-video/:id` → `204`. Sahiplik (`findOwned`, 404). `QUEUED`/`RUNNING` (indirme bekleyen dahil) →
  `409 AI_VIDEO_BUSY`. İşlem: `outputKey` ve `inputKey` objeleri silinir (hata loglanır, işlemi düşürmez), `outputKey`
  null, `deletedAt = now`. Pika tarafında iş silme uç noktası varsa (`https://dev.pika.art/openapi.json`'da ara;
  job JSON'unda `deleted_at` alanı var) çağrılır, hata loglanır.
- `DELETE /ai-video` → `{ deleted: n }`: kullanıcının QUEUED/RUNNING olmayan, silinmemiş tüm satırları, aynı işlem.
- **Satır silinmez** (harcama kaydı, tavan hesabı, audit). `GET /ai-video` listesi `deletedAt IS NULL` süzer;
  `GET /ai-video/:id` silinmişte 404. `todaySpent` silinmişleri SAYMAYA DEVAM eder.
- Sohbete gönderilmiş ekler (ayrı kopya, `Attachment.aiGenerationId`) etkilenmez; FK `SET NULL` zaten var ama satır
  silinmediği için rozet sürer.
- Testler: busy 409, başkasının 404, obje silme hatası işlemi düşürmüyor, toplu silme yalnız uygun satırlar, tavan
  silinmişi sayıyor, liste süzüyor.

## §3 Ses bilgisi (api)
Model tablosuna `audio: 'none' | 'default' | 'always'` (Pika `none`, Wan `default`, Kling `always`).
`GET /ai-video/options` modelde `audio` döner. Wan için gövde değişmez (varsayılan açık).

## §3b Süre seçenekleri (sahip 2026-10-28, api)
Sahip "30 sn'ye kadar" istedi; sınır modelde (Pika teklifiyle doğrulandı):
- `wan-3.0` süreler `[5, 10, 15, 20, 30]` (Wan 2-30 sn; 30 sn 480p 0,975 $, 720p 1,95 $).
- `kling-3.0-turbo` `[5, 10, 15]` değişmez (Pika >15'i reddediyor). `pika-2.5` `[5, 10]` değişmez (model sınırı).
- Kling 4.0 EKLENMEZ (30 sn 720p 4,71 $ > günlük tavan).
- §1 indirme mutlak üst sınırı 15 dk → **30 dk** (30 sn video 10-15 MB; yavaş CDN ~28 KB/s ≈ 9 dk). Idle 30 sn aynen.
Web değişmez (seçenekler options'tan gelir).

## §3c Tek model: Wan 3.0 (sahip 2026-10-28)
Sahip Pika 2.5 ve Kling'i beğenmedi; ileride liste genişleyebilir.
- api: `AI_VIDEO_MODELS` boşken varsayılan `wan-3.0` (`configuration.ts`, `.env.example`). Model tablosu değişmez.
- web: options'ta tek model varsa model açılır listesi gösterilmez; yerine tek satır "Wan 3.0 · sesli" bilgi metni.
  Çözünürlük + süre seçicileri aynen. Birden çok model olunca bugünkü liste döner.
- Sunucu `.env.production`: `AI_VIDEO_MODELS=wan-3.0` (sahip).

## §4 Web
1. **Seçici:** model listesinde ses bilgisi ("Pika 2.5 · sessiz", "Wan 3.0 · sesli", "Kling 3.0 Turbo · sesli"), i18n.
2. **Son üretimler:** satır sağında küçük çöp kutusu simgesi (satır tıklamasından ayrı, `@click.stop`), QUEUED/RUNNING'de
   gizli. Liste başlığının yanında **"Temizle"** (metin düğmesi). Temizle onay ister: uygulamanın mevcut onay
   penceresi bileşeni (`window.confirm` YOK). Metin: "Son üretimlerin hepsi silinsin mi? Sohbete gönderdiklerin
   kalır." Tek silmede onay yok. Silinen satır listeden düşer; önizlemedeyse önizleme kapanır, forma dönülür.
3. **Önizleme penceresi:** "Sil" (tehlike rengi, ikincil), onaysız; silince forma dön.
4. **İndirme bekleyen durum:** `errorCode === 'AI_VIDEO_DOWNLOAD_PENDING'` iken ilerleme metni "Kaydediliyor..."
   (yoklama sürer). Hata metni: `AI_VIDEO_DOWNLOAD_FAILED`, `AI_VIDEO_BUSY`.
5. DoD: `vue-tsc -b` (bilinen 6) · lint · build.

## §5 DoD
- [ ] api §1-3 + migration uygulandı + testler + build
- [ ] Canlıda kurtarma: `cmvryrzz5…` COMPLETED oldu, video açılıyor, maliyet 0,20 $ yazılı
- [ ] web §4
- [ ] Sahip turu: tek sil, Temizle (onaylı), sohbete gönderilmiş video yerinde, model ses etiketleri

## §6 Sapma kuralı
Pika silme uç noktası yoksa yalnız bizim tarafımız silinir ve raporlanır (PLAN borcu: Pika'da kalan kopya, KVKK notu).
Bizim imzalar/kodlar sapamaz.
