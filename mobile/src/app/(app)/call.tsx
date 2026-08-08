import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVoiceStore } from '@/stores/voice';
import { useDmStore } from '@/stores/dm';
import { useAuthStore } from '@/stores/auth';
import { dmRouteParams } from '@/utils/dmRoute';
import { ParticipantTile } from '@/components/call/ParticipantTile';
import { CallControls } from '@/components/call/CallControls';
import { OutputPickerSheet } from '@/components/call/OutputPickerSheet';
import { EmergencyButton } from '@/components/call/EmergencyButton';
import { CameraNudgeModal, shouldShowCameraNudge, markCameraNudgeShown } from '@/components/call/CameraNudgeModal';
import { t } from '@/i18n';
import { theme } from '@/theme';

const CONTROLS_HIDE_MS = 5000;

/**
 * M4a-1 sözleşme §4 — arama ekranı, tam ekran modal. Bu ekran bağlantıyı BAŞLATMAZ: DM ekranı
 * (`dm/[id].tsx` `handleCallPress`) zaten `voiceStore.startOrJoin` ile bağlanıp buraya
 * yönlendiriyor, ya da mini pencereden geri dönülüyor (§7). Burası yalnız var olan bağlantıyı çizer.
 *
 * M4c sözleşme §5 — guild araması (`kind: 'guild'`) N katılımcılı ızgaraya açar; DM dalı
 * (iki-kutucuk, "Çalıyor…", peer adı) SATIR SATIR aynı kaldı — yeni dal DM koşullarının YANINA
 * eklendi, İÇİNE değil (M4a cihazda doğrulandı, regresyon yasak).
 *
 * 🔴 PM takibi (2026-08-07, sahip cihaz bulgusu) — arama türü/başlık bilgisi ARTIK ROUTE
 * PARAMETRESİNDEN OKUNMUYOR. `/call`a birden fazla giriş yolu var (`home.tsx`, `dm/[id].tsx`,
 * bildirim kabulü, `MiniCallWindow` yeniden açma) ve biri (`MiniCallWindow`) `kind` taşımıyordu —
 * ekran sessizce DM moduna düşüyordu (yanlış metin + hayalet ikinci kutucuk + geri gelen sohbet
 * düğmesi). Otorite artık `stores/voice.ts` (`callKind`/`callChannelName`/`callGuildName`,
 * `startOrJoin` yazıyor) — `/call` HANGİ YOLDAN açılırsa açılsın aynı gerçeği okur.
 */
