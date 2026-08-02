import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChannelSummaryDto } from '@/api/channels';
import { useUnreadStore } from '@/stores/unread';
import { useNotificationPrefsStore } from '@/stores/notificationPrefs';
import { NotificationLevel } from '@/api/notifications';
import { badgeLabel } from '@/utils/badgeLabel';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  channel: ChannelSummaryDto;
  selected: boolean;
  onPress: () => void;
  /** Sprint M2a §4.5 — artık HER üyeye geçilir (panel "Okundu İşaretle" taşıyor); yönetim
   *  maddeleri panelin İÇİNDE `canManage`'e göre koşullu (bkz. `ChannelMenuSheet`). */
  onLongPress?: () => void;
}

// Sprint M1d-B — `ChannelSidebar`'dan çıkarıldı: gruplu render + collapse eklenince sidebar 300
// satır eşiğini aştı (kök CLAUDE.md sinyali). Satırın kendi state'i yok, saf sunum.
//
// Sprint M2a §2/§4.2 — görsel dil web'e hizalandı: KIRMIZI artık yalnız BAHSETME (`unreadMentionCount`),
// genel okunmamış (`unreadCount`) parlaklıkla anlatılır (ad + ikon `#`). Eski kırmızı `unreadCount`
// rozeti KALDIRILDI. Sayaçlar merkezi `unread` store'dan okunur (canlı — bkz. realtime/socket.ts);
// REST'ten gelen `channel.unreadCount/unreadMentionCount` yalnız store boş olduğunda (ilk render,
// hydrate henüz işlenmeden) yedek değer.
export function ChannelRow({ channel, selected, onPress, onLongPress }: Props) {
  const unread = useUnreadStore((s) => s.channels[channel.id]?.unread ?? channel.unreadCount);
  const mentions = useUnreadStore((s) => s.channels[channel.id]?.mentions ?? channel.unreadMentionCount);
  // Sprint M2b §3/§5 R1-3 — CHANNEL kaydı varsa TAMAMEN o kazanır, yoksa GUILD'e düşer (resolvePref
  // ile aynı sıra, bkz. stores/notificationPrefs.ts). Susturma TAM SESSİZLİKtir: parlaklık VE bahsetme
  // rozeti ikisi de susturulmuşken gizlenir; susturulmamışken parlaklık yalnız ALL'da, bahsetme
  // rozeti yalnız NONE'da gizlenir. Ayrıca susturulmuş kanal BÜTÜN satır sönük görünür (§1 IN/6).
  const level = useNotificationPrefsStore((s) =>
    s.effectiveLevel('CHANNEL', channel.id, channel.guildId),
  );
  const muted = useNotificationPrefsStore((s) =>
    s.effectiveMuted('CHANNEL', channel.id, channel.guildId),
  );
  const showUnread = unread > 0 && level === NotificationLevel.ALL && !muted;
  const showMentionBadge = mentions > 0 && level !== NotificationLevel.NONE && !muted;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        style={[
          styles.hash,
          showUnread && styles.hashUnread,
          selected && styles.hashSelected,
          muted && styles.mutedText,
        ]}
      >
        #
      </Text>
      <Text
        style={[
          styles.name,
          showUnread && styles.nameUnread,
          selected && styles.nameSelected,
          muted && styles.mutedText,
        ]}
        numberOfLines={1}
      >
        {channel.name}
      </Text>
      {channel.ageGated && <Text style={styles.ageBadge}>{t('channel.ageGatedBadge')}</Text>}
      {showMentionBadge && (
        <View style={styles.mentionBadge}>
          <Text style={styles.mentionBadgeText}>{badgeLabel(mentions)}</Text>
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
  // Sprint M2a §4.2 — kanal ikonu (`#`) de okunmamışta parlıyor, isimle AYNI kural.
  hashUnread: { color: theme.colors.textPrimary, fontWeight: '700' },
  // Sprint M2b §1 IN/6 — susturulmuş kanal listede sönük (Discord: "susturulmuş kanallar gri
  // görünür"). Stil dizisinde EN SONDA: susturulmuşsa parlaklık/seçili renginin üzerine yazar.
  mutedText: { color: theme.colors.textMuted },
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
  // Sprint M2a §2/§4.2 — eski `unreadBadge` (genel okunmamış, kırmızı) yerine BAHSETME sayacı.
  mentionBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionBadgeText: {
    // Gömülü '#fff' değil: danger zemin üzerinde okunur token.
    color: theme.colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
});
