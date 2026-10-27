import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { EmojiGifSheet } from '@/components/message/EmojiGifSheet';
import { useAuthStore } from '@/stores/auth';
import { usersApi } from '@/api/users';
import { extractErrorMessage } from '@/api/errors';
import { useQuickReactions } from '@/utils/quickReactions';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * C24 §0.3: hızlı tepki şeridini düzenleme. Beş yuva; yuvaya dokun → emoji seçici → `PATCH /users/me`.
 * "Varsayılana dön" boş dizi yollar. Başarıda sunucunun döndüğü kullanıcı store'a yazılır, şerit anında
 * değişir. Doğrulama (tekrar, emoji olmayan) sunucuda; Türkçe hata olduğu gibi gösterilir.
 */
export default function QuickReactionsScreen() {
  const reactions = useQuickReactions();
  const [slot, setSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(next: string[]) {
    setSaving(true);
    setError('');
    try {
      const updated = await usersApi.updateProfile({ quickReactions: next });
      useAuthStore.setState({ user: updated });
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function pick(emoji: string) {
    const index = slot;
    setSlot(null);
    if (index === null || reactions[index] === emoji) return;
    const next = [...reactions];
    // Başka yuvada zaten varsa iki yuva yer değiştirir (asla tekrar yollanmaz).
    const other = next.indexOf(emoji);
    if (other !== -1) next[other] = reactions[index];
    next[index] = emoji;
    void save(next);
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('mobile.quickReactions.title') }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.hint}>{t('mobile.quickReactions.hint')}</Text>
        <View style={styles.row}>
          {reactions.map((emoji, i) => (
            <Pressable
              key={i}
              onPress={() => setSlot(i)}
              disabled={saving}
              style={styles.slot}
              accessibilityRole="button"
              accessibilityLabel={emoji}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => void save([])} disabled={saving} style={styles.reset}>
          {saving ? (
            <ActivityIndicator color={theme.colors.textMuted} />
          ) : (
            <Text style={styles.resetText}>{t('mobile.quickReactions.reset')}</Text>
          )}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <EmojiGifSheet visible={slot !== null} onClose={() => setSlot(null)} onEmojiSelected={pick} showGif={false} useRecent={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: { padding: theme.layout.panelGap * 1.5, gap: 16 },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 8 },
  slot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  emoji: { fontSize: 26 },
  reset: {
    minHeight: theme.layout.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  resetText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
});
