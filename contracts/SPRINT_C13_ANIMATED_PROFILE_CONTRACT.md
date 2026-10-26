# SPRINT C13: Hareketli avatar ve profil afişi (GIF yükleme + videodan GIF)

> Durum: **TASARIM KİLİTLİ (2026-10-26).** PM compose (Opus). Precedent: C8 (`SPRINT_C8_AVATAR_BANNER_CONTRACT.md`) +
> M6c video yükleme. Sıra: **api → web → mobil** (mobil native değişiklik taşır, ayrı derleme).
> **R7 kapsamı:** `MEDIA_REMOVE` takedown'ı yeni alanlara genişliyor + güvenilmeyen dosyayı sunucuda işleyen yeni yol.
> Dev diff'i sahibe onaya sunar.

---

## §0 Kapsam ve kararlar

**IN:** Kullanıcı **avatarı** ve **profil afişi** için hareketli görsel. İki kaynak:
1. Kullanıcının elindeki **GIF dosyası** (indirdiği bir GIF dahil).
2. Galeriden seçilen **video**, kullanıcının seçtiği en fazla **6 saniyelik** kesit.

Her iki kaynak da sunucuda aynı hattan geçer ve **hareketli WebP**'ye çevrilir (+ ilk kareden statik WebP).

**Kilitli kararlar:**
- **Ücretsiz, herkese açık (sahip 2026-10-26).** PM önerisi "oluşturma yalnız 18+" idi; sahip "herkes" seçti (D72 video kararıyla aynı gerekçe). PLAN.md D74 olarak kayıtlı. Minör-görünür yüzey olduğu için takedown yolu (§4) bu sprintin es geçilemez parçası.
- **Çıktı biçimi GIF değil, hareketli WebP.** Kullanıcıya "GIF" deriz, depolanan dosya WebP'dir. Gerekçe: aynı klip GIF olarak 5 ile 10 kat büyük; 256px avatar her üye listesinde iner. WebP tüm tarayıcılarda, Electron'da ve (§6 ayarıyla) Android'de oynar.
- **Dönüşüm sunucuda (ffmpeg).** İstemcide dönüşüm reddedildi: web'de ffmpeg.wasm ~30 MB ve yavaş, mobilde güncel bakımlı ffmpeg paketi yok. Sunucuda tek hat = üç istemci aynı sonucu alır, metadata (EXIF/konum) da sıyrılır.
- **Senkron işleme, kuyruk yok.** 6 sn / 256px dönüşüm saniyeler sürer. İş kuyruğu C14 (yapay zeka videosu, gerçekten uzun süren iş) gelince kurulur; şimdi kurmak erken soyutlama.
- **Geriye uyumluluk:** `avatarUrl` / `bannerUrl` **statik kalır** (ilk kare). Hareketli adres yeni alanda. Mağazadaki eski mobil sürümler hiçbir şey kırılmadan statik görseli göstermeye devam eder.
- **Kırpma UI yok (D25 sürer):** sunucu merkezden kırpar.
- **Bayrak:** `ANIMATED_PROFILE_ENABLED` (varsayılan `false`). Kapatma anahtarı + ileride abonelik kapısının takılacağı tek nokta (§2.4).

**OUT:** ortam afişi/ikonu hareketli · sohbet GIF seçici (Tenor vb.) · abonelik/ödeme · yapay zeka video (C14, §8) · statik görsel yolunun sunucuda yeniden boyutlanması (D28 sürer) · hash-blocklist (D24 sürer, §4 not) · kırpma (D25).

---

## §1 Veri modeli (Prisma, additive)

- `User.avatarAnimatedUrl String?`
- `User.bannerAnimatedUrl String?`

Migration üretilir **ve DB'ye uygulanır** (`prisma migrate status` temiz, DoD).

**Değişmez kural:** `avatarAnimatedUrl` doluysa `avatarUrl` aynı işlemin statik karesidir. Statik yükleme (`PATCH /users/me/avatar`) veya kaldırma, hareketli alanı **null**'lar. Banner için aynısı.

---

## §2 Backend

