import { io, type Socket } from 'socket.io-client';
import { getAccessToken, refreshAccessToken } from '@/api/http';
import { useMessagesStore } from '@/stores/messages';
import { useTypingStore } from '@/stores/typing';
import { useNotificationsStore } from '@/stores/notifications';
import { useDmStore } from '@/stores/dm';
import { useUnreadStore } from '@/stores/unread';
import { useFriendsStore } from '@/stores/friends';
import { useAuthStore } from '@/stores/auth';
import { useVoiceStore } from '@/stores/voice';
import { useVoicePresenceStore } from '@/stores/voicePresence';
import { presentIncomingCall, dismissIncomingCall } from '@/notifications/incomingCall';
import type { MessageDto } from '@/api/messages';
import type { FriendDto, FriendRequestDto } from '@/api/friends';
import type { VoiceParticipantDto } from '@/api/voice';

// Sprint M1a contract §4 — web/src/composables/useSocket.ts deseni birebir taşındı (yalnız bu
// sprintte KULLANILAN olay alt kümesi — contract §4.2 tablosu). En kritik nokta (contract girişi
// + M0 denetim bulgusu): auth FONKSİYON formu — her (yeniden) bağlantıda EN GÜNCEL access token'ı
// okur. Sabit token verilseydi ~15dk sonra reconnect bayat token'la el sıkışıp auth'ta düşerdi.
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001';

let socket: Socket | null = null;
// Açık kanal — reconnect sonrası yeniden join + yeniden çekim için (contract §4.3, "boşluk bırakma yasağı").
let activeChannelId: string | null = null;
let onReconnectRefetch: (() => void) | null = null;
// auth_error sonrası art arda tazele-dene sayacı (sonsuz döngü koruması)
let authRetryCount = 0;

// M4a-1 sözleşme §3.1 — ses presence aboneliği (DM ekranındaki "sesli arama sürüyor" şeridi).
// Web'de bir Set (birden çok panel aynı anda abone olabilir); mobilde tek seferde tek DM ekranı
// açık olduğu için `activeChannelId` ile AYNI tek-değer deseni yeterli — reconnect'te yeniden abone.
let activeVoiceChannelId: string | null = null;

/** DM ekranı mount/unmount'ta çağırır (bkz. `stores/voice.ts` `subscribePresence`/`unsubscribePresence`). */
export function setActiveVoiceChannel(channelId: string | null): void {
  activeVoiceChannelId = channelId;
}

/** Mesaj ekranı mount/unmount'ta çağırır — reconnect'te hangi kanalın yeniden çekileceğini bildirir. */
export function setActiveChannel(channelId: string | null, refetch?: () => void): void {
  activeChannelId = channelId;
  onReconnectRefetch = refetch ?? null;
}

// Kök neden (PM bulgusu — "[WS] reconnect yeniden-join başarısız: FORBIDDEN"): bu fonksiyon yalnız
// 'connect' handler'ından, o ANKİ `activeChannelId` ile çağrılır (aşağıda). Ack ASENKRON döner;
// dönene kadar kullanıcı ekrandan ayrılmış olabilir (MessageScreen unmount → setActiveChannel(null)
// senkron çalışır). Yani ack geldiğinde `activeChannelId` artık BU çağrının channelId'siyle
// eşleşmeyebilir — "terk edilmiş kanala geç kalan join" tam olarak budur ve zararsızdır: kullanıcı
// zaten o kanalda değil, oda üyeliğinin sunucuda reddedilmesinin (FORBIDDEN/NOT_CHANNEL_MEMBER/vb.)
// hiçbir görünür etkisi yok. Bu durumda UYARI BASILMAZ (gürültü, gerçek hata değil).
// Kullanıcı HÂLÂ o kanaldaysa (activeChannelId hâlâ eşleşiyor) bu gerçek bir sorun olabilir — önce
// bir kez daha denenir (olası neden: reconnect handshake'i sunucunun socket auth'u bitirmeden
// 'channel:join' işlemiş olması, kısa bir sunucu-taraflı yarış; tek retry genelde yeter), yine
// başarısızsa `__DEV__`'de loglanır.
function joinRoom(channelId: string, attempt = 0) {
  socket?.emit('channel:join', { channelId }, (ack: { ok: boolean; error?: string }) => {
    if (ack?.ok) return;
    if (activeChannelId !== channelId) return; // kullanıcı çoktan ayrıldı — sessizce bırak

    if (attempt === 0) {
      setTimeout(() => {
        if (activeChannelId === channelId) joinRoom(channelId, 1);
      }, 800);
      return;
    }

    if (__DEV__) {
      console.warn('[WS] reconnect yeniden-join başarısız:', ack?.error ?? 'bilinmiyor');
    }
  });
}

