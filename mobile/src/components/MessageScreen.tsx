import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { extractErrorMessage } from '@/api/errors';
import type { MessageAuthorDto, MessageDto } from '@/api/messages';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MessageBubble } from './MessageBubble';
import { SeenAvatars, type SeenReader } from './message/SeenAvatars';
import { SwipeToReply } from './message/SwipeToReply';
import { EditMessageOverlay } from './message/EditMessageOverlay';
import { ProfileSheet } from './profile/ProfileSheet';
import { MessageSearchModal } from './MessageSearchModal';
import { ComposerHost } from './message/ComposerHost';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { DateSeparator } from './message/DateSeparator';
import { E2eeDeviceNotice } from './message/E2eeDeviceNotice';
import { E2eeDivider } from './message/E2eeDivider';
import { E2eeIntroBox } from './message/E2eeIntroBox';
import { GroupEventNotice } from './message/GroupEventNotice';
import { useGroupEventSlots } from './message/useGroupEventSlots';
import { E2eeWarningBanner } from './message/E2eeWarningBanner';
import { useE2eeChannelView } from './message/useE2eeChannelView';
import { SafetyCodeSheet } from './e2ee/SafetyCodeSheet';
import { useBackupInChannel } from './backup/useBackupInChannel';
import { useTypingEmitter } from './message/useTypingEmitter';
import { useMessageComposer } from './message/useMessageComposer';
import { discardOptimistic, retryOptimistic } from './message/useOptimisticSend';
import { useMentionCompose, type MentionCandidate } from './message/useMentionCompose';
import { useMessageListController } from './message/useMessageListController';
import { MessageEmpty, MessageError, MessageLoading } from './message/MessageStates';
import { MessageActionHost, SelectionReactions, useSelectionHeader } from './message/MessageActionHost';
import { ScrollToBottomButton } from './message/ScrollToBottomButton';
import { useMessageActions } from './message/useMessageActions';
import { useMessageSelection } from './message/useMessageSelection';
import { useReactionAnchor } from './message/useReactionAnchor';
import { useQuickReactions } from '@/utils/quickReactions';
import { useMessagesStore } from '@/stores/messages';
import { useE2eeStore } from '@/stores/e2ee';
import { useVoicePlaybackStore } from '@/stores/voicePlayback';
import { ScanStatus } from '@/api/messages';
import { useAuthStore } from '@/stores/auth';
import { joinChannel, leaveChannel, setActiveChannel } from '@/realtime/socket';
import { t } from '@/i18n';
import { theme } from '@/theme';

type LoadState = 'loading' | 'error' | 'ready';

/** Inverted listede veri sırası yeniden→eskiye: indeksi küçük (alttaki) hücre daha üstte çizilir. */
function StackedCell({ index, style, onLayout, children }: ViewProps & { index: number }) {
  return (
    <View style={[style, { zIndex: 100000 - index }]} onLayout={onLayout}>
      {children}
    </View>
  );
}

/**
 * C67 §4: avatarın önceki hedef hücresinden yenisine dikey uzaklık (dp). Alttaki hücrenin ölçülmüş yüksekliği +
 * aradaki hücrelerin toplamı. + = önceki konum aşağıda (yeni hücre üstte), - = yukarıda. Ölçü yoksa undefined.
 */
function slideFrom(
  prevId: string | undefined,
  nextId: string,
  indexOf: Map<string, number>,
  items: { message: { id: string } }[],
  heights: Map<string, number>,
): number | undefined {
  if (!prevId || prevId === nextId) return undefined;
  const ip = indexOf.get(prevId);
  const inx = indexOf.get(nextId);
  if (ip === undefined || inx === undefined) return undefined;
  const lower = Math.max(ip, inx); // büyük indeks = daha yeni = ekranda daha aşağıda
  const upper = Math.min(ip, inx);
  let sum = heights.get(items[lower].message.id);
  if (sum === undefined) return undefined;
  for (let i = upper + 1; i < lower; i++) {
    const h = heights.get(items[i].message.id);
    if (h === undefined) return undefined;
    sum += h;
  }
  return inx > ip ? -sum : sum; // yeni hücre aşağıdaysa avatar yukarıdan (negatif) iner
}


