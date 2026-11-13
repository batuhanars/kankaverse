import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  BackupScheduler,
  type BackupRunResult,
  type BackupState,
  type Reauth,
} from '@kankaverse/e2ee-client';
import { BackupPasswordError, type BackupPasswordRejection } from '@kankaverse/e2ee-core';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { useDmStore } from '@/stores/dm';
import { useE2eeStore } from '@/stores/e2ee';

/** Kurulum sorusu cihaz başına bir kez (E5a §4.4-1); anahtar kullanıcıya özel. */
const askedKey = (userId: string) => `kv.e2ee.backupAsked.${userId}`;
const STALE_MS = 24 * 60 * 60 * 1000;

export type BackupOutcome =
  | { ok: true }
  | { ok: false; reason: 'wrong-password' | 'generic' | BackupPasswordRejection; message?: string };

/** Ham hata asla kullanıcıya gitmez: yanlış şifre ayrı, geri kalanı sunucunun Türkçe mesajı ya da genel metin. */
function toOutcome(e: unknown): BackupOutcome {
  if (e instanceof BackupPasswordError) return { ok: false, reason: 'wrong-password' };
  console.error('[E2EE] yedek işlemi başarısız', e instanceof Error ? e.name : typeof e);
  return { ok: false, reason: 'generic', message: extractErrorMessage(e) };
}

interface BackupStoreState {
  state: BackupState | null;
  lastRun: BackupRunResult['status'] | null;
  /** Geri yükleme sonrası artar; açık sohbet mesajlarını yeniden yükler. */
  restoreTick: number;
  /** E5b §4.4 (E5a Rev.3): "eski mesajlarını getir" bandı; bu cihazda bir kez (bayrak motorun cihaz deposunda). */
  historyBanner: boolean;
}

export const useE2eeBackupStore = create<BackupStoreState>(() => ({
  state: null,
  lastRun: null,
  restoreTick: 0,
  historyBanner: false,
}));

const set = useE2eeBackupStore.setState;
const get = useE2eeBackupStore.getState;
let scheduler: BackupScheduler | null = null;
let historyEvaluated = false;

const backupEngine = () => useE2eeStore.getState().engine?.backup ?? null;

const identity = () => {
  const u = useAuthStore.getState().user;
  return { username: u?.username ?? '', email: u?.email ?? '' };
};

export async function refreshBackup(): Promise<void> {
  const backup = backupEngine();
  if (!backup) return;
  try {
    set({ state: await backup.backupState() });
  } catch (e) {
    console.error('[E2EE] yedek durumu okunamadı', e instanceof Error ? e.name : typeof e);
  }
}

async function run(now: number, manual = false): Promise<BackupRunResult> {
  const result: BackupRunResult = (await backupEngine()?.runBackupIfDue(now, { manual })) ?? {
    status: 'skipped',
    reason: 'disabled',
  };
  set({ lastRun: result.status });
  // Başka cihaz anahtarı geçersiz kıldı (key-dropped): durum "kilitli" olur, bant/ayarlar açılır (§4.4-5).
  if (result.status === 'uploaded' || result.status === 'key-dropped') void refreshBackup();
  return result;
}

/**
 * Yalnız ÖN PLAN oturumunda (`(app)/_layout`) çağrılır; bildirim görevinin (headless) motor yolunda ASLA:
 * MIUI arka planda uzun iş başlatmaz (§4.3). Zamanlayıcı 1 dk sonra ve 6 saatte bir dener; arka plana geçiş
 * anında `onBackground()` kısa bir pencerede bir deneme yapar.
 */
export async function startBackup(): Promise<void> {
  stopBackup();
  await refreshBackup();
  if (!get().state?.enabled) return;
  scheduler = new BackupScheduler({ run });
  scheduler.start();
}

/** Arka plana geçiş anı: tetik yalnız geçişte, uzun iş başlatılmaz (zamanlayıcı kendi koşullarını denetler). */
export function backupOnBackground(): void {
  scheduler?.onBackground();
}

export function stopBackup(): void {
  scheduler?.stop();
  scheduler = null;
  set({ state: null, lastRun: null, historyBanner: false });
  historyEvaluated = false;
}

/** Şifreli DM ilk açıldığında: yedek açık + kurulu değil + bu cihazda hiç sorulmadıysa true (bir kez). */
export async function shouldPromptSetup(): Promise<boolean> {
  const userId = useAuthStore.getState().user?.id;
  const s = get().state;
  if (!userId || !s?.enabled || s.configured) return false;
  try {
    if (await AsyncStorage.getItem(askedKey(userId))) return false;
    await AsyncStorage.setItem(askedKey(userId), '1');
    return true;
  } catch {
    return false; // depolama yoksa soru hiç çıkmaz: her açılışta sormak "bir kez" kuralını bozardı
  }
}

