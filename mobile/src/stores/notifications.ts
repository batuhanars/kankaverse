import { create } from 'zustand';
import { notificationsApi, type NotificationDto } from '@/api/notifications';

// Bildirimler sekmesi (contract §5 ekran 5) + tab rozeti. unreadCount socket handshake'indeki
// `notification:snapshot` (bkz. realtime/socket.ts) VE REST `unread-count` ile beslenir —
// hangisi önce gelirse.
interface NotificationsState {
  items: NotificationDto[];
  nextCursor: string | null;
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;

  fetchFirstPage: () => Promise<void>;
  loadMore: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  applySnapshotUnreadCount: (count: number) => void;
  markAllRead: () => Promise<void>;
  clearAll: () => Promise<boolean>;
  markRead: (id: string) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  nextCursor: null,
  unreadCount: 0,
  loading: false,
  loadingMore: false,

  async fetchFirstPage() {
    set({ loading: true });
    try {
      const res = await notificationsApi.list();
      set({ items: res.items, nextCursor: res.nextCursor, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  async loadMore() {
    const { nextCursor, loadingMore } = get();
    if (!nextCursor || loadingMore) return;
    set({ loadingMore: true });
    try {
      const res = await notificationsApi.list(nextCursor);
      set((s) => ({ items: [...s.items, ...res.items], nextCursor: res.nextCursor, loadingMore: false }));
    } catch {
      set({ loadingMore: false });
    }
  },

  async refreshUnreadCount() {
    try {
      const res = await notificationsApi.unreadCount();
      set({ unreadCount: res.count });
    } catch {
      // sessizce yut — rozet güncellenmeden kalır, kritik değil
    }
  },

  applySnapshotUnreadCount(count) {
    set({ unreadCount: count });
  },

  async markAllRead() {
    try {
      await notificationsApi.markAllRead();
      set((s) => ({
        unreadCount: 0,
        items: s.items.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
      }));
    } catch {
      // sessizce yut
    }
  },

  // Temizle — sunucuda silinir, liste ve rozet sıfırlanır. Başarıyı döner ki ekran hata gösterebilsin
  // (sessiz başarısızlıkta kullanıcı listenin neden durduğunu anlamaz).
  async clearAll() {
    try {
      await notificationsApi.clearAll();
      set({ items: [], nextCursor: null, unreadCount: 0 });
      return true;
    } catch {
      return false;
    }
  },

  // Sprint M1d-0 DoD turu — tek bir bildirimi okundu işaretler (dokunulan satır). Rozet sayısını
  // istemci KENDİ eksiltmez: M1b R1'de konan kural gereği `refreshUnreadCount()` ile sunucudan
  // yeniden okunur (istemcinin saydığı ile sunucunun saydığı ayrışırsa rozet kalıcı olarak bayatlar).
  async markRead(id) {
    const target = get().items.find((n) => n.id === id);
    if (!target || target.readAt) return;
    try {
      await notificationsApi.markRead(id);
      set((s) => ({
        items: s.items.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      }));
      await get().refreshUnreadCount();
    } catch {
      // sessizce yut — satır okunmamış kalır, kullanıcı tekrar dokunabilir
    }
  },
}));
