# Sprint M6b — Sesli mesaj

> **Kaynak:** sahip kararı 2026-10-02 (sıra: M6a baloncuk ✅ → **M6b sesli mesaj** → M6c video).
> **Tier:** `api/` (önce) → `mobile/` + `web/` (api bittikten sonra, paralel).
> **Kapsam:** kaydet, gönder, dinle. Mevcut ek (attachment) hattının üstüne kurulur: presign → R2 PUT →
> mesaja iliştir. Yeni uç YOK.
> **Native:** mobilde yeni paket YOK. `expo-audio` (~1.1.1) M5f'ten beri kurulu ve kayıt API'sini taşıyor,
> `RECORD_AUDIO` izni sesli arama için zaten manifestte. Yine de §4.6'ya bak.
> **R7:** DM karar fonksiyonuna (`canDm`) dokunulmuyor. Sesli mesaj, metin mesajıyla AYNI kapılardan
> geçer: kim kime yazabiliyorsa ona ses de gönderebilir.

---

## §0 PM tarafından doğrulananlar

- Ek hattı: `api/src/modules/attachments/attachments.service.ts`. `ALLOWED_CONTENT_TYPES` (`:33`)
  bugün ses türü İÇERMİYOR. Sınır `maxUploadMb` (25 MB). Ekler özel bucket'ta, kısa ömürlü imzalı
  GET ile okunuyor.
- `Attachment` modeli (`schema.prisma:408`) süre alanı taşımıyor.
- **T&S:** `DmPermissionService.canDm` (`api/src/shared/dm-permission/dm-permission.service.ts`).
  Arkadaş olmayan biriyle minör DM'leşemez (kural 5a). Grup DM'e minör eklenemez. Yani yabancı bir
  yetişkinin reşit olmayana sesli mesaj atabileceği bir yol bugün YOK. Sahip kararı (2026-10-02):
  ek bir yaş kapısı konmaz.
- DM push gövdesi (`messages.gateway.ts:749`) yalnız `content`ten üretiliyor. Ek-yalnız mesajda
  gövde BOŞ gidiyor. DM listesi önizlemesi de aynı (`dm.service.ts:856`). Sesli mesaj tanım gereği
  ek-yalnız, bu boşluk onu doğrudan vuruyor.

## §1 API

### §1.1 Şema + migration
`Attachment` modeline: `durationMs Int?` (yalnız ses ekinde dolu). Migration üretilir ve **yerel DB'ye
uygulanır**; DoD'da `prisma migrate status` temiz.

### §1.2 Presign
- `ALLOWED_CONTENT_TYPES`'a: `audio/mp4`, `audio/webm`, `audio/mpeg`. Yorumda "ses: sesli mesaj (M6b)
  + yüklenen ses dosyası" yaz.
- `PresignAttachmentDto`'ya opsiyonel `durationMs` (`@IsOptional @IsInt @Min(1) @Max(300000)`).
  `contentType` `audio/*` DEĞİLSE `durationMs` yok sayılır (kaydedilmez).
- Kayıt üst sınırı **5 dakika** (300000 ms). Aşan → `400 DURATION_TOO_LONG`,
  mesaj "Sesli mesaj en fazla 5 dakika olabilir."
- `AttachmentDto` (mesajla dönen) `durationMs: number | null` taşır. Swagger güncellenir.

### §1.3 Önizleme metni (ek-yalnız mesaj)
Ortak bir yardımcı: içerik boşsa eklerden metin üret. Öncelik: ses → `🎤 Sesli mesaj`,
görsel → `📷 Görsel`, diğer → `📎 Dosya`. İçerik doluysa bugünkü davranış AYNEN. İki yerde kullanılır:
- DM push gövdesi (`sendDmPush`).
- DM listesi önizlemesi (`dm.service.ts:856`). Sorgu ekleri çekmiyorsa yalnız `contentType` seçilecek
  şekilde genişlet.

Sunucuda `tr.json` yok, metinler mevcut push metinleri gibi koda yazılır (`toPushPayload` deseni).

### §1.4 Test
Presign: ses türü kabul, `durationMs` > 300000 red, ses-dışı türde `durationMs` yok sayılıyor.
Önizleme yardımcısı: dört dal (içerik dolu / ses / görsel / dosya).

