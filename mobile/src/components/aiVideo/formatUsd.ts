import { t } from '@/i18n';

/** "0,25 $" — TR yereli, iki ondalık (web `aiVideo.amount` + `n()` ile aynı metin). */
export function formatUsd(value: number): string {
  let text: string;
  try {
    text = value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    text = value.toFixed(2).replace('.', ',');
  }
  return t('aiVideo.amount', { amount: text });
}
