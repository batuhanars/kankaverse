import { create } from 'zustand';

/**
 * C62 §5 — ortam listesi home.tsx'te yerel durumdur (guild store yok); soket olayları buradan
 * haber verir: `refreshTick` artınca liste yeniden çekilir, `removed` ortamı yerelden düşürür
 * ve o ortamın ekranları kapanır. `n` aynı ortam için ardışık olayı ayırt eder.
 */
interface GuildSyncState {
  refreshTick: number;
  removed: { guildId: string; n: number } | null;
  requestRefresh: () => void;
  markRemoved: (guildId: string) => void;
}

export const useGuildSyncStore = create<GuildSyncState>((set) => ({
  refreshTick: 0,
  removed: null,
  requestRefresh: () => set((s) => ({ refreshTick: s.refreshTick + 1 })),
  markRemoved: (guildId) => set((s) => ({ removed: { guildId, n: (s.removed?.n ?? 0) + 1 } })),
}));
