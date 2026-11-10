# SPRINT E1: 1-1 DM uçtan uca şifreleme (metin)

> Durum: **TASARIM KİLİTLİ (2026-11-10, sahip onayı).** PM compose (Opus). **core + api + web + mobil.**
> Yol haritası: E0 deneme ✅ → **E1 bu sprint** → E2 grup DM → E3 push/hızlı cevap → E4 şikâyet (franking) → E5 yedek → E6 medya → E7 doğrulama/yerel arama → E8 aramalar.
> 🔴 **R7 bölgesi, tamamı.** Hiçbir parça sahibin satır satır incelemesi olmadan main'e girmez.
> Başlangıç noktası: dal `spike/e2ee-mls` (e66659c). Deneme kodu üretime **kopyalanmaz**, referanstır.

## §0 Karar ve kapsam

**Sahip kararları (2026-11-05, 2026-11-10):** ortam kanalları hariç tüm DM'ler E2EE (1-1 + grup, minör dahil). Platform DM okumaz; şikâyet edilen mesaj şikâyetçinin cihazından iletilir (E4). Protokol **MLS (RFC 9420)**, suite 1 (`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`). Yeni cihazda geçmiş ilk sürümde yok, hedef şifreli yedek (E5). İlk sürümde yalnız metin; DM medyası bugünkü gibi düz kalır. Eski mesajlar kalır, sohbete "bu noktadan sonra şifreli" ayracı gelir.

**E1 kapsamı:** yalnız **1-1 DM**, yalnız **mesaj metni**, bayrak arkasında, yalnız izin listesindeki test kullanıcıları. Grup DM bu sprintte düz kalır (E2).

**Kapsam DIŞI (bilinçli, sonraki aşamalar):** grup DM (E2), push'ta mesaj önizlemesi ve hızlı cevap (E3; E1'de şifreli DM push'u genel metin taşır, §2.7), şikâyet içerik kanıtı (E4), yedek (E5), medya şifreleme (E6), güvenlik kodu ve yerel arama (E7), arama şifreleme (E8), gizlilik metni (E4 ile, herkese açılmadan önce).

**Herkese açma kapısı:** E1 + E2 + E3 + E4 tamamlanmadan bayrak izin listesi dışına açılmaz.

## §1 Çekirdek ilkeler (değişmez)

1. **Kripto kodunu kendimiz yazmayız.** MLS = `ts-mls` (sürüm **tam sabit**, `2.0.0-rc.16`; `^` yok). İlkeller = `@noble/*`. Tek istisna mobil HPKE sağlayıcısı (ilkelleri birleştirir, ilkel yazmaz); **RFC 9180 resmi test vektörleri** ile sınanır (suite 1'in kullandığı DHKEM(X25519)/HKDF-SHA256/AES-128-GCM base mode). Vektör testi geçmeden mobil parça merge edilmez.
2. **Tek çekirdek, iki istemci.** MLS işlemleri, yük biçimi, doğrulama kuralları tek bir pakette: `shared/e2ee-core/` (TS kaynak). Web Vite alias ile, mobil Metro `watchFolders` ile tüketir. İstemciler çekirdeği sarmalar, kopyalamaz. (Metro bunu kaldıramazsa dev DURUR, bildirir; geri dönüş kopya + bayt-eşitlik betiği, PM onayıyla.)
3. **Kütüphane ince katman arkasında.** Uygulama kodu `ts-mls` adını import etmez; yalnız `e2ee-core`'un kendi API'sini (§3.1). Kütüphane değişirse yalnız çekirdek değişir.
4. **Sunucu içerik görmez, sırayı tutar.** Sunucu: cihaz anahtarlarını dağıtır, ön anahtar (KeyPackage) verir, grup değişikliklerini (commit) epoch sırasına koyar, şifreli mesajı iletir. Hiçbir şifreli yükü açmaz, yorumlamaz.
5. **Geri düşme yok.** Bir DM bir kez şifreli olduysa düz metne dönmez. Sunucu şifreli kanala düz mesajı reddeder; istemci de göndermez.
6. **Her mesaj bir kez çözülür, yerelde saklanır.** MLS anahtarı kullanınca siler (E0 teyit). Çözülen metin cihazın şifreli yerel deposuna yazılır; ekran oradan okur. Bu hem hız (telefonda çözme ~70 ms) hem E5 yedeğinin kaynağı.
7. **MLS durumu tek kuyruktan geçer.** Bir cihazda aynı gruba ait iki işlem aynı anda çalışmaz (cihaz başı tek seri kuyruk). E3'te bildirim görevi de aynı kuyruğu kullanacak (tek JS ortamı C50'de ölçüldü).

