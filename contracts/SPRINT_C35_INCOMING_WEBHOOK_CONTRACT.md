# SPRINT C35: Gelen webhook (adresle kanala mesaj, Discord biçimiyle uyumlu alt küme)

> Durum: **CANLI 2026-10-30 (6b65d4c), R7 sahip onaylı, sahip turu bekliyor.** Sözleşme onayı 2026-10-30 (§0.3 yazar modeli, §0.4 harici görsel yok, §3.4 kullanıcı bahsetmesi çözülmez dahil). PM compose (Opus). **api + web + mobil.**
> **R7: auth katmanı.** Gizli token ile kimliksiz istek mesaj yazdırıyor → §2 (token üretimi, saklama, doğrulama, yürütme ucu)
> ve §3'teki kapılar satır satır sahibe sunulur. Mesaj yazarı modeli (§1.2) T&S kararıdır, sahip onayı şart.

---

## §0 Kararlar
1. **Yalnız gelen yön.** Webhook kanala yazar; okuma, DM, başka ortam, düzenleme YOK. Açık API bir sözdür: alt küme dar başlar.
2. **Discord uyumu = adresi değiştirince çalışır.** Gövde Discord'un alt kümesidir, bilinmeyen alanlar **sessizce yok sayılır**
   (400 değil). Tam uyum iddia edilmez; desteklenmeyen alanlar §2.4'te listelidir.
3. **Hesap verebilirlik insanda.** Webhook mesajının `authorId`'si **webhook'u oluşturan üyedir**. Rapor, ban, mute o kişiye işler.
   Görünen kimlik (ad, rozet) webhook'tan gelir; oluşturanın kimliği üyelere **gösterilmez** (yalnız yöneticiler görür).
4. **Harici görsel yok.** `avatar_url`, embed `image`/`thumbnail` gibi dış adresli görseller kabul edilmez: taranmamış, minörün
   gördüğü yüzeye dışarıdan görsel çekmek demek. Webhook avatarı bu turda varsayılan simge.
5. **Yönetim yalnız web/masaüstü** (kurulumda bir kez yapılan ağır yapılandırma). Mobil yalnız mesajı doğru çizer.

## §1 Şema (api)
1. **Yeni model:**
   `Webhook { id, guildId, channelId, name String, tokenHash String, createdById String, deletedAt DateTime?, lastUsedAt DateTime?,
   createdAt, updatedAt }`, `@@index([channelId])`, `@@index([guildId])`. Silme yumuşak (`deletedAt`), mesajlar kimliği korur.
2. **Message'a:** `webhookId String?` (ilişki, `@@index` gerekmez) + `webhookName String?` (gönderim anındaki görünen ad, anlık
   görüntü; `username` alanı mesaj başına değiştirebildiği için). `embeds Json?` (§2.5 doğrulanmış biçim).
3. Migration yazılır **ve yerel DB'ye uygulanır** (`migrate status` temiz).
4. **İzin bayrağı:** `PERMISSION_FLAGS`'e `MANAGE_WEBHOOKS`. Varsayılan rollerde yok; ADMINISTRATOR kapsar (mevcut kural).
   `discord-import.service.ts` eşlemesine Discord bit'i `1n << 29n` → `MANAGE_WEBHOOKS` eklenir.

## §2 Yürütme ucu (api, R7)
1. `POST /webhooks/:id/:token` · kimlik doğrulama YOK (JwtAuthGuard yok), token tek anahtar. Mevcut `POST /voice/webhook` ile
   çakışma yok (farklı önek). Caddy `/api` önekini soyduğu için kamu adresi `https://kankaverse.com/api/webhooks/:id/:token`.
   Gövde `application/json`. `multipart/form-data` → 400 `WEBHOOK_UNSUPPORTED_FORMAT` (dosya eki bu turda yok).
2. **Token:** 32 bayt `crypto.randomBytes`, base64url. DB'de **yalnız SHA-256 hash** (yüksek entropili rastgele değer, argon2 gerekmez).
   Karşılaştırma `timingSafeEqual`. Webhook yok, silinmiş ya da token uyuşmuyor → **hepsi aynı 404** `WEBHOOK_NOT_FOUND`
   (var/yok sızdırılmaz).
