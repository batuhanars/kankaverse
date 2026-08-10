import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useVoiceStore, type RoomMember } from '@/stores/voice';
import { useDmStore } from '@/stores/dm';
import { useAuthStore } from '@/stores/auth';
import { useGuildPermission } from '@/hooks/useGuildPermission';
import { guildsApi } from '@/api/guilds';
import { dmRouteParams } from '@/utils/dmRoute';
import { ParticipantTile } from '@/components/call/ParticipantTile';
import { ScreenShareStage } from '@/components/call/ScreenShareStage';
import { CallControls } from '@/components/call/CallControls';
import { OutputPickerSheet } from '@/components/call/OutputPickerSheet';
import { VoiceContextSheet } from '@/components/call/VoiceContextSheet';
import { EmergencyButton } from '@/components/call/EmergencyButton';
import { CameraNudgeModal, shouldShowCameraNudge, markCameraNudgeShown } from '@/components/call/CameraNudgeModal';
import { ParticipantModerationHost } from '@/components/call/ParticipantModerationHost';
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
  // Sprint M4j (D55) — moderatör taşıması sürerken de AYNI sebeple ERTELENİR: kaynaktan ayrılış bir
  // hata değil, hedefe katılma denemesi bitene kadar ekran hedef kanalda kalır (bkz. `goneRef`
  // effect'i + `stores/voice.ts` `movePending` yorumu).
  const movePending = useVoiceStore((s) => s.movePending);
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
  // Sprint M5b §2 🔴 — kameradan AYRI map (bkz. `stores/voice.ts` alan yorumu). Bu ÇİĞ (dondurulmamış)
  // değer yalnız odak/tam-ekran hesapları için (aşağıdaki effect'ler); RENDER'da `shown.remoteScreenPublications`
  // kullanılır (`frozenRef` — kapanış animasyonu donması, camera ile AYNI desen).
  const remoteScreenPublications = useVoiceStore((s) => s.remoteScreenPublications);
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

  // ── Sprint M4h — ses kanalı moderasyonu (kontrat SPRINT_M4H_MOBILE_VOICE_MODERATION_CONTRACT.md) ──
  // Yüzey yalnız guild araması: `guildId` DM/grup DM'de her zaman `null` (bkz. `stores/voice.ts`
  // `guildId` alan yorumu), aşağıdaki `useGuildPermission` çağrıları o dallarda otomatik `false` döner.
  const guildId = useVoiceStore((s) => s.guildId);
  const serverMutedUserIds = useVoiceStore((s) => s.serverMutedUserIds);
  const canMute = useGuildPermission(isGuildCall ? guildId : null, 'MUTE_MEMBERS');
  const canMove = useGuildPermission(isGuildCall ? guildId : null, 'MOVE_MEMBERS');
  // Sprint M5a §2 — alt panelin "Kanal Ayarları"/"Bir arkadaşını davet et" satırları. Aynı desen:
  // guild dışında `guildId` zaten `null`, hook otomatik `false` döner (satırlar hiç çizilmez).
  const canManageChannels = useGuildPermission(isGuildCall ? guildId : null, 'MANAGE_CHANNELS');
  const canCreateInvite = useGuildPermission(isGuildCall ? guildId : null, 'CREATE_INVITE');
  // Sözleşme §2 — kendine ve ORTAM SAHİBİNE eylem gösterilmez. Tekil "bu guild'in sahibi kim" ucu
  // yok (`useGuildPermission` ile aynı gerekçe): üye olduğum ortamlar listesinden okunur.
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => {
    if (!isGuildCall || !guildId) {
      setOwnerId(null);
      return;
    }
    let cancelled = false;
    guildsApi
      .list()
      .then((guilds) => {
        if (!cancelled) setOwnerId(guilds.find((g) => g.id === guildId)?.ownerId ?? null);
      })
      .catch(() => {
        if (!cancelled) setOwnerId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuildCall, guildId]);
  const [moderationTarget, setModerationTarget] = useState<RoomMember | null>(null);
  function canModerate(p: RoomMember): boolean {
    if (!isGuildCall) return false;
    if (!canMute && !canMove) return false;
    if (p.userId === myUser?.id) return false;
    if (ownerId && p.userId === ownerId) return false;
    return true;
  }

  const [outputSheetOpen, setOutputSheetOpen] = useState(false);
  // Sprint M5a §2 — üç nokta panel açıklığı. Hoparlör düğmesi kalktı (çıkış seçimi artık panelin
  // bir satırı, `VoiceContextSheet`'in `onOpenOutput`i bu iki state'i sırayla açıp kapatıyor).
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  // Sprint M4t §2 — kamera nudge modalı görünürlüğü (kapı/hatırlama `CameraNudgeModal.tsx`te).
  const [cameraNudgeVisible, setCameraNudgeVisible] = useState(false);
  // Sprint M5b §3.2 🔴 — tek odak kuralı: kullanıcının şeritten yaptığı seçim korunur (yeni bir
  // paylaşım başlayınca zıplamaz). `null` = henüz seçim yok (aşağıdaki effect ilk paylaşımı yazar).
  const [focusedScreenUserId, setFocusedScreenUserId] = useState<string | null>(null);
  // Sprint M5b §3.3 — tam ekran izleme (üst bar/alt kontroller/şerit gizlenir + yatay yön açılır).
  const [screenFullscreen, setScreenFullscreen] = useState(false);
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
    // Sprint M5b §2 🔴 — kameradan AYRI (bkz. `stores/voice.ts`); atlanırsa kapanış animasyonu
    // sürerken ekran-paylaşımı tile'ı da sökülür/yeniden kurulur — kamera için düzeltilen Fabric
    // çökme sınıfının (M4d) AYNISI, yalnız kaynak farklı.
    remoteScreenPublications: typeof remoteScreenPublications;
  }>({
    participants: [],
    canPublish: false,
    isCameraOn: false,
    cameraFacing: 'user',
    localCameraPublication: null,
    remoteCameraPublications: {},
    remoteScreenPublications: {},
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

  // Sprint M5b §3.2 🔴 — tek odak kuralı. Paylaşan kimse yoksa odak boşalır; paylaşan varsa VE
  // mevcut odak hâlâ paylaşıyorsa (kullanıcının kendi seçimi) DOKUNULMAZ — yeni bir paylaşım
  // başladığında (`remoteScreenPublications` değişir ama `focusedScreenUserId` hâlâ listede) odak
  // ZIPLAMAZ. Odak yalnız (a) hiç seçim yokken ilk paylaşıma veya (b) seçili kişi paylaşmayı
  // bıraktığında kalan ilk paylaşıma düşer (§3.2: "odak kalan ilk paylaşıma düşer").
  useEffect(() => {
    const ids = Object.keys(remoteScreenPublications);
    if (ids.length === 0) {
      if (focusedScreenUserId !== null) setFocusedScreenUserId(null);
      return;
    }
    if (!focusedScreenUserId || !ids.includes(focusedScreenUserId)) {
      setFocusedScreenUserId(ids[0]);
    }
  }, [remoteScreenPublications, focusedScreenUserId]);

  // Sprint M5b §3.3 🔴 — yatay yön yalnız BU görünümde: `app.json`daki global `"orientation":
  // "portrait"` kilidi DEĞİŞMİYOR, yalnız tam ekran AÇIKKEN kaldırılıyor (fiziksel çevirmenin
  // yatay/dikey doldurabilmesi için) — kapanınca dikey kilide GERİ dönülüyor.
  useEffect(() => {
    if (screenFullscreen) {
      void ScreenOrientation.unlockAsync();
    } else {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  }, [screenFullscreen]);

  // Güvenlik ağı (bkz. yukarıdaki effect) — ekran HANGİ YOLDAN kapanırsa kapansın (geri tuşu,
  // aramayı bitirme, `goneRef` navigasyonu) dikey kilit GERİ gelmeli; aksi halde uygulamanın geri
  // kalanı (hepsi dikey varsayımıyla yazıldı) yatay kilitte takılı kalırdı.
  useEffect(() => {
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  // Paylaşım(lar) biterken tam ekrandaysak boş/donuk bir video kalırdı — otomatik çık (§3.2
  // "hiç kalmadıysa §3.1'deki eski düzene dönülür" kuralının tam ekran karşılığı).
  useEffect(() => {
    if (screenFullscreen && Object.keys(remoteScreenPublications).length === 0) {
      setScreenFullscreen(false);
    }
  }, [screenFullscreen, remoteScreenPublications]);

  // Sprint M5b §3.4 ADDENDUM 🔴 — Android donanım geri tuşu tam ekrandan ÇIKARIR, aramadan
  // ÇIKARMAZ ("geri tuşunun aramayı kapatması kabul edilemez"). Dinleyici yalnız tam ekran
  // AÇIKKEN kayıtlı: bağımlılık `screenFullscreen` her değiştiğinde önceki listener sökülüp
  // (varsa) yenisi kurulur — kapalıyken dinleyici HİÇ kurulmaz, geri tuşunun bugünkü (bu
  // ekranın dışındaki) davranışı DEĞİŞMEDEN kalır. Desen `event-form.tsx`teki adım-geri
  // listener'ıyla AYNI (`BackHandler.addEventListener('hardwareBackPress', ...)` + `sub.remove()`).
  useEffect(() => {
    if (!screenFullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      resetHideTimer();
      setScreenFullscreen(false);
      return true; // varsayılan davranışı (ekrandan/aramadan çıkış) ENGELLER — yalnız tam ekrandan çıkar.
    });
    return () => sub.remove();
  }, [screenFullscreen]);

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
    // Sprint M4j (D55) 🔴 — moderatör taşıması sürüyorsa (`movePending`) da AYNI sebeple ERTELENİR:
    // kaynaktan ayrılış `handleMoved`in hedefe katılma denemesinin bir adımı, ekranın geri gitmesi
    // gerekmiyor — hedefe katılınca `connectedChannelId` yeni kanala döner, ekran orada kalır.
    if (emergencyPending || movePending) return;
    goneRef.current = true;
    // Sprint M5b §3.3 — tam ekrandan çıkarken kapanıyorsak burada da toparla (yukarıdaki unmount
    // güvenlik ağı zaten dikey kilide döndürür, bu yalnız geçiş sırasında bir çerçevelik "hâlâ
    // tam ekran chrome'u gizli" görüntüsünü önler).
    if (screenFullscreen) setScreenFullscreen(false);
    // Kontrolleri gizleme sayacı da susturulur: kapanma sırasında tetiklenirse üst bar ve alt çubuk
    // sökülmekte olan yüzeyde unmount olur — dondurma ile aynı gerekçe.
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const reason = useVoiceStore.getState().disconnectReason;
    useVoiceStore.getState().clearDisconnectReason();
    router.back();
    // Uyarı sökülme sırasında değil, bir sonraki tick'te ve DM ekranının üstünde açılır.
    if (reason) setTimeout(() => Alert.alert(reason), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeaving, connectedChannelId, emergencyPending, movePending]);

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
      remoteScreenPublications,
    };
  }
  const shown = isLeaving
    ? frozenRef.current
    : {
        participants: roomParticipants,
        canPublish,
        isCameraOn,
        cameraFacing,
        localCameraPublication,
        remoteCameraPublications,
        remoteScreenPublications,
      };

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
  // Sprint M5b §3.1 🔴 — ekran paylaşımı sahnesi TÜM diğer düzenlerin ÖNÜNE geçer (aşağıdaki render
  // ağacında ilk kontrol edilen dal budur — grid/tek-sütun/kamera-odaklı düzenlerin hiçbiri
  // değiştirilmedi, yalnız önlerine yeni bir öncelik eklendi). `effectiveFocusId` odak state'i henüz
  // ilk `useEffect` turunu almadan (bir render'lık pencere) de doğru tile'ı seçsin diye burada AYRICA
  // hesaplanır — state'i beklemek bir kare boş/yanlış tile göstermek anlamına gelirdi.
  const screenSharerIds = Object.keys(shown.remoteScreenPublications);
  const effectiveFocusScreenId =
    focusedScreenUserId && shown.remoteScreenPublications[focusedScreenUserId]
      ? focusedScreenUserId
      : screenSharerIds[0];
  const focusedScreenPublication = effectiveFocusScreenId
    ? (shown.remoteScreenPublications[effectiveFocusScreenId] ?? null)
    : null;
  const anyScreenShare = !!focusedScreenPublication;
  // Grup DM'de tek "karşı taraf" yok (N kişi) — başlık `peerName`e (ilk katılan kim ise o) değil,
  // grubun adına bağlanır (`stores/voice.ts` `startOrJoin` `kind==='group'`de `callChannelName`'i
  // guild gibi dolduruyor). DM dalında bu ifade `peerName`e eşit kalır — davranış DEĞİŞMEDİ.
  const nonGuildTitle = callKind === 'group' ? (callChannelName ?? peerName) : peerName;

  // Sprint M5a §2 — panelin başlık/alt başlık çifti. Sözleşme §2 tablosu: DM/grup DM'de alt başlık
  // "odadakilerin adları" (üst bardaki gibi tek bir peerName değil, o an sahnedeki HERKESİN adı —
  // kendisi dahil, sahne zaten kendi kutucuğunu da gösteriyor); guild'de üst bardaki ikinci satırla
  // AYNI (`callGuildName`). Yeni bir hesap İCAT EDİLMEDİ — üst bardaki `nonGuildTitle`/`callChannelName`
  // ile PAYLAŞILIYOR, panel yalnız guild dışında farklı bir alt başlık kullanıyor.
  const panelTitle = isGuildCall ? (callChannelName ?? '') : nonGuildTitle;
  const panelSubtitle = isGuildCall
    ? (callGuildName ?? '')
    : shown.participants.map((p) => p.username).join(', ');

  // Sprint M5a §1 (sahne kuralı) 🔴 — bu liste ARTIK SAHNEDE ÇİZİLMİYOR. Eskiden (M4z §E) grup
  // DM'de henüz katılmamış üyeler soluk kart olarak sahneye ekleniyordu; sözleşme bunu kalıcı
  // olarak yasakladı ("sahne yalnız odadakileri çizer, kimin odada olmadığı bilgisi PANELDE
  // durur"). Kaldırılan bilgi yok olmadı — aşağıdaki hesap AYNI kaynağı kullanmaya devam ediyor,
  // yalnız tüketicisi değişti: artık `VoiceContextSheet`in "Seste olmayanlar + Çaldır" bölümünü
  // besliyor (kaynak DM store'daki kanal kaydı; yeni uç çağrılmaz).
  // 🔴 M5a §4 ile kapsam genişledi: eskiden yalnız `kind==='group'` doluyordu (1-1 DM'de karşı
  // taraf zaten sahnede görünüyordu, panelden çaldırma yoktu). Sözleşme §2 tablosu artık 1-1
  // DM'de de "karşı taraf yoksa" bu listeyi istiyor — DM dalı ayrı bir koşul olarak eklendi,
  // grup dalı SATIR SATIR aynı kaldı. Guild dalında liste HER ZAMAN boş kalır (§6 kapsam dışı).
  // 🔴 Sıra kararlı: grup dalında ada göre (TR), eşitlikte id'ye göre — biri katılınca kalan
  // satırlar zıplamaz.
  const inRoomIds = new Set(shown.participants.map((p) => p.userId));
  const pendingMembers =
    callKind === 'group' && channel?.type === 'GROUP_DM'
      ? channel.members
          .filter((m) => m.id !== myUser?.id && !inRoomIds.has(m.id))
          .sort((a, b) => a.username.localeCompare(b.username, 'tr') || a.id.localeCompare(b.id))
      : callKind === 'dm' && channel?.type === 'DM' && !inRoomIds.has(channel.otherUser.id)
        ? [channel.otherUser]
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

        Sprint M5b §3.3 🔴 — TEK istisna: ekran-paylaşımı tam ekran görünümü. Orada blok tamamen
        UNMOUNT edilir (opacity değil) — "video uçtan uca" (§3.3) alanın kendisinin de boşalmasını
        istiyor, `controlsVisible`in kozmetik gizlemesinden FARKLI bir talep.

        Sprint M5b §3.4 ADDENDUM 🔴 — bu tam-unmount istisnası artık YALNIZ bu bloğa (üst bar) ait:
        alt kontrol çubuğu (aşağıda, `CallControls`) tam ekranda ARTIK unmount OLMUYOR — sahip
        cihaz turundan sonra tasarım revize edildi, bkz. o bloğun kendi yorumu.
      */}
      {!screenFullscreen && (
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
          {/* Sprint M5a §2 — hoparlör ikonu yerine üç nokta: çıkış seçimi artık panelin bir satırı
              (`OutputPickerSheet` hâlâ o satırdan açılıyor, kendi Modal'ı DEĞİŞMEDİ). */}
          <Pressable
            onPress={() => {
              resetHideTimer();
              setContextSheetOpen(true);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.call.moreOptions')}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
      )}

      {/*
        Sprint M4t §3.3 🔴 — acil buton OTOMATİK GİZLENMEYE TABİ DEĞİL: yukarıdaki `topBar`
        `controlsHidden` (opacity 0) aldığında RN opaklığı alt ağaca da uygular, bu yüzden buton
        o View'ın İÇİNE konsa fade'den kaçamazdı. Ayrı, hiçbir zaman soluklaşmayan bir satırda
        (aynı üst-bar bölgesinde, hemen altında) duruyor — panik anındaki kullanıcı "ekrana dokun,
        kontroller gelsin" adımını yapmadan basabiliyor.

        Sprint M5b §3.4 ADDENDUM 🔴 — bu SATIR SATIR aynı kalan davranış YALNIZ tam ekran KAPALIYKEN
        geçerli (kontrat §3.4 madde 5: "Normal görünüm DEĞİŞMEZ"). Tam ekranda acil buton BURADA
        DEĞİL, aşağıdaki `controls` sarmalayıcının İÇİNDE render edilir (kontrollerle birlikte
        gizlenip görünür) — R7 gerekçe kaydı kontrat §3.4'te: bu bir T&S gevşetmesi, yalnız tam
        ekran yüzeyine ait, sessizce yapılmadı.
      */}
      {!screenFullscreen && (
        <View style={styles.emergencyRow} pointerEvents="box-none">
          <EmergencyButton />
        </View>
      )}

      {/*
        Sprint M5b §3.1 🔴 — ekran paylaşımı sahnesi diğer TÜM düzenlerin (ızgara/kamera-odaklı/
        klasik iki-kutucuk) ÖNÜNE geçer: odada en az bir paylaşım varken bu dal çizilir, aşağıdaki
        `isGridCall`/`anyCameraOn` dalları SATIR SATIR değişmeden yerinde duruyor — yalnız bu yeni
        kontrolün ARDINDAN sıraya giriyorlar (kimse paylaşmıyorsa bugünkü düzen aynen kalır, §3.1).
      */}
      {anyScreenShare ? (
        <ScreenShareStage
          participants={shown.participants}
          focusedPublication={focusedScreenPublication}
          screenPublications={shown.remoteScreenPublications}
          cameraPublications={shown.remoteCameraPublications}
          localCameraPublication={shown.localCameraPublication}
          cameraFacing={shown.cameraFacing}
          speakingUserIds={speakingUserIds}
          mutedUserIds={mutedUserIds}
          isMuted={isMuted}
          fullscreen={screenFullscreen}
          onToggleFullscreen={() => {
            resetHideTimer();
            setScreenFullscreen((v) => !v);
          }}
          onSelectFocus={setFocusedScreenUserId}
          canModerate={canModerate}
          onModerationTarget={setModerationTarget}
        />
      ) : isGridCall ? (
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
                // Sprint M4h — moderasyon sheet tetikleyicisi (yalnız guild aramasında + yetkili +
                // kendi/sahip dışı; bkz. `canModerate`). Yetkisiz/self/sahip dokunuşu yutar (`disabled`),
                // görsel geri bildirim eklemez — düğme gibi görünmesin diye ripple/opacity YOK.
                <Pressable
                  key={p.userId}
                  style={styles.gridItem}
                  disabled={!canModerate(p)}
                  onPress={() => setModerationTarget(p)}
                >
                  <ParticipantTile
                    name={p.username}
                    avatarUrl={p.avatarUrl}
                    speaking={speakingUserIds.has(p.userId)}
                    micOff={p.isLocal ? isMuted : mutedUserIds.has(p.userId)}
                    videoPublication={p.isLocal ? shown.localCameraPublication : (shown.remoteCameraPublications[p.userId] ?? null)}
                    mirror={p.isLocal && shown.cameraFacing === 'user'}
                  />
                </Pressable>
              ))}
              {/* Sprint M5a §1 — bekleyen üye kartları BURADAN kaldırıldı (bkz. `pendingMembers`
                  yorumu). "Kimi bekliyorum" bilgisi artık yalnız panelde. */}
            </ScrollView>
            {alone && (
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
                // Sprint M4h — bkz. ızgara dalındaki aynı yorum (`canModerate`).
                <Pressable key={p.userId} disabled={!canModerate(p)} onPress={() => setModerationTarget(p)}>
                  <ParticipantTile
                    name={p.username}
                    avatarUrl={p.avatarUrl}
                    speaking={speakingUserIds.has(p.userId)}
                    micOff={p.isLocal ? isMuted : mutedUserIds.has(p.userId)}
                  />
                </Pressable>
              ))}
              {/* Sprint M5a §1 🔴 — bekleyen üye kartları (eski M4z §E) BURADAN kaldırıldı: sahne
                  kuralı artık kalıcı ("sahne yalnız odadakileri çizer"). Bu bilgi kaybolmadı,
                  `VoiceContextSheet`in "Seste olmayanlar" bölümüne taşındı (üç nokta panelinden). */}
            </ScrollView>
            {/* §E'den kalan ders geçerli kalıyor: "Arkadaşların katıldığında burada görünecekler"
                yalnız gerçekten boş ekranda gösterilir — artık pendingMembers'a bakmaya GEREK YOK
                (sahnede zaten hiç çizilmiyor, çelişki riski kalmadı). */}
            {alone && (
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

      {/*
        Aynı düzen-koruma gerekçesi — bkz. üst bar yorumu (blok HER ZAMAN mount'lu, `opacity`/
        `pointerEvents` değişir). Sprint M5b §3.3 önceden bu bloğu da tam ekranda TAMAMEN unmount
        ediyordu ("video uçtan uca") — §3.4 ADDENDUM bunu sahip cihaz turundan SONRA değiştirdi:
        tam ekranda alt kontrol çubuğu (mevcut `CallControls`, YENİ BİLEŞEN YAZILMADI) artık
        GÖRÜNÜR kalır ve mevcut `controlsVisible`/`CONTROLS_HIDE_MS` gizlenme kuralına tabidir
        (yeni bir zamanlayıcı YOK). Tam ekranken kutu `controlsFullscreen` ile `position:'absolute'`
        alıp videonun ÜZERİNE biner (bigTile zaten `bigTileFullscreen` ile uçtan uca); normal
        görünümde eskisi gibi akışta (videonun ALTINDA) kalır — stil yalnız `screenFullscreen`
        true iken eklenir, normal görünüm SATIR SATIR aynı.
      */}
      <View
        style={[
          styles.controls,
          screenFullscreen && styles.controlsFullscreen,
          { paddingBottom: insets.bottom + 16 },
          !controlsVisible && styles.controlsHidden,
        ]}
        pointerEvents={controlsVisible ? 'auto' : 'none'}
      >
        {/*
          Sprint M5b §3.4 ADDENDUM 🔴 — acil buton tam ekranda BURADA: kendi sabit satırında DEĞİL,
          `CallControls` ile AYNI opacity/pointerEvents grubunun içinde (kontrollerle birlikte
          gizlenip görünür). Normal görünümdeki (üstteki `emergencyRow`, hiç gizlenmeyen) satırla
          KARIŞTIRILMASIN — bu yalnız tam ekrana özel, kontrat §3.4 R7 gerekçe kaydına bağlı bilinçli
          bir T&S gevşetmesi.
        */}
        {screenFullscreen && (
          <View style={styles.fullscreenEmergencyRow} pointerEvents="box-none">
            <EmergencyButton />
          </View>
        )}
        {/* Sahip cihaz turu 2026-08-10 — tam ekranda düğmeler videonun ÜSTÜNDE duruyor; açık bir
            sahnede (beyaz ağırlıklı içerik) ikonlar kayboluyordu. Saydam bir zemin (`bgOverlay`,
            mevcut token) okunurluğu garantiye alıyor. Sarmalayıcı View normal görünümde stilsiz —
            düzeni etkilemez (varsayılan dikey akış, `CallControls` kendi satırını zaten ortalıyor). */}
        <View style={screenFullscreen ? styles.fullscreenControlsPill : undefined}>
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
          // Sprint M5b §3.4 ADDENDUM — yalnız tam ekranken dolu: küçültme düğmesini gösterir.
          onExitFullscreen={
            screenFullscreen
              ? () => {
                  resetHideTimer();
                  setScreenFullscreen(false);
                }
              : undefined
          }
        />
        </View>
      </View>

      <OutputPickerSheet visible={outputSheetOpen} onClose={() => setOutputSheetOpen(false)} />
      {/* Sprint M5a §2 — üç nokta paneli. `channelId` her zaman dolu (§0 dosya başındaki erken
          `if (!channelId) return null` sayesinde). */}
      <VoiceContextSheet
        visible={contextSheetOpen}
        onClose={() => setContextSheetOpen(false)}
        channelId={channelId}
        callKind={callKind}
        guildId={guildId}
        title={panelTitle}
        subtitle={panelSubtitle}
        canManageChannel={canManageChannels}
        canInvite={canCreateInvite}
        pendingMembers={pendingMembers}
        onOpenOutput={() => setOutputSheetOpen(true)}
      />
      {/* Sprint M4h — moderasyon paneli. `isServerMuted`/`isBroadcasting` RENDER ANINDA türetilir
          (sözleşme §3 — Host'un `onToggleMute` closure'ı bu değeri panel kapanmadan ÖNCE yakalar). */}
      <ParticipantModerationHost
        channelId={channelId}
        guildId={guildId}
        participant={moderationTarget}
        canMute={canMute}
        canMove={canMove}
        isServerMuted={moderationTarget ? serverMutedUserIds.has(moderationTarget.userId) : false}
        isBroadcasting={
          moderationTarget ? !!shown.remoteCameraPublications[moderationTarget.userId]?.track : false
        }
        onClose={() => setModerationTarget(null)}
      />
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
  // Sprint M5b §3.4 ADDENDUM — tam ekranda kontrol çubuğu akıştan ÇIKIP videonun ÜZERİNE biner
  // (`bigTileFullscreen` zaten videoyu uçtan uca yapmıştı — akışta bıraksaydık kontrol çubuğu
  // videonun altına yer açar, "video uçtan uca" ilkesini bozardı). Normal görünümde bu stil hiç
  // uygulanmaz (yalnız `screenFullscreen` true iken eklenir) — akıştaki eski konum DEĞİŞMEDİ.
  controlsFullscreen: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Acil butonun tam ekrandaki satırı — `CallControls`in ÜSTÜNDE, aynı sarmalayıcının içinde
  // (bkz. render'daki yorum). Normal görünümdeki `emergencyRow`dan (üst-bar altında, sağa yaslı,
  // hiç gizlenmeyen) BİLİNÇLİ olarak ayrı bir stil — burada ortalanmış, `CallControls`in üstünde.
  fullscreenEmergencyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 12,
  },
  // Tam ekranda düğmelerin altına saydam zemin (bkz. render'daki yorum). Renk ve yarıçap
  // token'lardan: `bgOverlay` (rgba(0,0,0,0.6)) + `radius.lg` — yeni değer uydurulmadı.
  // `alignSelf:'center'` şeridi içerik genişliğinde tutar; tam genişlik bir bar videoyu gereksiz örterdi.
  fullscreenControlsPill: {
    alignSelf: 'center',
    backgroundColor: theme.colors.bgOverlay,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