## §2 API

Tüm uçlar envelope'lu (`{ success, statusCode, data }`), JWT korumalı. Baytlar JSON'da **base64** (standart, padding'li).

### §2.1 Şema
```prisma
model E2eeDevice {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  sessionId     String    @unique // oturum kapanınca/iptal edilince cihaz da iptal (§2.6)
  platform      String    // 'web' | 'android'
  signatureKey  Bytes     // MLS leaf imza açık anahtarı (Ed25519, 32 bayt)
  createdAt     DateTime  @default(now())
  lastSeenAt    DateTime  @default(now())
  revokedAt     DateTime?
  keyPackages   E2eeKeyPackage[]
  @@index([userId])
}
model E2eeKeyPackage {
  id          String    @id @default(cuid())
  deviceId    String
  device      E2eeDevice @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  data        Bytes     // serileştirilmiş KeyPackage (opak)
  lastResort  Boolean   @default(false)
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())
  @@index([deviceId, consumedAt])
}
model E2eeGroup {
  channelId   String    @id // 1 kanal = 1 MLS grubu
  groupId     Bytes     // MLS group_id (istemci üretir, 32 bayt rastgele)
  epoch       Int       // sunucunun kabul ettiği son epoch
  createdById String    // ilk grubu kuran cihaz (deviceId)
  createdAt   DateTime  @default(now()) // ayraç zamanı
}
model E2eeHandshake {
  id          String    @id @default(cuid())
  channelId   String
  epoch       Int       // bu commit'in uygulandığı epoch (kabulden önceki değer)
  senderDeviceId String
  commit      Bytes     // opak MLS commit
  createdAt   DateTime  @default(now())
  @@unique([channelId, epoch])
}
model E2eeWelcome {
  id            String   @id @default(cuid())
  channelId     String
  epoch         Int      // cihazın katılacağı epoch
  targetDeviceId String
  welcome       Bytes    // opak MLS Welcome
  ratchetTree   Bytes    // açık ağaç (E0 bulgusu: Welcome ile ayrıca iletilmeli)
  deliveredAt   DateTime?
  createdAt     DateTime @default(now())
  @@index([targetDeviceId, deliveredAt])
}
```
`Message`'a: `encrypted Boolean @default(false)`, `ciphertext Bytes?`, `senderDeviceId String?`. Şifreli mesajda `content = ''`, `mentions = []`.
Migration yaz, yerel DB'ye uygula, `prisma migrate status` temiz, `prisma generate`.

### §2.2 Bayrak ve uygunluk
- Config: `E2EE_ENABLED` (varsayılan **false**), `E2EE_USER_IDS` (virgüllü liste). Bir kullanıcı uygun ⇔ bayrak açık VE (liste boş VEYA listede). **Prod'a liste dolu gider; boş liste = herkes, §0 kapısından önce YASAK.**
- `GET /e2ee/status` → `{ enabled: boolean }` (çağıran kullanıcı için). İstemci cihaz kaydını yalnız `enabled` iken yapar.
- **Kanal şifreli olabilir mi:** kanal `type = DM` (1-1), iki üye de uygun, iki üyenin de en az bir aktif cihazı ve tüketilebilir KeyPackage'ı var. Bekleyen mesaj isteği (C9 `PENDING`) engel değil.

### §2.3 Cihaz ve KeyPackage
| Uç | Gövde / Dönüş | Kural |
|---|---|---|
| `POST /e2ee/devices` | `{ platform, signatureKey }` → `{ deviceId }` | Oturum başına tek cihaz (`sessionId` çağıranın oturumu, JWT'den). Aynı oturumla tekrar → mevcut cihaz döner ve `signatureKey` aynı olmalı, değilse 409 `E2EE_DEVICE_KEY_MISMATCH`. Kullanıcı başı en çok 10 aktif cihaz → 422 `E2EE_DEVICE_LIMIT`. |
| `POST /e2ee/devices/me/key-packages` | `{ keyPackages: string[], lastResort?: string }` → `{ available }` | Yalnız kendi cihazına. Tek çağrıda ≤ 50. Bekleyen tüketilmemiş ≤ 100. `lastResort` gelirse eskisinin yerine geçer. |
| `GET /e2ee/users/:userId/devices` | → `[{ deviceId, platform, signatureKey, createdAt }]` (aktifler) | Yalnız çağıranla **ortak bir DM kanalı** olan kullanıcı için (ya da kendisi). Aksi 403. |
| `POST /e2ee/channels/:channelId/key-packages/claim` | `{ deviceIds: string[] }` → `[{ deviceId, keyPackage }]` | Çağıran kanal üyesi; hedef cihazlar kanal üyelerine ait. Her cihaz için bir tüketilmemiş KeyPackage **atomik** tüketilir (`UPDATE ... WHERE consumedAt IS NULL` tek satır); yoksa `lastResort` (tüketilmez). İkisi de yoksa o cihaz listede yok. Throttle: kullanıcı başı dakikada 30. |

İstemci, tüketilmemiş KeyPackage sayısı 10'un altına inince 20'ye tamamlar (sayı `GET /e2ee/devices/me` → `{ available }`).

### §2.4 Grup kurma ve değişiklikler
| Uç | Gövde | Kural |
|---|---|---|
| `GET /e2ee/channels/:channelId` | → `{ encrypted, epoch, groupId, createdAt, members: [{ userId, deviceIds }] }` | `members` = kanal üyelerinin **aktif** cihazları (istemci gruptaki yaprakları buna göre doğrular, §3.3). Şifreli değilse `encrypted:false, epoch:null`. |
| `POST /e2ee/channels/:channelId/group` | `{ groupId, commit, welcomes: [{ deviceId, welcome, ratchetTree }] }` | Grubu kurar (epoch 0'dan 1'e). §2.2 kuralı sağlanmalı, yoksa 422 `E2EE_NOT_ELIGIBLE`. Grup zaten varsa 409 `E2EE_GROUP_EXISTS` (iki taraf aynı anda kurarsa kaybeden, kazananın Welcome'ını bekler). Tek transaction: `E2eeGroup` + `E2eeHandshake(epoch 0)` + Welcome'lar. |
| `POST /e2ee/channels/:channelId/commits` | `{ epoch, commit, welcomes?: [...] }` | Kabul ⇔ `epoch === group.epoch`; kabulde `group.epoch++` (tek satır koşullu `UPDATE`, yarış güvenli). Aksi 409 `E2EE_EPOCH_CONFLICT` + `{ currentEpoch }`: istemci eksik commit'leri çeker, uygular, kendi değişikliğini gerekiyorsa yeniden üretir (E0 teyit). |
| `GET /e2ee/channels/:channelId/commits?since=N` | → `[{ epoch, commit, senderDeviceId }]` | Epoch sırasıyla, en çok 100. |
| `GET /e2ee/welcomes` | → `[{ id, channelId, epoch, welcome, ratchetTree }]` | Çağıran cihazın bekleyenleri. `POST /e2ee/welcomes/:id/ack` → `deliveredAt`. |

**Kim ekler/çıkarır (E1, 1-1):** grubu ilk mesajı gönderecek cihaz kurar; kanaldaki tüm aktif cihazları (kendi diğer cihazları dahil) ekler. Sonradan cihaz eklenince ya da iptal edilince sunucu kanaldaki üyelere `e2ee:devices-changed` yayar; **çevrimiçi olan herhangi bir üye cihaz** eksik cihazı ekleyen / iptal edileni çıkaran commit'i gönderir. Yarışı epoch kuralı çözer (biri kazanır, diğeri commit'i işleyince farkın kapandığını görür).

### §2.5 Mesaj
- `POST /channels/:id/messages` (mevcut uç): `CreateMessageDto`'ya isteğe bağlı `ciphertext?: string` (base64, ≤ 32 KB), `epoch?: number`. Şifreli kanalda: `ciphertext` zorunlu, `content` **verilmemeli** → aksi 409 `E2EE_REQUIRED`. Şifresiz kanalda `ciphertext` gelirse 422 `E2EE_NOT_ENCRYPTED`. `attachmentIds` şifreli kanalda da geçerli (medya düz kalır, §0). `replyToId` düz üst veri.
- `senderDeviceId` = çağıranın oturumundaki cihaz; cihazı yoksa ya da iptalse 403 `E2EE_DEVICE_REQUIRED`.
- Mesaj DTO'su (liste + `message.created` yayını): şifreli mesajda `content: ''`, `encrypted: true`, `ciphertext` (base64), `senderDeviceId`. Diğer alanlar değişmez.
- `PATCH /channels/:id/messages/:messageId`: şifreli mesajda `ciphertext` ile, aynı kurallar. Silme, sabitleme, tepki aynen (tepki emojisi düz üst veri).
- **Arama:** şifreli mesajlar sunucu aramasına girmez (`content = ''` zaten eşleşmez; yine de sorguya `encrypted = false` koşulu ekle).
- **Automod:** DM'de zaten yok, değişiklik yok.
- **Yönlendirme (C30):** istemci işi; şifreli kanala giden yönlendirme istemcide şifrelenir.

### §2.6 Oturum ve cihaz iptali
Oturum çıkışı, "oturumlarım"dan kapatma, parola değişimiyle toplu iptal, hesap silme: bağlı `E2eeDevice.revokedAt` aynı transaction'da dolar, tüketilmemiş KeyPackage'ları silinir, kullanıcının DM kanallarına `e2ee:devices-changed` yayılır. İptal edilmiş cihaz hiçbir `/e2ee` ucunu çağıramaz. 🔴 Bu satırlar auth katmanına dokunur, R7.

### §2.7 Gerçek zamanlı ve push
- Soket: `e2ee:commit` `{ channelId, epoch }` (kanal odasına), `e2ee:welcome` `{ channelId }` (hedef kullanıcının kişisel odasına), `e2ee:devices-changed` `{ channelId, userId }`.
- Push (E1): şifreli DM'de v2 `text` = sabit `"🔒 Yeni mesaj"` (i18n anahtarı api tarafında), v1'de aynı gövde. Gönderen adı ve avatar bugünkü gibi. E3 bunu şifreli yükle değiştirecek.

### §2.8 Testler (api)
KeyPackage atomik tüketim (iki eşzamanlı claim aynı paketi alamaz); lastResort tüketilmez; claim yetkisi (ortak DM yok → 403); grup kurma yarışı (ikincisi 409); epoch çakışması (409 + `currentEpoch`); şifreli kanala düz mesaj 409; şifresiz kanala ciphertext 422; iptal cihaz 403; oturum iptali cihazı iptal eder; bayrak kapalıyken tüm `/e2ee` uçları 404 `E2EE_DISABLED`; arama şifreli mesajı döndürmez; mevcut mesaj spec'leri değişmeden geçer.
DoD: spec'ler yeşil, `prisma generate` + `tsc -p tsconfig.build.json` temiz, `migrate status` temiz.

## §3 Çekirdek: `shared/e2ee-core/`

### §3.1 API (istemcinin gördüğü tek yüz)
`createDevice()`, `exportKeyPackages(n)`, `createGroup(members)`, `joinFromWelcome(welcome, ratchetTree)`, `addDevices(keyPackages)`, `removeDevices(deviceIds)`, `processCommit(commit)`, `encrypt(payload)`, `decrypt(ciphertext)`, `serialize()/deserialize()`. Hepsi saf; ağ ve depolama çekirdekte YOK (istemci verir). Kripto sağlayıcısı enjekte edilir (web: varsayılan WebCrypto; mobil: saf noble).

### §3.2 Şifreli yük biçimi (sürümlü)
MLS uygulama mesajının düz içeriği UTF-8 JSON: `{ "v": 1, "t": "text", "body": string, "sentAt": number }`. Bilinmeyen `v` → "Bu mesajı görmek için uygulamayı güncelle". E4 franking alanı `v: 2` ile eklenecek.

### §3.3 Doğrulama kuralları (çekirdekte, zorunlu)
- Credential: `BasicCredential`, kimlik = `deviceId` (UTF-8). **Test kimlik doğrulama servisi üretimde YASAK.**
- Gruptaki her yaprak: `deviceId` sunucunun `members` listesinde VE yaprağın imza anahtarı o cihazın kayıtlı `signatureKey`'i ile bayt-bayt aynı. Değilse commit/Welcome **reddedilir** ve kullanıcıya "Bu sohbette tanınmayan bir cihaz var" uyarısı gösterilir (mesajlaşma durur, sessizce devam etmez).
- Gelen uygulama mesajında gönderen yaprağın `deviceId`'si, sunucunun bildirdiği `senderDeviceId` ile aynı olmalı.

### §3.4 Testler (çekirdek)
E0 senaryolarının üretim API'siyle karşılığı (1-1 iki cihazlı, cihaz ekleme/çıkarma, serileştirme, epoch çakışması, sırasız mesaj, tekrar çözme reddi), §3.3 reddi (sahte yaprak, anahtar uyuşmazlığı), web sağlayıcı ↔ mobil sağlayıcı çapraz uyum, **RFC 9180 vektörleri**.

## §4 Web (masaüstü dahil, aynı kod)

- **Yerel depo:** IndexedDB. Depo anahtarı = WebCrypto AES-GCM, **çıkarılamaz** (`extractable: false`) `CryptoKey`, IndexedDB'de saklanır. MLS durumu, cihaz imza anahtarı ve çözülmüş mesajlar bu anahtarla şifreli yazılır. Çıkışta tüm depo silinir.
- **Akış:** girişte `GET /e2ee/status` → açıksa cihaz kaydı + KeyPackage yükleme. DM açılınca `GET /e2ee/channels/:id`; şifreli değilse ve uygunsa ilk mesajda grup kurulur. Gelen şifreli mesaj → çöz → depoya yaz → ekranda göster. Ekran listesi şifreli mesajlar için depodan okur.
- **Görünüm:** şifreli bölümün başında ayraç: "Bu noktadan sonra mesajlar uçtan uca şifreli". Çözülemeyen (cihaz sonradan eklendi): "Bu mesaj bu cihaz eklenmeden önce gönderildi". Bilinmeyen sürüm: "Görmek için uygulamayı güncelle". DM başlığında küçük kilit simgesi. Şifreli DM'de arama kutusu: "Şifreli mesajlar bu cihazda henüz aranamıyor" (E7). Yanıt alıntısı depodan; yoksa "Şifreli mesaj".
- Tüm metinler `vue-i18n`'de (`{'@'}` kaçışını unutma).
- **Bilinen sınır (dürüst):** web istemcisinin kodu sunucudan gelir; web'de E2EE güvencesi mobilden zayıftır. Gizlilik metninde (E4) yazılır.

## §5 Mobil

- **Bağımlılıklar:** `ts-mls@2.0.0-rc.16` (tam), `@noble/curves`, `@noble/hashes`, `@noble/ciphers` (tam sürüm), `expo-crypto` (rastgele sayı; **yeni native derleme**), `expo-sqlite`. Native değişiyor: önce yerel prebuild + gradlew, kısa yol kopyasında `modules/*/android` dahil kopyalanır (E0 tuzağı), sonra EAS/AAB. versionCode elle artar.
- **Yerel depo:** `expo-sqlite`; satır içerikleri depo anahtarıyla AES-GCM şifreli (noble). Depo anahtarı `expo-secure-store`'da (Android Keystore korumalı). Çıkışta silinir.
- **Rastgelelik:** `crypto.getRandomValues` yalnız `expo-crypto` ile; `Math.random` tabanlı hiçbir yol kripto için kullanılmaz (livekit `randomUUID` polyfill'i dahil). Uygulama açılışında polyfill yoksa E2EE başlamaz, hata loglanır.
- **Görünüm:** §4 ile aynı metinler ve davranış (mobil i18n).
- **Toplu çözme:** sohbete girince ekrandaki mesajlar önce, kalanlar arka arkaya; arayüz donmaz (her mesaj arasında olay döngüsüne dön). Hedef: 50 mesaj ekranda ilk 10'u < 1 sn.
- Bildirim görevi E1'de çözme YAPMAZ (§2.7 genel metin), E3'ün işi.

## §6 Uygulama sırası ve teslim

1. `shared/e2ee-core` + testleri (RFC 9180 dahil) → **R7 incelemesi 1**
2. api (§2) + spec'ler → **R7 incelemesi 2**
3. web (§4) → web ↔ web iki tarayıcı denemesi
4. mobil (§5) → web ↔ telefon, telefon ↔ telefon denemesi (sahip cihazı + mümkünse ikinci marka)
5. **R7 incelemesi 3** (istemci akışları) → merge, prod'a bayrak açık + izin listesi yalnız sahip ve test hesapları.

**Cihaz turu DoD (sahip):** iki hesap, A'da web + telefon, B'de telefon: ilk mesajda grup kurulur, üç cihaz da çözer; A yeni tarayıcıda giriş yapınca o cihaz eklenir, eski mesajları "bu cihaz eklenmeden önce" görür, yenileri çözer; A bir oturumu kapatınca o cihaz gruptan çıkar ve yeni mesajı alamaz; uygulama kapatılıp açılınca geçmiş yerelden gelir; şifreli DM'de düz gönderim mümkün değil (sunucu reddeder); izin listesi dışı kullanıcıyla DM düz kalır.

## §7 Açık sorular (PM önerisiyle, sahip itiraz etmezse geçerli)
- **Masaüstü (Electron):** web koduyla aynı, IndexedDB. Electron `safeStorage` ile güçlendirme sonra (borç D-E2EE-1).
- **ts-mls 2.0 kararlı sürümü:** çıkınca geçilir, çekirdek testleri koşulur. Lansmandan önce bağımsız güvenlik incelemesi değerlendirilir (bütçe kararı, sahipte).
