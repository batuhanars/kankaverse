import { Image, StyleSheet, Text, View } from 'react-native';
import type { MessageRequestDto } from '@/api/dm';
import { theme } from '@/theme';

/**
 * C75 Rev.7 — mesaj isteği avatarı (liste satırı + detay başlığı). Görsel yoksa baş harf.
 * Kullanıcı avatarı daire kalır (altıgen yalnız ortam ikonları).
 */
export function RequestAvatar({ requester, size }: { requester: MessageRequestDto['requester']; size: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (requester?.avatarUrl) return <Image source={{ uri: requester.avatarUrl }} style={box} />;
  return (
    <View style={[box, styles.fallback]}>
      <Text style={[styles.letter, { fontSize: size >= 48 ? theme.fontSize.xxl : theme.fontSize.md }]}>
        {(requester?.username ?? '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: theme.colors.accent500,
    fontWeight: '700',
  },
});
