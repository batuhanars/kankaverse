import { create } from 'zustand';
import { friendsApi, type FriendDto, type FriendRequestDto } from '@/api/friends';
import { blocksApi, type BlockedUserDto } from '@/api/blocks';
import { extractErrorMessage } from '@/api/errors';
import { useNotificationsStore } from './notifications';

// Sprint M1b — web `stores/friends.ts` deseni taşındı: liste + bekleyen istekler (incoming +
// outgoing) + `friend.*` WS olaylarının yazdığı tek nokta (realtime/socket.ts). M1a'nın DM store
// dersiyle aynı gerekçe (sözleşme §8.3 kanıtlı): store oturum kapsamlıdır, `reset()` (app)/_layout.tsx
// unmount'unda çağrılır — temizlenmezse çıkıştan sonra sıradaki kullanıcı öncekinin kanka listesini
// görür. Store auth'u İMPORT ETMEZ (aynı döngü riski, dm.ts ile aynı disiplin).
//
// Sprint M1d-0 contract §6 — Engellenenler listesi de BURAYA girer (ayrı bir store açılmadı):
// aynı sızıntı sınıfı (M1b §8.3'te bir kez yaşandı), aynı `reset()` çağrısına tabi olması gerekiyor.
type LoadState = 'loading' | 'error' | 'ready';

interface FriendsState {
  friends: FriendDto[];
  requests: FriendRequestDto[];
  state: LoadState;
  errorMessage: string;

  blocked: BlockedUserDto[];
  blockedState: LoadState;
  blockedErrorMessage: string;

  fetchAll: () => Promise<void>;
  sendRequest: (friendCode: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  /** Yalnız yerel temizlik — engelleme akışında kullanılır (blok kendi başına bir friends store
   *  aksiyonu değil, ama sonucu arkadaş/istek listesinden düşürmeyi gerektirir; WS `friend.remove`
   *  yalnız KARŞI tarafa gider, kendi tarafımda anlık güncelleme için bu gerekir — web ile aynı). */
  removeLocal: (userId: string) => void;
  handleIncomingRequest: (payload: FriendRequestDto) => void;
  handleAccepted: (payload: FriendDto) => void;
  handleRemoved: (userId: string) => void;
  /** Sözleşme §3.3 — yalnız BENİM engellediklerim (`GET /blocks` zaten `blockerId` filtreli). */
  fetchBlocked: () => Promise<void>;
  unblock: (userId: string) => Promise<void>;
  reset: () => void;
}

/**
 * M1b R1 (sahip bulgusu 2026-07-30) — istek kabul/ret edilince Bildirimler rozeti tazelenir.
 * Sunucu artık işlem görmüş `FRIEND_REQUEST` bildirimini okundu işaretliyor
 * (`notifications.service.ts` `markFriendRequestActioned`), ama istemcinin elindeki sayı bayat
 * kalıyordu → kullanıcı isteği kabul ettikten sonra rozet inatla duruyordu. Sayı sunucudan
 * yeniden okunur; istemci kendi kafasına göre eksiltmez (tek doğruluk kaynağı sunucu).
 */
async function refreshNotificationBadge(): Promise<void> {
  await useNotificationsStore.getState().refreshUnreadCount();
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  requests: [],
  state: 'loading',
  errorMessage: '',

  blocked: [],
  blockedState: 'loading',
  blockedErrorMessage: '',

  async fetchAll() {
    try {
      const [friends, requests] = await Promise.all([friendsApi.list(), friendsApi.listRequests()]);
      set({ friends, requests, state: 'ready', errorMessage: '' });
    } catch (e) {
      set({ state: 'error', errorMessage: extractErrorMessage(e) });
    }
  },

  async sendRequest(friendCode) {
    await friendsApi.sendRequest(friendCode);
    await get().fetchAll();
  },

  async acceptRequest(requestId) {
    await friendsApi.acceptRequest(requestId);
    await get().fetchAll();
    await refreshNotificationBadge();
  },

  async declineRequest(requestId) {
    await friendsApi.declineRequest(requestId);
    set((s) => ({ requests: s.requests.filter((r) => r.id !== requestId) }));
    await refreshNotificationBadge();
  },

  async removeFriend(userId) {
    await friendsApi.remove(userId);
    set((s) => ({ friends: s.friends.filter((f) => f.user.id !== userId) }));
  },

  removeLocal(userId) {
    set((s) => ({
      friends: s.friends.filter((f) => f.user.id !== userId),
      requests: s.requests.filter((r) => r.user.id !== userId),
    }));
  },

  handleIncomingRequest(payload) {
    set((s) => (s.requests.find((r) => r.id === payload.id) ? s : { requests: [...s.requests, payload] }));
  },

  handleAccepted(payload) {
    set((s) => ({
      requests: s.requests.filter((r) => r.user.id !== payload.user.id),
      friends: s.friends.find((f) => f.friendshipId === payload.friendshipId) ? s.friends : [...s.friends, payload],
    }));
  },

  handleRemoved(userId) {
    set((s) => ({
      friends: s.friends.filter((f) => f.user.id !== userId),
      requests: s.requests.filter((r) => r.user.id !== userId),
    }));
  },

  async fetchBlocked() {
    try {
      const blocked = await blocksApi.list();
      set({ blocked, blockedState: 'ready', blockedErrorMessage: '' });
    } catch (e) {
      set({ blockedState: 'error', blockedErrorMessage: extractErrorMessage(e) });
    }
  },

  async unblock(userId) {
    await blocksApi.unblock(userId);
    set((s) => ({ blocked: s.blocked.filter((b) => b.user.id !== userId) }));
  },

  reset() {
    set({
      friends: [],
      requests: [],
      state: 'loading',
      errorMessage: '',
      blocked: [],
      blockedState: 'loading',
      blockedErrorMessage: '',
    });
  },
}));
