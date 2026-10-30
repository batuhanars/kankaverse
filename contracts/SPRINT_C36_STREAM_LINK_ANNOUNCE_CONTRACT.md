# SPRINT C36: Kick + Twitch hesap bağlama ve ortamda "yayına başladı" duyurusu

> Durum: **SÖZLEŞME YAZILDI + SAHİP ONAYI (2026-10-30).** Devamı C37 (Steam + Battle.net, aynı adaptör kalıbı). PM compose (Opus). **api + web + mobil (yalnız gösterim).**
> **R7:** OAuth akışı (state, PKCE, geri dönüş ucu), Kick ve Twitch olay imza doğrulaması, minör kapısı ve duyuru içerik kapısı (§5)
> satır satır sahibe sunulur.
> **Build-dark:** `KICK_ENABLED=false`, `TWITCH_ENABLED=false` varsayılan. Sahip geliştirici uygulamalarını açıp anahtarları sunucuya
> koyunca sağlayıcı başına ayrı açılır.

---

## §0 Kararlar (sahip, 2026-10-30)
1. **Kick + Twitch.** Kick öncelikli (Türk yayıncılar Kick'e kaydı); Twitch aynı kalıpla aynı sprintte. Dev önce Kick'i uçtan uca
   bitirir, sonra Twitch'i ekler (Twitch'te takılırsa Kick tek başına teslim edilebilir olmalı). Steam / Epic / YouTube bu turda yok.
   Sağlayıcıya özgü kod (OAuth uçları, olay doğrulama, yayın bilgisi okuma) sağlayıcı başına bir adaptörde; bağlama, duyuru ve arayüz ortak.
2. **Bağlama yalnız OAuth ile.** Kullanıcı adı yazarak bağlama YOK (ünlü yayıncının kanalını sahiplenip onun adına duyuru yaptırma).
   Bir dış hesap tek Kankaverse hesabına bağlanır; bir kullanıcı sağlayıcı başına tek hesap bağlar.
3. **Minör bağlayamaz.** Sunucu kapısı (`isMinor` → 403), arayüzde bölüm minöre hiç görünmez. Dış hesap = platform dışı ulaşım yolu.
4. **Duyuru çift rızalı.** Ortam yöneticisi duyuru kanalını açar; yayıncı "bu ortamda yayınlarım duyurulsun" seçeneğini **kendisi**
   açar (ortam başına, varsayılan kapalı). Yönetici kimseyi rızası dışında duyuramaz.
5. **Kumar / yetişkin yayın yalnız 18+ ortamda duyurulur.** Kategori kumar listesindeyse ya da yayın platformda yetişkin/kumar
   işaretliyse duyuru yalnız `adultsOnly` ortamlarda yapılır, diğerlerinde **hiç** yapılmaz. Okunamıyorsa riskli sayılır (fail-closed).
6. **Duyuru = C35 webhook mesajı.** Yeni mesaj türü yok: ortam başına sistem yönetimli bir webhook üzerinden embed'li mesaj
   (BOT rozeti, embed kartı, kapılar, mobil vc41 çizimi hazır). Harici görsel yok (C35 §0.4): yayın küçük resmi gösterilmez.
7. **Yönetim ve bağlama yalnız web/masaüstü.** Mobil yalnız profilde bağlı hesapları gösterir.

## §1 Şema (api)
1. `enum ExternalProvider { KICK TWITCH }`
2. `ExternalAccount { id, userId, provider, externalId String, username String, showOnProfile Boolean @default(true),
   lastLiveAt DateTime?, lastAnnouncedAt DateTime?, linkedAt, updatedAt }`, `@@unique([provider, externalId])`,
   `@@unique([userId, provider])`. **Dış platform erişim/yenileme token'ı SAKLANMAZ** (§2.4).
3. `ExternalLinkState { id String @id (= state), userId, provider, codeVerifier String, expiresAt DateTime }`. 10 dk ömür, tek
   kullanımlık (okununca silinir), süresi geçenler fırsatçı temizlenir.
4. `StreamAnnounceConfig { guildId @unique, channelId, webhookId @unique, mentionRoleId String?, enabled Boolean, createdById,
   createdAt, updatedAt }`. Ortam başına tek ayar, iki sağlayıcı için ortak.
