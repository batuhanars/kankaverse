# Sprint M0 Contract — Mobil İskele (Track F2)

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` geçerli. Türetildiği yer: PLAN Track F2 + `knowledge/projects/kankaverse/kankaverse-mobil-brief.md` §3 (M0).
>
> **🔴 R7 ZORUNLU:** Bu sprint **auth/oturum teslim katmanına** dokunuyor (`api/src/modules/auth/*`, `Session` modeli).
> Diff satır satır sahip incelemesinden geçmeden merge edilmez. `mobile/` tarafı R7-nötr (istemci UI), `api/` tarafı değil.

---

## 0. Bu sözleşmeyle kapanan açık sorular

| Soru | Karar |
|---|---|
| Kod başlangıç zamanı (brief §7 açık maddesi) | **Başlıyor** — sahip kararı 2026-07-28. F2 → 🟢 aktif |
| Mobilde kayıt olma / şifre sıfırlama | **M0 DIŞI** — iskeleyi küçük tutmak için, kayıt kapalı olduğu için değil (`REGISTRATION_MODE=open` kalıcı). **M1'e alındı, M5'e değil:** kayıt ekranı olmayan uygulama Play incelemesinden geçmez ("hesap açılamıyor") ve kapalı testte 12 testçiyi web'den kayıt olmaya zorlar. M0 dev'i bu ekranı **yapmaz**, M1 sözleşmesi yazar |
| i18n kütüphanesi | **YOK.** `web/src/i18n/tr.json` çoğul-pipe içermiyor, yalnız `{name}` interpolasyonu var → ~10 satırlık `t()` helper'ı yeterli. Kütüphane eklemek = gereksiz bağımlılık |
| minSdk / target | minSdk = Expo varsayılanı (24), targetSdk = Play'in güncel zorunlu seviyesi (API 35). Expo SDK'nın kendi varsayılanını ez**me** |
| Expo push mu doğrudan FCM mi | **Bu sprintte karara bağlanmaz.** M2 sözleşmesinin konusu |
| `packages/` paylaşılan katman | **Açılmıyor.** Rule of Three: 3. tüketici çıkmadan ortak paket kurulmaz. `mobile/` bugün web'den yalnız `tr.json` okur |

---

## 1. Hedef

Çalışan bir Android uygulaması iskelesi: **giriş yap, oturumu koru, ortam listeni gör.** Ürün özelliği yok;
bu sprintin çıktısı sonraki tüm mobil fazların üstüne oturacağı auth + istemci + tema + i18n zemini.

### DoD (**Android emülatöründe**, **Expo Go** ile doğrulanır)

> **Revizyon 2026-07-29 (PM), cihaz:** "fiziksel cihaz" → **emülatör** (`Pixel_9a` AVD mevcut, sahip kararı).
> M0'ın doğruladığı her şey (giriş, 2FA, secure store kalıcılığı, sessiz yenileme) emülatörde birebir çalışır;
> fiziksel cihaz bu fazda ek bilgi vermiyor. **Fiziksel cihaz M2'de şart olur** (push bildirimi) ve M4/M5'te
> (mikrofon/kamera izinleri, gerçek ağ koşulları). O fazlarda tekrar masaya gelir, M0'da gerekmiyor.

> **Revizyon 2026-07-29 (PM):** "dev build" → **Expo Go**. M0'ın tüm bağımlılıkları (`expo-router`,
> `expo-secure-store`) Expo Go çalışma zamanında var; dev build bugün fayda getirmiyor, yalnız ilk gradle
> kurulumu maliyeti getiriyor. Dev build **M2'de zorunlu olacak** (Android'de uzaktan push Expo Go'da çalışmaz),
> o fazda kurulur. Makinede JDK (Android Studio JBR) + Android SDK **zaten mevcut**, M2'de yeni kurulum yok.

1. Kullanıcı adı/e-posta + şifre ile giriş yapılır.
2. Hesapta 2FA varsa challenge ekranı gelir, TOTP kodu ile giriş tamamlanır.
3. Giriş sonrası **ortam (guild) listesi sunucudan gelir** ve ekranda görünür.
4. Uygulama tamamen kapatılıp açılınca **oturum korunur** (secure store'daki refresh ile sessiz bootstrap).
5. Access token süresi dolduğunda istek 401 alır → **sessiz yenilenir** → istek tekrarlanır, kullanıcı fark etmez.
6. Çıkış yap → sunucudaki session revoke olur, secure store temizlenir, giriş ekranına dönülür.
7. `web/` istemcisinin auth davranışı **hiç değişmemiştir** (regresyon testi: web'de giriş/yenileme/çıkış eskisi gibi).

### Kapsam DIŞI (M1+)

Mesajlaşma, kanal listesi, WebSocket, DM, arkadaş listesi, presence, push bildirim, ses/video, medya yükleme,
kayıt olma, şifre sıfırlama, ayarlar ekranı, tablet düzeni, iOS build.

Kayıt + şifre sıfırlama **M1'de** kapanır (§0 gerekçesi). M0 giriş ekranına "hesap oluştur" bağlantısı bile
konmaz — olmayan özelliğe kapı açma.

---

## 2. `api/` değişikliği — bearer refresh teslimi (R7)

### Problem

Refresh token bugün **yalnız httpOnly cookie** ile veriliyor (`auth.controller.ts` — `register`, `login`, `login/2fa`,
`refresh`). Native istemcide tarayıcı cookie kavanozu yok; RN'de `withCredentials` karşılığı güvenilir değil.

### Karar: teslim kanalı **oturum tipine** bağlanır

Naif çözüm ("refresh token'ı herkese gövdede de dön") web için **güvenlik regresyonudur**: XSS'li bir sayfa
refresh token'ı okuyup dışarı sızdırabilir, bugün httpOnly bunu engelliyor. O yüzden kapı session'a gömülür.

**2.1 Şema (additive migration):**
```prisma
model Session {
  ...
  clientType String?   // 'web' | 'mobile' | 'desktop' — null = web (geriye dönük uyum)
}
```
Mevcut satırlara dokunulmaz; `null` web gibi davranır.

**2.2 Session oluşturan uçlar** (`login`, `login/2fa`, `register`):
- İstek `X-Client-Type: mobile` başlığı taşıyorsa → session `clientType='mobile'` ile oluşturulur **ve** yanıt
  gövdesine `refreshToken` eklenir (cookie de set edilebilir, zararsız; istemci yok sayar).
- Başlık yoksa → **bugünkü davranışın birebir aynısı**. Gövdede `refreshToken` YOK. Web hiç etkilenmez.
- Başlık allowlist'tir: **yalnız `mobile`** kabul edilir; başka değer yok sayılır (`null` gibi işlenir), hata verilmez.
  `desktop` allowlist'e **girmez** — F1 masaüstü load-remote'tur (tarayıcı cookie'siyle çalışır, gövde token'ı
  istemez). Gövdede token alıp §2.3 kapısından geçemeyen ölü bir istemci tipi tanımlamak anlamsız yüzeydir.
  Gerçek bir native masaüstü istemcisi doğduğu gün allowlist tek satırla genişler.

**2.3 `POST /auth/refresh`:**
- Cookie varsa → bugünkü akış (değişmez).
- Cookie yoksa → gövdedeki `{ refreshToken }` kabul edilir.
- **Kapı (R7'nin özü):** gövdeden gelen token'ın ait olduğu session `clientType !== 'mobile'` ise **401**
  (`error: 'REFRESH_CHANNEL_MISMATCH'`). Yani bir web oturumunun refresh token'ı hiçbir koşulda gövdede dönmez
  ve gövdeden kabul edilmez.
- Mobil akışta yeni refresh token **gövdede** döner (`{ accessToken, refreshToken }`).

**2.4 Değişmeyen, dokunulmayacak yerler:**
- Rotasyon, `tokenFamily`, reuse-detection, revoke mantığı **aynen** geçerli. Mobil ayrıcalık almaz.
- `JwtAuthGuard`, `jwt.strategy.ts`, argon2id hash, 2FA doğrulama, throttle limitleri (login 5/dk, register 3/dk).
- Access token ömrü (~15dk) mobilde de aynı. "Mobilde uzun olsun" gibi bir gevşetme **yasak**.

**2.5 Swagger:** yeni gövde alanları + `X-Client-Type` başlığı spec'e yansır (istemci client'ı buradan üretilecek).

**2.6 `POST /auth/logout` — DEĞİŞMİYOR.** Bugün `JwtAuthGuard` + token içindeki `sessionId` ile revoke ediyor
(`auth.controller.ts:129-141`), cookie'ye bağlı değil. Mobil bearer ile çağırınca sunucu session'ı düzgün
düşer; `clearCookie` mobilde zararsız no-op. **Dev buraya dokunmasın.**

### 2.7 M0'ın kullandığı endpoint'ler (imza = bu tablo)

Hepsi kök `CLAUDE.md` envelope'ıyla sarılır; istemci gerçek veriyi `response.data.data`'dan çıkarır.

| Endpoint | Auth | Gövde / dönen |
|---|---|---|
| `POST /auth/login` | yok | `{ emailOrUsername, password }` → `{ user, accessToken, refreshToken? }` **veya** `{ twoFactorRequired: true, challengeToken }` |
| `POST /auth/login/2fa` | yok | `{ challengeToken, code }` → `{ user, accessToken, refreshToken? }` |
| `POST /auth/refresh` | yok | mobil: `{ refreshToken }` → `{ accessToken, refreshToken }` |
| `GET /auth/me` | bearer | → `user` |
| `POST /auth/logout` | bearer | → `null` |
| `GET /guilds` | bearer | → kullanıcının ortam listesi (`guilds.controller.ts:72`) |

`refreshToken?` = yalnız `X-Client-Type: mobile` başlığıyla gelen istekte var. DTO alan adları mevcut
`LoginDto` / `Login2faDto`'dan **birebir okunur**; dev tahmin etmez, dosyaya bakar. Bu tabloda olmayan bir
endpoint'e M0'da ihtiyaç duyulursa → **DUR, PM'e dön**.

---

## 3. Yeni tier: `mobile/`

Monorepo köküne `mobile/` (Expo, TypeScript). Kendi `package.json`'ı, kendi bağımlılıkları; kökte workspace yok
(diğer tier'lar gibi bağımsız).

```
mobile/
├── CLAUDE.md              # tier kuralları (§9)
├── src/
│   ├── app/               # Expo Router (SDK 57 şablonu rotaları BURAYA koyar, kökteki app/'e değil)
│   │   ├── _layout.tsx    # tema + auth bootstrap kapısı
│   │   ├── index.tsx      # açılış/splash: bootstrap sonucu login'e mi ana ekrana mı
│   │   ├── (auth)/login.tsx
│   │   ├── (auth)/two-factor.tsx
│   │   └── (app)/guilds.tsx   # ortam listesi
│   ├── api/               # axios instance + envelope interceptor + auth çağrıları
│   ├── stores/            # zustand (auth)
│   ├── i18n/              # t() helper (tr.json'u web'den okur)
│   ├── theme/             # design token → RN tema objesi
│   └── components/        # ortak küçük UI parçaları
├── metro.config.js        # watchFolders: ../web/src/i18n
└── app.json
```

> **Revizyon 2026-07-29 (PM):** rota klasörü `app/` değil **`src/app/`**. Expo SDK 57 varsayılan şablonu
> böyle üretiyor ve `tsconfig` `@/*` alias'ı `./src/*`'a bakıyor. Şablonla kavga etme.
>
> **İskele kuruldu (PM, 2026-07-29):** Expo SDK 57 / RN 0.86 / React 19.2, `create-expo-app` default şablonu.
> Örnek ekranlar + yalnız demoya ait bağımlılıklar (`@expo/ui`, `expo-glass-effect`, `expo-symbols`,
> `expo-web-browser`, `expo-device`, `expo-image`) temizlendi; `expo-secure-store` + `zustand` + `axios` kuruldu.
> `tsc --noEmit` ve `expo export --platform android` temiz. Uygulama kimliği: name `Kankaverse`, slug/scheme
> `kankaverse`. **`android.package` bilinçli olarak boş** — Play'de yayımlandıktan sonra değiştirilemez,
> M2/M5'te sahiple birlikte kararlaştırılır; Expo Go bunu istemez.

**Bağımlılıklar (bu liste dışına çıkmak = PM onayı):**
`expo`, `expo-router`, `expo-secure-store`, `react-native-safe-area-context`, `react-native-screens`,
`zustand`, `axios`. Expo SDK = kurulum anındaki güncel kararlı sürüm.

Bu liste **doğrudan bağımlılıkları** bağlar. `npx expo install` bunların zorunlu peer'larını (ör. `expo-linking`,
`expo-constants`, `expo-status-bar`, `react-native-reanimated`) çekerse **PM onayı gerekmez** — onay kuralı
"kendi seçtiğin yeni kütüphane" içindir, kurulumun dayattığı peer için değil.

**Env:** `EXPO_PUBLIC_API_URL` (dev'de makinenin LAN IP'si; `localhost` fiziksel cihazdan çalışmaz — dev
session bunu README'ye yazsın).

**Dev ortamı ön koşulları (README'ye yazılır, ilk saatte patlayan şeyler):**
- **`EXPO_PUBLIC_API_URL` hedefe göre değişir — en sık kaybedilen saat burada:**
  | Çalıştırma ortamı | Değer |
  |---|---|
  | **Android emülatörü (M0 varsayılanı)** | `http://10.0.2.2:3000` — emülatörde host makine budur |
  | Fiziksel cihaz (M2+) | `http://192.168.1.50:3000` (makinenin LAN IP'si, aynı ağ şartı) |
  | Her ikisinde de yanlış | `http://localhost:3000` — emülatörün/telefonun kendisini gösterir |
- **2FA test hesabı yerel veritabanında olmalı**, canlıdaki (kankaverse.com) hesap **değil**: `api/.env`
  yerel postgres'e bakıyor, canlı hesabın yerelde yok. **Durum 2026-07-29: HAZIR** — yerel `Azeroth` hesabında
  2FA açık, secret ve 10 kurtarma kodu yerinde (authenticator kaydı silinmişti, sıfırlanıp yeniden kuruldu).
  Not: giriş akışı TOTP yerine **kurtarma kodu** da kabul ediyor (`verifyTotpOrRecoveryCode`) — 2FA açılırken
  verilen kodlar saklanırsa authenticator kaybı DB'ye dokunmadan çözülür.
- Yerel altyapı için **Docker Desktop çalışıyor olmalı** (pg + redis + minio) **ve `api` ayakta olmalı**
  (`cd api && npm run start:dev`). Emülatör açık olmadan `npx expo start` sonrası `a` tuşu iş görmez.

**PM doğrulaması 2026-07-29 (dev bunlarla vakit kaybetmesin):**
- `api/src/main.ts:57` `app.listen(port)` zaten tüm arayüzlere bağlanıyor → **ayrı `0.0.0.0` bind işi yok.**
- Güvenlik duvarında **3000 portu için Allow kuralı zaten var** + `node.exe` gelen izinleri mevcut (Metro 8081).
  Telefon bağlanamazsa önce **aynı ağ** ve **API ayakta mı** kontrol edilir, duvara dokunulmaz.
- ⚠️ **CORS'a DOKUNMA.** `api` CORS'u yalnız `FRONTEND_URL`'e açık ama **native istemcide CORS diye bir şey
  yoktur** (tarayıcı origin'i yok). "Telefondan bağlanamıyorum" belirtisinin çaresi CORS gevşetmek **değildir**;
  o değişiklik web için güvenlik regresyonudur ve bu sözleşmenin dışındadır.

---

## 4. İstemci auth akışı

- **Refresh token → `expo-secure-store`.** AsyncStorage'a **asla** yazılmaz.
- **Access token → yalnız bellekte** (zustand state). Diske yazılmaz; uygulama kapanınca gider, bootstrap tazeler.
- **Bootstrap (iki adım):** açılışta secure store'da refresh varsa (1) `/auth/refresh` → access token,
  (2) `GET /auth/me` → kullanıcı objesi. **İkisi de gerekli:** `refresh` yalnız token döner, kullanıcıyı
  dönmez — web'de `init()` bunu `/auth/me` ile alıyor (`web/src/stores/auth.ts:11-13`), mobil de aynısını yapar.
  İkisi de başarılı → ana ekran. Herhangi biri başarısız → secure store temizlenir, giriş ekranı.
  Bu süre boyunca splash görünür.
- Rotasyon gereği **her** `/auth/refresh` yanıtındaki yeni `refreshToken` secure store'a yazılır (eskisinin
  üstüne). Yazılmazsa bir sonraki açılışta kullanılmış token gönderilir → reuse-detection aileyi iptal eder
  → kullanıcı sebepsiz atılır. Bu, akışın en kolay kaçırılan yeri.
- **401 → tek-uçuş refresh:** `web/src/api/axios.ts`'teki `refreshPromise` dedup pattern'i birebir taşınır
  (eş zamanlı 401'lerde tek refresh çağrısı). Refresh de başarısızsa oturum düşer.
- **2FA:** `login` yanıtı `{ twoFactorRequired: true, challengeToken }` dönerse challenge ekranına git; kod ile
  `login/2fa` çağrılır. Challenge token bellekte tutulur, saklanmaz.
- **Çıkış:** `/auth/logout` (bearer) + secure store temizliği. Sunucu hata verse bile yerel temizlik yapılır.

---

## 5. Envelope client

`web/src/api/axios.ts` pattern'i port edilir:
- Request interceptor: `Authorization: Bearer <access>` + `X-Client-Type: mobile`.
- Response interceptor: `response.data.data` unwrap.
- Hata: kullanıcıya `message` (Türkçe) gösterilir, `error` kodu loglanır. Ham hata metni ekrana basılmaz.

---

## 6. i18n — `tr.json` tek kaynak

- `metro.config.js` → `watchFolders: [path.resolve(__dirname, '../web/src/i18n')]`, alias `@i18n`.
- Mobil dosyayı **import eder, kopyalamaz.** Kopya çıkarmak bu sprintte açık ihlaldir.
- `t('a.b.c', { name })` helper'ı: nokta yolu çözer, `{key}` yer tutucularını değiştirir, anahtar yoksa
  anahtarın kendisini döner (dev'de uyarı loglar).
- Mobilde yeni string gerekiyorsa **`web/src/i18n/tr.json`'a eklenir** (mobil-özel bölüm: `mobile.*` altında).
- Doğrulandı: `tr.json` 1586 satır, **tek bir `|` karakteri yok** → çoğul-pipe desteği gerekmiyor, helper yeterli.

**Kaçış yolu (önceden onaylı, dev durmasın):** Metro'nun proje kökü dışındaki dosyayı çözmesi
(`watchFolders` + resolver alias) bazen kurcalama ister. Bu iş **~30 dakikayı aşarsa** dev ikinci yola geçer:
`prebuild` script'i `tr.json`'u `mobile/src/i18n/tr.generated.json`'a kopyalar, dosya **gitignore'lanır** ve
başına "ÜRETİLMİŞ — elle düzenleme" başlığı yazılır. Bu yasak olan "kopya" değildir; yasak olan **elle
bakımı yapılan ikinci bir kaynak**tır. Tek doğruluk kaynağı yine `web/src/i18n/tr.json` kalır.

---

## 7. Tema

`knowledge/projects/kankaverse/kankaverse-design-tokens.md` → `src/theme/tokens.ts` (renk/tipografi/boşluk/yarıçap).
Koyu tema, Kor aksan, altıgen ortam ikonu, daire avatar. **Renk/ölçü değeri bileşen içine gömülmez**, tema
objesinden gelir. Web'de olmayan yeni bir token uydurma; eksik görünen şey çıkarsa PM'e sor.

---

## 8. Ekranlar (üç tane, fazlası yok)

1. **Açılış** — logo + bootstrap; yönlendirme yapar, kullanıcı etkileşimi yok.
2. **Giriş** — kullanıcı adı/e-posta + şifre, hata mesajı alanı, yükleniyor durumu. (+ 2FA kod ekranı.)
3. **Ortam listesi** — sunucudan gelen guild'ler; ikon + ad. Read-only; tıklama M1'e kadar iş yapmaz
   (buton koyup boş ekrana götürme, tıklanabilirlik hissi verme). **Çıkış yap** bu ekranın başlığında durur —
   DoD §6 çıkışı şart koşuyor ve M0'da ayarlar ekranı yok; başka yüzey açmadan buraya konur.

Boş durum ("henüz ortamın yok") ve hata durumu ("bağlanılamadı, tekrar dene") ekranları dahildir.

---

## 9. `mobile/CLAUDE.md` (bu sprintte yazılır)

İçerik: tier'ın ne olduğu, stack kilidi (§2 brief), "cross-cutting kuralları kopyalama" notu, T&S hatırlatması
(gating kararları backend otoritesindedir, istemci yalnız UI), i18n kopyalama yasağı, tema tek kaynak kuralı.
Kısa tut; kök CLAUDE.md zaten cascade ile yükleniyor.

---

## 10. Kabul kriterleri

- [ ] `Session.clientType` migration'ı additive; mevcut kayıtlar bozulmadı
- [ ] `X-Client-Type` başlığı **olmayan** istekte api davranışı bit-birebir eski (web regresyon yok)
- [ ] Web session'ının refresh token'ı hiçbir uçtan gövdede dönmüyor
- [ ] Gövdeden gelen refresh token'da `clientType` kapısı çalışıyor (web token'ı ile deneme → 401)
- [ ] Rotasyon + reuse-detection mobil akışta da çalışıyor (aynı token iki kez → aile revoke)
- [ ] DoD'deki 7 madde fiziksel cihazda doğrulandı
- [ ] `mobile/` içinde kullanıcıya görünen tek bir gömülü string yok
- [ ] `tr.json` kopyası yok
- [ ] R7: `api/` diff'i sahibe sunuldu ve onaylandı

---

## 11. Sapma kuralı

Endpoint imzası, DTO şekli, alan adı, ekran sayısı bu dosyadan **sapamaz**. İhtiyaç doğarsa dev **durur**,
kullanıcıya bildirir, PM sözleşmeyi revize eder. `TASK.md`'ye yeni item eklemek dev'in işi değildir.
