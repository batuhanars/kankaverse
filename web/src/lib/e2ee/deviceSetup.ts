// Cihaz kaydı ve KeyPackage stoku (E1 §2.3).
import { createDevice, webProvider, type Device } from '@kankaverse/e2ee-core'
import { toB64 } from './b64'
import type { E2eeApi } from './context'
import type { LocalStore } from './localStore'

const LOW_WATERMARK = 10 // sunucudaki tüketilmemiş paket bunun altına inince
const TARGET_STOCK = 20 // bu sayıya tamamlanır

/** Yerel cihaz kimliği sunucunun bu oturum için bildirdiğinden farklı: durum bu oturuma ait değil. */
export class DeviceBrokenError extends Error {}

/**
 * Cihazı (yoksa) üretir, sunucuya kaydeder, KeyPackage stokunu tamamlar. Idempotent: aynı oturum
 * zinciriyle tekrar çağrı aynı deviceId'yi döner. Yeni girişte yerel depo zaten silinmiştir (auth.login),
 * bu yüzden "yerelde cihaz var ama sunucu başka kimlik verdi" yalnız bozuk durumdur ve açıkça reddedilir.
 */
export async function ensureDevice(api: E2eeApi, store: LocalStore): Promise<Device> {
  const device = (await store.loadDevice()) ?? (await createDevice(webProvider))
  const { data } = await api.registerDevice(toB64(device.signaturePublicKey))
  // Kimlik değişirse credential'lar yanlış kimliği taşırdı: sessizce devam yerine dur.
  if (device.deviceId !== null && device.deviceId !== data.deviceId) throw new DeviceBrokenError()
  device.assignDeviceId(data.deviceId)
  await store.saveDevice(device)
  await topUpKeyPackages(api, store, device)
  return device
}

/** Sunucudaki stok 10'un altındaysa 20'ye tamamlar; son çare paketi ilk seferde yükler. */
export async function topUpKeyPackages(api: E2eeApi, store: LocalStore, device: Device) {
  const flags = await store.loadFlags()
  const { data } = await api.available()
  if (data.available >= LOW_WATERMARK && flags.lastResortUploaded) return
  const fresh =
    data.available < LOW_WATERMARK
      ? await device.exportKeyPackages(TARGET_STOCK - data.available)
      : []
  const lastResort = flags.lastResortUploaded
    ? undefined
    : await device.exportLastResortKeyPackage()
  // Önce yerele yaz: sunucuya giden her paketin özel anahtarı diskte olmadan Welcome gelirse katılamayız.
  await store.saveDevice(device)
  await api.uploadKeyPackages(fresh.map(toB64), lastResort ? toB64(lastResort) : undefined)
  if (lastResort) await store.saveFlags({ lastResortUploaded: true })
}
