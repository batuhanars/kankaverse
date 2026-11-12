import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  dismissHistoryBanner,
  evaluateHistoryBanner,
  restoreOnly,
  useE2eeBackupStore,
} from '@/stores/e2eeBackup';
import { selectTransferAvailable, startNewTransfer } from '@/stores/e2eeTransfer';
import { useDmStore } from '@/stores/dm';
import { useE2eeStore } from '@/stores/e2ee';
import { useToastStore } from '@/stores/toast';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * "Eski mesajlarını getir" bandı (E5b §4.4, E5a Rev.3; web `BackupRestoreBanner.vue` ile aynı kural). Yeni cihazda
 * eksik geçmiş varsa DM listesinin üstünde BİR KEZ çıkar (bayrak motorun cihaz deposunda; çıkışta silinir).
 * Seçenekler: eski cihazdan aktar (aktarım açıksa), yedekten geri yükle (yedek kuruluysa), hayır. Sessiz kapı
 * Hesap güvenliği > Sohbet yedeği.
 */
export function BackupRestoreBanner() {
  const router = useRouter();
  const show = useE2eeBackupStore((s) => s.historyBanner);
  const state = useE2eeBackupStore((s) => s.state);
  const dmCount = useDmStore((s) => s.channels.length);
  const engine = useE2eeStore((s) => s.engine);

  // Motor, yedek durumu ve DM listesi farklı anlarda hazır olur: her değişimde (bir kez sonuçlanana dek) değerlendir.
  useEffect(() => {
    void evaluateHistoryBanner();
  }, [state, dmCount, engine]);

  if (!show) return null;
  const canRestore = !!state?.configured;
  const canTransfer = selectTransferAvailable();

  const fromDevice = () => {
    dismissHistoryBanner();
    void startNewTransfer();
  };

  const fromBackup = async () => {
    dismissHistoryBanner();
    if (!state?.unlockedHere) {
      router.push({ pathname: '/backup-password', params: { mode: 'unlock', history: '1' } });
      return;
    }
    const r = await restoreOnly();
    if (!r.ok) return;
    const n = r.restored ?? 0;
    useToastStore
      .getState()
      .show(t(`e2ee.backup.restore.${r.badSnapshots ? 'partial' : n > 0 ? 'done' : 'none'}`, { n }));
  };

  return (
    <View style={styles.bar} accessibilityRole="summary">
      <Text style={styles.text}>{t('e2ee.backup.history.banner')}</Text>
      <View style={styles.actions}>
        <Pressable onPress={dismissHistoryBanner} hitSlop={8}>
          <Text style={styles.dismiss}>{t('e2ee.backup.history.no')}</Text>
        </Pressable>
        {canRestore ? (
          <Pressable onPress={() => void fromBackup()} hitSlop={8}>
            <Text style={styles.action}>{t('e2ee.backup.history.fromBackup')}</Text>
          </Pressable>
        ) : null}
        {canTransfer ? (
          <Pressable onPress={fromDevice} hitSlop={8}>
            <Text style={styles.action}>{t('e2ee.backup.history.fromDevice')}</Text>
          </Pressable>
        ) : null}
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
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  dismiss: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
  action: { color: theme.colors.accent500, fontSize: theme.fontSize.sm, fontWeight: '700' },
});
