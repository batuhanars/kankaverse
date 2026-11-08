import { create } from 'zustand';
import { aiVideoApi, type AiVideoDto } from '@/api/aiVideo';

/**
 * C49 - Yapay zeka video görüntüleyici. Bildirimden (liste ya da push) açılan sonuç sayfasının
 * kimliği ve "herhangi bir AiVideoSheet açık mı" bilgisi. YALNIZ bellekte.
 *
 * `openId`: görüntüleyici (view kipi) hangi üretimi açacak; null = kapalı.
 * `sheetOpen`: açık AiVideoSheet SAYISI (sohbet, medya ve view kipleri aynı sayaca yazar). Ön plan
 * bildirim süzgeci (`notifications/push.ts`) bunu okur: sayfa açıkken "Videon hazır" banner'ı çıkmaz.
 *
 * C49 R3 `activeId`: süren (QUEUED/RUNNING) üretimin kimliği; kişi başı tek eşzamanlı üretim (C43) olduğundan tek kimlik.
 * Kaynak: üretim başlatılınca set; form içi yoklama/liste terminal görünce ya da `notification` soket olayı
 * (AI_VIDEO_READY/FAILED) gelince temizlenir; açılışta ve ön plana dönüşte TEK `aiVideoApi.list()` ile geri yüklenir.
 */
interface AiVideoViewerState {
  openId: string | null;
  sheetOpen: number;
  activeId: string | null;
  setActive: (id: string | null) => void;
  open: (id: string) => void;
  close: () => void;
  sheetOpened: () => void;
  sheetClosed: () => void;
}

export const useAiVideoViewerStore = create<AiVideoViewerState>((set) => ({
  openId: null,
  sheetOpen: 0,
  activeId: null,
  setActive: (id) => set({ activeId: id }),
  open: (id) => set({ openId: id }),
  close: () => set({ openId: null }),
  sheetOpened: () => set((s) => ({ sheetOpen: s.sheetOpen + 1 })),
  sheetClosed: () => set((s) => ({ sheetOpen: Math.max(0, s.sheetOpen - 1) })),
}));

const isActive = (r: AiVideoDto) => r.status === 'QUEUED' || r.status === 'RUNNING';

/** Elde hazır üretim listesinden süren işi store'a yazar (yoksa temizler). Ek istek atmaz. */
export function syncActiveAiVideo(rows: AiVideoDto[]) {
  useAiVideoViewerStore.getState().setActive(rows.find(isActive)?.id ?? null);
}

/** Açılışta ve ön plana dönüşte: tek liste çağrısı. Hata sessiz (gösterge yardımcıdır). */
export async function restoreActiveAiVideo() {
  try {
    syncActiveAiVideo(await aiVideoApi.list());
  } catch {
    /* geçici hata: bir sonraki dönüşte düzelir */
  }
}
