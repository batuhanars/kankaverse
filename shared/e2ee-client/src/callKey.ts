// E8 §4.1: arama anahtarı. Kanalın MLS grubundan türetilir; anahtar ağa çıkmaz, hiçbir yere yazılmaz.
import type { E2eeContext } from './context'
import { openChannel, syncChannel } from './channelSync'
import { CallKeyUnavailableError } from './errors'

/**
 * Aramaya bağlanmadan önce: grubu sunucuyla eşitle, sonra bu epoch'un anahtarını türet.
 * - `openChannel`: bayat grubu düşer, bekleyen Welcome'ları işler (gruba yeni eklenmiş cihaz da katılabilsin).
 * - `syncChannel`: bekleyen commit'leri işler (çıkarılmışsak grup pasif olur).
 * Grup yok ya da pasif → NOT_MEMBER. Eşitlemeden sonra hâlâ sunucunun epoch'unun gerisindeysek → STALE:
 * eski epoch'un anahtarıyla bağlanırsak kimseyi duyamayız. İleride olmak zararsız (sunucu cevabı bizden eski).
 */
export async function deriveCallKey(
  ctx: E2eeContext,
  channelId: string,
  serverEpoch: number,
): Promise<{ key: Uint8Array; epoch: number }> {
  await openChannel(ctx, channelId)
  const group = await syncChannel(ctx, channelId)
  if (!group || !group.isActive) throw new CallKeyUnavailableError('NOT_MEMBER')
  if (group.epoch < serverEpoch) throw new CallKeyUnavailableError('STALE')
  return group.exportCallKey(channelId)
}
