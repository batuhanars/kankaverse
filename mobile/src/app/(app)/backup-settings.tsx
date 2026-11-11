import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  backupNow,
  refreshBackup,
  selectIsStale,
  useE2eeBackupStore,
} from '@/stores/e2eeBackup';
import { useToastStore } from '@/stores/toast';
import { formatDateTime } from '@/utils/formatDateTime';
import { t } from '@/i18n';
import { theme } from '@/theme';

type Mode = 'setup' | 'change' | 'reset' | 'unlock' | 'disable';

/**
 * E5a §4.4 — "Sohbet yedeği" ayarları (web `BackupSection` karşılığı): durum, son yedek zamanı, eylemler.
 * Eylemlerin her biri `backup-password` ekranını ilgili kipte açar. "Şimdi yedekle" zamanlayıcının kullandığı
 * aynı koşullu çalıştırmayı tetikler (6 saat / yeni kayıt denetimi motorda).
 */
export default function BackupSettingsScreen() {
  const router = useRouter();
  const info = useE2eeBackupStore((s) => s.state);
  const stale = useE2eeBackupStore(selectIsStale);
  const [nowLoading, setNowLoading] = useState(false);

  useEffect(() => {
    void refreshBackup();
  }, []);

  const status = !info?.configured ? 'none' : info.unlockedHere ? 'unlocked' : 'locked';
  const open = (mode: Mode) => router.push({ pathname: '/backup-password', params: { mode } });

  async function onBackupNow() {
    setNowLoading(true);
    const r = await backupNow();
    setNowLoading(false);
    const toast = useToastStore.getState().show;
    if (r.status === 'uploaded') toast(t('e2ee.backup.now.uploaded'));
    else if (r.status === 'skipped') toast(t(r.reason === 'no-key' ? 'e2ee.backup.now.locked' : 'e2ee.backup.now.upToDate'));
    else toast(t('e2ee.backup.now.failed'));
  }

  if (!info?.enabled) return null;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('e2ee.backup.title') }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.intro}>{t('e2ee.backup.intro')}</Text>

        <View style={styles.group}>
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>{t(`e2ee.backup.status.${status}`)}</Text>
            {status === 'unlocked' ? (
              <Text style={styles.lastText}>
                {info.lastBackupAt
                  ? t('e2ee.backup.lastBackup', { date: formatDateTime(info.lastBackupAt) })
                  : t('e2ee.backup.noBackupYet')}
              </Text>
            ) : null}
          </View>
          {stale ? <Text style={styles.stale}>{t('e2ee.backup.staleWarning')}</Text> : null}
        </View>

        <View style={styles.group}>
          {status === 'none' ? <Row label={t('e2ee.backup.actions.setup')} onPress={() => open('setup')} /> : null}
          {status === 'locked' ? <Row label={t('e2ee.backup.actions.unlock')} onPress={() => open('unlock')} /> : null}
          {status === 'unlocked' ? (
            <Row label={t('e2ee.backup.actions.now')} onPress={onBackupNow} loading={nowLoading} />
          ) : null}
          {status === 'unlocked' ? (
            <Row label={t('e2ee.backup.actions.change')} onPress={() => open('change')} />
          ) : null}
          {status !== 'none' ? <Row label={t('e2ee.backup.actions.reset')} onPress={() => open('reset')} /> : null}
          {status !== 'none' ? (
            <Row label={t('e2ee.backup.actions.disable')} onPress={() => open('disable')} danger last />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Row({
  label,
  onPress,
  danger,
  loading,
  last,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={[styles.row, !last && styles.rowDivider]}>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]} numberOfLines={2}>
        {label}
      </Text>
      {loading ? (
        <ActivityIndicator color={theme.colors.accent500} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: { padding: theme.layout.panelGap * 1.5, gap: theme.layout.panelGap, paddingBottom: theme.layout.panelGap * 2 },
  intro: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, lineHeight: 20 },
  group: { borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgSidebar, overflow: 'hidden' },
  statusRow: { padding: theme.layout.panelGap, gap: 4 },
  statusText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
  lastText: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
  stale: {
    color: theme.colors.warning,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: theme.layout.panelGap,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: theme.layout.panelGap,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle },
  rowLabel: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
  rowLabelDanger: { color: theme.colors.danger },
});
