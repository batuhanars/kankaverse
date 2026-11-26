import type { EvictedDevice } from '@kankaverse/e2ee-client'
import { i18n } from '@/i18n'
import { useToastStore } from '@/stores/toast'

/** C79: cihaz satırının adı. Etiket (oturumun cihaz adı) yoksa platform adı. */
export function deviceName(d: { label?: string | null; platform: string }): string {
  if (d.label) return d.label
  return i18n.global.t(
    d.platform === 'android' ? 'e2ee.identity.platformAndroid' : 'e2ee.identity.platformWeb',
  )
}

/** C79 §4: yer açmak için eski bir cihaz çıkarıldıysa kullanıcı bunu bilsin (sessiz kapatma yok). */
export function announceEvicted(evicted: EvictedDevice | null | undefined): void {
  if (!evicted) return
  useToastStore().info(i18n.global.t('e2ee.devices.evicted', { device: deviceName(evicted) }))
}

/** C79 §4: cihaz sınırına takıldı; Ayarlar'daki kutuya ek olarak bir kez bildirim (sessiz kalmasın). */
export function announceDeviceLimit(): void {
  useToastStore().error(i18n.global.t('e2ee.devices.limitTitle'))
}

/** C79: `init` hatası cihaz sınırından mı (e2eeErrorTag çıktısı: "AxiosError 422 E2EE_DEVICE_LIMIT ..."). */
export const isDeviceLimit = (tag: string): boolean => tag.includes('E2EE_DEVICE_LIMIT')

/** C79: cihaz listesindeki "Son kullanım" için kısa göreli süre (profil etkinliğiyle aynı metinler). */
export function agoText(iso: string, now = Date.now()): string {
  const m = Math.floor((now - new Date(iso).getTime()) / 60000)
  const t = i18n.global.t
  if (m < 1) return t('profile.activity.justNow')
  if (m < 60) return t('profile.activity.minutesAgo', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('profile.activity.hoursAgo', { n: h })
  return t('profile.activity.daysAgo', { n: Math.floor(h / 24) })
}
