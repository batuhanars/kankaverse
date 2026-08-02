import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EventDto } from '@/api/events';
import { formatEventRange } from '@/utils/eventDate';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1j §3.3 — etkinlik kartı. Web `EventsModal.vue` kartının mobil karşılığı.
 *
 * 🔴 Tarih `occurrenceStartAt`tan okunur, `startAt`tan DEĞİL — tekrarlayan etkinliğin bir sonraki
 * örneğini backend hesaplar (sözleşme §2).
 *
 * Açıklama **düz metin**: mobilde markdown boru hattı hiç yok (mesajlar bile düz metin + mention),
 * etkinlik için tek başına markdown getirmek kapsam dışı (sözleşme §1 OUT). Satır sonları korunur.
 */
interface Props {
  event: EventDto;
  canManage: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onToggleInterest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function EventCard({
  event,
  canManage,
  menuOpen,
  onToggleMenu,
  onToggleInterest,
  onEdit,
  onDelete,
}: Props) {
  const location =
    event.locationType === 'VOICE_CHANNEL'
      ? `🔊 ${event.channelName ?? ''}`
      : `📍 ${event.externalLocation ?? ''}`;

  return (
    <View style={styles.card}>
      {/* Kapak yalnız coverImageUrl DOLU geldiğinde çizilir — dolu olması taramanın CLEAN olduğu
          anlamına gelir (backend kararı). İstemci scan durumu yorumlamaz (sözleşme §5). */}
      {event.coverImageUrl ? (
        <Image source={{ uri: event.coverImageUrl }} style={styles.cover} resizeMode="cover" />
      ) : null}

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.date}>
              {formatEventRange(event.occurrenceStartAt, event.occurrenceEndAt)}
            </Text>
            <Text style={styles.name} numberOfLines={2}>
              {event.name}
            </Text>
            <Text style={styles.location} numberOfLines={1}>
              {location}
            </Text>
          </View>

          {canManage ? (
            <Pressable
              onPress={onToggleMenu}
              style={styles.menuButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.settings')}
              hitSlop={8}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {event.status === 'ACTIVE' || event.recurrence !== 'NONE' ? (
          <View style={styles.badgeRow}>
            {event.status === 'ACTIVE' ? (
              <View style={[styles.badge, styles.activeBadge]}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>{t('event.card.active')}</Text>
              </View>
            ) : null}
            {event.recurrence !== 'NONE' ? (
              <View style={[styles.badge, styles.recurrenceBadge]}>
                <Text style={styles.recurrenceText}>
                  🔁 {t(`event.recurrence.${event.recurrence.toLowerCase()}`)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {event.description ? (
          <Text style={styles.description} numberOfLines={6}>
            {event.description}
          </Text>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={onToggleInterest}
            style={[styles.interestButton, event.interestedByMe && styles.interestButtonOn]}
            accessibilityRole="button"
          >
            <Ionicons
              name={event.interestedByMe ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={16}
              color={event.interestedByMe ? theme.colors.success : theme.colors.textSecondary}
            />
            <Text style={[styles.interestText, event.interestedByMe && styles.interestTextOn]}>
              {t('event.interested')}
            </Text>
          </Pressable>
          <Text style={styles.count}>
            {t('event.interestedCount', { count: String(event.interestedCount) })}
          </Text>
        </View>

        {/* ⋯ menüsü kartın İÇİNDE açılır (ayrı Modal değil): liste zaten bir sheet Modal'ı,
            üstüne ikinci bir sheet yığmak Android'de kırılgan. Silme onayı zaten Modal açacak. */}
        {menuOpen && canManage ? (
          <View style={styles.menu}>
            <Pressable onPress={onEdit} style={styles.menuItem}>
              <Ionicons name="pencil-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.menuText}>{t('event.edit')}</Text>
            </Pressable>
            <Pressable onPress={onDelete} style={styles.menuItem}>
              <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
              <Text style={[styles.menuText, styles.menuTextDanger]}>{t('event.delete')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  cover: { width: '100%', height: 130 },
  body: { padding: 14, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleBlock: { flex: 1, gap: 2 },
  date: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  name: { color: theme.colors.textPrimary, fontSize: theme.fontSize.lg, fontWeight: '700' },
  location: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  menuButton: {
    width: theme.layout.controlSm,
    height: theme.layout.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  activeBadge: { backgroundColor: 'rgba(61, 180, 110, 0.15)' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.success },
  activeText: { color: theme.colors.success, fontSize: theme.fontSize.xs, fontWeight: '700' },
  recurrenceBadge: { backgroundColor: theme.colors.accentSubtle },
  recurrenceText: { color: theme.colors.accent500, fontSize: theme.fontSize.xs, fontWeight: '600' },
  description: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, lineHeight: 19 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  interestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  interestButtonOn: {
    borderColor: theme.colors.success,
    backgroundColor: 'rgba(61, 180, 110, 0.15)',
  },
  interestText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  interestTextOn: { color: theme.colors.success },
  count: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  menu: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    paddingTop: 6,
    gap: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 4,
  },
  menuText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.base },
  menuTextDanger: { color: theme.colors.danger },
});
