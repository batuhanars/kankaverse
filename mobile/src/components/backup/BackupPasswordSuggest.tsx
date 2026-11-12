import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { suggestBackupPassword } from '@kankaverse/e2ee-core';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  ctx: { username: string; email: string };
  /** Alandaki şifre; kullanıcı öneriden farklı bir şey yazarsa kutu kapanır. */
  current: string;
  /** Öneri iki alana (şifre + tekrar) birden yazılır. */
  onUse: (password: string) => void;
  disabled?: boolean;
}

/**
 * "Güçlü şifre öner" (sahip kararı 2026-11-12, web `BackupPasswordModal` ile aynı davranış): öneri
 * `suggestBackupPassword`'dan (e2ee-core, güvenli rastgelelik), görünür kutuda kopyalanabilir, not hatırlatmasıyla.
 * Zorunlu değil: kullanıcı kendi şifresini yazmaya devam edebilir. Öneri yalnız bu bileşenin state'inde yaşar.
 */
export function BackupPasswordSuggest({ ctx, current, onUse, disabled }: Props) {
  const [suggested, setSuggested] = useState('');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function suggest() {
    const pw = suggestBackupPassword(ctx);
    setSuggested(pw);
    setCopied(false);
    onUse(pw);
  }

  async function copy() {
    await Clipboard.setStringAsync(suggested);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  const showBox = suggested !== '' && suggested === current;

  return (
    <View style={styles.wrap}>
      <Pressable onPress={suggest} disabled={disabled} accessibilityRole="button" style={styles.suggestButton}>
        <Ionicons name="key-outline" size={16} color={theme.colors.accent500} />
        <Text style={styles.suggestText}>{t('e2ee.backup.suggest.button')}</Text>
      </Pressable>
      {showBox ? (
        <View style={styles.box}>
          <Text style={styles.boxTitle}>{t('e2ee.backup.suggest.title')}</Text>
          <View style={styles.row}>
            <Text style={styles.password} selectable>
              {suggested}
            </Text>
            <Pressable onPress={() => void copy()} accessibilityRole="button" hitSlop={8} style={styles.copy}>
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copied ? theme.colors.success : theme.colors.textSecondary}
              />
              <Text style={styles.copyText}>
                {copied ? t('e2ee.backup.suggest.copied') : t('e2ee.backup.suggest.copy')}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>{t('e2ee.backup.suggest.hint')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 6 },
  suggestButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  suggestText: { color: theme.colors.accent500, fontSize: theme.fontSize.sm, fontWeight: '700' },
  box: {
    gap: 6,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
  },
  boxTitle: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  password: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  hint: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, lineHeight: 19 },
});
