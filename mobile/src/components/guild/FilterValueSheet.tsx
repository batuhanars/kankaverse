import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChannelSummaryDto } from '@/api/channels';
import type { GuildMemberDto } from '@/api/guilds';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import type { FilterKind } from './SearchFilterMenu';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1g R2 — filtre TÜRÜ seçildikten sonra **değerini** seçtiren panel.
 *
 * Üç ayrı liste değil tek panel: `from`/`mentions` üye listesi, `in` kanal listesi, `has` iki
 * seçenek. Üçü de aynı etkileşim (ara → dokun → token düşer), ayrı bileşenlere bölmek aynı kodu
 * üç kez yazmak olurdu.
 *
 * Seçim ANINDA token'a dönüşür; "Uygula" yok (sahip revizesi — bkz. `SearchFilterMenu`).
 */
interface Props {
  kind: FilterKind;
  channels: ChannelSummaryDto[];
  members: GuildMemberDto[];
  onSelect: (value: string, label: string) => void;
  onClose: () => void;
}

export function FilterValueSheet({ kind, channels, members, onSelect, onClose }: Props) {
  const bottomInset = useSheetInsets();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (kind === 'has') {
      return [
        { value: 'link', label: t('guildSearch.has.link') },
        { value: 'file', label: t('guildSearch.has.file') },
      ];
    }
    if (kind === 'in') {
      return channels
        .filter((c) => !q || (c.name ?? '').toLowerCase().includes(q))
        .map((c) => ({ value: c.id, label: c.name ?? '' }));
    }
    return members
      .filter((m) => !q || m.username.toLowerCase().includes(q))
      .map((m) => ({ value: m.userId, label: m.username }));
  }, [kind, channels, members, query]);

  const searchable = kind !== 'has';
  const emptyKey = kind === 'in' ? 'guildSearch.noChannels' : 'guildSearch.noMembers';

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{t(`guildSearch.cat.${kind}`)}</Text>

          {searchable ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.input}
              placeholder={t(kind === 'in' ? 'guildSearch.selectChannel' : 'guildSearch.selectMember')}
              placeholderTextColor={theme.colors.textMuted}
              autoCorrect={false}
              autoFocus
            />
          ) : null}

          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {rows.length === 0 ? (
              <Text style={styles.empty}>{t(emptyKey)}</Text>
            ) : (
              rows.map((r) => (
                <Pressable key={r.value} onPress={() => onSelect(r.value, r.label)} style={styles.row}>
                  <Ionicons
                    name={kind === 'in' ? 'pricetag-outline' : 'person-outline'}
                    size={16}
                    color={theme.colors.textMuted}
                  />
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {r.label}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '70%',
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginTop: 10,
    marginBottom: 4,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 8,
    paddingBottom: 10,
  },
  input: {
    marginHorizontal: theme.layout.panelGap,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    paddingHorizontal: 12,
  },
  list: { padding: theme.layout.panelGap, gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  rowLabel: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  empty: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
});
