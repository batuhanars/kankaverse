# Sprint 2B Contract — 2FA, Oturum Yönetimi, Hassas İşlemler & Hesap Silme

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli.
>
> **R7 — TAMAMI insan incelemesi.** Bu sprint baştan sona auth/oturum + hesap güvenliği. Her diff satır satır
> kullanıcı onayından geçer (brief §8, R7). 2A'nın devamı; 2A endpoint'leri değişmez (login HARİÇ — §5.2).

---

## 1. Hedef

Hesap güvenliği self-servis katmanı:
1. **2FA TOTP** — kurulum (QR), login'de ikinci adım, tek-kullanım kurtarma kodları. Altyapı + **herkese opsiyonel**
   (admin'e zorunlu enforce sonraya, bayrakla — bu sprint değil).
2. **Oturumlarım** — aktif session listesi, tekil/toplu çıkış, yeni-cihaz e-posta bildirimi.
3. **Hassas işlem reauth** — şifre değişimi, e-posta değişimi, 2FA kapatma, hesap silme → şifre (+ varsa TOTP) ister.
4. **E-posta değişimi** — yeni adrese doğrulama + eski adrese bildirim & geri-al linki.
5. **Hesap silme (gated)** — talep → reauth → deaktivasyon → 30 gün grace (giriş = iptal) → **kalıcı purge KAPALI**
   (R6 KVKK hukuk onayına kadar job no-op; mekanizma kurulu, geri-döndürülemez imha bayraklı).
6. **Zamanlanmış job** (`@nestjs/schedule`) — 30-gün purge (gated) + `isMinor` 18-yaş güncellemesi.

**Kapsam dışı:** admin'e zorunlu 2FA enforce, gerçek kalıcı purge (legal sonrası), SMS 2FA (brief: bilinçli YOK).

---

## 2. Prisma Modelleri (2B deltası)

```prisma
model User {
  // ... mevcut alanlar değişmez ...
  twoFactorEnabled    Boolean        @default(false)
  totpSecret          String?        // AES-256-GCM şifreli (düz ASLA saklanmaz)
  deletionRequestedAt DateTime?      // silme talebi anı; 30 gün grace başlangıcı (deaktivasyon işareti)
  recoveryCodes       RecoveryCode[]
}

model RecoveryCode {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  codeHash  String    // SHA-256(code) — yüksek entropili kod, deterministik lookup
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  @@index([userId])
}

enum AuthTokenType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
  EMAIL_CHANGE        // YENİ: yeni adrese gönderilen doğrulama
  EMAIL_CHANGE_UNDO   // YENİ: eski adrese gönderilen geri-al
}
```

> `AuthToken` (2A) yeniden kullanılır; `EMAIL_CHANGE`'de `AuthToken`'a hedef e-postayı taşımak için bir alan
> gerekir → `AuthToken`'a opsiyonel `payload String?` eklenir (yeni e-posta adresi burada tutulur).

**Güvenlik kuralları (R7):**
- `totpSecret`: **AES-256-GCM**, anahtar env `TOTP_ENC_KEY` = **32 byte base64** (`openssl rand -base64 32` → 44 karakter;
  `Buffer.from(TOTP_ENC_KEY, 'base64')` → 32 byte). **Boot'ta uzunluk doğrulanır: ≠32 byte → fail-fast.** Şifreli çıktının
  saklama formatı `iv:authTag:ciphertext` (hepsi base64). Çöz yalnız doğrulama anında, bellekte.
  `crypto.util.ts`: `encryptSecret`/`decryptSecret`.
- `RecoveryCode`: 10 adet, kurulumda üretilir, **bir kez gösterilir**, SHA-256 hash'li saklanır, tek-kullanım.
- Kurtarma kodu entropisi: 10 byte rastgele → base32, `XXXX-XXXX-XXXX-XXXX` (80-bit; SHA-256 lookup yeterli).

---

## 3. Sabitler

- TOTP: 6 hane, 30 sn periyot, ±1 pencere tolerans (otplib varsayılan). Issuer label: "Kankaverse".
- 2FA login challenge token TTL: **5 dk** (kısa ömür, tek amaç).
- `EMAIL_CHANGE` / `EMAIL_CHANGE_UNDO` token TTL: **24 saat**.
- Hesap silme grace: **30 gün**.
- Rate limit: `login/2fa` **5/dk/IP** (6-hane brute-force), `2fa/setup|enable|disable` 10/saat, `email/change` 5/saat,
  `account/delete` 3/saat. Mevcut global throttler üzerinden `@Throttle`.

---

## 4. DTO Şekilleri (paylaşılan)

```typescript
// UserDto — 2B EK alan
interface UserDto {
  // ... 2A alanları (emailVerified dahil) ...
  twoFactorEnabled: boolean;   // YENİ
}

interface SessionDto {
  id: string; device: string | null; ip: string | null;
  lastActiveAt: string; createdAt: string; current: boolean;   // current: bu istekteki session mı
}

// 2FA kurulum başlangıcı
interface TwoFactorSetupDto { otpauthUrl: string; qrDataUrl: string; secret: string; }  // secret bir kez
// 2FA etkinleştirme dönüşü
interface RecoveryCodesDto { codes: string[]; }   // bir kez gösterilir
// login 2FA gerektiriyorsa
interface LoginChallengeDto { twoFactorRequired: true; challengeToken: string; }
```

---

## 5. HTTP Endpoint İmzaları

> Envelope `{ success, statusCode, data }`. Reauth gerektirenler body'de `currentPassword` (+ 2FA açıksa `totpCode`).
> Reauth doğrulaması paylaşılan private `verifyReauth(userId, currentPassword, totpCode?)` ile (yanlışsa 401 INVALID_CREDENTIALS).

### 5.1 2FA (`/auth/2fa`)
- **POST `/auth/2fa/setup`** — (auth, reauth) → `200 { data: TwoFactorSetupDto }`. TOTP secret üretir, **şifreli pending**
  saklar (`twoFactorEnabled` hâlâ false), otpauth URL + QR döner. Zaten açıksa `409 TWO_FACTOR_ALREADY_ENABLED`.
- **POST `/auth/2fa/enable`** — (auth) Body `{ code }` → pending secret'a karşı TOTP doğrula → `twoFactorEnabled=true`,
  **10 kurtarma kodu üret + döndür** (`200 { data: RecoveryCodesDto }`, bir kez). Kod yanlış → `400 INVALID_TWO_FACTOR_CODE`.
- **POST `/auth/2fa/disable`** — (auth, reauth: password + `totpCode`) → `twoFactorEnabled=false`, `totpSecret=null`,
  kurtarma kodları silinir → `200 { data: null }`. **AuditLog** alanı yoksa (Sprint 4) şimdilik log.

### 5.2 Login (mevcut endpoint — DEĞİŞİR, R7)
- **POST `/auth/login`** — şifre doğru + `twoFactorEnabled` ise: **session AÇMAZ**, `200 { data: LoginChallengeDto }`
  döner (challengeToken = 5dk, payload `{ sub, twoFactorChallenge:true }`, access secret ile imzalı). 2FA yoksa
  davranış 2A ile aynı (user + accessToken + refresh cookie).
- **POST `/auth/login/2fa`** — Body `{ challengeToken, code }` → challenge doğrula (geçerli/süreli/`twoFactorChallenge`),
  `code`'u **TOTP veya kurtarma kodu** olarak doğrula (kurtarma kodu → SHA-256 lookup + `usedAt` set) → session aç
  (user + accessToken + refresh cookie). Hata: `400 INVALID_TWO_FACTOR_CODE`, `401 INVALID_REFRESH` (challenge süresi).
  **R7:** `JwtStrategy` `twoFactorChallenge` taşıyan token'ı access olarak **reddeder** (challenge ≠ access).

### 5.3 Oturumlar (`/auth/sessions`)
- **GET `/auth/sessions`** — (auth) → `200 { data: SessionDto[] }` (revoke edilmemiş; `current` işaretli).
- **DELETE `/auth/sessions/:id`** — (auth) ilgili session revoke → `200 { data: null }`. Başkasının session'ı → `404 SESSION_NOT_FOUND`.
- **POST `/auth/sessions/revoke-others`** — (auth) mevcut hariç tüm session revoke → `200 { data: null }`.

### 5.4 Şifre / E-posta değişimi
- **POST `/auth/password/change`** — (auth, reauth) Body `{ currentPassword, totpCode?, newPassword }` → hash güncelle +
  **mevcut hariç tüm oturumları düşür** → `200 { data: null }`. Zayıf şifre `422 VALIDATION_FAILED`.
- **POST `/auth/email/change`** — (auth, reauth) Body `{ currentPassword, totpCode?, newEmail }` → yeni e-posta boşsa/alınmışsa
  `409 EMAIL_TAKEN`; `EMAIL_CHANGE` token (payload=newEmail) **yeni adrese** + `EMAIL_CHANGE_UNDO` bildirimi **eski adrese**
  gönderilir. E-posta henüz değişmez → `200 { data: null }`.
- **POST `/auth/email/change/confirm`** — Body `{ token }` → `EMAIL_CHANGE` doğrula → e-postayı `payload`'a güncelle,
  `emailVerifiedAt=now` → `200 { data: { user: UserDto } }`. Hata `400 INVALID_TOKEN`.
- **POST `/auth/email/change/undo`** — Body `{ token }` → `EMAIL_CHANGE_UNDO` doğrula → e-postayı eskiye döndür +
  **tüm oturumları düşür** (ele geçirme senaryosu) → `200 { data: null }`.

### 5.5 Hesap silme (gated)
- **POST `/auth/account/delete`** — (auth, reauth) → `deletionRequestedAt=now`, **tüm oturumları düşür** →
  `200 { data: null }`. Hesap deaktive: `deletionRequestedAt != null` iken `me`/korumalı uçlar `403 ACCOUNT_DELETION_PENDING`.
- **Grace'te giriş = iptal:** `deletionRequestedAt != null` kullanıcı başarılı login yaparsa `deletionRequestedAt=null`
  (reaktivasyon) ve normal session açılır (brief §8).
- **POST `/auth/account/delete/cancel`** — (auth, deaktif oturum istisnası) → `deletionRequestedAt=null` → `200 { data: null }`.

---

## 6. EmailService Ekleri (2A SharedModule)

- `sendNewDeviceEmail(to, deviceInfo)` — yeni cihaz/IP'den girişte.
- `sendEmailChangeVerification(toNew, link)` + `sendEmailChangeUndo(toOld, link)`.
- Yeni-cihaz tespiti: login'de kullanıcının mevcut (revoke edilmemiş) session'larında bu `ip`/`device` daha önce
  görülmemişse "yeni cihaz" → bildirim. Basit heuristik (V1 yeterli).
- Konsol fallback (2A deseni) korunur.

---

## 7. Zamanlanmış İşler (`@nestjs/schedule` — yeni bağımlılık, PM onaylı)

- `ScheduleModule.forRoot()` `app.module`'e. Job'lar `common/jobs/` (veya ilgili modül) altında `@Cron`.
- **`isMinor` 18-yaş job** (günlük): `birthDate`'i 18'i geçmiş + `isMinor:true` kullanıcıları `isMinor:false` yapar
  (`calculateIsMinor` util'i — denetim sonrası `birthdate.util.ts`'te). Minor kısıtları kullanıcı kontrolünde kalır (otomatik gevşetme yok).
- **30-gün purge job** (günlük, **GATED**): `deletionRequestedAt < now-30g` kullanıcıları bulur; **legal-hold hook**
  (Sprint 4 Report gelince gerçek kontrol; şimdilik no-op = "tutma yok") → **kalıcı imha BAYRAKLA KAPALI**:
  şimdilik yalnız `logger.log("purge adayı: <id>")`. Gerçek anonimleştirme/silme R6 KVKK onayı + `PURGE_ENABLED` env ile açılır.

---

## 8. UI Yerleşim (web)

- **Ayarlar → Güvenlik ekranı** (`views/settings/security`): 2FA kurulum (QR göster → kod gir → etkinleştir → kurtarma
  kodlarını **bir kez** göster/indir), 2FA kapat (reauth), şifre değiştir, e-posta değiştir, **oturumlarım** (liste +
  tekil/toplu çıkış), **hesabı sil** (reauth + onay diyaloğu + "30 gün içinde girersen iptal" uyarısı).
- **Login 2FA adımı:** `twoFactorRequired` dönerse kod ekranı (TOTP veya "kurtarma kodu kullan") → `login/2fa`.
- **Reauth modalı** (paylaşılan): hassas işlem öncesi şifre (+ 2FA açıksa kod) ister.
- **E-posta değişim landing'leri:** `/email/change/confirm`, `/email/change/undo` (token query).
- **Deaktif/grace uyarısı:** silme talebi sonrası girişte "hesabın silinmek üzere — iptal et?" akışı.
- Tüm metin `i18n/tr.json`; yeni hata kodları map'e.

---

## 9. Hata Kodları — 2B ekleri

`TWO_FACTOR_ALREADY_ENABLED` (409), `TWO_FACTOR_NOT_ENABLED` (409), `INVALID_TWO_FACTOR_CODE` (400),
`SESSION_NOT_FOUND` (404), `ACCOUNT_DELETION_PENDING` (403). Reauth hatası mevcut `INVALID_CREDENTIALS` (401);
e-posta çakışması mevcut `EMAIL_TAKEN`; token mevcut `INVALID_TOKEN`.

---

## 10. DoD & Açık Sorular

**DoD (Sprint 2B):**
- [ ] 2FA kur → QR → kod ile etkinleştir → kurtarma kodları bir kez; login artık 2 adım (challenge → kod).
- [ ] Kurtarma kodu ile login çalışıyor + kod tek-kullanım tükeniyor.
- [ ] `totpSecret` DB'de **şifreli** (düz değil); `TOTP_ENC_KEY` prod fail-fast.
- [ ] Oturumlarım: liste + tekil/toplu çıkış; revoke edilen oturum sonraki istekte 401.
- [ ] Yeni cihazdan girişte e-posta bildirimi (dev: konsol).
- [ ] Şifre/e-posta değişimi + 2FA kapatma + hesap silme **reauth** ister; yanlış kimlikte 401.
- [ ] E-posta değişimi: yeni adres doğrulanınca değişir; eski adres geri-al linkiyle döndürür + oturumları düşürür.
- [ ] Hesap silme: talep → deaktivasyon → grace'te giriş iptal eder; **kalıcı purge job no-op (gated)**.
- [ ] `isMinor` 18-yaş job'ı çalışıyor (test: sahte tarih).
- [ ] Login challenge token access olarak kabul edilmiyor (JwtStrategy reddi).
- [ ] **R7:** tüm 2B diff'i satır satır kullanıcı incelemesinden geçti.

**Açık sorular:**
- [ ] `TOTP_ENC_KEY` üretimi + saklama (kurucu; `.env`, repoda değil). Anahtar kaybı = mevcut 2FA secret'ları çözülemez
  (kullanıcılar 2FA'yı sıfırlar) — anahtar rotasyon stratejisi V2.
- [ ] Kalıcı purge gerçek davranışı (anonimleştir vs hard-delete) → **R6 KVKK hukuk görüşü** + Report (Sprint 4) sonrası netleşir.
- [ ] Admin'e zorunlu 2FA enforce → ayrı follow-up (bayrak); bu sprint değil.

---

## 11. Bağımsızlık, Bağımlılık, Env

- Yeni dep (yalnız `api/`): `otplib` (TOTP) + `qrcode` (QR data URL). PM onaylı.
- Yeni env: `TOTP_ENC_KEY` (zorunlu, prod fail-fast), `PURGE_ENABLED` (default false — gated purge anahtarı), `APP_NAME`
  (TOTP issuer, default "Kankaverse"). `.env.example`'a eklenir; gerçek anahtar repoda değil.
- Backend/frontend §4-9 sözleşmesinden paralel ilerler. **Login dönüşü değiştiği için** (challenge) frontend login
  akışı backend ile bu noktada hizalanmalı (mock'ta `twoFactorRequired` dalı kurulur).
