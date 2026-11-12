#!/usr/bin/env node
// vc68 dersi (2026-11-12): release paketi bayat `tr.generated.json` ile derlendi, kod yeni anahtarları
// kullanırken çeviriler pakette yoktu → ekranda ham anahtar ("mobile.notifications.showPreviewLabel",
// "e2ee.preview") göründü. Derleyici bunu yakalamaz; `t()` eksik anahtarda sessizce anahtarı döner.
// Bu denetim `src/` altındaki sabit `t('...')` anahtarlarını üretilmiş sözlükte arar. Şablonlu
// (`t(\`a.${x}\`)`) anahtarlar statik çözülemediği için atlanır.
/* global __dirname */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../src');
const DICT = path.resolve(__dirname, '../src/i18n/tr.generated.json');
const KEY_RE = /\bt\(\s*['"]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"]/g;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== path.join(SRC, 'i18n')) walk(full, out); // helper'ın kendi örnek yorumu sayılmasın
    }
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function resolve(dict, key) {
  return key.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), dict);
}

function findMissingKeys() {
  const dict = JSON.parse(fs.readFileSync(DICT, 'utf8'));
  const missing = new Map();
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(KEY_RE)) {
      if (typeof resolve(dict, m[1]) !== 'string' && !missing.has(m[1])) {
        missing.set(m[1], path.relative(SRC, file));
      }
    }
  }
  return missing;
}

module.exports = { findMissingKeys };

if (require.main === module) {
  const missing = findMissingKeys();
  if (missing.size === 0) {
    console.log('[i18n:check] tüm sabit anahtarlar sözlükte var');
  } else {
    for (const [key, file] of missing) console.error(`[i18n:check] eksik: ${key} (${file})`);
    process.exit(1);
  }
}
