import { PermissionsAndroid, Platform } from 'react-native';
import { create } from 'zustand';
import { Room, RoomEvent, ParticipantEvent, Track, type Participant, type RemoteParticipant } from 'livekit-client';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import { voiceApi } from '@/api/voice';
import { callInvite, callCancel } from '@/realtime/socket';
import { useVoicePresenceStore } from '@/stores/voicePresence';
import { extractErrorMessage, extractErrorCode } from '@/api/errors';
import {
  startCallForegroundService,
  updateCallForegroundService,
  stopCallForegroundService,
  addCallForegroundActionListener,
} from '@modules/call-foreground-service';
import { t } from '@/i18n';

/**
 * M4a-1 sözleşme §3 — LiveKit ses store'u: yalnız YEREL BAĞLANTI (`Room` yaşam döngüsü, mikrofon,
 * konuşan/susturulmuş göstergesi, tek-başına-kalma zaman aşımı). "Kim var" presence şeridi ayrı bir
 * store'da (`stores/voicePresence.ts` — DM ekranı bağlı olmasak da onu okur, web'deki iki katman
 * ayrımının burada iki dosyaya bölünmüş hâli). Web `stores/voice.ts` davranış referansı ama
 * KOPYALANMADI: video/deafen/cihaz-seçim state'i yok (M4a-1 kapsamı dışı, sözleşme §12).
 */

export interface RoomMember {
  userId: string;
  username: string;
  avatarUrl: string | null;
  isLocal: boolean;
}

/** §5 — LiveKit `AudioSession.getAudioOutputs()`in Android'de döndürdüğü sabit kategori kümesi. */
export type AudioOutputId = 'speaker' | 'earpiece' | 'headset' | 'bluetooth';

interface VoiceState {
  connectedChannelId: string | null;
  connecting: boolean;
  connectedAt: number | null;
  /** Bu oturumda BİZ mi çağırdık (§4 "Çalıyor…" göstergesi) — katılınca (mevcut odaya) false kalır. */
  didInvite: boolean;
  isMuted: boolean;
  canPublish: boolean;
  roomParticipants: RoomMember[];
  speakingUserIds: Set<string>;
  mutedUserIds: Set<string>;
  /** Beklenmedik/bilgilendirilmesi gereken ayrılış nedeni (Türkçe) — çağıran ekran Alert ile gösterir,
   *  sonra temizler. Kullanıcı kendi "kapat"a bastıysa null kalır (alert gösterilmez). */
  disconnectReason: string | null;
  /** §5 — son BİLİNEN çıkış seçimi (SDK "şu an hangisi aktif" sorgusu vermiyor, yalnız kendi
   *  seçimlerimizi takip ediyoruz — bkz. `OutputPickerSheet`in rapordaki bilinen sınırı). */
  outputId: AudioOutputId | null;

  isConnectedTo: (channelId: string) => boolean;
  clearDisconnectReason: () => void;
  setOutputId: (id: AudioOutputId) => void;

  /**
   * §3.1/§3.2 — izin + (gerekirse) davet + token + bağlan. `peerLabel` bildirim gövdesi (karşı ad).
   * `reason: 'mic_denied'` çağıran ekranın "Ayarları Aç" seçeneği sunması için — metin karşılaştırması
   * yerine ayrık bir kod (çeviri değişirse kırılmasın).
   */
  startOrJoin: (
    channelId: string,
    peerLabel: string,
  ) => Promise<{ ok: boolean; message?: string; reason?: 'mic_denied' | 'other' }>;
  /** `userInitiated` true ise (kullanıcı "kapat"a bastı) `disconnectReason` set edilmez. */
  leave: (userInitiated?: boolean) => Promise<void>;
  toggleMute: () => Promise<void>;

  handleCallAccepted: (channelId: string) => void;
  handleCallRejected: (channelId: string) => void;
}