## §2 Ortak oynatıcı davranışı (mobil + web aynı)

Ses eki mesaj baloncuğunda (mobil) / mesaj satırında (web) **oynatıcı** olarak çizilir. Dosya kutusu
olarak DEĞİL.

- Düzen: [▶/⏸ düğmesi] [ilerleme çubuğu] [süre]. Dalga formu YOK (sonraki tur).
- Süre metni: çalmıyorken toplam süre (`durationMs`, yoksa yüklenince okunan süre), çalarken
  geçen süre. Biçim `0:07`, `1:23`.
- Çubuğa dokunarak/sürükleyerek konum değiştirilir.
- **Aynı anda tek ses çalar.** Yeni bir sesli mesaj başlarsa önceki duraklar (uygulama genelinde
  tek "şu an çalan" durumu).
- Bitince başa sarar, düğme ▶'ye döner.
- Kendi baloncuğumda (mobil) Kor vurgular `accent400` (M6a §4 kuralı).
- `scanStatus` CLEAN değilse mevcut "kullanılamıyor" davranışı aynen (oynatıcı çizilmez).
- Hız seçimi (1x/1.5x/2x) YOK, sonraki tur.

## §3 Ortak kayıt davranışı (mobil + web aynı)

- **Giriş:** mesaj kutusu boşken ve ek seçili değilken, gönder düğmesinin yerinde **mikrofon**
  düğmesi durur (WhatsApp deseni). Metin yazılınca ya da ek seçilince gönder düğmesine döner.
- **Dokun-başlat** (basılı tutma DEĞİL): mikrofona dokununca kayıt başlar. Mesaj kutusu bir kayıt
  şeridine döner: [🗑 iptal] [● kırmızı nokta + geçen süre] [gönder].
  - 🗑 → kayıt atılır, hiçbir şey gönderilmez.
  - Gönder → kayıt durur, yüklenir, mesaj olarak gider (içerik boş, tek ek).
  - 5:00'a ulaşınca kayıt kendiliğinden durur ve **gönderilmez**, şerit "gönder / iptal" bekler.
- 1 saniyeden kısa kayıt gönderilmez (yanlış dokunuş), sessizce atılır.
- İzin reddedildiyse: kullanıcıya neden kayıt yapılamadığını söyleyen bir uyarı (i18n). Mobilde
  sistem ayarlarına yönlendiren bir eylem varsa mevcut desen kullanılır.
- **Sesli aramadayken kayıt KAPALI** (mikrofon arama tarafından kullanılıyor). Mikrofon düğmesi
  devre dışı görünür, dokununca kısa açıklama (i18n). Gizlenmez.
- Yükleme sırasında mesaj, mevcut ek-gönderim akışındaki "gönderiliyor" durumunu kullanır. Yeni bir
  bekleme arayüzü icat edilmez.
- Kayıt sırasında başka sohbete geçilirse kayıt iptal edilir.

## §4 Mobil

1. Kayıt: `expo-audio` `useAudioRecorder` + `RecordingPresets.HIGH_QUALITY` → `.m4a`
   (`audio/mp4`). `durationMs` kayıt durumundan alınır. API'yi hatırdan yazma, SDK 54 sürümlü
   dokümanı oku (`mobile/AGENTS.md`).
2. Yükleme mevcut `utils/attachmentUpload.ts` hattıyla, `durationMs` presign'a eklenerek.
3. Oynatıcı: `expo-audio` `useAudioPlayer`. `AttachmentView` içinde `audio/*` dalı. "Tek ses çalar"
   kuralı için küçük bir modül-seviyesi durum ya da mevcut store deseni. Yeni kütüphane YOK.
4. Ses oturumu: kayıt/oynatma `setAudioModeAsync` ile açılırken **LiveKit'in `AudioSession`'ını
   bozmamalı.** Arama sırasında kayıt zaten kapalı (§3). Arama dışında kayıt bitince mod geri alınır.
   Gelen arama zili (M5f) ile çakışma: sesli mesaj çalarken arama gelirse çalan ses durur.
