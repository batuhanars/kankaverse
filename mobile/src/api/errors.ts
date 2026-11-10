import { DeviceRemovedError, GroupNotReadyError } from '@kankaverse/e2ee-client';
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
  // E1: yerel şifreleme hataları ağ hatası değildir (sunucu yanıtı yok): doğru sebep gösterilir.
  if (err instanceof GroupNotReadyError) return t('e2ee.errors.notReady');
  if (err instanceof DeviceRemovedError) return t('e2ee.errors.deviceRemoved');
  const response = (err as { response?: { data?: ErrorEnvelope } }).response;
  if (response?.data?.error && __DEV__) {
    console.warn(`[api] hata kodu: ${response.data.error}`);
  }
  return response?.data?.message ?? t('common.error');
}

/**
 * Envelope'tan MAKİNE kodunu çıkarır (`error` alanı) — Sprint M1d.
 *
 * ⚠️ Bu, "hata koduna göre metin uydur" kapısı DEĞİL. Kullanıcıya gösterilen metin her zaman
 * sunucunun `message`'ıdır (yukarıdaki fonksiyon). Bu yalnız **davranış** dallanması gereken tek
 * yer için var: `ALREADY_MEMBER` (409) bir hata değil, "zaten oradasın" bilgisidir — kullanıcıyı
 * hata ekranında bırakmak yerine o ortama götürürüz (sözleşme §2.2, DoD-A/3).
 * Yeni bir kod için dallanmadan önce sözleşmeye bak; kod-bazlı metin katmanı açılmayacak.
 */
export function extractErrorCode(err: unknown): string | null {
  const response = (err as { response?: { data?: ErrorEnvelope } }).response;
  return response?.data?.error ?? null;
}
