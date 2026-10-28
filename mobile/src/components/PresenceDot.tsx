import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { PresenceStatus } from '@/stores/presence';
import { theme } from '@/theme';

// Web `UserCard.vue` presenceColor karşılığı; renkler token'dan. Tek eşleme: Kanka şeridi, DM başlığı,
// mesaj avatarı ve grup üye listesi aynı paleti buradan okur.
export const PRESENCE_COLOR: Record<PresenceStatus, string> = {
  online: theme.colors.online,
  away: theme.colors.idle,
  dnd: theme.colors.dnd,
  offline: theme.colors.offline,
};

interface Props {
  status: PresenceStatus;
  size: number;
  /** Halka (kenarlık) rengi: noktanın oturduğu zemin rengi; avatardan ayrışsın. */
  ringColor: string;
  ringWidth?: number;
  /** Avatarın sağ-alt köşesine yerleştirir (üst öğe `position: relative` varsayılır, RN'de varsayılan). */
  style?: StyleProp<ViewStyle>;
}

/** Çevrimdışıyı da çizer; "offline'da nokta yok" kararı çağıran tarafta (render etmemek). */
export function PresenceDot({ status, size, ringColor, ringWidth = 2, style }: Props) {
  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth,
          borderColor: ringColor,
          backgroundColor: PRESENCE_COLOR[status],
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
  },
});
