import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FriendDto } from '@/api/friends';
import { t } from '@/i18n';
import { theme } from '@/theme';

export type FriendPickerSelection =
  | { mode: 'single'; onSelect: (friend: FriendDto) => void; busyId?: string | null }
  | { mode: 'multi'; selectedIds: Set<string>; onToggle: (userId: string) => void; maxReached: boolean };

interface Props {
  friends: FriendDto[];
  query: string;
  selection: FriendPickerSelection;
  /** Kanka listesi TAMAMEN boşsa (arama sonucu değil) gösterilir — ekranlar bağlama göre süsler
   *  (Yeni Grup ekranı ayrıca "Kanka Ekle" yönlendirmesi ekler, Yeni Mesaj eklemez; sözleşme §13/5). */
  emptyComponent: ReactNode;
}

interface Section {
  title: string;
  data: FriendDto[];
}

function filterFriends(friends: FriendDto[], query: string): FriendDto[] {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return friends;
  return friends.filter((f) => f.user.username.toLocaleLowerCase('tr').includes(q));
}

// 🔴 Sözleşme §13 tuzağı #2 — Türkçe yerelle sıralama + harf başlığı (`localeCompare('tr')` /
// `toLocaleUpperCase('tr')`). İngilizce sıralamada İ/I/Ö/Ş/Ü yanlış yere düşer; Türkiye pazarı için
// yazılan bir uygulamada bu görünür bir kusur olurdu.
function buildSections(friends: FriendDto[]): Section[] {
  const sorted = [...friends].sort((a, b) => a.user.username.localeCompare(b.user.username, 'tr'));
  const sections: Section[] = [];
  for (const friend of sorted) {
    const letter = friend.user.username.charAt(0).toLocaleUpperCase('tr');
    const current = sections[sections.length - 1];
    if (current && current.title === letter) current.data.push(friend);
    else sections.push({ title: letter, data: [friend] });
  }
  return sections;
}

/**
 * Sprint M1b Revizyon R2 (§13) — "alfabetik gruplu kanka listesi" Yeni Mesaj (tekli seçim → DM
 * başlatır) ve Yeni Grup (çoklu seçim, kutulu) ekranlarında birebir aynı görünüm/gruplama/sıralama
 * mantığını taşıyor. Aynı sprintte iki gerçek kullanım + tek prop farkı (`selection.mode`) — Rule
 * of Three'yi baştan karşılıyor, bu yüzden inline yerine paylaşılan bileşen olarak yazıldı
 * (kök CLAUDE.md dosya-boyu drift dersi: iki ekranın kendi kopyasını tutması ilk günden 250+ satır
 * tekrar demekti).
 */
export function FriendPickerList({ friends, query, selection, emptyComponent }: Props) {
  if (friends.length === 0) {
    return <View style={styles.emptyFlex}>{emptyComponent}</View>;
  }

  const sections = buildSections(filterFriends(friends, query));

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.user.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
      renderItem={({ item }) => {
        const isSelected = selection.mode === 'multi' && selection.selectedIds.has(item.user.id);
        const isBusy = selection.mode === 'single' && selection.busyId === item.user.id;
        const disabled =
          selection.mode === 'single' ? Boolean(selection.busyId) : selection.maxReached && !isSelected;

        function onPress() {
          if (selection.mode === 'single') {
            selection.onSelect(item);
            return;
          }
          selection.onToggle(item.user.id);
        }

        return (
          <Pressable
            onPress={onPress}
            disabled={disabled}
            style={[styles.row, isSelected && styles.rowSelected, disabled && styles.rowDisabled]}
          >
            {selection.mode === 'multi' && (
              <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                {isSelected && <Ionicons name="checkmark" size={12} color={theme.colors.textPrimary} />}
              </View>
            )}
            {item.user.avatarUrl ? (
              <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{item.user.username.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.name} numberOfLines={1}>
              {item.user.username}
            </Text>
            {isBusy && <ActivityIndicator color={theme.colors.accent500} size="small" />}
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.empty}>{t('search.empty')}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  emptyFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  sectionHeader: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
  },
  rowSelected: {
    backgroundColor: theme.colors.accentSubtle,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent500,
    borderColor: theme.colors.accent500,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  center: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
});
