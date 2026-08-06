@AGENTS.md

# Kankaverse — `mobile/` Tier CLAUDE.md

> Kök `CLAUDE.md` cascade ile zaten yükleniyor. **Cross-cutting kuralları buraya kopyalama.**
> Aktif sözleşme: `../contracts/SPRINT_M4A_MOBILE_VOICE_CONTRACT.md` = **tek doğruluk kaynağı**
> (biten sprintlerin sözleşmeleri arşiv değeri taşır; kabuk kararları için `SPRINT_M1A_MOBILE_SHELL_CONTRACT.md`).
> Endpoint imzası, DTO şekli, ekran sayısı sözleşmeden **sapamaz**. Sapma ihtiyacı → **DUR**, kullanıcıya bildir,
> PM revize etsin. `TASK.md`'ye item ekleme, yalnız kutu işaretle.

## Tier nedir

Kankaverse'in **React Native + Expo** istemcisi (Track F2, Android-first). Stack kilitli: ADR 2026-07-02 +
mutabakat 2026-07-22 ile Flutter'dan RN'e revize edildi. Bu tier'da stack tartışması kapalı.

Kurulu taban: **Expo SDK 54 / RN 0.81 / React 19.1**, Expo Router, TypeScript strict.
API'yi hatırdan yazma, `AGENTS.md`'deki sürümlü dokümana bak.

**Sürüm kilidi (2026-07-30):** SDK, "kurulum anındaki en güncel kararlı sürüm" değil **telefondaki
mağaza Expo Go'sunun desteklediği** sürümdür (şu an 54). SDK 57 ile kurulmuştu, emülatörde sorunsuzdu
ama gerçek telefonda "Project is incompatible with this version of Expo Go" ile açılmadı — çünkü Expo CLI
emülatöre projeye uyan Expo Go'yu indirir, Play Store indirmez. SDK'yı yükseltme; bu bağımlılık dev
build (M2) ile kalkar.

## Sınırlar

- **Rotalar `src/app/` altında.** Kökte `app/` açma; `tsconfig` `@/*` → `./src/*`.
- **Bağımlılık ekleme = PM onayı.** İstisna: `npx expo install`'un dayattığı peer'lar (onay istemez).
  Doğrudan kütüphane seçimi (state, UI kit, form, tarih) sözleşmede yoksa **sor**.
- Yalnız bu tier'a dokun. `api/` veya `web/` değişikliği gerekiyorsa **DUR** ve bildir.

## Kurallar

- **i18n:** kullanıcıya görünen hiçbir string koda gömülmez. Kaynak `web/src/i18n/tr.json`;
  **import edilir, KOPYALANMAZ.** Mobil-özel metinler `mobile.*` altına, o dosyaya eklenir.
- **Tema:** renk/ölçü/yarıçap bileşen içine gömülmez, `src/theme` üzerinden gelir. Kaynak
  `knowledge/projects/kankaverse/kankaverse-design-tokens.md`. Web'de olmayan token uydurma.
- **Marka görselleri:** `assets/brand/` altındaki dosyalar `web/src/assets/brand`'in **kopyasıdır**
  (Metro proje kökü dışını çözemiyor; i18n'deki aynı sınır). Kaynak orası — marka değişirse iki yerde de
  güncellenir. Dikey kilit (altıgen + kelime işareti) giriş ekranında, yazısız altıgen açılış ekranında.
- **Envelope:** her yanıt `{ success, statusCode, data }`. Gerçek veri `response.data.data`'dan çıkar.
  Kullanıcıya `message` (Türkçe) gösterilir, `error` kodu loglanır. Ham hata metni ekrana basılmaz.
- **Token:** refresh → `expo-secure-store`. Access → **yalnız bellekte**. AsyncStorage'a token **asla** yazılmaz.
  Her `/auth/refresh` yanıtındaki yeni refresh token secure store'a **üstüne yazılır** (yoksa reuse-detection
  kullanıcıyı sebepsiz atar).
- **T&S:** yaş/erişim/medya **kapıları backend otoritesindedir**. İstemci yalnız sonucu gösterir; kapıyı
  istemcide kurma, backend'in verdiği kararı istemcide gevşetme. Kapalı bir yüzeyi "sessizce gizleme" yerine
  sözleşme ne diyorsa onu yap.
- **Boş yüzey açma:** olmayan özelliğe buton/iskele koyma. Tıklayınca hiçbir şey yapmayan şey konmaz.

## Doğrulama

- `npm run typecheck` (tsc --noEmit) ve `npm run lint` temiz olacak.
- Cihaz doğrulaması **dev build** ile (`npx expo start --dev-client`); M2'den beri Expo Go değil.
- `EXPO_PUBLIC_API_URL` makinenin LAN IP'si olmalı; `localhost` fiziksel cihazdan çalışmaz.
- Telefon bağlanamıyorsa **CORS'a dokunma** — native'de CORS yok, sebep başka yerdedir.

### 🔴 Yeni native paket = yeni dev build (2026-08-04 dersi)

`expo start --dev-client` yalnız **JavaScript'i** yeniler; native kabuk telefondaki APK'dır. Native
kod içeren bir paket eklendiğinde (çoğu `expo-*` ve `react-native-*`, ayrıca `app.json` `plugins`
girdisi gerektiren her şey) **mevcut APK geçersizdir** ve yeniden derlenmeli:

```
cd mobile && npx eas-cli build --profile development --platform android
```

> `npx eas build` **çalışmaz** — ikili `eas-cli` paketinden gelir, `eas` diye bir paket yok
> ("could not determine executable to run" hatası budur).

**İmza belirti:** uygulama açılışta modül yüklenirken patlar, yığının dibinde bir rota dosyası
(`src/app/...`) görünür ve asıl hata `Cannot find native module '...'` der. Kodda arama —
JS tarafı doğru, eksik olan native taraf. M3c'de `expo-media-library` + `expo-document-picker`
eklenince tam olarak bu yaşandı.

**Saf JS paketleri bu şartı doğurmaz** (örn. `rn-emoji-keyboard`) — eski build'de de çalışırlar.
