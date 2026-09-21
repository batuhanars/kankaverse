import { AppState, PermissionsAndroid, Platform, type AppStateStatus } from 'react-native';
import { create } from 'zustand';
import {
  Room,
  RoomEvent,
  ParticipantEvent,
  Track,
  LocalVideoTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type LocalTrackPublication,
  type RemoteTrackPublication,
} from 'livekit-client';
// M4f §3.2 🔴 — `TrackSource` (protobuf numeric enum) `livekit-client`in KENDİ bağımlılığı, yeni bir
// paket EKLENMEDİ. `ParticipantPermission.canPublishSources`in tip kaynağı burası (`livekit-client`
// bu tipi kendisi re-export etmiyor); yalnız CAMERA karşılaştırması için kullanılıyor.
import { TrackSource } from '@livekit/protocol';
import { AudioSession, AndroidAudioTypePresets } from '@livekit/react-native';
import { voiceApi } from '@/api/voice';
import { callInvite, callCancel, callAccept, groupCallStart, groupCallCancel } from '@/realtime/socket';
import { useVoicePresenceStore } from '@/stores/voicePresence';
import { extractErrorMessage, extractErrorCode } from '@/api/errors';
import {
  startCallForegroundService,
  updateCallForegroundService,
  stopCallForegroundService,
  addCallForegroundActionListener,
} from '@modules/call-foreground-service';
// M4p sözleşme §2/§4 — `setPipCallActive` yalnız `MainActivity.onUserLeaveHint`in PiP'e girmeyi
// DENEMESİ için bir bayrak (arama yokken davranış değişmez); `isPipCurrentlyActive` SENKRON native
// okuma, yalnız `handleAppStateChange`'in 'background' dalında kullanılır (bkz. o fonksiyondaki yorum).
import { setPipCallActive, isPipCurrentlyActive } from '@modules/picture-in-picture';
import { t } from '@/i18n';

