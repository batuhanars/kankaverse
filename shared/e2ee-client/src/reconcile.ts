// Grup üyeliğini sunucudaki cihaz listesiyle eşitler: iptal edileni çıkar, eksik etkin cihazı ekle (E1 §2.4).
// Çevrimiçi HERHANGİ bir üye cihaz bunu yapabilir; yarışı sunucunun epoch kuralı çözer.
import type { Group, PendingCommit } from '@kankaverse/e2ee-core'
import { e2eeErrorCode } from './errors'
import { fromB64, toB64 } from './b64'
import { catchUp, refreshView, type ChannelView } from './commitSync'
import type { E2eeContext } from './context'
import { observeLeaves } from './deviceNotices'

const MAX_ROUNDS = 3
/** Sunucu sınırı: tek commit'te en çok 20 Welcome (E2EE_WELCOMES_PER_REQUEST) ve tek claim'de 20 cihaz. */
export const MAX_ADD_PER_COMMIT = 20

type StepResult = 'done' | 'conflict' | 'stuck'

/** Commit'i sunucuya verir; kabulde yerel durumu ilerletir, epoch çakışmasında 'conflict' (pending atılır). */
async function submit(
  ctx: E2eeContext,
  channelId: string,
  group: Group,
  view: ChannelView,
  pending: PendingCommit,
): Promise<StepResult> {
  const welcomes = pending.welcomes.map((w) => ({
    deviceId: w.deviceId,
    welcome: toB64(w.welcome),
  }))
  try {
    await ctx.api.postCommit(channelId, pending.baseEpoch, toB64(pending.commit), welcomes)
  } catch (e) {
    if (e2eeErrorCode(e) === 'E2EE_EPOCH_CONFLICT') return 'conflict'
    throw e
  }
  const before = new Set(group.memberDeviceIds())
  group.confirmCommit(pending)
  await ctx.store.saveGroup(channelId, group)
  // Commit'i gönderen cihaz da satırı görür (E2 §3.3 sapması): yoksa 1-1'de ekleyen taraf hiç görmezdi.
  await observeLeaves(ctx, channelId, group, view.devices, before)
  return 'done'
}

async function removeStep(
  ctx: E2eeContext,
  channelId: string,
  group: Group,
  view: ChannelView,
  ids: string[],
) {
  return submit(ctx, channelId, group, view, await group.removeDevices(ids, view.devices.registered))
}

async function addStep(
  ctx: E2eeContext,
  channelId: string,
  group: Group,
  view: ChannelView,
  ids: string[],
) {
  const { data } = await ctx.api.claim(channelId, ids.slice(0, MAX_ADD_PER_COMMIT))
  // Paketi kalmamış cihaz listede yok: eklenemez, o cihaz açılınca kendi yeni paketini yükleyip tekrar dener.
  if (data.length === 0) return 'stuck' as const
  const kps = data.map((c) => fromB64(c.keyPackage))
  return submit(ctx, channelId, group, view, await group.addDevices(kps, view.devices.registered))
}

/**
 * Çıkarma: iptal edilmiş VEYA eski üyeye (ayrılan/çıkarılan) ait yapraklar, kendi cihazım hariç (E2 §3.2).
 * Ekleme: şu anki üyelerin gruptaki olmayan etkin cihazları. Eski üyenin cihazı asla eklenmez (`active`te yok).
 */
export function plan(group: Group, view: ChannelView) {
  const leaves = new Set(group.memberDeviceIds())
  const own = group.ownDeviceId
  const { revokedAt, former } = view.devices
  const remove = [...leaves].filter((id) => id !== own && (revokedAt.has(id) || former.has(id)))
  const add = view.devices.active.map((d) => d.deviceId).filter((id) => !leaves.has(id))
  return { remove, add }
}

/** En çok 3 tur: çakışmada eksik commit'leri işle, planı yeniden çıkar. */
export async function reconcile(
  ctx: E2eeContext,
  channelId: string,
  group: Group,
  view: ChannelView,
) {
  for (let round = 0; round < MAX_ROUNDS && group.isActive; round++) {
    const { remove, add } = plan(group, view)
    if (remove.length === 0 && add.length === 0) return
    // Önce çıkar: iptal edilmiş cihaz yeni epoch'u bir an bile görmesin.
    const result = remove.length
      ? await removeStep(ctx, channelId, group, view, remove)
      : await addStep(ctx, channelId, group, view, add)
    if (result === 'stuck') return
    if (result === 'conflict') {
      await catchUp(ctx, channelId, group, view)
      await refreshView(ctx, channelId, view)
    }
  }
}
