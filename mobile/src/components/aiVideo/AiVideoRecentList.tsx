import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AiVideoDto } from '@/api/aiVideo';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  rows: AiVideoDto[];
  statusLabel: (row: AiVideoDto) => string;
  onOpen: (row: AiVideoDto) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/**
 * "Son üretimler" (web `AiVideoRecentList`): satırda düğme yok, yalnız çöp simgesi (QUEUED/RUNNING'de yok).
 * Biten satır önizler, süren satır ilerlemeyi açar; başarısız satır hata metniyle durur, dokunulmaz.
 */
export function AiVideoRecentList({ rows, statusLabel, onOpen, onRemove, onClear }: Props) {
  if (!rows.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('aiVideo.recent')}</Text>
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
          <Text style={styles.clear}>{t('aiVideo.clearAll')}</Text>
        </Pressable>
      </View>
      {rows.map((r) => {
        const tappable = r.status !== 'FAILED' && r.status !== 'QUOTED';
        const removable = r.status !== 'QUEUED' && r.status !== 'RUNNING';
        return (
          <View key={r.id} style={styles.row}>
            <Pressable disabled={!tappable} onPress={() => onOpen(r)} style={styles.main} accessibilityRole="button">
              <Text style={styles.prompt} numberOfLines={1}>
                {r.prompt || t('aiVideo.fromImage')}
              </Text>
              <Text style={[styles.status, r.status === 'FAILED' && styles.failed]} numberOfLines={2}>
                {statusLabel(r)}
              </Text>
            </Pressable>
            {removable ? (
              <Pressable
                onPress={() => onRemove(r.id)}
                accessibilityRole="button"
                accessibilityLabel={t('aiVideo.deleteOne')}
                style={styles.trash}
              >
                <Ionicons name="trash-outline" size={20} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  clear: { color: theme.colors.danger, fontSize: theme.fontSize.sm, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  prompt: { color: theme.colors.textPrimary, fontSize: theme.fontSize.md },
  status: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
  failed: { color: theme.colors.danger },
  trash: {
    width: theme.layout.inputMinHeight,
    height: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