5. `StreamAnnounceOptIn { guildId, userId, createdAt }`, `@@unique([guildId, userId])`. Kullanıcının tüm bağlı hesaplarını kapsar.
6. `Webhook`'a `kind WebhookKind @default(USER)` (`USER | STREAM_ANNOUNCE`). `STREAM_ANNOUNCE` webhook'u: token hash rastgele
   üretilir ve hiçbir yerde gösterilmez; yürütme ucu (`POST /webhooks/:id/:token`) bu türü **her zaman 404** ile reddeder;
   C35 yönetim listesinde görünmez (yalnız §4 yönetir).
7. Migration yazılır **ve yerel DB'ye uygulanır** (`migrate status` temiz).

## §2 OAuth bağlama (api, R7)
`:provider` = `kick | twitch`. Bilinmeyen ya da bayrağı kapalı sağlayıcı → 404.
1. **Yapılandırma:** `KICK_ENABLED`, `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `KICK_REDIRECT_URI`
   (`https://kankaverse.com/api/integrations/kick/callback`); `TWITCH_ENABLED`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`,
   `TWITCH_REDIRECT_URI` (`.../integrations/twitch/callback`), `TWITCH_EVENTSUB_SECRET` (10-100 karakter). Hangi sağlayıcıların açık
   olduğu istemciye mevcut özellik bayrağı yolundan iletilir (dev hangi yol olduğunu raporlar).
2. `POST /integrations/:provider/link` (JwtAuthGuard) → `{ url }`. Minör → 403 `MINOR_NOT_ALLOWED`. Zaten bağlıysa 409
   `ALREADY_LINKED`. 32 bayt rastgele `state` + PKCE `code_verifier` (S256; sağlayıcı PKCE desteklemiyorsa yalnız state) üretilir,
   `ExternalLinkState`'e yazılır. Kapsam (scope) **en az**: yalnız kullanıcı kimliği okuma (Twitch'te kapsam gerekmez; Kick'te dev
   belgeden doğrular).
3. `GET /integrations/:provider/callback?code&state` (kimliksiz; tarayıcı dış platformdan geri döner). Kimlik **çerezden değil
   state'ten** gelir; state'in sağlayıcısı yoldaki sağlayıcıyla eşleşmeli. State yok/süresi geçmiş/kullanılmış →
   `/settings/connections?link=error&provider=...`. Kullanıcı bu arada minör olarak işaretlenmiş ya da silinmişse reddedilir.
4. Kod (+ verifier) ile token alınır, kullanıcı kimliği ve kullanıcı adı okunur, **token atılır** (bellekte kalır, DB'ye/loga
   yazılmaz). Hesap başka bir kullanıcıya bağlıysa → `?link=taken`. Başarı → `?link=linked`.
5. Bağlama sonrası "yayın başladı" aboneliği **uygulama token'ıyla** (client credentials) açılır:
   - Twitch: EventSub `stream.online` (webhook transport, `TWITCH_EVENTSUB_SECRET`). Resmî belgeye göre uygulama token'ı yeterli.
   - Kick: `livestream.status.updated`. 🔴 **Sınanacak varsayım:** uygulama token'ıyla yayıncı başına abonelik açılabildiği
     üçüncü taraf kütüphanelerden okundu, resmî belgede doğrulanmadı. Kullanıcı token'ı gerekiyorsa dev DURUR, PM'e gelir
     (token saklamak yeni bir R7 kararı).
6. `DELETE /integrations/:provider` → hesap silinir, aboneliği kapatılır. Kullanıcının başka bağlı hesabı kalmadıysa tüm
   `StreamAnnounceOptIn` kayıtları da silinir.
7. `PATCH /integrations/:provider { showOnProfile }`. `GET /integrations` → kullanıcının bağlı hesapları.
8. Kullanıcı hesabını silerse (mevcut silme akışı) bağlı hesaplar ve opt-in'ler de silinir.
9. Tüm bağla/kopar işlemleri `AuditLog` (`integration.link` / `.unlink`, metadata: sağlayıcı).

