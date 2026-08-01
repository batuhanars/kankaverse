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
  /** WS tepki olayının yansıması — sunucu yalnız delta yayar, toplamı istemci tutar. */
  /** M1h — sabitleme durumu (soket deltası). `pinnedAt` null ise sabitleme kalkmış demektir. */
  applyPin: (channelId: string, messageId: string, pinnedAt: string | null) => void;
  applyReaction: (
    channelId: string,
    messageId: string,
    emoji: string,
    added: boolean,
    mine: boolean,
  ) => void;
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

  /**
   * M1d-C — WS `reaction.added` / `reaction.removed` yansıması.
   *
   * Sunucu tepki olayında **mesajın tamamını değil**, yalnız `{ messageId, emoji, userId }` yayar
   * (`messages.controller.ts` `broadcastReaction`) — yani toplamı istemci güncelliyor. Bu yüzden
   * `updateMessage` kullanılamaz; sayaç burada elle artırılıp azaltılıyor.
   *
   * `mine` = olayın sahibi ben miyim: `reactedByMe` yalnız o zaman değişir, başkasının tepkisi
   * benim vurgumu bozmamalı.
   */
  applyReaction(channelId, messageId, emoji, added, mine) {
    set((s) => {
      const current = s.byChannel[channelId]?.messages;
      if (!current) return s;
      const idx = current.findIndex((m) => m.id === messageId);
      if (idx === -1) return s;

      const message = current[idx];
      const reactions = [...(message.reactions ?? [])];
      const rIdx = reactions.findIndex((r) => r.emoji === emoji);

      if (added) {
        if (rIdx === -1) reactions.push({ emoji, count: 1, reactedByMe: mine });
        else
          reactions[rIdx] = {
            ...reactions[rIdx],
            count: reactions[rIdx].count + 1,
            reactedByMe: reactions[rIdx].reactedByMe || mine,
          };
      } else if (rIdx !== -1) {
        const next = reactions[rIdx].count - 1;
        // Son tepki de kalkınca pill'i tamamen kaldır — "0" gösteren rozet bırakma.
        if (next <= 0) reactions.splice(rIdx, 1);
        else
          reactions[rIdx] = {
            ...reactions[rIdx],
            count: next,
            reactedByMe: mine ? false : reactions[rIdx].reactedByMe,
          };
      }

      const messages = [...current];
      messages[idx] = { ...message, reactions };
      return { byChannel: { ...s.byChannel, [channelId]: { ...s.byChannel[channelId], messages } } };
    });
  },

  applyPin(channelId, messageId, pinnedAt) {
    set((s) => {
      const current = s.byChannel[channelId]?.messages;
      if (!current) return s;
      const idx = current.findIndex((m) => m.id === messageId);
      // Mesaj yüklü sayfada değilse yapacak bir şey yok — sabitlenenler ekranı listeyi zaten
      // sunucudan çekiyor, store'a hayalet kayıt eklenmez.
      if (idx === -1) return s;
      const messages = [...current];
      messages[idx] = { ...current[idx], pinnedAt };
      return { byChannel: { ...s.byChannel, [channelId]: { ...s.byChannel[channelId], messages } } };
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
