import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ShareTargetList, type ShareTarget } from '../share/ShareTargetList';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  sending: boolean;
  error: string;
  onSend: (target: ShareTarget) => void;
  onClose: () => void;
}

/**
 * C49 R1: "Kaydet ve gönder" hedef seçici. AiVideoSheet zaten bir RN `Modal`; ikinci bir `Modal` açmak
 * yerine sayfanın İÇİNDE tam kaplayan katman olarak çizilir (Android'de iç içe Modal klavye/geri tuşu
 * sorunları çıkarır). Liste C41'in `ShareTargetList`i, değiştirilmeden.
 */
export function AiVideoTargetPicker({ sending, error, onSend, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<ShareTarget | null>(null);
  return (
    <View style={styles.cover}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('aiVideo.sendTargetTitle')}</Text>
        <Pressable onPress={onClose} disabled={sending} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('mobile.share.searchPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
        />
      </View>
      <View style={styles.list}>
        <ShareTargetList query={query} selectedId={target?.id ?? null} disabled={sending} onSelect={setTarget} />
      </View>
      <View style={styles.footer}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          onPress={() => target && onSend(target)}
          disabled={!target || sending}
          style={[styles.send, (!target || sending) && styles.off]}
          accessibilityRole="button"
        >
          {sending ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.sendText}>{t('aiVideo.saveAndSend')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.bgSidebar,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 14,
  },
  title: { color: theme.colors.textPrimary, fontSize: theme.fontSize.xl, fontWeight: '700' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: theme.layout.panelGap,
    paddingHorizontal: 14,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgContent,
  },
  searchInput: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
  list: { flex: 1 },
  footer: {
    padding: theme.layout.panelGap,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  send: {
    minHeight: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
  },
  off: { opacity: 0.5 },
  sendText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.md, fontWeight: '700' },
});
