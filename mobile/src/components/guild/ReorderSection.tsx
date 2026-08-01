import { StyleSheet, Text, View } from 'react-native';
import { NestedReorderableList, reorderItems } from 'react-native-reorderable-list';
import { ReorderRow, type ReorderRowData } from './ReorderRow';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1i R1 — tek ekranda birden çok sıralanabilir liste.
 *
 * `NestedReorderableList` bir `ScrollViewContainer` içinde yaşamak üzere tasarlandı; normal
 * `ReorderableList` iç içe kullanılırsa dıştaki kaydırma ile çakışır. Kategoriler ve her
 * kategorinin kanalları ayrı ayrı sürüklenebilir olmalı ama **tek ekranda** durmalı: sahip
 * "kategori sıralama var da kanal yok mu" diye sordu, çünkü kanal sıralaması ayrı ayrı yerlere
 * dağılmıştı ve görünmüyordu.
 */
interface Props {
  title: string;
  rows: ReorderRowData[];
  onReorder: (next: ReorderRowData[]) => void;
  /** Tek satırlı listede sürükleyecek bir şey yok — başlık yine yazılır, liste sönük durur. */
  emptyHint?: string;
}

export function ReorderSection({ title, rows, onReorder, emptyHint }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title.toLocaleUpperCase('tr')}</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{emptyHint ?? t('mobile.reorder.empty')}</Text>
      ) : (
        <NestedReorderableList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          scrollEnabled={false}
          onReorder={({ from, to }) => onReorder(reorderItems(rows, from, to))}
          renderItem={({ item }) => <ReorderRow row={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 18 },
  title: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 8,
  },
  list: { paddingHorizontal: theme.layout.panelGap, gap: 8 },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.layout.panelGap,
  },
});
