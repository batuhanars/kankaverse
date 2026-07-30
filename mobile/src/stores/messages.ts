import { create } from 'zustand';
import { messagesApi, type MessageDto } from '@/api/messages';

// web/src/stores/messages.ts deseni birebir taşındı — backend `desc` (yeni→eski) döner, store
// ASC (eski→yeni) tutar; ekranlar kendi render sırasına göre çevirir. `setMessages` ilk sayfa,
// `prependOlder` yukarı-kaydır sayfalaması, `appendMessage` WS + optimistik kendi mesajı (id
// bazlı mükerrer önleme — gönderdikten hemen sonra `message.created` WS echo'su da gelir).
interface ChannelMessageState {
  messages: MessageDto[];
  hasMore: boolean;
}

interface MessagesState {
  byChannel: Record<string, ChannelMessageState>;
  // Mention gösterimi (contract §4.4) — kanal başına bilinen userId -> username. Kesin bir üye
  // listesi ucu contract §3 tablosunda yok; bilinen yazarlardan best-effort inşa edilir (web'in
  // DmList `lastMsgResolver` deseniyle aynı "bilinmeyen'e düş" mantığı).
  knownUsers: Record<string, Record<string, string>>; // channelId -> userId -> username

  fetchInitial: (channelId: string) => Promise<void>;
  fetchOlder: (channelId: string) => Promise<void>;
  appendMessage: (message: MessageDto) => void;
  updateMessage: (message: MessageDto) => void;
  removeMessage: (channelId: string, messageId: string) => void;
  seedKnownUser: (channelId: string, userId: string, username: string) => void;
  resolveUsername: (channelId: string, userId: string) => string | undefined;
}

function learnAuthors(channelId: string, messages: MessageDto[], known: Record<string, Record<string, string>>) {
  const map = { ...(known[channelId] ?? {}) };
  for (const m of messages) {
    map[m.author.id] = m.author.username;
  }
  return { ...known, [channelId]: map };
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  byChannel: {},
  knownUsers: {},

  async fetchInitial(channelId) {
    const fetched = await messagesApi.list(channelId);
    const ascending = [...fetched].reverse();
    set((s) => ({
      byChannel: { ...s.byChannel, [channelId]: { messages: ascending, hasMore: fetched.length === 50 } },
      knownUsers: learnAuthors(channelId, fetched, s.knownUsers),
    }));
  },

  async fetchOlder(channelId) {
    const current = get().byChannel[channelId];
    const oldest = current?.messages[0];
    if (!oldest) return;
    const fetched = await messagesApi.list(channelId, oldest.id);
    const ascending = [...fetched].reverse();
    set((s) => {
      const existing = s.byChannel[channelId]?.messages ?? [];
      return {
        byChannel: {
          ...s.byChannel,
          [channelId]: { messages: [...ascending, ...existing], hasMore: fetched.length === 50 },
        },
        knownUsers: learnAuthors(channelId, fetched, s.knownUsers),
      };
    });
  },

  appendMessage(message) {
    set((s) => {
      const current = s.byChannel[message.channelId]?.messages ?? [];
      if (current.find((m) => m.id === message.id)) {
        return s; // mükerrer (kendi gönderdiğim + WS echo)
      }
      return {
        byChannel: {
          ...s.byChannel,
          [message.channelId]: {
            messages: [...current, message],
            hasMore: s.byChannel[message.channelId]?.hasMore ?? false,
          },
        },
        knownUsers: learnAuthors(message.channelId, [message], s.knownUsers),
      };
    });
  },

  updateMessage(message) {
    set((s) => {
      const current = s.byChannel[message.channelId]?.messages;
      if (!current) return s;
      const idx = current.findIndex((m) => m.id === message.id);
      if (idx === -1) return s;
      const next = [...current];
      next[idx] = message;
      return {
        byChannel: { ...s.byChannel, [message.channelId]: { ...s.byChannel[message.channelId], messages: next } },
      };
    });
  },

  removeMessage(channelId, messageId) {
    set((s) => {
      const current = s.byChannel[channelId]?.messages;
      if (!current) return s;
      return {
        byChannel: {
          ...s.byChannel,
          [channelId]: { ...s.byChannel[channelId], messages: current.filter((m) => m.id !== messageId) },
        },
      };
    });
  },

  seedKnownUser(channelId, userId, username) {
    set((s) => ({
      knownUsers: { ...s.knownUsers, [channelId]: { ...(s.knownUsers[channelId] ?? {}), [userId]: username } },
    }));
  },

  resolveUsername(channelId, userId) {
    return get().knownUsers[channelId]?.[userId];
  },
}));