function ensureSocket(): Socket {
  if (socket) return socket;

  socket = io(API_BASE, {
    autoConnect: false,
    // auth fonksiyon formu — bkz. dosya başı yorumu.
    auth: (cb: (data: { token: string }) => void) => cb({ token: getAccessToken() ?? '' }),
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    authRetryCount = 0;
    if (activeChannelId) {
      joinRoom(activeChannelId);
      // contract §4.3 — "sadece yeni gelenleri dinle" yetmez; arada kaçan mesajlar yeniden çekilir.
      onReconnectRefetch?.();
    }
    // M4a-1 §3.1 — reconnect sonrası ses presence aboneliği de yeniden kurulur (yoksa DM ekranı
    // açık kalırken bağlantı düşüp gelirse "sesli arama sürüyor" şeridi bayat kalırdı).
    if (activeVoiceChannelId) {
      socket?.emit('voice:subscribe', { channelId: activeVoiceChannelId });
    }
  });

  socket.on('connect_error', (err: Error) => {
    if (__DEV__) console.warn('[WS] connect_error', err.message);
  });

  // Bayat access token (~15dk) reconnect el sıkışmasında reddedilir. Kalıcı kapatma YERİNE
  // token'ı tazele + yeniden bağlan. Refresh de başarısızsa gerçekten yetkisiz — bağlantı kapanır;
  // REST tarafındaki 401 akışı (http.ts) oturumu zaten düşürür.
  socket.on('auth_error', async () => {
    if (authRetryCount >= 3) {
      if (__DEV__) console.error('[WS] auth tazelemeye rağmen reddedildi, bağlantı kapatılıyor');
      socket?.disconnect();
      return;
    }
    authRetryCount++;
    try {
      await refreshAccessToken();
      socket?.connect(); // auth callback taze token'ı okur
    } catch {
      socket?.disconnect();
    }
  });

  socket.on('message.created', (message: MessageDto) => {
    useMessagesStore.getState().appendMessage(message);
    useTypingStore.getState().handleClear(message.channelId, message.author.id);
  });

  socket.on('message.updated', (message: MessageDto) => {
    useMessagesStore.getState().updateMessage(message);
  });

  socket.on('message.deleted', (data: { messageId: string; channelId: string }) => {
    useMessagesStore.getState().removeMessage(data.channelId, data.messageId);
  });

  // M1d-C — tepkiler. Sunucu mesajın tamamını değil DELTA yayar (`broadcastReaction`), toplamı
  // istemci tutar. Kendi tepkim de buradan döner: istekten sonra iyimser güncelleme YAPILMIYOR,
  // tek yazma yolu bu olay — yoksa aynı tepki iki kez sayılırdı (M1a'daki `message.created` echo
  // dersinin aynısı).
  const applyReaction = (added: boolean) => (data: { messageId: string; channelId: string; emoji: string; userId: string }) => {
    const myId = useAuthStore.getState().user?.id;
    useMessagesStore
      .getState()
      .applyReaction(data.channelId, data.messageId, data.emoji, added, data.userId === myId);
  };
  socket.on('reaction.added', applyReaction(true));
  socket.on('reaction.removed', applyReaction(false));

  // M1h — sabitleme. Tepkiler gibi DELTA yayını (`broadcastPin`): sunucu mesajın tamamını değil
  // yalnız durum değişimini gönderiyor, istemci `pinnedAt`'i kendi mesajına yazıyor. Sabitleyen
  // kişi de aynı olayı alır — istekten sonra iyimser güncelleme YAPILMIYOR, tek yazma yolu bu.
  socket.on('message.pinned', (data: { messageId: string; channelId: string; pinnedAt: string }) => {
    useMessagesStore.getState().applyPin(data.channelId, data.messageId, data.pinnedAt);
  });
  socket.on('message.unpinned', (data: { messageId: string; channelId: string }) => {
    useMessagesStore.getState().applyPin(data.channelId, data.messageId, null);
  });

  socket.on('typing:update', (data: { userId: string; username: string; channelId: string }) => {
    useTypingStore.getState().handleUpdate(data.channelId, data.userId, data.username);
  });

  socket.on('typing:clear', (data: { userId: string; channelId: string }) => {
    useTypingStore.getState().handleClear(data.channelId, data.userId);
  });

  // Handshake snapshot — Bildirimler sekmesi rozeti (contract §4.2).
  socket.on('notification:snapshot', (payload: { unreadCount: number }) => {
    useNotificationsStore.getState().applySnapshotUnreadCount(payload.unreadCount);
  });

  // ---- Kullanıcı-kapsamlı olaylar (sözleşme §8.3, sahip bulgusu 2026-07-30) ----
  // M1a ilk teslimi YALNIZ kanal-kapsamlı olayları dinliyordu (message.*, typing:*). Sunucu mobili
  // handshake'te `user:<id>` odasına zaten koyuyor, yani aşağıdaki olaylar cihaza GELİYORDU ama
  // kimse dinlemiyordu → DM listesi, istek rozeti ve bildirim rozeti bayat kalıyordu. Web
  // `composables/useSocket.ts` ile aynı olay kümesi (bu sprintte kullanılan alt küme).

  socket.on('dm.message', (data: { channelId: string; lastMessage: { content: string; createdAt: string }; senderId: string }) => {
    useDmStore.getState().applyActivity(data);
  });

  // C9 — bana yeni mesaj isteği geldi. Web'de de sessiz: yalnız rozet tazelenir.
  socket.on('dm.request', () => {
    useDmStore.getState().refreshRequests();
  });

  // Sprint M2a §6 — ortam kanallarında rail/kanal listesi rozetlerinin canlı kaynağı. Bugüne kadar
  // (M1a-M1j) bu olay hiç dinlenmiyordu; Home sekmesi oturum boyunca mount'lu kaldığı için kullanıcı
  // ana ekranda otururken rozetler hiç artmıyordu — yalnız ekran odaklanınca REST'ten geliyordu.
  // `authorId` kontrolü GEREKMEZ: sunucu yazarın kendisine bu olayı zaten göndermiyor
  // (`messages.gateway.ts` `notifyChannelActivity` — "Yazarın kendisine gönderme"). DM kanalıysa
  // (`guildId` null) sunucu bu olayı hiç yaymıyor — bu yüzden `guildId` burada her zaman `string`.
  socket.on('channel.activity', (data: { channelId: string; guildId: string; authorId: string }) => {
    // Sözleşme §6 — o an açık olan kanal sayılmaz (DM store'daki `activeDmChannelId` deseninin kanal
    // tarafı: bu modüldeki `activeChannelId` zaten `MessageScreen`'in mount/unmount'unda güncelleniyor).
    if (data.channelId === activeChannelId) return;
    useUnreadStore.getState().bumpChannel(data.channelId, data.guildId);
  });

  // Kalıcı bildirim (Sprint C1) — rozet + liste anlık. `notification` olayı Bildirimler sekmesi
  // rozetinin TEK kaynağı kalır (aşağıdaki `mention` dinleyicisi ona YAZMAZ — bkz. not).
  socket.on('notification', () => {
    const store = useNotificationsStore.getState();
    store.refreshUnreadCount();
    store.fetchFirstPage();
  });

  // Sprint M2a §6 — `mention` artık dinleniyor ama YALNIZ rail/kanal bahsetme rozetini besliyor;
  // Bildirimler sekmesi rozetine BAĞLANMADI (M1a'dan beri süren bilinçli karar korunuyor): sunucu bir
  // bahsetmede iki şey yayar — anlık `mention` (bu) ve kalıcı `notification`. Kalıcı olan alıcının
  // kanal/ortam bildirim tercihinden SÜZÜLÜR (`messages.gateway.ts` R12 `shouldNotifyChannel` —
  // susturulmuş kanalda hiç üretilmez); `mention`'ı da rozete bağlamak bu susturmayı baypas ederdi.
  // `guildId` null → DM/grup DM bahsetmesi: mobilde DM bahsetme SAYISI yok (sunucu DM'de boolean
  // dönüyor, §1 OUT), bu yüzden atlanır — DM'nin kendi okunmamış noktası zaten `dm.message`'dan geliyor.
  socket.on('mention', (data: { channelId: string; guildId: string | null }) => {
    if (!data.guildId) return;
    if (data.channelId === activeChannelId) return;
    useUnreadStore.getState().bumpChannel(data.channelId, data.guildId, { mention: true });
  });

  // Sprint M1b — `friend.*` HENÜZ dinlenmiyordu (M1a §8.3'ün aynı kusur sınıfı, kanka tarafı için).
  // Web `useSocket.ts` ile aynı olay kümesi + aynı yön okuması (friends.service.ts / blocks.service.ts
  // emitToUser çağrıları): `friend.request` her zaman `direction:'incoming'` ile ALICIYA gelir,
  // `friend.accept` İSTEK SAHİBİNE gider (kabul edenin bilgisiyle), `friend.remove` KARŞI TARAFA
  // gider (arkadaşlıktan çıkarma VEYA engelleme sonucu — ikisi de aynı olayı kullanır, sessiz).
  socket.on('friend.request', (payload: FriendRequestDto) => {
    useFriendsStore.getState().handleIncomingRequest(payload);
  });

  socket.on('friend.accept', (payload: FriendDto) => {
    useFriendsStore.getState().handleAccepted(payload);
  });

  socket.on('friend.remove', (payload: { userId: string }) => {
    useFriendsStore.getState().handleRemoved(payload.userId);
  });

  // ---- M4a-1 sesli arama (sözleşme §2/§3) ----
  // Presence (panel görünümü — DM ekranında bağlı olmasak da "kim var" şeridi için).
  socket.on('voice.participant_joined', (data: { channelId: string; participant: VoiceParticipantDto }) => {
    useVoicePresenceStore.getState().addParticipant(data.channelId, data.participant);
  });
  socket.on('voice.participant_left', (data: { channelId: string; userId: string }) => {
    useVoicePresenceStore.getState().removeParticipant(data.channelId, data.userId);
  });

  // Oda-önce modeli (§0.1) — arayan zaten odada; bu iki olay yalnız UI durumunu günceller,
  // `join()` burada TETİKLENMEZ (web'in klasik modelinin aksine, bkz. web useSocket.ts satır 390-399).
  socket.on('voice.call_accepted', (data: { channelId: string }) => {
    useVoiceStore.getState().handleCallAccepted(data.channelId);
  });
  socket.on('voice.call_rejected', (data: { channelId: string }) => {
    useVoiceStore.getState().handleCallRejected(data.channelId);
  });

  // ---- M4a-2 gelen arama (sözleşme §8, uygulama açıkken) ----
  // Yalnız CALLEE tarafı: davet bize geldi → bildirim + zil (`notifications/incomingCall.ts`).
  // 🔴 Sözleşme §2 — `caller` şekli `VoiceParticipantDto` (`userId`) DEĞİL, ayrı bir alan adı (`id`);
  // presence olaylarındaki katılımcı DTO'suyla karıştırılmasın diye burada AYRI tiplendi.
  socket.on(
    'voice.incoming_call',
    (data: { channelId: string; caller: { id: string; username: string; avatarUrl: string | null } }) => {
      void presentIncomingCall(data.channelId, data.caller);
    },
  );
  // §8.2 — arayan odadan çıkarken (M4a-1'in `call_cancel` gönderimi) telefonumuz kendiliğinden susar.
  socket.on('voice.call_canceled', (data: { channelId: string }) => {
    void dismissIncomingCall(data.channelId);
  });

  return socket;
}

