import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1g R2 — arama sekmeleri (sahip revizesi 2026-08-01).
 *
 * 🔴 **Discord'un sekme listesi BİREBİR alınmadı, elenerek alındı.** Discord'da yedi sekme var;
 * bizde arkası dolu olan beşi kondu:
 *
 * | Discord | Bizde |
 * |---|---|
 * | Yeni (Önerilen) | ❌ kanal aktiflik/öneri verisi yok |
 * | Üyeler · Kanallar | ✅ liste var, dokununca profil/kanal açılır |
 * | Medya · Bağlantılar | ✅ `has=file` / `has=link` |
 * | Sabitlemeler | ✅ M1h'te açıldı (`GET /channels/:id/pins`) |
 *
 * Sekmelerin asıl kazancı şu: **hiç yazmadan gezinebilmek.** Üye ve kanal listeleri zaten
 * çekiliyor, boş sorguda da gösterilebilir — önceki tasarım "önce yaz" diyordu.
 */
export type SearchTab = 'messages' | 'members' | 'channels' | 'media' | 'links' | 'pins';

const TABS: { key: SearchTab; labelKey: string }[] = [
  { key: 'messages', labelKey: 'mobile.guildSearch.tabMessages' },
  { key: 'members', labelKey: 'mobile.guildSearch.tabMembers' },
  { key: 'channels', labelKey: 'mobile.guildSearch.tabChannels' },
  { key: 'media', labelKey: 'mobile.guildSearch.tabMedia' },
  { key: 'links', labelKey: 'mobile.guildSearch.tabLinks' },
  { key: 'pins', labelKey: 'mobile.guildSearch.tabPins' },
];

interface Props {
  active: SearchTab;
  onChange: (tab: SearchTab) => void;
}

export function SearchTabs({ active, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Text style={[styles.label, isActive && styles.labelActive]}>{t(tab.labelKey)}</Text>
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
  // Aktif sekme ALT ÇİZGİYLE işaretlenir (Discord da öyle) — zemin dolgusu dar şeritte
  // sekmeleri birbirine yapıştırıyordu.
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