## §3 Olay alıcıları (api, R7)
Ortak: **ham gövde** gerekir (JSON ayrıştırmadan önce), dev ham gövdeyi yalnız bu uçlar için açar. Geçersiz imza → 401, hiçbir şey
yapılmaz. Zaman damgası 5 dakikadan eskiyse reddedilir. Mesaj kimliği 24 saat tekilleştirilir (en az bir kez teslim). Uç **hızlı 2xx**
döner, duyuru işi arka planda. Günde bir **uzlaştırma işi**: bağlı hesapların abonelikleri platformda listelenir, eksik olanlar
yeniden açılır, bağlı olmayanlarınki kapatılır, sonuç loglanır.
1. **Kick** `POST /integrations/kick/webhook` (Kick geliştirici ayarlarına yazılır). İmza: `Kick-Event-Signature`, Kick'in açık
   anahtarıyla (RSA PKCS#1 v1.5 + SHA-256; imzalanan metin mesaj kimliği + zaman damgası + ham gövde; dev resmî belgeden kesinleştirir).
   Açık anahtar Kick'in ucundan alınır, bellekte tutulur, doğrulama başarısız olursa bir kez yenilenip tekrar denenir.
   Yalnız "yayın başladı" işlenir; "yayın bitti" yalnız `lastLiveAt`'ı günceller.
2. **Twitch** `POST /integrations/twitch/webhook`. İmza: `Twitch-Eventsub-Message-Signature` = `sha256=` +
   HMAC-SHA256(`TWITCH_EVENTSUB_SECRET`, mesaj kimliği + zaman damgası + ham gövde), sabit zamanlı karşılaştırma.
   Mesaj türleri: `webhook_callback_verification` → `challenge` düz metin olarak 200 (imza doğrulandıktan sonra) ·
   `notification` → `stream.online` işlenir · `revocation` → loglanır, uzlaştırma işi yeniden açmayı dener.

## §4 Ortam duyuru ayarı (api + web)
1. Yetki: `MANAGE_WEBHOOKS` (C35 bayrağı).
2. `GET/PUT/DELETE /guilds/:guildId/stream-announce` → `{ channelId, mentionRoleId, enabled }`. PUT ilk kez çağrılınca
   `STREAM_ANNOUNCE` türünde webhook oluşturulur (ad: **"Yayın Duyurusu"**, oluşturan = çağıran). Kanal C35 kurallarıyla aynı
   (`GUILD_TEXT`, erişim). `mentionRoleId` bu ortamın rolü olmalı; bahsetme C35 §3.4 kapısından geçer (oluşturanın izni).
   DELETE webhook'u yumuşak siler. AuditLog (`stream_announce.update` / `.delete`).
3. Üye tarafı: `PUT/DELETE /guilds/:guildId/stream-announce/opt-in` (JwtAuthGuard, ortam üyesi, en az bir bağlı hesap). Minör → 403.
4. Web: Ortam ayarları > Webhook'lar sekmesinin üstünde **"Yayın duyuruları"** kartı: kanal seçici, isteğe bağlı rol seçici,
   aç/kapa. Altında bilgi: "Duyuru yalnız bu ortamda yayınlarının duyurulmasını kendisi açan üyeler için yapılır. Kick ve Twitch desteklenir."
5. Web, üye: Kullanıcı ayarları menüsüne **"Bağlantılar"** maddesi (yeni rota `/settings/connections`; Caddy `@app path` listesinde
   `/settings/*` zaten var, dev teyit eder). Sayfa düzeni (sahip, 2026-10-30, Discord "Bağlantılar" düzeni referans):
   - Üstte kısa açıklama: "Diğer platformlardaki hesaplarını bağla. Profilinde görünsün, yayına başladığında ortamların haberdar olsun."
   - **"Yeni bağlantı ekle"**: platform simgelerinden oluşan sıra. Bugün **yalnız Kick ve Twitch** (resmî logolar, marka kılavuzlarına
     uygun), yalnız bayrağı açık olanlar. Olmayan platform için simge, "yakında" ya da pasif düğme KONMAZ. Bağlı olanın simgesi sırada görünmez.
   - **Bağlı hesap kartı** (sağlayıcı başına bir kart): logo + kullanıcı adı + platform adı, sağ üstte kopar (×, onaylı),
     içinde "Profilimde göster" anahtarı.
   - Kartların altında tek bölüm **"Yayınlarımı duyuran ortamlar"** (en az bir bağlı hesap varsa): üyesi olduğu ve duyurusu açık her
     ortam için ortam simgesi + adı + "Duyur" anahtarı. Yoksa tek satır: "Üyesi olduğun ortamlarda yayın duyurusu açık değil."
   - Geri dönüşteki `?link=` sonucu bilgi bandı olarak gösterilir (bağlandı / bu hesap başka bir kullanıcıya bağlı / hata).
   - Minörde menü maddesi görünmez.

## §5 Duyuru üretimi (api, R7)
"Yayın başladı" olayı geldiğinde, bağlı hesabın sahibi için:
1. Sahip minörse, silinmişse ya da global banlıysa hiçbir şey yapılmaz.
2. **Tekrar kapısı:** o hesabın `lastAnnouncedAt`'ı son 30 dakika içindeyse duyuru yok (yayın kopup yeniden başlaması spam üretmesin).
3. **İçerik kapısı:** yayının kategorisi ve yetişkin/kumar işareti platform API'sinden okunur (olay gövdesinde yoksa yayın ucundan,
   uygulama token'ıyla). Riskli =
   - kategori `STREAM_GAMBLING_CATEGORIES` listesinde (yapılandırma, sağlayıcı başına; başlangıç: slot, casino, poker, bahis içeren
     kategoriler; dev Kick ve Twitch'teki gerçek kategori adlarını/kimliklerini raporlar) **veya**
   - Kick: yayın yetişkin işaretli · Twitch: içerik sınıflandırma etiketlerinde `Gambling` ya da `MatureGame` / `SexualThemes` /
     `DrugsIntoxication` / `ViolentGraphic` / `ProfanityVulgarity` var ya da `is_mature` true (dev güncel etiket kimliklerini belgeden doğrular) **veya**
   - okunamadı.
4. Hedef ortamlar: sahibin opt-in yaptığı, hâlâ üyesi olduğu, `StreamAnnounceConfig.enabled` olan ortamlar. Riskliyse yalnız
   `adultsOnly` olanlar. Ortam başına C35 `resolveSender` + automod kapıları aynen (yayın başlığı automod'a takılırsa o ortama
   duyuru yok, loglanır).
5. **Mesaj:** içerik `"{kullanıcıAdı} {Kick|Twitch}'te yayında!"` (Türkçe ek uyumu dev'in sabitinde: "Kick'te", "Twitch'te")
   + varsa rol bahsetmesi; tek embed: başlık = yayın başlığı (≤256), `url` = `https://kick.com/{slug}` ya da
   `https://twitch.tv/{login}`, açıklama = kategori adı, renk platform rengi (Kick yeşili, Twitch moru), alt bilgi platform adı,
   zaman damgası. Görsel yok. Metinler sunucu sabitinde (tek dosya, TR).
6. `lastAnnouncedAt` ve `lastLiveAt` güncellenir.

## §6 Profil gösterimi (api + web + mobil)
1. Profil kartı DTO'suna `connections: [{ provider, username, url }]`, yalnız `showOnProfile` olanlar. Görünürlük profil kartını
   görebilen herkes (mevcut kart kuralı). Minörün bağlı hesabı olamaz (§0.3), ek kural gerekmez.
2. Web profil kartı/paneli: platform simgesi + kullanıcı adı, tıklayınca yeni sekme (`noopener noreferrer`).
3. Mobil profil sayfası: aynı satırlar, dokununca dış tarayıcı. versionCode 41 kalır (vc41 henüz gönderilmedi; bu da içine girer).

## §7 KVKK
Gizlilik metnine (`/gizlilik` sayfası) bir paragraf: bağlanan Kick/Twitch hesabının kimliği ve kullanıcı adı saklanır, yayın başladı
bilgisi ilgili platformdan alınır, erişim token'ı saklanmaz, bağlantı her an koparılabilir ve koparınca silinir. Metin sade, em dash yok.

## §8 Test (api)
OAuth: state yok/süresi geçmiş/ikinci kullanım/sağlayıcı uyuşmazlığı reddi · minör `link` 403 ve callback anında minör ret · aynı dış
hesap ikinci kullanıcıya bağlanamaz · token DB'ye yazılmıyor · bayrağı kapalı sağlayıcı 404. Alıcılar: Kick ve Twitch geçersiz imza
401 · eski zaman damgası reddi · aynı mesaj kimliği ikinci kez işlenmiyor · Twitch doğrulama `challenge` dönüyor. Duyuru: opt-in yoksa
yok · yönetici ayarı kapalıysa yok · riskli kategori/etiket yetişkin olmayan ortama gitmiyor, `adultsOnly` ortama gidiyor ·
okunamazsa riskli · 30 dk tekrar kapısı · sahibi banlı/minör ise yok · oluşturan (yönetici) yetkisini kaybettiyse C35 kapısı devre dışı
bırakıyor · `STREAM_ANNOUNCE` webhook'u yürütme ucunda 404. Profil: `showOnProfile` false iken kartta yok. Kopar: son hesap koparılınca
opt-in'ler siliniyor, bir hesap kalırsa duruyor.

## §9 DoD
- api: build, ilgili jest + tam koşu, değişen dosyalarda eslint, `migrate status` temiz. web: `vue-tsc -b` (bilinen 6), `vite build`,
  eslint. mobil: typecheck + lint.
- **R7:** §2, §3, §5 diff'i sahibe.
- **Yerel deneme:** gerçek uygulamalar olmadan imza doğrulaması kendi ürettiğimiz anahtar/sırla test edilir (Twitch için `twitch-cli
  event trigger` kullanılabiliyorsa onunla, projeye bağımlılık eklemeden); OAuth akışı sahip uygulamaları açınca canlıda denenir.
- **Sahip ön işi (dev raporuyla birlikte PM adım adım verir):** Kick ve Twitch hesaplarında 2FA, iki geliştirici uygulaması, geri dönüş
  adresleri + Kick webhook adresi, anahtarların sunucu `.env`'ine konması, bayrakların açılması.
- **Sahip turu (canlı, sağlayıcı başına):** bağla, profilde görünüyor · bir ortamda duyuru aç + opt-in · yayın aç → duyuru BOT rozetli
  embed ile geliyor · 30 dk içinde ikinci duyuru yok · minör test hesabında Bağlantılar bölümü yok · kopar → profil ve opt-in doğru.

**OUT:** Steam · Epic · YouTube · Riot · Battle.net · yayın küçük resmi · "yayın bitti" mesajı · canlı izleyici sayısı · sohbet köprüsü ·
oyun algılamayla birleştirme · mobilde bağlama/yönetim.

## §10 Ek kararlar (2026-10-30, kodlama sırasında)
1. **Twitch bayrağı kapalı kalır** (sahip): kod hazır, bir yayıncı isterse açılır. Kick ile canlıya çıkılır.
2. **Bağlı hesaplar minör görüntüleyene hiç gönderilmez** (sahip, T&S): kart DTO'sunda görüntüleyen minörse ya da bulunamazsa
   `connections: []` (sunucuda, fail-closed). Gerekçe: profil bağlantısı kumar filtresinden geçmiyor, duyuru geçiyor.
3. Ek okuma uçları (PM onaylı): `GET /integrations/providers` (açık sağlayıcılar), `GET /integrations/announce-guilds` (opt-in listesi).
4. `PUT /guilds/:id/stream-announce` her çağrıda webhook sahibini çağırana çevirir, AuditLog'a eski/yeni sahip yazılır.
   `@everyone` duyuru rolü olamaz.
5. Uzlaştırma işi **saatlik** (günlük değil). Yayın bilgisi okuma 5 deneme, ~110 sn; okunamazsa riskli.
6. Kick kapsamı yalnız `user:read` (Kick bunu "e-posta dahil" diye tanımlıyor; e-posta okunmaz, saklanmaz). Logolar Simple Icons (CC0).