5. Kanal ekranı, 1-1 DM, grup DM: üçü de `MessageScreen` üzerinden, ayrı iş yok.
6. **Native şüphesi:** `expo-audio` kayıt için ek bir config plugin ayarı istiyorsa (`app.json`
   `expo-audio` girdisi, ör. `microphonePermission` / `recordAudioAndroid`), bu yeni bir native diff'tir.
   O durumda **DUR**, PM'e bildir: yeni dev build + versionCode gerekir, sahip cihazını etkiler.
7. Yeni i18n anahtarları `web/src/i18n/tr.json`'a (mobil kaynak orası). Mobil-özel metinler
   `mobile.*` altına.

## §5 Web

1. Oynatıcı: `web/src/components/shared/AttachmentView.vue` içinde `audio/*` dalı. Tarayıcının
   `<audio controls>` görünümü KULLANILMAZ (temaya uymuyor); gizli `<audio>` elemanı + kendi
   düğme/çubuk/süre (§2). Tek-ses kuralı küçük bir composable ile.
2. Kayıt: `MediaRecorder`. Tür seçimi: `MediaRecorder.isTypeSupported('audio/mp4')` ise o,
   değilse `audio/webm;codecs=opus`. Presign'a giden `contentType` parametresiz kanonik tür
   (`audio/mp4` / `audio/webm`). Süre: kayıt başlangıç/bitiş farkı.
3. Mesaj kutusu bileşeninde §3 davranışı. Klavye: kayıt şeridinde `Esc` iptal, `Enter` gönder.
4. Masaüstü (Electron) mikrofon izni sesli aramada zaten veriliyor. Kayıtta ayrıca izin sorulursa
   `desktop/` değişikliği gerekir → **DUR**, PM'e bildir.

## §6 Kabul (DoD)

**API:** testler yeşil, `migrate status` temiz, Swagger'da `durationMs`.
**Mobil:** `npm run typecheck` + `npm run lint` temiz.
**Web:** `vue-tsc -b` (yalnız bilinen 6 önceden-var hata; `--noEmit` KULLANMA) + lint + build temiz.
`tr.json`da `@` karakteri varsa `{'@'}` ile kaçırıldı.

**Cihaz/tarayıcı turu (sahip + PM):**
1. Telefondan sesli mesaj → telefonda ve web'de çalıyor.
2. Web'den (Chrome) sesli mesaj → web'de ve telefonda çalıyor. (webm Android'de oynuyor mu, burada
   görülür.)
3. İki sesli mesaj üst üste: ikincisi başlayınca ilki duruyor.
4. İptal: hiçbir şey gönderilmiyor. 1 sn altı: gönderilmiyor.
5. DM push'ta ve DM listesinde "🎤 Sesli mesaj" görünüyor.
6. Sesli aramadayken mikrofon düğmesi devre dışı ve açıklama gösteriyor.

## Kapsam dışı (bilinçli)
Dalga formu, hız seçimi, basılı-tut + kaydır-kilitle jesti, kayıt önizleme (göndermeden dinleme),
sesli mesajın metne çevrilmesi, video (M6c).

---

## §7 REVİZYON 1 (2026-10-02, sahip cihaz turu) — WhatsApp tarzı oynatıcı + dalga formu

> İlk tur cihazda görüldü. Sahip isteği: oynatıcı WhatsApp gibi olsun, dalgalı ses görünümü oynadıkça
> griden Kor'a boyansın; mikrofon ve oynat düğmesi Kor yuvarlak. §2'deki "dalga formu YOK" kalktı.

### §7.1 API: `Attachment.waveform`
- `waveform String?` + migration. İçerik: **64 örnek**, her biri 0-255 bayt, **base64** (88 karakter).
  Yalnız `audio/*` ekte kaydedilir, diğerlerinde yok sayılır (`durationMs` ile aynı kural).
- Presign DTO: opsiyonel `waveform` (`@IsOptional @IsString @MaxLength(128)`), serviste base64 çözülüp
  tam 64 bayt değilse `400 INVALID_WAVEFORM`.
- `AttachmentDto`: `waveform: string | null`. Mesaj sorgularındaki tüm attachment `select`lerine eklenir
  (M6b'de `durationMs` için yapılan 7 yerin aynısı).

### §7.2 Örnekleme (istemci)
- Kayıt boyunca ~100 ms'de bir ses seviyesi örneği alınır (mobil: `expo-audio` kayıt seçeneğinde
  `isMeteringEnabled: true`, durumdaki `metering` dB değeri; web: `AnalyserNode` RMS).
