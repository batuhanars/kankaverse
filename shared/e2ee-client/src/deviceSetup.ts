// Cihaz kaydı ve KeyPackage stoku (E1 §2.3).
import { createDevice, rebindMessage, type CryptoProvider, type Device } from '@kankaverse/e2ee-core'
import { fromB64, toB64 } from './b64'
import type { E2eeApi } from './context'
import { e2eeErrorCode } from './errors'
import type { LocalStore } from './localStore'

const LOW_WATERMARK = 10 // sunucudaki tüketilmemiş paket bunun altına inince
const TARGET_STOCK = 20 // bu sayıya tamamlanır

/** Yerel cihaz kimliği sunucunun bu oturum için bildirdiğinden farklı: durum bu oturuma ait değil. */
export class DeviceBrokenError extends Error {}

/** C69: sunucu yeniden bağlamayı reddetti (park yok/iptal/imza/nonce); yerel durum bu hesap için geçersiz. */
const REBIND_REJECTED_CODES = new Set(['E2EE_REBIND_REJECTED', 'E2EE_DEVICE_REQUIRED'])
/** Sunucuda kullanıcı başına tek bekleyen nonce var: başka cihazın girişi nonce'u düşürebilir (yarış, silme sebebi DEĞİL). */
const NONCE_INVALID = 'E2EE_REBIND_NONCE_INVALID'
const NONCE_RETRY_DELAY_MS = [200, 600] as const

/**
 * Yerel cihaz bu oturum zincirine bağlı mı? Etkin cihaz varsa `available` 200 döner; yoksa/iptalse 403
 * E2EE_DEVICE_REQUIRED. Diğer hatalar (ağ, 5xx) yukarı çıkar: karar verilemedi, yerel SİLİNMEZ.
 */
async function isBoundToSession(api: E2eeApi): Promise<boolean> {
  try {
    await api.available()
    return true
  } catch (e) {
    if (e2eeErrorCode(e) === 'E2EE_DEVICE_REQUIRED') return false
    throw e
  }
}

/**
 * C69 §1/§3: çıkışta park edilmiş cihazı yeni oturum zincirine bağlar (challenge, cihaz imza anahtarıyla
 * imza, rebind). `false` = sunucu reddetti (4xx makine kodu): çağıran yerel depoyu silip yeni cihaz akışına düşer.
 * Ağ/5xx hatası fırlar, yerel dokunulmaz (bir sonraki açılışta tekrar denenir).
 */
async function rebindParked(api: E2eeApi, device: Device, userId: string): Promise<boolean> {
  const deviceId = device.deviceId
  if (deviceId === null) return false
  if (await isBoundToSession(api)) return true // aynı oturumla yeniden açılış: bağlama gerekmez
  for (let attempt = 0; ; attempt++) {
    try {
      const { data } = await api.rebindChallenge()
      const nonce = fromB64(data.nonce)
      const signature = await device.sign(rebindMessage(nonce, userId, deviceId))
      await api.rebind(deviceId, toB64(signature))
      return true
    } catch (e) {
      const code = e2eeErrorCode(e)
      if (code && REBIND_REJECTED_CODES.has(code)) return false
      // Nonce yarışı: bir kez daha dene; ikinci kez de düşerse SİLME, hatayı yukarı ver (sonraki açılışta tekrar).
      if (code !== NONCE_INVALID || attempt >= 1) throw e
      const [min, max] = NONCE_RETRY_DELAY_MS
      await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)))
    }
  }
}

/**
 * Cihazı (yoksa) üretir, sunucuya kaydeder, KeyPackage stokunu tamamlar. Idempotent: aynı oturum
 * zinciriyle tekrar çağrı aynı deviceId'yi döner. C69: yerelde cihaz varsa ve oturum zincirine bağlı değilse
 * (çıkışta park edilmişti) önce yeniden bağlanır; reddedilirse bu hesabın yerel deposu silinip yeni cihaz kurulur.
 * Yerel cihaz var + sunucu başka kimlik verdi = bozuk durum, açıkça reddedilir.
 */
export async function ensureDevice(
  api: E2eeApi,
  store: LocalStore,
  provider: CryptoProvider,
  userId: string,
): Promise<Device> {
  let existing = await store.loadDevice()
  if (existing && !(await rebindParked(api, existing, userId))) {
    await store.wipeAll()
    existing = null
  }
  const device = existing ?? (await createDevice(provider))
  const { data } = await api.registerDevice(toB64(device.signaturePublicKey))
  // Kimlik değişirse credential'lar yanlış kimliği taşırdı: sessizce devam yerine dur.
  if (device.deviceId !== null && device.deviceId !== data.deviceId) throw new DeviceBrokenError()
  device.assignDeviceId(data.deviceId)
  await store.saveDevice(device)
  // E5b §4.4: geçmiş bandı yalnız YENİ kaydolan cihazda (sahip bulgusu 2026-11-12: güncellenen eski cihazda
  // da çıkıyordu). KeyPackage yüklemesinden ÖNCE: ağ hatasında da cihaz "yeni" işaretli kalır.
  if (!existing) await store.patchFlags({ historyFresh: true })
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
  if (lastResort) await store.saveFlags({ ...flags, lastResortUploaded: true })
}
