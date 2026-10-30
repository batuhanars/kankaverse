import { create } from 'zustand';

/**
 * C41 - Başka uygulamadan "Paylaş" ile gelen içerik. YALNIZ bellekte: diske / AsyncStorage'a
 * yazılmaz, süreç ölünce yok olur. Dosya adı ve içerik loglanmaz.
 */
export interface SharedFile {
  uri: string;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface SharePayload {
  /** Her yeni paylaşımda artar: ekran bununla durumunu sıfırlar, yönlendirme tekrar tetiklenmez. */
  id: number;
  files: SharedFile[];
  text: string | null;
  /** Gelen dosya sayısı üst sınırı aştı, fazlası atıldı. */
  truncated: boolean;
}

interface ShareIntentState {
  payload: SharePayload | null;
  setPayload: (p: Omit<SharePayload, 'id'>) => void;
  clear: () => void;
}

let seq = 0;

export const useShareIntentStore = create<ShareIntentState>((set) => ({
  payload: null,
  setPayload: (p) => set({ payload: { ...p, id: ++seq } }),
  clear: () => set({ payload: null }),
}));
