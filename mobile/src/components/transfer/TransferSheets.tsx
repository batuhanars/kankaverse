import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatSas } from '@kankaverse/e2ee-core';
import {
  acceptOldTransfer,
  closeNewTransfer,
  closeOldTransfer,
  confirmOldTransfer,
  rejectOldTransfer,
  startNewTransfer,
  useE2eeTransferStore,
} from '@/stores/e2eeTransfer';
import { formatDateTime } from '@/utils/formatDateTime';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * E5b §4.2/§4.3 — aktarım pencereleri (web `TransferNewModal` / `TransferIncomingModal` ile aynı aşamalar).
 * Uygulama düzeninde global: hangi ekranda olunursa olsun çıkar. Kod saklanmaz, loglanmaz.
 * 🔴 Eski cihazda gönderimin tek kapısı "Kodlar aynı, aktar" (`confirmOldTransfer`).
 */

function Card({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function Button({ label, onPress, kind = 'primary', disabled }: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.button, kind === 'primary' && styles.primary, kind === 'danger' && styles.dangerButton, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, kind === 'ghost' && styles.ghostText]}>{label}</Text>
    </Pressable>
  );
}

function Code({ sas }: { sas: string }) {
  return (
    <>
      <Text style={styles.label}>{t('e2ee.backup.transfer.codeLabel')}</Text>
      {sas ? (
        <Text style={styles.code} accessibilityLiveRegion="polite">
          {formatSas(sas)}
        </Text>
      ) : (
        <ActivityIndicator color={theme.colors.textMuted} />
      )}
    </>
  );
}

/** Yeni cihaz: "Eski cihazımdan aktar". */
export function TransferNewSheet() {
  const n = useE2eeTransferStore((s) => s.n);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!n.open) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [n.open]);
  if (!n.open) return null;

  const end = Date.parse(n.expiresAt);
  const minutesLeft = Number.isFinite(end) ? Math.max(1, Math.ceil((end - now) / 60_000)) : 10;
  const finished = ['done', 'expired', 'cancelled', 'tooLarge', 'error'].includes(n.phase);
  const result =
    n.phase === 'done'
      ? t('e2ee.backup.transfer.done', { n: n.received })
      : n.phase === 'expired'
        ? t('e2ee.backup.transfer.expired')
        : n.phase === 'cancelled'
          ? t('e2ee.backup.transfer.cancelled')
          : n.phase === 'tooLarge'
            ? t('e2ee.backup.transfer.tooLarge')
            : t('e2ee.backup.transfer.failed');
  const canRestart = ['expired', 'cancelled', 'error'].includes(n.phase);

  return (
    <Card title={t('e2ee.backup.transfer.title')} onClose={closeNewTransfer}>
      {n.phase === 'starting' || n.phase === 'waiting' ? (
        <>
          <Text style={styles.body}>{t('e2ee.backup.transfer.waiting')}</Text>
          <Text style={styles.muted}>{t('e2ee.backup.transfer.expiresIn', { min: minutesLeft })}</Text>
        </>
      ) : n.phase === 'code' ? (
        <>
          <Code sas={n.sas} />
          <Text style={styles.body}>{t('e2ee.backup.transfer.codeNew')}</Text>
        </>
      ) : n.phase === 'receiving' ? (
        <View style={styles.row}>
          <ActivityIndicator color={theme.colors.textMuted} />
          <Text style={styles.body}>{t('e2ee.backup.transfer.receiving')}</Text>
        </View>
      ) : (
        <Text style={styles.body} accessibilityRole="alert">
          {result}
        </Text>
      )}
      <View style={styles.actions}>
        {canRestart ? <Button kind="ghost" label={t('e2ee.backup.transfer.restart')} onPress={() => void startNewTransfer()} /> : null}
        <Button
          kind={finished ? 'primary' : 'ghost'}
          label={finished ? t('e2ee.backup.transfer.close') : t('common.cancel')}
          onPress={closeNewTransfer}
          disabled={n.phase === 'receiving'}
        />
      </View>
    </Card>
  );
}

