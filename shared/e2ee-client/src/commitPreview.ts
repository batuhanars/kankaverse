// C66: grup push önizlemesi için bellekte commit uygulama. KALICI YAZMA YOK (kurul şartı §1.1): depoya grup,
// mesaj kaydı, cihaz satırı ya da uyarı yazılmaz; `Hydrator`, `catchUp`, `guardUntrusted`, `observeLeaves` kullanılmaz.
// Yeni (kayıtsız) eklenen yapraklar kimlik listesinden muaf (`processCommitForPreview`); mevcut/kayıtlı kimlikler bayt bayt doğrulanır.
// Grup, depodaki baytlardan YENİ nesne olarak kurulur (`loadGroup` her çağrıda deserialize eder, paylaşılan nesne yok).
import { fromB64 } from './b64'
import type { E2eeContext } from './context'
import { decryptToRecord } from './decryptRecord'
import type { WireMessage } from './hydrate'
import { devicesOf } from './registry'

/** Push'un taşıdığı commit: `epoch` = commit'in uygulandığı epoch (E2eeHandshake.epoch). */
export interface PushCommit {
  epoch: number
  commit: string // base64
}

/** Başarıda düz metin; her hata/uyuşmazlık null (çağıran `unavailable` döner). Ağ portu çağrılmaz. */
export async function previewInMemory(
  ctx: E2eeContext,
  msg: WireMessage,
  commits: PushCommit[],
): Promise<string | null> {
  if (!msg.encrypted || !msg.ciphertext || commits.length === 0) return null
  const t0 = Date.now()
  try {
    const group = await ctx.store.loadGroup(msg.channelId) // taze nesne, yalnız bellekte
    const snapshot = await ctx.store.loadView(msg.channelId)
    if (!group || !group.isActive || !snapshot) return null
    const devices = devicesOf(snapshot)
    const ownDeviceId = (await ctx.getDevice()).deviceId
    if (!msg.senderDeviceId || msg.senderDeviceId === ownDeviceId) return null
    // §1.3: ilk commit yerel epoch'a eşit, sonrası kesintisiz; yoksa HİÇBİRİ uygulanmaz.
    let expected = group.epoch
    for (const c of commits) {
      if (!Number.isInteger(c.epoch) || c.epoch !== expected) return null
      expected++
    }
    for (const c of commits) {
      const { removed } = await group.processCommitForPreview(fromB64(c.commit), devices.registered)
      if (removed) return null
    }
    ctx.metric?.('push-step commit-apply', Date.now() - t0, commits.length)
    const { payload } = await group.decrypt(fromB64(msg.ciphertext), msg.senderDeviceId)
    const rec = decryptToRecord(payload, {
      channelId: msg.channelId,
      senderDeviceId: msg.senderDeviceId,
      frankingTag: msg.frankingTag,
    })
    return rec.status === 'ok' ? rec.body : null
  } catch {
    ctx.metric?.('push-step commit-apply-failed', Date.now() - t0, commits.length)
    return null
  }
}
