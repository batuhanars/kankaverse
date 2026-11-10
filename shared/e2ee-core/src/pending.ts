// Bekleyen commit: üretildi ama sunucu henüz kabul etmedi.
// Neden: sunucu epoch çakışmasında (409) commit'i reddedebilir; o zaman yerel durum ilerlememiş olmalı.
// Yeni MLS durumu burada, dışarıya kapalı bir WeakMap'te tutulur; uygulama yalnız baytları görür.
import type { ClientState } from 'ts-mls'
import { StaleCommitError } from './errors'

export interface WelcomeOut {
  deviceId: string
  /** Ağaç içinde gömülüdür (ratchet_tree uzantısı); ayrıca iletmek gerekmez. */
  welcome: Uint8Array
}

export interface PendingCommit {
  /** Commit'in uygulandığı epoch (sunucuya `epoch` olarak gider). */
  readonly baseEpoch: number
  readonly commit: Uint8Array
  /** Eklenen cihazlar için Welcome'lar (yalnız ekleme commit'inde dolu). */
  readonly welcomes: readonly WelcomeOut[]
}

export interface PendingInternal {
  newState: ClientState
  /** Kabulde sıfırlanacak eski anahtar malzemesi (reddedilirse eski durum geçerli kalır). */
  consumed: Uint8Array[]
}

const store = new WeakMap<PendingCommit, PendingInternal>()

export function registerPending(pending: PendingCommit, internal: PendingInternal): PendingCommit {
  store.set(pending, internal)
  return pending
}

export function takePending(pending: PendingCommit): PendingInternal {
  const internal = store.get(pending)
  if (!internal) throw new StaleCommitError('Bekleyen commit tanınmıyor ya da zaten uygulandı')
  store.delete(pending)
  return internal
}
