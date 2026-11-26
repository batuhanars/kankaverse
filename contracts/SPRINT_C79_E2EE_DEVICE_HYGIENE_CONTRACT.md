# Sprint C79 — E2EE cihaz hijyeni (sınır dolunca boştaki cihazı çıkar, süresi dolan oturum temizliği)

> 2026-11-26 · api + shared + web + mobile · 🔴 R7 (oturum + E2EE cihaz yaşam döngüsü): dev commit ETMEZ, diff sahibe sunulur.
> Envelope: tüm uçlar `{ success, statusCode, data }` (kök CLAUDE.md).

## 0. Sorun ve teşhis

Bir cihazda E2EE tamamen kayboluyor: yedek ve güvenlik kimliği bölümleri görünmüyor, mesajlar şifreli kalıyor.
Telefon logu: `422 E2EE_DEVICE_LIMIT POST /e2ee/devices`. Hesabın 10 etkin cihaz sınırı dolu.

Kodda oturumu bitiren her yol (çıkış, Oturumlarım, parola/e-posta değişimi, çalınmış token, hesap silme) cihazı doğru iptal
ediyor. Sızıntı, hiç kapatılmayan oturumlardan geliyor: uygulama kaldırılıyor, verisi siliniyor ya da gizli pencere
kapanıyor, ama çıkış yapılmıyor. Sunucuda oturum açık kalıyor ve cihaz "etkin" sayılmaya devam ediyor.

Canlı teşhis (salt okunur sorgu, 2026-11-26):
- `yetim` (ailesinde hiç açık oturum yok) = 0, `suresi_dolmus` (30 günden eski) = 0.
- Sınırdaki hesap: 9 `canli` + 1 `park`. Hepsinin son 30 gün içinde yenilenmiş açık oturumu var. Sunucu bunları
  kullanılan cihazdan ayıramıyor.

**Sonuç:** sorunu yalnız bir temizlik işi çözmez, sınır dolunca ne olacağı tanımlanmalı. Sahip kararı (2026-11-26):
**sınır dolunca en uzun süredir kullanılmayan cihaz çıkarılır**, ama yalnız 7 gündür hiç kullanılmamışsa.

Aynı fiziksel telefonun her yeni kurulumunun yeni cihaz olması **doğru** ve değişmiyor: anahtar kurulumla birlikte gider,
eski kayıt yeniden kullanılamaz. Donanım kimliğiyle cihaz tanıma YAPILMAZ (parmak izi, KVKK).

## 1. Tanımlar

- **Cihaz etkinliği** (`activityAt`):
  - Park edilmemiş cihaz: `max(device.lastSeenAt, ailesindeki açık oturumların max(lastActiveAt))`.
    `lastSeenAt` uygulama her açıldığında (kayıt çağrısı) güncellenir. `lastActiveAt` her token yenilemede güncellenir;
    uygulama açık kaldıkça yaklaşık 15 dakikada bir.
  - Park edilmiş cihaz: `max(device.lastSeenAt, device.parkedAt)`.
- `E2EE_EVICT_IDLE_DAYS = 7`: bundan yakın etkinliği olan cihaza **asla** dokunulmaz.
- `SESSION_DEAD_AFTER_DAYS = 31`: yenileme tokeni 30 gün geçerli, 1 gün pay bırakılır. Bu süreden eski aile geri gelemez.

## 2. api

### 2.1 Kayıtta çıkarma (`E2eeDevicesService.register`)

Mevcut akış aynı kalır: aynı aileye kayıtlı cihaz varsa döndürülür. Yeni cihaz kaydında etkin cihaz sayısı
`>= E2EE_MAX_ACTIVE_DEVICES` ise:

1. Kullanıcının etkin cihazlarının `activityAt` değeri hesaplanır. Çağıranın kendi ailesinin henüz cihazı yoktur.
2. Aday: `activityAt <= now - 7 gün` olan cihazlar içinde `activityAt`'i en eski olan. **Aday yoksa** bugünkü gibi
   `422 E2EE_DEVICE_LIMIT` döner.