// Yerel bağlantı nesnesi — reaktif değil (web voice.ts ile aynı gerekçe, kompleks/mutable nesne).
let room: Room | null = null;
// 🔴 "Ayrılış bizden mi başladı" bayrağı (sahip cihaz turu 2026-08-06). `leave()` içindeki
// `room.disconnect()` LiveKit'in `Disconnected` olayını tetikliyor; o dinleyici bunu BEKLENMEDİK
// kopma sanıp ikinci bir `leave()` başlatıyor ve `disconnectReason`ı "Bağlantı kesildi" ile
// eziyordu. Görünen iki kusur da buydu: (1) karşı taraf reddedince nötr mesaj yerine "bağlantı
// kesildi" çıkıyor, (2) her kapatmada iki temizlik + iki `voice/leave` isteği iç içe giriyor.
let leaving = false;
let peerEverJoined = false;
let aloneTimer: ReturnType<typeof setTimeout> | null = null;
let foregroundListenerRemove: (() => void) | null = null;
// Bildirim gövdesi (karşı tarafın adı) — `toggleMute` yalnız eylem etiketini günceller, gövdeyi
// `roomParticipants`ten YENİDEN TÜRETMEZ (katılmadan önce boş dönerdi, bildirim adı silinirdi).
let currentPeerLabel = '';
// PM incelemesi (2026-08-06) — katılımcı kimliği → KARARLI handler referansı. Önceki hâli her
// çağrıda yeni bir closure yaratıyordu, bu yüzden `p.off(event, handler)` hiçbir şeyi kaldırmıyordu
// (yanlış güven veren ölü kod). Map, aynı katılımcıya iki kez dinleyici takılmasını da engelliyor.
const speakingHandlers = new Map<string, () => void>();

const ALONE_TIMEOUT_NEVER_JOINED_MS = 3 * 60_000; // §3.3 — hiç kimse katılmadıysa (arayan bekliyor)
const ALONE_TIMEOUT_LEFT_MS = 60_000; // §3.3 — biri katılıp sonra çıktıysa (web REV-12 pariteti)