3. **Token sızmaz:** `GlobalExceptionFilter` hata gövdesindeki `path` alanında ve tüm loglarda `/webhooks/:id/<token>` biçimi
   `/webhooks/:id/***` olarak maskelenir. Dev diğer log noktalarını (Caddy erişim logu açık mı, Sentry vb.) tarar, raporlar.
4. **Gövde (Discord alt kümesi):** `content` (≤2000, Discord sınırı), `username` (1-32, webhook adını bu mesaj için ezer),
   `embeds` (§2.5), `allowed_mentions` (§3.4). `content` boş ve `embeds` boş → 400 `EMPTY_MESSAGE`.
   **Yok sayılan:** `avatar_url`, `tts`, `flags`, `thread_id`, `thread_name`, `components`, `attachments`, `poll`, `wait` sorgu
   parametresi ve diğer her şey. Global `ValidationPipe` `forbidNonWhitelisted` kullanıyorsa bu DTO için kapatılır (dev doğrular).
5. **Embed (en çok 5):** `title` ≤256 · `description` ≤2000 · `url` (yalnız `https://`) · `color` (0..0xFFFFFF tam sayı) ·
   `author.name` ≤256 (+ `author.url` https) · `fields` ≤10 (`name` ≤256, `value` ≤1024, `inline` bool) · `footer.text` ≤256 ·
   `timestamp` ISO-8601. `image`, `thumbnail`, `video`, `author.icon_url`, `footer.icon_url` **atılır** (§0.4). Tüm embed metinlerinin
   toplamı ≤6000. Sınır aşımı 400 `INVALID_EMBED` (Discord da reddeder, sessiz kırpma yok). Saklanan biçim yalnız bu alanlar.
6. **Cevap:** ~~200 + envelope~~ **REVİZE 2026-10-30: 204, gövde yok** (envelope kuralının tek muafiyeti). Gerekçe: dev denemesinde
   `discord-webhook-node` yalnız 204 kabul etti, mesaj gitti ama kütüphane hata fırlattı. 429 gövdesine Discord biçimli `retry_after`
   (saniye) eklenir. `?wait=true` tam mesaj nesnesi bu turda yok.
   **Ek hata kodları (dev, onaylı):** `INVALID_BODY` 400 · `WEBHOOK_LIMIT_REACHED` 409 · `CHANNEL_NOT_FOUND` 404 · `FORBIDDEN` 403.
   Embed `url`: http ve https kabul, başka şema 400.
7. **Hız sınırı:** webhook başına 2 sn'de 5, dakikada 30; IP başına dakikada 60. Aşımda 429 `WEBHOOK_RATE_LIMITED` + `retryAfter`
   (saniye) + `Retry-After` başlığı. Yavaş mod webhook'a uygulanmaz (kendi sınırı var).
8. `lastUsedAt` başarılı gönderimde güncellenir (dakikada en çok bir yazım yeter).

## §3 Yürütme kapıları (api, R7)
Mesaj `MessagesService` içinde **mevcut create yoluyla aynı kapılardan** geçer; dev ayrı kopya yazmaz, ortak çekirdek çıkarır
ve hangi adımın paylaşıldığını raporlar.
1. **Oluşturan hâlâ yetkili mi:** her gönderimde oluşturan (a) ortamda üye, (b) `MANAGE_WEBHOOKS` sahibi, (c) global ban yok,
   (d) ortam mute'u yok, (e) kanala erişimi var. Biri tutmazsa 403 `WEBHOOK_DISABLED` (webhook silinmez; yeni yetkili yeniden
   oluşturabilir ya da üstlenebilir, §4.4). Oluşturan ayrılınca yöneticiler listede "devre dışı" görür.