### §2.1 Yapılandırma
- `ANIMATED_PROFILE_ENABLED` (bool, varsayılan false) → `configuration.ts`.
- `FFMPEG_PATH` / `FFPROBE_PATH` (varsayılan `ffmpeg` / `ffprobe`).
- `api/Dockerfile` runtime aşaması: `apk add --no-cache ffmpeg`. Doğrulama: konteynerde `ffmpeg -encoders | grep libwebp_anim` dolu.
- Sabitler tek yerde (`shared/media/animated.constants.ts`): maks kesit 6000 ms, min 500 ms; fps 15; avatar 256×256; afiş 720×288 (web profil afişi 360×144 gösterimin 2x'i, 5:2); girdi tavanı GIF 15 MB, video `maxUploadMb`; çıktı tavanı avatar 2 MB, afiş 4 MB.

### §2.2 Endpoint'ler (`UsersController`, `JwtAuthGuard` + `VerifiedEmailGuard`)

Envelope standart. Adımlar: **presign → istemci PUT → işle.**

1. `POST /users/me/animated/presign`
   - Gövde: `{ target: 'AVATAR' | 'BANNER', contentType, size }`
   - `contentType` allowlist: `image/gif`, `video/mp4`, `video/webm`, `video/quicktime` (mov burada kabul: çıktı WebP olduğu için M6c'deki oynatma sorunu yok).
   - Yanıt: `{ uploadUrl, stagingKey }`. `stagingKey = animated-staging/${userId}/${uuid}.${ext}`, **özel (private) bucket'a**. Public'e asla doğrudan yüklenmez.
2. `POST /users/me/avatar/animated` ve `POST /users/me/banner/animated`
   - Gövde: `{ stagingKey, startMs?: number, durationMs?: number }` (video için; GIF'te yok sayılır, ilk 6 sn alınır).
   - Yanıt: güncel kullanıcı DTO'su (`PATCH /users/me/avatar` ile aynı şekil, yeni alanlar dahil).

Hata kodları (Türkçe `message`, `tr` dosyasında istemci eşleniği):
| Kod | Durum | Ne zaman |
|---|---|---|
| `UPLOADS_DISABLED` | 403 | mevcut |
| `ANIMATED_DISABLED` | 403 | bayrak kapalı (presign **ve** işle, savunma-derinliği) |
| `UNSUPPORTED_TYPE` | 400 | allowlist dışı |
| `FILE_TOO_LARGE` | 400 | `size` veya HEAD boyutu tavanı aşıyor |
| `INVALID_STORAGE_KEY` | 400 | prefix `animated-staging/${userId}/` değil |
| `INVALID_MEDIA` | 422 | ffprobe video akışı bulamadı / bozuk dosya |
| `INVALID_RANGE` | 400 | `startMs` süre dışında, `durationMs` 500 ile 6000 arası değil |
| `MEDIA_TOO_LARGE_AFTER_PROCESS` | 422 | düşük kaliteyle ikinci deneme de çıktı tavanını aşıyor |
| `PROCESSING_BUSY` | 503 | eşzamanlı iş sınırı dolu |

### §2.3 İşleme hattı (`shared/media/animated-media.service.ts`)

Sırayla:
1. Bayrak + `uploadsEnabled` + prefix kontrolü.
2. HEAD ile gerçek boyut kontrolü, sonra geçici dizine indir (`os.tmpdir()` altında iş başına dizin).
3. `ffprobe`: video akışı var mı, süre, boyut. `startMs/durationMs` doğrulaması burada.
4. `ffmpeg` (aşağıdaki güvenlik kuralları zorunlu): kesit → fps 15 → merkezden kırp + ölçekle → `libwebp_anim`, `-loop 0`, ses yok. Ayrıca ilk kareden statik WebP.
5. Çıktı tavanı aşılırsa bir kez düşük kaliteyle tekrar; yine aşarsa `MEDIA_TOO_LARGE_AFTER_PROCESS`.
6. İki dosya public bucket'a: `avatars/${userId}/${uuid}.webp` + `avatars/${userId}/${uuid}-static.webp` (afiş için `banners/`).
7. DB: `avatarUrl = static`, `avatarAnimatedUrl = animated`.
8. **Kullanıcının kendi değiştirmesinde** önceki hareketli + statik nesneleri sil (yalnız bu hattın ürettiği, `${prefix}/${userId}/` altındaki anahtarlar; D27'nin bu hat için kapanışı). Takedown'da silme YOK (§4).
9. `finally`: staging nesnesi ve geçici dizin her durumda silinir.

**ffmpeg güvenlik kuralları (R7, güvenilmeyen dosya):**
- `child_process.spawn` + argüman dizisi. **Shell yok**, kullanıcı girdisi argümana yalnız doğrulanmış sayı olarak girer.
- Girdi biçimi contentType'tan **zorla** verilir (`-f gif` / `-f mov,mp4,m4a,3gp,3g2,mj2` / `-f matroska,webm`); `-protocol_whitelist file`, `-nostdin`, `-threads 2`.
- İş başına zaman aşımı 30 sn → süreç öldürülür, `INVALID_MEDIA`.
- Eşzamanlılık: süreç içi sayaç, en fazla 2 ffmpeg. Fazlası beklemez, `PROCESSING_BUSY`.
- Kullanıcı başı hız sınırı: mevcut throttler ile işleme endpoint'ine saatte 10.

### §2.4 Gelecekteki abonelik kapısı
Tek fonksiyon: `canCreateAnimated(user): boolean`, bugün yalnız `ANIMATED_PROFILE_ENABLED` döner. Abonelik sprinti yalnız bu fonksiyonu değiştirir. **Şimdi entitlement modeli, plan tablosu vb. yazılmaz.**

### §2.5 DTO yayılımı (bilinçli dar)
`avatarAnimatedUrl` / `bannerAnimatedUrl` yalnız şu DTO'lara eklenir: `auth me` / kendi profil DTO'su, `GET /users/:id/card` (kullanıcı kartı ve tam profil). Mesaj, üye listesi, ses, bildirim DTO'larına **eklenmez**; oralarda statik `avatarUrl` gösterilir. Gerekçe: bant genişliği + onlarca select'e dokunmamak. Hover'da canlanan liste avatarı (Discord) ileride ayrı küçük iş.

---

## §3 Mevcut statik yol
`PATCH /users/me/avatar` ve `/banner` (C8): set veya null, hareketli alanı da null'lar (§1 kuralı). Başka değişiklik yok.

---

## §4 Takedown: `MEDIA_REMOVE` (R7 çekirdeği)

`moderation.service.ts` `case 'MEDIA_REMOVE'`:
- `USER_AVATAR` → `avatarUrl` **ve** `avatarAnimatedUrl` null.
- `USER_BANNER` → `bannerUrl` **ve** `bannerAnimatedUrl` null.
- `GUILD_*` değişmez. Nesne silinmez (C8 kuralı değişmez: kanıt/hukuk A2). Mesaj `CONTENT_REMOVE` yoluna dokunulmaz.

Test: iki hedef için her iki alanın null'landığı birim test.

**Not (D24):** Kaldırılan hareketli görselin yeniden yüklenmesi bu sprintte engellenmiyor. Bu hat dosyayı sunucuda gördüğü için hash engeli artık buraya takılabilir; D24 kaydına "giriş noktası `animated-media.service` adım 3" notu düşülür, kod yazılmaz.

---

## §5 Web (`web/`, masaüstü aynı kod)

1. **API client:** `usersApi.animatedPresign`, `setAnimatedAvatar`, `setAnimatedBanner`. PUT mevcut `attachmentsApi.uploadToS3` (progress).
2. **Ayarlar > Profil (`UserSettingsView.vue`):** mevcut avatar/afiş seçicisinin `accept`'i bayrak açıkken `image/gif,video/mp4,video/webm,video/quicktime` ekler. Ayrı buton/sekme yok; dosya türüne göre akış ayrılır:
   - Statik görsel → C8 akışı (değişmez).
   - GIF → önizleme → presign/PUT → işle.
   - Video → **kesit seçici**: `<video>` önizleme + başlangıç kaydırıcısı + süre (en fazla 6 sn, varsayılan 3 sn), seçili aralık döngüde oynar → presign/PUT → işle.
   - İşleme sırasında "Hazırlanıyor" durumu; hatalar `response.data.message`.
   - Bayrak durumu: istemciye ayrı uç açılmaz; `ANIMATED_DISABLED` 403 gelirse alan statik moda düşer (C8'deki `UPLOADS_DISABLED` deseni).
3. **Gösterim:** `UserCardPopover.vue`, `FullProfileModal.vue`, ayarlardaki önizleme: hareketli adres varsa onu, yoksa statiği gösterir. `prefers-reduced-motion: reduce` → her zaman statik. Paylaşılan küçük bir yardımcı (`animatedOrStatic(user, kind)`) bu üç yerde kullanılır.
4. **i18n:** tüm metinler `tr` dosyasında (`profile.animated.*`), hata kodları dahil. `@` kaçışına dikkat (bilinen tuzak).
5. Responsive: kesit seçici 390px ve 320px genişlikte ölçülür.

---

## §6 Mobil (`mobile/`, ayrı adım, api canlıya çıktıktan sonra)

1. **Hareketli WebP gösterimi native ayar ister.** Expo'nun `gradle.properties` `expo.webp.animated` değeri `true` yapılır, mevcut desende küçük bir config plugin ile (`mobile/plugins/`). Çalışmazsa DUR, PM'e dön (alternatif `expo-image`, yeni paket = PM kararı).
2. **Seçme:** `ProfileMediaFields.tsx`; `expo-image-picker` görsel + video. GIF'in seçicide JPEG'e çevrilmediği cihazda doğrulanır (kalite/düzenleme parametresi verilmez).
3. **Kesit:** `expo-video` önizleme + kaydırıcı (web ile aynı kurallar). Büyük video M6c'deki `react-native-compressor` ile sıkıştırılır, sonra yüklenir.
4. **Gösterim:** profil başlığı (`ProfileHeader.tsx`) ve kullanıcı kartı. Listeler statik. Sistem "animasyonları azalt" açıksa statik.
5. **Native değişiklik:** EAS'tan önce yerel `expo prebuild` + `gradlew assembleDebug`. versionCode elle artırılır. Release paketi canlıya karşı cihazda denenir. Cihaz turu sahipte.

---

## §7 DoD

- [ ] Şema: iki alan; migration üretildi ve uygulandı (`migrate status` temiz)
- [ ] Docker imajında ffmpeg + `libwebp_anim` doğrulandı
- [ ] presign + iki işleme endpoint'i; tüm hata kodları; staging her durumda siliniyor
- [ ] ffmpeg güvenlik kuralları (shell yok, zorunlu biçim, protokol whitelist, zaman aşımı, eşzamanlılık, hız sınırı)
- [ ] Statik yol hareketli alanı null'luyor; kendi değiştirmede eski nesneler siliniyor
- [ ] **R7:** `MEDIA_REMOVE` iki alanı birden null'luyor, nesne silmiyor, `CONTENT_REMOVE` değişmedi
- [ ] `canCreateAnimated` tek kapı; entitlement kodu yok
- [ ] Birim testler: tür/boyut/aralık reddi, bayrak kapalı reddi, prefix reddi, busy, takedown iki alan, statik set null'lama, ffmpeg argüman inşası (shell'siz, sayılar doğrulanmış)
- [ ] Web: GIF + video kesit akışı, gösterim üç yerde, reduced-motion, i18n, 390/320px ölçüldü
- [ ] `nest build` + testler + `vue-tsc -b` (bilinen 6 hata dışında yeni yok) + `vite build` temiz
- [ ] **R7 insan incelemesi:** takedown + işleme hattı diff'i sahibe sunuldu
- [ ] Sahip canlı test: GIF avatar, videodan afiş, kaldır, statiğe dön, bayrak kapalı → statik mod
- [ ] Mobil (§6): yerel derleme, cihaz turu, mağaza sürümü

---

## §8 Sonraki: C14 yapay zeka video (bu sprintte YOK)

Bilgi için, kod yazılmaz:
- Yalnız **platform admin** hesabında açık (mevcut `PlatformAdminGuard`), herkese kapalı. Sahip önce kendi hesabında dener.
- Üretilen video bu sprintin hattına **kaynak** olarak girer ("yapay zeka ile üret → avatar yap" ek iş değil).
- Önkoşul ödev (PM): sağlayıcının güncel API fiyatı ve **son kullanıcıya yeniden satış şartları**; aracı (fal.ai/Replicate) ile doğrudan API karşılaştırması; KVKK yurt dışı aktarım notu.
- Asenkron iş kuyruğu C14'ün parçası.

---

## §9 Sapma kuralı

Şunlar → **DUR, PM'e dön:** istemcide dönüşüm · GIF olarak depolama · kuyruk/worker altyapısı · hareketli alanları mesaj/üye/ses DTO'larına yayma · ortam afişi/ikonu · entitlement/abonelik kodu · `CONTENT_REMOVE` değişikliği · takedown'da nesne silme · mobilde yeni native paket.
