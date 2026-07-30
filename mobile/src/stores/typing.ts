import { create } from 'zustand';

// web/src/composables/useTyping.ts deseni — zustand'a taşındı (mobilde composable/ref yerine
// store idiyomatik, auth store'la tutarlı). 5sn'de otomatik temizlenir (sunucu `typing:clear`
// göndermezse bile — bağlantı kopması/uygulama arka plana düşmesi gibi durumlarda "yazıyor"
// göstergesi ekranda asılı kalmasın diye).
interface TypingUser {
  userId: string;
  username: string;
  timer: ReturnType<typeof setTimeout>;
}

interface TypingState {
  byChannel: Record<string, TypingUser[]>;
  handleUpdate: (channelId: string, userId: string, username: string) => void;
  handleClear: (channelId: string, userId: string) => void;
  clearForChannel: (channelId: string) => void;
}

export const useTypingStore = create<TypingState>((set, get) => ({
  byChannel: {},

  handleUpdate(channelId, userId, username) {
    const list = get().byChannel[channelId] ?? [];
    const existing = list.find((u) => u.userId === userId);
    if (existing) {
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => get().handleClear(channelId, userId), 5000);
      return;
    }
    const timer = setTimeout(() => get().handleClear(channelId, userId), 5000);
    set((s) => ({ byChannel: { ...s.byChannel, [channelId]: [...list, { userId, username, timer }] } }));
  },

  handleClear(channelId, userId) {
    set((s) => {
      const list = s.byChannel[channelId];
      if (!list) return s;
      const idx = list.findIndex((u) => u.userId === userId);
      if (idx === -1) return s;
      clearTimeout(list[idx].timer);
      const next = list.filter((u) => u.userId !== userId);
      return { byChannel: { ...s.byChannel, [channelId]: next } };
    });
  },

  clearForChannel(channelId) {
    const list = get().byChannel[channelId];
    if (!list) return;
    list.forEach((u) => clearTimeout(u.timer));
    set((s) => {
      const next = { ...s.byChannel };
      delete next[channelId];
      return { byChannel: next };
    });
  },
}));