/**
 * Bant bu cihazda BİR KEZ (sahip kararı, web `evaluateHistoryBanner` ile aynı): eksik geçmiş varsa (motor
 * `historyPrompt`), getirmenin bir yolu (yedek kurulu ya da aktarım açık) ve şifreli bir DM varsa gösterilir;
 * gösterildiği an "soruldu" yazılır, cevap ne olursa olsun tekrar çıkmaz. DM listesi sonradan gelirse yeniden denenir.
 */
export async function evaluateHistoryBanner(): Promise<void> {
  const e = useE2eeStore.getState().engine;
  if (!e || historyEvaluated) return;
  if (e.backup && get().state === null) return; // yedek durumu henüz okunmadı
  const hasEncryptedDm = useDmStore
    .getState()
    .channels.some((c) => (c.type === 'DM' || c.type === 'GROUP_DM') && c.lastMessage?.encrypted);
  if (!hasEncryptedDm) return;
  historyEvaluated = true;
  if (!get().state?.configured && !e.transfer) return;
  try {
    if ((await e.historyPrompt()) !== 'missing') return;
    await e.markHistoryAsked();
    set({ historyBanner: true });
  } catch (err) {
    console.error('[E2EE] geçmiş bandı değerlendirilemedi', err instanceof Error ? err.name : typeof err);
  }
}

export const dismissHistoryBanner = () => set({ historyBanner: false });

export async function setupBackup(password: string): Promise<BackupOutcome> {
  try {
    const r = await backupEngine()!.setupBackup(password, identity());
    if (!r.ok) return { ok: false, reason: r.reason };
    await refreshBackup();
    return { ok: true };
  } catch (e) {
    return toOutcome(e);
  }
}

/**
 * Anahtarı bu cihazda açar (yeni mesajlar yedeklenir). `restoreHistory` (Rev.3: ayrı seçim) ise eski görüntüler
 * erişilebilir 1-1 DM'lere birleştirilir ve açık sohbet yeniden yüklenir.
 */
export async function unlockAndRestore(
  password: string,
  restoreHistory = true,
): Promise<BackupOutcome & { restored?: number; badSnapshots?: number }> {
  try {
    await backupEngine()!.unlockBackup(password);
    if (!restoreHistory) {
      await refreshBackup();
      return { ok: true };
    }
    return await restoreOnly();
  } catch (e) {
    return toOutcome(e);
  }
}

/** Yedek bu cihazda zaten açıksa şifresiz geri yükleme (bant ve ayarlar "Yedekten geri yükle"). */
export async function restoreOnly(): Promise<BackupOutcome & { restored?: number; badSnapshots?: number }> {
  try {
    const ids = useDmStore
      .getState()
      .channels.filter((c) => c.type === 'DM' || c.type === 'GROUP_DM')
      .map((c) => c.id);
    const res = await backupEngine()!.restoreBackup(ids);
    await refreshBackup();
    set((s) => ({ restoreTick: s.restoreTick + 1 }));
    useE2eeStore.setState((s) => ({ plainTick: s.plainTick + 1 }));
    return { ok: true, restored: res.restored, badSnapshots: res.badSnapshots };
  } catch (e) {
    return toOutcome(e);
  }
}

export async function changeBackupPassword(oldPassword: string, newPassword: string): Promise<BackupOutcome> {
  try {
    const r = await backupEngine()!.changeBackupPassword(oldPassword, newPassword, identity());
    if (!r.ok) return { ok: false, reason: r.reason };
    await refreshBackup();
    return { ok: true };
  } catch (e) {
    return toOutcome(e);
  }
}

export async function resetBackup(newPassword: string, reauth: Reauth): Promise<BackupOutcome> {
  try {
    const r = await backupEngine()!.resetBackup(newPassword, identity(), reauth);
    if (!r.ok) return { ok: false, reason: r.reason };
    await refreshBackup();
    return { ok: true };
  } catch (e) {
    return toOutcome(e);
  }
}

export async function disableBackup(reauth: Reauth): Promise<BackupOutcome> {
  try {
    await backupEngine()!.deleteBackup(reauth);
    await refreshBackup();
    return { ok: true };
  } catch (e) {
    return toOutcome(e);
  }
}

/** "Şimdi yedekle": 6 saat aralığını atlar, değişiklik yoksa yine yüklemez (`manual`, motor kuralı). */
export function backupNow(): Promise<BackupRunResult> {
  return run(Date.now(), true);
}

/** 24 saati geçen başarısızlık: son çalıştırma hata ve son başarılı yedek yok ya da 24 saatten eski. */
export const selectIsStale = (s: BackupStoreState) =>
  !!s.state?.unlockedHere &&
  s.lastRun === 'failed' &&
  (s.state.lastBackupAt === undefined || Date.now() - s.state.lastBackupAt > STALE_MS);
