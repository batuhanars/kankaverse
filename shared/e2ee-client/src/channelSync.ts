// Kanal düzeyi senkron: commit'leri işle + üyelik farkını kapat; kanal açılışı; gönderim öncesi grup.
import type { Group } from '@kankaverse/e2ee-core'
import { catchUp, guardUntrusted, type ChannelView } from './commitSync'
import { GroupNotReadyError, type E2eeContext } from './context'
import { createChannelGroup } from './groupCreate'
import { plan, reconcile } from './reconcile'
import { devicesOf } from './registry'
import { dropStaleGroup } from './staleGroup'
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

/**
 * Yerel grubu yükler ve eşitler; grup yoksa null. Yerel grup bayatsa (§6.4) düşülür; sunucuda yeni grup
 * varsa bekleyen Welcome ile katılınır. Bayat grupla commit işlenmez.
 */
export async function syncChannel(ctx: E2eeContext, channelId: string): Promise<Group | null> {
  if (!(await ctx.store.loadGroup(channelId))) return null
  const { data: state } = await ctx.api.channelState(channelId)
  if (await dropStaleGroup(ctx, channelId, state)) {
    if (!state.encrypted) return null
    await processWelcomes(ctx)
  }
  const group = await ctx.store.loadGroup(channelId)
  if (!group) return null
  const view = { devices: devicesOf(state) }
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
  await dropStaleGroup(ctx, channelId, state) // geri alma sonrası bayat grup (§6.4)
  if (!state.encrypted) return info
  const local = await ctx.store.loadGroup(channelId)
  if (!local || !local.isActive) await processWelcomes(ctx) // pasif grup = yok (geri eklenmiş olabiliriz)
  return info
}

/**
 * Gönderim için grup: şifreliyse yerel grup (yoksa Welcome bekle), şifreli değilse kur. `null` = DM
 * şifresiz kalacak (karşı taraf uygun değil); o durumda istemci düz gönderir.
 */
export async function groupForSend(ctx: E2eeContext, channelId: string): Promise<Group | null> {
  const { data: state } = await ctx.api.channelState(channelId)
  await dropStaleGroup(ctx, channelId, state) // bayat grupla şifreleme yok (§6.4)
  if (!state.encrypted) {
    const outcome = await createChannelGroup(ctx, channelId, state)
    if (outcome === 'ineligible') return null
    if (outcome === 'exists') await processWelcomes(ctx)
  }
  let group = await ctx.store.loadGroup(channelId)
  if (!group || !group.isActive) {
    // Pasif yerel grup (çıkarılmıştık) "yok" sayılır: geri eklendiysek bekleyen Welcome ile yeniden katılırız.
    await processWelcomes(ctx)
    group = await ctx.store.loadGroup(channelId)
  }
  if (!group) throw new GroupNotReadyError()
  await closeRemovalGap(ctx, channelId, group, { devices: devicesOf(state) })
  if (!group.isActive) throw new DeviceRemovedError()
  return group
}

/**
 * 🔴 R7 — gönderim kapısı (E2 §3.2). Gruptaki iptal edilmiş ya da eski üyeye ait yaprak varsa, şifrelemeden ÖNCE
 * çıkarma commit'i senkronlanır. Hâlâ çıkarılmamışsa (commit kabul edilemedi, ağ) mesaj ŞİFRELENMEZ:
 * eski üyeye yeni mesaj sızmaz. Çıkarma gerekmiyorsa ağa ek çağrı yok.
 */
async function closeRemovalGap(ctx: E2eeContext, channelId: string, group: Group, view: ChannelView) {
  if (!group.isActive || plan(group, view).remove.length === 0) return
  await syncGroup(ctx, channelId, group, view)
  if (group.isActive && plan(group, view).remove.length > 0) throw new GroupNotReadyError()
}

/**
 * Ağsız şifreleme (hızlı cevap) kapısı: ağa çıkılamadığı için yalnız ÖNBELLEKTEKİ görünüme bakılır. Çıkarılması
 * gereken yaprak biliniyorsa şifrelenmez (kullanıcı uygulamayı açıp senkron bekler); görünüm yoksa bilgi yok, geçer.
 */
export async function assertNoStaleLeavesOffline(ctx: E2eeContext, channelId: string, group: Group) {
  const snapshot = await ctx.store.loadView(channelId)
  if (snapshot && plan(group, { devices: devicesOf(snapshot) }).remove.length > 0) throw new GroupNotReadyError()
}
