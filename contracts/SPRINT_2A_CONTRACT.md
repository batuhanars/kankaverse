# Sprint 2A Contract — E-posta Doğrulama & Şifre Kurtarma

> **Tek doğruluk kaynağı.** Backend ve frontend dev session'lar buradan sapamaz. Sapma ihtiyacı →
> dur, kullanıcıya bildir, PM contract'ı revize eder. Kök `CLAUDE.md` + tier `CLAUDE.md` bu contract'la birlikte geçerli.
>
> **R7 — TAMAMI insan incelemesi.** Bu sprint auth/oturum katmanına dokunur (register akışı değişir, oturum
> iptali, token'lar). Her diff satır satır kullanıcı onayından geçer; "AI yazdı, geçti" yoktur (brief §8, R7).
>
> Sprint 2 ikiye bölündü (PM kararı, 2026-06-11): **2A = e-posta & kimlik-bilgisi yaşam döngüsü** (bu dosya),
> **2B = 2FA, oturum yönetimi, hassas işlem reauth, hesap silme**. E-posta *değişimi* ve reauth 2B'dedir.

---

## 1. Hedef

Sprint 1 walking skeleton'ı auth tarafında sertleştirmenin ilk yarısı:

1. **E-posta doğrulama:** kayıtta doğrulama linki gönderilir. Doğrulanmamış hesap **girebilir ama kısıtlı**
   (sunucu kuramaz; DM başlatamaz → DM Sprint 3, şimdilik yalnız sunucu kapısı). Düşük onboarding sürtünmesi,
   değersiz spam hesap (brief §8).
2. **Şifre sıfırlama (forgot):** tek-kullanımlık, kısa ömürlü token; kullanılınca **tüm oturumları düşürür**.
3. **`EmailService` soyutlaması:** SharedModule, Resend adaptörü. Dev'de API anahtarı yoksa konsol adaptörü
   (linki loglar) — sağlayıcı arkada değişebilir.

**Kapsam dışı (2A'da YOK):** 2FA, "oturumlarım" ekranı, hassas işlem reauth, **e-posta değişimi**, hesap silme,
şifre *değişimi* (giriş yapmışken; o reauth ister → 2B). Bunların hepsi Sprint 2B.

---

## 2. Prisma Modelleri (2A deltası)

> Sprint 1 şeması korunur. `User.emailVerifiedAt` **zaten var** (Sprint 1 §2). Yalnız `AuthToken` eklenir +
> `User`'a ilişki. Migration additive — mevcut veriyi bozmaz.

```prisma
model User {
  // ... Sprint 1 alanları değişmez ...
  authTokens          AuthToken[]   // YENİ ilişki
}

model AuthToken {
  id        String        @id @default(cuid())
  userId    String
  user      User          @relation(fields: [userId], references: [id])
  type      AuthTokenType
  tokenHash String        // SHA-256(token) — plain ASLA saklanmaz (lookup için deterministik)
  expiresAt DateTime
  usedAt    DateTime?     // tek-kullanım: set edildiyse token tüketilmiş
  createdAt DateTime      @default(now())
  @@index([userId, type])
  @@index([tokenHash])    // doğrulama/sıfırlamada token ile arama
}

enum AuthTokenType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
}
```

**Token güvenlik kuralı (R7):**
- Ham token = **32 byte (256-bit) kriptografik rastgele**, `base64url` kodlu. İstemciye yalnız ham token gider
  (e-posta linkinde); DB'de **yalnız `SHA-256(token)`** durur.
- Tokenlar yüksek entropili olduğundan SHA-256 yeterli (argon2 gerekmez; üstelik argon2 tuzlu olduğundan
  hash ile arama yapılamaz — bu yüzden deterministik SHA-256). Şifre hash'i **değil**, bu lookup-token hash'i.
- Tek-kullanım (`usedAt`) + süre (`expiresAt`) **her iki kontrol de** doğrulamada yapılır.

---

## 3. Sabitler

- E-posta doğrulama token TTL: **24 saat**. Şifre sıfırlama token TTL: **30 dakika**.
- Token entropi: 32 byte. Şifre kuralı Sprint 1 ile aynı (min 8, `@MaxLength(128)`).
- Rate limit (auth route'ları, Sprint 1 ThrottlerGuard üzerinden):
  - `POST /auth/forgot-password` → **3/saat/IP**.
  - `POST /auth/resend-verification` → **5/saat/kullanıcı** (+ global default).
  - `POST /auth/verify-email`, `POST /auth/reset-password` → 10/saat/IP (brute-force token tahminine karşı).
- Yeni reset/forgot token üretiminde aynı kullanıcının **önceki kullanılmamış aynı tip tokenları iptal edilir**
  (eskisi geçersiz, en son link geçerli).

---

## 4. DTO Şekilleri (paylaşılan)

```typescript
// UserDto — Sprint 1'e EK alan (additive; frontend banner/gating için gerekli)
interface UserDto {
  id: string; username: string; email: string; avatarUrl: string | null;
  isMinor: boolean; verificationStatus: VerificationStatus; createdAt: string;
  emailVerified: boolean;   // YENİ — türetilmiş: emailVerifiedAt !== null
}
```

> `emailVerified` eklenmesi UserDto'yu değiştirir → her iki tier güncellenir. `/auth/me`, login, register
> dönüşlerinin hepsi yeni alanı taşır. Backend `toUserDto` tek noktada güncellenir.

---

## 5. HTTP Endpoint İmzaları

> Tümü response envelope `{ success, statusCode, data }`. Yeni endpoint'ler `/auth` altında.

### Auth — e-posta doğrulama
- **POST `/auth/verify-email`** — Body `{ token }` → `200 { data: { user: UserDto } }` (artık `emailVerified:true`).
  Token geçersiz/süresi geçmiş/kullanılmış → `400 INVALID_TOKEN`. Zaten doğrulanmışsa → `409 EMAIL_ALREADY_VERIFIED`.
  **Yan etki:** token `usedAt` set edilir, `User.emailVerifiedAt = now`.
- **POST `/auth/resend-verification`** — (auth) → `200 { data: null }`. Doğrulama e-postasını yeniden gönderir
  (yeni token, eskiler iptal). Zaten doğrulanmışsa → `409 EMAIL_ALREADY_VERIFIED`. Rate-limit §3.

### Auth — şifre sıfırlama
- **POST `/auth/forgot-password`** — Body `{ email }` → **her zaman `200 { data: null }`** (kullanıcı sayımı
  sızdırılmaz — var/yok aynı yanıt, aynı yaklaşık süre). Kullanıcı varsa & silinmemişse: `PASSWORD_RESET`
  token üret + e-posta gönder. Rate-limit §3.
- **POST `/auth/reset-password`** — Body `{ token, newPassword }` → `200 { data: null }`. Token doğrula
  (var/kullanılmamış/süresi geçmemiş), `passwordHash` güncelle (argon2id), token `usedAt` set,
  **kullanıcının TÜM Session'larını revoke et** (eski refresh/access geçersiz), `emailVerifiedAt`'i de set et
  (sıfırlama e-postasını alabilmek e-posta sahipliğini kanıtlar). Hata: `400 INVALID_TOKEN`,
  `422 VALIDATION_FAILED` (zayıf şifre).

### Register akışı değişikliği (mevcut endpoint)
- **POST `/auth/register`** (Sprint 1) — imza **değişmez**; **yan etki eklenir:** kullanıcı oluşturulduktan
  sonra `EMAIL_VERIFICATION` token üretilir + doğrulama e-postası gönderilir. E-posta gönderimi register'ı
  **bloke etmez** (gönderim hatası loglanır, kayıt başarılı döner; kullanıcı resend ile tekrar alır).

### Gating — doğrulanmamış = kısıtlı
- **POST `/guilds`** (Sprint 1) — `VerifiedEmailGuard` eklenir: `emailVerifiedAt === null` → `403 EMAIL_NOT_VERIFIED`,
  message "Sunucu oluşturmak için e-postanı doğrulamalısın." İmza/DTO değişmez, yalnız guard.
- DM başlatma kapısı → **Sprint 3** (DM henüz yok; guard deseni o sprint'te DM endpoint'ine de uygulanır).

---

## 6. EmailService (SharedModule)

- `EmailService` `shared/` altında, `exports` ile dışa açık. Arayüz:
  `sendVerificationEmail(to, link)`, `sendPasswordResetEmail(to, link)`.
- **Adaptör seçimi (runtime):**
  - `RESEND_API_KEY` tanımlıysa → **Resend** adaptörü (gerçek gönderim).
  - Tanımlı değilse → **konsol adaptörü** (linki `console.log`'a basar). Dev'de anahtarsız çalışır;
    **production'da `RESEND_API_KEY` zorunlu** (yoksa boot'ta fail-fast — `configuration.ts` deseni).
- Linkler `FRONTEND_URL` (yeni zorunlu-değil env, default `http://localhost:5173`) üzerinden kurulur:
  `${FRONTEND_URL}/verify-email?token=...`, `${FRONTEND_URL}/reset-password?token=...`.
- E-posta içeriği TR, sade (başlık + tek buton/link + süre bilgisi). Şablonlar `shared/email/templates/` —
  marka logosu opsiyonel (V1 için düz metin + link yeterli; açık soru §9).
- **Yeni bağımlılık (PM onaylı):** `resend`. `@nestjs/config`'e `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL` eklenir.

---

## 7. UI Yerleşim (web)

- **Doğrulama bandı:** `emailVerified === false` iken uygulama içinde (AppView üst şeridi) uyarı + "Tekrar gönder"
  butonu (`/auth/resend-verification`). Gönderilince "kutunu kontrol et" geri bildirimi.
- **`VerifyEmailView`** (route `/verify-email`): query'den token okur → `/auth/verify-email` çağırır →
  başarı ("e-postan doğrulandı") / hata ("link geçersiz veya süresi dolmuş, tekrar gönder") → app'e/login'e yönlendir.
- **`ForgotPasswordView`** (`/forgot-password`): e-posta input → `/auth/forgot-password` → her durumda
  "eğer kayıtlıysa link gönderildi" mesajı (sızıntı yok). Login'de "Şifremi unuttum" linki buraya.
- **`ResetPasswordView`** (`/reset-password`): query token + yeni şifre (vee-validate + zod, §3 kuralları) →
  `/auth/reset-password` → başarı → login'e yönlendir ("şifren değişti, tekrar giriş yap"; tüm oturumlar düştü).
- **Guild oluşturma:** doğrulanmamışken `403 EMAIL_NOT_VERIFIED` ele alınır — "Sunucu Oluştur" butonu
  doğrulanmamışsa devre dışı/tooltip veya hata mesajı. (CreateGuildModal + boş-durum butonları.)
- Tüm metin `i18n/tr.json`. Yeni hata kodları i18n hata map'ine eklenir.

---

## 8. Hata Kodları (machine `error`) — 2A ekleri

Sprint 1 kodlarına **EK:** `EMAIL_NOT_VERIFIED` (403), `INVALID_TOKEN` (400), `EMAIL_ALREADY_VERIFIED` (409).
Zayıf şifre `VALIDATION_FAILED` (mevcut). Hepsi Türkçe `message` ile.

---

## 9. DoD & Açık Sorular

**Definition of Done (Sprint 2A):**
- [ ] Kayıtta doğrulama e-postası gönderiliyor (dev: konsol linki); link → `emailVerified:true`.
- [ ] Doğrulanmamış kullanıcı **giriş yapabiliyor ama sunucu kuramıyor** (`403 EMAIL_NOT_VERIFIED`).
- [ ] `resend-verification` çalışıyor + rate-limit'li; zaten doğrulanmışsa `409`.
- [ ] `forgot-password` **kullanıcı var/yok ayrımı sızdırmıyor** (her zaman 200, yakın süre).
- [ ] `reset-password`: yeni şifre set ediliyor, **tüm oturumlar düşüyor** (eski access token 401), `emailVerified:true` oluyor.
- [ ] Token'lar tek-kullanım + süreli; kullanılmış/süresi geçmiş token `400 INVALID_TOKEN`.
- [ ] `EmailService` soyut; `RESEND_API_KEY` yokken konsol adaptörü, varken Resend.
- [ ] `UserDto.emailVerified` her iki tier'da; Swagger güncel.
- [ ] Tüm UI metni i18n'den; yeni hata kodları map'te.
- [ ] **R7:** 2A diff'i (register değişikliği + token akışları + oturum iptali) satır satır kullanıcı incelemesinden geçti.

**Açık sorular (PM'e/kurucuya):**
- [ ] **Resend gönderici domaini + DNS (DKIM/SPF) doğrulaması** — production e-postaları için kurucu görevi.
  Dev konsol adaptörüyle bloke olmadan ilerler; production öncesi netleşir.
- [ ] `reset-password` başarıda `emailVerifiedAt` set edilsin mi? (**öneri: evet** — reset e-postasını almak
  sahipliği kanıtlar). Onay bekler.
- [ ] E-posta şablonu: V1'de düz metin + link mi, yoksa markalı (logo) HTML mi? (**öneri: sade HTML + tek buton**,
  marka rengi; logo opsiyonel.)

---

## 10. Bağımsızlık Notu

Backend ve frontend §4-8 sözleşmesinden paralel ilerler. Frontend, backend hazır olmadan yeni endpoint'lere
göre mock/tip üretebilir. Yeni dep yalnız `api/`: `resend`. Yeni env: `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`
(`.env.example`'a eklenir, gerçek anahtar repoda değil).
