import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChannelSummaryDto } from '@/api/channels';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  channel: ChannelSummaryDto;
  selected: boolean;
  onPress: () => void;
  /** Yalnız yetkiliye geçilir; yetkisizde uzun basış hiçbir şey yapmaz, ipucu da verilmez. */
  onLongPress?: () => void;
}

// Sprint M1d-B — `ChannelSidebar`'dan çıkarıldı: gruplu render + collapse eklenince sidebar 300
// satır eşiğini aştı (kök CLAUDE.md sinyali). Satırın kendi state'i yok, saf sunum.
export function ChannelRow({ channel, selected, onPress, onLongPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.hash, selected && styles.hashSelected]}>#</Text>
      <Text
        style={[styles.name, channel.unreadCount > 0 && styles.nameUnread, selected && styles.nameSelected]}
        numberOfLines={1}
      >
        {channel.name}
      </Text>
      {channel.ageGated && <Text style={styles.ageBadge}>{t('channel.ageGatedBadge')}</Text>}
      {channel.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Sözleşme §8.1-A/1 — 40dp dokunma hedefi + 2dp ritim boşluğu; ayırıcı çizgi YOK
  // (Discord da ritim+dolgu ile ayırır).
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 2,
    borderRadius: theme.radius.md,
  },
  rowSelected: { backgroundColor: theme.colors.bgElevated },
  hash: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.lg,
    marginRight: 7,
    fontWeight: '600',
  },
  hashSelected: { color: theme.colors.accent500 },
  name: {
    flex: 1,
    color: theme.colors.textBody,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
  },
  nameUnread: { color: theme.colors.textPrimary, fontWeight: '700' },
  nameSelected: { color: theme.colors.textPrimary, fontWeight: '600' },
  ageBadge: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginRight: 6,
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    // Gömülü '#fff' değil: danger zemin üzerinde okunur token.
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
});
