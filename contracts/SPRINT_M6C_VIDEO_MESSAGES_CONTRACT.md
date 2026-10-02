# Sprint M6c — Video gönderme

> **Kaynak:** sahip kararı 2026-10-02 (sıra: M6a baloncuk ✅ → M6b sesli mesaj ✅ → **M6c video**).
> **Tier:** `api/` (önce) → `mobile/` + `web/` (paralel).
> **Kapsam:** galeriden video seç, telefonda sıkıştır, gönder; sohbette küçük resimle göster, dokununca
> oynat. Mevcut ek hattının üstüne (presign → R2 PUT → mesaja iliştir). Yeni uç YOK.
> **Native:** mobilde YENİ paketler (`expo-video`, `react-native-compressor`). Yeni dev build ŞART,
> mağaza sürümü bu sprintin sonunda (M6a/M6b mobil değişiklikleriyle birlikte).
> **Yaş:** video yükleme herkese açık (sahip kararı, PLAN.md D72). Kapı eklenmez.
> **Kapsam dışı:** uygulama içi kamerayla video çekme (yalnız galeriden), sunucuda dönüştürme
> (Cloudflare Stream yok), video düzenleme/kırpma, otomatik oynatma.

---

## §1 API

### §1.1 Şema + migration
`Attachment`'a: `thumbnail String?` (base64 JPEG), `width Int?`, `height Int?`. Yalnız `video/*` ekte
kaydedilir (`durationMs` mevcut alan, video için de kullanılır).

### §1.2 Presign
- Allowlist'e `video/mp4`, `video/webm`. `video/quicktime` EKLENMEZ (Chrome HEVC .mov oynatamıyor;
  mobil sıkıştırıcı zaten mp4 üretiyor).
