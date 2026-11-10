// Şifreli mesajları ekran için çözer. İlke (E1 §1.6): her mesaj BİR KEZ çözülür, sonuç yerel depoya yazılır,
// ekran oradan okur (MLS anahtarı kullanınca silinir; ikinci çözme zaten başarısız olur).
import { DecryptError, type Group } from '@kankaverse/e2ee-core'
import { fromB64 } from './b64'
import type { ChannelView } from './commitSync'
import { guardUntrusted, refreshView } from './commitSync'
import { syncGroup } from './channelSync'
import type { E2eeContext } from './context'
import { digestOf, type StoredMessage } from './localStore'
import { devicesOf } from './registry'
import { decryptToRecord } from './decryptRecord'

export interface WireMessage {
  id: string
  channelId: string
  createdAt: string
  encrypted?: boolean
  ciphertext?: string
  senderDeviceId?: string | null
}

/** Ekranda gösterilecek karar: kayıt (gösterilir), 'hidden' (iptal cihazdan, gösterilmez) ya da henüz yok. */
type Resolution =
  /** `fresh`: bu çağrıda MLS ile çözüldü (depodan okunmadı); ağır iş, ölçülür ve arayüze nefes verilir. */
  | { kind: 'record'; record: StoredMessage; fresh?: boolean }
  | { kind: 'hidden' }
  /** Şimdilik çözülemedi ama kalıcı yazılmadı (grup yok / kendi mesajımız): sonra çözülebilir. */
  | { kind: 'unavailable' }
  | { kind: 'pending' }

/** Gönderilen/düzenlenen kendi mesajlarımızın düz metni: ciphertext özeti → metin (kendi mesajını çözemezsin). */
export type OwnPlain = Map<string, string>

export class Hydrator {
  private group: Group | null | undefined
  private view: ChannelView | undefined
  private ownDeviceId: string | null = null
  private ctx: E2eeContext
  private channelId: string
  private own: OwnPlain

  constructor(ctx: E2eeContext, channelId: string, own: OwnPlain) {
    this.ctx = ctx
    this.channelId = channelId
    this.own = own
  }

  private async init() {
    if (this.group !== undefined) return
    this.group = await this.ctx.store.loadGroup(this.channelId)
    this.ownDeviceId = (await this.ctx.getDevice()).deviceId
    const { data } = await this.ctx.api.channelState(this.channelId)
    this.view = { devices: devicesOf(data) }
  }

  /** Kayıtta ve özeti aynıysa çözülmüş sayılır (liste sayfalama durma koşulu bunu kullanır). */
  async isResolved(m: WireMessage): Promise<boolean> {
    if (!m.encrypted || !m.ciphertext) return true
    const stored = await this.ctx.store.loadMessage(m.id)
    return stored?.digest === digestOf(fromB64(m.ciphertext))
  }

  private isHidden(m: WireMessage): boolean {
    const revoked = m.senderDeviceId
      ? this.view?.devices.revokedAt.get(m.senderDeviceId)
      : undefined
    // Gönderen cihaz iptal edildikten SONRA oluşan mesaj gösterilmez (§3.3); öncesi meşrudur, kalır.
    return revoked !== undefined && Date.parse(m.createdAt) >= revoked
  }

  private async resolveOne(m: WireMessage, final: boolean): Promise<Resolution> {
    const ct = fromB64(m.ciphertext!)
    const digest = digestOf(ct)
    const stored = await this.ctx.store.loadMessage(m.id)
    if (stored?.digest === digest) return { kind: 'record', record: stored }
    await this.init()
    if (this.isHidden(m)) return { kind: 'hidden' }
    const body = this.own.get(digest)
    if (body !== undefined) return this.save(m, digest, 'ok', body)
    // Kendi cihazımızın gönderdiği ama düz metni elimizde olmayan mesaj çözülemez (anahtar kullanıldı).
    if (m.senderDeviceId === this.ownDeviceId || !this.group) return pending(final)
    return this.decrypt(m, ct, digest, final)
  }

  private async decrypt(
    m: WireMessage,
    ct: Uint8Array,
    digest: string,
    final: boolean,
  ): Promise<Resolution> {
    try {
      const result = await guardUntrusted(this.ctx, this.channelId, () =>
        this.group!.decrypt(ct, m.senderDeviceId ?? ''),
      )
      await this.ctx.store.saveGroup(this.channelId, this.group!)
      const rec = decryptToRecord(result.payload)
      return this.save(m, digest, rec.status, rec.body)
    } catch (e) {
      if (!(e instanceof DecryptError)) throw e
      // Son turda hâlâ çözülemiyorsa kalıcı yaz: cihaz eklenmeden önceki mesaj, bir daha denenmez.
      return final ? this.save(m, digest, 'undecryptable', '') : { kind: 'pending' }
    }
  }

  private async save(
    m: WireMessage,
    digest: string,
    status: StoredMessage['status'],
    body: string,
  ): Promise<Resolution> {
    const record = { id: m.id, channelId: m.channelId, status, body, digest }
    await this.ctx.store.saveMessage(record)
    return { kind: 'record', record, fresh: true }
  }

  /** `msgs` eskiden yeniye sıralı olmalı: MLS aynı gönderenin mesajlarını sırayla çözmeyi bekler. */
  async resolveAll(msgs: WireMessage[]): Promise<Map<string, Resolution>> {
    const out = new Map<string, Resolution>()
    const todo = msgs.filter((m) => m.encrypted && m.ciphertext)
    const retry: WireMessage[] = []
    const t0 = Date.now()
    let fresh = 0
    for (const m of todo) {
      const r = await this.resolveOne(m, false)
      if (r.kind === 'pending') retry.push(m)
      else out.set(m.id, r)
      if (r.kind === 'record' && r.fresh) {
        fresh++
        if (fresh === 10) this.ctx.metric?.('hydrate-first-10', Date.now() - t0, fresh)
        await this.ctx.yieldToUi?.()
      }
    }
    if (fresh > 0) this.ctx.metric?.('hydrate-total', Date.now() - t0, fresh)
    if (retry.length > 0) await this.catchUpThenFinalize(retry, out)
    return out
  }

  /** İlk turda çözülemeyenler: belki mesaj yeni epoch'tan (commit eksik), commit'leri işle ve son kez dene. */
  private async catchUpThenFinalize(retry: WireMessage[], out: Map<string, Resolution>) {
    if (this.group) {
      await refreshView(this.ctx, this.channelId, this.view!)
      await syncGroup(this.ctx, this.channelId, this.group, this.view!)
    }
    for (const m of retry) out.set(m.id, await this.resolveOne(m, true))
  }
}

const pending = (final: boolean): Resolution => ({
  kind: final ? 'unavailable' : 'pending',
})

export type { Resolution }
