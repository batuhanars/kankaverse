import { Alert, AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, refreshAccessToken } from '@/api/http';
import { useMessagesStore } from '@/stores/messages';
import { decryptDmLastMessage, forgetE2eeMessage, hydrateOne } from '@/stores/e2ee';
import { bindE2eeSocket } from './e2eeSocket';
import { useTypingStore } from '@/stores/typing';
import { useNotificationsStore } from '@/stores/notifications';
import { useAiVideoViewerStore } from '@/stores/aiVideoViewer';
import { showToast } from '@/stores/toast';
import { useDmStore } from '@/stores/dm';
import { useUnreadStore } from '@/stores/unread';
import { useFriendsStore } from '@/stores/friends';
import { useAuthStore } from '@/stores/auth';
import { useGuildSyncStore } from '@/stores/guildSync';
import { useVoiceStore } from '@/stores/voice';
import { useVoicePresenceStore } from '@/stores/voicePresence';
import { usePresenceStore, type PresenceStatus } from '@/stores/presence';
import { useActivityStore } from '@/stores/activity';
import { presentIncomingCall, dismissIncomingCall } from '@/notifications/incomingCall';
import { clearChannelNotifications } from '@/notifications/push';
import { t } from '@/i18n';
import type { MessageDto } from '@/api/messages';
import type { DmLastReactionDto } from '@/api/dm';
import type { FriendDto, FriendRequestDto } from '@/api/friends';
import type { VoiceParticipantDto } from '@/api/voice';

// Sprint M1a contract §4 — web/src/composables/useSocket.ts deseni birebir taşındı (yalnız bu
// sprintte KULLANILAN olay alt kümesi — contract §4.2 tablosu). En kritik nokta (contract girişi
// + M0 denetim bulgusu): auth FONKSİYON formu — her (yeniden) bağlantıda EN GÜNCEL access token'ı
// okur. Sabit token verilseydi ~15dk sonra reconnect bayat token'la el sıkışıp auth'ta düşerdi.
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001';

// PM bulgusu (yayın engelleyici, 2026-08-10) — Socket.IO istemcisi `io(url, opts)`'a verilen adresin
// YOL kısmını (varsa) NAMESPACE olarak yorumlar, sunucu adresi değil. `API_BASE` üretimde
// `https://kankaverse.com/api` (HTTP istemcisinin `/api` öneki için) — bu adresle `io()` çağrılırsa
// istemci `https://kankaverse.com` origin'ine bağlanıp `/api` NAMESPACE'ini ister; sunucuda öyle bir
// namespace yok, el sıkışma sessizce hiç kurulmaz (`connect` asla ateşlenmez, `connect_error` de
// önceden loglanmıyordu → tamamen sessiz). Dev ortamında `http://192.168.1.50:3001` yol içermediği
// için varsayılan namespace'e düşüyordu, kusur yalnız üretimde görünür oluyordu.
//
// `URL` global'i RN/Hermes'te kısmi bir polyfilldır (whatwg-url'ün tamamı değil) ve yeni bağımlılık
// eklemek bu turda yasak — regex ile `scheme://host[:port]` kısmı ayıklanır, yoldan bağımsız. Hem
// `https://kankaverse.com/api` hem `https://kankaverse.com/api/` hem `http://192.168.1.50:3001` hem
// `http://192.168.1.50:3001/` için doğru origin'i döner; eşleşmezse (beklenmeyen biçim) ham değeri
// olduğu gibi geçirir — en kötü ihtimalle eski (bozuk) davranışa düşer, çökmez.
function getSocketOrigin(apiBase: string): string {
  const match = /^(https?:\/\/[^/]+)/i.exec(apiBase);
  return match ? match[1] : apiBase;
}

const SOCKET_ORIGIN = getSocketOrigin(API_BASE);

let socket: Socket | null = null;
// Açık kanal — reconnect sonrası yeniden join + yeniden çekim için (contract §4.3, "boşluk bırakma yasağı").
let activeChannelId: string | null = null;
let onReconnectRefetch: (() => void) | null = null;
// auth_error sonrası art arda tazele-dene sayacı (sonsuz döngü koruması)
let authRetryCount = 0;

