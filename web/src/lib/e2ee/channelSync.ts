// Kanal düzeyi senkron: commit'leri işle + üyelik farkını kapat; kanal açılışı; gönderim öncesi grup.
import type { Group } from '@kankaverse/e2ee-core'
import { catchUp, guardUntrusted, type ChannelView } from './commitSync'
import { GroupNotReadyError, type E2eeContext } from './context'
import { createChannelGroup } from './groupCreate'
import { reconcile } from './reconcile'
import { devicesOf } from './registry'
import { processWelcomes } from './welcomes'

export interface ChannelInfo {
  encrypted: boolean
  /** Ayraç zamanı: şifreli bölümün başlangıcı (E2eeGroup.createdAt). */
  createdAt: string | null
}

/** Bu cihaz gruptan çıkarıldı: gönderemez, sohbette uyarı görünür. */
export class DeviceRemovedError extends Error {}

export async function syncGroup(
  ctx: E2eeContext,
  channelId: string,
  group: Group,
  view: ChannelView,
) {
  await guardUntrusted(ctx, channelId, async () => {
    await catchUp(ctx, channelId, group, view)
    await reconcile(ctx, channelId, group, view)
  })
}

/** Yerel grubu yükler ve eşitler; grup yoksa null. */
export async function syncChannel(ctx: E2eeContext, channelId: string): Promise<Group | null> {
  const group = await ctx.store.loadGroup(channelId)
  if (!group) return null
  const view = { devices: devicesOf((await ctx.api.channelState(channelId)).data) }
  await syncGroup(ctx, channelId, group, view)
  return group
}

/**
 * DM açılışı: şifreli mi öğren, şifreliyse bekleyen Welcome'ları işle. Commit senkronu BİLİNÇLİ burada
 * yok: gruptan çıkarılan bir cihazın henüz çözülmemiş mesajı, çıkarma commit'i işlendikten sonra
 * çözülemez (ts-mls: yaprak yok). Önce mesajlar çözülür, senkron arkasından gelir (`onGroupChanged`).
 */
export async function openChannel(ctx: E2eeContext, channelId: string): Promise<ChannelInfo> {
  const { data: state } = await ctx.api.channelState(channelId)
  const info = { encrypted: state.encrypted, createdAt: state.createdAt }
  if (!state.encrypted) return info
  if (!(await ctx.store.loadGroup(channelId))) await processWelcomes(ctx)
  return info
}

/**
 * Gönderim için grup: şifreliyse yerel grup (yoksa Welcome bekle), şifreli değilse kur. `null` = DM
 * şifresiz kalacak (karşı taraf uygun değil); o durumda istemci düz gönderir.
 */
export async function groupForSend(ctx: E2eeContext, channelId: string): Promise<Group | null> {
  const { data: state } = await ctx.api.channelState(channelId)
  if (!state.encrypted) {
    const outcome = await createChannelGroup(ctx, channelId, state)
    if (outcome === 'ineligible') return null
    if (outcome === 'exists') await processWelcomes(ctx)
  }
  let group = await ctx.store.loadGroup(channelId)
  if (!group) {
    await processWelcomes(ctx)
    group = await ctx.store.loadGroup(channelId)
  }
  if (!group) throw new GroupNotReadyError()
  if (!group.isActive) throw new DeviceRemovedError()
  return group
}
