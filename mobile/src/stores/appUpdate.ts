import { create } from 'zustand';
import { addUpdateStatusListener, checkForUpdate, completeUpdate, startUpdate } from '@modules/in-app-update';

/**
 * Uygulama içi güncelleme durumu (masaüstü `desktopUpdate` bandının mobil karşılığı).
 * Kontrol `(app)/_layout` açılışında ve her ön plana dönüşte yapılır; bant ana sayfada çizilir.
 *
 *  idle        → güncelleme yok / bilinmiyor (bant yok)
 *  available   → Play yeni sürüm sunuyor: "Güncelle"
 *  downloading → kullanıcı onayladı, Play arka planda indiriyor
 *  ready       → indirildi: "Yeniden başlat"
 *
 * Bant kapatılamaz (sahip kararı 2026-11-14); güncelleme sunulduğu sürece görünür.
 */
type Phase = 'idle' | 'available' | 'downloading' | 'ready';

interface AppUpdateState {
  phase: Phase;
  /** 0-100; boyut bilinmiyorsa null. */
  progress: number | null;
  check: () => Promise<void>;
  start: () => Promise<void>;
  restart: () => Promise<void>;
}

/** Ön plana her dönüşte Play'e gitmeyelim. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
let lastCheckAt = 0;
let listening = false;

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  phase: 'idle',
  progress: null,

  async check() {
    if (!listening) {
      listening = true;
      addUpdateStatusListener(({ status, bytesDownloaded, totalBytes }) => {
        if (status === 'downloading') {
          set({
            phase: 'downloading',
            progress: totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : null,
          });
        } else if (status === 'downloaded') {
          set({ phase: 'ready', progress: 100 });
        } else if (status === 'failed' || status === 'canceled') {
          set({ phase: 'available', progress: null });
        }
      });
    }
    // İndirme sürüyorsa ya da kurulmaya hazırsa yeniden sormaya gerek yok.
    const { phase } = get();
    if (phase === 'downloading' || phase === 'ready') return;
    const now = Date.now();
    if (now - lastCheckAt < CHECK_INTERVAL_MS) return;
    lastCheckAt = now;

    const result = await checkForUpdate();
    if (!result) return;
    if (result.downloaded) set({ phase: 'ready', progress: 100 });
    else if (result.available) set({ phase: 'available' });
    else set({ phase: 'idle' });
  },

  async start() {
    const opened = await startUpdate();
    // Pencere açılamadıysa (Play bilgisi bayat) bir sonraki kontrolde yeniden denenir.
    if (!opened) lastCheckAt = 0;
  },

  async restart() {
    await completeUpdate();
  },

}));
