import { create } from 'zustand';
import { voiceApi, type VoiceParticipantDto } from '@/api/voice';
import { voiceSubscribe, voiceUnsubscribe } from '@/realtime/socket';

/**
 * M4a-1 sözleşme §3.1 — ses presence'ı (DM ekranındaki "sesli arama sürüyor" şeridi). `stores/voice.ts`
 * (LiveKit `Room` bağlantısı) kasıtlı olarak AYRI: bu store WS + `GET voice/participants`ten beslenir,
 * bağlı OLMASAK da çalışır — DM ekranı aramaya hiç katılmadan "kim var" bilgisini gösterebilmeli.
 * Web'in `voice.ts`'indeki aynı ayrım (`participantsByChannel` vs `roomParticipants`) burada iki store'a
 * bölündü çünkü mobilde tüketiciler de ayrı: DM ekranı yalnız bunu, arama ekranı yalnız `voice.ts`'i okur.
 */

export interface VoicePresenceParticipant {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

interface VoicePresenceState {
  byChannel: Record<string, VoicePresenceParticipant[]>;
  startedAtByChannel: Record<string, number | null>;

  subscribe: (channelId: string) => void;
  unsubscribe: (channelId: string) => void;
  for: (channelId: string) => VoicePresenceParticipant[];
  startedAtFor: (channelId: string) => number | null;
  addParticipant: (channelId: string, p: VoiceParticipantDto) => void;
  removeParticipant: (channelId: string, userId: string) => void;
  /** Kanalın arama durumunu sıfırlar (gruptan ayrılınca/çıkarılınca güncelleme gelmez, eski görüntü kalmasın). */
  clearChannel: (channelId: string) => void;
}

export const useVoicePresenceStore = create<VoicePresenceState>((set, get) => ({
  byChannel: {},
  startedAtByChannel: {},

  subscribe(channelId) {
    // [[D45]] M4b §13.1 — `voiceSubscribe`/`voiceUnsubscribe` artık referans sayılı (bkz.
    // `realtime/socket.ts`); ayrı bir `setActiveVoiceChannel` çağrısına gerek kalmadı, reconnect
    // yeniden-abonesi doğrudan o sayaçtan besleniyor.
    voiceSubscribe(channelId);
    voiceApi
      .getParticipants(channelId)
      .then((res) => {
        set((s) => ({
          byChannel: { ...s.byChannel, [channelId]: res.participants },
          startedAtByChannel: { ...s.startedAtByChannel, [channelId]: res.startedAt },
        }));
      })
      .catch(() => {
        set((s) => ({
          byChannel: { ...s.byChannel, [channelId]: [] },
          startedAtByChannel: { ...s.startedAtByChannel, [channelId]: null },
        }));
      });
  },

  unsubscribe(channelId) {
    voiceUnsubscribe(channelId);
  },

  for(channelId) {
    return get().byChannel[channelId] ?? [];
  },
  startedAtFor(channelId) {
    return get().startedAtByChannel[channelId] ?? null;
  },

  addParticipant(channelId, p) {
    set((s) => {
      const list = s.byChannel[channelId] ?? [];
      if (list.some((x) => x.userId === p.userId)) return s;
      return {
        byChannel: { ...s.byChannel, [channelId]: [...list, p] },
        startedAtByChannel: { ...s.startedAtByChannel, [channelId]: s.startedAtByChannel[channelId] ?? Date.now() },
      };
    });
  },
  removeParticipant(channelId, userId) {
    set((s) => {
      const list = s.byChannel[channelId];
      if (!list) return s;
      const next = list.filter((x) => x.userId !== userId);
      return {
        byChannel: { ...s.byChannel, [channelId]: next },
        startedAtByChannel: { ...s.startedAtByChannel, [channelId]: next.length === 0 ? null : s.startedAtByChannel[channelId] },
      };
    });
  },
  clearChannel(channelId) {
    set((s) => ({
      byChannel: { ...s.byChannel, [channelId]: [] },
      startedAtByChannel: { ...s.startedAtByChannel, [channelId]: null },
    }));
  },
}));
