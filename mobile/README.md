# Kankaverse — Mobil (React Native + Expo)

Sprint M0 iskele: giriş yap, oturumu koru (secure-store + sessiz yenileme), ortam listeni gör.
Tek doğruluk kaynağı: `../contracts/SPRINT_M0_MOBILE_CONTRACT.md`. Tier kuralları: `./CLAUDE.md`.

## Ortam Kurulumu

```bash
npm install
cp .env.example .env   # değeri hedefe göre düzenle, aşağıya bak
```

### `EXPO_PUBLIC_API_URL` — en sık kaybedilen saat burada

| Çalıştırma ortamı | Değer |
|---|---|
| **Android emülatörü (M0 varsayılanı)** | `http://10.0.2.2:3001` — emülatörde host makine budur |
| Fiziksel cihaz (M2+) | `http://192.168.1.50:3001` (makinenin LAN IP'si, aynı Wi-Fi ağı şartı) |
| Her ikisinde de **yanlış** | `http://localhost:3001` — emülatörün/telefonun **kendisini** gösterir, host makineyi değil |

**Port 3001'dir, 3000 değil.**

### Diğer ön koşullar (ilk saatte patlayan şeyler)

- **Docker Desktop çalışıyor olmalı** (pg + redis + minio) **ve `api` ayakta olmalı**:
  ```bash
  cd ../api && npm run start:dev
  ```
  Emülatör açık olmadan `npx expo start` sonrası `a` tuşu iş görmez.
- **2FA test hesabı yerel veritabanında olmalı**, canlıdaki (kankaverse.com) hesap **değil** —
  `api/.env` yerel postgres'e bakıyor.
- **`api` CORS'una dokunma.** Native istemcide CORS diye bir şey yoktur (tarayıcı origin'i yok).
  "Telefondan/emülatörden bağlanamıyorum" belirtisinin çaresi CORS gevşetmek **değildir** — önce
  aynı ağ + API ayakta mı kontrol et.

## Çalıştırma

```bash
npx expo start
```

Sonra `a` (Android emülatör). Cihaz doğrulaması M0'da **Expo Go** ile yapılır (dev build M2'de gelir).

## Play Store release derlemesi (yerel, EAS'sız)

İmzalama `plugins/withReleaseSigning.js` config plugin'i ile yapılır — `android/` gitignore'lu ve her
`expo prebuild`de şablondan taze üretildiği için `android/app/build.gradle`'ı elle düzenlemek kalıcı
değildir. Plugin `signingConfigs.release`'i **Gradle property'lerinden** (`KV_UPLOAD_STORE_FILE`,
`KV_UPLOAD_STORE_PASSWORD`, `KV_UPLOAD_KEY_ALIAS`, `KV_UPLOAD_KEY_PASSWORD`, bu makinenin
`~/.gradle/gradle.properties` dosyasında) koşullu olarak enjekte eder; property yoksa release
bugünkü gibi debug anahtarıyla imzalanır, derleme patlamaz.

```bash
npx expo prebuild --platform android
cd android && ./gradlew bundleRelease
```

Çıktı: `android/app/build/outputs/bundle/release/app-release.aab`.

### `versionCode` artırma

`app.json` → `expo.android.versionCode` — Play her yüklemede **kesinlikle artan** bir tam sayı ister
(aynı `versionCode` ile ikinci bir yükleme reddedilir). `expo.version` (kullanıcıya görünen "1.0.0")
ile karışmasın — ayrı alanlar, ayrı amaçlar. Her Play'e yüklemeden önce elle 1 artır:

```jsonc
"android": { "versionCode": 2 }
```

## i18n — `tr.json` tek kaynak, ama üretilmiş kopya üzerinden okunur

Tek doğruluk kaynağı **`../web/src/i18n/tr.json`**. Mobil bunu **import eder, elle kopyalamaz.**

**Metro'nun proje kökü dışındaki bu dosyayı Windows'ta çözmesi denendi ve başarısız oldu** (3 yöntem:
`extraNodeModules` alias, özel `resolver.resolveRequest`, düz relative import + `watchFolders` —
üçü de "None of these files exist" hatasıyla patladı; Node'un kendi `path.resolve`'u aynı yolu
doğru çözdüğü halde). Contract §6'nın öngördüğü kaçış yoluna geçildi:

- `npm run i18n:sync` (`scripts/sync-i18n.js`) `web/src/i18n/tr.json`'u okuyup
  `src/i18n/tr.generated.json`'a yazar (başında `__GENERATED__` uyarı alanıyla).
- Bu dosya **gitignore'lı** ve **elle düzenlenmez** — her `start`/`android`/`ios`/`web`/`typecheck`/
  `lint` öncesi (`pre*` npm script'leri) otomatik yeniden üretilir.
- `src/i18n/index.ts`'teki `t(path, params)` helper'ı bu üretilmiş dosyayı okur.

Yeni mobil-özel metin gerekiyorsa **`web/src/i18n/tr.json`'daki `mobile.*` bölümüne** eklenir,
üretilmiş kopyaya değil (bir sonraki `i18n:sync` zaten senkronlar).

## Test hesabı oluşturma / temizleme (dev amaçlı)

```bash
# Oluştur
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test_mobil","email":"test_mobil@example.com","password":"TestSifre123","birthDate":"1995-01-01"}'

# Temizle (Session/AuthToken/RecoveryCode önce, sonra User)
docker exec kankaverse-postgres psql -U kankaverse -d kankaverse -c \
  "DELETE FROM \"Session\" WHERE \"userId\" = (SELECT id FROM \"User\" WHERE username = 'test_mobil');"
docker exec kankaverse-postgres psql -U kankaverse -d kankaverse -c \
  "DELETE FROM \"User\" WHERE username = 'test_mobil';"
```

## Mimari kısa özet

- `src/api/http.ts` — axios instance: `Bearer` + `X-Client-Type: mobile` request interceptor,
  envelope unwrap, 401 → tek-uçuş refresh (dedup). Access token yalnız bellekte; refresh token
  yalnız `expo-secure-store`.
- `src/stores/auth.ts` — zustand: bootstrap (refresh → `/auth/me`), login, 2FA challenge, logout.
- `src/i18n/index.ts` — `t()` helper (yukarıya bak).
- `src/theme/` — design token → RN stil objesi (`../web/src/styles/tokens.css` tek kaynak).
- `src/app/` — Expo Router: `index.tsx` (açılış/bootstrap yönlendirme), `(auth)/login.tsx`,
  `(auth)/two-factor.tsx`, `(app)/guilds.tsx`.
