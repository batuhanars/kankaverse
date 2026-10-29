# Sprint C31e: Profil Etkinlik Kartı

Bağlam: C31b, C31c, C31d sözleşmeleri. Paralel: C33 (ortak dosyalara yalnız kendi anahtarları eklendi).

## 1. api (R7-hafif, presence yüzeyi)
- Oyun nesnesine `startedAt` (ISO) ve `storeUrl` (yalnız STEAM: `https://store.steampowered.com/app/<appid>`, diğerlerinde null).
- `startedAt` bellekte, `PresenceEntry.games` bağlantı başına `{ gameId, startedAt }`. Farklı gameId set edilince yenilenir, aynı oyun tekrar set edilince korunur.
- `activity:update` `game` nesnesi + `presence:snapshot` düz alanlar `gameStartedAt`, `gameStoreUrl`.
- `canSeePresence`, `activityConditions`, `activityAudienceFor` DEĞİŞMEZ.
- Testler: startedAt yenileme/koruma, storeUrl yalnız Steam.

## 2. web FullProfileModal
- Oyun varsa sekmelerin BAŞINA "Etkinlik" sekmesi, modal onunla açılır.
- "Mevcut Etkinlik" başlığı + kart: "Oynuyor", 64px logo (yoksa kol), ad, yeşil kol + canlı sa:dk:sn, Steam'de "Steam'de gör" (yeni sekme). "Son Etkinlik" YOK.
- Web activity store'a startedAt/storeUrl.

## 3. mobil ProfileSheetBody
- Aynı kart (`ProfileGameCard`): logo, ad, yeşil kol + canlı süre, Steam'de `Linking.openURL`. Mobil store + socket tipleri genişletildi.

## 4. i18n
- `profile.activity.{tab,current,playing,viewOnSteam}` (`web/src/i18n/tr.json`), em dash yok.

## Doğrulama
api build + jest + eslint; web `vue-tsc -b` (bilinen 6) + `vite build` + eslint; mobil typecheck + lint. Commit/derleme/cihaz testi yok.
