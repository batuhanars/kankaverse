const { getDefaultConfig } = require('expo/metro-config');

// Sprint M0 contract §6 — i18n. Denendi ve Windows'ta Metro'nun proje kökü dışına çıkan
// resolver'ı güvenilmez çıktı (extraNodeModules + custom resolveRequest + plain relative import,
// üçü de "None of these files exist" ile patladı — bkz. scripts/sync-i18n.js başlığı). Kaçış
// yoluna geçildi: `web/src/i18n/tr.json` `npm run i18n:sync` ile `src/i18n/tr.generated.json`'a
// kopyalanıyor, proje kendi kökü İÇİNDEN okuyor. Bu yüzden burada watchFolders/resolver
// özelleştirmesi yok — varsayılan config yeterli.
module.exports = getDefaultConfig(__dirname);
