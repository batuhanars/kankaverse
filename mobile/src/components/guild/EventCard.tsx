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
  onToggleInterest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function EventCard({ event, canManage, onToggleInterest, onEdit, onDelete }: Props) {
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

          {/* R-c: menü yok, iki aksiyon doğrudan kartta. Düğmeler görsel olarak 28dp; `hitSlop`
              dokunma hedefini 40dp'ye çıkarıyor. Aradaki boşluk (ICON_GAP) iki hitSlop alanı
              **çakışmasın** diye 2 × HIT_SLOP: silme yanlışlıkla tetiklenmesin. */}
          {canManage ? (
            <View style={styles.iconRow}>
              <Pressable
                onPress={onEdit}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel={t('event.edit')}
                hitSlop={HIT_SLOP}
              >
                <Ionicons name="settings-outline" size={18} color={theme.colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={onDelete}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel={t('event.delete')}
                hitSlop={HIT_SLOP}
              >
                <Ionicons name="close-outline" size={20} color={theme.colors.danger} />
              </Pressable>
            </View>
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
      </View>
    </View>
  );
}

const COVER_HEIGHT = 130;
const BODY_PADDING = 14;
/** 28dp düğme + iki yandan 6dp = 40dp dokunma hedefi. */
const HIT_SLOP = 6;
const ICON_GAP = HIT_SLOP * 2;

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
    // Kart dışına taşan bir yüzey kalmadı (R-c ile popover söküldü) → kırpma geri geldi;
    // kapak görselinin üst köşelerini kartın yarıçapına bu kırpıyor.
    overflow: 'hidden',
  },
  cover: { width: '100%', height: COVER_HEIGHT },
  body: { padding: BODY_PADDING, gap: 8 },
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
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: ICON_GAP },
  iconButton: {
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
});
