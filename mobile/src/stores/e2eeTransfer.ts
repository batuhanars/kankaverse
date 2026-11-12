import { create } from 'zustand';
import { TransferCommitError } from '@kankaverse/e2ee-core';
import {
  TransferTooLargeError,
  e2eeErrorCode,
  type TransferManager,
  type TransferPending,
} from '@kankaverse/e2ee-client';
import { mobileE2eeApi } from '@/e2ee/mobileApi';
import { useDmStore } from '@/stores/dm';
import { markDecrypted, useE2eeStore } from '@/stores/e2ee';
import { useE2eeBackupStore } from '@/stores/e2eeBackup';

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
  | 'error';
/** Eski cihaz (geçmişi veren) aşamaları. `rejected` = "Ben değilim" / "Farklı" / taahhüt tutmadı. */
export type OldPhase = 'idle' | 'request' | 'waiting' | 'code' | 'sending' | 'sent' | 'rejected' | 'error';

interface TransferState {
  n: { open: boolean; phase: NewPhase; id: string | null; sas: string; expiresAt: string; received: number };
  o: { phase: OldPhase; request: TransferPending | null; sas: string };
}

const POLL_MS = 4000;

/**
 * E5b cihazdan cihaza aktarım (mobil, web `e2eeTransfer` deposuyla aynı aşamalar). Kripto ve adımlar
 * `engine.transfer`'da; burada aşama durumu, soket olayları ve soket kaçarsa yoklama.
 * 🔴 Yük yalnız kullanıcı "Kodlar aynı, aktar" deyince gider (`confirmOld`). MIUI: aktarım ön planda yürür.
 */
export const useE2eeTransferStore = create<TransferState>(() => ({
  n: { open: false, phase: 'idle', id: null, sas: '', expiresAt: '', received: 0 },
  o: { phase: 'idle', request: null, sas: '' },
}));

const get = useE2eeTransferStore.getState;
const setN = (patch: Partial<TransferState['n']>) =>
  useE2eeTransferStore.setState((s) => ({ n: { ...s.n, ...patch } }));
const setO = (patch: Partial<TransferState['o']>) =>
  useE2eeTransferStore.setState((s) => ({ o: { ...s.o, ...patch } }));

const tr = (): TransferManager | null => useE2eeStore.getState().engine?.transfer ?? null;
export const selectTransferAvailable = () => !!useE2eeStore.getState().engine?.transfer;

let timer: ReturnType<typeof setInterval> | null = null;

const dmIds = () =>
  useDmStore
    .getState()
    .channels.filter((c) => c.type === 'DM')
    .map((c) => c.id);

const log = (e: unknown) => console.error('[E2EE] aktarım', e instanceof Error ? e.name : typeof e);

function newFailure(e: unknown): NewPhase {
  log(e);
  if (e2eeErrorCode(e) === 'E2EE_TRANSFER_EXPIRED') return 'expired';
  if (e instanceof TransferTooLargeError) return 'tooLarge';
  return 'error';
}

// ── Yeni cihaz ─────────────────────────────────────────────────────────────

export async function startNewTransfer(): Promise<void> {
  const t = tr();
  if (!t) return;
  setN({ open: true, phase: 'starting', id: null, sas: '', received: 0 });
  try {
    const r = await t.start();
    setN({ id: r.id, expiresAt: r.expiresAt, phase: 'waiting' });
    ensurePoll();
  } catch (e) {
    setN({ phase: newFailure(e) });
  }
}

export async function onTransferAccepted(id: string): Promise<void> {
  const t = tr();
  const { n } = get();
  if (!t || n.id !== id || n.phase !== 'waiting') return;
  setN({ phase: 'code' });
  try {
    setN({ sas: await t.reveal(id) });
  } catch (e) {
    setN({ phase: newFailure(e) });
  }
}

export async function onTransferReady(id: string): Promise<void> {
  const t = tr();
  const { n } = get();
  if (!t || n.id !== id || n.phase !== 'code' || !n.sas) return;
  setN({ phase: 'receiving' });
  try {
    const r = await t.receive(id, dmIds());
    setN({ received: r.received, phase: 'done' });
    // Açık sohbet ve liste önizlemeleri yeni kayıtlarla yeniden okunsun.
    useE2eeBackupStore.setState((s) => ({ restoreTick: s.restoreTick + 1 }));
    markDecrypted();
  } catch (e) {
    setN({ phase: newFailure(e) });
  }
}

/** Ekran kapanır; yarıda kalan istek iptal edilir (diğer cihaz da kapanış olayı alır). */
export function closeNewTransfer(): void {
  const t = tr();
  const { n } = get();
  if (t && n.id && ['starting', 'waiting', 'code'].includes(n.phase)) void t.cancel(n.id).catch(log);
  setN({ open: false, phase: 'idle', id: null, sas: '' });
  stopPollIfIdle();
}

