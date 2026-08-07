import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  name: string;
  avatarUrl: string | null;
  /** Konuşan kutucuk yeşil kenarlık (per-participant `IsSpeakingChanged`, web dersi: aggregate
   *  ActiveSpeakersChanged mute/unmute döngüsünde kaçıyor — bkz. `stores/voice.ts` `attachSpeaking`). */
  speaking: boolean;
  micOff: boolean;
  /** §4 — karşı taraf henüz katılmadıysa kutucuk soluk durur. M4z §E ile grup DM'de odada
   *  olmayan üyeler için de kullanılır (orada `ringing` verilmez). */
  dimmed?: boolean;
  /** §4 — davet gönderildi, karşı taraf henüz katılmadı: "Çalıyor…" göstergesi. */
  ringing?: boolean;
}

const AVATAR_SIZE = 88;

export function ParticipantTile({ name, avatarUrl, speaking, micOff, dimmed, ringing }: Props) {
  return (
    <View style={[styles.tile, dimmed && styles.tileDimmed]}>
      <View style={[styles.avatarWrap, speaking && styles.avatarSpeaking]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        {micOff && (
          <View style={styles.micBadge}>
            <Ionicons name="mic-off" size={14} color={theme.colors.textPrimary} />
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {ringing && <Text style={styles.ringing}>{t('mobile.call.ringing')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
  },
  tileDimmed: {
    opacity: 0.5,
  },
  avatarWrap: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSpeaking: {
    borderColor: theme.colors.online,
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
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
  },
  micBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.bgElevated,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
  ringing: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
});