- dB → 0-255: `-60 dB ve altı = 0`, `0 dB = 255`, arası doğrusal. Web RMS de aynı dB ölçeğine çevrilip
  aynı formülden geçer (iki istemcinin dalgası benzer görünsün).
- Bitince örnekler **64 kovaya** indirilir (her kovanın tepe değeri), base64 yapılıp presign'a gider.
- Ortak yardımcı (iki istemcide ayrı ayrı, aynı formül): `encodeWaveform(samples: number[]) → string`,
  `decodeWaveform(b64) → number[64]`.
- **Fallback:** `waveform` null ise (M6b-1'de gönderilmiş mesajlar, ya da çözülemeyen veri) ek `id`'sinden
  türetilen sabit, alçak genlikli bir desen çizilir. Rastgele DEĞİL, her açılışta aynı.

### §7.3 Oynatıcı tasarımı (mobil + web aynı)
- `[● Kor yuvarlak oynat düğmesi] [dalga formu] ` ve dalganın altında solda süre.
- Oynat düğmesi: 36px daire, zemin `accent500`, içinde beyaz (`textPrimary`) ▶/⏸ ikonu.
- Dalga: 64 dikey çubuk, genişlik ~2.5px, aralık ~1.5px, uçları yuvarlak, yükseklik örnekle orantılı
  (en az 3px, en çok 28px). Çalınmamış kısım `textMuted`, çalınmış kısım Kor
  (kendi baloncuğumda `accent400`, karşıda `accent500`). Boyama çalma ilerledikçe çubuk çubuk ilerler.
- Dalgaya dokun/sürükle = konum değiştir (§2'deki çubuğun yerini alır, ayrı ilerleme çubuğu KALKAR).
- Süre metni kuralı §2 ile aynı.

### §7.4 Mikrofon ve gönder düğmesi
- Mikrofon ve gönder **aynı yuvada, aynı görünümde**: 40px Kor daire (`accent500`), içinde beyaz ikon
  (WhatsApp'ın yeşil dairesi gibi). Metin yazılınca ikon mikrofondan gönder okuna döner, daire kalır.
- Aramadayken mikrofon dairesi soluk (opaklık ~0.4), dokununca açıklama (§3, değişmedi).
- Kayıt şeridinde, kayıt sürerken **canlı dalga** (son örnekler sağa doğru akar), mevcut sayaçla birlikte.
  Şeritteki gönder düğmesi de aynı Kor daire.
- Web: mesaj kutusunda bugün gönder düğmesi yok (Enter gönderiyor), bu değişmez. Mikrofon Kor daire
  olur, kayıt şeridindeki gönder de Kor daire.

### §7.5 E-posta doğrulama uyarısı (hata düzeltmesi)
- Ek yükleme `VerifiedEmailGuard` arkasında (önceden beri, kural KALIR). Doğrulanmamış hesapta presign
  `403 EMAIL_NOT_VERIFIED` dönüyor ve istemciler genel `errors.EMAIL_NOT_VERIFIED` metnini
  ("Ortam oluşturmak için…") gösteriyor. Yanlış bağlam, görsel yüklemede de aynı.
- Düzeltme: ek/sesli mesaj gönderim hatasında `EMAIL_NOT_VERIFIED` için ayrı metin:
  `"Dosya ve sesli mesaj göndermek için e-postanı doğrulamalısın."` (web `tr.json`'da yeni anahtar,
  mobil de onu kullanır). Ortam oluşturmadaki metin değişmez.
- Mobilde başarısız sesli mesaj taslağı ek şeridine "dosya" çipi olarak düşüyor. Bunun yerine: hata
  mesajı gösterilir, taslak atılır (sesli mesaj yeniden kaydedilir; dosya çipi kafa karıştırıyor).

### §7.6 DoD ekleri
- Mobil ve web'den gönderilen sesli mesajın dalgası iki istemcide de görünür ve benzer.
- M6b-1'de gönderilmiş (waveform'suz) mesaj fallback desenle çizilir, çökmez.
- `INVALID_WAVEFORM` testi.

---

## §8 REVİZYON 2 (2026-10-02, sahip cihaz turu 2) — oynatma kuralları + gönderim yalnız mobilde

> Dalga formlu oynatıcı cihazda onaylandı. Üç kusur + bir kapsam kararı.

### §8.1 Kapsam kararı: sesli mesaj GÖNDERMEK yalnız mobilde
Sahip kararı (Discord ile aynı): web ve masaüstünde kayıt/gönderim KALKAR, **dinleme kalır**.
- Web: `VoiceMicButton`, `VoiceRecordStrip`, `composables/useVoiceRecorder.ts` ve mesaj kutularındaki
  (`MessageArea.vue`, `DmConversation.vue`) bağlantıları kaldırılır. Kullanılmayan i18n anahtarları
  (`voiceMessage.record/cancel/send/recording/sending/limitReached/inCall/permissionDenied/unsupported/
  recordFailed/uploadFailed`) silinir. `voiceMessage.label/play/pause/seek` ve
  `voiceMessage.errors.EMAIL_NOT_VERIFIED` KALIR (oynatıcı ve ek yükleme kullanıyor).
- `web/src/utils/waveform.ts`: yalnız oynatıcının kullandığı (`decodeWaveform`, `fallbackWaveform`)
  kalır, `encodeWaveform`/`dbToByte` silinir.
- API'de `audio/webm` allowlist'te KALIR (geriye dönük: tur 1'de web'den gönderilmiş mesajlar var).

### §8.2 Bitince DUR (kusur)
Android'de oynatıcı bitişte "çal" durumunda kalıyor, `seekTo(0)` sesi yeniden başlatıyor. Bitişte önce
`pause()`, sonra `seekTo(0)`. Web'de de bitişte başa sarıldığında çalmadığı teyit edilir.

### §8.3 Aynı anda tek ses (kusur)
Mobilde iki sesli mesaj aynı anda çalabiliyor: önceki oynatıcıyı emirle durdurma (`claimPlayback` →
`stopCurrent()`) güvenilir değil. Yeni model:
- Tek bir merkezi durum: `currentId` (şu an çalan ek id'si). Mobilde mevcut store deseniyle (küçük bir
  zustand store ya da modül-seviyesi abone olunabilir durum; `stores/voice` döngüsüne kenar EKLEME).
- Bir oynatıcı çalmaya başlarken `currentId = kendi id`. Her oynatıcı `currentId`'yi izler; çalarken
  `currentId !== kendi id` olursa **kendini** duraklatır (efekt tabanlı, emir değil).
- Web'de `useExclusivePlayback` aynı modele çekilir (zaten çalışıyorsa yalnız teyit).

### §8.4 Sıradakine otomatik geçiş (yeni)
WhatsApp davranışı: bir sesli mesaj **sonuna kadar** çalıp bitince, aynı sohbette ondan sonraki (daha
yeni) ilk sesli mesaj otomatik çalmaya başlar. Arada metin mesajları olabilir, atlanır. Sonraki yoksa
durur. Kullanıcı elle duraklatırsa ya da konum değiştirip duraklatırsa geçiş olmaz.
- Sıra: ekran, mesaj listesinden kronolojik sıralı ses eki id'lerini (yalnız CLEAN `audio/*`) merkezi
  duruma kaydeder (`setQueue(channelId, ids)`). Biten oynatıcı `playNext(kendi id)` çağırır →
  `currentId = sıradaki`, `autoplay = true`. Sıradaki oynatıcı bunu görünce kaynağını yükleyip çalar.
- Sıradaki oynatıcı ekranda (FlatList'te) mount edilmemişse geçiş sessizce olmaz, hata verilmez.
- Mobil ve web aynı davranış.

### §8.5 DoD
- Tek sesli mesaj: bitince durur, ▶'ye döner, tekrar başlamaz.
- Üç ardışık sesli mesaj: ilki bitince ikinci, o bitince üçüncü çalar, üçüncüden sonra durur.
- Biri çalarken diğerine basınca ilki anında durur.
- Web'de mikrofon yok; telefondan gelen sesli mesaj web'de oynatıcıyla çalıyor.
