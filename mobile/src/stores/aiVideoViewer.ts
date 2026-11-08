import { create } from 'zustand';

/**
 * C49 - Yapay zeka video görüntüleyici. Bildirimden (liste ya da push) açılan sonuç sayfasının
 * kimliği ve "herhangi bir AiVideoSheet açık mı" bilgisi. YALNIZ bellekte.
 *
 * `openId`: görüntüleyici (view kipi) hangi üretimi açacak; null = kapalı.
 * `sheetOpen`: açık AiVideoSheet SAYISI (sohbet, medya ve view kipleri aynı sayaca yazar). Ön plan
 * bildirim süzgeci (`notifications/push.ts`) bunu okur: sayfa açıkken "Videon hazır" banner'ı çıkmaz.
 */
interface AiVideoViewerState {
  openId: string | null;
  sheetOpen: number;
  open: (id: string) => void;
  close: () => void;
  sheetOpened: () => void;
  sheetClosed: () => void;
}

export const useAiVideoViewerStore = create<AiVideoViewerState>((set) => ({
  openId: null,
  sheetOpen: 0,
  open: (id) => set({ openId: id }),
  close: () => set({ openId: null }),
  sheetOpened: () => set((s) => ({ sheetOpen: s.sheetOpen + 1 })),
  sheetClosed: () => set((s) => ({ sheetOpen: Math.max(0, s.sheetOpen - 1) })),
}));
