# SPRINT C30: Görsel, video ve dosya ekli mesajı iletme

> Durum: **TASARIM KİLİTLİ (2026-10-29).** PM compose (Opus). Sahip isteği: "Görsel iletmek istedim, düz yazı olarak
> gitti." **api + web + mobil.** **R7: yeni ek oluşturma yolu + erişim kontrolü** → §1 sahip satır satır onayı olmadan
> merge yok.

---

## §0 Teşhis + karar
- Bugün iletme tamamen istemcide: web `ForwardMessageModal.vue` yalnız `content` gönderiyor (ek varsa hiç gitmiyor);
  mobil `ForwardMessageModal.tsx` metin boşsa **dosya adını** metin olarak gönderiyor. Görselin yazı gitmesinin sebebi bu.
- Ek bir mesaja tek kez bağlanabiliyor (`messageId`), `storageKey` tekil. Aynı eki ikinci mesaja bağlamak şemayı bozar.
- **Karar: sunucuda kopya.** Emsal hazır: C14b yapay zeka "Kullan" yolu (`ai-video-attachment.service.ts`) objeyi
  `storage.copy` ile yeni anahtara kopyalayıp ileten kullanıcıya ait, `messageId=null` yeni bir Attachment açıyor; istemci
  sonra normal `POST /channels/:id/messages` ile `attachmentIds` gönderiyor. İletme aynı iki adım. İstemci indirip yeniden
  yüklemez (çift trafik, yavaş, mobilde pahalı).
- Kopya bağımsız yaşar: asıl mesaj silinirse iletilen kopya kırılmaz. Bunun T&S bedeli: asıl içeriğe uygulanan müdahale
  kopyalara kendiliğinden ulaşmaz. Bu yüzden kopya kaynağını kaydeder (§1.4).

## §1 API (R7)
1. `POST /attachments/:id/forward` → `201 { attachmentId }`. Guard: `JwtAuthGuard` + `VerifiedEmailGuard` (yüklemeyle
   aynı). `@Throttle` (ör. 30/dk).
2. Kapılar, sırayla (hepsi `getDownloadUrl` ile aynı anlam, yeni gevşetme yok):
   - `uploadsEnabled` kapalıysa `403 UPLOADS_DISABLED` (presign ile aynı mesaj).
   - Ek yok / `messageId` null / bağlı mesaj silinmiş (`deletedAt` dolu) → `404 ATTACHMENT_NOT_FOUND`.
   - `membership.requireChannelAccess(userId, kaynakKanal)` (üyelik + minör/adultsOnly kapıları). Erişemediği ekin
     varlığını öğrenemez.
   - `scanStatus !== CLEAN` → FLAGGED `403 ATTACHMENT_BLOCKED`, diğerleri `403 ATTACHMENT_NOT_READY`.
3. Kopya: `storage.copy(kaynak.storageKey, yeniAnahtar)` (anahtar üretimi presign ile aynı yardımcı), yeni satır:
   `uploaderId = ileten`, `messageId = null`, `filename/contentType/size/durationMs/waveform/thumbnail/width/height`
   kaynaktan, **`aiGenerationId` kaynaktan** (yapay zeka rozeti iletilince de görünür kalır, şeffaflık),
   `scanStatus` = yükleme hattının kuralı (`scanEnabled ? PENDING : CLEAN`; bağlanırken `create` zaten yeniden uygular).
4. Şema: `Attachment.sourceAttachmentId String?` + `@@index([sourceAttachmentId])` (ilişki tanımı gerekmez, düz alan).
   Migration yazılır **ve yerel DB'ye uygulanır** (`migrate status` temiz). Amaç: moderasyon bir eki kaldırdığında
   kopyalarını bulabilmek.
5. Hedef kanal kapıları **değişmez**: ileten kullanıcı yeni eki normal `create` ile gönderir; ban, susturma, blok, mesaj
   isteği, yavaş mod, `canDm` hepsi orada. Yeni baypas yok.
6. Dev kontrol edip raporlar (kod yazmadan): (a) bugün mesaj silinince (kullanıcı veya moderasyon) ekleri ne oluyor,
   `getDownloadUrl` silinmiş mesajın ekini hâlâ veriyor mu; (b) moderasyonda mesaj eki kaldırma yolu var mı. Kopyalara
   yayma bu sprintte YOK, bulgu PM'e gelir, borç tablosuna girer.
7. Test: erişimi olmayan kanalın eki 403/404; silinmiş mesajın eki 404; FLAGGED/PENDING reddi; uploads kapalı; mutlu
   yol (kopya alanları + `sourceAttachmentId` + `aiGenerationId` taşındı, `messageId` null, uploader ileten).

## §2 İstemci (web + mobil)
1. İletme penceresi önizlemesi: metin varsa metin; ek varsa küçük görsel/video karesi veya dosya simgesi + adı ("+2 dosya"
   gibi sayaç birden fazlaysa). Metin de ek de yoksa bugünkü boş durum.
2. Hedefe gönder: mesajın **her eki için** `POST /attachments/:id/forward` (paralel), sonra
   `messagesApi.send(hedef, content, undefined, yeniIdler)`. Her hedef kendi kopyalarını alır (ek tek mesaja bağlanır).
3. Mobil: dosya adını metin olarak gönderme davranışı **kaldırılır**.
4. Hata: herhangi bir kopya veya gönderim reddedilirse o hedef "gönderildi" işaretlenmez, sunucunun Türkçe mesajı toast.
   Ek kopyalandı ama mesaj gitmediyse sahipsiz ek kalır; bugün presign'da da böyle, temizlik ayrı konu.
5. Taranmamış/engelli ek (CLEAN değil) içeren mesajda İlet seçeneği gizlenmez, sunucu reddeder; mesaj Türkçe döner.
6. Yeni metinler i18n'de, em dash yok.

## §3 DoD
- api: build, test, lint; migration uygulandı (`prisma migrate status` temiz). Canlı deploy'da migration otomatik
  koşuyor mu teyit (deploy hattında ne yapıyorsa).
- web: `vue-tsc -b` (bilinen 6 dışında yeni yok), lint, `vite build`.
- mobil: typecheck + lint; versionCode C29 ile birlikte tek artış yeterli.
- R7: §1 diff'i sahibe satır satır sunulur.
- Sahip turu: görsel, video, sesli mesaj, dosya ve metin+görsel iletme (web→DM, mobil→grup DM); yapay zeka videosu
  iletilince rozet duruyor; asıl mesaj silinince iletilen görsel açılmaya devam ediyor.

**OUT:** "İletildi" etiketi · kanal (ortam) hedefleri (bugün iletme yalnız DM/grup DM) · kopyalara moderasyon yayma (§1.6
bulgusuna göre ayrı kalem) · sahipsiz ek temizliği.
