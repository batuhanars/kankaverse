import type { DecodedPayload } from '@kankaverse/e2ee-core'
import type { StoredStatus } from './localStore'

/** Çözülen yükü depo kaydına çevirir: bilinmeyen sürüm "uygulamayı güncelle" durumuna düşer (§3.2). */
export function decryptToRecord(payload: DecodedPayload): { status: StoredStatus; body: string } {
  if (payload.kind === 'text') return { status: 'ok', body: payload.payload.body }
  return { status: 'unsupported', body: '' }
}
