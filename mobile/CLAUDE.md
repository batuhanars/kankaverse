@AGENTS.md

# Kankaverse — `mobile/` Tier CLAUDE.md

> Kök `CLAUDE.md` cascade ile zaten yükleniyor. **Cross-cutting kuralları buraya kopyalama.**
> Aktif sözleşme: `../contracts/SPRINT_M1A_MOBILE_SHELL_CONTRACT.md` = **tek doğruluk kaynağı**
> (M0 bitti, sözleşmesi arşiv değeri taşıyor).
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
- Cihaz doğrulaması **Expo Go** ile (dev build M2'de gelir). `npx expo start` → telefonda QR.
- `EXPO_PUBLIC_API_URL` makinenin LAN IP'si olmalı; `localhost` fiziksel cihazdan çalışmaz.
- Telefon bağlanamıyorsa **CORS'a dokunma** — native'de CORS yok, sebep başka yerdedir.
