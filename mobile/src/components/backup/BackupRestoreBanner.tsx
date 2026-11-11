import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { dismissBackupBanner, selectShowBanner, useE2eeBackupStore } from '@/stores/e2eeBackup';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Geri yükleme bandı (E5a §4.4-3): yedek kurulu ama bu cihazda kilitliyse DM listesinin üstünde çıkar.
 * Kapatılınca bu oturumda tekrar çıkmaz; ayarlardan erişilebilir. Başka cihazda anahtar geçersizleşince de
 * (key-dropped) aynı bant açılır, ayrı bildirim yok.
 */
export function BackupRestoreBanner() {
  const router = useRouter();
  const show = useE2eeBackupStore(selectShowBanner);
  if (!show) return null;

  return (
    <View style={styles.bar} accessibilityRole="summary">
      <Text style={styles.text}>{t('e2ee.backup.banner.text')}</Text>
      <View style={styles.actions}>
        <Pressable onPress={dismissBackupBanner} hitSlop={8}>
          <Text style={styles.dismiss}>{t('e2ee.backup.banner.dismiss')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/backup-password', params: { mode: 'unlock' } })}
          hitSlop={8}
        >
          <Text style={styles.action}>{t('e2ee.backup.banner.action')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: theme.layout.panelGap,
    marginBottom: 8,
    padding: 12,
    gap: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  text: { color: theme.colors.textPrimary, fontSize: theme.fontSize.sm, lineHeight: 19 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  dismiss: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
  action: { color: theme.colors.accent500, fontSize: theme.fontSize.sm, fontWeight: '700' },
});
