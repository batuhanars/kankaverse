# SPRINT C14b: Yapay zeka video ekranı (model/süre/çözünürlük, canlı maliyet, Kaydet / Kaydet ve gönder, rozet)

> Durum: **TASARIM KİLİTLİ (2026-10-28).** PM compose (Opus). C14'ün (`SPRINT_C14_AI_VIDEO_CONTRACT.md`) devamı; C14'te
> yazılmayan her şey aynen geçerli (kapı, yoklayıcı, harcama kaydı, tavan, §8 kullanıcıya açma kapıları).
> Kaynak: sahibin mobil ekran taslağı (2026-10-28) + ilk canlı deneme (5 dk 53 sn, 0,20 $, "Sohbete ekle" CORS'a takıldı).
> Sıra: **api → web.** Mobil YOK (mobil sprintinde aynı düzen, bu sözleşme referans).
> **R7 kapsamı:** yükleme hattını atlayan yeni ek oluşturma yolu (§2.4) + rozetin sunucu kaynaklı olması.

---

## §0 Kararlar (sahip 2026-10-28)

1. **Model seçici, kısa liste:** Pika 2.5 · Wan 3.0 · Kling 3.0 Turbo. Liste sunucu tablosunda, açık olanlar env'de.
2. **Süre ve çözünürlük seçimi** modele göre (§1 tablosu). Çözünürlük yalnız **480p / 720p** (1080p maliyeti ekranda yok).
3. **"Fiyatı gör" kalkar.** Seçim değiştikçe **Pika'nın gerçek teklifi** gösterilir (ücretsiz uç nokta, gecikmeli çağrı).
   Fiyatı istemci hesaplamaz: Pika kademeleri modele göre karışık (ör. Pika 1080p 5 sn ile 10 sn'nin saniye fiyatı farklı).
4. **Birim dolar, kredi YOK.** "Tahmini maliyet (5 sn) · 0,20 $". Kredi/TL ödeme altyapısıyla gelir; satır yerinde kalır,
   yalnız birim değişir.
5. **İstem çipleri:** tıklanınca isteme eklenir (sonuna, virgülle). Metinler i18n.
6. **Sonuç düğmeleri:** mesaj kutusundan açılınca **"Kaydet"** + **"Kaydet ve gönder"**; görsel seçim penceresinden
   açılınca **"Kaydet"** + **"Kullan"**. Kaydet = cihaza indir (web: indirme bağlantısı; mobilde ileride "Galeriye kaydet").
7. **"Yapay zeka" rozeti:** bu yoldan gönderilen video ekinde, **sunucu kaynaklı** (§2.4). İstemci bayrak gönderemez.
8. Bekleme dakikalar sürüyor: ekranda "Birkaç dakika sürebilir. Pencereyi kapatabilirsin, sonuç Son üretimler'de kalır."
   Bildirim YOK (kullanıcıya açma kapısı, C14 §8'e eklenir).

**OUT:** mobil · 1080p · oran (aspect ratio) seçimi · ses aç/kapa · kredi/TL · bildirim · aynı videonun ikinci kez
düzenlenmesi.

---

## §1 Model tablosu (sunucu, `ai-video.models.ts`, tek kaynak)

| key | etiket | api tabanı | süreler (sn) | çözünürlük | süre alanı | görsel alanı | sabit ek alanlar |
|---|---|---|---|---|---|---|---|
| `pika-2.5` | Pika 2.5 | `pika/pika-2.5` | 5, 10 | 480p, 720p | `duration_s` | `image` | yok |
| `wan-3.0` | Wan 3.0 | `alibaba/wan3.0-video` | 5, 10 | 480p, 720p | `duration` | `first_frame_url` | `watermark: false` |
| `kling-3.0-turbo` | Kling 3.0 Turbo | `kling/kling-3.0-turbo` | 5, 10, 15 | 720p | `duration` | `image_url` | yok |

- Varsayılan: ilk açık model, 5 sn, listedeki ilk çözünürlük.
- Wan `duration` şemada aralıksız (`anyOf`): dev `https://dev.pika.art/llms/alibaba/wan3.0-video/text-to-video` belgesinden
  geçerli değerleri doğrular, 10 desteklenmiyorsa listeden çıkarır ve raporlar (§7).
- api_id = `${taban}/${text-to-video|image-to-video}`. Gövde: `{ prompt?, resolution, [süre alanı]: n, [görsel alanı]?: url, ...sabit }`.
- Env: `AI_VIDEO_MODELS` (virgüllü key listesi, varsayılan `pika-2.5`). C14'teki `AI_VIDEO_MODEL` ve
  `AI_VIDEO_RESOLUTION` **kaldırılır** (sunucu `.env.production`'da yoklar, sahibe not).
- Bilinmeyen key / tabloda olmayan süre/çözünürlük → `400 AI_VIDEO_INVALID_OPTION`.

---

## §2 Backend

### §2.1 Şema (additive, migration uygulanır)
- `Attachment.aiGenerationId String?` + ilişki `AiVideoGeneration` + `@@index([aiGenerationId])` (**unique DEĞİL**:
  aynı video birden çok sohbete gönderilebilir).

### §2.2 Uç noktalar (C14 kapısı aynen: Jwt + VerifiedEmail + AiVideoAccessGuard)
1. `GET /ai-video/options` → `{ models: [{ key, label, durations, resolutions, supportsImage: true }], dailyCapUsd,
   todaySpentUsd }`.
2. `POST /ai-video/estimate` `{ model, resolution, durationS, withImage: boolean }` → `{ quoteUsd }`.
   **Satır oluşturmaz.** Sunucu önbelleği (anahtar: model+çözünürlük+süre+withImage, 10 dk). İstem fiyata etki etmez,
   gönderilmez. `@Throttle` 60/dk.
3. `POST /ai-video` `{ model, resolution, durationS, prompt, inputKey? }` → satır DTO'su. **Teklif + tavan + gönderim tek
   çağrıda** (C14'teki quote → submit iki adımı birleşir; QUOTED durumu artık yalnız iç geçiş). Teklif yeniden alınır
   (önbellekten değil), tavan bununla denetlenir. Hata kodları C14 ile aynı + `AI_VIDEO_INVALID_OPTION`.
4. **Kaldırılır:** `POST /ai-video/quote`, `POST /ai-video/:id/submit` (tek istemci web, aynı deploy'da değişiyor).
   `AI_VIDEO_QUOTE_EXPIRED` kodu artık üretilmez.
5. `GET /ai-video`, `GET /ai-video/:id` aynen; DTO'ya `model` (key), `resolution`, `durationS` ve COMPLETED'da
   **`downloadUrl`** (presign, `downloadFilename: kankaverse-yz-<id>.mp4`, C15 `presignGet` seçeneği, 15 dk) eklenir.
6. `POST /ai-video/:id/attachment` → `{ attachmentId }` (§2.4).

### §2.3 Gönderim gövdesi
`AiVideoService` gövdeyi §1 tablosundan kurar (alan adları tablodan, kod içinde model adına göre `if` yok). Teklif için
görsel yer tutucu C14 davranışı aynen (`withImage` ise görsel alanına yer tutucu adres).

### §2.4 Üretimden ek (R7)
- Koşullar: satır kullanıcının (`findOwned`) ve `COMPLETED` + `outputKey` dolu; değilse `404` / `409 AI_VIDEO_NOT_READY`.
- Sunucu `outputKey` objesini mesaj eklerinin anahtar desenine (**`buildStorageKey`**, mevcut ek hattı) **kopyalar**
  (S3 CopyObject; `StorageService.copy` yoksa eklenir) ve `Attachment` oluşturur: `uploaderId = user.id`,
  `messageId = null`, `filename = kankaverse-yz.mp4`, `contentType = video/mp4`, `size`, `aiGenerationId`,
  `scanStatus` = **yükleme hattıyla aynı kural** (`scanEnabled ? PENDING : CLEAN`). Video eki için `thumbnail/width/height`
  yükleme hattı nasıl dolduruyorsa aynı yardımcı; dolduramıyorsa boş bırak ve raporla.
- **Mesaj göndermez.** İstemci dönen `attachmentId` ile **mevcut mesaj gönderme** uç noktasını çağırır. Kanal yetkisi,
  DM `canDm`, blok, hız sınırı, sabitleme/takedown hepsi değişmeden o yoldan geçer. Bu uç nokta izin denetimi YAPMAZ,
  yalnız sahibine ait bekleyen bir ek üretir (yükleme presign'ı ile aynı güven düzeyi).
- Mesaj/ek DTO'su: `aiGenerated: boolean` = `aiGenerationId !== null`. Sunucu türetir. Mevcut ek DTO yardımcısında tek yer.
- Takedown: ek normal ek; `CONTENT_REMOVE` yolu değişmez. Üretim satırı silinmez.

### §2.5 Test
Tablo: gövde alan adları üç model için doğru · geçersiz seçenek 400 · estimate satır oluşturmuyor + önbellek ·
`POST /ai-video` tek çağrıda tavan + gönderim · ek: başkasının üretimi 404, COMPLETED değil 409, scanStatus kuralı,
`aiGenerated` true; normal yüklemede false.

---

## §3 Web

### §3.1 `AiVideoDialog` yeniden düzen (taslak referans; web'de modal, aynı sıra)
1. Başlık "Yapay zeka ile video üret" + kapat.
2. Satır: **model açılır listesi** · **çözünürlük** iki parçalı seçici · **süre** parçalı seçici (modele göre seçenekler;
   model değişince geçersiz seçim modelin varsayılanına döner).
3. İstem alanı + altında **çipler** (en az 5: Sinematik, Gün batımı, Gülümseme, Ağır çekim, Neon gece; i18n).
4. Görsel ekle (C14 aynen).
5. Alt şerit: "Tahmini maliyet (5 sn)" + **teklif tutarı** · "Bugün 0,40 $ / 3 $" küçük satır · **"Oluştur"** düğmesi.
   Teklif seçim değişince 400 ms gecikmeli `estimate`; yüklenirken eski tutar soluk; tavanı aşacaksa düğme kapalı + neden.
6. Üretim sürerken: ilerleme + §0-8 bilgi metni.
7. Sonuç: önizleme + bağlama göre iki düğme (§0-6). **Kaydet** = `downloadUrl`'ye `<a download>` (fetch YOK).
   **Kaydet ve gönder** = indirme tetikle + `POST /:id/attachment` + mevcut mesaj gönderme (açık sohbete, boş metin)
   + diyaloğu kapat. Hata olursa diyalog açık kalır, metin gösterilir.
   **Kullan** = C14 davranışı (dosyaya çevir → kesit akışı; R2 CORS GET gerektirir, §4).
8. "Son üretimler" aynen; tamamlanan satırda aynı iki düğme.

### §3.2 Rozet
Video ekini çizen bileşende (kanal + DM ortak bileşen; bul) `aiGenerated` ise sol üstte küçük **"Yapay zeka"** etiketi
(✨ ya da mevcut simge setinden yıldız). Tasarım token'ları. Mobil rozet mobil sprintinde (eski mobil sürüm rozetsiz
gösterir; bilinçli, PLAN borcu).

### §3.3 DoD
`vue-tsc -b` (bilinen 6) · lint · build · 390/320 px'te diyalog taşmıyor (ölçülür, tahmin değil) · `aiVideoAllowed=false`
hesapta giriş yok.

## §4 Deploy notu
- `.env.production`: `AI_VIDEO_MODELS=pika-2.5,wan-3.0,kling-3.0-turbo` eklenir (sahip). Eski iki anahtar yoksa sorun yok.
- R2 özel bucket CORS'a `GET` (yalnız "Kullan" yolu için; sohbet ve kaydet yolları gerektirmez).

## §4b Revize 1 (sahip turu 2026-10-28) — web, api yok

Bulgu: böcek videosu bitince sonuç düğmeleri ile "Son üretimler"deki kedi satırının düğmeleri aynı ekrandaydı; sahip
kedi satırınınkine bastı, kedi gönderildi (DB: ek `aiGenerationId` = kedi). Sunucu doğru; düzen belirsizdi.
1. **Çipler kalkar** (§0-5 iptal): istem zaten belirtir. `AiVideoChips.vue` + i18n anahtarları silinir.
2. **Ayrı önizleme penceresi** `AiVideoPreviewModal.vue`: video + istem metni (2 satır, kesilir) + model/süre küçük satırı +
   bağlama göre düğmeler (§0-6). Üretim COMPLETED olunca üretim penceresi bu pencereye **geçer** (ikisi aynı anda açık
   değil). Önizlemeden "Yeni üretim" → forma dön.
3. **Üretim penceresi** yalnız form + ilerleme + hata. Sonuç düğmeleri burada YOK.
4. **"Son üretimler" satırlarında düğme YOK.** Tamamlanan satıra tıklama → o satırın önizleme penceresi; süren satır →
   ilerleme görünümü (yoklama); başarısız satır hata metniyle, tıklanmaz.
5. Ekranda aynı anda yalnız bir videonun düğmeleri bulunur (değişmez kural).

## §5 DoD
- [ ] api §1-2 + migration uygulandı + testler + build
- [ ] R7: §2.4 ek oluşturma + `aiGenerated` türetimi sahibe sunuldu
- [ ] web §3 + DoD §3.3
- [ ] Sahip turu: üç modelde teklif değişiyor · Kaydet indiriyor · Kaydet ve gönder → DM'de rozetli video, karşı hesap
  rozeti görüyor · Kullan → profil fotoğrafı

## §6 Bilinçli borçlar (PLAN)
- Mobil rozet yok (eski sürüm rozetsiz gösterir) → mobil yapay zeka sprinti.
- Teklif önbelleği tek instance bellek içi.

## §7 Sapma kuralı
Pika alan adları/değerleri belgeden farklıysa gerçek şekle uy ve raporla (tablo §1 güncellenir). Bizim uç nokta imzaları,
DTO alanları, hata kodları sapamaz.