/** Eski cihaz: yeni cihaz geçmiş istiyor. */
export function TransferIncomingSheet() {
  const router = useRouter();
  const o = useE2eeTransferStore((s) => s.o);
  if (o.phase === 'idle') return null;

  const r = o.request;
  const device = r?.newDevice.name ?? r?.newDevice.platform ?? t('e2ee.backup.transfer.incoming.unknownDevice');
  const goSessions = () => {
    closeOldTransfer();
    router.push('/security-sessions');
  };

  return (
    <Card title={t('e2ee.backup.transfer.incoming.title')} onClose={closeOldTransfer}>
      {o.phase === 'request' && r ? (
        <>
          <Text style={styles.body}>
            {t('e2ee.backup.transfer.incoming.body', { name: device, time: formatDateTime(Date.parse(r.createdAt)) })}
          </Text>
          <View style={styles.actions}>
            <Button kind="ghost" label={t('e2ee.backup.transfer.incoming.notMe')} onPress={() => void rejectOldTransfer()} />
            <Button label={t('e2ee.backup.transfer.incoming.continue')} onPress={() => void acceptOldTransfer()} />
          </View>
        </>
      ) : o.phase === 'waiting' ? (
        <View style={styles.row}>
          <ActivityIndicator color={theme.colors.textMuted} />
          <Text style={styles.body}>{t('e2ee.backup.transfer.incoming.waitingCode')}</Text>
        </View>
      ) : o.phase === 'code' ? (
        <>
          <Code sas={o.sas} />
          <Text style={styles.body}>{t('e2ee.backup.transfer.incoming.codeOld')}</Text>
          <View style={styles.actionsStack}>
            <Button label={t('e2ee.backup.transfer.incoming.same')} onPress={() => void confirmOldTransfer()} />
            <Button kind="danger" label={t('e2ee.backup.transfer.incoming.different')} onPress={() => void rejectOldTransfer()} />
          </View>
        </>
      ) : o.phase === 'sending' ? (
        <View style={styles.row}>
          <ActivityIndicator color={theme.colors.textMuted} />
          <Text style={styles.body}>{t('e2ee.backup.transfer.incoming.sending')}</Text>
        </View>
      ) : o.phase === 'rejected' ? (
        <>
          <Text style={[styles.body, styles.danger]} accessibilityRole="alert">
            {t('e2ee.backup.transfer.incoming.rejected')}
          </Text>
          <View style={styles.actions}>
            <Button kind="ghost" label={t('e2ee.backup.transfer.close')} onPress={closeOldTransfer} />
            <Button label={t('e2ee.backup.transfer.incoming.sessions')} onPress={goSessions} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.body} accessibilityRole="alert">
            {o.phase === 'sent' ? t('e2ee.backup.transfer.incoming.sent') : t('e2ee.backup.transfer.failed')}
          </Text>
          <View style={styles.actions}>
            <Button label={t('e2ee.backup.transfer.close')} onPress={closeOldTransfer} />
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.bgOverlay,
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap,
  },
  card: {
    backgroundColor: theme.colors.bgSidebar,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 14,
  },
  title: { color: theme.colors.textPrimary, fontSize: theme.fontSize.xl, fontWeight: '700' },
  body: { flexShrink: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.base, lineHeight: 21 },
  muted: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
  danger: { color: theme.colors.danger },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, fontWeight: '700' },
  code: {
    color: theme.colors.textPrimary,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  actionsStack: { gap: 8 },
  button: {
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: theme.colors.accent500 },
  dangerButton: { backgroundColor: theme.colors.danger },
  disabled: { opacity: 0.5 },
  buttonText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '700' },
  ghostText: { color: theme.colors.textSecondary, fontWeight: '600' },
});
