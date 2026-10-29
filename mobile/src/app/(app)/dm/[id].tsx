import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dmApi } from '@/api/dm';
import type { MessageDto } from '@/api/messages';
import { useAuthStore } from '@/stores/auth';
import { useDmStore } from '@/stores/dm';
import { useVoiceStore } from '@/stores/voice';
import { useVoicePresenceStore, type VoicePresenceParticipant } from '@/stores/voicePresence';
import { usePresenceStore, selectStatus } from '@/stores/presence';
import { useActivityStore, selectGameName } from '@/stores/activity';
import { PRESENCE_COLOR } from '@/components/PresenceDot';
import { OngoingCallBanner } from '@/components/call/OngoingCallBanner';
import { MessageScreen } from '@/components/MessageScreen';
import { ChatBackButton } from '@/components/ChatBackButton';
import { channelTitle } from '@/utils/channelTitle';
import { clearChannelNotifications } from '@/notifications/push';
import { t } from '@/i18n';
import { theme } from '@/theme';

const EMPTY_PRESENCE: VoicePresenceParticipant[] = [];


// Sprint M1a contract §5 ekran 3 — DM mesaj ekranı: kanal ekranıyla "aynısı" (MessageScreen ortak
// gövde) + başlıkta karşı tarafın adı/avatarı (dokunuş → salt okunur profil kartı, yalnız 1-1 DM'de
// — grup DM'de tek bir "karşı taraf" yok). Sidebar'dan gelen `canMessage`/`selfBlocked` T&S
// durumunu input yerine görünür bir uyarıya çevirir (contract §6 — sessizce gizlenmez).
//
// Sprint M1b contract §3.6 — profil kartı artık aksiyon taşıyor (engelle/arkadaşlıktan çıkar);
// `canMessage`/`selfBlocked` bu yüzden route param'ından SABİT okunmuyor, yerel override state'e
// alındı — engelleme/engel-kaldırma bu ekrandan ayrılmadan giriş kutusunu anında kapatıp açabilsin
// (DoD #9: "Engelledikten sonra DM giriş kutusu kapanıyor").
export default function DmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    avatarUrl?: string;
    otherUserId?: string;
    kind?: 'dm' | 'group';
    canMessage?: string;
    selfBlocked?: string;
    /** M1h — sabitlenenler ekranından "mesaja git" (kanal ekranındaki `jumpTo` ile aynı yol). */
    jumpTo?: string;
  }>();
  const channelId = params.id;

  // 🔴 Kusur düzeltmesi (sahip bulgusu 2026-07-30, M1d-0 turu): bayraklar ROUTE PARAMETRESİNDEN
  // okunuyordu — yani listeden açıldığı ANDAKİ değerden. Engeli başka bir ekrandan (yeni
  // Engellenenler ekranı) kaldırınca parametre bayat kalıyor ve giriş kutusu kapalı kalıyordu.
  // Bugüne kadar görünmemesinin sebebi: engel kaldırmanın tek yolu bu ekrandaki profil kartıydı,
  // oradan kaldırınca yerel bir tazeleme çalışıyordu. İkinci yol açılınca kusur ortaya çıktı.
  // Doğru kaynak store: `dm` store'u sunucudan gelen `canMessage`/`selfBlocked`'ı taşıyor ve her
  // `fetchAll` ile tazeleniyor. Route parametresi yalnız store'da kanal yokken (derin link) yedek.
  const storeChannel = useDmStore((s) => s.channels.find((c) => c.id === params.id));
  const myUserId = useAuthStore((s) => s.user?.id);

  // 🔴 Kusur düzeltmesi (sahip bulgusu 2026-08-03, cihaz turu — push'tan açılan DM): `kind` route
  // param'ı yalnız listeden gelişte var; push yolu yalnız `{ id }` taşıyor (bkz. `pushNavigation.ts`
  // `dmTarget` — store'da kanal henüz yoksa minimal id ile açılır). `params.kind !== 'group'` o
  // durumda HER ZAMAN true'ya düşüyordu (grup DM'i bile 1-1 sanıyordu). Store dolduğunda (`useDmStore`
  // hook'u zaten reaktif — soğuk açılışta liste sonradan gelince ekran kendiliğinden güncellenir)
  // gerçek tipi buradan oku; store'da yoksa (soğuk açılış anı / derin link) route param'ına düş —
  // listeden gelişte ikisi zaten aynı.
  const isDm = storeChannel ? storeChannel.type === 'DM' : params.kind !== 'group';
  // 🔴 M4b sözleşme §1/§4 — grup DM sesli. `isDm` YALNIZ 1-1'i ayırt eder (yukarıdaki tarihçe
  // korunuyor, değiştirilmedi); bu ayrı bayrak grup DM'i ayırt eder. `voiceEligible` ikisinin
  // birleşimi — bu ekran zaten yalnız DM/GROUP_DM kanallarını çiziyor (guild `channel/[id].tsx`'te),
  // yani pratikte "her zaman true" ama açık tutuluyor: gelecekte bu ekrana üçüncü bir tür eklenirse
  // (yok bugün) sessizce ses özelliği kazanmasın.
  const isGroupDm = storeChannel ? storeChannel.type === 'GROUP_DM' : params.kind === 'group';
  const voiceEligible = isDm || isGroupDm;

  /**
   * Sprint M2d §3.2 — bahsetme öneri kaynağı. Grup DM'de üyeler store'daki kanal kaydından gelir;
   * 1-1 DM'de tek kişilik liste (store yoksa route param'ından — derin link yedeği, başlıkla
   * aynı kaynak). Kendini bahsetmek anlamsız olduğu için listede kendi hesabın YOK; grup üyeleri
   * sunucudan zaten "ben hariç" gelmiyor, o yüzden burada süzülmez — 1-1'de zaten karşı taraf tek.
   */
  const mentionCandidates = useMemo(() => {
    if (storeChannel?.type === 'GROUP_DM') {
      // Kendin listede yok — sunucu kendi bahsetmeni yok sayıyor (kanal ekranındaki not).
      return storeChannel.members
        .filter((m) => m.id !== myUserId)
        .map((m) => ({
          id: m.id,
          username: m.username,
          avatarUrl: m.avatarUrl,
        }));
    }
    if (storeChannel?.type === 'DM') {
      const u = storeChannel.otherUser;
      return [{ id: u.id, username: u.username, avatarUrl: u.avatarUrl }];
    }
    if (params.otherUserId && params.title) {
      return [{ id: params.otherUserId, username: params.title, avatarUrl: params.avatarUrl ?? null }];
    }
    return [];
  }, [storeChannel, myUserId, params.otherUserId, params.title, params.avatarUrl]);

  // M1d-0 R1 (sahip kararı 2026-07-31) — başlıktaki kanka ekle ikonu **KALDIRILDI**. 2026-07-30'da
  // eklenmişti çünkü o gün profil kartında ekleme yoktu; R1-d kartı eklemeyi getirince başlık ikonu
  // ikinci kapıya dönüştü. Kart bu ekranda her zaman erişilebilir (başlıktaki ada dokunmak açıyor),
  // yani yetenek kaybolmadı — yalnız tek kapıya indi. Yetenek kaybı olsaydı kaldırılmazdı.
  // M1d-C §2.2 (sahip kararı 2026-08-01) — "Sohbeti Temizle" ve grup yönetimi başlıktan KALKTI.
  // Başlığın sağ üstü sesli/görüntülü aramaya ayrıldı ve o gelene kadar BOŞ duruyor (yer tutucu
  // ikon konmaz). Aksiyonlar kaybolmadı: DM listesinde satıra uzun basınca açılan panele taşındı.

  // Sözleşme §8.3 — bu DM açıkken gelen mesaj listede "okunmadı" işaretlenmez (web `activeDmChannelId`
  // ile aynı); ayrıca açılışta kutucuğun rozeti hemen düşer (sunucuya `markRead` MessageScreen'den
  // gidiyor, bu yalnız listenin yerel yansıması — bir sonraki `fetchAll`'ı beklemeden).
  //
  // 🔴 Kusur düzeltmesi (Sprint M5d §1, sahip bulgusu 2026-08-11): bu kayıt ÖNCEDEN `useEffect` ile
  // MOUNT'a bağlıydı. Arama ekranı bu ekranın ÜSTÜNE itilince (stack navigasyonu) alttaki DM ekranı
  // unmount OLMUYOR, yalnız odağı kaybediyor — `activeDmChannelId` dolu kaldığı için uygulama arama
  // ekranındayken hâlâ "bu DM'i okuyor" sanıyordu: banner düşmüyordu (`notifications/push.ts` §2
  // istisnası) ve liste rozeti hiç set edilmiyordu (`stores/dm.ts:166`). `useFocusEffect` (`home.tsx`
  // /`me.tsx`/`notifications.tsx`'te zaten kullanılan desen) odak/blur'a simetrik çalışır: odağa
  // gelince set + rozet temizle, odak GİDİNCE (blur VEYA unmount, ikisi de aynı temizleyiciyi tetikler)
  // null'a dön — aynı DM'e geri dönüşte yeniden set edilir (sınır koşulu). `clearUnread` de buraya
  // taşındı (sözleşme §1 madde 3 — zararsız, ekrana her dönüşte rozet düşer; sunucuya giden `markRead`
  // sıklığı DEĞİŞMEDİ, o MessageScreen'in mount effect'inde kalıyor).
  //
  // 🔴 M5e §2 (sahip geri bildirimi 2026-08-11) — odağa gelince bu kanala ait, sistem bildirim
  // tepsisinde gölgede bekleyen mesaj bildirimleri de düşürülür (`clearChannelNotifications`,
  // `notifications/push.ts`). Yeni bir yaşam döngüsü mekanizması KURULMADI — aynı odak kancası
  // kullanıldı (sözleşme "bugün eklenen odak kancası kullanılabilir" diyor). Yalnız bu kanalın
  // DM_MESSAGE/MENTION bildirimleri hedeflenir; başka sohbetlerin ve arama bildirimlerinin
  // etkilenmemesi `push.ts`teki filtreyle garanti edilir.
  //
  // 🔴 Kusur düzeltmesi (sahip bulgusu 2026-08-12, cihaz turu — bildirimden açılan DM): bu ekran
  // DM listesinin ÇEKİLMİŞ olduğunu varsayıyordu. Tek çekim noktası `DmSidebar`ın mount'u, yani Ana
  // Sayfa sekmesi; bildirime dokunup uygulama kapalıyken açılınca rota doğrudan bu ekrana itiliyor
  // ve o sekme hiç mount olmuyor. Sonuç zincirleme: `storeChannel` boş → başlıkta ad yok, avatar boş
  // daire (push yolu yalnız `{ id }` taşıyor, düşülecek route param'ı da yok) VE `clearUnread`
  // hiçbir şeye dokunmuyor → rozetler düşmüyor. Kullanıcı cevap yazınca `dm.message` olayı
  // `applyActivity`yi tetikliyor, o da kanalı listede bulamayıp `fetchAll` çağırıyordu — "cevap
  // verince ad geri geliyor" tam olarak buydu. Ekran artık kendi verisini garantiliyor: liste
  // yoksa çeker, geldiğinde rozeti tekrar düşürür (`fetchAll` sunucudan gelen `unread`i yazıyor).
  useFocusEffect(
    useCallback(() => {
      if (!channelId) return;
      const store = useDmStore.getState();
      store.setActiveDm(channelId);
      store.clearUnread(channelId);
      void clearChannelNotifications(channelId);
      if (!store.channels.some((c) => c.id === channelId)) {
        void store.fetchAll().then(() => useDmStore.getState().clearUnread(channelId));
      }
      return () => useDmStore.getState().setActiveDm(null);
    }, [channelId]),
  );

  // M4a-1 sözleşme §3.1 — ses presence aboneliği. M4b'den beri 1-1 DM VE grup DM'de (`voiceEligible`);
  // grup DM kapsam dışı bırakılışı M4a'nın sınırıydı, bu sprintte kalktı. "Arama başlatma = katılma"
  // modelinde bu abonelik + `GET voice/participants` DM ekranının kendi işi — call.tsx'in değil
  // (o zaten bağlıyken açılır).
  useEffect(() => {
    if (!channelId || !voiceEligible) return;
    useVoicePresenceStore.getState().subscribe(channelId);
    return () => useVoicePresenceStore.getState().unsubscribe(channelId);
  }, [channelId, voiceEligible]);

  const presenceParticipants = useVoicePresenceStore((s) =>
    voiceEligible && channelId ? (s.byChannel[channelId] ?? EMPTY_PRESENCE) : EMPTY_PRESENCE,
  );
  const isConnectedHere = useVoiceStore((s) => s.connectedChannelId === channelId);
  const [callBusy, setCallBusy] = useState(false);

  // Başlıkta karşı tarafın durumu (sahip isteği 2026-08-11, WhatsApp deseni). Aktif olan HER durum
  // yazılır (çevrimiçi/boşta/rahatsız etmeyin), yalnız çevrimdışıyken hiçbir şey yazılmaz. Sahip
  // kararı: "boşta" göstermemek de bir şey söylüyor ve yanlış olanı söylüyor, kişi bağlı.
  // Renk web'in presence paletiyle aynı (`UserCard.vue` presenceColor), token'dan geliyor.
  // Grup DM'de yok: tek bir "karşı taraf" olmadığı için neyin durumu yazılacağı tanımsız.
  // Kimin görülebildiğine SUNUCU karar veriyor (`PresenceService.canSeePresence`, R7): engellenen
  // taraf ve arkadaş olmayan minör zaten hiç gelmez, burada ek bir kapı kurulmuyor.
  const otherUserId = storeChannel?.type === 'DM' ? storeChannel.otherUser.id : params.otherUserId;
  const otherStatus = usePresenceStore(selectStatus(isDm ? otherUserId : null));
  // C31b: karşı taraf çevrimiçiyken oyun oynuyorsa durum yerine "X oynuyor" (görünürlük sunucuda).
  const otherGame = useActivityStore(selectGameName(isDm ? otherUserId : null));
  // Çevrimdışıda başlıkta durum yazısı yok (null).
  const presenceColor = isDm && otherStatus !== 'offline' ? PRESENCE_COLOR[otherStatus] : null;

  /**
   * C12 §4.2 — okundu göstergesi. null dönerse tik HİÇ çizilmez.
   *
   * Kurallar burada değil, sunucunun verdiği `otherReadAt`te toplanıyor (`visibleReadAt`, R7):
   * alan null geldiyse `showsReceipts` false döner ve gösterge tamamen kaybolur. Bilinçli —
   * "tek tikte donmuş" bir gösterge, gizliliğin kapalı olduğunu sızdırmadan yanlış bilgi verirdi.
   * Grup DM'de de null: sunucu o kanalda `otherReadAt` göndermiyor.
   */
  // 🔴 Kaynak `storeChannel` (zaten reaktif abonelik) — `useDmStore.getState()` DEĞİL: anlık
  // okuma yapan bir sürüm yazılmıştı ve `dm:read` gelince ekran yeniden çizilmediği için tik
  // hiç güncellenmezdi. Store yeni kanal nesnesi ürettiği için buradaki bağımlılık tetikleniyor.
  const receiptsEnabled = storeChannel?.type === 'DM' ? storeChannel.receiptsEnabled === true : false;
  const otherReadAt = storeChannel?.type === 'DM' ? (storeChannel.otherReadAt ?? null) : null;

  const receiptFor = useCallback(
    (m: MessageDto): 'sent' | 'seen' | null => {
      if (!myUserId || m.author.id !== myUserId) return null;
      // Kapı gizlilik kararı; okuma olup olmaması tek/çift tiki seçer, göstergeyi gizlemez.
      if (!receiptsEnabled) return null;
      if (!otherReadAt) return 'sent';
      return m.createdAt <= otherReadAt ? 'seen' : 'sent';
    },
    [myUserId, receiptsEnabled, otherReadAt],
  );

  if (!channelId) return null;

  // 🔴 KUSUR 1 düzeltmesi (sahip bulgusu 2026-08-03, cihaz turu) — push'tan açılan DM'de başlıkta
  // ad yok, avatar boş daire: ekran bu üçünü YALNIZ route param'ından okuyordu, push yolu
  // `{ id: channelId }` dışında bir şey taşımıyor (`pushNavigation.ts` `dmTarget`). Artık önce
  // `storeChannel`'dan türetiliyor (1-1'de karşı taraf, grupta `channelTitle` — listedeki satırla
  // AYNI kaynak); store soğuk açılışta sonradan dolduğu için `useDmStore` hook'u zaten reaktif,
  // tek seferlik okuma değil. Store'da kayıt yoksa (derin link / soğuk açılış anı) route
  // param'ına düşülür — listeden gelişte ikisi zaten aynı değeri taşıyor.
  const title = storeChannel ? channelTitle(storeChannel) : (params.title ?? '');
  const avatarUrl = storeChannel?.type === 'DM' ? storeChannel.otherUser.avatarUrl : (params.avatarUrl ?? null);

  // 🔴 `canMessage`/`selfBlocked` store'dan okunur, yerel override YOK — profil paneli engelleme
  // mutasyonunu `useFriendsStore` üzerinden yapıyor, o da dm store'unu tazeliyor; ekran yeni
  // bayrakları kendiliğinden görür (T&S disiplini: karar backend otoritesinde).
  const canMessage =
    storeChannel && storeChannel.type === 'DM' ? storeChannel.canMessage : params.canMessage !== 'false';
  const selfBlocked =
    storeChannel && storeChannel.type === 'DM' ? storeChannel.selfBlocked : params.selfBlocked === 'true';

  const disabledNotice = isDm && !canMessage ? (selfBlocked ? t('dm.selfBlocked') : t('dm.cannotMessage')) : null;

  // Placeholder kısa tutuluyor (sahip bulgusu 2026-08-11): web'in "{ad} kullanıcısına mesaj yaz"
  // metni dar ekranda iki satıra sarıyor, boş kutu iki satır yükseliyor ve sağdaki emoji ikonu
  // (son satıra yaslı, bilinçli) havada asılı duruyor. Ad zaten başlıkta yazıyor; kutuda tekrar
  // etmesi bilgi katmıyor. Uzun kullanıcı adlarında da sarmaz — ad hiç girmiyor.
  const placeholder = t('mobile.message.placeholder');

  // §3.1 — başlıktaki telefon düğmesi: kimse yoksa BAŞLATIR (davet + katıl), biri varsa KATILIR
  // (davet gönderilmez — §3.1 "tekrar çaldırmak spam olur"), biz zaten bağlıysak arama ekranına döner.
  //
  // 🔴 M4b sözleşme §0 tuzağı DÜZELTİLDİ — bu fonksiyon ÖNCEDEN ayrım yapmadan `startOrJoin(channelId,
  // title)` çağırıyordu (varsayılan `kind:'dm'`). Düğme grup DM'de açılınca bu yol `voice:call_invite`
  // gönderiyor, sunucu grup kanalında bunu `NOT_DM` ile reddediyor ve kullanıcı sebepsiz "Şu anda
  // ulaşılamıyor" görüyordu — grup DM kendi sinyalini (`voice:group_call_start`) kullanmak zorunda.
  // `isGroupDm` burada yalnız `kind` seçiyor; DM dalı (`isGroupDm===false`) `options` vermeden ÖNCEKİYLE
  // BİREBİR AYNI çağrıyı yapıyor (regresyon yasak — bkz. `stores/voice.ts` DM/guild dalları değişmedi).
  //
  // M4d §2 — telefon VE kamera düğmesi bu ortak akışı paylaşır (`startWithCamera` tek fark); ikisini
  // ayrı kopyalamak yerine tek yerde tutuluyor (Rule of Three'yi beklemeye gerek yok, tek satır farkla
  // birebir aynı gövdeyi ikinci kez yazmak olurdu).
  async function startCall(startWithCamera: boolean) {
    if (isConnectedHere) {
      router.push({ pathname: '/call', params: { channelId } });
      return;
    }
    if (callBusy) return;
    setCallBusy(true);
    const res = await useVoiceStore
      .getState()
      .startOrJoin(channelId, title, isGroupDm ? { kind: 'group' } : startWithCamera ? { startWithCamera: true } : undefined);
    setCallBusy(false);
    if (res.ok) {
      router.push({ pathname: '/call', params: { channelId } });
      return;
    }
    if (res.reason === 'mic_denied') {
      Alert.alert(res.message ?? t('common.error'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('mobile.call.micPermissionSettings'), onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    if (res.message) Alert.alert(res.message);
  }

  function handleCallPress() {
    void startCall(false);
  }

  // M4d §2 — DM başlığındaki "görüntülü ara" düğmesi (`startWithCamera`): yalnız 1-1 DM'de VE henüz
  // bağlanmamışken çizilir (aşağıdaki JSX) — web pariteti (`DmConversation.vue` video düğmesi de
  // `!isConnectedTo` şartıyla kayboluyor; bağlıyken kamera kontrolü artık `/call` ekranının işi).
  function handleVideoCallPress() {
    void startCall(true);
  }

  /**
   * Başlığa dokunuş → **DM detay ekranı** (M3b §2.1). Eskiden 1-1'de profil kartı, grupta doğrudan
   * üye listesi ekranı açılıyordu; ikisi de kalktı. Profil artık mesaj yazarına dokununca açılıyor
   * (§3.1), grup üye listesi de detay ekranının bir sekmesi (§2.3.1).
   */
  function onTitlePress() {
    router.push({ pathname: '/dm-details', params: { id: channelId } });
  }

  return (
    <>
      <Stack.Screen
        options={{
          // Sprint M2a §4.4 — kanal ekranıyla aynı: native geri ok gizlenir, `ChatBackButton`
          // toplam ping rozetini taşır. 1-1 DM ve grup DM'nin ikisi de bu ekrandan açılıyor
          // (`kind` param'ı), rozet ikisinde de aynı.
          headerBackVisible: false,
          headerLeft: () => <ChatBackButton />,
          headerTitle: () => (
            <Pressable onPress={onTitlePress} style={styles.headerTitle}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
              ) : (
                <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
                  <Text style={styles.headerAvatarText}>{title.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {title}
                </Text>
                {presenceColor && (
                  <Text
                    style={[
                      styles.headerPresence,
                      // C31c: oyun yazısı normal yazı rengi (yeşil yalnız çevrimiçi göstergesi).
                      {
                        color:
                          otherGame && otherStatus !== 'offline'
                            ? theme.colors.textSecondary
                            : presenceColor,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {otherGame && otherStatus !== 'offline'
                      ? t('activity.playing', { game: otherGame })
                      : t(`presence.${otherStatus}`)}
                  </Text>
                )}
              </View>
            </Pressable>
          ),
        }}
      />
      <MessageScreen
        channelId={params.id}
        placeholder={placeholder}
        // Sprint M2d §3.2 — bahsetme kaynağı: 1-1 DM'de karşı taraf, grup DM'de grup üyeleri.
        // Ekstra istek YOK, ikisi de zaten elde. `@everyone` verilmez (guild yok).
        mentionCandidates={mentionCandidates}
        jumpToMessageId={params.jumpTo}
        markRead={dmApi.markRead}
        receiptFor={receiptFor}
        // M6a §2 — 1-1 DM'de avatar/ad yok (karşıdaki tek kişi belli); grup DM'de var.
        showIdentity={isGroupDm}
        typingMode="simple"
        disabledNotice={disabledNotice}
        // M4a-1 sözleşme §3.1/§4 — telefon düğmesi + "sesli arama sürüyor" şeridi. M4b'den beri
        // 1-1 DM VE grup DM'de (`voiceEligible`, §4: "Grup DM'de de görünür"/"OngoingCallBanner
        // grup DM'de de kullanılır, yeni bileşen yazılmaz") — M4a'nın "yalnız 1-1" sınırı bu
        // sprintte kalktı. Başlığın sağ üstü buraya ayrılmıştı (yukarıdaki yorum), tek kapı bu.
        headerActions={
          voiceEligible ? (
            <>
              <Pressable
                onPress={handleCallPress}
                disabled={callBusy}
                // D37 dersi: 20px ikon + hitSlop yalnız yeterince büyükse ≥44dp dokunma hedefine
                // ulaşır (20 + 2×12 = 44). Kardeş ikonlar (sabitleme/arama) 10 kullanıyor — onlara
                // dokunmuyorum (kapsam dışı), yeni düğmemi göz kararıyla bırakmıyorum.
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.call.startAction')}
              >
                {/* Grup DM'de hoparlör, 1-1'de telefon (sahip isteği 2026-08-08): grup sesli bir
                    ÇAĞRI değil, girilen bir oda — Discord mobil ve bizim web'imiz de öyle ayırıyor. */}
                <Ionicons
                  name={isDm ? 'call' : 'volume-medium-outline'}
                  size={isDm ? 20 : 22}
                  color={theme.colors.textSecondary}
                />
              </Pressable>
              {/* M4d §1/§2 — görüntülü ara: yalnız 1-1 DM'de VE henüz bağlı değilken (web
                  `DmConversation.vue` pariteti — bağlıyken kamera kontrolü `/call` ekranının işi,
                  telefon ikonu zaten oraya döndürüyor). Grup DM'de yok (§1 kapsamı — M4e). */}
              {isDm && !isConnectedHere && (
                <Pressable
                  onPress={handleVideoCallPress}
                  disabled={callBusy}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.call.startVideoAction')}
                >
                  <Ionicons name="videocam-outline" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              )}
            </>
          ) : undefined
        }
        topBanner={
          voiceEligible ? (
            <OngoingCallBanner
              participants={isConnectedHere ? [] : presenceParticipants}
              joining={callBusy}
              onJoin={handleCallPress}
            />
          ) : undefined
        }
        // 1-1 DM'de arama YOK (sahip kararı 2026-08-01); grup DM'de kalıyor — orada birden çok
        // kişi ve daha uzun geçmiş var, aramanın işi görülüyor. Web'de de aynı ayrım yapıldı.
        searchable={!isDm}
        // 🔴 DM ve grup DM'de sabitleme **her üyeye açık** — sunucu `requirePinAccess` bu iki
        // kanal türünde ek kontrol yapmıyor, üyelik yeterli. Ortam kanalındaki `MANAGE_MESSAGES`
        // şartı buraya taşınmaz; olmayan bir kapıyı istemcide kurmak da gevşetmek kadar yanlış.
        canPin
        onOpenPins={() =>
          router.push({
            pathname: '/pins',
            params: { channelId: params.id, name: title, origin: 'dm' },
          })
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  headerAvatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  headerName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
  // Ad + durum dikey; `flexShrink` olmadan uzun ad geri okunu ve sağdaki arama düğmelerini iterdi.
  headerTextWrap: {
    flexShrink: 1,
  },
  headerPresence: {
    fontSize: theme.fontSize.xs,
    marginTop: 1,
  },
  clearErrorBar: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  clearErrorText: {
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
  },
});