3. Aday varsa **tek transaction'da**:
   - Adayın ailesi varsa ailenin açık oturumları kapatılır (`revokedAt`). O kurulum bir daha açılırsa giriş ekranına düşer.
   - Aday cihaz `deviceRevokeOps` ile iptal edilir (KeyPackage'lar silinir, `revokedAt` yazılır).
   - Yeni cihaz oluşturulur.
   - `auditLog` satırı yazılır: `e2ee.device.evict`, `entityId` = çıkarılan cihaz.
4. Commit'ten sonra `notify.devicesChanged(userId)` çağrılır. Gruplar çıkarılan cihazı bugünkü iptalle aynı yoldan düşürür.
5. Yanıt eklemeli (geriye uyumlu): `{ deviceId, evicted: { platform, label, activityAt } | null }`.

Eşzamanlı iki kayıt en kötü ihtimalle iki aday çıkarır, bu kabul edilir. Aynı ailenin yarışını mevcut P2002 dalı çözer.

### 2.2 Cihaz etiketi

- `E2eeDevice.label String?` (migration). Kayıtta çağıranın oturumundaki `Session.device` değerinden yazılır,
  en çok 100 karakter (ör. "Android - <üretici model>"). Eski satırlar null kalır.
- `GET /e2ee/users/:userId/devices`: **yalnız `userId === çağıran` iken** her satıra `label` ve `activityAt` eklenir.
  Başkasının cihaz listesinde bu alanlar **hiç bulunmaz**. Sohbet ettiğin kişi cihaz modelini ve son kullanım
  zamanını görmez (gizlilik). Bunu spec kilitler.

### 2.3 Süresi dolan oturum temizliği (auth)

- `SessionSweepJob.sweep(now)` (`auth/session-sweep.job.ts`; AuthService zaten çok büyük): açık oturumlarının `max(lastActiveAt)` değeri `now - 31 gün`den eski olan aileleri
  bulur ve mevcut `revokeWithDevices({ families })` ile kapatır (oturum + cihaz + yayın). İşlem en çok 200 ailelik
  partiler hâlinde yapılır.
- Günlük iş (`@Cron` 04:00): hata loglanır, süreç düşmez. Etki: Oturumlarım'da artık ölü oturum listelenmez,
  park dışı ölü cihaz da birikmez. Bugünkü verinin hepsi bu sınırın içinde olduğu için anlık etkisi yok. Çıkış
  yapılmadan bırakılan kurulumlar, 31 günü dolunca bu işle temizlenir.

## 3. shared (`@kankaverse/e2ee-client`)

- `ports.registerDevice` yanıt tipi: `{ deviceId: string; evicted?: EvictedDevice | null }`.
- `userDevices` satırına isteğe bağlı `label?: string | null` ve `activityAt?: string` eklenir.
- `OwnDeviceView`'e `label: string | null` ve `activityAt: string | null` eklenir; `ownDevices()` bunları geçirir.

## 4. web

- `api/e2ee.ts` `registerDevice`: yanıtta `evicted` varsa toast gösterilir:
  `e2ee.devices.evicted` = "Yer açmak için uzun süredir kullanılmayan bir cihazının ({device}) oturumu kapatıldı."
  `{device}` = etiket varsa etiket, yoksa platform adı.
- `stores/e2ee.ts`: `init` hatası `E2EE_DEVICE_LIMIT` ise `deviceLimit = true` yapılır ve bir kez toast gösterilir.
  Bu yalnız 7 gün içinde kullanılmış 10 cihaz varken olur.
- Ayarlar → Hesap: `deviceLimit` iken Oturumlar satırının altında uyarı kutusu çıkar:
  `e2ee.devices.limitTitle` + `e2ee.devices.limitBody`. "Oturumları aç" düğmesi oturum penceresini açar.
  Uyarı kutusu `components/E2eeDeviceLimitNotice.vue` dosyasında.
- Güvenlik kimliği listesi: satırda platform yerine `label` (yoksa platform) gösterilir; altında
  `e2ee.devices.lastActive` ("Son kullanım: {ago}") yazar.

## 5. mobile

- `e2ee/mobileApi.ts` `registerDevice`: aynı `evicted` toast'u (`showToast`).
- `stores/e2ee.ts`: `deviceLimit` alanı + bir kez toast.
- `account-security.tsx`: `deviceLimit` iken Oturumlar satırının altında aynı uyarı metni; dokununca `/security-sessions`.
- `identity-settings.tsx`: etiket + son kullanım (web ile aynı).

## 6. i18n (`web/src/i18n/tr.json`, `e2ee.devices.*`)

`evicted`, `limitTitle`, `limitBody`, `openSessions`, `lastActive`.

## 7. Doğrulama

- api spec:
  - Sınır dolu + 7 günden eski aday varsa: en eski çıkarılır, ailesinin oturumları kapanır, KeyPackage'ları silinir,
    audit yazılır, yeni cihaz oluşur, yanıtta `evicted` döner.
  - Aday yoksa (hepsi 7 gün içinde kullanılmış) 422 döner ve hiçbir şey değişmez.
  - Park cihazın etkinliği `parkedAt`'ten hesaplanır.
  - Başkasının cihaz listesinde `label` ve `activityAt` YOKTUR; kendi listende vardır.
  - `sweepDeadSessions`: 31 günden eski aile kapanır, cihazı iptal edilir; 31 günden yeni aileye dokunulmaz.
- `tsc -p tsconfig.build.json`, jest, `prisma generate`, migration yerelde uygulanır, `migrate status` temiz.
- web: `vue-tsc -b` (bilinen 6 hata), dokunulan dosyalarda eslint, `vite build`. mobil: typecheck + eslint.
- Sahip turu: yerelde bir test hesabına 10 cihaz kaydı, bir cihazın etkinliği 8 gün geriye alınır, yeni girişte
  çıkarma toast'u görülür ve E2EE açılır. Etkinlikler 7 günden yeniyken uyarı kutusu görülür.

## 8. Kapsam dışı

- Sınırı yükseltmek (10 kalır).
- Cihazın kendi oturumunu kendiliğinden kapatması: kaldırılan uygulama zaten bir şey çalıştıramaz.
- Oturumlarım ekranının yeniden tasarımı.
