# Sprint Kapalı-Kayıt Contract — Davet-Kodlu Platform Kaydı + Açık-Kayıt Anahtarı

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. Türetildiği yer: PLAN Track F önü / kapalı-test fazı
> (sahip 2026-06-17 sırası: "C4 build-dark → **davet-kodlu kapalı kayıt sistemi (yayın öncesi)** → açık-kayıt kapat + DB purge → bayrakları aç").
>
> **R7 ZORUNLU:** kayıt (register) akışı + davet-claim + admin yetki kapısı = **auth/oturum + T&S karar yüzeyi**,
> satır-satır insan incelemesi. "AI yazdı, geçti" yoktur (CLAUDE.md zorunluluğu).
>
> Response envelope (her endpoint ilk satırı): `{ success, statusCode, data }` — controller sarmalamaz, TransformInterceptor üretir.

---

## 1. Hedef

Kapalı-test / yayıncı-demosu fazı için **platform kaydını davet koduyla kapıla**: yalnız geçerli bir davet kodu olan
yeni hesap açabilsin. "Açık kaydı kapat" anahtarı = `REGISTRATION_MODE` bayrağı (`open` → `invite` → `closed`). Bu sprint,
PLAN'ın kapalı-test sırasındaki **"davet-kodlu kapalı kayıt"** kalemini teslim eder; yayın bayraklarını (C4 video/ekran)
açmadan önceki **erişim kapısı**dır.

**KAVRAM AYRIMI (kritik — karıştırma):** Bu **PLATFORM kaydı** davetidir (`PlatformInvite`) — yeni hesap açmayı kapılar.
Sprint 7A'daki `Invite` modeli **GUILD/ortam** davetidir (var olan hesabın bir ortama katılması). İkisi ayrı model, ayrı
yüzey, ayrı yetki. `Invite` modeline **DOKUNMA**.

**T&S ORTOGONALLİĞİ (kritik):** Davet kodu **yaş doğrulaması DEĞİLDİR**, yalnız erişim kontrolüdür. Kayıt hâlâ
`birthDate` toplar, `isMinor` hesaplanır, tüm minör kısıtları (dmPolicy/mediaPolicy/profileDiscoverable) aynen uygulanır.
Kodu olan bir minör yine **minör olarak** kaydolur ve tüm yapısal korumalar geçerli kalır. Lansman-grade için e-Devlet (D2)
hâlâ zorunlu (brief §4: doğrulanmış statü reşit olmayana erişim ayrıcalığı TANIMAZ).

**Kapsam DIŞI:** runtime-değiştirilebilir mod (DB-tabanlı toggle) — bu sprint env-bayrağı (§3), redeploy ile flip; rol/RBAC
sistemi (platform-admin = `isModerator` reuse, §4); davet kodu e-posta gönderimi; oran-tabanlı abuse analitiği.

---

## 2. Prisma (additive — mevcut alanlar/modeller korunur)

```prisma
model PlatformInvite {
  id         String    @id @default(cuid())
  code       String    @unique          // 8-char URL-safe (friend-code.util desenini taklit et), çakışmada yenile
  note       String?                     // admin memo: kime/niçin verildi (opsiyonel)
  maxUses    Int?                        // null = sınırsız
  uses       Int       @default(0)
  expiresAt  DateTime?                   // null = süresiz
  disabledAt DateTime?                   // soft-iptal (revoke)
  creatorId  String
  creator    User      @relation("PlatformInviteCreator", fields: [creatorId], references: [id])
  redeemers  User[]    @relation("RedeemedPlatformInvite")
  createdAt  DateTime  @default(now())
  @@index([creatorId])
}
```

`User` modeline (additive, nullable — mevcut kullanıcılar etkilenmez):
```prisma
  platformInviteId   String?          // hangi davetle kaydoldu (audit / güven grafiği)
  platformInvite     PlatformInvite?  @relation("RedeemedPlatformInvite", fields: [platformInviteId], references: [id])
  createdPlatformInvites PlatformInvite[] @relation("PlatformInviteCreator")
```

