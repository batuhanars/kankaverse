import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { UserCardDto } from '@/api/users';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Profil düzenlemenin görsel alanları: avatar + afiş (seç / kaldır).
 *
 * `profile-edit` ekranından ayrıldı — 300 satır eşiği. Yükleme AKIŞI ekranda kalır (presign → PUT →
 * PATCH); burası yalnız görünüm ve niyet: hangi slot'a dokunuldu.
 *
 * 🔴 Bu alanlar YALNIZ kullanıcının kendi profili içindir (sahip istisnası 2026-08-01). Ortam
 * ikonu/afişi mobilde hâlâ gösterilir ama yüklenmez — o kural duruyor.
 */
export type MediaSlot = 'avatar' | 'banner';

interface Props {
  username: string;
  card: UserCardDto | null;
  /** Hangi slot yükleniyor (null = boşta) — iki düğme aynı anda çalışmaz. */
  uploading: MediaSlot | null;
  onPick: (slot: MediaSlot) => void;
  onRemove: (slot: MediaSlot) => void;
}

export function ProfileMediaFields({ username, card, uploading, onPick, onRemove }: Props) {
  return (
    <>
      <Text style={styles.label}>{t('settings.avatar.label')}</Text>
      <View style={styles.mediaRow}>
        {card?.avatarUrl ? (
          <Image source={{ uri: card.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{username.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.actions}>
          <Pressable onPress={() => onPick('avatar')} style={styles.secondaryButton}>
            {uploading === 'avatar' ? (
              <ActivityIndicator color={theme.colors.textPrimary} />
            ) : (
              <Text style={styles.secondaryButtonText}>{t('settings.avatar.upload')}</Text>
            )}
          </Pressable>
          {/* "Kaldır" yalnız kaldırılacak bir şey varken — boş yüzey açma. */}
          {card?.avatarUrl ? (
            <Pressable onPress={() => onRemove('avatar')} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>{t('settings.avatar.remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.label}>{t('settings.bannerImage.label')}</Text>
      <Text style={styles.hint}>{t('settings.bannerImage.hint')}</Text>
      <View style={styles.bannerPreview}>
        {card?.bannerUrl ? (
          <Image source={{ uri: card.bannerUrl }} style={styles.bannerImage} resizeMode="cover" />
        ) : (
          <View
            style={[
              styles.bannerImage,
              card?.bannerColor ? { backgroundColor: card.bannerColor } : styles.bannerEmpty,
            ]}
          />
        )}
      </View>
      <View style={styles.actions}>
        <Pressable onPress={() => onPick('banner')} style={styles.secondaryButton}>
          {uploading === 'banner' ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.secondaryButtonText}>{t('settings.bannerImage.upload')}</Text>
          )}
        </Pressable>
        {card?.bannerUrl ? (
          <Pressable onPress={() => onRemove('banner')} style={styles.linkButton}>
            <Text style={styles.linkButtonText}>{t('settings.bannerImage.remove')}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginTop: 12,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: 26,
    fontWeight: '700',
  },
  bannerPreview: {
    height: 96,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerEmpty: {
    backgroundColor: theme.colors.bgElevated,
  },
  secondaryButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  linkButton: {
    paddingVertical: 6,
  },
  linkButtonText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
