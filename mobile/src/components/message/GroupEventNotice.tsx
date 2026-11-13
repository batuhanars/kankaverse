import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GroupDmEventDto } from '@/api/dm';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** C64: olay metni (sozlesme 4): ben ekledim/cikardim, beni eklediler/cikardilar, ayrildim ayrimi. */
export function groupEventText(e: GroupDmEventDto, myId: string | undefined): string {
  const actor = e.actor?.username ?? '';
  const target = e.target.username;
  const byMe = !!myId && e.actor?.id === myId;
  const meTarget = !!myId && e.target.id === myId;
  if (e.kind === 'MEMBER_LEFT') return meTarget ? t('groupEvent.leftMe') : t('groupEvent.left', { target });
  const prefix = e.kind === 'MEMBER_ADDED' ? 'added' : 'removed';
  if (byMe) return t(`groupEvent.${prefix}ByMe`, { target });
  if (meTarget) return t(`groupEvent.${prefix}Me`, { actor });
  return t(`groupEvent.${prefix}`, { actor, target });
}

const ICON = {
  MEMBER_ADDED: 'person-add-outline',
  MEMBER_LEFT: 'exit-outline',
  MEMBER_REMOVED: 'person-remove-outline',
} as const;

/** Mesaj degildir: dokunulamaz, menusu yok; `E2eeDeviceNotice` ile ayni gri dil. */
export function GroupEventNotice({ event, myId }: { event: GroupDmEventDto; myId: string | undefined }) {
  const label = groupEventText(event, myId);
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={label}>
      <View style={styles.chip}>
        <Ionicons name={ICON[event.kind]} size={11} color={theme.colors.textMuted} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', marginTop: 14, paddingHorizontal: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    maxWidth: '100%',
  },
  label: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, fontWeight: '600', flexShrink: 1 },
});
