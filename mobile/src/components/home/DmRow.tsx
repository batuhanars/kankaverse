import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import { t } from '@/i18n';

/**
 * DM listesindeki tek satır. `DmSidebar`den ayrıldı (M1d-C): dosya 312 satırdı ve satıra uzun basış
 * eklenince eşik iyice aşılacaktı. `ChannelRow`ün (M1d-B) kardeşi — aynı sebeple, aynı desenle.
 *
 * **Uzun basış → DM paneli** (sözleşme §2.3). Panel yalnız LİSTEDEN açılır; sohbetin içinden değil
 * (sahip kararı 2026-08-01: sohbette başlığa dokununca profil açılır, panel değil).
 */
interface Props {
  name: string;
  avatarUrl: string | null;
  /** Son mesaj önizlemesi; "yazıyor" varsa o ezer. */
  preview: string;
  typing: boolean;
  unread: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

export function DmRow({ name, avatarUrl, preview, typing, unread, onPress, onLongPress }: Props) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={styles.row}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
          {name}
        </Text>
        {/* Sözleşme §8.3 — kutucukta "yazıyor…" (web Sprint 6 R1-b/R1-c karşılığı: "DM'e bakmasan
            da kutucukta görünsün"). Yazan varsa son mesaj önizlemesini EZER; 1-1 DM'de sade metin. */}
        {typing ? (
          <Text style={styles.typing} numberOfLines={1}>
            {t('typing.simple')}
          </Text>
        ) : preview ? (
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}
      </View>
      {unread && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
  },
  nameUnread: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  preview: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 1,
  },
  typing: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontStyle: 'italic',
    marginTop: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent500,
    marginLeft: 8,
  },
});
