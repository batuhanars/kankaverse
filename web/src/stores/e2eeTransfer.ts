import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import { TransferCommitError } from '@kankaverse/e2ee-core'
import {
  TransferTooLargeError,
  e2eeErrorCode,
  type TransferManager,
  type TransferPending,
} from '@kankaverse/e2ee-client'
import { e2eeApi } from '@/api/e2ee'
import { useDmStore } from '@/stores/dm'
import { useE2eeStore } from '@/stores/e2ee'
import { useE2eeBackupStore } from '@/stores/e2eeBackup'

/** Yeni cihaz (geçmişi alan) aşamaları. */
export type NewPhase =
  | 'idle'
  | 'starting'
  | 'waiting'
  | 'code'
  | 'receiving'
  | 'done'
  | 'expired'
  | 'cancelled'
  | 'tooLarge'
  | 'error'
/** Eski cihaz (geçmişi veren) aşamaları. `rejected` = "Ben değilim" / "Farklı" / taahhüt tutmadı. */
export type OldPhase =
  'idle' | 'request' | 'waiting' | 'code' | 'sending' | 'sent' | 'rejected' | 'error'

const POLL_MS = 4000

/**
 * E5b cihazdan cihaza aktarım (web). Kripto ve adımlar `engine.transfer`'da; burada yalnız aşama durumu, soket
 * olayları ve soket kaçarsa diye yoklama. 🔴 Yük yalnız kullanıcı "Kodlar aynı, aktar" deyince gider (`confirmOld`).
 */