- Migration **additive** (mevcut veri/akış etkilenmez; `REGISTRATION_MODE` default `open` → davranış değişmez).
- `generateInviteCode` deseni `friend-code.util` ile aynı (8-char, çakışmada yeniden üret). **Guild davetindeki üreteç
  kopyalanmaz — Rule of Three:** eğer guild `Invite` üreteci ile birebir aynı algoritma çıkıyorsa, ortak util'e çıkar
  (`generateShortCode`); değilse ayrı kalsın. Dev kararı + sapma hissi olursa PM'e dön.
- **Migration DB'ye uygulanır** (`prisma migrate dev` + `migrate status` temiz; prod'da otomatik `migrate deploy`).

---

## 3. Feature Flag: `REGISTRATION_MODE` (env, mevcut bayrak deseni)

`api/src/config/configuration.ts`'ye, `cameraEnabled`/`purgeEnabled` desenini izleyerek:
```typescript
registrationMode: (process.env.REGISTRATION_MODE ?? 'open') as 'open' | 'invite' | 'closed',
```
- **`open`** (default): kayıt açık, davet kodu **yok sayılır** (mevcut davranış — dev/regresyon güvenli).
- **`invite`**: kayıt yalnız geçerli davet koduyla. **"Açık kaydı kapat" = bunu `invite` yap** (yayın öncesi hedef mod).
- **`closed`**: kayıt tamamen kapalı (hiç yeni hesap yok) — purge sonrası dondurma / acil kapatma için.
- Geçersiz değer → fail-safe `closed` (kayıt açık-kalmasındansa kapalı kalsın; T&S fail-closed ilkesi). Log uyar.
- `.env.example`'a `REGISTRATION_MODE=open` + üç değerin açıklaması.

> **Karar (PM, env vs runtime-toggle):** Mevcut tüm bayraklar (`CAMERA_ENABLED` vb.) env; tutarlılık + sadelik için
> env seçildi (flip = redeploy/restart). Canlı UI'dan redeploy'suz flip istenirse → ayrı küçük iş (DB-setting + admin
> endpoint), V2. Over-engineering yapma (kullanıcı uyarısı).

---

## 4. Admin Yetki Kapısı — `PlatformAdminGuard` (= `isModerator`)