2. **Kanal:** yalnız `GUILD_TEXT`, silinmemiş. Kanal silinmişse 404.
3. **Automod:** `content` + `username` + tüm embed metinleri tek tek mevcut `automod.check`'ten geçer. Takılan → 400 `MESSAGE_BLOCKED`.
4. **Bahsetme:** `resolveMentions` oluşturanın kimliğiyle çalışır (oluşturanın yapamadığını webhook yapamaz). Kullanıcı bahsetmesi
   (`<@id>`) **çözülmez**, düz metin kalır (dışarıdan üye id'siyle bildirim spamı). `@everyone` ve rol bahsetmesi yalnız
   oluşturanın izni varsa VE `allowed_mentions.parse` bunları içeriyorsa (alan yoksa Discord varsayılanı gibi izin verilir;
   alan yalnız daraltır). **Ek 2026-10-30:** webhook yolunda düz `@everyone` metni everyone bahsetmesine çevrilir (aynı kapılar);
   Discord araçları rol id'si bilemez, yoksa toplu duyuru hiç çalışmazdı. `@here` düz metin.
5. **`username` taklidi:** büyük/küçük harf ve Türkçe karakter normalleştirilmiş hâli şu ayrılmış adlardan biriyle eşleşirse ya da
   bunları içerirse 400 `WEBHOOK_NAME_RESERVED`: `kankaverse`, `moderatör`/`moderator`, `yönetici`/`admin`, `sistem`/`system`,
   `destek`/`support`, `resmi`/`official`. Aynı kural webhook adına da uygulanır. Rozet her durumda görünür (§5.1).
6. **Okunmamış ve bildirim:** webhook mesajı herkes için (oluşturan dahil) normal mesaj gibi okunmamış sayılır ve `message.created`
   ile yayılır. Dev `authorId` kullanan sorguları tarar (okunmamış sayımı, yavaş mod son-mesaj sorgusu, arama `from` süzgeci,
   bildirim kendini-atla) ve webhook mesajını oluşturanın kendi mesajı saymayacak şekilde düzeltir; listeyi raporlar.

## §4 Yönetim uçları (api)
Hepsi JwtAuthGuard + `MANAGE_WEBHOOKS` (ortam bazında). Her yazma işlemi `AuditLog` (`webhook.create` · `webhook.update` ·
`webhook.token_reset` · `webhook.delete`, metadata: ad, kanal).
1. `GET /guilds/:guildId/webhooks` → `[{ id, name, channelId, createdBy: { id, username }, disabled, lastUsedAt, createdAt }]`.
   Token ve hash ASLA dönmez.
2. `POST /guilds/:guildId/webhooks { channelId, name }` → yukarıdaki nesne + `url` (tam adres, token içinde). **Token yalnız bu
   cevapta ve §4.4'te görünür.** Kanal bu ortamın `GUILD_TEXT` kanalı olmalı, çağıranın erişimi olmalı. Kanal başına en çok 10 etkin.
3. `PATCH /guilds/:guildId/webhooks/:id { name?, channelId? }` (aynı ortam içinde taşıma; aynı kanal kuralları).
4. `POST /guilds/:guildId/webhooks/:id/token` → yeni token, eskisi anında geçersiz, cevapta yeni `url`. Bu işlem webhook'un
   `createdById`'sini çağırana devreder (devre dışı webhook'u üstlenme yolu); AuditLog'a eski ve yeni sahip yazılır.
5. `DELETE /guilds/:guildId/webhooks/:id` → yumuşak silme; gönderilmiş mesajlar kalır.
6. Webhook mesajları **düzenlenemez** (`editMessage` webhook mesajında 403 `WEBHOOK_MESSAGE_READONLY`, oluşturan dahil).
   Silme: `MANAGE_MESSAGES` (mevcut yol) veya `MANAGE_WEBHOOKS`.

## §5 Mesaj DTO ve istemciler
1. **DTO (api):** webhook mesajında `author` alanı webhook kimliğiyle doldurulur: `{ id: webhook.id, username: webhookName,
   avatarUrl: null, avatarAnimatedUrl: null, roleEmoji: null }`, ek alan `webhook: { id }` ve `embeds: [...] | null`.
   **Oluşturanın id'si DTO'da yok.** Yanıt önizlemesi (`replyTo.authorUsername`) de `webhookName` kullanır. Rapor kaydı mesajın
   `webhookId`'sini taşır (moderatör "webhook mesajı, sorumlu: X" görür; dev rapor/admin yüzeyini raporlar).