/**
 * M4a-1 sözleşme §3 — LiveKit ses store'u: yalnız YEREL BAĞLANTI (`Room` yaşam döngüsü, mikrofon,
 * konuşan/susturulmuş göstergesi, tek-başına-kalma zaman aşımı). "Kim var" presence şeridi ayrı bir
 * store'da (`stores/voicePresence.ts` — DM ekranı bağlı olmasak da onu okur, web'deki iki katman
 * ayrımının burada iki dosyaya bölünmüş hâli). Web `stores/voice.ts` davranış referansı ama
 * KOPYALANMADI: deafen/cihaz-seçim state'i hâlâ yok (kapsam dışı). 🔴 M4d ile 1-1 DM kamerası
 * eklendi (`canPublishCamera`/`isCameraOn`/`cameraFacing` + yerel/uzak publication); M4e ile grup
 * DM'e çoğullaştı (`remoteCameraPublications` userId-anahtarlı map, `toggleCamera` kapısı grup DM'i
 * de kapsıyor). M5b ile UZAK ekran paylaşımı İZLEME eklendi (`remoteScreenPublications` — kameradan
 * AYRI userId-anahtarlı map); telefondan ekran YAYINLAMA hâlâ YOK (kapsam dışı, bkz. sözleşme §1).
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
  /**
   * Uygulama İÇİNDE gösterilecek gelen arama (kabul/reddet şeridi). Yalnız bildirim izni KAPALIYKEN
   * dolar: izin varsa sunum sistem bildirimidir ve iki yüzey birden gösterilmez. Tek sahibi
   * `notifications/incomingCall.ts` (`presentIncomingCall`/`dismissIncomingCall`) — oradaki modül
   * durumunun reaktif aynası, ikinci bir doğruluk kaynağı değil.
   */
  incomingCall: { channelId: string; callerName: string; avatarUrl: string | null; isGroup: boolean } | null;
  setIncomingCall: (next: VoiceState['incomingCall']) => void;
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
  /**
   * Bu oturumda BİZ mi çağırdık — katılınca (mevcut odaya) false kalır.
   *
   * 🔴 M4z §F — anlamı GERİ KAZANILDI: "başlatan benim" bilgisi. M4b'de grup dalında KOŞULSUZ
   * `false` yapılmıştı; amaç yalnız "Çalıyor…" göstergesini grupta gizlemekti, ama bu bayrak aynı
   * zamanda `leave()`teki iptal dalını besliyor — grupta iptal gönderilemiyordu (arayan çıkınca
   * karşı taraflarda zil 30 sn çalmaya devam ediyordu). Artık grupta da `!alreadyOngoing`;
   * GÖSTERİM tarafı `callKind === 'dm'` ile kapılanıyor (call.tsx), bayrağın kendisi değil.
   * Guild dalında hâlâ kalıcı `false` (`alreadyOngoing` koşulsuz true — §3 yorumu).
   */
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
   * Sprint M4h §1/§2 — ortamın id'si (`callGuildName` ADIYLA AYNI YERDE dolu — yalnız `kind==='guild'`).
   * `callGuildName` yalnız GÖSTERİM içindi (ikinci satır metni); moderasyon sheet'inin
   * `useGuildPermission(guildId, ...)` + `channelsApi.listByGuild(guildId)` çağırabilmesi için id
   * lazımdı, o yüzden ayrı bir alan (adı basmak ile yetkiyi sorgulamak farklı ihtiyaçlar). DM/grup
   * DM'de `callGuildName` gibi her zaman `null` — moderasyon o dallarda hiç yok.
   */
  guildId: string | null;
  /**
   * Sprint M4t §2 🔴 — C7 §E2 kamera uyarısının kapı koşulu: yalnız `kind==='guild'` VE kanal
   * `ageGated` değil VE ortam `adultsOnly` değil (web `useVoiceNudge.ts` `isGeneralVoiceChannel`
   * pariteti). DM/grup DM'de çağıran taraf bu alanı hiç geçmez → `false` kalır (nudge o dallarda
   * hiç sorulmaz). Hesap burada YAPILMAZ — çağıran ekran (`home.tsx` `joinVoiceChannel`, elinde
   * `ChannelSummaryDto.ageGated` + `GuildSummaryDto.adultsOnly` olan tek yer) hesaplayıp `startOrJoin`
   * options'ına geçirir; bu store yalnız SONUCU taşır (`call.tsx`in nudge kapısını okuduğu tek yer).
   */
  isGeneralVoiceChannel: boolean;
  /**
   * Sprint M4t §3 🔴 — A4 acil akışı. `EmergencyButton.handleConfirm` istek gitmeden HEMEN ÖNCE
   * `true` yapar (yarış durumu yok: sunucu kicki bu isteğin işlenişinin bir parçası, yani ancak
   * istek gönderildikten SONRA gerçekleşebilir). İki yeri bastırır:
   *  (1) `wireRoom`daki `RoomEvent.Disconnected` — sunucu kicki bir hata DEĞİL, "Bağlantı kesildi."
   *      yazılmaz.
   *  (2) `call.tsx`teki otomatik `router.back()` — bu bayrak true iken ERTELENİR, ekran mount'lu
   *      kalır ki `EmergencyButton`in geri bildirim modalı unmount olmadan gösterilebilsin.
   * `EmergencyButton.closeFeedback` kullanıcı feedback'i kapatınca `endEmergency()` ile false'a
   * döner — o an ertelenmiş navigasyon devam eder. 🔴 `leave()`in oturum-sonu `set({...})`
   * bloğunda BİLEREK sıfırlanmaz: leave() emergency akışının KENDİSİ tarafından (sunucu kicki →
   * `Disconnected` → `leave(false)`) tetiklenir; orada sıfırlansa navigasyon erteleme daha
   * feedback modalı görünmeden biterdi.
   */
  emergencyPending: boolean;
  /**
   * Sprint M4j (D55) 🔴 — moderatör başka ses kanalına taşıdığında (`voice.moved`, `realtime/socket.ts`
   * dinler) sunucu bizi kaynak LiveKit odasından ÖNCEDEN çıkarıyor (`voice.service.ts`
   * `moveParticipant`); bu bir hata değil, taşımanın parçası. `emergencyPending` ile BİREBİR AYNI
   * iki-nokta bastırma deseni (kontrat notu: "aynısını kur, yeni mekanizma icat etme"):
   *  (1) `wireRoom`daki `RoomEvent.Disconnected` — bu bayrak true iken "Bağlantı kesildi." YAZILMAZ.
   *  (2) `call.tsx`teki otomatik `router.back()` — bu bayrak true iken ERTELENİR, ekran hedef
   *      kanalda kalır (kutucuklar sökülüp yeniden mount olmaz — §1 "ekran hedef kanalda kalır").
   * `handleMoved` başında `true`, hedefe katılma denemesi bitince (başarı/başarısızlık fark etmez)
   * `false` olur — `emergencyPending`in `endEmergency()`i gibi ayrı bir kapatma eylemi YOK, çünkü
   * kapanışı bekleyen bir kullanıcı geri bildirimi (EmergencyButton'daki modal) burada yok.
   */
  movePending: boolean;
  /**
   * 🔴 M4c sahip bulgusu — katılma başarılı olduktan sonra `router.push('/call')` çalışana kadar
   * birkaç render'lık bir pencere var; bu sırada `connectedChannelId` zaten dolu ama rota hâlâ
   * `/call` DEĞİL, yani `MiniCallWindow` bir an görünüp kayboluyordu. Bu bayrak o pencereyi kapatır —
   * `startOrJoin` başlarken true, `/call` mount olunca (`clearPendingCallScreen`) veya güvenlik
   * zaman aşımında false olur.
   */
  pendingCallScreen: boolean;
  isMuted: boolean;
  /**
   * Sprint M5a §3 — sağırlaştır (mobilde ilk kez). Web `stores/voice.ts` `isDeafened` pariteti:
   * tüm UZAK ses track'leri kapalı + mikrofon susturulmuş. `preferMuted`in web'deki kalıcı tercih
   * karşılığı (`preferDeafened`) BİLİNÇLİ OLARAK yok — sözleşme §3 "kapsam dışı" diyor, mobilde
   * kalıcı tercih hiç yazılmaz, her oturum `false` başlar.
   */
  isDeafened: boolean;
  canPublish: boolean;
  /**
   * M4d §2/§7 — sunucunun DM'de video izni kararı (`resolveVideoSources`, R7 kapısı: iki taraf da
   * yetişkinse video, biri minörse yok). `false` iken kamera yüzeyi HİÇ ÇİZİLMEZ — "görünür-kilitli
   * yap" genel ilkesinin bilinçli istisnası (brief §5/G1: minör statüsü UI'da asla gösterilmez).
   */
  canPublishCamera: boolean;
  /**
   * M4d §2 🔴 — yalnız GERÇEK publication geldiğinde `true` olur (null-publication tuzağı: sunucu
   * grant vermediğinde SDK sessizce publication döndürmeyebilir). `cameraIntent` (modül değişkeni,
   * §6) ile KARIŞTIRILMAZ: bu, "şu an gerçekten yayında mıyız" — o, "kullanıcı açık bırakmıştı mı".
   */
  isCameraOn: boolean;
  /** §3/§4 — yerel önizleme yalnız ön kamerada (`user`) aynalanır; çevrilince aynalama kalkar. */
  cameraFacing: 'user' | 'environment';
  /** §3 — `ParticipantTile`in `VideoTrack` için okuduğu yerel kamera publication'ı. */
  localCameraPublication: LocalTrackPublication | null;
  /**
   * M4e §2 🔴 — uzak kamera artık userId (LiveKit `identity`) anahtarlı ÇOĞUL yapı (eskiden tek
   * slot `remoteCameraPublication`; grupta ikinci kişi kamerasını açınca birincininkini eziyordu).
   * **Tek kaynak**: 1-1 DM dalı da (`call.tsx`) bu map'ten karşı tarafın kaydını okur, paralel bir
   * tek-slot state AYRICA TUTULMAZ (D37/M3c dersi — gereksiz state = senkron kalma riski).
   */
  remoteCameraPublications: Record<string, RemoteTrackPublication>;
  /**
   * Sprint M5b §2 🔴 — uzak EKRAN paylaşımı, `remoteCameraPublications` ile AYNI şekil (userId
   * anahtarlı) ama KASITLI OLARAK AYRI bir map. Aynı kullanıcı hem kamerasını hem ekranını açabilir
   * (LiveKit'te iki farklı `Track.Source`); tek map kullansaydık biri diğerini ezerdi. Mobil
   * telefondan ekran YAYINLAMAZ (kapsam dışı, sözleşme §1) — bu map yalnız UZAK katılımcılar için
   * dolar, yerel bir karşılığı yok (`localCameraPublication` gibi bir `localScreenPublication` YOK).
   */
  remoteScreenPublications: Record<string, RemoteTrackPublication>;
  /**
   * §2 — DM başlığındaki "görüntülü ara" niyeti: `startOrJoin` bağlantı kurulduktan hemen sonra
   * yazar, `/call` mount effect'i tüketip temizler (`pendingCallScreen` ile aynı temizlenme
   * disiplini — bkz. o alanın yorumu). Gerçek kamera açma işini burada YAPMAZ: çalışma-anı izni
   * gerektiği için `toggleCamera`in AYNISI çağrılır, "Ayarları Aç" reddi de oradan gelir.
   */
  pendingCameraStart: boolean;
  roomParticipants: RoomMember[];
  speakingUserIds: Set<string>;
  mutedUserIds: Set<string>;
  /**
   * Sprint M4h §3 🔴 (kontrat `SPRINT_M4H_MOBILE_VOICE_MODERATION_CONTRACT.md`, R16) — KALICI
   * (server) susturma listesi. `mutedUserIds`in TAMAMEN AYRI bir kavram: o LiveKit track-mute'unu
   * (kendi kapatması + sunucu zorlaması ikisini birden) yansıtan bir "mikrofon simgesi" durumu;
   * `serverMutedUserIds` yalnız moderatörün `voiceApi.mute`/`unmute` ile yazdığı KALICI bayrak — bir
   * katılımcı kendi mikrofonunu kapatınca bu Set DEĞİŞMEZ. Moderasyon sheet'inin "Sustur"/
   * "Susturmayı Kaldır" etiketinin TEK okuma kaynağı budur.
   *
   * 🔴 D53 tuzağı (web'de bugün yaşandı, kontrat §3) — etiket doğru göründüğü hâlde eylem yanlış
   * uca gidebiliyordu çünkü durum menü KAPATILDIKTAN SONRA okunuyordu. Kural: bu Set'ten okuma
   * eylem tetiklenmeden ÖNCE (sheet'in `onPress` closure'ı render anındaki değeri yakalar), sheet
   * kapanışı okumayı ETKİLEMEZ — bkz. `components/call/ParticipantModerationHost.tsx`.
   *
   * Kaynak: `startOrJoin` bağlandıktan sonra `voiceApi.getParticipants` ile HİDRATE eder (yalnız
   * guild dalı — DM/GROUP_DM sunucuda her zaman `[]` döner); canlı güncelleme WS
   * `voice.participant_muted`/`unmuted` ile (`realtime/socket.ts` → `applyServerMute`).
   */
  serverMutedUserIds: Set<string>;
  /** Beklenmedik/bilgilendirilmesi gereken ayrılış nedeni (Türkçe) — çağıran ekran Alert ile gösterir,
   *  sonra temizler. Kullanıcı kendi "kapat"a bastıysa null kalır (alert gösterilmez). */
  disconnectReason: string | null;
  /**
   * M4f §3.3 🔴 — sunucu kaynaklı kamera kesilmesi bildirimi (R11 yayın-durdur / izin düşüşü).
   * `disconnectReason` ile AYNI desen (ekran Alert gösterip temizler) ama AYRI alan: arama
   * BİTMİYOR, yalnız kamera düşüyor — `disconnectReason`ın "ekranı kapat" akışına karışmaması
   * gerekiyor. Metin GEREKÇE söylemez ("moderatör" demez) — o bilgi istemcide yok, tahmin edilmez.
   */
  cameraStoppedNotice: string | null;
  /** §5 — son BİLİNEN çıkış seçimi (SDK "şu an hangisi aktif" sorgusu vermiyor, yalnız kendi
   *  seçimlerimizi takip ediyoruz — bkz. `OutputPickerSheet`in rapordaki bilinen sınırı). */
  outputId: AudioOutputId | null;

  isConnectedTo: (channelId: string) => boolean;
  clearDisconnectReason: () => void;
  /** `cameraStoppedNotice` yorumuna bkz. — çağıran ekran Alert'i gösterdikten sonra çağırır. */
  clearCameraStoppedNotice: () => void;
  setOutputId: (id: AudioOutputId) => void;
  /** `/call` mount effect'i çağırır — bkz. `pendingCallScreen` yorumu. */
  clearPendingCallScreen: () => void;
  /** `EmergencyButton.handleConfirm` çağırır — bkz. `emergencyPending` yorumu. */
  beginEmergency: () => void;
  /** `EmergencyButton.closeFeedback` çağırır — bkz. `emergencyPending` yorumu. */
  endEmergency: () => void;

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
   * `NOT_GROUP` döner — §0 tuzağı), (2) 🔴 M4z §F: `didInvite` artık grupta da `!alreadyOngoing`
   * (eskiden koşulsuz `false`ti; "Çalıyor…" gizleme işi GÖSTERİM tarafına, `call.tsx`teki
   * `callKind === 'dm'` kapısına taşındı), (3) `startOrJoin` başarısız olup geri sarılırken
   * (`catch` bloğu) iptal olarak `callCancel` DEĞİL `groupCallCancel` gönderilir (1-1'in
   * `otherDmMember`i grup kanalında rastgele TEK bir üyeye giderdi — anlamsız hedef).
   * `autoEndWhenAlone` DM ile PAYLAŞIR (`!isGuild`, `kind==='group'` için de `true`) — §3 "yeni
   * koşul ekleme" uyarısının karşılığı, bu satır zaten değişmedi.
   */
  startOrJoin: (
    channelId: string,
    label: string,
    options?: {
      invite?: boolean;
      kind?: 'dm' | 'group' | 'guild';
      guildName?: string;
      /** Sprint M4h §1 — `callGuildName`in id karşılığı, bkz. `guildId` alan yorumu. Yalnız
       *  `kind:'guild'` çağıran taraf (`home.tsx` `joinVoiceChannel`, `handleMoved`) geçer. */
      guildId?: string | null;
      /** M4d §2 — bağlantı kurulduktan sonra kamera otomatik açılsın mı (DM başlığındaki
       *  görüntülü ara düğmesi). Web `pendingCameraStart` pariteti. */
      startWithCamera?: boolean;
      /** Sprint M4t §2 — bkz. `isGeneralVoiceChannel` alan yorumu. Yalnız `kind:'guild'` çağıran
       *  taraf (`home.tsx`) geçer; DM/grup DM hiç geçmez (nudge o dallarda sorulmaz). */
      isGeneralVoiceChannel?: boolean;
    },
  ) => Promise<{ ok: boolean; message?: string; reason?: 'mic_denied' | 'other' }>;
  /** `userInitiated` true ise (kullanıcı "kapat"a bastı) `disconnectReason` set edilmez. */
  leave: (userInitiated?: boolean) => Promise<void>;
  toggleMute: () => Promise<void>;
  /**
   * Sprint M5a §3 — web `stores/voice.ts` `applyDeafen`in taşınmış hâli (mantık taşındı, kod
   * kopyalanmadı — reaktivite modeli farklı). Sağırlaştır → tüm uzak katılımcıların ses hacmi 0'a
   * çekilir (LiveKit `RemoteParticipant.setVolume`, RN köprüsünde `attach`e gerek DUYMAZ — web'in
   * `<audio>` elementi mute'lama yolunun mobil karşılığı yok, SDK bunu `_mediaStreamTrack._setVolume`
   * ile native tarafta yapıyor) VE mikrofon susturulur (önceki durum `muteBeforeDeafen`de saklanır).
   * Kaldırınca mikrofon SAĞIRLAŞTIRMADAN ÖNCEKİ durumuna döner — zaten susturulmuşsa (`muteBeforeDeafen
   * === true`) susturulmuş KALIR, web'deki AYNI kural. `leave()` sıfırlar.
   */
  toggleDeafen: () => Promise<void>;
  /**
   * M4d §2/§4/§6 — kamera aç/kapat. M4e §4 🔴 — kapı artık `callKind==='dm'` **VEYA** `'group'`;
   * guild kapalı kalır (M4d'de bilerek konmuştu, tamamen kaldırılmadı). İzin isteme deseni
   * `requestMicPermission` ile birebir aynı: reddedilirse `reason:'camera_denied'` döner, çağıran
   * ekran mikrofondaki `mic_denied` ile aynı "Ayarları Aç" uyarısını gösterir.
   */
  toggleCamera: () => Promise<{ ok: boolean; message?: string; reason?: 'camera_denied' }>;
  /** §4 — track KAPATILIP AÇILMAZ (karşı tarafta kutucuk yanıp sönerdi); LiveKit'in `restartTrack`
   *  yolu aynı publication'ı yeni `facingMode` ile yeniden başlatır. Yalnız kamera açıkken anlamlı. */
  switchCamera: () => Promise<void>;
  /** `/call` mount effect'i çağırır — bkz. `pendingCameraStart` yorumu. */
  clearPendingCameraStart: () => void;

  handleCallAccepted: (channelId: string) => void;
  handleCallRejected: (channelId: string) => void;
  /**
   * Sprint M4j (D55) 🔴 — `realtime/socket.ts`in `voice.moved` dinleyicisi çağırır. Web
   * `useSocket.ts:445`in mantığı taşındı (kod kopyalanmadı — Vue ≠ RN): kaynaktan ayrıl, hedefe
   * `startOrJoin` ile katıl. `kind:'guild'` sabit (taşıma yalnız ortam ses kanalları için var —
   * DM/grup DM'de moderatör taşıma kavramı yok). `label` boş geçilir (§3 — mobilde kanal store'u
   * yok, adı elde etmenin yolu yeni bir uç/store kurmak olurdu; kontrat bunu yasaklıyor).
   *
   * 🔴 Yarış durumu (bkz. `movePending` alan yorumu) — sunucu LiveKit kickini (`removeParticipant`)
   * bu Socket.IO olayından ÖNCE awaitliyor ama iki sinyal FARKLI taşımalar (LiveKit medya bağlantısı
   * vs. Socket.IO); hangisi istemciye ÖNCE ulaşır garanti değil:
   *  - Yaygın sıra (bu olay önce): hâlâ `fromChannelId`e bağlıyız → kendi `leave(true)`imiz
   *    LiveKit'in (muhtemelen az sonra gelecek) `Disconnected`ını `leaving` bayrağıyla zaten yutar.
   *  - Nadir ters sıra (LiveKit kicki önce ulaşırsa): `Disconnected` bu fonksiyon çalışmadan ateşlenmiş
   *    olabilir — `connectedChannelId` burada zaten boş/`fromChannelId`den farklı bulunur. Bu durumda
   *    `leave()` tekrar ÇAĞRILMAZ (zaten temizlenmiş), ama olası hatalı `disconnectReason` burada
   *    temizlenir ve hedefe katılım YİNE denenir — sessiz bırakma yasak.
   * Bağlı olduğumuz kanal `fromChannelId` DEĞİLSE (başka bir aramadaysak) olay tamamen yok sayılır —
   * stale/ilgisiz bir taşınma bildirimi aktif farklı bir oturumu kesmemeli.
   */
  handleMoved: (
    fromChannelId: string,
    toChannelId: string,
    /** Hedef kanalın adı — sunucudan gelir (`voice.moved` payload'ı). Mobilde kanal store'u yok,
     *  ad buradan gelmezse arama ekranı başlıksız kalıyordu (sahip cihaz turu 2026-08-08). */
    toChannelName?: string,
  ) => Promise<{ ok: boolean; message?: string; reason?: 'mic_denied' | 'other' } | void>;
  /**
   * Sprint M4h §3 — `realtime/socket.ts`in `voice.participant_muted`/`unmuted` dinleyicileri
   * çağırır. `channelId` bağlı olduğumuz kanalla eşleşmiyorsa yok sayılır (stale/ilgisiz bildirim —
   * `handleMoved`teki aynı koruma deseni).
   */
  applyServerMute: (channelId: string, userId: string, muted: boolean) => void;
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
// M4d §6 🔴 — kullanıcı NİYETİ (kamerayı açık bırakmıştı mı), `isCameraOn`dan (şu an gerçekten
// yayında mıyız) BİLEREK AYRI: arka plana alınca `isCameraOn` false olur ama bu true kalır; öne
// dönünce `handleAppStateChange` bunu okuyup kamerayı sessizce geri açar. Yalnız `toggleCamera`
// YAZAR — arka plan/ön plan geçişi yalnız OKUR (kullanıcının "kapattım" iradesiyle "arka planda
// geçici durduruldu" birbirine karışmasın). `leave()` her oturumda sıfırlar.
let cameraIntent = false;
// M5a §3 🔴 — web `stores/voice.ts` `muteBeforeDeafen` pariteti (aynı isim, aynı iş): sağırlaştırma
// ANINDAKİ mikrofon durumunu tutar. `toggleDeafen` yazar; kaldırınca yalnız bu `false` idiyse
// (yani kullanıcı sağırlaşırken zaten susturulmamıştı) mikrofon geri açılır — susturulmuşsa
// susturulmuş kalır (web'deki AYNI kural, `applyDeafen` yorumuna bkz.).
let muteBeforeDeafen = false;
// M4f §3.1 🔴 — "bu unpublish biz mi istedik" bayrağı (`leaving` ile aynı desen). LiveKit'in yerel
// unpublish yolu TEK: kullanıcı düğmeye bastığında (`toggleCamera`) ve arka plana alındığında
// (`handleAppStateChange`) da, sunucu R11 yayın-durdur ile izni düşürdüğünde de aynı
// `RoomEvent.LocalTrackUnpublished` olayı ateşlenir — SDK ikisini AYIRT ETMEZ (bkz. wireRoom
// yorumu). Bu bayrak true iken gelen olay "biz zaten hallettik" sayılır (o yolun kendi state
// güncellemesi var); false iken gelen olay sunucu kaynaklıdır.
let localCameraStopping = false;
// §6 — AppState aboneliği `startOrJoin` içinde kurulur, `leave()`te söker (foreground listener ile
// aynı yaşam döngüsü deseni).
let appStateSub: { remove: () => void } | null = null;
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

