// Bekleyen Welcome'lar: gruba katılma (E1 §2.4). Kimlik doğrulama çekirdekte: Welcome'daki ağacın
// HER yaprağı sunucu listesine karşı bayt-bayt doğrulanır, tanınmayan varsa katılım reddedilir.
import { NoMatchingKeyPackageError, joinFromWelcome, type Device } from '@kankaverse/e2ee-core'
import type { E2eeWelcomeRow } from './ports'
import { fromB64, toB64 } from './b64'
import { guardUntrusted } from './commitSync'
import type { E2eeContext } from './context'
import { observeLeaves } from './deviceNotices'
import { topUpKeyPackages } from './deviceSetup'
import { devicesOf } from './registry'
import { isStaleGroup } from './staleGroup'

/**
 * Yerel grup yoksa, bu cihaz gruptan çıkarılmışsa ya da yerel grup BAYATSA (groupId sunucudakiyle
 * uyuşmuyor, §6.4) katılınır; aksi halde Welcome bayat sayılır. Sunucu durumu okunamazsa hata çıkar,
 * yerel grup silinmez.
 */
async function joinOne(ctx: E2eeContext, device: Device, row: E2eeWelcomeRow): Promise<boolean> {
  const { data } = await ctx.api.channelState(row.channelId)
  const local = await ctx.store.loadGroup(row.channelId)
  if (local && local.isActive && !isStaleGroup(local, data)) return false
  const devices = devicesOf(data)
  const { registered } = devices // iptaller ve eski üyeler dahil: ağaçta geçmişten kalan yaprak olabilir
  const group = await guardUntrusted(ctx, row.channelId, () =>
    joinFromWelcome(device, fromB64(row.welcome), registered),
  )
  // Sunucunun güncel grubuna ait olmayan Welcome (eski grubun artığı) işlenmez, yerel durum bozulmaz.
  if (data.groupId && toB64(group.groupId) !== data.groupId) return false
  // Katılma KeyPackage'ı tüketir: önce cihaz, sonra grup diske (yarıda kalırsa Welcome yeniden gelir).
  await ctx.store.saveDevice(device)
  await ctx.store.saveGroup(row.channelId, group)
  await ctx.store.saveJoinedAt(row.channelId, Date.now())
  await observeLeaves(ctx, row.channelId, group, devices) // E2 §3.3: bu andan sonraki eklemeler "yeni cihaz"
  if (local && !local.isActive) ctx.warn(row.channelId, null) // çıkarılmıştık, geri eklendik: "çıkarıldı" bandı kalkar
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
