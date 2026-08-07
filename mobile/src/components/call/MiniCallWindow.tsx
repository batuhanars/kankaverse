import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useVoiceStore } from '@/stores/voice';
import { useDmStore } from '@/stores/dm';
import { theme } from '@/theme';

/**
 * M4a-1 sözleşme §7 — mini pencere. Sistem seviyesi bir overlay DEĞİL (overlay izni/PiP yok);
 * kök `_layout.tsx`'te mount edilen mutlak konumlu bir bileşen (Discord'un yaptığı da bu).
 * Görünürlük sürüklenebilir bir "minimized" state'i İZLEMEZ — yalnız üç koşuldan türetilir:
 * bağlıyız VE mevcut rota `/call` DEĞİL VE `/call`a geçiş BEKLEMİYORUZ. Rota `/call` olunca tam
 * ekran zaten kendini gösteriyor, mini pencere o an anlamsız — ayrı bir state'i senkron tutmaya
 * gerek kalmıyor (D37/M3c dersi: gereksiz state = senkron kalma riski).
 *
 * 🔴 M4c sahip bulgusu (2026-08-07) — üçüncü koşul (`pendingCallScreen`) sonradan eklendi:
 * `startOrJoin` başarılı olur olmaz `connectedChannelId` dolar ama `router.push('/call')` henüz
 * çalışmamıştır (asenkron gezinme) — o birkaç render'lık pencerede bu bileşen (`pathname` hâlâ
 * eski ekran) kısaca görünüp tam ekran açılınca kayboluyordu (flaş). `pendingCallScreen`
 * `stores/voice.ts`'te bu geçişi işaretliyor.
 */
export function MiniCallWindow() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const connectedChannelId = useVoiceStore((s) => s.connectedChannelId);
  const pendingCallScreen = useVoiceStore((s) => s.pendingCallScreen);
  const roomParticipants = useVoiceStore((s) => s.roomParticipants);
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds);
  const channel = useDmStore((s) => s.channels.find((c) => c.id === connectedChannelId));

  if (!connectedChannelId || pathname === '/call' || pendingCallScreen) return null;

  const peer = channel?.type === 'DM' ? channel.otherUser : null;
  const peerMember = roomParticipants.find((p) => !p.isLocal);
  const avatarUrl = peerMember?.avatarUrl ?? peer?.avatarUrl ?? null;
  const initial = (peerMember?.username ?? peer?.username ?? '?').charAt(0).toUpperCase();
  const speaking = peerMember ? speakingUserIds.has(peerMember.userId) : false;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/call', params: { channelId: connectedChannelId } })}
      style={[styles.container, { top: insets.top + 8 }]}
      accessibilityRole="button"
    >
      <View style={[styles.avatarWrap, speaking && styles.avatarSpeaking]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{initial}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const SIZE = 56;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 12,
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    // `elevation` burada "derinlik" için değil — react-native-screens'in native Stack'i üstünde
    // güvenilir biçimde çizilsin diye (Android'de salt zIndex, native ekran fragment'larına karşı
    // sıra garantisi vermeyebilir). Görsel dil kenarlıkla kalıyor (tasarım sistemi — "Gölge YOK");
    // bu küçük boyutta elevation'ın kendi gölgesi zaten görünmeyecek kadar ince.
    elevation: 8,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSpeaking: {
    borderColor: theme.colors.online,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
});