// M4d §2 — desen `requestMicPermission` ile birebir aynı (manifest izni zaten
// `@config-plugins/react-native-webrtc` tarafından bildirilmiş, bkz. sözleşme §0).
async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
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
  incomingCall: null,
  setIncomingCall: (next) => set({ incomingCall: next }),
  connecting: false,
  connectedAt: null,
  isLeaving: false,
  didInvite: false,
  callKind: 'dm',
  callChannelName: null,
  callGuildName: null,
  guildId: null,
  isGeneralVoiceChannel: false,
  emergencyPending: false,
  movePending: false,
  pendingCallScreen: false,
  isMuted: false,
  isDeafened: false,
  canPublish: false,
  canPublishCamera: false,
  isCameraOn: false,
  cameraFacing: 'user',
  localCameraPublication: null,
  remoteCameraPublications: {},
  remoteScreenPublications: {},
  pendingCameraStart: false,
  roomParticipants: [],
  speakingUserIds: new Set(),
  mutedUserIds: new Set(),
  serverMutedUserIds: new Set(),
  disconnectReason: null,
  cameraStoppedNotice: null,
  outputId: null,

  isConnectedTo(channelId) {
    return get().connectedChannelId === channelId;
  },
  clearDisconnectReason() {
    set({ disconnectReason: null });
  },
  clearCameraStoppedNotice() {
    set({ cameraStoppedNotice: null });
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
  clearPendingCameraStart() {
    set({ pendingCameraStart: false });
  },
  beginEmergency() {
    set({ emergencyPending: true });
  },
  endEmergency() {
    set({ emergencyPending: false });
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
      // 🔴 M4z §F — grupta da `!alreadyOngoing` ("bu çağrıyı ben başlattım"). Sonradan katılanda
      // `alreadyOngoing` true olduğu için false kalır → iptali yalnız BAŞLATAN gönderir.
      // "Çalıyor…" göstergesinin grupta çıkmaması artık burada değil, `call.tsx`te kapılanıyor.
      // Guild: `alreadyOngoing` koşulsuz true → didInvite kalıcı false (davranış aynen korundu).
      didInvite: !alreadyOngoing,
      pendingCallScreen: true,
      // M4d §7 — kozmetik sıfırlama, bir önceki oturumdan kalma bayrak yeni oturumu kirletemez
      // (`pendingCallScreen` ile aynı ders).
      pendingCameraStart: false,
      callKind: isGuild ? 'guild' : isGroup ? 'group' : 'dm',
      // Grup DM'de de dolu (grubun adı) — call.tsx başlığı guild'deki gibi buradan okur (§4 yorumu).
      callChannelName: isGuild || isGroup ? label : null,
      callGuildName: isGuild ? (options?.guildName ?? null) : null,
      // Sprint M4h §1 — `callGuildName` ile AYNI kapı (yalnız guild dalı), bkz. alan yorumu.
      guildId: isGuild ? (options?.guildId ?? null) : null,
      // Sprint M4t §2 — yalnız guild dalında çağıran tarafın hesabı okunur; DM/grup hiç geçmediği
      // için zaten `undefined` → `false` (nudge o dallarda sorulmaz, sözleşme §2.1).
      isGeneralVoiceChannel: isGuild ? !!options?.isGeneralVoiceChannel : false,
      // Kozmetik sıfırlama — bir önceki oturumdan kalma acil-bayrak yeni oturumu kirletemez
      // (`pendingCameraStart` ile aynı ders). Normal akışta zaten `endEmergency()` ile temiz gelir.
      emergencyPending: false,
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

      // 🔴 Sahip cihaz turu 2026-08-10 — arayanin zili, aranan odaya girdigi halde SUSMUYORDU.
      // Sebep: `voice:call_accept` YALNIZ bildirimin "Kabul" dugmesine bagliydi. Kullanici
      // bildirime dokunup uygulamadan katilinca (ya da DM ekranindaki "Sese katil" ile) sinyal
      // hic gitmiyor, arayan tarafta telefon calmaya devam ediyordu.
      //
      // Kural artik giris yolundan BAGIMSIZ: 1-1 DM aramasina BASLATAN OLMADAN katildiysak
      // (`didInvite === false`), odaya girer girmez kabul sinyali gider. Bildirim dugmesinden
      // gelen yol da ayni sinyali gonderiyor; ikinci kez gitmesi zararsiz (sunucu yalniz karsi
      // tarafa `voice.call_accepted` relay ediyor, o da zili susturuyor — idempotent).
      // Grup ve ortam kanallarinda gonderilmez: orada "kabul" diye bir kavram yok (grup sinyalleri
      // `voice:group_call_*`, ortam kanalinda davet zaten yok).
      // `alreadyOngoing === true` demek: bu aramayi biz baslatmadik, var olana katildik.
      if (!isGuild && !isGroup && alreadyOngoing) {
        callAccept(channelId);
      }

      peerEverJoined = false;
      set({
        connectedChannelId: channelId,
        connectedAt: Date.now(),
        canPublish: data.canPublish,
        canPublishCamera: data.canPublishCamera ?? false,
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

      // Sprint M4h §3 🔴 — server-mute hidrasyonu. Yalnız guild dalı (DM/GROUP_DM sunucuda her
      // zaman `mutedUserIds: []` döner, gereksiz istek atılmaz). Best-effort + geç-gelen yanıtın
      // stale yazmaması için hâlâ AYNI kanaldayız mı kontrolü (`handleMoved`teki desenle aynı ders).
      if (isGuild) {
        void voiceApi
          .getParticipants(channelId)
          .then((res) => {
            if (get().connectedChannelId === channelId) {
              set({ serverMutedUserIds: new Set(res.mutedUserIds) });
            }
          })
          .catch(() => {
            // yoksay — sheet açılana kadar WS güncellemesi/yeniden deneme yok; en kötü ihtimalle
            // etiket bir sonraki `voice.participant_muted/unmuted` olayına kadar "Sustur" gösterir.
          });
      }

      // M4d §2 — DM başlığından "görüntülü ara" ile geldiysek VE sunucu izin verdiyse, niyeti
      // burada YALNIZ İŞARETLE — gerçek açma işi `/call`in mount effect'inde `toggleCamera` ile
      // olur (çalışma-anı izni gerektiği için; `pendingCallScreen` ile aynı yazan-taraf/tüketen-taraf
      // ayrımı). `canPublishCamera` false ise bayrak hiç set edilmez, hiçbir yerde tüketilmez.
      if (options?.startWithCamera && data.canPublishCamera) {
        set({ pendingCameraStart: true });
      }

      // M4d §6 — kamera görünür arayüze bağlı: arka plana alınca yayın durur, öne dönünce `cameraIntent`
      // varsa kendiliğinden geri açılır. Abonelik foreground listener ile AYNI yaşam döngüsünde
      // (kur burada, sök `leave()`te) — bir önceki oturumdan kalan varsa önce kaldırılır.
      appStateSub?.remove();
      appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
        void handleAppStateChange(next, set, get);
      });

      // M4p §2 — `MainActivity.onUserLeaveHint`in PiP'e girmeyi DENEMESİ için bayrak. Foreground
      // service kurulumundan BAĞIMSIZ (o try/catch'in DIŞINDA, kendi başarısız/başarılı olması
      // birbirini etkilemesin) — arama türünden bağımsız her `startOrJoin` (DM/grup/guild, sesli
      // veya görüntülü) PiP'i etkinleştirir (§3: sesli aramada da PiP açılır).
      void setPipCallActive(true);

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
      // §8 istisnası — sinyal gönderildiyse geri al (odaya hiç giremedik, karşı taraf boşuna çalıyor).
      // 🔴 M4z §F: grup dalı artık ATLANMIYOR, kendi iptalini (`voice:group_call_cancel`) gönderiyor.
      // Buradaki gönderim `leave()`teki ile ÇAKIŞMAZ: bu yolda `connectedChannelId` hiç dolmadığı
      // için `leave()`in iptal dalı (kanalı oradan okuyor) zaten sessiz kalır.
      if (!alreadyOngoing) {
        if (isGroup) groupCallCancel(channelId);
        else callCancel(channelId);
      }
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
    // 🔴 PM incelemesi (2026-08-08, M4f) — `room.disconnect()` yerel track'leri de unpublish eder ve
    // bu, kamera açıkken `LocalTrackUnpublished`i ateşler. Bayrak kalkmasaydı o olay SUNUCU KAYNAKLI
    // sayılır, kullanıcı aramayı kaparken "Kameran kapatıldı" uyarısı alırdı (üstelik uyarı ekran
    // yığından çıktıktan sonra, DM ekranının üstünde belirirdi). Kapanış BİZDEN — burada işaretlenir,
    // aşağıdaki oturum sıfırlaması `false`a döndürür.
    localCameraStopping = true;
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
    cameraIntent = false; // M4d §6 — yeni oturum eski niyeti hatırlamaz (diğer kozmetik sıfırlamalarla aynı ders)
    muteBeforeDeafen = false; // M5a §3 — aynı ders, bir önceki oturumdan kalan sağırlaştırma-öncesi durum yeni oturumu kirletemez
    localCameraStopping = false; // M4f §3.1 — aynı kozmetik sıfırlama, bir önceki oturumdan kalamaz
    // Her oturum yeni bir `Room` nesnesi (yeni katılımcı kimlikleri) — bir sonraki `startOrJoin`
    // eski oturumdan kalma handler'larla karışmasın diye map burada temizlenir.
    speakingHandlers.clear();

    foregroundListenerRemove?.();
    foregroundListenerRemove = null;
    stopCallForegroundService().catch(() => {});
    void setPipCallActive(false); // M4p §2 — `startOrJoin`teki `true` ile simetrik, kozmetik sıfırlama
    appStateSub?.remove(); // M4d §6 — foreground listener ile aynı yaşam döngüsü
    appStateSub = null;

    // §8 istisnası — davet gönderilmişti ve kimse katılmadıysa, çıkarken karşı tarafın
    // çalan telefonunu/web bekleme barını da susturmak için call_cancel gönderilir.
    //
    // 🔴 M4z §F — grup dalı YANINDA, tek noktada (çağrı yerlerine serpilmez). İki fark:
    //  - Event `voice:group_call_cancel` (1-1'inki grupta rastgele bir üyeye giderdi).
    //  - `wasAlone` KOŞULU YOK: üç kişilik grupta B katılmışken C hâlâ çalıyor olabilir; başlatan
    //    çıkarken C'nin zili de susmalı. Katılmış olan etkilenmez (iptal yalnız çalma sunumunu
    //    kapatır, odadakinin bağlantısına dokunmaz — sözleşme §F.3).
    // Guild'de `didInvite` kalıcı false olduğu için ortam ses kanalı iki dala da girmez.
    //
    // 🔴 M5g §2 — bu blok BİLEREK `room.disconnect()`ten ÖNCEYE taşındı (web `voice.ts:414` ile aynı
    // sıra). LiveKit vedalaşması saniyeler sürebiliyor; iptal ondan SONRA gönderilseydi karşı taraf
    // o süre boyunca çalmaya devam ederdi (M5g §0.A). `didInvite`/`callKind` aşağıdaki `set()` ile
    // sıfırlanıyor, bu yüzden değerleri BURADA (gönderim anında) okunuyor.
    if (channelId && get().didInvite) {
      if (get().callKind === 'group') groupCallCancel(channelId);
      else if (wasAlone) callCancel(channelId);
    }

    if (room) {
      // 🔴 PM incelemesi (2026-08-08, M4j) — `disconnect()` BEKLEMELİ. O bekleme sırasında taşınma
      // akışı (`handleMoved`) yeni bir `Room` kurup modül değişkenini ÜZERİNE yazabiliyor; koşulsuz
      // `room = null` o yeni odanın referansını siliyordu (dev bu riski raporladı, "gizlemiyorum"
      // diye işaretledi). Referansı yakala, yalnız HÂLÂ AYNI odaysa sıfırla.
      const leavingRoom = room;
      try {
        await leavingRoom.disconnect();
      } catch {
        // yoksay
      }
      if (room === leavingRoom) room = null;
    }
    try {
      await AudioSession.stopAudioSession();
    } catch {
      // yoksay
    }

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
      guildId: null,
      // Diğer kozmetik sıfırlamalarla aynı ders — bir sonraki `startOrJoin` zaten üzerine yazar.
      // 🔴 `emergencyPending` BİLİNÇLİ OLARAK burada YOK: bu `set()` emergency akışının kendisi
      // tarafından (sunucu kicki → `Disconnected` → `leave(false)`) tetiklenebilir; burada
      // sıfırlansa `EmergencyButton`in geri bildirim modalı hiç görünmeden `call.tsx`in ertelenmiş
      // navigasyonu serbest kalırdı. Yalnız `endEmergency()` sıfırlar (bkz. o alanın yorumu).
      isGeneralVoiceChannel: false,
      pendingCallScreen: false,
      isMuted: false,
      isDeafened: false,
      canPublish: false,
      canPublishCamera: false,
      isCameraOn: false,
      cameraFacing: 'user',
      localCameraPublication: null,
      remoteCameraPublications: {},
      remoteScreenPublications: {},
      pendingCameraStart: false,
      roomParticipants: [],
      speakingUserIds: new Set(),
      mutedUserIds: new Set(),
      serverMutedUserIds: new Set(),
      cameraStoppedNotice: null,
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
      // M5a §3 🔴 — web `toggleMute` pariteti: sağırken mikrofonu AÇMAK sağırlığı da kaldırır
      // (Discord deseni). `toggleDeafen` burada güvenle çağrılabilir — `isMuted` az önce `false`
      // yazıldığı için undeafen dalının mikrofon-geri-aç kontrolü (`!muteBeforeDeafen && isMuted`)
      // zaten `false` bulur, ikinci bir `setMicrophoneEnabled` çağrısı yapmaz; yalnız uzak ses
      // hacimlerini geri açar ve `isDeafened`i indirir.
      if (next === false && get().isDeafened) await get().toggleDeafen();
    } catch {
      // izin/cihaz yoksa değiştirme
    }
  },

  async toggleDeafen() {
    if (!room) return;
    const next = !get().isDeafened;
    set({ isDeafened: next });
    for (const p of room.remoteParticipants.values()) p.setVolume(next ? 0 : 1);
    if (next) {
      // Sağırlaştır → mikrofonu kapat (önceki durumu hatırla, web `applyDeafen` pariteti).
      muteBeforeDeafen = get().isMuted;
      if (get().canPublish && !get().isMuted) {
        try {
          await room.localParticipant.setMicrophoneEnabled(false);
          set({ isMuted: true });
        } catch {
          // yoksay — sağırlık yine de uygulanmış sayılır (uzak ses hacimleri zaten sıfırlandı)
        }
      }
    } else {
      // Sağırlığı kaldır → mikrofon sağırlaştırma ÖNCESİ hâline döner (zaten susturulmuşsa kalır).
      if (get().canPublish && !muteBeforeDeafen && get().isMuted) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          set({ isMuted: false });
        } catch {
          // yoksay — kullanıcı düğmeden tekrar deneyebilir
        }
      }
    }
  },

  async toggleCamera() {
    // §1/§7 + M4e §4 → M4f §2 🔴 — `callKind` bazlı kapı KALKTI (guild artık DIŞARIDA BIRAKILMIYOR).
    // Kapı artık yalnız `canPublishCamera` (sunucu kararı, `resolveVideoSources`) — üç arama türünde
    // de aynı fonksiyon, aynı koşul.
    if (!room || !get().canPublishCamera) return { ok: false };

    if (get().isCameraOn) {
      // M4f §3.1 — bu unpublish BİZDEN: `wireRoom`daki `LocalTrackUnpublished` dinleyicisi aynı
      // olayı sunucu kaynaklı unpublish ile AYIRT EDEMEZ (SDK ikisinde de aynı olayı ateşler); bu
      // bayrak "zaten biz hallettik" der, dinleyici tekrar iş yapmaz (bkz. modül değişkeni yorumu).
      localCameraStopping = true;
      try {
        await room.localParticipant.setCameraEnabled(false);
      } catch {
        // yoksay — yerel state yine de kapanmış sayılır
      } finally {
        localCameraStopping = false;
      }
      cameraIntent = false;
      set({ isCameraOn: false, localCameraPublication: null });
      return { ok: true };
    }

    // §2 🔴 — desen `requestMicPermission` ile birebir aynı: reddedilirse arama DÜŞMEZ, yalnız
    // kamera açılmaz. Çağıran ekran bu mesajı gösterip "Ayarları Aç" seçeneği sunar.
    const granted = await requestCameraPermission();
    if (!granted) {
      return { ok: false, message: t('mobile.call.cameraPermissionDenied'), reason: 'camera_denied' };
    }
    try {
      const pub = await room.localParticipant.setCameraEnabled(true, { facingMode: get().cameraFacing });
      // §2 🔴 null-publication tuzağı — sunucu grant vermediğinde SDK sessizce publication
      // DÖNMEYEBİLİR (web'de yaşandı, bkz. sözleşme §2.4). `isCameraOn` yalnız GERÇEK publication
      // geldiğinde true olur; aksi halde niyet de yazılmaz (kullanıcı düğmeye tekrar basabilsin).
      if (!pub) return { ok: false };
      cameraIntent = true;
      set({ isCameraOn: true, localCameraPublication: pub });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },

  async switchCamera() {
    if (!room || !get().isCameraOn) return;
    // §4 — track KAPATILIP AÇILMAZ (karşı tarafta kutucuk yanıp sönerdi). Mevcut yayının publication'ı
    // üzerinden `restartTrack` ile aynı track yeni `facingMode`la yeniden başlatılır.
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (!(track instanceof LocalVideoTrack)) return;
    const next: 'user' | 'environment' = get().cameraFacing === 'user' ? 'environment' : 'user';
    try {
      await track.restartTrack({ facingMode: next });
      set({ cameraFacing: next });
    } catch {
      // yoksay — cihaz ikinci bir kamerayı desteklemiyor olabilir, mevcut track değişmeden kalır
    }
  },

  handleCallAccepted(channelId) {
    if (get().connectedChannelId === channelId) set({ didInvite: false });
  },
  // 🔴 Reddedilme, genel `unreachable` kovasına DÜŞMEZ (sahip turu 2026-08-11). Web bu ayrımı
  // zaten yapıyor: `call.rejected` düz reddi açıkça söyler, `call.unreachable` ise engellenme/
  // ilişki durumunu SIZDIRMAMAK için nötr kalır (bkz. web `useCall.ts` yorumları). Mobil ikisini
  // tek metne yığdığı için reddedilmede "ulaşılamıyor" diyordu — yanlış yönlendirici, teknik arıza
  // ima ediyordu. i18n ortak dosya olduğu için web'in anahtarı yeniden kullanıldı, yenisi açılmadı.
  handleCallRejected(channelId) {
    if (get().connectedChannelId !== channelId) return;
    set({ disconnectReason: t('call.rejected') });
    void get().leave(false);
  },

  async handleMoved(fromChannelId, toChannelId, toChannelName) {
    const current = get().connectedChannelId;
    // Bağlı olduğumuz kanal `fromChannelId` DEĞİL VE boş da değilse (başka bir aramadayız) —
    // stale/ilgisiz bildirim, aktif farklı bir oturumu kesmeyiz.
    if (current !== null && current !== fromChannelId) return;
    // Sprint M4h §4 🔴 — `guildId` BURADA yakalanır: aşağıdaki `leave()` durumu sıfırlıyor, o
    // yüzden `startOrJoin`e geçilmezse hedef kanaldaki moderasyon sheet'i (call.tsx) guildId'siz
    // kalır (yetki sorgusu hep `false` döner, sheet hiç açılmaz gibi görünür — sessiz bozulma).
    const guildId = get().guildId;
    // `disconnectReason` burada koşulsuz temizlenir: ters sırada (LiveKit kicki bu olaydan önce
    // ulaştıysa) `wireRoom`daki `Disconnected` `movePending` henüz false iken ateşlenmiş olabilir ve
    // "Bağlantı kesildi." yazmış olabilir — bkz. arayüzdeki `handleMoved` yorumu.
    set({ movePending: true, disconnectReason: null });
    if (current === fromChannelId) await get().leave(true);
    const res = await get().startOrJoin(toChannelId, toChannelName ?? '', { kind: 'guild', guildId });
    set({ movePending: false });
    return res;
  },

  applyServerMute(channelId, userId, muted) {
    if (get().connectedChannelId !== channelId) return;
    const s = new Set(get().serverMutedUserIds);
    if (muted) s.add(userId);
    else s.delete(userId);
    set({ serverMutedUserIds: s });
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

/**
 * M4d §6 — Model: kamera GÖRÜNÜR ARAYÜZE bağlı, ses SERVİSE bağlı (foreground service tipi
 * `microphone`; Android 14+ kameranın arayüzsüz çalışması ayrı bir FGS tipi + Play beyanı ister —
 * PM kararı 2026-08-08: o yola girilmiyor, Discord da PiP'siz girmiyor).
 *
 * 🔴 M4p sözleşme §4 — "arka plana alındı" tanımının PiP istisnası BURADA, tek satırla: PiP'teyken
 * (`isPipCurrentlyActive()` — bkz. o fonksiyonun yorumu, SENKRON native okuma) aktivite sistemce
 * GÖRÜNÜR sayıldığı için kamera durdurulmaz. PiP desteklenmiyorsa/izin kapalıysa (MIUI, §6) ya da
 * kullanıcı PiP'i kapattıysa bu `false` döner ve aşağısı DEĞİŞMEDEN çalışır (bugünkü davranış).
 * `cameraIntent`/`localCameraStopping`/öne dönüş dalına DOKUNULMADI — yalnız bu bir erken-çıkış.
 *
 * `cameraIntent` (modül değişkeni) burada yalnız OKUNUR, hiç YAZILMAZ — niyeti yalnız `toggleCamera`
 * değiştirir. Böylece "kullanıcı kapattı" ile "arka planda geçici durduruldu" birbirine karışmaz.
 */
async function handleAppStateChange(
  next: AppStateStatus,
  set: (partial: Partial<VoiceState>) => void,
  get: () => VoiceState,
) {
  if (!room) return;
  if (next === 'background') {
    if (isPipCurrentlyActive()) return; // M4p §4 — PiP'te aktivite görünür sayılır, kamera SÜRER
    if (!get().isCameraOn) return;
    // M4f §3.1 — bu unpublish de BİZDEN (bkz. `toggleCamera`teki aynı bayrak yorumu); `cameraIntent`
    // burada yine YAZILMAZ (üstteki yorum), yalnız sunucu kaynaklı unpublish dinleyicisi susturuluyor.
    localCameraStopping = true;
    try {
      await room.localParticipant.setCameraEnabled(false);
    } catch {
      // yoksay — arka planda hata gösterecek bir ekran yok, sessizce dener
    } finally {
      localCameraStopping = false;
    }
    set({ isCameraOn: false, localCameraPublication: null });
  } else if (next === 'active') {
    // Niyet yoksa ya da zaten açıksa (arka plana hiç düşmeden dönmüş olabilir) dokunma. Sunucu
    // izni (`canPublishCamera`) öne dönüşte de kontrol edilir — §6: "değilse kamera açılmaz, kapı
    // sunucuda".
    if (!cameraIntent || get().isCameraOn || !get().canPublishCamera) return;
    try {
      const pub = await room.localParticipant.setCameraEnabled(true, { facingMode: get().cameraFacing });
      if (pub) set({ isCameraOn: true, localCameraPublication: pub });
    } catch {
      // yoksay — öne dönüşte izin istemi göstermek YANLIŞ olurdu (kullanıcı arka plandan yeni döndü,
      // beklemediği bir sistem promptu görürdü); sessizce kapalı kalır, düğmeden tekrar denenebilir.
    }
  }
}

function wireRoom(
  r: Room,
  channelId: string,
  set: (partial: Partial<VoiceState>) => void,
  get: () => VoiceState,
) {
  r.on(RoomEvent.TrackMuted, (pub, p: Participant) => {
    if (pub.kind === Track.Kind.Video) {
      // M4d §3 🔴 — LiveKit bazı yollarda kamera track'ini unpublish etmek yerine MUTE eder
      // (`TrackUnsubscribed` gelmez) — web'de yaşanan tuzak (`stores/voice.ts` yorumu), burada da
      // aynı çift-yol (bkz. TrackSubscribed/TrackUnsubscribed altta) izleniyor. Yalnız UZAK
      // kameranın mute'u KENDİ kaydını map'ten düşürür (M4e §2 — çoğul yapı, başkasının kaydına
      // dokunmaz); yerel kapanış `toggleCamera`/arka plan dalının kendi işi.
      if (pub.source === Track.Source.Camera && p.identity !== r.localParticipant.identity) {
        const next = { ...get().remoteCameraPublications };
        delete next[p.identity];
        set({ remoteCameraPublications: next });
      }
      return;
    }
    const s = new Set(get().mutedUserIds);
    s.add(p.identity);
    set({ mutedUserIds: s });
  });
  // Sprint M5b §2 🔴 — ekran paylaşımı dalı. Kamera `TrackMuted` dinleyicisi (yukarıda) SATIR SATIR
  // değişmedi (M4e/M4f regresyon yasağı); LiveKit'in `EventEmitter`'ı aynı olaya birden fazla
  // dinleyici bağlanmasına izin veriyor, o yüzden ekran işini KENDİ ayrı dinleyicisine yazmak
  // kamera handler'ının içine dallanmaktan daha güvenli (kamera davranışına dokunma riski sıfır).
  // Aynı "publication mute → map'ten düş" deseni, yalnız kaynak ScreenShare ve hedef map farklı.
  r.on(RoomEvent.TrackMuted, (pub, p: Participant) => {
    if (pub.kind !== Track.Kind.Video) return;
    if (pub.source !== Track.Source.ScreenShare || p.identity === r.localParticipant.identity) return;
    const next = { ...get().remoteScreenPublications };
    delete next[p.identity];
    set({ remoteScreenPublications: next });
  });
  r.on(RoomEvent.TrackUnmuted, (pub, p: Participant) => {
    if (pub.kind === Track.Kind.Video) {
      if (pub.source === Track.Source.Camera && p.identity !== r.localParticipant.identity && pub.track) {
        set({
          remoteCameraPublications: { ...get().remoteCameraPublications, [p.identity]: pub as RemoteTrackPublication },
        });
      }
      return;
    }
    const s = new Set(get().mutedUserIds);
    s.delete(p.identity);
    set({ mutedUserIds: s });
  });
  // Sprint M5b §2 🔴 — ekran karşılığı (bkz. yukarıdaki `TrackMuted` ekran dinleyicisi yorumu, aynı
  // gerekçe: kamera `TrackUnmuted` dinleyicisi SATIR SATIR değişmedi, bu AYRI bir dinleyici).
  r.on(RoomEvent.TrackUnmuted, (pub, p: Participant) => {
    if (pub.kind !== Track.Kind.Video) return;
    if (pub.source !== Track.Source.ScreenShare || p.identity === r.localParticipant.identity || !pub.track) return;
    set({
      remoteScreenPublications: { ...get().remoteScreenPublications, [p.identity]: pub as RemoteTrackPublication },
    });
  });
  // M4f §3.1 🔴 — bu sprintin asıl işi. Yerel kamera track'i unpublish olduğunda (`LocalTrackUnpublished`,
  // kaynak Camera) SDK bunun BİZDEN mi (`toggleCamera`/arka plan) yoksa SUNUCUDAN mı (R11 yayın-durdur,
  // `voice.service.ts` `stopBroadcast` → `canPublishSources` düşer → LiveKit izni zorla düşürür) geldiğini
  // AYIRT ETMEZ — ikisi de aynı olayı ateşler (bkz. `livekit-client` `handleLocalTrackUnpublished`,
  // `unpublishTrack`in tek çağrı noktası). `localCameraStopping` bayrağı true iken bu, BİZİM az önce
  // istediğimiz kapanış — o yolun kendi state güncellemesi zaten var, burası ikinci kez iş yapmaz.
  // false iken gelen olay sunucu kaynaklıdır: `isCameraOn`/`localCameraPublication` düşürülür VE
  // `cameraIntent` SIFIRLANIR (atlanırsa öne dönüşte `handleAppStateChange` moderasyon kararını
  // sessizce deler, kamerayı kendiliğinden yeniden açar) — kullanıcıya `cameraStoppedNotice` ile
  // (nedensiz) kısa bir bilgi verilir, ekran bunu Alert ile gösterip temizler (§3.3).
  r.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
    if (pub.source !== Track.Source.Camera) return;
    // `leaving` de kontrol edilir: ayrılış `localCameraStopping`i en başta işaretliyor ama beklenmedik
    // kopmada (`Disconnected` → `leave()`) sıra tersine dönebilir; iki bayrak birlikte "bu kapanış
    // bizden/oturum bitiyor" der (PM incelemesi 2026-08-08).
    if (localCameraStopping || leaving) return;
    cameraIntent = false;
    set({
      isCameraOn: false,
      localCameraPublication: null,
      cameraStoppedNotice: t('mobile.call.cameraStopped'),
    });
  });
  // M4f §3.2 🔴 — sunucu izin kararını (R11 yayın-durdur / re-mint) canlı yansıt: yayın kesilince
  // düğme kaybolsun, izin geri gelirse (sonraki token mint'inde) düğme geri gelsin. Yalnız YEREL
  // katılımcının değişimi ilgimizi çeker — uzak katılımcıların izin değişimi bu istemcide görünür
  // bir şey değiştirmez. T&S §4: yaş bandı istemciye inmiyor, yalnız `canPublishSources` okunuyor.
  r.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant: Participant) => {
    if (participant.identity !== r.localParticipant.identity) return;
    const canCamera = participant.permissions?.canPublishSources.includes(TrackSource.CAMERA) ?? false;
    set({ canPublishCamera: canCamera });

    // R16m 🔴 — aynı olayın SES karşılığı (kontrat `contracts/SPRINT_R16_VOICE_MUTE_STATE_CONTRACT.md`
    // §3.2/§6; referans `web/src/stores/voice.ts` aynı bloğu — mantık taşındı, kod kopyalanmadı).
    // `canPublish` bugüne dek yalnız `startOrJoin`de mint yanıtından BİR KEZ okunuyordu: moderatör
    // susturmayı kaldırınca sunucu LiveKit iznini geri veriyordu ama istemci hiç haberdar olmuyordu
    // (mikrofon düğmesi kalıcı pasif, susturulan yeniden bağlanmadan konuşamıyordu — sahibin bir
    // hesabı tam bu durumda kilitli kaldı, kontrat §0).
    const wasCanPublish = get().canPublish;
    const nextCanPublish = participant.permissions?.canPublish ?? false;
    set({ canPublish: nextCanPublish });
    if (nextCanPublish && !wasCanPublish) {
      // İzin geri geldi (susturma kaldırıldı). 🔴 `isMuted` BURADA yalnız OKUNUR — susturulmadan
      // önceki kendi tercihi budur. `isMuted`e mobilde sunucu kaynaklı yazan başka bir yol YOK
      // (yalnız kullanıcı eylemi `toggleMute` ve bağlantı-anı sonucu `startOrJoin` yazıyor) — burada
      // güvenle "kullanıcının son isteği" olarak okunabilir. Kendi isteğiyle kapatmışsa (`isMuted`
      // true) mikrofon AÇILMAZ: sunucu izni geri vermek "mikrofonunu aç" demek değildir (kontrat
      // §3.2 🔴). `canPublish` artık true olduğu için düğme aktifleşir, kullanıcı isterse kendi
      // `toggleMute`iyle açar.
      if (!get().isMuted) {
        void (async () => {
          try {
            await r.localParticipant.setMicrophoneEnabled(true);
          } catch {
            // Cihaz/izin sorunu — dinleyici kal, düğme aktif kalır (kullanıcı tekrar deneyebilir).
            set({ isMuted: true });
          }
        })();
      }
    }
    // else (izin düştü / susturuldu): `isMuted` KASITLI olarak değiştirilmez — kullanıcının kendi
    // mikrofon tercihini bu anda dondurmuş oluruz, izin geri gelince yukarıdaki dal onu okur. LiveKit
    // SFU izni düşünce zaten yerel track'i zorla unpublish eder (susturulduktan sonra ses gitmez);
    // `canPublish=false` düğmeyi (`CallControls` `disabled`) pasifleştirir.
  });
  // M4d §3 — uzak kameranın asıl kazanım/kayıp yolu: katılımcı yayına başlayınca/bırakınca.
  // M4e §2 🔴 — `remoteCameraPublications` artık `participant.identity` (userId) anahtarlı ÇOĞUL
  // yapı (grupta N kişi yayın yapabilir; eskiden tek slot ikinci kişiyi ezerdi). `track` parametresi
  // kullanılmıyor, publication zaten track'i taşıyor (ParticipantTile `.track` ile kontrol ediyor).
  r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (track.kind !== Track.Kind.Video || track.source !== Track.Source.Camera) return;
    set({ remoteCameraPublications: { ...get().remoteCameraPublications, [participant.identity]: pub } });
  });
  r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (track.kind !== Track.Kind.Video || track.source !== Track.Source.Camera) return;
    const next = { ...get().remoteCameraPublications };
    delete next[participant.identity];
    set({ remoteCameraPublications: next });
  });
  // Sprint M5b §2 🔴 — ekran paylaşımının asıl kazanım/kayıp yolu, kamera `TrackSubscribed`/
  // `TrackUnsubscribed` dinleyicileriyle (yukarıda) BİREBİR aynı desen, AYRI dinleyiciler olarak
  // eklendi (kamera satırları değişmedi). "İlk tarama" ayrı bir kod noktası GEREKTİRMİYOR: LiveKit
  // bağlanma anında zaten var olan (bizden önce başlamış) yayınlar için de bu olayı ateşliyor —
  // kamera bugün de aynı şekilde çalışıyor, manuel bir başlangıç taraması hiç yoktu.
  r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (track.kind !== Track.Kind.Video || track.source !== Track.Source.ScreenShare) return;
    set({ remoteScreenPublications: { ...get().remoteScreenPublications, [participant.identity]: pub } });
  });
  r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (track.kind !== Track.Kind.Video || track.source !== Track.Source.ScreenShare) return;
    const next = { ...get().remoteScreenPublications };
    delete next[participant.identity];
    set({ remoteScreenPublications: next });
  });
  r.on(RoomEvent.ActiveSpeakersChanged, () => recomputeSpeaking(set));
  r.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
    attachSpeaking(p, set);
    refreshRoomParticipants(set, get);
    scheduleAloneCheckIfNeeded(get);
    // M5a §3 🔴 — sağırken katılan biri sessiz katılmalı. `RemoteParticipant.setVolume` katılımcının
    // KENDİ `volumeMap`ine yazar (yeni nesne, önceki katılımcılardan devralmaz) — bu çağrı olmasa
    // sağırlaştırma açıkken katılan kişi tam sesle duyulurdu.
    if (get().isDeafened) p.setVolume(0);
  });
  r.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
    detachSpeaking(p);
    refreshRoomParticipants(set, get);
    recomputeSpeaking(set);
    scheduleAloneCheckIfNeeded(get);
    // M4d §3 / M4e §2 🔴 — ayrılan katılımcı kamera yayınlıyorduysa donuk kare kalmasın. Grupta N
    // kişi olabileceği için yalnız AYRILANIN kaydı map'ten düşürülür, diğerleri etkilenmez.
    const next = { ...get().remoteCameraPublications };
    delete next[p.identity];
    set({ remoteCameraPublications: next });
    // Sprint M5b §2 🔴 — ekran için AYNI temizlik (ayrılan kişi paylaşıyorduysa donuk kare
    // kalmasın); yukarıdaki kamera satırları değişmeden, yalnız ek bir blok.
    const nextScreen = { ...get().remoteScreenPublications };
    delete nextScreen[p.identity];
    set({ remoteScreenPublications: nextScreen });
  });
  r.on(RoomEvent.Disconnected, (reason?: unknown) => {
    // §3.3 🔴 — YALNIZ beklenmedik kopma (ağ/sunucu/A4/R11B). Ayrılışı biz başlattıysak
    // (`leaving`) bu olay `room.disconnect()`in kendi yankısıdır: temizlik zaten yürüyor ve
    // buradaki "Bağlantı kesildi" mesajı gerçek sebebi (ör. karşı taraf reddetti) EZER.
    if (__DEV__) console.warn('[voice] LiveKit Disconnected — reason:', reason);
    if (leaving) return;
    if (get().connectedChannelId === channelId) {
      // Sprint M4t §3.1 🔴 — acil buton onaylandıysa bu kopma SUNUCU KAYNAKLI ve BEKLENEN
      // (removeParticipant, A4 §B1.3): "Bağlantı kesildi." kusur mesajı EZMEZ, `EmergencyButton`
      // kendi geri bildirim akışını gösterir (bkz. `emergencyPending` alan yorumu).
      // Sprint M4j (D55) 🔴 — moderatör taşıması da AYNI sebeple ezmez: sunucu kicki taşımanın
      // parçası (bkz. `movePending` alan yorumu, `handleMoved` bu kopmayı KENDİSİ yönetiyor).
      if (!get().emergencyPending && !get().movePending) {
        set({ disconnectReason: t('mobile.call.disconnected') });
      }
      // 🔴 Aynı kapı (bkz. `leave()` içindeki yorum): bu dinleyici ESKİ odaya ait; taşınmada yeni oda
      // çoktan kurulmuş olabilir, o zaman burada sıfırlamak yenisini siler.
      if (room === r) room = null;
      void get().leave(false);
    }
  });
}
