import { t } from '@/i18n';

/** "1.200 kredi" — TR yereli, tam sayı (web `aiVideo.credits` + `n()` ile aynı metin). */
export function formatCredits(value: number): string {
  return t('aiVideo.credits', { amount: formatCreditNumber(value) });
}

/** Birimsiz sayı ("Bugün 120 / 300 kredi" satırında birim bir kez yazılır). */
export function formatCreditNumber(value: number): string {
  try {
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  } catch {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
}
