import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { UserCardDto } from '@/api/users';
import { ProfileHeader } from '../me/ProfileHeader';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  username: string;
  avatarUrl: string | null;
  card: UserCardDto | null;
  /** Kimlik kartının içindeki ikon şeridi + "istek gönderildi" bilgisi. Adın hemen ALTINA girer. */
  identityFooter?: ReactNode;
}

/** Kök CLAUDE.md — TR tarih biçimi "26 Şubat 2019". */
function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Sprint M3b §3.2 / R3 §3.2.1 — profil alt-panelinin **gövdesi**. Yukarıdan aşağıya:
 * afiş + binen avatar → ad → ikon şeridi → HAKKIMDA → üyelik tarihi → ROLLER → ORTAK ORTAMLAR →
 * ORTAK KANKALAR. Aksiyon akışı burada DEĞİL (`ProfileSheet`); bu dosya saf sunum.
 *
 * 🔴 **R3 düzeltmesi (sahip görsel karşılaştırması):** ilk uygulama her şeyi tek ekrana
 * **sığdırmaya** çalışıyordu, ortak ortamlar listesi ekranın dibinde kesiliyordu. Artık gövde
 * kaydırılıyor (`ProfileSheet`teki `ScrollView`) ve burada hiçbir listeye yükseklik sınırı ya da
 * `slice` uygulanmıyor — kesilen bölüm kalmadı.
 *
 * 🔴 Afiş + avatar bindirmesi `ProfileHeader` ile **yeniden kullanılıyor**, kopyalanmıyor: o
 * bileşende Android'e özgü iki cihaz kusurunun düzeltmesi var (negatif kenar boşluğu kırpması ve
 * yarı saydam yedek avatarın afişi geçirmesi). `showDetails={false}` ile yalnız bio/üyelik satırları
 * kapatılıyor — ikisi burada **başlıklı bölüm** olarak çiziliyor ve aralarına ikon şeridi giriyor.
 *
 * 🔴 **Boş bölüm hiç çizilmez** (başlık bile yok): bio yok → HAKKIMDA yok, ortak yok → satır yok,
 * rol yok → ROLLER yok. Bizde karşılığı olmayan Discord bölümleri (Bağlantılar · Not · Uygulamalar ·
 * Sunuculara Davet Et · Ses Ayarları) hiç konmadı, boş hâlleriyle bile.
 * 🔴 Discord'un "kullanıcı adı" ikinci satırı ve "Yani/aka" satırı YOK — bizde `username` tek kimlik,
 * ikinci satır tekrar olurdu.
 */
export function ProfileSheetBody({ username, avatarUrl, card, identityFooter }: Props) {
  const mutualGuilds = card?.mutualGuilds ?? [];
  const mutualFriends = card?.mutualFriends ?? [];
  const roles = card?.roles ?? [];

  return (
    <View>
      <ProfileHeader
        username={username}
        avatarUrl={avatarUrl}
        card={card}
        surfaceColor={theme.colors.bgSidebar}
        // bio + üyelik tarihi aşağıda başlıklı bölüm olarak çiziliyor (R3 yerleşimi).
        showDetails={false}
      />

      {identityFooter ? <View style={styles.identityFooter}>{identityFooter}</View> : null}

      {card?.bio ? (
        <View style={styles.section}>
          {/* `settings.bioLabel` web'de zaten "Hakkımda" — yeni anahtar açılmadı. */}
          <Text style={styles.sectionTitle}>{t('settings.bioLabel')}</Text>
          <Text style={styles.bio}>{card.bio}</Text>
        </View>
      ) : null}

      {card?.memberSince ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.memberSince')}</Text>
          <Text style={styles.value}>{formatMemberSince(card.memberSince)}</Text>
        </View>
      ) : null}

      {roles.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('userCard.rolesTitle')}</Text>
          <View style={styles.chipRow}>
            {roles.map((role) => (
              <View key={role.id} style={styles.roleChip}>
                {/* Rol rengi sunucudan gelen serbest bir hex — token'a çevrilmez, rolün KENDİ
                    kimliği. Metin token rengiyle çizilir ki koyu/açık rollerde okunaklı kalsın. */}
                <View style={[styles.roleDot, { backgroundColor: role.color }]} />
                <Text style={styles.roleName} numberOfLines={1}>
                  {role.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {mutualGuilds.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('profile.mutualGuildsCount', { count: mutualGuilds.length })}
          </Text>
          {/* Satırlar dokunulabilir DEĞİL: dokununca gidilecek bir "ortak ortam" yüzeyi yok,
              tıklayınca hiçbir şey yapmayan şey konmaz (mobile/CLAUDE.md). Bilgi, düğme değil. */}
          {mutualGuilds.map((guild) => (
            <View key={guild.id} style={styles.mutualRow}>
              {guild.iconUrl ? (
                <Image source={{ uri: guild.iconUrl }} style={styles.mutualIcon} />
              ) : (
                <View style={[styles.mutualIcon, styles.mutualIconFallback]}>
                  <Text style={styles.mutualIconText}>{guild.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.mutualName} numberOfLines={1}>
                {guild.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {mutualFriends.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('profile.mutualFriendsCount', { count: mutualFriends.length })}
          </Text>
          {mutualFriends.map((friend) => (
            <View key={friend.id} style={styles.mutualRow}>
              {friend.avatarUrl ? (
                <Image source={{ uri: friend.avatarUrl }} style={styles.mutualAvatar} />
              ) : (
                <View style={[styles.mutualAvatar, styles.mutualIconFallback]}>
                  <Text style={styles.mutualIconText}>{friend.username.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.mutualName} numberOfLines={1}>
                {friend.username}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const ICON = 28;
const GUTTER = theme.layout.panelGap * 1.5;

const styles = StyleSheet.create({
  // İkon şeridi adın hemen altında, kimlik kartının içinde (R3 §3.2.1/3).
  identityFooter: {
    paddingHorizontal: GUTTER,
    paddingTop: 12,
  },
  section: {
    paddingHorizontal: GUTTER,
    paddingTop: theme.layout.panelGap,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bio: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  value: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
  },
  roleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  roleName: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  mutualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  // Ortam simgesi kare-yuvarlak, kullanıcı avatarı daire — tasarım sistemi kuralı.
  mutualIcon: {
    width: ICON,
    height: ICON,
    borderRadius: theme.radius.sm,
  },
  mutualAvatar: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
  },
  mutualIconFallback: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutualIconText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  mutualName: {
    flex: 1,
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
  },
});