interface Props {
  channelId: string;
  placeholder: string;
  markRead: (channelId: string) => Promise<unknown>;
  /**
   * C12 §4.2 — bir mesajın okundu göstergesi. Verilmezse tik HİÇ çizilmez; ortam kanalı ve grup DM
   * bu prop'u geçmiyor. Kararı ekran veriyor çünkü gizlilik kuralı kanal türüne bağlı (1-1 DM).
   */
  receiptFor?: (message: MessageDto) => 'sent' | 'seen' | null;
  /** C67 — okuyucu avatarları (yalnız DM/grup DM verir); yerleşim burada: her okuyucu `createdAt <= readAt` olan SON mesajın altında. */
  seenReaders?: SeenReader[];
  typingMode: 'named' | 'simple';
  // T&S — DM engelli/izinsizse sunucu göndermede 403 döner; ama giriş kutusunu baştan devre dışı
  // bırakmak için sidebar'dan taşınan bilgi (contract §6 — sessizce gizlenmez, neden gösterilir).
  disabledNotice?: string | null;
  /** C62 — bandın yanındaki eylem (eski grup: "Sohbeti sil"); yalnız `disabledNotice` doluyken çizilir. */
  disabledAction?: { label: string; onPress: () => void };
  /**
   * C62 — salt okunur geçmiş (gruptan ayrılan/çıkarılan): yanıt/tepki/düzenle/sil/sabitle/ilet/şikâyet
   * ve odaya katılma kapalı, yalnız kopyala açık. Okundu çağrısını `markRead` veren ekran keser.
   */
  readOnly?: boolean;
  // Sözleşme §3.6 — DM'e özel başlık ikonları (Sohbeti Temizle / Grup Yönetimi). Kanal ekranında
  // yok (undefined). Arama ikonu HER İKİ ekranda ortak olduğu için burada, MessageScreen'in kendi
  // headerRight'ına eklenir — tek `<Stack.Screen>` headerRight sahibi bu bileşen (birden fazla
  // bileşenin aynı route için headerRight yazması güvenilmez sırayla ezilir).
  headerActions?: ReactNode;
  /**
   * C81 Rev.2 — başlığın solu ve ortası (geri/rozet, sohbet adı). Ekran bunları KENDİSİ ayarlar ki seçim modunda
   * aynı native başlığın içeriği değişsin (başlık gizlenmez, ekran yeniden yerleşmez). Çağıran `Stack.Screen`de
   * bu iki seçeneği vermez; vermesi, hangi ayarın kazanacağını efekt sırasına bırakırdı.
   */
  headerLeft?: () => ReactNode;
  headerTitle?: () => ReactNode;
  /** M4a-1 — mesaj listesinin ÜSTÜNDE, başlığın altında sabit bir şerit (ör. "Sesli arama sürüyor").
   *  Genel isimlendirildi (voice'e özel değil): ekran veriyorsa çizilir, vermezse hiçbir şey. */
  topBanner?: ReactNode;
  /**
   * Sprint M1g R1 — ekran açılır açılmaz bu mesaja git ve **geçici olarak vurgula**.
   * Ortam içi aramadan gelir. Atlama/vurgulama makinesi zaten `useMessageListController`'daydı
   * (kanal içi arama kullanıyordu); eksik olan tek şey DIŞARIDAN tetiklenmesiydi.
   */
  jumpToMessageId?: string;
  /**
   * Sprint M1h — sabitleme yetkisi. **DM/grup DM'de her üye** sabitleyebilir (sunucu ek kontrol
   * yapmıyor), ortam kanalında `MANAGE_MESSAGES` gerekiyor; o hesabı kanal ekranı yapıyor.
   */
  canPin?: boolean;
  /**
   * Başkasının bu mesajını silebilir miyim (web `MessageRow.canManageMessages` karşılığı). Ortam
   * kanalında `MANAGE_MESSAGES`; grup DM'de kurucu/yönetici hiyerarşisi (`utils/groupRoles`);
   * 1-1 DM'de verilmez. Kapı sunucuda; burada yalnız Sil satırını gösterir.
   */
  canDeleteOthers?: (message: MessageDto) => boolean;
  /** Başlıktaki "Sabitlenenler" düğmesi — yalnız yüzey varsa (kanal/DM ekranı verir). */
  onOpenPins?: () => void;
  /**
   * 🔴 Mesaj arama gösterilsin mi (sahip kararı 2026-08-01). Varsayılan AÇIK, **1-1 DM'de kapalı**:
   * arama ortam kanallarında değerli, 1-1'de karşında tek kişi var. Web'de de aynısı yapıldı.
   */
  searchable?: boolean;
  /**
   * Sprint M2d — bahsetme öneri kaynağı. Ortam kanalında ortam üyeleri, 1-1 DM'de karşı taraf,
   * grup DM'de grup üyeleri. **Boş/verilmemiş → `@` yazınca liste hiç açılmaz** (örn. `guildId`
   * taşımayan kanal ekranı: yarım liste göstermek yanlış vaat olur, sözleşme §3.1).
   */
  mentionCandidates?: MentionCandidate[];
  /** `@everyone` rol id'si — YALNIZ everyone rolü `mentionable` ise dolu; aksi `null`. */
  everyoneRoleId?: string | null;
  /** R15 — roleId → rol adı (mesaj gövdesindeki `<@&id>` token'ı için). */
  resolveRole?: (roleId: string) => string | undefined;
  /** R15 — öneri listesine girecek roller (kapı kuralı çağıranda uygulanmış). */
  mentionRoles?: MentionCandidate[];
  /**
   * Sprint M3b §3.2 — profil alt-panelinin ortam bağlamı. Verilirse `GET /users/:id/card` rol
   * rozetlerini de döner; verilmezse (DM/grup DM, ya da `guildId`siz açılmış kanal ekranı) panel
   * Roller bölümünü hiç çizmez. Yeni istek/uç değil, mevcut ucun parametresi.
   */
  guildId?: string;
  /** M6a §2 — baloncukta avatar + yazar adı gösterilsin mi. Varsayılan AÇIK; 1-1 DM `false` verir. */
  showIdentity?: boolean;
  /**
   * C75 §3.1 (K1): gönderen tarafında kabul bekleyen mesaj isteği. Mesaj yokken kutunun üstünde şerit
   * (`composeHint`); ilk mesaj gidince kutu tamamen kilitlenir (`lockedComposer`, hiçbir gönderim yolu açık
   * kalmaz) ve mesajın altında durum satırı çıkar. Başarısız yerel mesaj "gitti" sayılmaz (yeniden denenebilsin).
   */
  outgoingRequest?: boolean;
}

