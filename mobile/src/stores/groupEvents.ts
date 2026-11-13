import { create } from 'zustand';
import { dmApi, type GroupDmEventDto } from '@/api/dm';

/**
 * C64: grup DM uyelik olaylari (mesaj DEGIL: okunmadi/bildirim/onizleme uretmez). Sohbet acilisinda REST'ten
 * cekilir, acikken `dm.group_event` ile eklenir. Kimlik (`id`) ile tekillesir: soket yankisi ile liste cakisabilir.
 */
interface GroupEventsState {
  byChannel: Record<string, GroupDmEventDto[]>;
  load: (channelId: string) => Promise<void>;
  append: (event: GroupDmEventDto) => void;
  reset: () => void;
}

const byTime = (a: GroupDmEventDto, b: GroupDmEventDto) => Date.parse(a.createdAt) - Date.parse(b.createdAt);

function merge(current: GroupDmEventDto[], incoming: GroupDmEventDto[]): GroupDmEventDto[] {
  const map = new Map(current.map((e) => [e.id, e]));
  for (const e of incoming) map.set(e.id, e);
  return [...map.values()].sort(byTime);
}

export const useGroupEventsStore = create<GroupEventsState>((set, get) => ({
  byChannel: {},

  async load(channelId) {
    try {
      const list = await dmApi.listGroupEvents(channelId);
      set((s) => ({ byChannel: { ...s.byChannel, [channelId]: merge(s.byChannel[channelId] ?? [], list) } }));
    } catch {
      // Satirlar bilgi amacli; yuklenemezse sohbet yine calisir.
    }
  },

  append(event) {
    set((s) => ({
      byChannel: { ...s.byChannel, [event.channelId]: merge(s.byChannel[event.channelId] ?? [], [event]) },
    }));
  },

  reset() {
    if (Object.keys(get().byChannel).length > 0) set({ byChannel: {} });
  },
}));
