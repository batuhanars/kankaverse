// Cihazdan cihaza geçmiş aktarımı (E5b §4.1). Kripto e2ee-core'da; burada yalnız adımlar, ağ ve yerel depo.
// N = yeni cihaz (geçmişi alır): start → reveal (kod) → receive.  O = eski cihaz (verir): pending → accept → code → send.
// 🔴 R7: O, taahhüdü KENDİSİ doğrular (sunucuya güvenmez) ve dökümde KENDİ cihaz kimliğini kullanır; yük yalnız
// kod üretildikten sonra ve arayüz kullanıcının "kodlar aynı" onayıyla `send` çağırınca gider. Geçici anahtarlar
// yalnız bellekte; iş bitince ya da iptalde sıfırlanır. Silinmiş/temizlenmiş mesaj gönderilmez, gelen de yazılmaz.
import {
  TRANSFER_MAX_BYTES,
  deriveTransferSecrets,
  newTransferKeyPair,
  newTransferNonce,
  openTransfer,
  sealTransfer,
  sha256,
  transferCommit,
  utf8,
  verifyTransferCommit,
  wipe,
  type TransferKeyPair,
} from '@kankaverse/e2ee-core'
import { fromB64, toB64 } from './b64'
import { missingIds } from './backupExists'
import { buildSnapshot, parseSnapshot } from './backupSnapshot'
import type { E2eeContext } from './context'
import { TransferPayloadError, TransferSessionError, TransferTooLargeError } from './errors'
import { collectBodies, dropDeleted, mergeCandidates } from './historyRecords'
import type { BlobTransport, E2eeApi, TransferPending } from './ports'

export interface TransferDeps {
  userId: string
  api: E2eeApi
  blob: BlobTransport
  /** Motorun kilit yolu: depoya dokunan her adım bundan geçer. */
  run: <T>(task: (ctx: E2eeContext) => Promise<T>) => Promise<T>
  log: (message: string, error?: unknown) => void
}

interface Session {
  role: 'new' | 'old'
  keys: TransferKeyPair
  /** Yalnız N: taahhüt rastgeleliği. */
  nonce?: Uint8Array
  /** Kod üretildikten sonra: yük anahtarı ve karşı cihaz. */
  key?: Uint8Array
  peerDeviceId?: string
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

export class TransferManager {
  private sessions = new Map<string, Session>()
  private d: TransferDeps

  constructor(deps: TransferDeps) {
    this.d = deps
  }

  /** Bu cihazda bu aktarımın oturumu var mı (uygulama yeniden açıldıysa yok: baştan başlatılır). */
  hasSession(id: string): boolean {
    return this.sessions.has(id)
  }

  // ── Yeni cihaz (N) ─────────────────────────────────────────────────────────

  /** İstek açar; sunucuya yalnız taahhüt gider. Bu cihazdaki eski aktarım oturumları silinir. */
  async start(): Promise<{ id: string; expiresAt: string }> {
    const keys = newTransferKeyPair()
    const nonce = newTransferNonce()
    const { data } = await this.d.api.transferCreate(toB64(transferCommit(keys.publicKey, nonce)))
    for (const id of [...this.sessions.keys()]) this.forget(id)
    this.sessions.set(data.id, { role: 'new', keys, nonce })
    return data
  }

  /** O kabul etti: kodu ve anahtarı türetir, SONRA taahhüdü açar. Dönen 6 hane ekranda gösterilir. */
  async reveal(id: string): Promise<string> {
    const s = this.session(id, 'new')
    const { data } = await this.d.api.transferGet(id)
    if (data.status !== 'ACCEPTED' || !data.oldPub || !data.oldDeviceId) throw new TransferSessionError()
    const own = await this.ownDeviceId()
    const oldPub = fromB64(data.oldPub)
    const secrets = deriveTransferSecrets(s.keys.secretKey, oldPub, {
      userId: this.d.userId,
      transferId: id,
      newDeviceId: own,
      oldDeviceId: data.oldDeviceId,
      newPub: s.keys.publicKey,
      oldPub,
      nonce: s.nonce!,
    })
    await this.d.api.transferReveal(id, toB64(s.keys.publicKey), toB64(s.nonce!))
    s.key = secrets.key
    s.peerDeviceId = data.oldDeviceId
    return secrets.sas
  }

