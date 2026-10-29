import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GuildMemberDto } from '@/api/guilds';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Üye listesi satırı (M1e §2.3): avatar · kullanıcı adı · **rol rozetleri** · sağ ok.
 *
 * Rozetler `GuildMemberDto.roles` içinde HAZIR geliyor (ad + hex renk); rozet çizmek için ayrıca
 * `GET /guilds/:id/roles` çağrılmıyor.
 *
 * Ortam rolü (OWNER) ayrı bir rozet olarak gösterilir: özel rollerden farklı bir kavram (hiyerarşi),
 * rol listesine karıştırılmaz.
 * 🔴 Sprint R20 — enum-ADMIN kaldırıldı; rozet artık YALNIZ OWNER için (`member.role.ADMIN` i18n
 * anahtarı web tarafından silindi, web `GuildMemberRow.vue` de aynı şekilde yalnız OWNER'ı gösteriyor
 * — iki istemci tutarlı). Yerine yeni bir rozet uydurulmadı.
 */
interface Props {
  member: GuildMemberDto;
  /** C31b: oynadığı oyunun adı (sunucudan; görünürlük sunucuda). Yoksa satır çizilmez. */
  gameName?: string | null;
  onPress: () => void;
}

/** Satır taşmasın: fazlası "+N". */
const MAX_BADGES = 3;

export function MemberRow({ member, gameName, onPress }: Props) {
  const shown = member.roles.slice(0, MAX_BADGES);
  const rest = member.roles.length - shown.length;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      {member.avatarUrl ? (
        <Image source={{ uri: member.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <View style={styles.avatarTint} />
          <Text style={styles.avatarLetter}>{member.username.charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.username} numberOfLines={1}>
          {member.username}
          {member.roleEmoji ? ` ${member.roleEmoji}` : ''}
        </Text>
        {gameName ? (
          <Text style={styles.playing} numberOfLines={1}>
            {t('activity.playing', { game: gameName })}
          </Text>
        ) : null}

        <View style={styles.badges}>
          {/* `member.role.OWNER` web'de zaten var. Eskiden `member.role.${member.role}` şablonu
              ADMIN'i de kapsıyordu; enum-ADMIN kalktığı için (ve i18n anahtarı web'den silindiği
              için) koşul BİLİNÇLİ olarak OWNER'a daraltıldı — aksi halde artık var olmayan bir
              anahtara bakılırdı. */}
          {member.role === 'OWNER' && (
            <View style={[styles.badge, styles.roleBadge]}>
              <Text style={styles.roleBadgeText}>{t('member.role.OWNER')}</Text>
            </View>
          )}
          {shown.map((r) => (
            <View key={r.id} style={styles.badge}>
              <View style={[styles.dot, { backgroundColor: r.color }]} />
              <Text style={styles.badgeText} numberOfLines={1}>
                {r.name}
              </Text>
            </View>
          ))}
          {rest > 0 && <Text style={styles.rest}>+{rest}</Text>}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const AVATAR = 40;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: theme.layout.panelGap,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.accentSubtle,
  },
  avatarLetter: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  playing: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.bgElevated,
    maxWidth: 150,
  },
  roleBadge: {
    backgroundColor: theme.colors.accentSubtle,
  },
  roleBadgeText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgeText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
  rest: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
});
