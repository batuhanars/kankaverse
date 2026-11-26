import type { EvictedDevice } from '@kankaverse/e2ee-client';
import { showToast } from '@/stores/toast';
import { t } from '@/i18n';

/** C79: cihaz satırının adı. Etiket (oturumun cihaz adı) yoksa platform adı. Web `lib/e2ee/deviceNotices` karşılığı. */
export function deviceName(d: { label?: string | null; platform: string }): string {
  if (d.label) return d.label;
  return t(d.platform === 'android' ? 'e2ee.identity.platformAndroid' : 'e2ee.identity.platformWeb');
}

/** C79 §5: yer açmak için eski bir cihaz çıkarıldıysa kullanıcı bunu bilsin (sessiz kapatma yok). */
export function announceEvicted(evicted: EvictedDevice | null | undefined): void {
  if (evicted) showToast(t('e2ee.devices.evicted', { device: deviceName(evicted) }));
}

/** C79 §5: cihaz sınırına takıldı; Hesap güvenliğindeki kutuya ek olarak bir kez bildirim. */
export function announceDeviceLimit(): void {
  showToast(t('e2ee.devices.limitTitle'));
}

/** C79: `initE2ee` hatası cihaz sınırından mı (errorTag çıktısı: "AxiosError 422 E2EE_DEVICE_LIMIT ..."). */
export const isDeviceLimit = (tag: string): boolean => tag.includes('E2EE_DEVICE_LIMIT');
