import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { t } from '@/i18n';
import { theme } from '@/theme';

const CONTROLS_HIDE_MS = 5000;

/**
 * M4a-1 sözleşme §4 — arama ekranı, tam ekran modal. Bu ekran bağlantıyı BAŞLATMAZ: DM ekranı
 * (`dm/[id].tsx` `handleCallPress`) zaten `voiceStore.startOrJoin` ile bağlanıp buraya
 * yönlendiriyor, ya da mini pencereden geri dönülüyor (§7). Burası yalnız var olan bağlantıyı çizer.
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

  const channel = useDmStore((s) => s.channels.find((c) => c.id === channelId));
  const myUser = useAuthStore((s) => s.user);

  const [outputSheetOpen, setOutputSheetOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bu ekran BU channelId'ye bağlıyken bir kez true olur; sonra `connectedChannelId` boşalırsa
  // (kopma/reddedilme/zaman aşımı/kullanıcı kapat) "gerçek bir ayrılış" olduğunu ayırt eder —
  // ekran channelId hâlâ bağlanmamışken (olmayan bir sekmeye deep-link gibi) sessizce geri döner.
  const wasConnectedRef = useRef(false);

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

  useEffect(() => {
    if (connectedChannelId === channelId) wasConnectedRef.current = true;
  }, [connectedChannelId, channelId]);

  // §3.3 🔴 — beklenmedik/bilgilendirilmesi gereken her ayrılışta ekran kapanır, Türkçe bilgi
  // gösterilir (reddedilme, tek-başına zaman aşımı, LiveKit Disconnected, kullanıcı "kapat"a
  // basmışsa `disconnectReason` null'dır — sessizce kapanır).
  useEffect(() => {
    if (!wasConnectedRef.current || connectedChannelId !== null) return;
    const reason = useVoiceStore.getState().disconnectReason;
    if (reason) Alert.alert(reason);
    useVoiceStore.getState().clearDisconnectReason();
    router.back();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedChannelId]);

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

  const localMember = roomParticipants.find((p) => p.isLocal);
  const peerMember = roomParticipants.find((p) => !p.isLocal);
  const peerFallback = channel?.type === 'DM' ? channel.otherUser : null;
  const peerName = peerMember?.username ?? peerFallback?.username ?? '';
  const peerAvatar = peerMember?.avatarUrl ?? peerFallback?.avatarUrl ?? null;
  const alone = roomParticipants.length <= 1;

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

  function handleOpenChat() {
    router.push(channel ? dmRouteParams(channel) : { pathname: '/dm/[id]', params: { id: channelId } });
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

      {controlsVisible && (
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
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
          <Pressable onPress={handleOpenChat} style={styles.topBarCenter} accessibilityRole="button">
            <Text style={styles.peerName} numberOfLines={1}>
              {peerName}
            </Text>
            <Text style={styles.duration}>{duration}</Text>
          </Pressable>
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
      )}

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
          ringing={alone && didInvite}
        />
        {alone && (
          <View style={styles.aloneNotice}>
            <Text style={styles.aloneTitle}>{t('mobile.call.aloneTitle')}</Text>
            <Text style={styles.aloneSubtitle}>{t('mobile.call.aloneSubtitle', { name: peerName })}</Text>
          </View>
        )}
        {!canPublish && <Text style={styles.listenerNotice}>{t('voice.listenerOnly')}</Text>}
      </View>

      {controlsVisible && (
        <View style={[styles.controls, { paddingBottom: insets.bottom + 16 }]}>
          <CallControls
            isMuted={isMuted}
            canPublish={canPublish}
            onToggleMute={() => {
              resetHideTimer();
              void useVoiceStore.getState().toggleMute();
            }}
            onOpenChat={handleOpenChat}
            onHangUp={handleHangUp}
          />
        </View>
      )}

      <OutputPickerSheet visible={outputSheetOpen} onClose={() => setOutputSheetOpen(false)} />
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
  tiles: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: theme.layout.panelGap * 2,
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