export const useE2eeTransferStore = defineStore('e2eeTransfer', () => {
  const tr = (): TransferManager | null => useE2eeStore().engine?.transfer ?? null
  const available = computed(() => !!useE2eeStore().engine?.transfer)

  const n = reactive({
    open: false,
    phase: 'idle',
    id: null as string | null,
    sas: '',
    expiresAt: '',
    received: 0,
  })
  const o = reactive({
    phase: 'idle',
    request: null as TransferPending | null,
    sas: '',
  })
  let timer: ReturnType<typeof setInterval> | null = null

  const dmIds = () =>
    useDmStore()
      .channels.filter((c) => c.type === 'DM' || c.type === 'GROUP_DM')
      .map((c) => c.id)

  const log = (e: unknown) =>
    console.error('[e2ee] aktarım', e instanceof Error ? e.name : typeof e)

  function newFailure(e: unknown): NewPhase {
    log(e)
    if (e2eeErrorCode(e) === 'E2EE_TRANSFER_EXPIRED') return 'expired'
    if (e instanceof TransferTooLargeError) return 'tooLarge'
    return 'error'
  }

  // ── Yeni cihaz ─────────────────────────────────────────────────────────────

  async function startNew(): Promise<void> {
    const t = tr()
    if (!t) return
    Object.assign(n, { open: true, phase: 'starting', id: null, sas: '', received: 0 })
    try {
      const r = await t.start()
      Object.assign(n, { id: r.id, expiresAt: r.expiresAt, phase: 'waiting' })
      ensurePoll()
    } catch (e) {
      n.phase = newFailure(e)
    }
  }

  async function onAccepted(id: string): Promise<void> {
    const t = tr()
    if (!t || n.id !== id || n.phase !== 'waiting') return
    n.phase = 'code'
    try {
      n.sas = await t.reveal(id)
    } catch (e) {
      n.phase = newFailure(e)
    }
  }

  async function onReady(id: string): Promise<void> {
    const t = tr()
    if (!t || n.id !== id || n.phase !== 'code' || !n.sas) return
    n.phase = 'receiving'
    try {
      const r = await t.receive(id, dmIds())
      n.received = r.received
      n.phase = 'done'
      // Açık sohbet ve liste önizlemeleri yeni kayıtlarla yeniden okunsun.
      useE2eeBackupStore().restoreTick++
      useE2eeStore().plainTick++
    } catch (e) {
      n.phase = newFailure(e)
    }
  }

  /** Pencere kapanır; yarıda kalan istek iptal edilir (diğer cihaz da kapanış olayı alır). */
  function closeNew(): void {
    const t = tr()
    if (t && n.id && ['starting', 'waiting', 'code'].includes(n.phase))
      void t.cancel(n.id).catch(log)
    Object.assign(n, { open: false, phase: 'idle', id: null, sas: '' })
    stopPollIfIdle()
  }

  // ── Eski cihaz ─────────────────────────────────────────────────────────────

  /** Açılışta ve `transfer-requested` olayında: kullanıcının açık isteği varsa sorulur (kendi açtığı hariç). */
  async function checkPending(): Promise<void> {
    const t = tr()
    if (!t || o.phase !== 'idle' || n.open) return
    try {
      const p = await t.pending()
      if (p && o.phase === 'idle') Object.assign(o, { request: p, phase: 'request', sas: '' })
    } catch (e) {
      log(e)
    }
  }

  async function acceptOld(): Promise<void> {
    const t = tr()
    if (!t || !o.request || o.phase !== 'request') return
    o.phase = 'waiting'
    try {
      await t.accept(o.request.id)
      ensurePoll()
    } catch (e) {
      log(e)
      o.phase = 'error'
    }
  }

  async function onRevealed(id: string): Promise<void> {
    const t = tr()
    if (!t || o.request?.id !== id || o.phase !== 'waiting') return
    try {
      o.sas = await t.code(id)
      o.phase = 'code'
    } catch (e) {
      log(e)
      // Taahhüt tutmadı: araya girme şüphesi. İptal edilir, kullanıcıya "Ben değilim" ile aynı uyarı.
      if (e instanceof TransferCommitError) {
        await t.cancel(id).catch(log)
        o.phase = 'rejected'
      } else {
        o.phase = 'error'
      }
    }
  }

  /** 🔴 Tek gönderim yolu: kullanıcı iki ekrandaki kodun aynı olduğunu onayladı. */
  async function confirmOld(): Promise<void> {
    const t = tr()
    if (!t || !o.request || o.phase !== 'code') return
    o.phase = 'sending'
    try {
      await t.send(o.request.id)
      o.phase = 'sent'
    } catch (e) {
      log(e)
      o.phase = 'error'
    }
  }

  /** "Ben değilim" ya da "Farklı, iptal et". */
  async function rejectOld(): Promise<void> {
    const t = tr()
    if (t && o.request) await t.cancel(o.request.id).catch(log)
    o.phase = 'rejected'
  }

  function closeOld(): void {
    const t = tr()
    if (t && o.request && ['request', 'waiting', 'code'].includes(o.phase)) {
      void t.cancel(o.request.id).catch(log)
    }
    Object.assign(o, { phase: 'idle', request: null, sas: '' })
    stopPollIfIdle()
  }

  // ── Olaylar ────────────────────────────────────────────────────────────────

  /** Karşı taraf iptal etti ya da süre doldu. Bitmiş ekranlara dokunulmaz. */
  function onClosed(id: string, status: string): void {
    if (
      n.id === id &&
      ['starting', 'waiting', 'code', 'receiving'].includes(n.phase) &&
      status !== 'DONE'
    ) {
      n.phase = status === 'EXPIRED' ? 'expired' : 'cancelled'
    }
    if (o.request?.id === id && ['request', 'waiting', 'code'].includes(o.phase)) {
      Object.assign(o, { phase: 'idle', request: null, sas: '' })
    }
    stopPollIfIdle()
  }

  /** Soket kaçarsa: açık aşamada durum yoklanır, aynı geçişler tetiklenir. */
  async function poll(): Promise<void> {
    const id =
      n.id && ['waiting', 'code'].includes(n.phase)
        ? n.id
        : o.phase === 'waiting'
          ? o.request?.id
          : null
    if (!id) return stopPollIfIdle()
    try {
      const { data } = await e2eeApi.transferGet(id)
      if (data.status === 'ACCEPTED') await onAccepted(id)
      else if (data.status === 'REVEALED') await onRevealed(id)
      else if (data.status === 'UPLOADED') await onReady(id)
      else if (['CANCELLED', 'EXPIRED', 'DONE'].includes(data.status)) onClosed(id, data.status)
    } catch (e) {
      if (e2eeErrorCode(e) === 'E2EE_TRANSFER_EXPIRED') onClosed(id, 'EXPIRED')
    }
  }

  function ensurePoll(): void {
    if (!timer) timer = setInterval(() => void poll(), POLL_MS)
  }

  function stopPollIfIdle(): void {
    const busy = ['waiting', 'code'].includes(n.phase) || o.phase === 'waiting'
    if (!busy && timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    available,
    n,
    o,
    startNew,
    closeNew,
    onAccepted,
    onReady,
    checkPending,
    acceptOld,
    onRevealed,
    confirmOld,
    rejectOld,
    closeOld,
    onClosed,
  }
})