export default function CallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ channelId: string }>();
  const channelId = params.channelId;
  const insets = useSafeAreaInsets();

  const connectedChannelId = useVoiceStore((s) => s.connectedChannelId);
  const connectedAt = useVoiceStore((s) => s.connectedAt);
  const roomParticipants = useVoiceStore((s) => s.roomParticipants);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);
  const mutedUserIds = useVoiceStore((s) => s.mutedUserIds);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const canPublish = useVoiceStore((s) => s.canPublish);
  const didInvite = useVoiceStore((s) => s.didInvite);
  const isLeaving = useVoiceStore((s) => s.isLeaving);
  // M4f §3.3 — sunucu kaynaklı kamera kesilmesi bildirimi (`stores/voice.ts` `wireRoom` yazıyor,
  // `disconnectReason` ile AYNI desen: bir kez set edilir, aşağıdaki effect Alert ile gösterip temizler).
  const cameraStoppedNotice = useVoiceStore((s) => s.cameraStoppedNotice);
  const callKind = useVoiceStore((s) => s.callKind);
  const callChannelName = useVoiceStore((s) => s.callChannelName);
  const callGuildName = useVoiceStore((s) => s.callGuildName);
  // Sprint M4t §3 — acil akış sürerken otomatik `router.back()` ERTELENİR (bkz. aşağıdaki
  // `goneRef` effect'i + `stores/voice.ts` `emergencyPending` yorumu).
  const emergencyPending = useVoiceStore((s) => s.emergencyPending);
  // M4d §1/§7 → M4e §1/§4 → M4f §2 🔴 — kamera artık üç arama türünde de aynı kapıdan geçiyor:
  // `callKind` bazlı ayrı bir kapı YOK, tek kapı `canPublishCamera` (sunucu kararı,
  // `resolveVideoSources`). Guild daha önce burada bilinçli dışarıda tutuluyordu (masaüstü
  // kamerası C4/C7'den zaten çalışıyordu ama istemci tarafı yazılmamıştı) — bu sprint kapıyı açtı.
  const isGroupCall = callKind === 'group';
  const canPublishCamera = useVoiceStore((s) => s.canPublishCamera);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const cameraFacing = useVoiceStore((s) => s.cameraFacing);
  const localCameraPublication = useVoiceStore((s) => s.localCameraPublication);
  // M4e §2 🔴 — userId anahtarlı çoğul map (tek kaynak). DM dalı da BURADAN türetir (aşağıda
  // `peerCameraPublication`), paralel bir tek-slot state TUTULMAZ.
  const remoteCameraPublications = useVoiceStore((s) => s.remoteCameraPublications);
  const isGuildCall = callKind === 'guild';
  // 🔴 M4b sözleşme §4 — bu dosya sözleşmenin §1 dosya tablosunda YOK, ama DoD §10 "İkinci kişi
  // katılınca ızgarada iki kutucuk" maddesi N-katılımcılı grid'i zorunlu kılıyor: DM dalının
  // sabit iki-kutucuk düzeni (aşağıdaki `else` bloğu) 3+ kişilik bir grup DM'de eksik kutucuk
  // üretirdi. `isGridCall` DM DIŞINDAKİ ikisini (guild + group) aynı ızgaraya yönlendirir — guild
  // ızgarası zaten N-katılımcılı, yeni bir düzen İCAT EDİLMEDİ, seçim koşulu genişletildi. PM'e
  // rapor edildi (bkz. dev raporu) — dosya listesi güncellenmeli.
  const isGridCall = callKind !== 'dm';

  const channel = useDmStore((s) => s.channels.find((c) => c.id === channelId));
  const myUser = useAuthStore((s) => s.user);

  const [outputSheetOpen, setOutputSheetOpen] = useState(false);
  // Sprint M4t §2 — kamera nudge modalı görünürlüğü (kapı/hatırlama `CameraNudgeModal.tsx`te).
  const [cameraNudgeVisible, setCameraNudgeVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bu ekran BU channelId'ye bağlıyken bir kez true olur; sonra `connectedChannelId` boşalırsa
  // (kopma/reddedilme/zaman aşımı/kullanıcı kapat) "gerçek bir ayrılış" olduğunu ayırt eder —
  // ekran channelId hâlâ bağlanmamışken (olmayan bir sekmeye deep-link gibi) sessizce geri döner.
  const wasConnectedRef = useRef(false);
  // Ayrılış anında çizimi dondurmak için son iyi bilinen görünüm verisi (bkz. aşağıdaki `shown`).
  // M4d §3 — kamera alanları da BURAYA eklendi: `leave()` bunları da sıfırlıyor, dondurulmazsa
  // kapanma animasyonu sürerken tile avatara dönüp native `VideoTrack` view'ı söker — üst yorumdaki
  // Fabric crash sınıfıyla aynı risk (native view churn, tam olarak `isLeaving` donmasının önlediği şey).
  const frozenRef = useRef<{
    participants: typeof roomParticipants;
    canPublish: boolean;
    isCameraOn: boolean;
    cameraFacing: typeof cameraFacing;
    localCameraPublication: typeof localCameraPublication;
    remoteCameraPublications: typeof remoteCameraPublications;
  }>({
    participants: [],
    canPublish: false,
    isCameraOn: false,
    cameraFacing: 'user',
    localCameraPublication: null,
    remoteCameraPublications: {},
  });

  function resetHideTimer() {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // §7 (mini pencere flaşı) — bu ekran gerçekten mount olduğunda "geçiş bekleniyor" bayrağı iner;
  // `MiniCallWindow` o ana kadar (kısa asenkron gezinme penceresi) kendini gizli tutuyordu.
  useEffect(() => {
    useVoiceStore.getState().clearPendingCallScreen();
  }, []);

  // M4d §2 — DM başlığından "görüntülü ara" ile geldiysek (`pendingCameraStart`, `startOrJoin`
  // bağlantı kurulunca yazdı), kamerayı BURADA aç: çalışma-anı izni gerektiği için `toggleCamera`in
  // AYNISI çağrılıyor (web `pendingCameraStart` pariteti + mobilin izin katmanı). Reddedilirse arama
  // DÜŞMEZ — yalnız "Ayarları Aç" gösterilir, mikrofondaki `mic_denied` ile birebir aynı desen.
  useEffect(() => {
    const store = useVoiceStore.getState();
    if (!store.pendingCameraStart) return;
    store.clearPendingCameraStart();
    void (async () => {
      const res = await store.toggleCamera();
      if (!res.ok && res.reason === 'camera_denied') {
        Alert.alert(res.message ?? t('common.error'), undefined, [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('mobile.call.micPermissionSettings'), onPress: () => Linking.openSettings() },
        ]);
      }
    })();
  }, []);

  // M4f §3.3 🔴 — bu sprintin T&S ayağı: sunucu ortam kanalında yayını kestiğinde (R11
  // yayın-durdur) kullanıcı SESSİZ kalmaz. `disconnectReason`ın alt bar/üst bar kapanma
  // gerekçesiyle aynı deseni: store bir kez set eder, bu effect Alert ile gösterip temizler.
  // Arama BİTMİYOR (yalnız kamera düşüyor) — bu yüzden `isLeaving`/`router.back()` effect'inden
  // AYRI, kendi effect'i var. Metin GEREKÇE söylemez (bkz. i18n `mobile.call.cameraStopped`).
  useEffect(() => {
    if (!cameraStoppedNotice) return;
    useVoiceStore.getState().clearCameraStoppedNotice();
    Alert.alert(cameraStoppedNotice);
  }, [cameraStoppedNotice]);

  useEffect(() => {
    if (connectedChannelId === channelId) wasConnectedRef.current = true;
  }, [connectedChannelId, channelId]);

  // §3.3 🔴 — her ayrılışta (kullanıcı kapattı · reddedildi · zaman aşımı · kopma · bildirimden
  // "Bağlantıyı Kes") ekran yığından çıkar, sebep varsa Türkçe bilgi verilir.
  //
  // Tetikleyici `isLeaving`, `connectedChannelId === null` DEĞİL: ayrılış BAŞLADIĞI anda çıkılmalı.
  // Durumun boşalmasını beklersek ekran, kapanma animasyonunun ortasında bambaşka bir ağaçla
  // (kutucuklar gitmiş, "tek başınasın" gelmiş) yeniden çiziliyor ve Fabric o anda sökülmekte olan
  // yüzeye görünüm eklemeye çalışıp `addViewAt: The specified child already has a parent` ile
  // patlıyordu (beyaz ekran). `connectedChannelId` dalı yalnız YEDEK: ekran, durum çoktan
  // temizlenmişken açık kalmışsa yine de kapanır.
  const goneRef = useRef(false);
  useEffect(() => {
    if (goneRef.current || !wasConnectedRef.current) return;
    if (!isLeaving && connectedChannelId !== null) return;
    // Sprint M4t §3 🔴 — acil akış sürüyorsa (`EmergencyButton` onaylandı, sunucu bizi henüz
    // çekmiş/çekmemiş olabilir) navigasyon ERTELENİR: ekran mount'lu kalır ki geri bildirim modalı
    // unmount olmadan gösterilebilsin. `emergencyPending` false'a dönünce (kullanıcı feedback'i
    // kapattı) bu effect TEKRAR çalışır ve normal akışa (aşağısı) devam eder.
    if (emergencyPending) return;
    goneRef.current = true;
    // Kontrolleri gizleme sayacı da susturulur: kapanma sırasında tetiklenirse üst bar ve alt çubuk
    // sökülmekte olan yüzeyde unmount olur — dondurma ile aynı gerekçe.
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const reason = useVoiceStore.getState().disconnectReason;
    useVoiceStore.getState().clearDisconnectReason();
    router.back();
    // Uyarı sökülme sırasında değil, bir sonraki tick'te ve DM ekranının üstünde açılır.
    if (reason) setTimeout(() => Alert.alert(reason), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeaving, connectedChannelId, emergencyPending]);

  // Süre sayacı — `connectedAt`ten itibaren mm:ss (web `connectedAt` pariteti).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!connectedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [connectedAt]);
  const duration = useMemo(() => {
    if (!connectedAt) return '00:00';
    const totalSec = Math.max(0, Math.floor((now - connectedAt) / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [connectedAt, now]);

  if (!channelId) return null;

  // 🔴 Ayrılış başladıysa görünüm DONDURULUR. Kapanma animasyonu sürerken `leave()` durumu
  // boşaltıyor; donmasaydı kutucuklar/uyarı satırları sökülmekte olan yüzeyde mount-unmount olur ve
  // beyaz ekranı üreten Fabric hatası tekrar tetiklenebilirdi. Kullanıcı zaten ekranı görmüyor.
  if (!isLeaving) {
    frozenRef.current = {
      participants: roomParticipants,
      canPublish,
      isCameraOn,
      cameraFacing,
      localCameraPublication,
      remoteCameraPublications,
    };
  }
  const shown = isLeaving
    ? frozenRef.current
    : { participants: roomParticipants, canPublish, isCameraOn, cameraFacing, localCameraPublication, remoteCameraPublications };

  const localMember = shown.participants.find((p) => p.isLocal);
  const peerMember = shown.participants.find((p) => !p.isLocal);
  const peerFallback = channel?.type === 'DM' ? channel.otherUser : null;
  const peerName = peerMember?.username ?? peerFallback?.username ?? '';
  const peerAvatar = peerMember?.avatarUrl ?? peerFallback?.avatarUrl ?? null;
  const alone = shown.participants.length <= 1;
  // M4d §3-R 🔴 — düzen kamera durumundan TÜRETİLİR, ayrı bir state TUTULMAZ. Uzak tarafın "kamerası
  // açık" bilgisinin tek kaynağı, karşı tarafın map'teki kaydının gerçek bir track taşıması (niyet
  // değil, gözlemlenen yayın — DM'de zaten başka bir sinyalimiz yok). Yalnız `isGridCall===false`
  // (DM) dalında okunur; grup kendi hesabını aşağıda (`anyGroupCameraOn`) ayrı tutar.
  //
  // M4e §2 🔴 — `peerMember` henüz `roomParticipants`e düşmeden (katılma anındaki kısa pencere)
  // `peerCameraPublication` `undefined` olabilir; `?? null` ile `TrackPublication | null` sözleşmesi
  // korunur (`ParticipantTile`in `videoPublication` prop'u `null`i bekliyor, `undefined`i değil).
  const peerCameraPublication = peerMember ? (shown.remoteCameraPublications[peerMember.userId] ?? null) : null;
  const anyCameraOn = shown.isCameraOn || !!peerCameraPublication?.track;
  // M4e §3.1 → M4f §2 🔴 — "en az bir kamera açıkken ızgara" hesabı artık guild'i de kapsıyor.
  // Yeni bir hesap YAZILMADI, kısıt genişletildi (sözleşme §2: "`isGroupCall &&` kısıtı genişletilir").
  // Kimsenin kamerası açık değilken guild görünümü bugünkü tek-sütun alt alta listeyle AYNEN kalır —
  // bu ifade yalnız `false`tan `true`ya döndüğünde (biri kamera açtığında) ızgaraya geçişi tetikler.
  const anyGroupCameraOn =
    (isGroupCall || isGuildCall) &&
    (shown.isCameraOn || Object.values(shown.remoteCameraPublications).some((p) => !!p?.track));
  // Grup DM'de tek "karşı taraf" yok (N kişi) — başlık `peerName`e (ilk katılan kim ise o) değil,
  // grubun adına bağlanır (`stores/voice.ts` `startOrJoin` `kind==='group'`de `callChannelName`'i
  // guild gibi dolduruyor). DM dalında bu ifade `peerName`e eşit kalır — davranış DEĞİŞMEDİ.
  const nonGuildTitle = callKind === 'group' ? (callChannelName ?? peerName) : peerName;

  // M4z §E — grup DM'de HENÜZ KATILMAMIŞ üyeler de soluk kart olarak çizilir ("kimi bekliyorum").
  // 🔴 Yalnız `kind === 'group'`: bu ekranda guild ile aynı ızgara dalı paylaşılıyor ama guild'de
  // "üye" = sunucudaki herkes demek olurdu (§E.1) — guild dalında liste HER ZAMAN boş kalır.
  // Kaynak DM store'daki kanal kaydının `members` dizisi; yeni uç çağrılmaz.
  // 🔴 Sıra kararlı: ada göre (TR), eşitlikte id'ye göre — biri katılınca kalan kartlar zıplamaz.
  // Odadakiler her zaman önce çizilir, bekleyenler listenin SONUNA eklenir.
  const inRoomIds = new Set(shown.participants.map((p) => p.userId));
  const pendingMembers =
    callKind === 'group' && channel?.type === 'GROUP_DM'
      ? channel.members
          .filter((m) => m.id !== myUser?.id && !inRoomIds.has(m.id))
          .sort((a, b) => a.username.localeCompare(b.username, 'tr') || a.id.localeCompare(b.id))
      : [];

  // 🔴 PM incelemesi (2026-08-06) — burada ÖNCEDEN `leave(true)` + `router.back()` art arda
  // çağrılıyordu. `leave()` içindeki await'ler (room.disconnect, AudioSession.stopAudioSession)
  // yüzünden `connectedChannelId` cihazın hızına göre GEÇ null olabiliyordu; eğer bu ekran hâlâ
  // mount'luyken null olursa aşağıdaki `connectedChannelId` effect'i de `router.back()` çağırıyor —
  // iki pop art arda, kullanıcı DM yerine ana ekrana düşüyor. Zamanlamaya bağlı, cihazda ara sıra
  // olur, tekrar üretilemez türden bir kusur. Tek çıkış yolu: burası yalnız `leave()`i tetikler,
  // gezinme SADECE effect'in işi (`disconnectReason` kullanıcı-başlatılmış ayrılışta null olduğu
  // için Alert de göstermez — sessizce geri döner).
  function handleHangUp() {
    void useVoiceStore.getState().leave(true);
  }

  // PM takibi (2026-08-07) — guild aramasında bu fonksiyon HİÇ ÇAĞRILMAZ: `CallControls`'a
  // `onOpenChat` artık `isGuildCall` iken `undefined` geçiliyor (düğme çizilmiyor — `CallControls.tsx`
  // §1 dışıydı ama "guild ses kanalının metin akışı yok" gerçek nedeni orada bir prop eklemeyi
  // gerektirdi, minimize'la aynı işi yapıp yanlış etiket taşıyan düğme yerine). DM dalı DEĞİŞMEDİ.
  function handleOpenChat() {
    router.push(channel ? dmRouteParams(channel) : { pathname: '/dm/[id]', params: { id: channelId } });
  }

  // M4d §2/§7 — desen mikrofonun izin reddi ile birebir aynı (`dm/[id].tsx` `handleCallPress`):
  // reddedilirse arama düşmez, yalnız "Ayarları Aç" gösterilir. M4e §4 → M4f §2 🔴 — artık üç arama
  // türünde de `CallControls`'a geçiliyor (aşağıda); görünürlük orada `canPublishCamera`ya bağlı.
  // Sprint M4t §2 — asıl kamera açma işlemi (nudge onaylandıktan/gerekmediğinde çağrılır).
  function openCamera() {
    void (async () => {
      const res = await useVoiceStore.getState().toggleCamera();
      if (!res.ok && res.reason === 'camera_denied') {
        Alert.alert(res.message ?? t('common.error'), undefined, [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('mobile.call.micPermissionSettings'), onPress: () => Linking.openSettings() },
        ]);
      }
    })();
  }

  function handleToggleCamera() {
    resetHideTimer();
    const store = useVoiceStore.getState();
    // Sprint M4t §2.3 — yalnız AÇARKEN (kapatırken nudge anlamsız) ve kanal daha önce görmediyse
    // modal kamera açılmadan ÖNCE çıkar; onaylarsa `openCamera` (aşağıdaki modal `onConfirm`)
    // çağrılır, vazgeçerse hiçbir şey olmaz (kamera kapalı kalır, arama sürer).
    if (!store.isCameraOn && shouldShowCameraNudge(store.isGeneralVoiceChannel, connectedChannelId)) {
      setCameraNudgeVisible(true);
      return;
    }
    openCamera();
  }

  function handleSwitchCamera() {
    resetHideTimer();
    void useVoiceStore.getState().switchCamera();
  }

  return (
    <Pressable style={styles.flex} onPress={resetHideTimer}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        // §4 — "bgContent üzerine ince Kor tonlu gradyan": `accentSubtle` (rgba Kor, %12 opaklık)
        // orta durakta — yeni bir renk uydurulmadı, ikisi de mevcut token.
        colors={[theme.colors.bgContent, theme.colors.accentSubtle, theme.colors.bgContent]}
        style={StyleSheet.absoluteFill}
      />

      {/*
        PM takibi (2026-08-07, sahip cihaz bulgusu) — bu blok ÖNCEDEN `controlsVisible &&` ile
        koşullu render ediliyordu; gizlenince alan düzenden TAMAMEN çıkıyor, ortadaki katılımcı
        kartı yukarı sıçrayıp altta boşluk kalıyordu. Blok artık HER ZAMAN mount'lu — yalnız
        `opacity`/`pointerEvents` değişiyor, alan (yükseklik + `paddingTop`) korunuyor.
      */}
      <View
        style={[styles.topBar, { paddingTop: insets.top + 8 }, !controlsVisible && styles.controlsHidden]}
        pointerEvents={controlsVisible ? 'auto' : 'none'}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          // "common.close" değil — bu düğme kapatmıyor, küçültüyor (§7); ekran görsel 11'deki
          // aynı düğmeye karşılık geliyor. Hang-up etiketiyle aynı incelemede fark edildi.
          accessibilityLabel={t('mobile.call.minimize')}
        >
          <Ionicons name="chevron-down" size={26} color={theme.colors.textPrimary} />
        </Pressable>
        {/* §5 — başlık kanal adı + ortam adı (guild) / karşı taraf adı (DM, tıklanınca sohbet açar). */}
        {isGuildCall ? (
          <View style={styles.topBarCenter}>
            <Text style={styles.peerName} numberOfLines={1}>
              {callChannelName ?? ''}
            </Text>
            <Text style={styles.duration} numberOfLines={1}>
              {(callGuildName ?? '') + ' · ' + duration}
            </Text>
          </View>
        ) : (
          // DM VE grup DM ortak dal — grup DM'de `handleOpenChat` yine dolu (sohbet düğmesi §4'te
          // "grup DM'de görünür" dediği için chat açma burada da doğru), yalnız gösterilen ad
          // `nonGuildTitle` üzerinden (DM'de `peerName`e eşit, davranış DEĞİŞMEDİ).
          <Pressable onPress={handleOpenChat} style={styles.topBarCenter} accessibilityRole="button">
            <Text style={styles.peerName} numberOfLines={1}>
              {nonGuildTitle}
            </Text>
            <Text style={styles.duration}>{duration}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            resetHideTimer();
            setOutputSheetOpen(true);
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.call.outputTitle')}
        >
          <Ionicons name="volume-high-outline" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {/*
        Sprint M4t §3.3 🔴 — acil buton OTOMATİK GİZLENMEYE TABİ DEĞİL: yukarıdaki `topBar`
        `controlsHidden` (opacity 0) aldığında RN opaklığı alt ağaca da uygular, bu yüzden buton
        o View'ın İÇİNE konsa fade'den kaçamazdı. Ayrı, hiçbir zaman soluklaşmayan bir satırda
        (aynı üst-bar bölgesinde, hemen altında) duruyor — panik anındaki kullanıcı "ekrana dokun,
        kontroller gelsin" adımını yapmadan basabiliyor.
      */}
      <View style={styles.emergencyRow} pointerEvents="box-none">
        <EmergencyButton />
      </View>

      {isGridCall ? (
        anyGroupCameraOn ? (
          // M4e §3.1/§3.2 → M4f §2 🔴 — grup DM VE guild'de EN AZ BİR kamera açıkken iki sütunlu
          // ızgara (bakılan şey video aramasında yüz; tek-sütun tam-genişlik kartlar ekranda iki kişi
          // gösterip gerisini kaydırmaya iterdi). `ParticipantTile` yine 'card' varyantı (yeni varyant
          // eklenmedi, video geldiğinde kendi içinde dikey dikdörtgene döner — bkz. bileşen). Kendi
          // kutucuğun ızgaranın bir elemanı: 1-1'deki köşe önizlemesi burada YOK (§3.2).
          <View style={styles.tiles}>
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
            >
              {shown.participants.map((p) => (
                <View key={p.userId} style={styles.gridItem}>
                  <ParticipantTile
                    name={p.username}
                    avatarUrl={p.avatarUrl}
                    speaking={speakingUserIds.has(p.userId)}
                    micOff={p.isLocal ? isMuted : mutedUserIds.has(p.userId)}
                    videoPublication={p.isLocal ? shown.localCameraPublication : (shown.remoteCameraPublications[p.userId] ?? null)}
                    mirror={p.isLocal && shown.cameraFacing === 'user'}
                  />
                </View>
              ))}
              {pendingMembers.map((m) => (
                <View key={`pending:${m.id}`} style={styles.gridItem}>
                  <ParticipantTile name={m.username} avatarUrl={m.avatarUrl} speaking={false} micOff={false} dimmed />
                </View>
              ))}
            </ScrollView>
            {alone && pendingMembers.length === 0 && (
              <View style={styles.aloneNotice}>
                <Text style={styles.aloneTitle}>{t('mobile.voice.guildAloneTitle')}</Text>
                <Text style={styles.aloneSubtitle}>{t('mobile.voice.guildAloneSubtitle')}</Text>
              </View>
            )}
            {!shown.canPublish && <Text style={styles.listenerNotice}>{t('voice.listenerOnly')}</Text>}
          </View>
        ) : (
          // §14.2 — N katılımcı **tek sütun, tam genişlik, ALT ALTA**. M4c bunu ızgaraya açmıştı;
          // sahip cihazda gördü ve geri aldı: dar ekranda yan yana sıkışan kutucuklar sesli aramada
          // bakılan tek şeyi (kim konuşuyor) zorlaştırıyor, Discord da sesli aramada tam genişlik
          // kartları alt alta diziyor. Izgara ölü kod olarak BIRAKILMADI (§14.2: video sprintinde
          // yeniden yazılacak, o zaman kutucuk zaten farklı olacak).
          //
          // `ParticipantTile` AYNEN duruyor — konuşan kenarlığı, mikrofon-kapalı rozeti, avatar/ad
          // düzeni değişmedi, yalnız YERLEŞİM değişti. Sıra da değişmedi: `shown.participants`
          // (yerel + LiveKit `remoteParticipants` Map iterasyonu = katılma sırası; `Map` insert
          // sırasını korur, mute/konuşma değişince yeniden sıralanmaz) — ayrıca sort gerekmez.
          //
          // 🔴 M4b — bu dal `isGridCall` (`kind!=='dm'`) ile guild VE group tarafından paylaşılıyor.
          // M4e 🔴 — grup DM'de KİMSENİN kamerası açık değilken de bu dal çizilir (`anyGroupCameraOn`
          // false), sözleşme §3.1'in "sesli grup araması hiç değişmemeli" şartı budur.
          // "Tek başınasın" metni guild'inkiyle PAYLAŞILIYOR (yeni metin eklenmedi): DM'in
          // `aloneSubtitle`i `{name}` (tek kişi) parametreli, N kişilik bir gruba uymuyordu;
          // `guildAloneSubtitle` ("Arkadaşların katıldığında burada görünecekler") kişi adı
          // gerektirmeden hem guild hem grup DM için doğru okunuyor.
          <View style={styles.tiles}>
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            >
              {shown.participants.map((p) => (
                <ParticipantTile
                  key={p.userId}
                  name={p.username}
                  avatarUrl={p.avatarUrl}
                  speaking={speakingUserIds.has(p.userId)}
                  micOff={p.isLocal ? isMuted : mutedUserIds.has(p.userId)}
                />
              ))}
              {/* M4z §E — bekleyen üyeler: aynı kutucuk, yalnız `dimmed`. Mikrofon/konuşma
                  göstergesi YOK (o bilgi yok), `ringing` de YOK — grupta kimin telefonunun
                  çaldığını bilmiyoruz (1-1 dalındaki "Çalıyor…" olduğu gibi duruyor). */}
              {pendingMembers.map((m) => (
                <ParticipantTile
                  key={`pending:${m.id}`}
                  name={m.username}
                  avatarUrl={m.avatarUrl}
                  speaking={false}
                  micOff={false}
                  dimmed
                />
              ))}
            </ScrollView>
            {/* §E — "Arkadaşların katıldığında burada görünecekler" artık YALNIZ gerçekten boş
                ekranda gösterilir. Bekleyen kartlar çizildiğinde o cümle kendi kendini yalanlıyordu:
                üyeler zaten görünüyor. Ortam kanalında `pendingMembers` her zaman boş olduğu için
                oradaki davranış değişmiyor. */}
            {alone && pendingMembers.length === 0 && (
              <View style={styles.aloneNotice}>
                <Text style={styles.aloneTitle}>{t('mobile.voice.guildAloneTitle')}</Text>
                <Text style={styles.aloneSubtitle}>{t('mobile.voice.guildAloneSubtitle')}</Text>
              </View>
            )}
            {!shown.canPublish && <Text style={styles.listenerNotice}>{t('voice.listenerOnly')}</Text>}
          </View>
        )
      ) : anyCameraOn ? (
        // M4d §3-R 🔴 — kamera açıkken Discord düzeni: tam alan = karşı taraf, sağ üst köşe = sen
        // (yalnız SENİN kameran açıkken çizilir). Düzen `anyCameraOn`dan türetiliyor, ayrı bir state
        // yok — kamera kapanınca bir render sonra aşağıdaki `else` dalına (klasik iki-kutucuk) döner.
        <View style={styles.focusArea}>
          <ParticipantTile
            variant="full"
            name={peerName}
            avatarUrl={peerAvatar}
            speaking={peerMember ? speakingUserIds.has(peerMember.userId) : false}
            micOff={peerMember ? mutedUserIds.has(peerMember.userId) : false}
            ringing={alone && didInvite && callKind === 'dm'}
            videoPublication={peerCameraPublication}
          />
          {shown.isCameraOn && (
            <View style={styles.selfCorner}>
              <ParticipantTile
                variant="corner"
                name={localMember?.username ?? myUser?.username ?? t('voice.you')}
                avatarUrl={localMember?.avatarUrl ?? myUser?.avatarUrl ?? null}
                speaking={localMember ? speakingUserIds.has(localMember.userId) : false}
                micOff={isMuted}
                videoPublication={shown.localCameraPublication}
                mirror={shown.cameraFacing === 'user'}
              />
            </View>
          )}
          {alone && (
            // 🔴 PM incelemesi (2026-08-08) — bu blok ÖNCEDEN `absoluteFill` + ortalanmış bir
            // kaplamaydı ve tam-alan kutusunun ORTALANMIŞ avatar+adıyla üst üste biniyordu. Çakışma
            // en sık yaşanacak anda çıkıyordu: "görüntülü ara"ya bastın, kameran açık, karşı taraf
            // henüz katılmadı. Eski iki-kutucuk düzeninde bu yazı akıştaydı (kutucukların altında);
            // burada da akışa alındı — tam-alan kutusu `flex:1`, yazı altında kendi yüksekliğini alır.
            <View style={styles.focusAloneNotice} pointerEvents="none">
              <Text style={styles.aloneTitle}>{t('mobile.call.aloneTitle')}</Text>
              <Text style={styles.aloneSubtitle}>{t('mobile.call.aloneSubtitle', { name: peerName })}</Text>
            </View>
          )}
          {!shown.canPublish && (
            <Text style={[styles.listenerNotice, styles.focusListenerNotice]}>{t('voice.listenerOnly')}</Text>
          )}
        </View>
      ) : (
        // Sözleşme §3/M4a — kimsenin kamerası açık değilken bugünkü iki-kutucuk düzeni AYNEN
        // (sesli arama regresyonu yasak, §3-R).
        <View style={styles.tiles}>
          <ParticipantTile
            name={localMember?.username ?? myUser?.username ?? t('voice.you')}
            avatarUrl={localMember?.avatarUrl ?? myUser?.avatarUrl ?? null}
            speaking={localMember ? speakingUserIds.has(localMember.userId) : false}
            micOff={isMuted}
          />
          <ParticipantTile
            name={peerName}
            avatarUrl={peerAvatar}
            speaking={peerMember ? speakingUserIds.has(peerMember.userId) : false}
            micOff={peerMember ? mutedUserIds.has(peerMember.userId) : false}
            dimmed={alone}
            /* 🔴 M4z §F — `didInvite` artık grupta da true olabiliyor ("başlatan benim" bilgisi
               iptal için gerekiyordu). "Çalıyor…" göstergesi YALNIZ 1-1'e ait: kapı burada.
               Bu dal zaten `isGridCall === false` (yani `callKind === 'dm'`) iken çiziliyor;
               koşul yine de AÇIKÇA yazılıyor — düzen seçimi ileride değişirse gösterge sessizce
               grupta belirmesin. */
            ringing={alone && didInvite && callKind === 'dm'}
          />
          {alone && (
            <View style={styles.aloneNotice}>
              <Text style={styles.aloneTitle}>{t('mobile.call.aloneTitle')}</Text>
              <Text style={styles.aloneSubtitle}>{t('mobile.call.aloneSubtitle', { name: peerName })}</Text>
            </View>
          )}
          {!shown.canPublish && <Text style={styles.listenerNotice}>{t('voice.listenerOnly')}</Text>}
        </View>
      )}

      {/* Aynı düzen-koruma gerekçesi — bkz. üst bar yorumu. */}
      <View
        style={[styles.controls, { paddingBottom: insets.bottom + 16 }, !controlsVisible && styles.controlsHidden]}
        pointerEvents={controlsVisible ? 'auto' : 'none'}
      >
        <CallControls
          isMuted={isMuted}
          canPublish={shown.canPublish}
          onToggleMute={() => {
            resetHideTimer();
            void useVoiceStore.getState().toggleMute();
          }}
          onOpenChat={isGuildCall ? undefined : handleOpenChat}
          onHangUp={handleHangUp}
          // M4e §4 → M4f §2 → M4i §2 🔴 — kamera düğmesi kapısı `canPublishCamera` (`CallControls`in
          // `showCamera` hesabı bunu VE `onToggleCamera` doluluğunu kontrol ediyor); `isGuildCall`
          // yalnız GÖSTERİMİ ayırır — ortam kanalında izin yokken düğme görünür-kilitli kalır, DM/grup
          // DM'de eskisi gibi hiç çizilmez (T&S: DM'de video kapısı yaş kapısıdır, ifşa riski).
          canPublishCamera={canPublishCamera}
          isGuildCall={isGuildCall}
          isCameraOn={shown.isCameraOn}
          onToggleCamera={handleToggleCamera}
          onSwitchCamera={handleSwitchCamera}
        />
      </View>

      <OutputPickerSheet visible={outputSheetOpen} onClose={() => setOutputSheetOpen(false)} />
      <CameraNudgeModal
        visible={cameraNudgeVisible}
        onConfirm={() => {
          markCameraNudgeShown(connectedChannelId);
          setCameraNudgeVisible(false);
          openCamera();
        }}
        onClose={() => setCameraNudgeVisible(false)}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 8,
  },
  // PM takibi (2026-08-07) — üst bar/alt kontrol HER ZAMAN mount'lu; gizlenince yalnız bu uygulanır.
  // Alan (yükseklik) korunur, kalan içerik (kutucuklar) yerinde kalır — sıçrama/kırpılma yok.
  controlsHidden: {
    opacity: 0,
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  peerName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  duration: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  // Sprint M4t §3.3 — `topBar`in fade'inden BAĞIMSIZ ayrı satır (bkz. render'daki yorum).
  emergencyRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 8,
  },
  tiles: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: theme.layout.panelGap * 2,
  },
  // M4d §3-R — kamera açıkken tam-alan düzen. `tiles`ten farkı: tek büyük kutu (video/avatar
  // uçtan uca), köşe kutusunun mutlak konumlanabilmesi için `position:'relative'`.
  focusArea: {
    flex: 1,
    position: 'relative',
    paddingHorizontal: theme.layout.panelGap,
  },
  selfCorner: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  // "Tek başınasın" bildirimi `tiles` düzeninde akışın bir parçasıydı (kutucukların altında); tam
  // alan düzeninde de akışta kalıyor — kaplama yapılırsa tam-alan kutusunun ortalanmış avatar+adıyla
  // çakışıyor (PM incelemesi 2026-08-08, yukarıdaki yorum).
  // `pointerEvents:'none'` — üst Pressable'ın kontrol çubuğu gizleme/gösterme dokunuşunu YUTMASIN.
  focusAloneNotice: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 32,
    paddingTop: 16,
  },
  focusListenerNotice: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
  },
  // §14.2 — guild/grup katılımcı listesi: tek sütun, tam genişlik, alt alta. `listScroll` `flex:1`
  // ile `tiles`in tüm yüksekliğini kaplar (sınırlı bir yükseklik olmadan `ScrollView` kaydırmaz);
  // içerik azken `justifyContent:'center'` dikeyde ortalar, taşınca (10 kişi de olsa) `flexGrow:1`
  // içerik yüksekliğine bırakır ve kaydırma devreye girer.
  listScroll: {
    flex: 1,
    alignSelf: 'stretch',
  },
  list: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 12,
  },
  // M4e §3.1/§3.2 — grup DM'de en az bir kamera açıkken iki sütunlu ızgara. `list`in aksine dikeyde
  // ortalamaz (kamerayla dolu ekranda üstten akış daha doğal, Discord da öyle) — `flexGrow` yeterli.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 12,
  },
  gridItem: {
    width: '48%',
  },
  aloneNotice: {
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  aloneTitle: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    textAlign: 'center',
  },
  aloneSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  listenerNotice: {
    marginTop: 12,
    color: theme.colors.warning,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  controls: {
    paddingTop: 12,
  },
});
