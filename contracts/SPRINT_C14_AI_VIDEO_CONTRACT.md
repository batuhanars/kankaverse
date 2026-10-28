# SPRINT C14: Yapay zeka ile video üretimi (yalnız sahip hesabı)

> Durum: **TASARIM KİLİTLİ (2026-10-28).** PM compose (Opus). Sahip kararları 2026-10-28 (§0). Precedent: C13 hareketli
> hat (`SPRINT_C13_ANIMATED_PROFILE_CONTRACT.md`), C22 seçim penceresi, C25 dosya alımı (`useComposerFileIntake`).
> Sıra: **api → web.** Mobil YOK (masaüstü web'i yüklediği için kendiliğinden gelir).
> **R7 kapsamı:** para harcayan yeni uç noktaların erişim kapısı (§2.2) + kullanıcı içeriğinin üçüncü tarafa gönderilmesi.
> Dev diff'i sahibe onaya sunar.

---

## §0 Kapsam ve kararlar

**IN:** Sahip, istemden ya da istem + görselden 5 saniyelik video üretir. Sonucu iki yerde kullanır:
1. **Sohbete gönderir:** normal video eki olarak (mevcut ek hattı, C25 `takeFiles`).
2. **Profil/ortam görseli yapar:** mevcut hareketli kesit akışına (C13/C19) kaynak dosya olarak girer.

**Kilitli kararlar:**
- **Sağlayıcı: Pika geliştirici API'si** (`https://api.dev.pika.art`), önceden yüklenmiş bakiye, mikro-USD. Pika bir
  model kataloğu sunuyor; model **tek env ayarı** (`AI_VIDEO_MODEL`, varsayılan `pika/pika-2.5`). Sağlayıcı soyutlaması
  bu kadar: başka katalog modeline geçmek deploy değil ayar işi. Ayrı bir "provider interface" yazılmaz (tek uygulama).
- **Erişim: yalnız açık liste.** `PlatformAdminGuard` (isModerator) **yetmez**: ileride moderatör eklenince para harcama
  yetkisi kendiliğinden yayılmasın. Ek kapı `AI_VIDEO_USER_IDS` (virgüllü id listesi, varsayılan boş = kimse).
- **Kredi/cüzdan YOK (sahip kararı).** Yalnız **harcama kaydı**: her üretim bir satır (istem, model, teklif, gerçek
  maliyet, durum). Kullanıcı bakiyesi ödeme altyapısıyla (şirketleşme) gelir; şekli o zaman belli olur.
- **Girdi: metinden ve görselden (sahip kararı).** Pikaffects ve video-to-video YOK.
- **Sabit çıktı: 5 sn, 720p.** 5 sn C13'ün 6 sn kesit sınırına sığar. 720p, 5 sn ≈ 0,20 $. Çözünürlük env'de
  (`AI_VIDEO_RESOLUTION`), arayüzde seçim yok.
- **Kuyruk kütüphanesi YOK.** Tek kullanıcı, eşzamanlı birkaç iş. Durumun doğruluk kaynağı DB satırı; API süreci içinde
  bir yoklayıcı (poller) Pika'yı sorar. Deploy/yeniden başlatmada açılışta yarım kalan satırlar yeniden yoklanır
  (§2.4). BullMQ ancak çok-instance ya da kullanıcıya açma (yüksek eşzamanlılık) gelince. Webhook YOK (açık uç nokta +
  imza doğrulama tek kullanıcı için gereksiz yük).
- **Günlük harcama tavanı:** `AI_VIDEO_DAILY_CAP_USD` (varsayılan `3`). Tavan, teklif alınırken ve gönderirken denetlenir.
- **Sonuç bizde saklanır:** Pika'nın çıktı adresinin süresi belgelenmemiş. Tamamlanınca MP4 bizim **özel** bucket'a
  kopyalanır, istemciye kısa süreli presigned GET verilir.

**OUT:** mobil · kullanıcıya açma (§8 kapıları) · kredi/cüzdan/ödeme · Pikaffects/efektler · model seçimi arayüzü ·
10 sn / 1080p · webhook · BullMQ · üretim geçmişi sayfası (diyalogdaki son 10 liste yeter, §3.1).

---

## §1 Veri modeli (Prisma, additive)

```prisma
enum AiVideoStatus { QUOTED  QUEUED  RUNNING  COMPLETED  FAILED }

model AiVideoGeneration {
  id             String        @id @default(cuid())
  userId         String
  user           User          @relation(fields: [userId], references: [id])
  model          String        // ör. "pika/pika-2.5/image-to-video" (tam api_id)
  prompt         String        // <= 1000
  inputKey       String?       // özel bucket: ai-input/{userId}/{uuid}.{ext}; yalnız görselden üretimde
  resolution     String        // "720p"
  durationS      Int           // 5
  quoteMicroUsd  Int           // gönderim öncesi teklif
  costMicroUsd   Int?          // Pika billing.state=settled olunca
  providerJobId  String?       // Pika "media_..." id
  status         AiVideoStatus @default(QUOTED)
  errorCode      String?       // Pika error.code ya da bizim kodumuz
  outputKey      String?       // özel bucket: ai-video/{userId}/{id}.mp4
  createdAt      DateTime      @default(now())
  completedAt    DateTime?

  @@index([userId, createdAt])
  @@index([status])
}
```

Migration üretilir **ve DB'ye uygulanır** (`prisma migrate status` temiz, DoD).

---

## §2 Backend (`modules/ai-video/`)

### §2.1 Yapılandırma (`configuration.ts`)
- `AI_VIDEO_ENABLED` (bool, varsayılan false) · `PIKA_API_KEY` (boşsa özellik kapalı sayılır) ·
  `PIKA_API_URL` (varsayılan `https://api.dev.pika.art`) · `AI_VIDEO_MODEL` (varsayılan `pika/pika-2.5`) ·
  `AI_VIDEO_RESOLUTION` (`720p`) · `AI_VIDEO_DAILY_CAP_USD` (`3`) · `AI_VIDEO_USER_IDS` (boş).
- API anahtarı **yalnız sunucuda**; hiçbir yanıtta, logda ya da hata mesajında görünmez.

### §2.2 Kapı (R7)
`AiVideoAccessGuard` (`JwtAuthGuard` + `VerifiedEmailGuard` sonrası): `AI_VIDEO_ENABLED && PIKA_API_KEY &&
AI_VIDEO_USER_IDS.includes(user.id)`. Değilse **jenerik 403** `FORBIDDEN` (yüzeyin varlığını sızdırma, PlatformAdminGuard
deseni). Ek olarak `user.isMinor` ise her koşulda red (Pika şartı 18+, §8; bugün listede minör yok ama kapı kodda durur).
Oturum DTO'suna `aiVideoAllowed: boolean` (aynı fonksiyon, `animatedAllowed` deseni C22). Sunucu otoritedir.

### §2.3 Uç noktalar (`AiVideoController`, envelope standart)
1. `POST /ai-video/input/presign` `{ contentType, size }` → `{ uploadUrl, inputKey }`.
   Allowlist `image/png|jpeg|webp`, ≤ 10 MB, özel bucket `ai-input/{userId}/{uuid}.{ext}`.
2. `POST /ai-video/quote` `{ prompt, inputKey? }` → `{ generationId, quoteUsd, todaySpentUsd, dailyCapUsd }`.
   - `inputKey` varsa `image-to-video`, yoksa `text-to-video` (model adına function eklenir).
   - `inputKey` sahipliği: `ai-input/{userId}/` ön eki zorunlu (C13 `assertStagingKey` deseni) + obje var.
   - Pika `POST /catalog/apis/{api_id}/quote` (ücretsiz) → `QUOTED` satır.
   - Bugünkü harcama (`costMicroUsd` toplamı, yoksa QUEUED/RUNNING için `quoteMicroUsd`) + teklif > tavan →
     `400 AI_VIDEO_DAILY_CAP`.
   - prompt: kırpılmış, 1 ile 1000 karakter; görselden üretimde boş olabilir.
3. `POST /ai-video/:id/submit` → güncel satır DTO'su.
   - Satır kullanıcının ve `QUOTED` değilse `404`/`409`. Tavan yeniden denetlenir. 30 dk'dan eski teklif `409 AI_VIDEO_QUOTE_EXPIRED`.
   - Görsel varsa: sunucu objeyi okuyup Pika `POST /v1/media/uploads` → PUT → dönen `url`.
   - Pika `POST /v1/media/{api_id}` gövde: `{ prompt, image?, resolution, duration_s: 5 }`, başlık
     `Idempotency-Key: <generationId>`. Yanıttaki `id` → `providerJobId`, durum `QUEUED`.
4. `GET /ai-video` → son 10 satır (kullanıcının), her biri `{ id, status, prompt, hasInput, quoteUsd, costUsd,
   errorCode, createdAt, videoUrl? }`. `videoUrl` yalnız `COMPLETED`, presigned GET 15 dk.
5. `GET /ai-video/:id` → tek satır, aynı şekil (diyalog bunu yoklar).

Hata kodları (Türkçe mesaj `tr` filtresinden değil, exception mesajında; istemci i18n'i koda göre gösterir):
`AI_VIDEO_DAILY_CAP`, `AI_VIDEO_QUOTE_EXPIRED`, `AI_VIDEO_PROVIDER_ERROR`, `AI_VIDEO_CONTENT_REJECTED`
(Pika `content_moderation`), `AI_VIDEO_INSUFFICIENT_BALANCE` (Pika `insufficient_balance`; sahibe "Pika bakiyesi bitti").

### §2.4 Yoklayıcı (`AiVideoPoller`)
- `QUEUED`/`RUNNING` satırları 5 sn arayla `GET /v1/media/jobs/{providerJobId}`. Durum eşlemesi `queued→QUEUED`,
  `running→RUNNING`, `failed→FAILED` (+`errorCode`), `completed→` çıktıyı indir.
- Tamamlanınca: `output.video.url` akışla indirilir (≤ 50 MB, `video/mp4`), `ai-video/{userId}/{id}.mp4` özel bucket'a
  yazılır, `outputKey` + `completedAt`, `COMPLETED`. İndirme başarısızsa 3 deneme, sonra `FAILED AI_VIDEO_PROVIDER_ERROR`.
- Maliyet: `billing.state === 'settled'` ise `costMicroUsd`; `pending` ise sonraki turlarda yeniden okunur.
- Açılışta (`onApplicationBootstrap`) yarım satırlar zaten listeden yoklanır (ayrı kod yok, aynı döngü).
- 15 dakikayı geçen iş → `FAILED AI_VIDEO_TIMEOUT`.
- Döngü `AI_VIDEO_ENABLED` kapalıyken hiç başlamaz. Tek instance varsayımı yorumla yazılır (BullMQ tetikleyicisi §0).

### §2.5 Test
Kapı (bayrak/anahtar/liste/minör dört durum, jenerik 403) · `inputKey` başka kullanıcının öneki → red · tavan aşımı ·
teklif süresi · durum eşlemesi + hata kodu eşlemesi · settled/pending maliyet · zaman aşımı. Pika istemcisi mock;
gerçek ağ testi yok.

---

## §3 Web

### §3.1 `components/shared/AiVideoDialog.vue`
- İstem alanı + isteğe bağlı görsel seç (küçük önizleme, kaldır). "Fiyatı gör" → teklif: "Bu üretim ~0,20 $.
  Bugün 0,40 $ / 3 $ harcandı." → "Üret".
- Üretimde ilerleme durumu ("Sırada", "Üretiliyor", süre sayacı). `GET /ai-video/:id` 4 sn arayla.
- Tamamlanınca video önizleme + tek eylem düğmesi "Kullan" (çağıran yere göre metin: "Sohbete ekle", "Profil
  fotoğrafı yap" vb.). "Kullan" videoyu presigned adresten `File`'a çevirir (`ai-video.mp4`, `video/mp4`) ve
  `emit('use', file)`.
- Alt bölüm "Son üretimler": `GET /ai-video` son 10, tamamlananlar seçilebilir (diyalog kapansa da ödenmiş sonuç
  kaybolmaz). Başarısızlar hata metniyle.
- Hata metinleri i18n, koda göre. Tüm metin `tr.json`; terminoloji brief §12.

### §3.2 Giriş noktaları (yalnız `aiVideoAllowed === true` iken görünür; değilse HİÇ görünmez, kilitli iskele yok)
1. **Mesaj kutusu (kanal + DM):** GIF düğmesinin (C23) yanına ya da onun açtığı yere tek giriş "Yapay zeka ile üret".
   `use` → mevcut `takeFiles([file])` (C25). Ek, ek hattından normal geçer (tarama, limit, takedown aynen).
   D78: `DmConversation.vue` 1280 satır. Yeni mantık bu dosyalara **eklenmez**; yalnız diyalog + bir satır bağlantı.
2. **`MediaSourceDialog.vue` (C22, dört hedef):** üçüncü seçenek "Yapay zeka ile üret". `use` → hareketli kesit
   akışı (`AnimatedClipModal`) bu dosyayla açılır, sonrası değişmez.

### §3.3 DoD (web)
`vue-tsc -b` (yalnız bilinen 6 hata) · lint · build · `aiVideoAllowed=false` hesapta hiçbir giriş görünmüyor.

---

## §4 Deploy notları
- Sunucu `.env` (`/home/deploy/kankaverse`): `AI_VIDEO_ENABLED=true`, `PIKA_API_KEY`, `AI_VIDEO_USER_IDS=<sahip id>`.
  Teyit: `docker compose exec api printenv | grep AI_VIDEO` (anahtarı yazdırma, yalnız varlığını gör).
- Pika bakiyesini sahip elle yükler (öneri: 10 $ ile başla).
- Özel bucket anahtar önekleri `ai-input/`, `ai-video/`: public CDN altında değil.

## §5 DoD
- [ ] api: model + migration uygulandı, uç noktalar, kapı, yoklayıcı, testler, `nest build` temiz
- [ ] R7: kapı + `aiVideoAllowed` DTO alanı + üçüncü tarafa giden veri sahibe sunuldu
- [ ] web: diyalog + iki giriş noktası, DoD §3.3
- [ ] Sahip turu (canlı): metinden üret → sohbete ekle; görselden üret → profil fotoğrafı yap; tavan aşımı mesajı;
  başka hesapta giriş yok
- [ ] Harcama: üretim satırlarında `costMicroUsd` dolu ve Pika panelindeki harcamayla tutarlı

## §6 Bilinçli borçlar (PLAN'a yazılır)
- Tek-instance yoklayıcı (çok-instance'ta çift yoklama) → BullMQ tetikleyicisi.
- Girdi görseli Pika'ya EXIF'li gidebilir (yalnız sahip; kullanıcıya açmadan önce sıyrılmalı, §8).

## §7 Sapma kuralı
Pika yanıt şekli bu sözleşmeden farklıysa (alan adı, durum değeri, uç nokta) dev **gerçek şekle uyar ve raporlar**:
§2.3/§2.4'teki Pika alanları belgeden alındı, sözleşme değil. Bizim uç nokta imzaları, DTO ve hata kodları **sapamaz**.

## §8 Kullanıcıya açma kapıları (bu sprintte YOK, sırası gelince her biri karar)
1. **18+ zorunlu** (Pika kullanım şartı: son kullanıcıya açılırsa erişim 18 yaş üstü). Yaş beyanı yetmeyebilir,
   e-Devlet doğrulamasıyla birlikte düşünülür. D74 "herkese açık" çizgisi burada **geçerli değil**.
2. **CSAM yükümlülüğü:** Pika "makul tespit, önleme ve NCMEC'e bildirim" istiyor. Bizde tarama kapalı (A1). Görselden
   üretim, gerçek kişi fotoğrafıyla deepfake riski taşır. A1 kurulmadan görselden üretim kullanıcıya açılmaz.
3. **Ticari kullanım / yeniden satış:** şartlar "planın izin verdiği ölçüde" diyor. Önceden ödemeli API'nin kapsamı
   **api@pika.art'a yazılı sorulur**, cevap gelmeden ücretli satış yok.
4. **KVKK yurt dışı aktarım:** hizmet ABD'den işletiliyor. Aydınlatma metnine eklenir, gerekiyorsa DPA istenir.
5. Kredi/cüzdan + ödeme altyapısı · kullanıcı başı günlük tavan · kötüye kullanım raporu (üretilen içerik normal
   ek olarak zaten raporlanabilir).
