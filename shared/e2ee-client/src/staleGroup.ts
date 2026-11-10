// Bayat yerel grup kuralı (E1 §6.4): yerel grubun groupId'si sunucunun bildirdiğiyle eşleşmiyorsa grup
// geri alma/yeniden kurulumdan kalmadır. Tek karar noktası burası; kanal açılışı, senkron, gönderim,
// Welcome işleme ve çözme hepsi aynı fonksiyonu çağırır.
import type { Group } from '@kankaverse/e2ee-core'
import { toB64 } from './b64'
import type { E2eeContext } from './context'
import type { E2eeChannelState } from './ports'

/**
 * Sunucu durumu BAŞARIYLA okunduktan sonra çağrılır (ağ hatasında çağıran hata fırlatır, buraya gelinmez).
 * `encrypted: false` = sunucuda grup yok (geri alma): yerel grup da bayattır. Farklı groupId = yeni grup.
 */
export function isStaleGroup(local: Group, state: E2eeChannelState): boolean {
  return !state.encrypted || state.groupId !== toB64(local.groupId)
}

/** Yerel grup bayatsa yalnız grup durumunu düşer (çözülmüş mesaj kayıtları kalır). true = düşüldü. */
export async function dropStaleGroup(
  ctx: E2eeContext,
  channelId: string,
  state: E2eeChannelState,
): Promise<boolean> {
  const local = await ctx.store.loadGroup(channelId)
  if (!local || !isStaleGroup(local, state)) return false
  await ctx.store.deleteGroup(channelId)
  return true
}
