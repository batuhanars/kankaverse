import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';
import type { RefItem } from './aiVideoRefs';

const PROMPT_MAX = 1000;
const TAG_CHARS = /^[\p{L}\d]*$/u;

interface Props {
  value: string;
  onChange: (value: string | ((prev: string) => string)) => void;
  items: RefItem[];
  labels: string[];
  thumbs: Record<string, string>;
  editable: boolean;
}

function Thumb({ item, thumb }: { item: RefItem; thumb?: string }) {
  const uri = item.kind === 'image' ? item.uri : thumb;
  if (uri) return <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />;
  return (
    <View style={[styles.thumb, styles.thumbIcon]}>
      <Ionicons
        name={item.kind === 'audio' ? 'musical-notes' : 'videocam'}
        size={16}
        color={theme.colors.textSecondary}
      />
    </View>
  );
}

/**
 * C42 §3.5: düz metin istem kutusu + sağ altta `@` düğmesi. Yazarken `@` girilince (ya da düğmeyle) kutunun
 * hemen üstünde eklerin listesi açılır; seçilen `@Görsel1 ` olarak imlecin olduğu yere eklenir. Liste imleç `@`
 * ile arasında harf/rakamdan başka bir şey kalırsa kapanır; `@` sonrası yazılan harfler listeyi süzer.
 * Alt sayfa değil satır içi liste: klavye açıkken de kutunun üstünde görünür kalır.
 */
export function AiVideoPrompt({ value, onChange, items, labels, thumbs, editable }: Props) {
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [forced, setForced] = useState<{ start: number; end: number } | null>(null);
  const [at, setAt] = useState<number | null>(null); // '@' karakterinin konumu

  const partial = at !== null && at < sel.start && value[at] === '@' ? value.slice(at + 1, sel.start) : null;
  const open = partial !== null && TAG_CHARS.test(partial) && items.length > 0;
  const shown = open
    ? items
        .map((item, i) => ({ item, label: labels[i] }))
        .filter((x) => x.label.toLocaleLowerCase('tr').startsWith((partial ?? '').toLocaleLowerCase('tr')))
    : [];

  function place(pos: number) {
    setForced({ start: pos, end: pos });
  }

  function onText(next: string) {
    if (next.length === value.length + 1) {
      let i = 0;
      while (i < value.length && value[i] === next[i]) i += 1;
      if (next[i] === '@') setAt(i);
    }
    onChange(next);
  }

  function pressAt() {
    const pos = sel.start;
    const next = `${value.slice(0, pos)}@${value.slice(sel.end)}`.slice(0, PROMPT_MAX);
    onChange(next);
    setAt(pos);
    place(pos + 1);
  }

  function pick(label: string) {
    if (at === null) return;
    const insert = `@${label} `;
    const next = `${value.slice(0, at)}${insert}${value.slice(sel.start)}`.slice(0, PROMPT_MAX);
    onChange(next);
    setAt(null);
    place(Math.min(at + insert.length, next.length));
  }

  return (
    <View style={styles.wrap}>
      {open && shown.length ? (
        <View style={styles.list} accessibilityRole="menu">
          {shown.map(({ item, label }) => (
            <Pressable
              key={item.id}
              onPress={() => pick(label)}
              style={styles.row}
              accessibilityRole="menuitem"
              accessibilityLabel={`@${label}`}
            >
              <Thumb item={item} thumb={thumbs[item.id]} />
              <Text style={styles.rowText}>{`@${label}`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View>
        <TextInput
          value={value}
          onChangeText={onText}
          onSelectionChange={(e) => {
            setSel(e.nativeEvent.selection);
            setForced(null);
          }}
          selection={forced ?? undefined}
          maxLength={PROMPT_MAX}
          multiline
          placeholder={t('aiVideo.promptPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          editable={editable}
          style={[styles.input, !editable && styles.off]}
        />
        <Pressable
          onPress={pressAt}
          disabled={!editable || items.length === 0}
          hitSlop={6}
          style={[styles.atButton, (!editable || items.length === 0) && styles.off]}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.aiVideoRefs.atButton')}
          accessibilityHint={items.length === 0 ? t('mobile.aiVideoRefs.atNeedsFile') : undefined}
          accessibilityState={{ disabled: !editable || items.length === 0 }}
        >
          <Text style={styles.atText}>{'@'}</Text>
        </Pressable>
      </View>
      {items.length === 0 ? <Text style={styles.hint}>{t('mobile.aiVideoRefs.atNeedsFile')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: 88,
    maxHeight: 160,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgContent,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    padding: 12,
    paddingBottom: 44,
    textAlignVertical: 'top',
  },
  off: { opacity: 0.5 },
  atButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
  },
  atText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.lg, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  list: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, minHeight: 44 },
  rowText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.md, fontWeight: '600' },
  thumb: { width: 32, height: 32, borderRadius: theme.radius.sm },
  thumbIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bgContent },
});