function clearAloneTimer() {
  if (aloneTimer) {
    clearTimeout(aloneTimer);
    aloneTimer = null;
  }
}

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function toRoomMember(p: Participant, localIdentity: string | undefined): RoomMember {
  let avatarUrl: string | null = null;
  try {
    if (p.metadata) avatarUrl = (JSON.parse(p.metadata) as { avatarUrl?: string | null })?.avatarUrl ?? null;
  } catch {
    // yoksay — bozuk metadata avatarsız devam eder
  }
  return { userId: p.identity, username: p.name || p.identity, avatarUrl, isLocal: p.identity === localIdentity };
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  connectedChannelId: null,
  connecting: false,
  connectedAt: null,
  didInvite: false,
  isMuted: false,
  canPublish: false,
  roomParticipants: [],
  speakingUserIds: new Set(),
  mutedUserIds: new Set(),
  disconnectReason: null,
  outputId: null,

  isConnectedTo(channelId) {
    return get().connectedChannelId === channelId;
  },
  clearDisconnectReason() {
    set({ disconnectReason: null });
  },
  setOutputId(id) {
    set({ outputId: id });
  },

  async startOrJoin(channelId, peerLabel) {
    if (get().connectedChannelId === channelId) return { ok: true };
    if (room) await get().leave(true);

    const granted = await requestMicPermission();
    if (!granted) {
      // §3.2 🔴 — reddedilirse arama ekranı AÇILMAZ; çağıran ekran bu mesajı gösterip
      // "Ayarları aç" seçeneği sunar (Linking.openSettings — ekranın kendi işi).
      return { ok: false, message: t('mobile.call.micPermissionDenied'), reason: 'mic_denied' };
    }

    const alreadyOngoing = useVoicePresenceStore.getState().for(channelId).length > 0;
    currentPeerLabel = peerLabel;
    set({ connecting: true, disconnectReason: null, didInvite: !alreadyOngoing });

    // §3.1 🔴 — sıra önemli: davet ÖNCE (kimse yoksa). Ack `ok:false` ise odaya HİÇ girilmez.
    if (!alreadyOngoing) {
      const ack = await callInvite(channelId);
      if (!ack.ok) {
        set({ connecting: false, didInvite: false });
        return { ok: false, message: t('mobile.call.unreachable') };
      }
    }

    try {
      const data = await voiceApi.getToken(channelId);

      await AudioSession.configureAudio({
        android: { audioTypeOptions: AndroidAudioTypePresets.communication },
      });
      await AudioSession.startAudioSession();
      // §5 — varsayılan Hoparlör (Discord pariteti), AMA yalnız kablolu/Bluetooth kulaklık YOKSA:
      // biri bağlıysa `preferredOutputList` (bluetooth > headset > speaker > earpiece) zaten onu
      // seçer, üstüne yazmak takılı kulaklığı görmezden gelirdi.
      try {
        const outputs = await AudioSession.getAudioOutputs();
        if (outputs.includes('bluetooth') || outputs.includes('headset')) {
          set({ outputId: outputs.includes('bluetooth') ? 'bluetooth' : 'headset' });
        } else {
          await AudioSession.selectAudioOutput('speaker');
          set({ outputId: 'speaker' });
        }
      } catch {
        // yoksay — platform varsayılanı geçerli kalır, seçici açılınca kendi listesini okur
      }

      room = new Room({
        publishDefaults: { audioPreset: { maxBitrate: (data.bitrate ?? 64) * 1000 } },
      });
      wireRoom(room, channelId, set, get);
      await room.connect(data.url, data.token);

      // 🔴 PM incelemesi (2026-08-06) — bu iki satır eksikti: `wireRoom`in `ParticipantConnected`
      // dinleyicisi yalnız BİZDEN SONRA girenlere `attachSpeaking` çağırıyordu. Kendi katılımcımız
      // ve biz bağlanmadan önce zaten odada olan katılımcılar hiç per-participant dinleyici
      // almıyor, aggregate `ActiveSpeakersChanged`e kalıyordu — sözleşme §4 bunu açıkça yasaklıyor
      // (web dersi: aggregate olay mute/unmute döngüsünde kaçıyor). Web `voice.ts:243-244` deseni.
      attachSpeaking(room.localParticipant, set);
      for (const p of room.remoteParticipants.values()) attachSpeaking(p, set);

      peerEverJoined = false;
      set({
        connectedChannelId: channelId,
        connectedAt: Date.now(),
        canPublish: data.canPublish,
        connecting: false,
      });

      if (data.canPublish) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          set({ isMuted: false });
        } catch {
          set({ isMuted: true });
        }
      } else {
        // Karantina (§2) — dinleyici olarak bağlan, mikrofon düğmesi pasif kalır (call.tsx bunu okur).
        set({ isMuted: true });
      }

      refreshRoomParticipants(set, get);
      scheduleAloneCheckIfNeeded(get);

      // §6 — bildirim/servis kurulumu KENDİ try/catch'inde: burada patlarsa (ör. sistem izni
      // reddetti) az önce başarıyla kurulan LiveKit bağlantısını AŞAĞIDAKİ catch'e düşürüp
      // yıkmamalı — arama sürer, yalnız bildirim eksik kalır (native taraftaki aynı felsefe).
      try {
        const muteLabel = get().isMuted ? t('voice.unmute') : t('voice.mute');
        await startCallForegroundService(
          t('mobile.call.ongoing'),
          peerLabel,
          muteLabel,
          t('mobile.call.notifDisconnect'),
          t('mobile.call.notifChannel'),
        );
        foregroundListenerRemove?.();
        foregroundListenerRemove = addCallForegroundActionListener((e) => {
          if (e.action === 'disconnect') void get().leave(true);
          else if (e.action === 'toggleMute') void get().toggleMute();
        }).remove;
      } catch {
        // yoksay — bkz. yorum yukarıda
      }

      return { ok: true };
    } catch (e: unknown) {
      const code = extractErrorCode(e);
      const message = code === 'CHANNEL_FULL' ? t('voice.channelFull') : extractErrorMessage(e);
      if (!alreadyOngoing) callCancel(channelId); // §8 istisnası — davet gönderildiyse geri al
      await get().leave(true);
      return { ok: false, message };
    }
  },

  async leave(userInitiated = false) {
    // Yeniden girişi engelle: `room.disconnect()` sırasında gelen `Disconnected` olayı ya da
    // bildirimden gelen ikinci "Bağlantıyı Kes" bu fonksiyonu tekrar çağırabiliyor. İkinci geçiş
    // `voice/leave`i ikinci kez atıyor ve durumu yarıda sıfırlıyordu.
    if (leaving) return;
    leaving = true;
    const channelId = get().connectedChannelId;
    const wasAlone = get().roomParticipants.length <= 1;
    clearAloneTimer();
    peerEverJoined = false;
    currentPeerLabel = '';
    // Her oturum yeni bir `Room` nesnesi (yeni katılımcı kimlikleri) — bir sonraki `startOrJoin`
    // eski oturumdan kalma handler'larla karışmasın diye map burada temizlenir.
    speakingHandlers.clear();

    foregroundListenerRemove?.();
    foregroundListenerRemove = null;
    stopCallForegroundService().catch(() => {});

    if (room) {
      try {
        await room.disconnect();
      } catch {
        // yoksay
      }
      room = null;
    }
    try {
      await AudioSession.stopAudioSession();
    } catch {
      // yoksay
    }

    // §8 istisnası — davet gönderilmişti ve kimse katılmadıysa, çıkarken karşı tarafın
    // çalan telefonunu/web bekleme barını da susturmak için call_cancel gönderilir.
    if (channelId && get().didInvite && wasAlone) callCancel(channelId);

    // Dev-fix: LiveKit webhook'u yakalayamazsa diğer istemcilerin presence'ı güncellensin.
    if (channelId) voiceApi.leave(channelId).catch(() => {});

    set({
      connectedChannelId: null,
      connecting: false,
      connectedAt: null,
      didInvite: false,
      isMuted: false,
      canPublish: false,
      roomParticipants: [],
      speakingUserIds: new Set(),
      mutedUserIds: new Set(),
      outputId: null,
      disconnectReason: userInitiated ? null : get().disconnectReason,
    });
    leaving = false;
  },

  async toggleMute() {
    if (!room || !get().canPublish) return;
    const next = !get().isMuted;
    try {
      await room.localParticipant.setMicrophoneEnabled(!next);
      set({ isMuted: next });
      updateCallForegroundService(currentPeerLabel, next ? t('voice.unmute') : t('voice.mute')).catch(() => {});
    } catch {
      // izin/cihaz yoksa değiştirme
    }
  },

  handleCallAccepted(channelId) {
    if (get().connectedChannelId === channelId) set({ didInvite: false });
  },
  handleCallRejected(channelId) {
    if (get().connectedChannelId !== channelId) return;
    set({ disconnectReason: t('mobile.call.unreachable') });
    void get().leave(false);
  },
}));