// [[D45]] M4b §13.1 — ses presence aboneliği artık ÇOKLU kanal + REFERANS SAYILI. Eski hâli
// (`activeVoiceChannelId: string | null`) M4a'da doğruydu: ekranda tek bir DM vardı. M4b'nin DM
// listesi aynı anda birden çok grup DM'i izliyor: hepsi mount'ta abone olur ama tek-değerli
// izleyicide her `setActiveVoiceChannel` çağrısı öncekinin üzerine yazardı — reconnect'te yalnız
// SON mount olan kanal yeniden abone olurdu, diğerleri sessizce ölürdü (PLAN.md D45).
//
// Set değil SAYAÇ (`Map<channelId, refCount>`) seçildi: aynı kanalı iki bağımsız tüketici izleyebilir
// (ör. DM listesindeki satır + o an açık olan DM ekranı, bkz. `dm/[id].tsx`). Salt Set'te "çıkar"
// tek bir unmount'ta kanalı tamamen kümeden düşürür — ikinci tüketici hâlâ izlerken kör kalırdı
// (§13.1'in yasakladığı tam olarak bu durum). Sayaç sıfıra İNENE kadar sunucuya `voice:unsubscribe`
// gitmez; ilk abonede (`0 → 1`) `voice:subscribe` gider, tekrarları sunucuya ulaşmaz (gereksiz emit
// değil, idempotent oda üyeliği zaten böyle davranırdı ama sayaç bunu açıkça garanti eder).
const voiceChannelRefCounts = new Map<string, number>();

/** Mesaj ekranı mount/unmount'ta çağırır — reconnect'te hangi kanalın yeniden çekileceğini bildirir. */
export function setActiveChannel(channelId: string | null, refetch?: () => void): void {
  activeChannelId = channelId;
  onReconnectRefetch = refetch ?? null;
  // Kanal açılınca o kanalın tepside bekleyen mesaj bildirimleri düşer (DM ekranının odak davranışı).
  if (channelId) void clearChannelNotifications(channelId);
}