Platform-admin kavramı yok; **`User.isModerator === true` reuse edilir** (PLAN A3: isModerator elle DB; sahip kendi
hesabını DB'den `isModerator=true` yapar). `PlatformAdminGuard` (NestJS guard): `JwtAuthGuard` sonrası, `user.isModerator`
değilse `403 FORBIDDEN` (jenerik — admin yüzeyinin varlığını sızdırma; "endpoint yok" gibi davranan generik mesaj).

> **Karar (PM):** Bilinçli sadeleştirme — kapalı-test için `isModerator` reuse yeterli. Ayrı `isPlatformAdmin` alanı +
> RBAC → büyüme acısı hissedilince (V2). **PLAN teknik borca eklenecek (yeni borç).**

---

## 5. Endpoints (envelope)

### 5.1 Admin — davet yönetimi (tümü `JwtAuthGuard` + `PlatformAdminGuard`)
- **`POST /admin/platform-invites`** — `{ maxUses?: number (1-10000), expiresInHours?: number (1-8760), note?: string (≤200) }`
  → kod üret, `PlatformInvite` oluştur (`creatorId = current user`) → `PlatformInviteDto`
  (`{ id, code, note, maxUses, uses, expiresAt, disabledAt, createdAt }`). `201`.
- **`GET /admin/platform-invites`** — tüm davetler (aktif + geçmiş), durum türetilir (aktif/dolmuş/iptal/süre-geçmiş) → `PlatformInviteDto[]`.
- **`DELETE /admin/platform-invites/:id`** — `disabledAt=now` (soft-iptal). → `200 null`. Bulunamaz → `404`.

### 5.2 Public — kayıt modu sorgusu
- **`GET /auth/registration-mode`** (auth YOK, public) → `{ mode: 'open' | 'invite' | 'closed' }`. Frontend bununla davet
  kodu alanını gösterir/zorunlu kılar ya da formu kapatır. **Sızıntı yok** (yalnız mod; davet listesi/sayısı dönmez).

### 5.3 Modifiye — register (`POST /auth/register`) **[R7]**
`RegisterDto`'ya `inviteCode?: string` (`@IsOptional() @IsString() @Length(8,8)` — yalnız format; geçerlilik serviste).
`auth.service.register()` başında, **kullanıcı yaratmadan önce**, `registrationMode`'a göre:

1. **`closed`** → her zaman `403 REGISTRATION_CLOSED` ("Yeni kayıt şu anda kapalı").
2. **`invite`** →
   - `inviteCode` yoksa → `400 INVITE_CODE_REQUIRED`.
   - **Atomik claim (TOCTOU-güvenli, R7):** `prisma.$transaction` içinde davet-claim + user-create birlikte:
     - `updateMany` ile **koşullu** artır: `where: { code, disabledAt: null, (expiresAt: null VEYA expiresAt > now), (maxUses: null VEYA uses < maxUses) }`, `data: { uses: { increment: 1 } }`. **`maxUses` null (sınırsız) ile `uses < maxUses` koşulunu doğru kur** (iki dal / `OR`); affected count **!== 1** ise → `400 INVITE_CODE_INVALID` (geçersiz/dolmuş/iptal/süre-geçmiş hepsi **jenerik tek kod** — hangisi olduğunu sızdırma).
     - Aynı transaction'da user create + `platformInviteId = davet.id` set et.
     - User create hata verirse (dup email/username) transaction **rollback** → `uses` artışı geri alınır (claim sızmaz).
   - **D11 borcunu TEKRARLAMA:** guild davetindeki maxUses TOCTOU (PLAN D11) burada **baştan atomik** yapılır; benign değil, kayıt kapısı.
3. **`open`** → `inviteCode` yok sayılır (varsa hata verme, sessiz görmezden gel); mevcut akış aynen.

> Davet claim'i kullanıcı yaratmanın **parçası** (tek transaction). isMinor/dmPolicy/profileDiscoverable hesabı + e-posta
> doğrulama yan etkisi **değişmez** — yalnız önüne kapı eklenir. **adultsOnly/age kapıları bu sprintte DOKUNULMAZ.**

### Hata kodları (yeni)
`REGISTRATION_CLOSED` · `INVITE_CODE_REQUIRED` · `INVITE_CODE_INVALID` · (admin) `FORBIDDEN` (mevcut). Swagger güncel.

---

## 6. Frontend (`web/`)

- **`RegisterView.vue`:** mount'ta `GET /auth/registration-mode`. Moda göre:
  - `open` → mevcut form aynen (davet alanı yok).
  - `invite` → forma **davet kodu input**'u (`KvInput`, `defineField('inviteCode')`); zod: mode `invite` ise `min(8).max(8)`
    zorunlu, değilse opsiyonel. `INVITE_CODE_REQUIRED`/`INVITE_CODE_INVALID` → Türkçe mesaj ("Geçerli bir davet kodu gerekli" /
    "Davet kodu geçersiz veya süresi dolmuş").
  - `closed` → form yerine bilgi kartı ("Yeni kayıtlar şu anda kapalı"); submit edilemez. `REGISTRATION_CLOSED` de aynı mesaj.
  - `RegisterPayload`'a `inviteCode?: string`; `api/auth.ts` + zod `lib/validation/auth.ts` güncel.
- **Admin davet paneli (yalnız `isModerator`) — MİNİMAL, gerçek işlev (placeholder YOK):** ayarlar/menüden erişim, yalnız
  `user.isModerator` ise görünür. İçerik: davet **oluştur** (maxUses/süre/not opsiyonel) → kod göster + **kopyala**
  (`useClipboard`); **liste** (kod, kullanım `uses/maxUses`, durum, oluşturma) ; **iptal** (`DELETE`, ConfirmDialog).
  Non-admin → giriş noktası **gösterilme**. Boş/gelecek bölüm ekleme (UI'ı placeholder'la şişirme).
- **i18n:** tüm metin `tr.json` (`register.invite.*`, `admin.platformInvite.*`, yeni hata kodları); renk/şekil `--kv-*` token.

---

## 7. R7 Kapsamı (insan incelemesi zorunlu — merge öncesi sahip imzası)
- `register()` mod-kapısı sırası (`closed` → `invite` claim → `open`), fail-closed; geçersiz mod → `closed`.
- Atomik davet-claim (`updateMany` koşulu doğru: disabled/expiry/maxUses; null-maxUses dalı; rollback davranışı) — **D11 tekrarı yok**.
- `INVITE_CODE_INVALID` jenerikliği (hangi geçersizlik olduğu sızmaz).
- `PlatformAdminGuard` (`isModerator`) admin yüzeyini doğru kapıyor; non-admin hiçbir admin endpoint'e erişemiyor.
- T&S ortogonallik korunmuş: davet kayıt-akışındaki isMinor/minör-kısıt mantığını **gevşetmiyor**.

---

## 8. DoD
- [ ] `PlatformInvite` modeli + `User.platformInviteId` + migration (additive); **`migrate status` temiz** (uygulandı).
- [ ] `REGISTRATION_MODE` bayrağı (`open`/`invite`/`closed`, default `open`, geçersiz→`closed`) + `.env.example`.
- [ ] Admin: davet oluştur/listele/iptal (`PlatformAdminGuard`=isModerator); non-admin `403`.
- [ ] `GET /auth/registration-mode` (public) doğru mod döner, sızıntı yok.
- [ ] **`invite` modda:** kodsuz kayıt `INVITE_CODE_REQUIRED`; geçersiz/dolmuş/iptal kod `INVITE_CODE_INVALID` (jenerik); geçerli kod → kayıt + `uses` atomik artar + `platformInviteId` set.
- [ ] **`closed` modda:** her kayıt `REGISTRATION_CLOSED`. **`open` modda:** mevcut akış bozulmadan (davet yok sayılır).
- [ ] **Atomik claim** eşzamanlı kayıtta maxUses aşmıyor (D11 tekrarı yok); user-create hatası claim'i geri alıyor (rollback).
- [ ] Minör davet koduyla kaydolur ama **isMinor + tüm minör kısıtları aynen** (T&S regresyon yok).
- [ ] Frontend: mode'a göre davet alanı/kapalı-kart; admin davet paneli (oluştur/kopyala/iptal, yalnız isModerator).
- [ ] Yeni hata kodları + i18n; Swagger güncel.
- [ ] **R7:** register mod-kapısı + atomik claim + admin guard satır-satır incelendi (sahip imzası).
- [ ] Regresyon: mevcut kayıt/giriş/guild/DM akışları bozulmadı; `nest build` + `vue-tsc`(mevcut bilinen hata hariç) + `vite build` temiz; testler geçer.

---

## 9. Notlar
- **Yayın akışı (sahip, PLAN satır 181):** bu sprint biter → `REGISTRATION_MODE=invite` (açık-kayıt kapanır) → DB purge →
  C4 video/ekran bayrakları (`CAMERA_ENABLED`/`SCREEN_ENABLED`) açılır → yayıncı demosu davet kodlarıyla.
- **Yeni teknik borç (PLAN'a):** (D16) `isModerator` platform-admin olarak reuse — ayrı `isPlatformAdmin`/RBAC V2'ye ertelendi.
  (D17 ops.) `REGISTRATION_MODE` env → runtime UI-toggle V2 (redeploy'suz flip istenirse).
- e-Devlet (D2) lansman-grade için hâlâ açık; davet kodu onun yerini TUTMAZ (yalnız erişim kontrolü).