// ── Eski cihaz ─────────────────────────────────────────────────────────────

/** Açılışta, ön plana dönüşte ve `transfer-requested` olayında: açık istek varsa sorulur (kendi açtığı hariç). */
export async function checkPendingTransfer(): Promise<void> {
  const t = tr();
  const { o, n } = get();
  if (!t || o.phase !== 'idle' || n.open) return;
  try {
    const p = await t.pending();
    if (p && get().o.phase === 'idle') setO({ request: p, phase: 'request', sas: '' });
  } catch (e) {
    log(e);
  }
}

export async function acceptOldTransfer(): Promise<void> {
  const t = tr();
  const { o } = get();
  if (!t || !o.request || o.phase !== 'request') return;
  setO({ phase: 'waiting' });
  try {
    await t.accept(o.request.id);
    ensurePoll();
  } catch (e) {
    log(e);
    setO({ phase: 'error' });
  }
}

export async function onTransferRevealed(id: string): Promise<void> {
  const t = tr();
  const { o } = get();
  if (!t || o.request?.id !== id || o.phase !== 'waiting') return;
  try {
    setO({ sas: await t.code(id), phase: 'code' });
  } catch (e) {
    log(e);
    // Taahhüt tutmadı: araya girme şüphesi. İptal edilir, kullanıcıya "Ben değilim" ile aynı uyarı.
    if (e instanceof TransferCommitError) {
      await t.cancel(id).catch(log);
      setO({ phase: 'rejected' });
    } else {
      setO({ phase: 'error' });
    }
  }
}

/** 🔴 Tek gönderim yolu: kullanıcı iki ekrandaki kodun aynı olduğunu onayladı. */
export async function confirmOldTransfer(): Promise<void> {
  const t = tr();
  const { o } = get();
  if (!t || !o.request || o.phase !== 'code') return;
  setO({ phase: 'sending' });
  try {
    await t.send(o.request.id);
    setO({ phase: 'sent' });
  } catch (e) {
    log(e);
    setO({ phase: 'error' });
  }
}

/** "Ben değilim" ya da "Farklı, iptal et". */
export async function rejectOldTransfer(): Promise<void> {
  const t = tr();
  const { o } = get();
  if (t && o.request) await t.cancel(o.request.id).catch(log);
  setO({ phase: 'rejected' });
}

export function closeOldTransfer(): void {
  const t = tr();
  const { o } = get();
  if (t && o.request && ['request', 'waiting', 'code'].includes(o.phase)) void t.cancel(o.request.id).catch(log);
  setO({ phase: 'idle', request: null, sas: '' });
  stopPollIfIdle();
}

// ── Olaylar ────────────────────────────────────────────────────────────────

/** Karşı taraf iptal etti ya da süre doldu. Bitmiş ekranlara dokunulmaz. */
export function onTransferClosed(id: string, status: string): void {
  const { n, o } = get();
  if (n.id === id && ['starting', 'waiting', 'code', 'receiving'].includes(n.phase) && status !== 'DONE') {
    setN({ phase: status === 'EXPIRED' ? 'expired' : 'cancelled' });
  }
  if (o.request?.id === id && ['request', 'waiting', 'code'].includes(o.phase)) {
    setO({ phase: 'idle', request: null, sas: '' });
  }
  stopPollIfIdle();
}

/** Soket kaçarsa: açık aşamada durum yoklanır, aynı geçişler tetiklenir. */
async function poll(): Promise<void> {
  const { n, o } = get();
  const id = n.id && ['waiting', 'code'].includes(n.phase) ? n.id : o.phase === 'waiting' ? o.request?.id : null;
  if (!id) return stopPollIfIdle();
  try {
    const { data } = await mobileE2eeApi.transferGet(id);
    if (data.status === 'ACCEPTED') await onTransferAccepted(id);
    else if (data.status === 'REVEALED') await onTransferRevealed(id);
    else if (data.status === 'UPLOADED') await onTransferReady(id);
    else if (['CANCELLED', 'EXPIRED', 'DONE'].includes(data.status)) onTransferClosed(id, data.status);
  } catch (e) {
    if (e2eeErrorCode(e) === 'E2EE_TRANSFER_EXPIRED') onTransferClosed(id, 'EXPIRED');
  }
}

function ensurePoll(): void {
  if (!timer) timer = setInterval(() => void poll(), POLL_MS);
}

function stopPollIfIdle(): void {
  const { n, o } = get();
  const busy = ['waiting', 'code'].includes(n.phase) || o.phase === 'waiting';
  if (!busy && timer) {
    clearInterval(timer);
    timer = null;
  }
}
