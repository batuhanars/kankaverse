const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// Sprint M0 contract §6 — i18n. Denendi ve Windows'ta Metro'nun proje kökü dışına çıkan
// resolver'ı güvenilmez çıktı (extraNodeModules + custom resolveRequest + plain relative import,
// üçü de "None of these files exist" ile patladı — bkz. scripts/sync-i18n.js başlığı). Kaçış
// yoluna geçildi: `web/src/i18n/tr.json` `npm run i18n:sync` ile `src/i18n/tr.generated.json`'a
// kopyalanıyor, proje kendi kökü İÇİNDEN okuyor.
const config = getDefaultConfig(__dirname);

// vc68 dersi (2026-11-12): `gradlew bundleRelease` npm `pre*` script'lerini çalıştırmaz → bayat
// sözlükle paket çıktı, ekranda ham anahtarlar göründü. Metro her paketlemede (dev ve release) bu
// dosyayı yüklediği için senkron + denetim burada. Release paketlemesinde eksik anahtar derlemeyi
// durdurur; dev'de yalnız uyarır.
require('./scripts/sync-i18n.js');
const missingI18n = require('./scripts/check-i18n.js').findMissingKeys();
if (missingI18n.size > 0) {
  const list = [...missingI18n].map(([key, file]) => `  ${key} (${file})`).join('\n');
  const msg = `[i18n] sözlükte olmayan anahtarlar:\n${list}`;
  const isExport = process.argv.some((a) => a.startsWith('export'));
  if (isExport) throw new Error(msg);
  console.warn(msg);
}

// E1 §6.1/§6.3 — tek çekirdek, iki istemci: `shared/e2ee-core` ve `shared/e2ee-client` kaynağından
// derlenir, KOPYALANMAZ. Proje kökü dışı olduğu için Metro'ya hem izleme (watchFolders) hem paket
// adı çözümü (extraNodeModules) açıkça söylenir. Bu paketlerin kendi bağımlılıkları (ts-mls, noble)
// kendi `node_modules`'lerinden çözülür (hiyerarşik arama açık kalır; derleme öncesi `npm ci` şart).
const sharedRoot = path.resolve(__dirname, '..', 'shared');
const e2eePackages = {
  '@kankaverse/e2ee-core': path.join(sharedRoot, 'e2ee-core'),
  '@kankaverse/e2ee-client': path.join(sharedRoot, 'e2ee-client'),
};

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), ...e2eePackages };

module.exports = config;