2. **Web:** webhook mesajında ad yanında **"BOT"** rozeti, varsayılan bot simgesi, ada/avatara tıklayınca profil kartı **açılmaz**,
   düzenle menüsü yok. Ardışık mesaj gruplaması `author.id` ile zaten ayrışır. Embed kartı: sol kenar çizgisi `color`, başlık
   (url varsa bağlantı, yeni sekme + `rel="noopener noreferrer"`), açıklama (mevcut mesaj biçimlendirmesiyle aynı güvenli işleyici,
   ham HTML yok), alanlar (inline ikili/üçlü ızgara), alt bilgi + TR tarih biçimi. 390/320px'te taşma ölçülür.
3. **Web yönetim:** Ortam ayarlarına **"Webhook'lar"** sekmesi (yalnız `MANAGE_WEBHOOKS` olana görünür). Liste (ad, kanal, son
   kullanım, devre dışı etiketi), oluştur (ad + kanal seçici), adres bir kez gösterilir + kopyala düğmesi + "Bu adresi gizli tut,
   bilen herkes bu kanala yazabilir" uyarısı, adı/kanalı değiştir, token yenile (onay), sil (onay). Kısa "Nasıl kullanılır" metni:
   Discord webhook adresi bekleyen araca bu adres verilir.
4. **Mobil:** yalnız çizim (§5.2'nin rozet, profil kartı açmama, düzenleme yok ve embed kartı kısmı). Yönetim yok.
   `app.json` versionCode 40 → 41 (vc40 henüz gönderilmedi, bununla birlikte gider).
5. **Eski istemci davranışı:** vc40 ve öncesi `webhook`/`embeds` alanını bilmez; ad doğru görünür (author doldurulduğu için),
   embed görünmez, ada tıklayınca bilinmeyen id ile profil isteği atar. Dev bunun çökmeden boş/hata kartı verdiğini doğrular, raporlar.
6. Tüm metinler `web/src/i18n/tr.json`'da, em dash yok, UI dili "Ortam".

## §6 Test (api)
Token: doğru → mesaj, yanlış/silinmiş/yok → aynı 404 · token yenileme eskisini öldürür · hash dışında token saklanmıyor ·
hata gövdesinde token maskeli. Kapılar: oluşturan ayrıldı / izni alındı / banlı / mute'lu → 403 · automod `content`, `username`
ve embed alanında yakalıyor · ayrılmış ad reddi (Türkçe karakter varyantları dahil) · `<@id>` bildirim üretmiyor · `@everyone`
oluşturanın izni yoksa düz metin · `allowed_mentions.parse: []` daraltıyor. Gövde: bilinmeyen alan 400 vermiyor · `avatar_url` ve
embed görseli atılıyor · embed sınır aşımı 400 · multipart 400. Hız sınırı 429 + `Retry-After`. Yönetim: izinsiz 403, liste token
döndürmüyor, kanal başına 10 sınırı, başka ortamın kanalına taşıma reddi, düzenleme 403. DTO'da oluşturan id'si yok.

## §7 DoD
- api: build, ilgili jest + tam koşu, `npx eslint` değişen dosyalar, `migrate status` temiz.
- web: `vue-tsc -b` (bilinen 6 hata dışında yok), `vite build`, eslint. mobil: typecheck + lint, versionCode 41.
- **R7:** §2 + §3 + §4.4 diff'i sahibe satır satır.
- **Gerçek araçla deneme (dev, yerel):** `curl` ile Discord biçimli gövde; ayrıca bir Discord webhook kütüphanesiyle
  (ör. `discord-webhook-node` ya da Python `discord-webhook`) yalnız adres değiştirilerek gönderim. Sonuç raporlanır.
- **Sahip turu (canlı):** web'de webhook oluştur, adresi bir araca ver (ör. GitHub Actions adımı ya da curl), mesaj web + masaüstü
  + mobilde BOT rozetiyle görünür, embed kartı doğru · ada tıklayınca profil açılmıyor · token yenileyince eski adres 404 ·
  oluşturanın izni alınınca webhook devre dışı.

**OUT:** dosya eki / görsel · webhook avatarı yükleme · `?wait=true` tam nesne · `/github` ve `/slack` uyum son ekleri · mesaj
düzenleme/silme uçları (`PATCH/DELETE /webhooks/:id/:token/messages/:mid`) · giden webhook · DM webhook'u · bot hesapları ·
eğik çizgi komutları · hesap bağlama (Steam/Twitch/Kick, sıradaki sprint).
