import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { OwnDeviceView } from '@kankaverse/e2ee-client';
import { useE2eeStore } from '@/stores/e2ee';
import { startNewTransfer, useE2eeTransferStore } from '@/stores/e2eeTransfer';
import { deviceName } from '@/e2ee/deviceNotices';
import { formatAgo } from '@/utils/formatAgo';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * E7 §4.6, §4.8 — Hesap güvenliği → Güvenlik kimliği (web `IdentitySection` karşılığı). Cihazların
 * doğrulanmış/doğrulanmamış durumu, imzasız bu cihaz için "Bu cihazı doğrula" (aktarımın yalnız kimlik modu;
 * bant ya da ısrar yok: §10-1) ve kimliği taşımayan cihazda sıfırlama (`identity-reset`, reauth).
 * Kimlik bayrağı kapalıyken ekran çizilmez (satırı da yok).
 */
export default function IdentitySettingsScreen() {
  const router = useRouter();
  const engine = useE2eeStore((s) => s.engine);
  const identity = engine?.identity?.enabled ? engine.identity : null;
  const transferAvailable = !!engine?.transfer;
  const transferPhase = useE2eeTransferStore((s) => s.n.phase);
  const [devices, setDevices] = useState<OwnDeviceView[]>([]);
  const [hasIdentity, setHasIdentity] = useState(false);
  const [thisVerified, setThisVerified] = useState(false);
  const [holdsKey, setHoldsKey] = useState(false);

  const load = useCallback(async () => {
    if (!identity) return;
    try {
      await engine?.identitySynced;
      const view = await identity.ownDevices();
      setDevices(view.devices);
      setHasIdentity(view.hasIdentity);
      setThisVerified(view.thisDeviceVerified);
      setHoldsKey(await identity.hasLocalIdentity());
    } catch (e) {
      console.error('[E2EE] cihaz listesi okunamadı', e instanceof Error ? e.name : typeof e);
    }
  }, [engine, identity]);

  // Sıfırlama ekranından dönünce de tazelensin.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // "Bu cihazı doğrula" bitince liste tazelenir.
  useEffect(() => {
    if (transferPhase === 'done') void load();
  }, [transferPhase, load]);

  if (!identity) return null;

  const canVerify = hasIdentity && !thisVerified && transferAvailable;
  // §4.6: yalnız bu cihaz kimliği taşımıyorsa anlamlı (taşıyorsa diğer cihazları kendisi doğrulatabilir).
  const canReset = hasIdentity && !holdsKey;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('e2ee.identity.sectionTitle') }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.intro}>{t('e2ee.identity.sectionIntro')}</Text>

        <Text style={styles.sectionTitle}>{t('e2ee.identity.devicesTitle')}</Text>
        <View style={styles.group}>
          {!hasIdentity ? (
            <Text style={styles.empty}>{t('e2ee.identity.noIdentity')}</Text>
          ) : (
            devices.map((d, i) => (
              <View key={d.deviceId} style={[styles.device, i < devices.length - 1 && styles.rowDivider]}>
                <View style={styles.deviceText}>
                  <Text style={styles.deviceName} numberOfLines={1}>
                    {deviceName(d)}
                    {d.current ? <Text style={styles.thisDevice}>{`  ·  ${t('e2ee.identity.thisDevice')}`}</Text> : null}
                  </Text>
                  {/* C79: hangi satırın hangi cihaz olduğu ve ne zaman kullanıldığı (yalnız kendi listende gelir) */}
                  {d.activityAt && !d.current ? (
                    <Text style={styles.lastActive}>
                      {t('e2ee.devices.lastActive', { ago: formatAgo(d.activityAt) })}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.status, d.verified ? styles.verified : styles.unverified]}>
                  {d.verified ? t('e2ee.identity.deviceVerified') : t('e2ee.identity.deviceUnverified')}
                </Text>
              </View>
            ))
          )}
        </View>

        {canVerify ? (
          <>
            <Text style={styles.intro}>{t('e2ee.identity.verifyHelp')}</Text>
            <View style={styles.group}>
              <Row
                label={t('e2ee.identity.verifyThisDevice')}
                onPress={() => void startNewTransfer({ identityOnly: true })}
              />
            </View>
          </>
        ) : null}

        {canReset ? (
          <View style={styles.group}>
            <Row label={t('e2ee.identity.reset')} onPress={() => router.push('/identity-reset')} danger />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.row}>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]} numberOfLines={2}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: { padding: theme.layout.panelGap * 1.5, gap: theme.layout.panelGap, paddingBottom: theme.layout.panelGap * 2 },
  intro: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, lineHeight: 20 },
  sectionTitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, fontWeight: '700' },
  group: { borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgSidebar, overflow: 'hidden' },
  empty: { padding: theme.layout.panelGap, color: theme.colors.textMuted, fontSize: theme.fontSize.sm, lineHeight: 20 },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 8,
  },
  deviceText: { flex: 1, minWidth: 0 },
  deviceName: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
  lastActive: { marginTop: 2, color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  thisDevice: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, fontWeight: '400' },
  status: { fontSize: theme.fontSize.sm, fontWeight: '600' },
  verified: { color: theme.colors.online },
  unverified: { color: theme.colors.warning },
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
