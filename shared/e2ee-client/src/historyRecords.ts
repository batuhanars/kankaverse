// Yerel çözülmüş geçmiş üzerindeki ortak adımlar: yedek (E5a) ve cihazdan cihaza aktarım (E5b) AYNI kuralı kullanır.
// 🔴 R7: silinmiş/temizlenmiş mesaj dışarı çıkmaz (§4.7, E5b §3.3); birleştirme yerel `ok` kaydı ezmez (§4.5).
import { missingIds } from './backupExists'
import { shouldWrite, type SnapshotMessage } from './backupSnapshot'
import type { E2eeContext } from './context'
import type { StoredMessage } from './localStore'
import type { E2eeApi } from './ports'

/** Uzun döngülerde arayüze nefes aldırma aralığı. */
export const YIELD_EVERY = 100

/** Gövdesi olan (`ok`, `unverified`) yerel kayıtlar; bozuk tek kayıt işi durdurmaz (§4.2). Kilit içinde çağrılır. */
export async function collectBodies(ctx: E2eeContext): Promise<StoredMessage[]> {
  const records: StoredMessage[] = []
  const ids = await ctx.store.messageIds()
  for (const [i, id] of ids.entries()) {
    const rec = await ctx.store.loadMessage(id).catch(() => null)
    if (rec && (rec.status === 'ok' || rec.status === 'unverified')) records.push(rec)
    if (i % YIELD_EVERY === YIELD_EVERY - 1) await ctx.yieldToUi?.()
  }
  return records
}

/**
 * Sunucuda artık olmayan (silinmiş ya da çağıranın temizlediği) kayıtları yerelden siler ve listeden çıkarır.
 * Ağ kilit DIŞINDA; hata fırlar (eksik kontrolle hiçbir şey dışarı çıkmaz).
 */
export async function dropDeleted(
  api: E2eeApi,
  run: <T>(task: (ctx: E2eeContext) => Promise<T>) => Promise<T>,
  records: StoredMessage[],
): Promise<StoredMessage[]> {
  const gone = await missingIds(api, records, true)
  if (gone.size === 0) return records
  await run(async (ctx) => {
    for (const id of gone) await ctx.store.deleteMessage(id, false)
  })
  return records.filter((r) => !gone.has(r.id))
}

/**
 * Gelen adayları yerelle birleştirir (§4.5 `shouldWrite`). `allowed` dışındaki kanalın kaydı yazılmaz.
 * Yazılan varsa bu cihazın yedeği güncellensin diye kirli işaretlenir. Kilit içinde çağrılır.
 */
export async function mergeCandidates(
  ctx: E2eeContext,
  candidates: SnapshotMessage[],
  allowed: Set<string>,
): Promise<number> {
  let written = 0
  for (const [i, m] of candidates.entries()) {
    const local = allowed.has(m.channelId) ? await ctx.store.loadMessage(m.id).catch(() => null) : undefined
    if (local !== undefined && shouldWrite(local, m)) {
      await ctx.store.saveMessage({ ...m }, false)
      written++
    }
    if (i % YIELD_EVERY === YIELD_EVERY - 1) await ctx.yieldToUi?.()
  }
  if (written > 0) await ctx.store.markBackupDirty()
  return written
}
