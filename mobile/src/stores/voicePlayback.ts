import { create } from 'zustand';

/**
 * Sprint M6b §8.3-§8.4 — sesli mesaj oynatmanın MERKEZİ durumu.
 *
 * Eski model (`claimPlayback` → öncekinin durdurucusunu ÇAĞIR) güvenilir değildi: iki sesli mesaj
 * aynı anda çalabiliyordu. Yeni model emir değil durum: `currentId` şu an çalması gereken ek.
 * Her oynatıcı bunu İZLER ve çalarken `currentId !== kendi id` olursa KENDİNİ duraklatır.
 *
 * Yalnız `zustand` import eder — `stores/voice` import döngüsüne kenar eklemez
 * (bkz. `audio/messageTone.ts` başlığındaki 2026-09-19 çökmesi).
 */
interface VoicePlaybackState {
  /** Şu an çalan (ya da çalması istenen) ek id'si. */
  currentId: string | null;
  /** Otomatik geçişle başlatılması istenen ek id'si; sıradaki oynatıcı görünce çalıp temizler. */
  autoplayId: string | null;
  /** Ekrandaki sohbetin kronolojik (eski → yeni) CLEAN ses eki id'leri. */
  queue: string[];
  claim: (id: string) => void;
  clearAutoplay: () => void;
  setQueue: (ids: string[]) => void;
  /** Biten ek sonuna kadar çaldı: sıradaki varsa ona geç, yoksa dur. */
  playNext: (id: string) => void;
}

export const useVoicePlaybackStore = create<VoicePlaybackState>((set, get) => ({
  currentId: null,
  autoplayId: null,
  queue: [],
  claim: (id) => set({ currentId: id, autoplayId: null }),
  clearAutoplay: () => set({ autoplayId: null }),
  setQueue: (ids) => {
    const prev = get().queue;
    if (prev.length === ids.length && prev.every((v, i) => v === ids[i])) return;
    set({ queue: ids });
  },
  playNext: (id) => {
    const { queue } = get();
    const next = queue[queue.indexOf(id) + 1];
    // Sıradaki yoksa durur. Sıradaki ekranda mount edilmemişse (liste penceresi) geçiş sessizce olmaz.
    set(next ? { currentId: next, autoplayId: next } : { currentId: null, autoplayId: null });
  },
}));