// ---- M4a-1 sesli arama emit'leri (sözleşme §2) ----

/** DM ekranı mount/unmount'ta — o kanalın "kim var" presence'ına abone ol/çık. */
export function voiceSubscribe(channelId: string): void {
  ensureSocket().emit('voice:subscribe', { channelId });
}
export function voiceUnsubscribe(channelId: string): void {
  socket?.emit('voice:unsubscribe', { channelId });
}

/**
 * Arama başlat — ack `{ok:false}` dönerse (sözleşme §2 🔴) istemci kodu AÇIMLAMAZ, nötr mesaj
 * gösterir (T&S, R7). `joinChannel`in ack+timeout desenini birebir izler.
 */
export function callInvite(channelId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const s = ensureSocket();
    let settled = false;
    const done = (ack: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(ack);
    };
    const timer = setTimeout(() => done({ ok: false, error: 'TIMEOUT' }), 5000);
    s.emit('voice:call_invite', { channelId }, (ack: { ok: boolean; error?: string }) => {
      clearTimeout(timer);
      done(ack ?? { ok: false });
    });
  });
}

/**
 * §8'de M4a-1'e verilen tek istisna: odadan çıkarken karşı taraf henüz katılmadıysa bu da
 * gönderilir (arayan tarafın çalan telefonunu/web bekleme barını susturur). Best-effort, ack yok
 * (web `useSocket.ts callCancel` ile aynı — sunucu `{ok:true}` dönse de istemci beklemiyor).
 */
