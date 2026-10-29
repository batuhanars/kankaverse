import { create } from 'zustand';

/**
 * C31b §5 — kullanıcı başına "oynuyor" durumu. Web `stores/activity.ts`in mobil karşılığı, YALNIZ
 * tüketim: mobilde algılama yok (süreç listesini göremez), bu store sunucunun yaydığını saklar.
 *
 * 🔒 Görünürlük kararı SUNUCUDA (`PresenceService.canSeeActivity`, R7): ayar, minör/kanka, engel.
 * İstemci filtre eklemez; gelmeyen kişinin oyunu görülemeyen oyundur. Ad sunucudaki tablodan gelir.
 *
 * `applySnapshot` haritayı DEĞİŞTİRİR (presence store ile aynı gerekçe): soket arka planda koptukça
 * bayat "oynuyor" satırı kalmasın.
 */
export interface GameActivity {
  gameId: string;
  name: string;
  /** C31d: oyun logosu (sunucu CDN'i); yoksa istemci kol simgesi çizer. */
  iconUrl: string | null;
  /** C31e: oyunun başladığı an (ISO); canlı süre buradan. */
  startedAt: string | null;
  /** C31e: yalnız Steam oyunlarında mağaza sayfası. */
  storeUrl: string | null;
}

interface ActivityState {
  byUser: Record<string, GameActivity>;
  applySnapshot: (
    states: {
      userId: string;
      gameId?: string;
      gameName?: string;
      gameIconUrl?: string | null;
      gameStartedAt?: string;
      gameStoreUrl?: string | null;
    }[],
  ) => void;
  applyUpdate: (
    userId: string,
    game: {
      id: string;
      name: string;
      iconUrl?: string | null;
      startedAt?: string;
      storeUrl?: string | null;
    } | null,
  ) => void;
  reset: () => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  byUser: {},

  applySnapshot(states) {
    const next: Record<string, GameActivity> = {};
    for (const s of states) {
      if (s.gameId && s.gameName) {
        next[s.userId] = {
          gameId: s.gameId,
          name: s.gameName,
          iconUrl: s.gameIconUrl ?? null,
          startedAt: s.gameStartedAt ?? null,
          storeUrl: s.gameStoreUrl ?? null,
        };
      }
    }
    set({ byUser: next });
  },

  applyUpdate(userId, game) {
    set((s) => {
      if (!game) {
        if (!(userId in s.byUser)) return s;
        const next = { ...s.byUser };
        delete next[userId];
        return { byUser: next };
      }
      const iconUrl = game.iconUrl ?? null;
      const startedAt = game.startedAt ?? null;
      const storeUrl = game.storeUrl ?? null;
      const cur = s.byUser[userId];
      if (
        cur?.gameId === game.id &&
        cur.iconUrl === iconUrl &&
        cur.startedAt === startedAt &&
        cur.storeUrl === storeUrl
      ) {
        return s;
      }
      return {
        byUser: {
          ...s.byUser,
          [userId]: { gameId: game.id, name: game.name, iconUrl, startedAt, storeUrl },
        },
      };
    });
  },

  reset() {
    set({ byUser: {} });
  },
}));

/** Oyun adı ya da null — satır çizip çizmemeye karar vermek için tek seçici. */
export function selectGameName(userId: string | undefined | null) {
  return (s: ActivityState): string | null => (userId ? (s.byUser[userId]?.name ?? null) : null);
}

/** Oyun nesnesinin kendisi (profil kartı için). */
export function selectGame(userId: string | undefined | null) {
  return (s: ActivityState): GameActivity | null => (userId ? (s.byUser[userId] ?? null) : null);
}