  /**
   * Yük hazır: indirir, açar, birleştirir (E5a §4.5 kuralı), `done` der. Erişilemeyen kanalın ve sunucuda
   * silinmiş/temizlenmiş mesajın kaydı yazılmaz. Dönen sayı yeni yazılan kayıt.
   */
  async receive(id: string, accessibleEncryptedChannelIds: string[]): Promise<{ received: number }> {
    const s = this.session(id, 'new')
    if (!s.key || !s.peerDeviceId) throw new TransferSessionError()
    const { data } = await this.d.api.transferBlob(id)
    const bytes = await this.d.blob.get(data.url)
    let messages
    try {
      if (toHex(sha256(bytes)) !== data.sha256) throw new TransferPayloadError()
      messages = parseSnapshot(openTransfer(s.key, bytes, this.d.userId, id), s.peerDeviceId).messages
    } catch {
      throw new TransferPayloadError()
    }
    const allowed = new Set(accessibleEncryptedChannelIds)
    const candidates = messages.filter((m) => allowed.has(m.channelId))
    // Eksik kontrolle hiçbir şey yazılmaz (hata fırlar, kullanıcı yeniden dener).
    const gone = await missingIds(this.d.api, candidates, false)
    const fresh = candidates.filter((m) => !gone.has(m.id))
    const received = await this.d.run((ctx) => mergeCandidates(ctx, fresh, allowed))
    await this.d.api.transferDone(id)
    this.forget(id)
    return { received }
  }

  // ── Eski cihaz (O) ─────────────────────────────────────────────────────────

  /** Kullanıcının bu cihaza gösterilecek açık isteği (kendi açtığı hariç; sunucu süzer). */
  async pending(): Promise<TransferPending | null> {
    return (await this.d.api.transferPending()).data
  }

  /** Kullanıcı "Devam et" dedi: geçici anahtar üretilir ve verilir. */
  async accept(id: string): Promise<void> {
    const keys = newTransferKeyPair()
    await this.d.api.transferAccept(id, toB64(keys.publicKey))
    this.sessions.set(id, { role: 'old', keys })
  }

  /**
   * N taahhüdü açtı: taahhüt BU cihazda doğrulanır (tutmazsa `TransferCommitError`), kod ve anahtar türetilir.
   * Dökümdeki eski cihaz kimliği sunucudan değil bu cihazdan alınır.
   */
  async code(id: string): Promise<string> {
    const s = this.session(id, 'old')
    const { data } = await this.d.api.transferGet(id)
    if (data.status !== 'REVEALED' || !data.commit || !data.newPub || !data.nonce) {
      throw new TransferSessionError()
    }
    const newPub = fromB64(data.newPub)
    const nonce = fromB64(data.nonce)
    verifyTransferCommit(fromB64(data.commit), newPub, nonce)
    const own = await this.ownDeviceId()
    if (data.newDeviceId === own) throw new TransferSessionError()
    const secrets = deriveTransferSecrets(s.keys.secretKey, newPub, {
      userId: this.d.userId,
      transferId: id,
      newDeviceId: data.newDeviceId,
      oldDeviceId: own,
      newPub,
      oldPub: s.keys.publicKey,
      nonce,
    })
    s.key = secrets.key
    s.peerDeviceId = data.newDeviceId
    return secrets.sas
  }

  /**
   * Kullanıcı kodların aynı olduğunu onayladı: gövdeli yerel kayıtlar (silinmiş/temizlenmiş olanlar ayıklanır)
   * E5a görüntü biçiminde şifrelenip yüklenir. 25 MB'ı aşarsa istek iptal edilir ve `TransferTooLargeError`.
   */
  async send(id: string): Promise<{ sent: number }> {
    const s = this.session(id, 'old')
    if (!s.key) throw new TransferSessionError()
    const own = await this.ownDeviceId()
    const records = await dropDeleted(this.d.api, this.d.run, await this.d.run((ctx) => collectBodies(ctx)))
    const content = { ...buildSnapshot(own, Date.now(), records), kind: 'transfer' }
    const sealed = sealTransfer(s.key, utf8(JSON.stringify(content)), this.d.userId, id)
    if (sealed.length > TRANSFER_MAX_BYTES) {
      await this.cancel(id).catch(() => undefined)
      throw new TransferTooLargeError()
    }
    const ref = { size: sealed.length, sha256: toHex(sha256(sealed)) }
    const { data } = await this.d.api.transferUpload(id, ref)
    await this.d.blob.put(data.url, sealed)
    await this.d.api.transferCommit(id, ref)
    this.forget(id)
    return { sent: content.messages.length }
  }

  // ── İki taraf ──────────────────────────────────────────────────────────────

  /** İptal ("Ben değilim", "Farklı", vazgeç). Oturum her durumda bu cihazdan silinir. */
  async cancel(id: string): Promise<void> {
    try {
      await this.d.api.transferCancel(id)
    } finally {
      this.forget(id)
    }
  }

  /** Geçici gizli malzemeyi bellekte sıfırlar ve oturumu siler. */
  forget(id: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    wipe(s.keys.secretKey, ...(s.key ? [s.key] : []), ...(s.nonce ? [s.nonce] : []))
    this.sessions.delete(id)
  }

  private session(id: string, role: Session['role']): Session {
    const s = this.sessions.get(id)
    if (!s || s.role !== role) throw new TransferSessionError()
    return s
  }

  private async ownDeviceId(): Promise<string> {
    const deviceId = await this.d.run(async (ctx) => (await ctx.getDevice()).deviceId)
    if (!deviceId) throw new TransferSessionError()
    return deviceId
  }
}
