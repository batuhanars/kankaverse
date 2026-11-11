import { fromBase64, verifyFrank, type DecodedPayload } from '@kankaverse/e2ee-core'
import { fromB64 } from './b64'
import type { StoredStatus } from './localStore'

/** Parmak izi doğrulaması için mesajın sunucudaki alanları (E4 §2.1). */
export interface FrankContext {
  channelId: string
  /** Sunucunun mesaja yazdığı gönderen cihaz (yükten DEĞİL). */
  senderDeviceId: string
  /** Sunucunun mesajla döndürdüğü `frankingTag` (base64). */
  frankingTag?: string | null
}

export interface DecryptedRecord {
  status: StoredStatus
  body: string
  fk?: string
  sentAt?: number
}

/** Parmak izinin doğrulanacağı yük alanları (çözülmüş yükten ya da yerel kayıttan). */
export interface FrankClaim {
  fk: string
  body: string
  sentAt: number
}

/** `verifyFrank` kötü biçimli tag/fk için false döner; base64 çözümü fırlatabilir, o da "doğrulanamadı". */
export function frankingHolds(p: FrankClaim, ctx: FrankContext): boolean {
  if (!ctx.frankingTag) return false
  try {
    const fk = fromBase64(p.fk)
    const tag = fromB64(ctx.frankingTag)
    if (!fk) return false
    return verifyFrank(
      fk,
      { channelId: ctx.channelId, senderDeviceId: ctx.senderDeviceId, body: p.body, sentAt: p.sentAt },
      tag,
    )
  } catch {
    return false
  }
}

/**
 * Çözülen yükü depo kaydına çevirir. Bilinmeyen sürüm "uygulamayı güncelle" durumuna düşer (§3.2).
 * v1: parmak izi yok, bugünkü gibi gösterilir. v2: tag tutmazsa ya da yoksa `unverified`. Gövde, `fk` ve
 * `sentAt` yine yerele YAZILIR (MLS anahtarı tüketildi, tekrar çözülemez): tag sonradan gelirse yeniden
 * doğrulanıp `ok`'a terfi eder. Ama `unverified` gövde HİÇBİR yerde gösterilmez (ekran, önizleme, alıntı, kanıt).
 */
export function decryptToRecord(payload: DecodedPayload, ctx: FrankContext): DecryptedRecord {
  if (payload.kind !== 'text') return { status: 'unsupported', body: '' }
  const p = payload.payload
  if (p.v === 1) return { status: 'ok', body: p.body, sentAt: p.sentAt }
  if (!frankingHolds(p, ctx)) return { status: 'unverified', body: p.body, fk: p.fk, sentAt: p.sentAt }
  return { status: 'ok', body: p.body, fk: p.fk, sentAt: p.sentAt }
}
