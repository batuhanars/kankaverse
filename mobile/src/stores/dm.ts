import { create } from 'zustand';
import { dmApi, type DmChannelDto } from '@/api/dm';
import { extractErrorMessage } from '@/api/errors';

// Sözleşme §8.3 — DM listesi CANLI olmak zorunda. Önceden `DmSidebar` kendi içinde tek seferlik
// çekiyordu: liste yalnız mount'ta doluyordu, sekmeler mount'ta kaldığı için (expo-router Tabs)
// kullanıcı bayat bir listeye süresiz bakabiliyordu — pull-to-refresh de yok. Bu store, soket
// katmanının (realtime/socket.ts) dokunabileceği tek yer; `applyActivity` semantiği web
// `stores/dm.ts` ile birebir aynı: yerinde güncelle + başa taşı + okunmadı işaretle, kanal listede
// yoksa tam tazele.
type LoadState = 'loading' | 'error' | 'ready';

interface DmActivity {
  channelId: string;
  lastMessage: { content: string; createdAt: string };
  senderId: string;
}

interface DmState {
  channels: DmChannelDto[];
  requestCount: number;
  state: LoadState;
  errorMessage: string;
  /** Açık DM ekranı — o kanala gelen mesaj listede "okunmadı" olarak işaretlenmez (web ile aynı). */
  activeDmChannelId: string | null;
  /** Oturum sahibinin id'si. Store auth'u İMPORT ETMEZ (auth.ts → socket.ts → store yönü var, ters
   *  yön döngü kurar); değeri `(app)/_layout.tsx` besler — oturum kapsamlı tek nokta. */
  myId: string | null;

  fetchAll: () => Promise<void>;
  refreshRequests: () => Promise<void>;
  applyActivity: (payload: DmActivity) => Promise<void>;
  setActiveDm: (channelId: string | null) => void;
  clearUnread: (channelId: string) => void;
  /** Oturum başlar/biter: id verilir ya da null ile TÜM DM durumu silinir. null hâli kritik —
   *  liste artık store'da yaşıyor, temizlenmezse çıkıştan sonra bir sonraki kullanıcı öncekinin
   *  DM listesini görür (bileşen yerel state'inde bu sorun kendiliğinden yoktu). */
  setSessionUser: (userId: string | null) => void;
}

/** Bekleyen GİDEN istek normal listede görünmez (web `DmList.vue` C9 kuralı) — gönderen kendi
 *  bekleyen isteğini iki kez görmesin. */
function visibleChannels(list: DmChannelDto[]): DmChannelDto[] {
  return list.filter((c) => !(c.type === 'DM' && c.requestStatus === 'PENDING'));
}

export const useDmStore = create<DmState>((set, get) => ({
  channels: [],
  requestCount: 0,
  state: 'loading',
  errorMessage: '',
  activeDmChannelId: null,
  myId: null,

  async fetchAll() {
    try {
      const [list, requests] = await Promise.all([dmApi.listChannels(), dmApi.listRequests()]);
      set({
        channels: visibleChannels(list),
        requestCount: requests.length,
        state: 'ready',
        errorMessage: '',
      });
    } catch (e) {
      set({ state: 'error', errorMessage: extractErrorMessage(e) });
    }
  },

  async refreshRequests() {
    try {
      const requests = await dmApi.listRequests();
      set({ requestCount: requests.length });
    } catch {
      // sessizce yut — rozet güncellenmeden kalır, liste yine çalışır
    }
  },

  async applyActivity(payload) {
    const { channels, activeDmChannelId, myId } = get();
    const idx = channels.findIndex((c) => c.id === payload.channelId);

    if (idx === -1) {
      // Alıcının listesinde henüz yok (yeni DM / yeni grup) — tam tazele. Yeni bir mesaj isteği de
      // olabilir, o yüzden istek sayacı da bu yolla güncellenir.
      await get().fetchAll();
      return;
    }

    const existing = channels[idx];
    const lastMessage: DmChannelDto['lastMessage'] = existing.lastMessage
      ? { ...existing.lastMessage, content: payload.lastMessage.content, createdAt: payload.lastMessage.createdAt }
      : {
          // Önceki lastMessage null idi — minimal şekle yazılır (web ile aynı; eksik alanlar
          // yalnız önizleme için kullanılmıyor, liste `content`+`createdAt` okuyor).
          id: '',
          channelId: payload.channelId,
          content: payload.lastMessage.content,
          replyToId: null,
          author: { id: payload.senderId, username: '', avatarUrl: null },
          createdAt: payload.lastMessage.createdAt,
          editedAt: null,
          pinnedAt: null,
        };

    const unread =
      payload.senderId !== myId && payload.channelId !== activeDmChannelId ? true : existing.unread;

    const updated = { ...existing, lastMessage, unread } as DmChannelDto;
    const rest = channels.filter((_, i) => i !== idx);
    set({ channels: [updated, ...rest] });
  },

  setActiveDm(channelId) {
    set({ activeDmChannelId: channelId });
  },

  clearUnread(channelId) {
    set((s) => ({
      channels: s.channels.map((c) => (c.id === channelId ? ({ ...c, unread: false } as DmChannelDto) : c)),
    }));
  },

  setSessionUser(userId) {
    if (userId === null) {
      set({
        channels: [],
        requestCount: 0,
        state: 'loading',
        errorMessage: '',
        activeDmChannelId: null,
        myId: null,
      });
      return;
    }
    set({ myId: userId });
  },
}));
