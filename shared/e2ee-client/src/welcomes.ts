// Bekleyen Welcome'lar: gruba katılma (E1 §2.4). Kimlik doğrulama çekirdekte: Welcome'daki ağacın
// HER yaprağı sunucu listesine karşı bayt-bayt doğrulanır, tanınmayan varsa katılım reddedilir.
import { NoMatchingKeyPackageError, joinFromWelcome, type Device } from '@kankaverse/e2ee-core'
import type { E2eeWelcomeRow } from './ports'
import { fromB64 } from './b64'
import { guardUntrusted } from './commitSync'
import type { E2eeContext } from './context'
import { topUpKeyPackages } from './deviceSetup'
import { devicesOf } from './registry'

/** Yerel grup yoksa ya da bu cihaz gruptan çıkarılmışsa katılınır; aksi halde Welcome bayat sayılır. */
async function needsJoin(ctx: E2eeContext, channelId: string): Promise<boolean> {
  const local = await ctx.store.loadGroup(channelId)
  return !local || !local.isActive
}

async function joinOne(ctx: E2eeContext, device: Device, row: E2eeWelcomeRow): Promise<boolean> {
  if (!(await needsJoin(ctx, row.channelId))) return false
  const { data } = await ctx.api.channelState(row.channelId)
  const { registered } = devicesOf(data) // iptaller dahil: ağaçta geçmişten kalan yaprak olabilir
  const group = await guardUntrusted(ctx, row.channelId, () =>
    joinFromWelcome(device, fromB64(row.welcome), registered),
  )
  // Katılma KeyPackage'ı tüketir: önce cihaz, sonra grup diske (yarıda kalırsa Welcome yeniden gelir).
  await ctx.store.saveDevice(device)
  await ctx.store.saveGroup(row.channelId, group)
  return true
}

/** Welcome'ları sırayla işler ve ack'ler. Katılınan kanal kimlikleri döner (ardından senkron çalışır). */
export async function processWelcomes(ctx: E2eeContext): Promise<string[]> {
  const { data } = await ctx.api.welcomes()
  if (data.length === 0) return []
  const device = await ctx.getDevice()
  const joined: string[] = []
  for (const row of data) {
    try {
      if (await joinOne(ctx, device, row)) joined.push(row.channelId)
    } catch (e) {
      // Cihazda eşleşen paket yok: bu Welcome hiçbir zaman işlenemez, ack ile kuyruktan düşür.
      // Tanınmayan cihaz hatasında ACK YOK: uyarı çıktı, mesajlaşma durur, Welcome kanıt olarak kalır.
      if (!(e instanceof NoMatchingKeyPackageError)) throw e
    }
    await ctx.api.ackWelcome(row.id)
  }
  await topUpKeyPackages(ctx.api, ctx.store, device)
  return joined
}