/** Push handler'ı için: kullanıcı şu an hangi ortam kanalını okuyor (yoksa null). */
export function getActiveChannelId(): string | null {
  return activeChannelId;
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

  socket = io(SOCKET_ORIGIN, {
    autoConnect: false,
    // auth fonksiyon formu — bkz. dosya başı yorumu.
    auth: (cb: (data: { token: string }) => void) => cb({ token: getAccessToken() ?? '' }),
    transports: ['websocket'],
    // `path` bilinçli olarak VERİLMEDİ — varsayılan `/socket.io` kalır (Caddy prod'da bu yolu API
    // konteynerine yönlendiriyor). `SOCKET_ORIGIN`'in artık yol içermemesi bunu namespace'le
    // KARIŞTIRMAZ: `path` ayrı bir seçenek, `io(url)`'daki url'nin yol kısmı ise namespace'tir.
  });

  socket.on('connect', () => {
    authRetryCount = 0;
    if (activeChannelId) {
      joinRoom(activeChannelId);
      // contract §4.3 — "sadece yeni gelenleri dinle" yetmez; arada kaçan mesajlar yeniden çekilir.
      onReconnectRefetch?.();
    }
    // M4a-1 §3.1 / [[D45]] M4b §13.1 — reconnect sonrası ses presence aboneliği yeniden kurulur.
    // Sayaçtaki HER kanal (tekli DM ekranı da, DM listesindeki çok sayıda grup satırı da) yeniden
    // abone olur — eskiden yalnız son mount olan tek kanal yeniden abone oluyordu.
    for (const channelId of voiceChannelRefCounts.keys()) {
      socket?.emit('voice:subscribe', { channelId });
    }
  });

  // 🔴 Sessiz başarısızlık yasak (PM bulgusu 2026-08-10) — bu olay eskiden yalnız `err.message`
  // basıyordu, adres basmıyordu. Bu turun kök nedeni ("adres yanlış namespace'e gidiyor") tam olarak
  // bu yüzden gözden kaçtı: mesaj gönderme HTTP üzerinden çalıştığı için ekranda hiçbir şey bozuk
  // görünmüyordu, tek iz bu konsol satırıydı ve neye bağlanmaya çalıştığını söylemiyordu. Artık
  // denenen origin de yazılır ki bir sonraki "her şey API'de çalışıyor ama soket sessiz" turu
  // dakikalar içinde teşhis edilsin.
  socket.on('connect_error', (err: Error) => {
    if (__DEV__) console.warn(`[WS] connect_error origin=${SOCKET_ORIGIN}:`, err.message);
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

  bindE2eeSocket(socket); // E1: e2ee:welcome / e2ee:commit / e2ee:devices-changed

  socket.on('message.created', (message: MessageDto) => {
    // E1: şifreli mesaj önce çözülür (motor işleri art arda yürütür, sıra korunur), şifresiz anında.
    if (message.encrypted) {
      void hydrateOne(message).then((m) => m && useMessagesStore.getState().appendMessage(m));
    } else {
      useMessagesStore.getState().appendMessage(message);
    }
    useTypingStore.getState().handleClear(message.channelId, message.author.id);
  });

  socket.on('message.updated', (message: MessageDto) => {
    if (message.encrypted) {
      void hydrateOne(message).then((m) => m && useMessagesStore.getState().updateMessage(m));
    } else {
      useMessagesStore.getState().updateMessage(message);
    }
  });

  socket.on('message.deleted', (data: { messageId: string; channelId: string }) => {
    useMessagesStore.getState().removeMessage(data.channelId, data.messageId);
    void forgetE2eeMessage(data.channelId, data.messageId); // E5a §4.1: yerel düz kayıt da gider
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

  // ---- Kullanıcı durumu (çevrimiçi/boşta/rahatsız etmeyin) ----
  // Sunucu bu iki olayı web için zaten yayınlıyordu ve `user:<id>` odası üzerinden mobile de
  // geliyordu; dinleyen yoktu. Yeni endpoint/olay/şema YOK, yalnız var olanın tüketimi.
  // Görünürlük kararı sunucuda (`PresenceService.canSeePresence`, R7): gelmeyen kişi görülemeyen
  // kişidir, istemci bunu sorgulamaz.
  socket.on(
    'presence:snapshot',
    (payload: {
      states: {
        userId: string;
        status: PresenceStatus;
        gameId?: string;
        gameName?: string;
        gameIconUrl?: string | null;
        gameStartedAt?: string;
        gameStoreUrl?: string | null;
      }[];
    }) => {
      usePresenceStore.getState().applySnapshot(payload.states, useAuthStore.getState().user?.id);
      // C31b: oyun satırı aynı snapshot'ın içinde gelir (görünürlük sunucuda).
      useActivityStore.getState().applySnapshot(payload.states);
    },
  );

  // C31b: "oynuyor" güncellemesi. game=null → oyun yok / ayar kapandı / dnd / çevrimdışı.
  socket.on(
    'activity:update',
    (payload: {
      userId: string;
      game: {
        id: string;
        name: string;
        iconUrl?: string | null;
        startedAt?: string;
        storeUrl?: string | null;
      } | null;
    }) => {
      useActivityStore.getState().applyUpdate(payload.userId, payload.game);
    },
  );

  socket.on('presence:update', (payload: { userId: string; status: PresenceStatus }) => {
    usePresenceStore.getState().applyUpdate(payload.userId, payload.status);
  });

  // Bağlantı koptuğunda harita SIFIRLANIR. Mobilde soket uygulama arka plana düştükçe kopuyor;
  // temizlenmezse kullanıcı uygulamaya döndüğünde saatler önceki "Çevrimiçi" yazısını görür ve
  // taze snapshot gelene kadar bu bir yalandır. Boş göstermek (bilmiyorum demek) yanlış
  // göstermekten iyidir; snapshot yeniden bağlanınca zaten hemen doluyor.
  socket.on('disconnect', () => {
    usePresenceStore.getState().reset();
    useActivityStore.getState().reset();
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

  socket.on('dm.message', (data: { channelId: string; lastMessage: { id?: string; content: string; createdAt: string; encrypted?: boolean; e2ee?: { ciphertext: string; senderDeviceId: string; createdAt: string; frankingTag?: string } }; senderId: string }) => {
    useDmStore.getState().applyActivity(data);
    // E3 Rev.5: şifreli yük varsa ön planda çöz; liste önizlemesi `plainTick` ile depodan okunur.
    void decryptDmLastMessage(data.channelId, data.lastMessage, data.senderId).catch(() => undefined);
  });

  // C46 §4b — DM/grup satırında tepki göstergesi (süzgeç sunucuda)
  socket.on('dm.reaction', (data: { channelId: string; lastReaction: DmLastReactionDto | null }) => {
    useDmStore.getState().applyReaction(data.channelId, data.lastReaction);
  });

  // C20 — başka cihazım okudu / cevapladı (yalnız kendi soketlerime gelir). DM ise rozet düşer ve
  // (uygulama açıkken) o sohbetin çekmecedeki bildirimleri temizlenir (M5e yardımcısı); ortam
  // kanalıysa mevcut `clearChannel` yolu. `channelIds` = "tümünü okundu".
  socket.on('read:self', (data: { channelId?: string; channelIds?: string[]; guildId: string | null }) => {
    if (data.channelIds) {
      useUnreadStore.getState().clearAll();
      return;
    }
    if (!data.channelId) return;
    if (data.guildId) {
      useUnreadStore.getState().clearChannel(data.channelId, data.guildId);
    } else {
      useDmStore.getState().clearUnread(data.channelId);
    }
    void clearChannelNotifications(data.channelId);
  });

  // C9 — bana yeni mesaj isteği geldi. Web'de de sessiz: yalnız rozet tazelenir.
  // C12 §3.3 — karşı taraf DM'i okudu → gönderdiğim mesajların tiki çifte döner.
  // Gizlilik süzgeci SUNUCUDA (`visibleReadAt`, R7): görmeye hakkımız yoksa olay hiç gelmez.
  socket.on('dm:read', (data: { channelId: string; userId: string; readAt: string }) => {
    useDmStore.getState().applyReadReceipt(data);
  });

  // C34 — grup DM'de bir üye okudu: toplu "herkes okudu" zamanı (sunucu bu izleyicinin gözünden hesaplar)
  socket.on(
    'dm:groupRead',
    (data: { channelId: string; receiptsEnabled: boolean; groupAllReadAt: string | null }) => {
      useDmStore.getState().applyGroupReadReceipt(data);
    },
  );

  // C62 — gruptan ayrıldım/çıkarıldım (yalnız benim soketlerime): kanal eski grup olur, açık ekran kilitlenir.
  socket.on('dm.group_departed', (data: { channelId: string; reason: 'LEFT' | 'REMOVED'; leftAt: string }) => {
    useDmStore.getState().applyGroupDeparted(data);
  });

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
  socket.on('notification', (n?: { type?: string; aiVideoId?: string | null }) => {
    // C49 R3: süren yapay zeka video üretimi bitti/başarısız oldu → giriş göstergesi söner.
    if (n?.type === 'AI_VIDEO_READY' || n?.type === 'AI_VIDEO_FAILED') {
      const viewer = useAiVideoViewerStore.getState();
      viewer.setActive(null);
      // C56 §4: üretim sayfası kapalı + uygulama ön planda → uygulama içi toast (hazırsa "İzle" düğmeli,
      // görüntüleyiciyi açar). Ön plan sistem banner'ı `push.ts` handler'ında bastırılır (çift bildirim
      // olmasın); çan kaydı aşağıda yenilenir.
      if (viewer.sheetOpen === 0 && AppState.currentState === 'active') {
        const id = n.aiVideoId;
        if (n.type === 'AI_VIDEO_FAILED') showToast(t('aiVideo.doneToastFailed'));
        else
          showToast(
            t('aiVideo.doneToastReady'),
            id ? { label: t('aiVideo.doneToastWatch'), run: () => viewer.open(id) } : undefined,
          );
      }
    }
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

  // C62 §5 — ortam üyeliği olayları (web useSocket.ts guild.joined / guild.member_left ile parite).
  // Üye listesi store'u mobilde yok (guild-members ekranı odakta tazeler); yalnız benim ayrılışım işlenir.
  socket.on('guild.joined', () => {
    useGuildSyncStore.getState().requestRefresh();
  });
  socket.on('guild.member_left', (data: { guildId: string; userId: string }) => {
    if (data.userId === useAuthStore.getState().user?.id) {
      useGuildSyncStore.getState().markRemoved(data.guildId);
    }
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

  // ---- Sprint M4h — ses kanalı moderasyonu (§3, R16) ----
  // Sunucu (`voice.service.ts` `muteParticipant`/`unmuteParticipant`) yalnız o kanaldaki tüm
  // istemcilere yayar; `channelId` `applyServerMute` içinde bağlı olduğumuz kanalla eşleşmeyen
  // stale/ilgisiz olayları eler (web `useSocket.ts:420-425` pariteti — mantık taşındı, kod
  // kopyalanmadı).
  socket.on('voice.participant_muted', (data: { channelId: string; userId: string }) => {
    useVoiceStore.getState().applyServerMute(data.channelId, data.userId, true);
  });
  socket.on('voice.participant_unmuted', (data: { channelId: string; userId: string }) => {
    useVoiceStore.getState().applyServerMute(data.channelId, data.userId, false);
  });

  // ---- Sprint M4j (D55) — moderatör taşıması ----
  // Sunucu (`voice.service.ts` `moveParticipant`) kullanıcıyı kaynak LiveKit odasından ÖNCEDEN
  // çıkarır ve YALNIZ taşınan kullanıcıya bu olayı gönderir; hedefe katılmak istemcinin işi (web
  // `useSocket.ts:445` pariteti — mantık taşındı, kod kopyalanmadı). Bastırma ("Bağlantı kesildi"
  // gösterilmemesi) + hedefe yeniden katılma `handleMoved`in kendi işi (`movePending` —
  // `emergencyPending` deseni, bkz. `stores/voice.ts`); burası yalnız SONUCU kullanıcıya bildirir
  // (🔴 sessiz başarısızlık yasak — dolu kanal/yaş kapısı/izin gibi bir sebeple hedefe katılım
  // başarısız olursa sunucudan gelen Türkçe mesaj gösterilir).
  socket.on(
    'voice.moved',
    (data: { fromChannelId: string; toChannelId: string; toChannelName?: string | null }) => {
      // `toChannelName` sunucudan gelir (sahip cihaz turu 2026-08-08): mobilde kanal store'u yok,
      // ad olmadan arama ekranı başlıksız kalıyordu. Gelmezse boş geçilir — ekran çökmez.
      void useVoiceStore
        .getState()
        .handleMoved(data.fromChannelId, data.toChannelId, data.toChannelName ?? '')
        .then((res) => {
          if (!res) return; // başka bir aramadaydık — ilgisiz, sessizce geç
          if (!res.ok) {
            Alert.alert(res.message ?? t('mobile.call.unreachable'));
            return;
          }
          Alert.alert(t('voice.movedToast'));
        });
    },
  );

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

  // ---- M4b grup DM sesli — §14.1 (sözleşme §5 GERİ ALINDI) ----
  // 🔴 Grup DM'de artık ÇALIYOR. §5 "kimse çalmaz" diyordu; PM'in gerekçesi ("üç kişilik grupta her
  // katılan üç kez çaldırır") yanlıştı: çaldıran yalnız İLK BAŞLATMA. Sonradan katılan bu olayı
  // ÜRETMEZ, çünkü `stores/voice.ts` grup dalında odada biri varsa (`alreadyOngoing`)
  // `voice:group_call_start` sinyalini hiç göndermiyor — ayrım zaten koddaydı.
  //
  // Sunum 1-1 ile AYNI yol (`presentIncomingCall`): aynı kanal, aynı zil, aynı Reddet/Aramaya Katıl
  // düğmeleri. Ayrımlar `notifications/incomingCall.ts`te (metin + kabul/reddette sinyal yok).
  // `avatarUrl: null` — sunucu bu olayda yalnız `{ id, username }` gönderiyor (bildirim avatarı
  // zaten kullanılmıyor, tip uyumu için).
  socket.on(
    'voice.group_call_started',
    (data: { channelId: string; by: { id: string; username: string } }) => {
      // Zaten o odadaysak çalmayız: sunucu başlatana göndermiyor ama başka bir istemci (web/mobil)
      // ikinci kez sinyal üretirse odadaki kişinin telefonu kendi konuşmasında çalardı.
      if (useVoiceStore.getState().connectedChannelId === data.channelId) return;
      void presentIncomingCall(
        data.channelId,
        { id: data.by.id, username: data.by.username, avatarUrl: null },
        { kind: 'group' },
      );
    },
  );

  // 🔴 M4z sözleşme §F — grup çağrısını BAŞLATAN odadan çıktı: zil, titreşim ve bildirim ANINDA
  // sussun (eskiden 30 sn'lik zaman aşımına kadar ortada olmayan bir çağrı çalıyordu). 1-1'in
  // `voice.call_canceled` dalıyla simetrik: aynı ortak çıkış (`dismissIncomingCall` — kabul/reddet/
  // zaman aşımı/iptal dört yolunun tek temizlik noktası). Zaten ODAYA KATILMIŞ olan etkilenmez:
  // `dismissIncomingCall` yalnız çalma sunumunu kapatır, LiveKit bağlantısına dokunmaz.
  socket.on('voice.group_call_canceled', (data: { channelId: string }) => {
    void dismissIncomingCall(data.channelId);
  });

  return socket;
}

// ---- M4a-1 sesli arama emit'leri (sözleşme §2) ----

/**
 * DM ekranı/satırı mount'ta — o kanalın "kim var" presence'ına abone ol. [[D45]] — referans
 * sayısı 0'dan 1'e çıkarken sunucuya gerçekten `voice:subscribe` gider; ikinci/üçüncü tüketici
 * (aynı kanalı izleyen başka bir satır/ekran) yalnız sayacı artırır, sunucuya tekrar gitmez.
 */
export function voiceSubscribe(channelId: string): void {
  const count = (voiceChannelRefCounts.get(channelId) ?? 0) + 1;
  voiceChannelRefCounts.set(channelId, count);
  if (count === 1) ensureSocket().emit('voice:subscribe', { channelId });
}

/**
 * unmount'ta — referans sayısını azaltır. [[D45]] — yalnız GERÇEKTEN son tüketici çıkınca (`1 → 0`)
 * sunucuya `voice:unsubscribe` gider ve kanal sayaçtan düşer; başka bir tüketici hâlâ izliyorsa
 * (§13.1'in yasakladığı "biri kapanınca diğeri kör kalıyor" durumu) sayaç yalnız azalır, abonelik
 * sürer.
 */
export function voiceUnsubscribe(channelId: string): void {
  const count = voiceChannelRefCounts.get(channelId);
  if (count === undefined) return;
  if (count <= 1) {
    voiceChannelRefCounts.delete(channelId);
    socket?.emit('voice:unsubscribe', { channelId });
  } else {
    voiceChannelRefCounts.set(channelId, count - 1);
  }
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
 * M4b sözleşme §2 — grup DM'in KENDİ sinyali. `callInvite`in ack+timeout desenini birebir izler
 * (aynı 5sn timeout, aynı ack şekli) ama AYRI bir event: `voice:group_call_start`. Sunucu kanal
 * `GROUP_DM` değilse `NOT_GROUP` döner (§0 tuzağı — `callInvite` kullanılsaydı `NOT_DM` dönerdi,
 * ikisi de istemciye açımlanmaz, `stores/voice.ts` nötr mesaj gösterir).
 */
export function groupCallStart(channelId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const s = ensureSocket();
    let settled = false;
    const done = (ack: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(ack);
    };
    const timer = setTimeout(() => done({ ok: false, error: 'TIMEOUT' }), 5000);
    s.emit('voice:group_call_start', { channelId }, (ack: { ok: boolean; error?: string }) => {
      clearTimeout(timer);
      done(ack ?? { ok: false });
    });
  });
}

/**
 * Sprint M5a sözleşme §4 — grup DM'de kişi başı çaldırma. `groupCallStart`in ack+timeout desenini
 * BİREBİR izler (aynı 5sn timeout, aynı ack şekli); tek fark event adı ve ikinci bir gövde alanı
 * (`targetUserId` — hedef tek kişi, `groupCallStart` tüm kanalı çalıyordu). Sunucu ack'i
 * `{ok:false, error:'NOT_GROUP'|'FORBIDDEN'|'RATE_LIMITED'}` ile açımlıyor; istemci bu kodlara göre
 * Türkçe mesaj seçer (`VoiceContextSheet`), `FORBIDDEN`de sebep söylenmez (G3, engel bilgisi sızmaz).
 */
export function groupCallRing(channelId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const s = ensureSocket();
    let settled = false;
    const done = (ack: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(ack);
    };
    const timer = setTimeout(() => done({ ok: false, error: 'TIMEOUT' }), 5000);
    s.emit('voice:group_call_ring', { channelId, targetUserId }, (ack: { ok: boolean; error?: string }) => {
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
 * 🔴 M4z sözleşme §F — grup çağrısının iptali. `callCancel`in grup karşılığı: aynı best-effort
 * desen (ack YOK, `socket?.emit`), yalnız event adı farklı. 1-1'in `voice:call_cancel`i grupta
 * KULLANILAMAZ — sunucuda `otherDmMember` ile tek bir "karşı taraf" bulup rastgele bir üyeye
 * giderdi (M4b'de grup dalının boş kalma sebebi). Sunucu tarafı `voice:group_call_start` ile
 * AYNI kapılardan geçirir (`requireChannelAccess` + `requireNoDmBlock`).
 */
export function groupCallCancel(channelId: string): void {
  socket?.emit('voice:group_call_cancel', { channelId });
}

/**
 * M4a-2 sözleşme §8.2 — bildirimden "Aramaya Katıl"/"Reddet".
 *
 * 🔴 `socket?.emit` DEĞİL `ensureSocket()` (sahip bulgusu 2026-08-06: mobil kabul edip odaya
 * giriyor ama web hâlâ çalıyor). Kabul, bildirim eyleminden geliyor; o an uygulama arka planda
 * olabilir (kilit ekranı / bildirim perdesi) ve `useBackgroundSocket` soketi **kapatmış** olur.
 * `ensureSocket()` örneği garanti eder + kapalıysa yeniden bağlar; socket.io kapalıyken emit'i
 * tamponlar ve bağlanınca akıtır, yani paket kaybolmaz.
 *
 * Ack ile gönderiliyor (sunucu `{ok:true}` dönüyor): sessiz başarısızlık yerine görünür kayıt.
 * Ack gelmezse dev derlemesinde konsola düşer — teşhis "tahmin" değil "ölçüm" olsun diye.
 */
function emitCallSignal(event: 'voice:call_accept' | 'voice:call_reject', channelId: string): void {
  const s = ensureSocket();
  if (!s.connected) s.connect();
  s.emit(event, { channelId }, () => {});
}

/** C53: soket şu an bağlı mı? (Bağlı değilken arama reddi HTTP ucuna düşer.) */
export function isSocketConnected(): boolean {
  return socket?.connected === true;
}

export function callAccept(channelId: string): void {
  emitCallSignal('voice:call_accept', channelId);
}
export function callReject(channelId: string): void {
  emitCallSignal('voice:call_reject', channelId);
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
  // [[D45]] — yeni oturumda eski sayaçlarla başlamasın (logout sırasında ekranlar zaten unmount
  // olur ve kendi unsubscribe'larını çağırır, ama bu kesin bir güvence değil — örn. React ağacı
  // temizlenmeden logout tetiklenirse sayaç sıfırlanmadan kalabilirdi).
  voiceChannelRefCounts.clear();
  // Oturum düşünce durum haritası da gider. `disconnect` dinleyicisi bunu zaten yapardı ama
  // `removeAllListeners()` yukarıda onu çoktan kaldırmış oluyor, o yüzden burada açıkça.
  usePresenceStore.getState().reset();
  useActivityStore.getState().reset();
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
