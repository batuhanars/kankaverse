#!/usr/bin/env node
// Sprint M0 contract §6 kaçış yolu (önceden onaylı).
//
// Denenen + başarısız olan yollar (bu sırayla, Windows'ta):
//   1. `extraNodeModules` alias'ı ('@i18n' -> web/src/i18n dizini)
//   2. Özel `resolver.resolveRequest` (aynı alias'ı manuel çözen fallback'li versiyon)
//   3. Düz relative import (`../../../web/src/i18n/tr.json`) + `watchFolders`
// Üçü de Metro'nun "None of these files exist" hatasıyla patladı — Metro-resolver Windows'ta
// proje kökü dışına çıkan ".." zincirini yanlış birleştiriyor (Node'un kendi path.resolve'u AYNI
// yolu doğru çözüyor — Metro'ya özgü bir bug). ~30 dakika sınırı aşıldığı için contract §6'nın
// öngördüğü kaçış yoluna geçildi: tek doğruluk kaynağı `web/src/i18n/tr.json`, bu script onu
// mobile/src/i18n/tr.generated.json'a KOPYALAR. Kopya ELLE DÜZENLENMEZ — her çalıştırmada üstüne
// yazılır (bkz. package.json `pre*` script'leri). Gitignore'lı.
const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '../../web/src/i18n/tr.json');
const target = path.resolve(__dirname, '../src/i18n/tr.generated.json');

const data = JSON.parse(fs.readFileSync(source, 'utf8'));
const withHeader = {
  __GENERATED__:
    'ÜRETİLMİŞ DOSYA — elle düzenleme. Tek doğruluk kaynağı web/src/i18n/tr.json; bu dosya `npm run i18n:sync` ile senkronlanır (start/android/typecheck öncesi otomatik çalışır).',
  ...data,
};

fs.writeFileSync(target, JSON.stringify(withHeader, null, 2) + '\n', 'utf8');
console.log(`[i18n:sync] ${source} -> ${target}`);
