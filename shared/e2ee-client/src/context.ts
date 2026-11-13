// Bir MLS işlemi boyunca paylaşılan bağlam (E1 §1.7). Kilit ve platform arayüzleri ports.ts'te.
import type { Device } from '@kankaverse/e2ee-core'
import type { LocalStore } from './localStore'
import type { E2eeApi, WarningKind } from './ports'

export type { E2eeApi, WarningKind }

export interface E2eeContext {
  api: E2eeApi
  store: LocalStore
  /** Bu işlemde diskten tazelenen cihaz (bayat durum olmasın). */
  getDevice(): Promise<Device>
  warn(channelId: string, kind: WarningKind | null): void
  yieldToUi?: () => Promise<void>
  metric?: (name: string, ms: number, count: number) => void
}

/** Şifreli yük henüz gönderilemez (Welcome gelmedi, anahtar yok): kullanıcıya "tekrar dene". */
export class GroupNotReadyError extends Error {}
