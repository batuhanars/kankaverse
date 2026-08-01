import { Image, StyleSheet, Text, View } from 'react-native';
import type { UserCardDto } from '@/api/users';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * "Sen" sekmesinin profil başlığı (M1d-C §3.1): afiş · avatar · kullanıcı adı · biyografi ·
 * üyelik tarihi.
 *
 * Veri `GET /users/:id/card`'dan **kendi id'mle** gelir — sunucuda ayrı bir "benim profilim" ucu
 * yok, uydurulmadı (kendi id'mde `friendStatus: 'self'` dönüyor).
 *
 * 🔴 Afiş: görsel varsa o, yoksa `bannerColor`, o da yoksa nötr zemin. **Boş bir afiş kutusu
 * "yükle" davetiyesi gibi durmasın diye** yükleme girişi buraya KONMADI; düzenleme ekranında.
 *
 * KONMAYANLAR (Discord'da var, bizde yok): durum/"Durum Ekle" (sistem desteklemiyor) · rozetler ·
 * sunucu profilleri sekmesi.
 */
interface Props {
  username: string;
  avatarUrl: string | null;
  card: UserCardDto | null;
}

/** Kök CLAUDE.md — TR tarih biçimi "25 Ekim 2023". */
function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ProfileHeader({ username, avatarUrl, card }: Props) {
  const bannerStyle = card?.bannerColor ? { backgroundColor: card.bannerColor } : undefined;

  return (
    <View>
      <View style={[styles.banner, bannerStyle]}>
        {card?.bannerUrl ? (
          <Image source={{ uri: card.bannerUrl }} style={styles.bannerImage} resizeMode="cover" />
        ) : null}
      </View>

      <View style={styles.body}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{username.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <Text style={styles.username}>{username}</Text>

        {card?.bio ? <Text style={styles.bio}>{card.bio}</Text> : null}

        {card?.memberSince ? (
          <Text style={styles.memberSince}>
            {/* `settings.banner.previewMemberSince` web'de zaten "Üyelik tarihi: {date}" — yeni
                anahtar açılmadı. (`profile.memberSince` yalnız etiket, tarih taşımıyor.) */}
            {t('settings.banner.previewMemberSince', { date: formatMemberSince(card.memberSince) })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 120,
    backgroundColor: theme.colors.bgElevated,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  body: {
    paddingHorizontal: theme.layout.panelGap * 1.5,
    // Avatar afişin üstüne biner (Discord düzeni); negatif kenar boşluğu o bindirmeyi verir.
    marginTop: -36,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: theme.colors.bgContent,
    marginBottom: 8,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: 28,
    fontWeight: '700',
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  bio: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    marginTop: 6,
  },
  memberSince: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 8,
  },
});
