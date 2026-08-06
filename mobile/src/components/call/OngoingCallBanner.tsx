import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VoicePresenceParticipant } from '@/stores/voicePresence';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * M4a-1 sözleşme §3.1 — "Arama sürüyorsa (katılımcı var, biz bağlı değiliz) düğme KATILIR; ek olarak
 * sohbetin üstünde şerit: katılımcı avatarları + 'Sesli arama sürüyor' + 'Katıl'." Yalnız 1-1 DM'de
 * (`dm/[id].tsx` çağıran taraf zaten `isDm` ile süzüyor).
 */
export function OngoingCallBanner({
  participants,
  onJoin,
  joining,
}: {
  participants: VoicePresenceParticipant[];
  onJoin: () => void;
  joining: boolean;
}) {
  if (participants.length === 0) return null;

  return (
    <View style={styles.row}>
      <View style={styles.avatars}>
        {participants.slice(0, 3).map((p, i) => (
          <View key={p.userId} style={[styles.avatarWrap, i > 0 && styles.avatarOverlap]}>
            {p.avatarUrl ? (
              <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{p.username.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {t('mobile.call.ongoing')}
      </Text>
      <Pressable
        onPress={onJoin}
        disabled={joining}
        style={[styles.joinButton, joining && styles.joinButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel={t('voice.joinAction')}
      >
        <Ionicons name="call" size={14} color={theme.colors.textPrimary} />
        <Text style={styles.joinButtonText}>{t('voice.joinAction')}</Text>
      </Pressable>
    </View>
  );
}

const AVATAR_SIZE = 24;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 8,
    backgroundColor: theme.colors.accentSubtle,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  avatars: {
    flexDirection: 'row',
  },
  avatarWrap: {
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.colors.bgContent,
  },
  avatarOverlap: {
    marginLeft: -10,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  label: {
    flex: 1,
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    // Dokunma hedefi ≥44dp (D37 dersi) — dikey dolgu ile en az 44dp'ye tamamlanır (14 sm ikon + 2×15 padding = 44).
    paddingVertical: 15,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.accent500,
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
});
