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
}));