// ── LiveKit Room olayları ──────────────────────────────────────────────────
function refreshRoomParticipants(
  set: (partial: Partial<VoiceState>) => void,
  get: () => VoiceState,
) {
  if (!room) {
    set({ roomParticipants: [] });
    return;
  }
  const localId = room.localParticipant?.identity;
  const list: RoomMember[] = [toRoomMember(room.localParticipant, localId)];
  for (const p of room.remoteParticipants.values()) list.push(toRoomMember(p, localId));
  set({ roomParticipants: list });
  if (list.length >= 2) peerEverJoined = true;
}

function recomputeSpeaking(set: (partial: Partial<VoiceState>) => void) {
  if (!room) {
    set({ speakingUserIds: new Set() });
    return;
  }
  const s = new Set<string>();
  if (room.localParticipant?.isSpeaking) s.add(room.localParticipant.identity);
  for (const p of room.remoteParticipants.values()) if (p.isSpeaking) s.add(p.identity);
  set({ speakingUserIds: s });
}

/**
 * §4 — konuşma algısı per-participant `IsSpeakingChanged` ile (web dersi: aggregate
 * `ActiveSpeakersChanged` mute/unmute döngüsünde kaçıyor). Kararlı handler `speakingHandlers`'ta
 * saklanır — zaten bağlıysa (`has`) tekrar bağlamaz, ne çift dinleyici ne de kaybolan `off` olur.
 */
