// Sprint M0 contract §6 — tek doğruluk kaynağı `web/src/i18n/tr.json`. Metro'nun proje kökü
// dışındaki bu dosyayı Windows'ta güvenilir çözemediği doğrulandı (bkz. ../../scripts/sync-i18n.js
// başlığı — 3 farklı yöntem denendi) → contract'ın öngördüğü kaçış yoluna geçildi: `npm run
// i18n:sync` bu dosyayı ÜRETİLMİŞ bir kopyaya senkronlar (gitignore'lı, elle düzenlenmez).
// tr.json 1586 satır, tek bir "|" karakteri yok → çoğul-pipe desteği gerekmiyor (contract'ta
// doğrulandı), bu yüzden basit nokta-yolu + {key} interpolasyonlu bir helper yeterli.
import tr from './tr.generated.json';

type Dict = { [key: string]: string | Dict };

const dictionary = tr as unknown as Dict;

function resolve(path: string): string | Dict | undefined {
  return path.split('.').reduce<string | Dict | undefined>((acc, key) => {
    if (acc !== undefined && typeof acc === 'object') {
      return acc[key];
    }
    return undefined;
  }, dictionary);
}

/**
 * `t('a.b.c', { name: 'Kanka' })` — nokta yolunu çözer, `{key}` yer tutucularını değiştirir.
 * Anahtar yoksa anahtarın kendisini döner ve dev'de uyarı loglar (contract §6).
 */
export function t(path: string, params?: Record<string, string | number>): string {
  const value = resolve(path);
  if (typeof value !== 'string') {
    if (__DEV__) {
      console.warn(`[i18n] eksik anahtar: ${path}`);
    }
    return path;
  }
  if (!params) return value;
  return Object.keys(params).reduce(
    (acc, key) => acc.split(`{${key}}`).join(String(params[key])),
    value,
  );
}
