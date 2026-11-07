import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

interface Props<T extends string | number> {
  label: string;
  options: { value: T; text: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Bundan uzun listede satır sarmaz, yatay kayar (Wan 5-30 sn = 26 seçenek; 2026-11-07 sahip kararı). */
const WRAP_MAX = 6;
const SCROLL_ITEM_MIN_WIDTH = 52;

/** Parçalı seçici (web `AiVideoOptions` çözünürlük/süre grupları). Kısa listede satır sarar, uzunda kayar. */
export function Segmented<T extends string | number>({ label, options, value, onChange }: Props<T>) {
  const scrolls = options.length > WRAP_MAX;
  const scrollRef = useRef<ScrollView>(null);
  const itemX = useRef(new Map<string, number>());

  // Seçili seçenek görünür olsun: açılışta ve model değişip değer düzeltildiğinde ona kaydır.
  useEffect(() => {
    if (!scrolls) return;
    const x = itemX.current.get(String(value));
    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - SCROLL_ITEM_MIN_WIDTH), animated: true });
  }, [scrolls, value]);

  const items = options.map((o) => {
    const on = o.value === value;
    const key = String(o.value);
    return (
      <Pressable
        key={key}
        onPress={() => onChange(o.value)}
        onLayout={
          scrolls
            ? (e) => {
                const first = !itemX.current.has(key);
                itemX.current.set(key, e.nativeEvent.layout.x);
                if (first && on) scrollRef.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - SCROLL_ITEM_MIN_WIDTH), animated: false });
              }
            : undefined
        }
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        style={[styles.item, scrolls && styles.itemScroll, on && styles.itemOn]}
      >
        <Text style={[styles.text, on && styles.textOn]}>{o.text}</Text>
      </Pressable>
    );
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {scrolls ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollRow}
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
        >
          {items}
        </ScrollView>
      ) : (
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
          {items}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scrollRow: { flexDirection: 'row', gap: 8 },
  item: {
    minHeight: theme.layout.inputMinHeight,
    minWidth: 64,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
  },
  // Kayan şeritte daha dar: ekrana daha çok süre sığsın, kaydırılabildiği belli olsun.
  itemScroll: { minWidth: SCROLL_ITEM_MIN_WIDTH, paddingHorizontal: 10 },
  itemOn: { backgroundColor: theme.colors.accent500, borderColor: theme.colors.accent500 },
  text: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },
  textOn: { color: theme.colors.textPrimary },
});
