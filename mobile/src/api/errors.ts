import { t } from '@/i18n';

interface ErrorEnvelope {
  message?: string;
  error?: string;
}

/**
 * Envelope hata gövdesinden kullanıcıya gösterilecek Türkçe mesajı çıkarır (kök CLAUDE.md
 * envelope kuralı: `message` gösterilir, `error` kodu loglanır). Ham hata metni ekrana basılmaz.
 */
export function extractErrorMessage(err: unknown): string {
  const response = (err as { response?: { data?: ErrorEnvelope } }).response;
  if (response?.data?.error && __DEV__) {
    console.warn(`[api] hata kodu: ${response.data.error}`);
  }
  return response?.data?.message ?? t('common.error');
}