export function callCancel(channelId: string): void {
  socket?.emit('voice:call_cancel', { channelId });
}

/**
 * M4a-2 sözleşme §8.2 — bildirimden "Aramaya Katıl"/"Reddet". Best-effort, ack YOK (§2 tablosunda
 * bu ikisi `callInvite`'ın aksine ack almıyor — `callCancel` ile aynı desen). Sunucuya ulaşmasa bile
 * istemci kendi tarafını (bildirim/zil temizliği, `startOrJoin`) zaten `incomingCall.ts`'te yürütüyor.
 */
export function callAccept(channelId: string): void {
  socket?.emit('voice:call_accept', { channelId });
}
export function callReject(channelId: string): void {
  socket?.emit('voice:call_reject', { channelId });
}

/** Ön plana dönüşte / boot'ta çağrılır (contract §4.3). Zaten bağlıysa no-op. */
export function connectSocket(): void {
  const s = ensureSocket();
  if (!s.connected) s.connect();
}

/** Arka plana düşünce çağrılır — transport kapanır, instance/listener'lar KORUNUR (contract §4.3). */
export function disconnectSocket(): void {
  socket?.disconnect();
}

/** Yalnız logout/oturum düşüşünde — instance tamamen bırakılır. */
export function resetSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  activeChannelId = null;
  onReconnectRefetch = null;
  authRetryCount = 0;
}

/** Mesaj ekranı mount'ta manuel join (ack'li; 5sn timeout — web/useSocket.ts joinChannel deseni). */
export function joinChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const s = ensureSocket();
    let settled = false;
    const done = (ack: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(ack);
    };
    const timer = setTimeout(() => done({ ok: false, error: 'TIMEOUT' }), 5000);
    s.emit('channel:join', { channelId }, (ack: { ok: boolean; error?: string }) => {
      clearTimeout(timer);
      done(ack ?? { ok: false });
    });
  });
}

export function leaveChannel(channelId: string): void {
  socket?.emit('channel:leave', { channelId });
  useTypingStore.getState().clearForChannel(channelId);
}

export function emitTypingStart(channelId: string): void {
  socket?.emit('typing:start', { channelId });
}

export function emitTypingStop(channelId: string): void {
  socket?.emit('typing:stop', { channelId });
}