- DTO'ya opsiyonel: `thumbnail` (`@IsString @MaxLength(40000)`), `width`, `height` (`@IsInt @Min(1)
  @Max(8192)`). Ses-dışı/video-dışı türde `durationMs`/`waveform` kuralı aynen; video-dışı türde
  `thumbnail/width/height` yok sayılır.
- Video `durationMs` üst sınırı **60000 ms**; aşan → `400 VIDEO_TOO_LONG`
  ("Video en fazla 60 saniye olabilir."). Boyut sınırı mevcut 25 MB.
- `thumbnail` base64 çözülemiyorsa ya da JPEG imzası (`FF D8`) yoksa → `400 INVALID_THUMBNAIL`.
- `AttachmentDto`: `thumbnail`, `width`, `height` (`| null`). 7 attachment `select`ine eklenir.

### §1.3 Önizleme
`previewFromAttachments`: video → `🎥 Video` (öncelik: ses, video, görsel, dosya).

### §1.4 Test
Video kabul, 60001 ms red, geçersiz thumbnail red, video-dışı türde alanların yok sayılması,
önizleme dalı.

## §2 Ortak gösterim (mobil + web)

- Sohbette video **küçük resim kartı** olarak çizilir: `thumbnail` arka plan, ortada yarı saydam
  daire içinde ▶, sağ altta süre (`0:42`). En-boy oranı `width/height`'tan; yoksa 16:9. Genişlik
  görsel ekle aynı (mobil 220, `maxWidth: '100%'`).
- `thumbnail` null ise koyu zemin (`bgElevated`) + ▶ + süre.
- Dokun/tıkla → oynat (§3.4 / §4.3). Otomatik oynatma YOK.
- `scanStatus` CLEAN değilse mevcut "işleniyor / kaldırıldı" davranışı.
- Video oynamaya başlayınca çalan sesli mesaj durur (M6b §8.3 merkezi durumu: `currentId = null`).

## §3 Mobil

### §3.1 Paketler
`npx expo install expo-video react-native-compressor`. `react-native-compressor`ın RN 0.81 + yeni
mimari + Expo SDK 54 ile uyumlu sürümünü doğrula (changelog/issue). Uyumsuzsa **DUR**, PM'e bildir
(alternatif değerlendirilecek). Gereken config plugin'ler `app.json`a.

### §3.2 Seçme
- `AttachmentSheet`: ızgara (`useMediaLibrary` `mediaType: ['photo','video']`) ve sistem seçicisi
  (`mediaTypes: ['images','videos']`) videoyu da gösterir. Izgarada video karesinde sağ altta süre.
- 60 sn'den uzun video seçilirse: seçilmez, kısa uyarı (i18n). Kırpma YOK.
- Bir mesajda en fazla **1 video** (görsellerle karışık olabilir; ikinci video seçimi uyarıyla reddedilir).

### §3.3 Hazırlama + gönderme
- `Video.compress(uri, { compressionMethod: 'auto' })` → mp4. İlerleme ek şeridindeki taslak kutusunda
  yüzde olarak görünür ("Video hazırlanıyor %42", i18n). Gönder düğmesi hazırlama bitene dek bekler.
- Sıkıştırma sonrası 25 MB'ı aşıyorsa gönderilmez, uyarı (i18n).
- Küçük resim: `createVideoThumbnail` → en uzun kenar 320px JPEG'e küçült, base64 (≤ ~30 KB).
  `width/height` ve `durationMs` videonun meta verisinden.
- Yükleme mevcut `attachmentUpload` hattıyla, yeni alanlar presign'a eklenerek.
- Taslak iptal edilirse sıkıştırma iptal edilir (paket destekliyorsa) ve geçici dosya silinir.

### §3.4 Oynatma
Karta dokununca tam ekran oynatıcı (mevcut `ImageViewer` deseni: modal, kapat düğmesi):
`expo-video` `useVideoPlayer` + `VideoView` (yerel kontroller açık). Adres `attachmentsApi.getUrl`
ile alınır. Kapatınca oynatıcı durur ve serbest kalır. Ekran döndürme kilidi mevcut davranışa göre.

### §3.5 Native doğrulama (ZORUNLU, mobile/CLAUDE.md "yeni native paket")
EAS'a göndermeden önce yerelde: `npx expo prebuild --platform android` + `cd android && ./gradlew
assembleDebug`. Başarısızsa gerçek hata satırıyla PM'e raporla. APK'yı telefona PM kurar.

## §4 Web

### §4.1 Yükleme
Mevcut ek seçicisi (`ATTACHMENT_ACCEPT`) `video/mp4,video/webm` kabul eder. Seçilen videodan
tarayıcıda: `<video>` ile süre + boyutlar, `canvas` ile ilk anlamlı kareden (≈0.5 sn) 320px JPEG
base64 küçük resim. 60 sn / 25 MB aşımı → uyarı, gönderilmez. Sıkıştırma YOK (web).

### §4.2 Gösterim
`AttachmentView.vue` `video/*` dalı: §2 kartı.

### §4.3 Oynatma
Karta tıklayınca kartın yerinde `<video controls autoplay>` (tarayıcının kendi kontrolleri bu sefer
kabul: tam ekran/ses/hız hazır geliyor). Aynı anda tek video (yeni bir video başlayınca önceki durur;
`useExclusivePlayback` ile birleşik, sesli mesajla da karşılıklı).

## §5 Kabul (DoD)

**API:** testler yeşil, Swagger'da yeni alanlar, migration dosyası.
**Mobil:** typecheck + lint temiz, yerel `assembleDebug` başarılı.
**Web:** `vue-tsc -b` (yalnız bilinen 6 hata), eslint (kendi dosyaları), `npx vite build`.

**Cihaz turu (sahip + PM):**
1. Telefondan 20-30 sn'lik video → hazırlama yüzdesi görünüyor, gönderiliyor, boyut makul.
2. Telefonda ve web/masaüstünde küçük resim + süre görünüyor, dokununca oynuyor.
3. 60 sn'den uzun video seçilemiyor, uyarı çıkıyor.
4. Web'den mp4 yükleme → telefonda oynuyor.
5. Sesli mesaj çalarken video açılınca ses duruyor.
6. DM bildiriminde ve listede "🎥 Video".