// Sprint M1a — kanal VE DM mesaj ekranı için TEK gövde (contract §5 ekran 3: "aynısı"). İkisi de
// aynı REST/WS yüzeyini kullanır (`/channels/:id/messages` — DM kanalı da bir Channel satırıdır);
// yalnız "okundu" ucu ve başlık farklı, onlar çağıran route'tan gelir.
export function MessageScreen({
  channelId,
  placeholder,
  markRead,
  receiptFor,
  seenReaders,
  typingMode,
  disabledNotice: baseDisabledNotice,
  disabledAction,
  readOnly = false,
  headerActions,
  headerLeft,
  headerTitle,
  topBanner,
  searchable = true,
  showIdentity = true,
  jumpToMessageId,
  canPin = false,
  canDeleteOthers,
  onOpenPins,
  mentionCandidates,
  everyoneRoleId,
  resolveRole,
  mentionRoles,
  guildId,
  outgoingRequest = false,
}: Props) {
  const authUser = useAuthStore((s) => s.user);
  const emailUnverified = authUser?.emailVerified === false;
  const fetchInitial = useMessagesStore((s) => s.fetchInitial);
  const seedKnownUser = useMessagesStore((s) => s.seedKnownUser);
  const resolveUsername = useMessagesStore((s) => s.resolveUsername);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  // Sprint M3b §3.1 — mesaj yazarına dokununca açılan profil alt-paneli. Hedef `MessageAuthorDto`
  // olarak tutuluyor (id + ad + avatar zaten mesajda var) → panel açılırken ek istek yok, kartı
  // kendisi çekiyor.
  const [profileTarget, setProfileTarget] = useState<MessageAuthorDto | null>(null);
  // D95 — profil panelinden "Bahset" isteği (ComposerHost yazma kutusuna ekler)
  const [mentionRequest, setMentionRequest] = useState<{ candidate: MentionCandidate } | null>(null);
  // Kısayol yalnız yazılabilen çok kişili sohbette: 1-1 DM (`showIdentity` false) ve yazma kutusu
  // kapalıyken (`disabledNotice`: salt okunur/engelli) ya da öneri kaynağı yokken sunulmaz.
  const canMentionShortcut = showIdentity && !baseDisabledNotice && (mentionCandidates?.length ?? 0) > 0;

  // "Yazıyor" yayını + etiketi kendi kancasında (M1d-C §2.1).
  const typing = useTypingEmitter(channelId, typingMode);
  // Bahsetme yazma: @ sorgusu, öneri listesi, gönderimde token dönüşümü (M2d §4).
  // R15 — roller listenin ÜSTÜNDE (web ile aynı sıra); kapı kuralı çağıranda uygulandı.
  const mentionSource = useMemo(
    () => [...(mentionRoles ?? []), ...(mentionCandidates ?? [])],
    [mentionRoles, mentionCandidates],
  );
  const mention = useMentionCompose(mentionSource, everyoneRoleId);
  // Giriş kutusu: metin, gönderim, yanıt/düzenleme modları (M1d-C §2.5).
  const composer = useMessageComposer(channelId, typing, mention);

  // react-hooks/set-state-in-effect — GuildsScreen (M0) deseni: effect gövdesi fetch'i DOĞRUDAN
  // (adlandırılmış bir sarmalayıcı fonksiyonu çağırmadan) inline zincirler; setState yalnız
  // .then/.catch içinde (asenkron) çalışır. `fetchMessages` yalnız effect DIŞI iki yer için var:
  // reconnect refetch (realtime/socket.ts'e closure olarak verilir, sonradan async çağrılır) ve
  // "tekrar dene" butonu (kullanıcı olayı, effect değil).
  const fetchMessages = useCallback(async () => {
    try {
      await fetchInitial(channelId);
      setLoadState('ready');
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
      setLoadState('error');
    }
  }, [channelId, fetchInitial]);

  function retryLoad() {
    setLoadState('loading');
    fetchMessages();
  }

  useEffect(() => {
    let cancelled = false;
    fetchInitial(channelId)
      .then(() => {
        if (!cancelled) setLoadState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMessage(extractErrorMessage(e));
        setLoadState('error');
      });

    markRead(channelId).catch(() => {});
    // C62: eski üyenin soket odası yok; katılma 403 olurdu.
    if (!readOnly) {
      joinChannel(channelId).then((ack) => {
        if (__DEV__ && !ack.ok) console.warn('[MessageScreen] join başarısız:', ack.error);
      });
    }

    return () => {
      cancelled = true;
      leaveChannel(channelId);
      // typing:stop artık `useTypingEmitter`in kendi temizliğinde (aynı channelId'ye bağlı).
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // 🔴 Kusur düzeltmesi (Sprint M5d §1 madde 2, sahip bulgusu 2026-08-11) — "bu kanal açık" kaydı
  // (`setActiveChannel`) ÖNCEDEN yukarıdaki mount effect'in İÇİNDEYDİ. `dm/[id].tsx`teki KUSUR
  // SINIFININ AYNISI: ortam içi arama ekranı bu ekranın ÜSTÜNE itilince (stack navigasyonu) alttaki
  // ekran unmount OLMUYOR, yalnız odağı kaybediyor — kayıt mount'a bağlı olduğu için dolu kalıyordu ve
  // `channel.activity`/`mention` dinleyicileri (`realtime/socket.ts:230,251`) hâlâ "kullanıcı bu
  // kanalı okuyor" sanıp rozeti hiç basmıyordu (DM tarafındaki `stores/dm.ts:166` ile aynı belirti).
  //
  // CERRAHİ AYRIM (sözleşme §1 madde 2 uyarısı) — YALNIZ `setActiveChannel` buraya, odağa taşındı.
  // `fetchMessages`/`markRead`/`joinChannel`/`leaveChannel` YUKARIDAKİ mount effect'te KALDI: odak
  // kaybında odadan çıkılırsa (`leaveChannel`) WS odası terk edilir ve arama sırasında mesaj akışını
  // keser — kusuru büyütürdü. Katılım/ayrılma ve ilk veri çekme bilerek mount'a bağlı bırakıldı.
  // contract §4.3 — reconnect sonrası bu kanalın mesajları yeniden çekilir (boşluk bırakmaz); bu artık
  // yalnız ekran ODAKTAYKEN geçerli (blur'da `onReconnectRefetch` da `null`'a döner, aşağıdaki
  // `setActiveChannel(null)` ile — DM tarafındaki `setActiveDm(null)` simetrisiyle aynı desen).
  // `isFocused` C12 §4.3 için: odak durumu zaten burada biliniyor, ayrı bir kanca/import
  // (`useIsFocused`) açmaya gerek yok — tek kaynak bu efekt.
  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActiveChannel(channelId, fetchMessages);
      setIsFocused(true);
      return () => {
        setActiveChannel(null);
        setIsFocused(false);
      };
    }, [channelId, fetchMessages]),
  );


  useEffect(() => {
    if (authUser) seedKnownUser(channelId, authUser.id, authUser.username);
  }, [authUser, channelId, seedKnownUser]);

  // Liste verisi + kaydırma davranışı (gruplama · dibe yapışma · yeni mesaj sayacı · zıplama).
  const list = useMessageListController(channelId, authUser?.id, jumpToMessageId);
  // C75 §3.1: istek gönderildi mi? Kabul bekleyen kanalda yalnız gönderen yazabilir ve tek mesaj; listede
  // başarısız olmayan herhangi bir mesaj varsa "gitti" sayılır. Kutu o andan itibaren kilitli.
  const requestSent = outgoingRequest && list.items.some((i) => i.message.localStatus !== 'failed');
  const disabledNotice = baseDisabledNotice ?? (requestSent ? t('messageRequests.lockedComposer') : null);
  /**
   * C12 §4.3 — ekran AÇIKKEN gelen mesaj da anında okundu işaretlenir.
   *
   * Bu olmadan özellik yarım kalıyor: `markRead` yalnız mount'ta çağrılıyordu, yani iki kişi de
   * sohbete bakarken karşı tarafın tiki HİÇ çifte dönmezdi ve en sık yaşanacak senaryo tam olarak
   * bu. Tetikleyici son mesajın KİMLİĞİ, uzunluk değil: geçmişe kaydırma da uzunluğu artırıyor ve
   * o bir okuma olayı değil.
   *
   * Kendi mesajım tetiklemez (zaten okumuş sayılıyorum). Ekran odakta değilken de çağrılmaz —
   * `isFocused` üstteki odak kancasıyla aynı kaynağa bakar; arka planda okunmuş saymak karşı
   * tarafa yalan söylemek olurdu (aynı gerekçe web'de `document.visibilityState` ile).
   *
   * 🔴 Kusur düzeltmesi (sahip bulgusu 2026-10-29): burada `list.items[0]` okunuyordu ama `items`
   * ESKİDEN YENİYE sıralı (`useMessageListController`), yani [0] en ESKİ mesaj ve yeni mesajla hiç
   * değişmiyor. Sonuç: ekran açıkken gelen mesaj sunucuda hiç okundu sayılmadı (yeniden açılışta
   * kırmızı nokta, karşı tarafın tiki tek kaldı, okunmamış mesaj için gecikmeli push). Son mesaj
   * dizinin SONUNDA.
   */
  const lastMessage = list.items[list.items.length - 1]?.message;
  const lastMessageId = lastMessage?.id;
  useEffect(() => {
    if (!lastMessageId || !lastMessage) return;
    if (!isFocused) return;
    if (lastMessage.author.id === authUser?.id) return;
    markRead(channelId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId, isFocused]);

  const { items, inverted } = list;
  // C67 §3: mesaj kimliği → o mesajı "en son okunan" yapan okuyucular. Geçici (gönderilmemiş) mesaj sayılmaz.
  // §4 (FLIP): okuyucunun önceki hedef hücresi biliniyorsa `fromY` = önceki konuma dikey uzaklık (arada kalan
  // hücrelerin ölçülmüş yükseklikleri + alttaki hücrenin yüksekliği); ölçü eksikse (sanallaştırma) animasyonsuz belirir.
  const cellHeights = useRef(new Map<string, number>());
  const prevTarget = useRef(new Map<string, string>());
  const seenByMessage = useMemo(() => {
    const map = new Map<string, SeenReader[]>();
    if (!seenReaders?.length) return map;
    const indexOf = new Map(items.map((it, i) => [it.message.id, i] as const));
    for (const r of seenReaders) {
      for (let i = items.length - 1; i >= 0; i--) {
        const m = items[i].message;
        if (m.localStatus || m.id.startsWith('pending:')) continue;
        if (m.createdAt <= r.readAt) {
          map.set(m.id, [...(map.get(m.id) ?? []), { ...r, fromY: slideFrom(prevTarget.current.get(r.userId), m.id, indexOf, items, cellHeights.current) }]);
          break;
        }
      }
    }
    return map;
  }, [seenReaders, items]);
  useEffect(() => {
    const next = new Map<string, string>();
    seenByMessage.forEach((rs, id) => rs.forEach((r) => next.set(r.userId, id)));
    prevTarget.current = next;
  }, [seenByMessage]);
  // E1: kilit, uyarı bandı ve "bu noktadan sonra şifreli" ayracı (şifresiz kanalda hiçbiri görünmez).
  const plainMessages = useMemo(() => items.map((it) => it.message), [items]);
  const hasMoreOlder = useMessagesStore((s) => s.byChannel[channelId]?.hasMore ?? false);
  // E5b Parça C: cihaz öncesi mesajlar gizlendiyse (daha eskisi yokken) listenin başında tek satır bilgi.
  const hiddenBefore = useMessagesStore((s) => s.byChannel[channelId]?.hiddenBefore ?? false);
  const e2eeView = useE2eeChannelView(channelId, plainMessages, hasMoreOlder, hiddenBefore);
  const safetyEnabled = useE2eeStore((s) => s.engine?.identity?.enabled === true);
  const [safetyOpen, setSafetyOpen] = useState(false);
  // Kod iki kişi arasındadır: 1-1'de karşı taraf, grupta üyeler (bahsetme listesi zaten "ben hariç").
  const safetyMembers = useMemo(
    () => (mentionCandidates ?? []).filter((c) => !c.isEveryone && !c.isRole).map((c) => ({ id: c.id, username: c.username })),
    [mentionCandidates],
  );
  /** E2 §3.3: `slot` = eskiden-yeniye dizideki yer (bu mesajdan ÖNCE; `items.length` = son mesajdan sonra). */
  const groupEventSlots = useGroupEventSlots(channelId, plainMessages, hasMoreOlder);
  const renderNotices = (slot: number) => (
    <>
      {e2eeView.deviceNotices.get(slot)?.map((n) => (
        <E2eeDeviceNotice key={`${n.userId}-${n.at}`} name={e2eeView.noticeName(n.userId)} kind={n.kind} />
      ))}
      {/* C64: uyelik olaylari (mesaj degil); zamanina gore akisa karisir. */}
      {groupEventSlots.get(slot)?.map((e) => (
        <GroupEventNotice key={e.id} event={e} myId={authUser?.id} />
      ))}
    </>
  );
  useBackupInChannel(e2eeView.encrypted, fetchMessages); // E5a: kurulum sorusu + geri yükleme sonrası yenileme
  // M6b §8.4 — sesli mesaj otomatik geçişi için kronolojik (eski → yeni) CLEAN ses eki sırası.
  useEffect(() => {
    const ids = items.flatMap((it) =>
      (it.message.attachments ?? [])
        .filter((a) => a.contentType.startsWith('audio/') && a.scanStatus === ScanStatus.CLEAN)
        .map((a) => a.id),
    );
    useVoicePlaybackStore.getState().setQueue(ids);
  }, [items]);
  // Mesaj paneli akışı (uzun basış · tepki · kopyala · sil) — M1d-C §2.4.
  const actions = useMessageActions(channelId);
  // C81: uzun basış = WhatsApp tarzı seçim modu (alt panel kalktı).
  const selection = useMessageSelection(items);
  // C81: hızlı tepki şeridi seçili tek mesajın üstünde (uzun basılan nokta).
  const anchor = useReactionAnchor(selection.selected.length === 1 ? selection.selected[0].id : null);
  // C46: çift dokunma = etkin hızlı tepki listesinin ilki.
  const quickEmojis = useQuickReactions();

  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [kbGeom, setKbGeom] = useState({ h: 0 });
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardVisible(true);
      setKbGeom({ h: Math.round(e.endCoordinates.height) });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // 🔴 Klavye payı — bu blok ÜÇ KEZ yanlış kuruldu; üçünün de kökü aynı: cihazın davranışını
  // VARSAYMAK. Dördüncüsü olmasın diye 2026-08-04'te sahip cihazında ÖLÇÜLEN sayılarla yazıldı.
  //
  // Deneme 1 (KAV yok, `max(klavye, insets.bottom)`): kutu tepeye fırladı — o günün native
  //   kabuğunda pencere klavye açılınca ZATEN küçülüyordu, pay ikinci kez eklenmiş oldu.
  // Deneme 2 (`KeyboardAvoidingView behavior="padding"`): o kabukta çalıştı. Ama M3c'de
  //   `expo-media-library`/`expo-document-picker` eklenip YENİ dev build alınınca davranış terse
  //   döndü — pencere artık küçülmüyor — ve kutu klavyenin arkasında kaldı. KAV'ın kendi hesabı da
  //   ekran-koordinatı (`screenY`) ile pencere-koordinatını (`measureInWindow`) karıştırdığı için
  //   Android'de edge-to-edge ile güvenilir değil.
  // Deneme 3 (KAV + `keyboardVerticalOffset={useHeaderHeight()}`): kutu çok yukarı fırladı.
  //   `useHeaderHeight()` bu ekranlarda 247 döndürüyor (gerçek başlık ~55dp) — offset olarak
  //   kullanılamaz.
  //
  // ÖLÇÜLEN (sahip cihazı, klavye AÇIKKEN): screen 872.7 · window 822.9 · insets.top 33.8 ·
  //   insets.bottom 16 · klavye yüksekliği 287 · klavye tepesi (screenY) 570.
  //   → window (822.9) klavye açıkken DEĞİŞMİYOR: pencere kendini küçültmüyor, payı biz veriyoruz.
  //   → window = screen − insets.top − insets.bottom (822.9 = 872.7 − 33.8 − 16) ✓
  //   → klavyenin tepesi pencere koordinatında: screenY − insets.top = 536.2
  //   → örtüşme = 822.9 − 536.2 = 286.7 ≈ klavye yüksekliği (287)
  //
  // Yani gereken pay **klavyenin kendi yüksekliği**; bu sihirli sayı değil, özdeşlik: pencere iki
  // güvenli alan payını zaten dışlıyor ve klavye gezinme çubuğunun hemen üstünde oturuyor, ikisi
  // sadeleşiyor. `- insets.bottom` çıkarmak payı İKİ KEZ düşürür (Deneme 4'te bu da denendi, eksik
  // kaldı). Formül bilerek koordinat sistemi İÇERMİYOR — üç denemeyi de bozan şey oydu.
  //
  // 🔴 Deneme 5 — DÜZELTME (kapalı test, 2026-08-11). Yukarıdaki ölçüm tek bir gezinme kipinde
  // alındığı için eksikti. Testçide kutunun bir kısmı klavyenin arkasında kalıyordu; sahip kendi
  // cihazında **gezinme kipini değiştirerek** yeniden üretti: aynı telefon, aynı klavye, tek
  // değişen kip. Kaydırma hareketlerinde kutu klavyenin üstünde, 3 tuşlu gezinmede arkasında.
  //
  // Kök neden: `+ panelGap` (16) hiçbir zaman bir tasarım boşluğu değildi, **gezinme çubuğu payının
  // yerine geçmiş bir tesadüftü**. Kaydırma kipinde `insets.bottom` da 16; ikisi eşit olduğu için
  // formül doğruymuş gibi göründü ve tek kipte alınan ölçüm de onayladı.
  //
  // ÖLÇÜLEN (aynı cihaz, tek değişen gezinme kipi — 2026-08-11):
  //   kaydırma : insets.bottom 16   · klavye 287 · pencere 822.9 → gereken pay 303
  //   3 tuşlu  : insets.bottom 47.3 · klavye 255 · pencere 791.6 → gereken pay 302.3
  //   → 3 tuşlu kipte OS klavyeyi 32 birim DAHA KISA bildiriyor (çubuk o alanı yiyor) ama pencere
  //     de aynı miktarda küçülüyor. Sabit 16 bu değişime tepki vermediği için pay 31 eksik
  //     kalıyordu; kutu tam o kadar örtülüyordu.
  //
  // 🔬 Not: "gereken pay = (ekran − klavye tepesi) − insets.bottom" formülü de denendi ve ÖLÇÜM
  // ONU ÇÜRÜTTÜ — iki kipte de `klavye yüksekliği` ile aynı sonucu veriyor (286.9 / 254.9), yani
  // kusuru hiç kapatmazdı. Dördüncü başarısız denemeyi önleyen şey ölçüm oldu, akıl yürütme değil.
  //
  // Bu yüzden sabit yerine payın kendisi kullanılıyor. Kaydırma kipinde sonuç eskisiyle BİREBİR
  // AYNI (16 = 16) — çalışan yapılandırmayı bozma riski yok — 3 tuşlu kipte eksik pay kapanıyor.
  // Her iki kipte de kutunun altı klavyenin tepesine tam oturuyor (örtüşme 0, ölçüldü).
  // Yanıtla'nın TEK giriş fonksiyonu: eylem paneli ve sağa kaydırma ikisi de buradan geçer.
  const replyTo = (m: MessageDto) => composer.startReply(m);
  // C27 — düzenleme kendi katmanında (kutudan bağımsız); sola kaydırma ve eylem paneli aynı girişi kullanır.
  const [editTarget, setEditTarget] = useState<MessageDto | null>(null);
  // C81 Rev.2 — seçim modunun başlık parçaları (aynı native başlıkta).
  const selHeader = useSelectionHeader({
    actions,
    selection,
    readOnly,
    canPin,
    canDeleteOthers,
    onReply: disabledNotice ? undefined : replyTo,
    onEdit: setEditTarget,
  });
  const keyboardPad = keyboardVisible ? kbGeom.h + insets.bottom : 0;
  const bottomInset = keyboardVisible ? 0 : insets.bottom;

  return (
    <GestureHandlerRootView style={[styles.flex, { paddingBottom: keyboardPad }]}>
      {/* C81: ekran kabının pencere konumu (tepki şeridi bu kaba göre konumlanır). */}
      <View ref={anchor.marker} style={styles.anchorMarker} pointerEvents="none" collapsable={false} />
      <Stack.Screen
        options={{
          // C81 §2 Rev.2: seçim modunda aynı native başlığın içeriği değişir (✕ · sayı · eylemler).
          headerLeft: selection.active ? selHeader.left : headerLeft,
          headerTitle: selection.active ? selHeader.title : headerTitle,
          headerRight: selection.active ? selHeader.right : () => (
            <View style={styles.headerActionsRow}>
              {e2eeView.encrypted && (
                // E7 §4.7: kilit güvenlik kodunu açar (kimlik bayrağı kapalıysa yalnız simge).
                <Pressable
                  onPress={safetyEnabled ? () => setSafetyOpen(true) : undefined}
                  disabled={!safetyEnabled}
                  hitSlop={12}
                  accessibilityRole={safetyEnabled ? 'button' : 'image'}
                  accessibilityLabel={safetyEnabled ? t('e2ee.identity.openCode') : t('e2ee.lockTitle')}
                >
                  <Ionicons name="lock-closed" size={16} color={theme.colors.textMuted} />
                </Pressable>
              )}
              {headerActions}
              {/* Sprint M1h — Sabitlenenler. Yalnız ekran bir yüzey verdiyse çizilir; düğme
                  koyup hiçbir yere götürmemek "boş yüzey" olurdu. */}
              {onOpenPins && (
                <Pressable
                  onPress={onOpenPins}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('message.pinnedMessages')}
                >
                  <Ionicons name="bookmark-outline" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              )}
              {searchable && (
                <Pressable
                  onPress={() => setSearchVisible(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.search')}
                >
                  <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              )}
            </View>
          ),
        }}
      />

      {/* Doğrulanmamış hesap sohbette de görsün (web AppShell şeridi karşılığı); dosya/sesli mesaj burada reddediliyor. */}
      {emailUnverified ? <EmailVerificationBanner /> : null}
      {topBanner}
      {e2eeView.warning ? <E2eeWarningBanner kind={e2eeView.warning} /> : null}

      {loadState === 'loading' && <MessageLoading />}
      {loadState === 'error' && <MessageError message={errorMessage} onRetry={retryLoad} />}
      {loadState === 'ready' && items.length === 0 && e2eeView.showIntro && (
        <E2eeIntroBox onPress={safetyEnabled ? () => setSafetyOpen(true) : undefined} />
      )}
      {loadState === 'ready' && items.length === 0 && (
        <MessageEmpty message={hiddenBefore ? t('e2ee.backup.history.hiddenNote') : undefined} />
      )}

      {loadState === 'ready' && items.length > 0 && (
        // Liste kabı: "en alta in" düğmesi listenin sağ altına (mesaj kutusunun üstüne) oturur.
        <View style={styles.listWrap}>
        <FlatList
          ref={list.listRef}
          data={inverted}
          keyExtractor={(item) => item.message.nonce ?? item.message.id}
          inverted
          // C67 §4: yeni (alttaki) hücreler üstte çizilir; avatar eski konumdan kayarken aradaki balonların altında kalmaz.
          CellRendererComponent={StackedCell}
          contentContainerStyle={styles.list}
          onScroll={(e) => {
            list.onListScroll(e);
            if (anchor.top !== null) anchor.hide();
          }}
          scrollEventThrottle={16}
          onEndReachedThreshold={0.4}
          onEndReached={() => list.onEndReached(loadState === 'ready')}
          onScrollToIndexFailed={(info) => {
            // Değişken yükseklikli mesaj satırlarında scrollToIndex ilk denemede başarısız olabilir
            // (RN bilinen sınırı) — kısa gecikmeyle tekrar dene.
            setTimeout(() => {
              list.listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.4 });
            }, 60);
          }}
          // Inverted listede başlık görsel olarak EN ALTTA durur: henüz şifreli mesaj yokken ayraç sonda.
          ListHeaderComponent={
            <View>
              {e2eeView.dividerAtEnd && <E2eeDivider />}
              {renderNotices(items.length)}
              {requestSent ? <Text style={styles.requestStatus}>{t('messageRequests.pendingStatus')}</Text> : null}
            </View>
          }
          ListFooterComponent={
            list.loadingOlder ? (
              <ActivityIndicator color={theme.colors.textMuted} style={styles.loadMore} />
            ) : !hasMoreOlder && hiddenBefore ? (
              <Text style={styles.hiddenNote}>{t('e2ee.backup.history.hiddenNote')}</Text>
            ) : e2eeView.showIntro ? (
              // Inverted listede footer görsel olarak EN ÜSTTE: sohbetin başı.
              <E2eeIntroBox onPress={safetyEnabled ? () => setSafetyOpen(true) : undefined} />
            ) : null
          }
          renderItem={({ item, index }) => (
            // 🔴 C11 — bu sarmalayıcı `View` ŞART, `<>` fragment DEĞİL. `inverted` listede RN
            // hücre kabını `flexDirection: 'column-reverse'` + `scaleY(-1)` ile kuruyor
            // (VirtualizedListCellRenderer: `[styles.columnReverse, inversionStyle]`) — bu
            // yüzden hücrenin DOĞRUDAN çocukları ekranda TERS sırada çizilir; fragment
            // kullanılsaydı ayraç mesajın ALTINDA görünürdü. Araya bir View girince iç düzen
            // normal sütun olur ve iki çevirme sadeleşir: ayraç mesajın üstünde.
            <View
              onLayout={(e) => cellHeights.current.set(item.message.id, e.nativeEvent.layout.height)}
            >
              {item.isDayStart && <DateSeparator iso={item.message.createdAt} />}
              {item.message.id === e2eeView.dividerBeforeId && <E2eeDivider />}
              {renderNotices(items.length - 1 - index)}
              {/* C23 — Yanıtla her mesajda açık (eylem paneli de koşulsuz sunuyor); tek işlev. */}
              <SwipeToReply
                // C29: gecici/basarisiz mesajda kaydirarak yanit/duzenle kapali (iki islev de yok = jest kapali).
                // C57: mesaj kutusu kapalıysa (salt okunur kanal, yazılamayan DM) yanıt da yok.
                onReply={
                  item.message.localStatus || disabledNotice || selection.active
                    ? undefined
                    : () => replyTo(item.message)
                }
                // Düzenle yalnız kendi mesajımda: eylem panelindeki `isMine` koşuluyla aynı (yazar = ben).
                onEdit={
                  !readOnly && !selection.active && !item.message.localStatus && item.message.author.id === authUser?.id
                    ? () => setEditTarget(item.message)
                    : undefined
                }
              >
              {/* C81 Rev.2: tepki şeridi bu kabın (baloncuğun) hemen üstüne konumlanır. */}
              <View ref={anchor.bubbleRef(item.message.id)} collapsable={false}>
              <MessageBubble
                message={item.message}
                showAuthor={item.showAuthor}
                showIdentity={showIdentity}
                isMine={item.message.author.id === authUser?.id}
                receipt={receiptFor?.(item.message) ?? null}
                resolveMention={(id) => resolveUsername(channelId, id)}
                resolveRole={resolveRole}
                highlighted={item.message.id === list.highlightId}
                onLongPress={() => (selection.active ? selection.toggle : selection.start)(item.message)}
                onPressAuthor={() => setProfileTarget(item.message.author)}
                onToggleReaction={readOnly ? undefined : (emoji) => actions.toggleReaction(item.message, emoji)}
                onShowReactions={readOnly ? undefined : () => actions.openReactions(item.message)}
                onDoubleTap={
                  readOnly || item.message.localStatus ? undefined : () => actions.quickReact(item.message, quickEmojis[0])
                }
                onRetry={() => retryOptimistic(item.message)}
                onDiscard={() => discardOptimistic(item.message)}
                onPressReply={() => {
                  if (item.message.replyToId) list.requestJump(item.message.replyToId);
                }}
              />
              {/* C81 §1: seçim modunda baloncuk satırına dokunuş seçimi açar/kapar; mesajın kendi dokunuşları
                  (görsel, bağlantı, yazar, çift dokunma) bu katmanın altında kalır. Vurgu yalnız mesaj satırını
                  kaplar (tarih ayracını değil). */}
              {selection.active && (
                <Pressable
                  style={[StyleSheet.absoluteFill, selection.isSelected(item.message.id) && styles.selectedRow]}
                  onPress={() => selection.toggle(item.message)}
                  onLongPress={() => selection.toggle(item.message)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selection.isSelected(item.message.id) }}
                />
              )}
              </View>
              </SwipeToReply>
              {seenByMessage.has(item.message.id) ? <SeenAvatars readers={seenByMessage.get(item.message.id)!} /> : null}
            </View>
          )}
        />
        {/* En alta in: geçmişe kaydırınca görünür; yukarıdayken gelen mesaj sayısı rozette (REV-9). */}
        {(list.scrolledUp || list.newMessageCount > 0) && (
          <ScrollToBottomButton count={list.newMessageCount} onPress={list.jumpToBottom} />
        )}
        </View>
      )}


      {/* Sprint M3c — kutu + ek paneli + emoji seçici tek yerleşimde (`ComposerHost`); ekran yalnız
          bağlamı geçirir. Kutunun kendi iç akışı (taslak ekler, imleç, seçiciler) ekranın işi değil. */}
      {outgoingRequest && !requestSent && !baseDisabledNotice ? (
        <Text style={styles.requestHint}>{t('messageRequests.composeHint')}</Text>
      ) : null}
      <ComposerHost
        composer={composer}
        mention={mention}
        placeholder={placeholder}
        disabledNotice={disabledNotice}
        disabledAction={disabledAction}
        typingLabel={typing.label}
        bottomInset={bottomInset}
        channelId={channelId}
        mentionRequest={mentionRequest}
      />

      <SelectionReactions actions={actions} selection={selection} top={anchor.top} readOnly={readOnly} />
      <MessageActionHost actions={actions} onOpenProfile={setProfileTarget} />

      {editTarget && (
        <EditMessageOverlay
          message={editTarget}
          channelId={channelId}
          showIdentity={showIdentity}
          resolveMention={(id) => resolveUsername(channelId, id)}
          resolveRole={resolveRole}
          mentionSource={mentionSource}
          everyoneRoleId={everyoneRoleId}
          keyboardPad={keyboardPad}
          bottomInset={bottomInset}
          onClose={() => setEditTarget(null)}
        />
      )}

      {profileTarget && (
        <ProfileSheet
          userId={profileTarget.id}
          username={profileTarget.username}
          avatarUrl={profileTarget.avatarUrl}
          guildId={guildId}
          onMention={
            canMentionShortcut
              ? () => setMentionRequest({ candidate: { id: profileTarget.id, username: profileTarget.username } })
              : undefined
          }
          onClose={() => setProfileTarget(null)}
        />
      )}

      {searchVisible && (
        <MessageSearchModal
          channelId={channelId}
          onClose={() => setSearchVisible(false)}
          onJump={(id) => {
            setSearchVisible(false);
            list.requestJump(id);
          }}
        />
      )}

      {safetyOpen && <SafetyCodeSheet members={safetyMembers} onClose={() => setSafetyOpen(false)} />}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  requestStatus: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    textAlign: 'right',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 4,
  },
  requestHint: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.layout.panelGap,
    marginTop: 6,
    marginBottom: theme.layout.panelGap,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 8,
  },
  hiddenNote: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 10,
  },
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginRight: 12,
  },
  list: {
    paddingVertical: theme.layout.panelGap,
  },
  loadMore: {
    marginVertical: 10,
  },
  listWrap: {
    flex: 1,
  },
  anchorMarker: { position: 'absolute', top: 0, left: 0, width: 1, height: 1 },
  // C81: seçili satır tam genişlikte Kor tonuyla vurgulanır (WhatsApp gibi).
  selectedRow: {
    backgroundColor: theme.colors.accentSubtle,
  },
});
