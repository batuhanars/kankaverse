import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Ortam etiketleri (C6 — Keşfet için). Ekle/çıkar çipleri.
 *
 * Sunucu etiketleri **normalize ediyor** (`normalizeTags`: trim + küçük harf + boş ele +
 * tekilleştir) ve her etiket en fazla 30 karakter. İstemci aynı normalizeyi yazarken uygular:
 * kullanıcıya reddedilecek bir şey yazdırıp sonra hata göstermek kötü tasarım (kanal adı deseninin
 * aynısı).
 */
interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
}

const TAG_MAX_LEN = 30;
/** Sunucu tarafında da sınır var; burada erken söylenir. */
const TAG_MAX_COUNT = 5;

export function TagEditor({ tags, onChange }: Props) {
  const [draft, setDraft] = useState('');

  function add() {
    const value = draft.trim().toLocaleLowerCase('tr').slice(0, TAG_MAX_LEN);
    if (!value || tags.includes(value) || tags.length >= TAG_MAX_COUNT) return;
    onChange([...tags, value]);
    setDraft('');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {tags.map((tag) => (
          <View key={tag} style={styles.chip}>
            <Text style={styles.chipText}>{tag}</Text>
            <Pressable onPress={() => onChange(tags.filter((x) => x !== tag))} hitSlop={6}>
              <Ionicons name="close" size={14} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        ))}
      </View>

      {/* Sınıra ulaşınca giriş HİÇ render edilmez: dolu bir kutuya yazdırıp reddetmek yerine
          neden yazamadığı açıkça söylenir. */}
      {tags.length >= TAG_MAX_COUNT ? (
        <Text style={styles.full}>{t('guildSettings.featuresFull')}</Text>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={(v) => setDraft(v.slice(0, TAG_MAX_LEN))}
            placeholder={t('guildSettings.featurePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={add}
          />
          <Pressable onPress={add} style={styles.addButton}>
            <Text style={styles.addText}>{t('guildSettings.featureAdd')}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.hint}>{t('guildSettings.featuresHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.bgElevated,
  },
  chipText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: 12,
  },
  addButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  full: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 17 },
});
