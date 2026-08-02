import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

export type ChannelDetailsTab = 'members' | 'media' | 'pins' | 'links' | 'files';

interface TabDef {
  key: ChannelDetailsTab;
  label: string;
}

interface Props {
  active: ChannelDetailsTab;
  tabs: TabDef[];
  onChange: (tab: ChannelDetailsTab) => void;
}

/**
 * Sprint M2c contract §4.3 — beş sekme (Üyeler·Medya·Sabitlemeler·Bağlantılar·Dosyalar), yatay
 * kaydırılabilir çubukta (beşi dar ekrana sığmaz — Discord'da da kaydırmalı).
 *
 * `SearchTabs` (M1g, `guild-search.tsx`) İLE AYNI görsel dil (alt çizgili aktif sekme) — desen
 * BİREBİR buradan alındı. Ayrı, küçük bir bileşen olarak yazıldı (kopyalanmadı): `SearchTabs`ı
 * jenerikleştirmek `guild-search.tsx`/`SearchResults.tsx`ı (çalışan, bu sözleşmenin kapsamı
 * dışındaki bir özellik) değiştirmeyi gerektirirdi — risk/kazanç dengesi buna değmedi.
 */
export function ChannelDetailsTabBar({ active, tabs, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  row: { paddingHorizontal: theme.layout.panelGap, gap: 4 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: theme.colors.accent500 },
  label: { color: theme.colors.textMuted, fontSize: theme.fontSize.base, fontWeight: '600' },
  labelActive: { color: theme.colors.accent500, fontWeight: '700' },
});
