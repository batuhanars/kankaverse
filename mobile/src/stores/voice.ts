import { PermissionsAndroid, Platform } from 'react-native';
import { create } from 'zustand';
import { Room, RoomEvent, ParticipantEvent, Track, type Participant, type RemoteParticipant } from 'livekit-client';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import { voiceApi } from '@/api/voice';
import { callInvite, callCancel, groupCallStart } from '@/realtime/socket';
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
  /**
   * 🔴 Ayrılış BAŞLADI (henüz durum temizlenmedi). Arama ekranı bunu izleyip **durum boşalmadan
   * önce** gezinme yığınından çıkıyor. Neden: `leave()` sonunda `roomParticipants`/`canPublish`
   * sıfırlanınca ekran yeniden çiziliyor (kutucuklar gidiyor, "tek başınasın" metni geliyor) — ve bu
   * yeniden çizim, tam ekran modal kapanma animasyonundayken native ağaca yeni görünüm eklemeye
   * çalışıyordu: `addViewAt: The specified child already has a parent` → beyaz ekran
   * (sahip cihaz turu 2026-08-06, ikinci tur).
   */
  isLeaving: boolean;
  /** Bu oturumda BİZ mi çağırdık (§4 "Çalıyor…" göstergesi) — katılınca (mevcut odaya) false kalır. */
  didInvite: boolean;
  /**
   * 🔴 M4c sahip bulgusu (2026-08-07) — arama TÜRÜ artık route parametresi DEĞİL, burada. `/call`a
   * giren yol birden fazla (`home.tsx` katılım, `dm/[id].tsx` arama, bildirim kabulü,
   * `MiniCallWindow` yeniden açma) ve biri (`MiniCallWindow`) parametre taşımıyordu — ekran DM
   * moduna düşüyordu. Otorite `startOrJoin`in yazdığı bu alan; `/call` ne yoldan açılırsa açılsın
   * aynı gerçeği okur. `callChannelName`/`callGuildName` yalnız `kind==='guild'` iken dolu (DM'de
   * başlık zaten `roomParticipants`/DM store'undan türetiliyor, burada tekrar edilmiyor).
   */
  /**
   * 🔴 M4b sözleşme §2 — üçüncü dal `'group'` (grup DM). `callChannelName` guild'deki gibi grup
   * DM'de de dolu (grubun adı — `dm/[id].tsx`'in başlıktaki `title`'ı, `startOrJoin`e `label` olarak
   * geliyor); `callGuildName` grup DM'de her zaman null kalır (guild'e özgü ikinci satır, grubun
   * ortam-adı eşdeğeri yok). `call.tsx` grid düzenini `callKind !== 'dm'` ile seçer (guild VE group).
   */
  callKind: 'dm' | 'group' | 'guild';
  callChannelName: string | null;
  callGuildName: string | null;
  /**
   * 🔴 M4c sahip bulgusu — katılma başarılı olduktan sonra `router.push('/call')` çalışana kadar
   * birkaç render'lık bir pencere var; bu sırada `connectedChannelId` zaten dolu ama rota hâlâ
   * `/call` DEĞİL, yani `MiniCallWindow` bir an görünüp kayboluyordu. Bu bayrak o pencereyi kapatır —
   * `startOrJoin` başlarken true, `/call` mount olunca (`clearPendingCallScreen`) veya güvenlik
   * zaman aşımında false olur.
   */
  pendingCallScreen: boolean;
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
  /** `/call` mount effect'i çağırır — bkz. `pendingCallScreen` yorumu. */
  clearPendingCallScreen: () => void;

  /**
   * §3.1/§3.2 — izin + (gerekirse) davet + token + bağlan. `label` bildirim gövdesi (DM'de karşı
   * ad, guild'de kanal adı — bkz. `kind` altındaki not). `reason: 'mic_denied'` çağıran ekranın
   * "Ayarları Aç" seçeneği sunması için — metin karşılaştırması yerine ayrık bir kod (çeviri
   * değişirse kırılmasın).
   *
   * 🔴 M4a-2 sözleşme §8.2 tuzağı — `options.invite === false` davetin KOŞULSUZ atlanmasını
   * zorlar. Varsayılan (`options` verilmemiş/`invite` belirtilmemiş) davranış DEĞİŞMEDİ: davet
   * kararı `alreadyOngoing`e (presence store'un o an dolu olup olmaması) bakarak verilir — bu DM
   * ekranındaki telefon düğmesi için doğru, çünkü kullanıcı o ekrandayken presence zaten dolu.
   * Ama bildirimden "Aramaya Katıl"a basan kullanıcı büyük ihtimalle DM ekranında DEĞİL (presence
   * hiç abone olunmamış, liste boş) — `alreadyOngoing` yanlışlıkla false çıkar ve bu fonksiyon
   * arayanı GERİ ARAR (karşı taraf zaten bizi aradı, hâlâ odada). `invite: false` bu varsayımı
   * bildirim kabul yolunda tamamen devre dışı bırakır: biz zaten `voice.incoming_call` aldık,
   * karşı tarafın odada olduğunu WS'ten biliyoruz, presence listesine bakmaya gerek yok.
   *
   * 🔴 M4c sözleşme §3 — `kind: 'guild'` (varsayılan `'dm'`, DM çağrı yerleri hiç değişmedi).
   * Guild dalı DAVETSİZDİR: `alreadyOngoing` KOŞULSUZ `true` zorlanır — bu tek satır invite
   * bloğunu (`if (!alreadyOngoing) { callInvite... }`) tamamen atlatır, `didInvite`i (`!alreadyOngoing`)
   * kalıcı `false` yapar (→ "Çalıyor…" hiç çıkmaz) VE `leave()`teki `callCancel` dalını (yalnız
   * `didInvite`e bakıyor) devre dışı bırakır — üç ayrı davranışı TEK noktadan, DM yolunun kod
   * yolunu hiç değiştirmeden kapatır. Ayrıca §4 — yalnız-kalma zaman aşımını kapatır (`autoEndWhenAlone`,
   * bkz. modül değişkeni).
   *
   * 🔴 M4b sözleşme §2 — `kind: 'group'` (grup DM). DM dalıyla PAYLAŞTIĞI şey: `alreadyOngoing`
   * hesabı BİREBİR aynı (presence doluysa sinyal atlanır, "tekrar çaldırmak spam olur" kuralının
   * grup karşılığı — web `useCall.ts` `onGroupVoiceClick`/`startGroupCall` pariteti). AYRIŞTIĞI
   * şey: (1) sinyal `voice:call_invite` DEĞİL `voice:group_call_start` (sunucuda grup dışı kanalda
   * `NOT_GROUP` döner — §0 tuzağı), (2) `didInvite` bu dalda KOŞULSUZ `false` (`alreadyOngoing`dan
   * bağımsız — grupta "Çalıyor…" hiç çıkmaz, §5: kimse çalmaz), (3) `startOrJoin` başarısız olup
   * geri sarılırken (`catch` bloğu) `callCancel` GÖNDERİLMEZ — grupta iptal edilecek bir "ring" yok
   * (sunucudaki `otherDmMember` grup kanalında rastgele TEK bir üyeye giderdi, anlamsız hedef).
   * `autoEndWhenAlone` DM ile PAYLAŞIR (`!isGuild`, `kind==='group'` için de `true`) — §3 "yeni
   * koşul ekleme" uyarısının karşılığı, bu satır zaten değişmedi.
   */
  startOrJoin: (
    channelId: string,
    label: string,
    options?: { invite?: boolean; kind?: 'dm' | 'group' | 'guild'; guildName?: string },
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
// §4 🔴 — DM'de yalnız-kalma zaman aşımı açık, guild'de KAPALI (web `stores/voice.ts:231`
// `autoEndWhenAlone` pariteti: web'de varsayılan false, DM çağrısı açıkça true yapıyor; burada
// eşdeğeri `startOrJoin`de `!isGuild` olarak hesaplanıyor — bkz. o fonksiyondaki yorum). Guild
// kanalında ilk giren arkadaşlarını bekler; 3dk sonra sessizce atılmak "bağlantı düşüyor" sanısı
// yaratırdı (sözleşme §4). Modül değişkeni: `scheduleAloneCheckIfNeeded` + zamanlayıcı callback'i
// ikisi de okur.
let autoEndWhenAlone = true;
let aloneTimer: ReturnType<typeof setTimeout> | null = null;
// §7 (MiniCallWindow flaşı) — güvenlik zaman aşımı: `/call` her zaman mount olup
// `clearPendingCallScreen`ı çağırıyor, ama bir çağıran ekran ileride `startOrJoin` başarılı
// olduktan sonra navigasyon yapmazsa bayrak SONSUZA KADAR takılı kalıp mini pencereyi kalıcı
// gizlerdi — bu, düzelttiğimiz flaştan daha kötü bir kusur olurdu. İdempotent: `/call` zaten
// temizlediyse burası no-op.
const PENDING_CALL_SCREEN_TIMEOUT_MS = 4000;
let pendingCallScreenTimer: ReturnType<typeof setTimeout> | null = null;
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
  isLeaving: false,
  didInvite: false,
  callKind: 'dm',
  callChannelName: null,
  callGuildName: null,
  pendingCallScreen: false,
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
  clearPendingCallScreen() {
    if (pendingCallScreenTimer) {
      clearTimeout(pendingCallScreenTimer);
      pendingCallScreenTimer = null;
    }
    set({ pendingCallScreen: false });
  },

  async startOrJoin(channelId, label, options) {
    if (get().connectedChannelId === channelId) return { ok: true };
    if (room) await get().leave(true);

    const granted = await requestMicPermission();
    if (!granted) {
      // §3.2 🔴 — reddedilirse arama ekranı AÇILMAZ; çağıran ekran bu mesajı gösterip
      // "Ayarları aç" seçeneği sunar (Linking.openSettings — ekranın kendi işi).
      return { ok: false, message: t('mobile.call.micPermissionDenied'), reason: 'mic_denied' };
    }

    const isGuild = options?.kind === 'guild';
    // 🔴 M4b sözleşme §2 — üçüncü dal. DM/guild kod yolları bu satırın eklenmesiyle DEĞİŞMEDİ
    // (`isGuild` hâlâ yalnız `kind==='guild'`e bakıyor); `isGroup` tamamen AYRI bir bayrak.
    const isGroup = options?.kind === 'group';
    // §4 — bkz. modül değişkeni yorumu. Her oturumun başında YENİDEN hesaplanır (bir önceki
    // oturumdan kalma değer bir sonrakini kirletemez). `isGuild` guild'de false, group'ta da
    // false → §3 "yeni koşul eklemeden" grup için de `true` çıkar (sözleşme §3'ün doğruladığı hesap).
    autoEndWhenAlone = !isGuild;

    // Guild dalında `alreadyOngoing` KOŞULSUZ true — bkz. arayüzdeki §3 yorumu (invite bloğunu
    // atlatır + didInvite'ı kalıcı false yapar). DM dalı BİREBİR eskisi gibi: `invite: false`
    // (bildirimden "Aramaya Katıl") → presence listesine BAKILMAZ, davet asla gönderilmez.
    // Grup dalı BU HESABI DM İLE PAYLAŞIR (§2 tablosu — web `hasOngoingCall`/`onGroupVoiceClick`
    // pariteti): presence doluysa sinyal atlanır, doğrudan katılınır.
    const alreadyOngoing = isGuild
      ? true
      : options?.invite === false
        ? true
        : useVoicePresenceStore.getState().for(channelId).length > 0;
    currentPeerLabel = label;
    // §7 — bkz. arayüz yorumu: mini pencerenin flaşını önlemek için `connecting:true`yla AYNI
    // set()'te açılır (mümkün olduğunca erken); güvenlik zaman aşımı yeniden kurulur (bir önceki
    // aramadan kalan zamanlayıcı varsa önce temizlenir — iç içe zamanlayıcı bırakmaz).
    if (pendingCallScreenTimer) clearTimeout(pendingCallScreenTimer);
    pendingCallScreenTimer = setTimeout(() => {
      pendingCallScreenTimer = null;
      set({ pendingCallScreen: false });
    }, PENDING_CALL_SCREEN_TIMEOUT_MS);
    set({
      connecting: true,
      disconnectReason: null,
      // 🔴 §5 — grupta KOŞULSUZ false (`alreadyOngoing`dan bağımsız): "Çalıyor…" göstergesi grup
      // DM'de hiç çıkmaz, kimse çalmadığı için gösterilecek bir şey yok.
      didInvite: isGroup ? false : !alreadyOngoing,
      pendingCallScreen: true,
      callKind: isGuild ? 'guild' : isGroup ? 'group' : 'dm',
      // Grup DM'de de dolu (grubun adı) — call.tsx başlığı guild'deki gibi buradan okur (§4 yorumu).
      callChannelName: isGuild || isGroup ? label : null,
      callGuildName: isGuild ? (options?.guildName ?? null) : null,
    });

    // §3.1 🔴 — sıra önemli: davet/bildirim ÖNCE (kimse yoksa). Ack `ok:false` ise odaya HİÇ
    // girilmez. Grup dalı `voice:group_call_start` gönderir (DEĞİL `voice:call_invite` — §0
    // tuzağı: guild dışı bir DM kanalında `call_invite` sunucudan `NOT_DM` alır, grup kanalında da
    // aynı şekilde `NOT_DM` dönerdi çünkü kanal tipi `GROUP_DM`). Ack başarısızlığı (`NOT_GROUP`/
    // `FORBIDDEN`) kullanıcıya AÇIMLANMAZ — DM'le AYNI nötr metin (§2: "ayrım kullanıcıya açımlanmaz").
    if (!alreadyOngoing) {
      const ack = isGroup ? await groupCallStart(channelId) : await callInvite(channelId);
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
          label,
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
      // §8 istisnası — davet gönderildiyse geri al. Grup dalında ATLANIR: `voice:call_cancel`
      // sunucuda `otherDmMember` ile TEK bir "karşı taraf" arar (`findMany` + `find`), grup
      // kanalında rastgele bir üyeye giderdi — grupta iptal edilecek bir "ring" zaten yok (§5,
      // kimse çalmıyor), gönderecek bir şey olmadığı için bilerek sessiz kalınır.
      if (!alreadyOngoing && !isGroup) callCancel(channelId);
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
    // Ekran bunu görünce YIĞINDAN ÇIKAR (bkz. `isLeaving` açıklaması). Bilerek en başta ve
    // `await`lerden ÖNCE: aşağıdaki temizlik durumu boşaltmadan önce ekranın gitmiş olması gerekiyor.
    set({ isLeaving: true });
    const channelId = get().connectedChannelId;
    const wasAlone = get().roomParticipants.length <= 1;
    clearAloneTimer();
    if (pendingCallScreenTimer) {
      clearTimeout(pendingCallScreenTimer);
      pendingCallScreenTimer = null;
    }
    peerEverJoined = false;
    autoEndWhenAlone = true; // §4 — kozmetik sıfırlama, bir sonraki `startOrJoin` zaten üzerine yazar
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
      isLeaving: false,
      didInvite: false,
      // §7 — bir sonraki aramanın türünü bu oturumdan kalma değer belirlemesin (bugün
      // `autoEndWhenAlone`da aynı sınıfa dikkat edildi — burada aynı ders).
      callKind: 'dm',
      callChannelName: null,
      callGuildName: null,
      pendingCallScreen: false,
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

/**
 * §3.3/§4 — tek başına kalınca eşik (3dk hiç katılmadıysa · 60sn katılıp çıktıysa). `autoEndWhenAlone`
 * false ise (guild kanalı) bu fonksiyon HİÇ zamanlayıcı kurmaz — kanalın ilk üyesi arkadaşlarını
 * beklerken sessizce atılmaz (web `voice.ts` `watch(...roomParticipants.value.length...)` pariteti).
 */
function scheduleAloneCheckIfNeeded(get: () => VoiceState) {
  clearAloneTimer();
  if (!autoEndWhenAlone) return;
  if (get().roomParticipants.length !== 1) return;
  const timeout = peerEverJoined ? ALONE_TIMEOUT_LEFT_MS : ALONE_TIMEOUT_NEVER_JOINED_MS;
  aloneTimer = setTimeout(() => {
    if (autoEndWhenAlone && get().roomParticipants.length === 1) void get().leave(false);
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