function attachSpeaking(p: Participant, set: (partial: Partial<VoiceState>) => void) {
  if (speakingHandlers.has(p.identity)) return;
  const handler = () => recomputeSpeaking(set);
  speakingHandlers.set(p.identity, handler);
  p.on(ParticipantEvent.IsSpeakingChanged, handler);
}

function detachSpeaking(p: Participant) {
  const handler = speakingHandlers.get(p.identity);
  if (!handler) return;
  p.off(ParticipantEvent.IsSpeakingChanged, handler);
  speakingHandlers.delete(p.identity);
}

/** §3.3 — tek başına kalınca eşik (3dk hiç katılmadıysa · 60sn katılıp çıktıysa). */
function scheduleAloneCheckIfNeeded(get: () => VoiceState) {
  clearAloneTimer();
  if (get().roomParticipants.length !== 1) return;
  const timeout = peerEverJoined ? ALONE_TIMEOUT_LEFT_MS : ALONE_TIMEOUT_NEVER_JOINED_MS;
  aloneTimer = setTimeout(() => {
    if (get().roomParticipants.length === 1) void get().leave(false);
  }, timeout);
}

function wireRoom(
  r: Room,
  channelId: string,
  set: (partial: Partial<VoiceState>) => void,
  get: () => VoiceState,
) {
  r.on(RoomEvent.TrackMuted, (pub, p: Participant) => {
    if (pub.kind !== Track.Kind.Audio) return;
    const s = new Set(get().mutedUserIds);
    s.add(p.identity);
    set({ mutedUserIds: s });
  });
  r.on(RoomEvent.TrackUnmuted, (pub, p: Participant) => {
    if (pub.kind !== Track.Kind.Audio) return;
    const s = new Set(get().mutedUserIds);
    s.delete(p.identity);
    set({ mutedUserIds: s });
  });
  r.on(RoomEvent.ActiveSpeakersChanged, () => recomputeSpeaking(set));
  r.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
    attachSpeaking(p, set);
    refreshRoomParticipants(set, get);
    scheduleAloneCheckIfNeeded(get);
  });
  r.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
    detachSpeaking(p);
    refreshRoomParticipants(set, get);
    recomputeSpeaking(set);
    scheduleAloneCheckIfNeeded(get);
  });
  r.on(RoomEvent.Disconnected, (reason?: unknown) => {
    // §3.3 🔴 — YALNIZ beklenmedik kopma (ağ/sunucu/A4/R11B). Ayrılışı biz başlattıysak
    // (`leaving`) bu olay `room.disconnect()`in kendi yankısıdır: temizlik zaten yürüyor ve
    // buradaki "Bağlantı kesildi" mesajı gerçek sebebi (ör. karşı taraf reddetti) EZER.
    if (__DEV__) console.warn('[voice] LiveKit Disconnected — reason:', reason);
    if (leaving) return;
    if (get().connectedChannelId === channelId) {
      set({ disconnectReason: t('mobile.call.disconnected') });
      room = null;
      void get().leave(false);
    }
  });
}
