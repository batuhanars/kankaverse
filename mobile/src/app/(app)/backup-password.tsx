import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { checkBackupPassword } from '@kankaverse/e2ee-core';
import type { ReauthFields as ReauthValue } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import {
  changeBackupPassword,
  disableBackup,
  resetBackup,
  setupBackup,
  unlockAndRestore,
  type BackupOutcome,
} from '@/stores/e2eeBackup';
import { BackupPasswordInput } from '@/components/backup/BackupPasswordInput';
import { BackupPasswordSuggest } from '@/components/backup/BackupPasswordSuggest';
import { outcomeMessage } from '@/components/backup/outcomeMessage';
import { ReauthFields, reauthReady } from '@/components/security/ReauthFields';
import { SecurityForm } from '@/components/security/SecurityForm';
import { t } from '@/i18n';
import { theme } from '@/theme';

type Mode = 'setup' | 'change' | 'reset' | 'unlock' | 'disable';
const MODES: Mode[] = ['setup', 'change', 'reset', 'unlock', 'disable'];

/**
 * E5a §4.4 — yedek şifresi akışlarının tek ekranı (web `BackupPasswordModal` + `BackupUnlockModal` karşılığı):
 * kurulum, şifre değiştirme, sıfırlama, bu cihazda açma/geri yükleme, yedeği kapatma. Hassas işlemlerde
 * (sıfırla, kapat) mevcut `ReauthFields` aynen kullanılır. Şifreler yalnız bu ekranın state'inde yaşar,
 * saklanmaz, loglanmaz. Türetme ~1 sn sürer: gönder düğmesi yükleniyor durumunda kalır.
 * `prompt=1`: ilk şifreli DM açılışında çıkan tek seferlik soru; "Şimdi değil" ile kapanır.
 */
export default function BackupPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; prompt?: string }>();
  const mode: Mode = MODES.includes(params.mode as Mode) ? (params.mode as Mode) : 'setup';
  const isPrompt = params.prompt === '1';

  const user = useAuthStore((s) => s.user);
  const twoFactorEnabled = user?.twoFactorEnabled ?? false;

  const [oldPassword, setOldPassword] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [acked, setAcked] = useState(false);
  const [reauth, setReauth] = useState<ReauthValue>({ currentPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const needsNew = mode === 'setup' || mode === 'change' || mode === 'reset';
  const needsAck = mode === 'setup' || mode === 'reset';
  const needsReauth = mode === 'reset' || mode === 'disable';

  const identity = { username: user?.username ?? '', email: user?.email ?? '' };
  const check = password ? checkBackupPassword(password, identity) : null;
  const ruleText = check && !check.ok ? t(`e2ee.backup.rules.${check.reason}`) : '';
  const mismatch = repeat !== '' && repeat !== password;

  let canSubmit = true;
  if (needsNew) canSubmit = check?.ok === true && repeat === password;
  if (mode === 'change') canSubmit = canSubmit && oldPassword !== '';
  if (needsAck) canSubmit = canSubmit && acked;
  if (mode === 'unlock') canSubmit = password !== '';
  if (needsReauth) canSubmit = canSubmit && reauthReady(reauth, twoFactorEnabled);

  async function perform(): Promise<(BackupOutcome & { restored?: number; badSnapshots?: number }) | null> {
    if (mode === 'setup') return setupBackup(password);
    if (mode === 'change') return changeBackupPassword(oldPassword, password);
    if (mode === 'reset') return resetBackup(password, reauth);
    if (mode === 'unlock') return unlockAndRestore(password);
    return disableBackup(reauth);
  }

  async function onSubmit() {
    setSubmitting(true);
    setErrorMessage('');
    const r = await perform();
    setSubmitting(false);
    if (!r) return;
    if (!r.ok) {
      setErrorMessage(outcomeMessage(r));
      return;
    }
    // Başarıdan sonra alanlar temizlenir: şifreler ekranda asılı kalmaz.
    setOldPassword('');
    setPassword('');
    setRepeat('');
    setReauth({ currentPassword: '' });
    const n = r.restored ?? 0;
    const doneKey =
      mode === 'unlock' ? `restore.${r.badSnapshots ? 'partial' : n > 0 ? 'done' : 'none'}` : `${mode}.done`;
    useToastStore.getState().show(t(`e2ee.backup.${doneKey}`, { n }));
    router.back();
  }

  return (
    <SecurityForm
      title={t(`e2ee.backup.${mode}.title`)}
      submitLabel={t(`e2ee.backup.${mode}.submit`)}
      onSubmit={onSubmit}
      submitting={submitting}
      canSubmit={canSubmit}
      errorMessage={errorMessage}
      danger={mode === 'disable'}
    >
      {mode === 'reset' ? <Text style={styles.danger}>{t('e2ee.backup.reset.warning')}</Text> : null}
      {mode === 'disable' ? <Text style={styles.danger}>{t('e2ee.backup.disable.warning')}</Text> : null}
      {mode === 'unlock' ? <Text style={styles.body}>{t('e2ee.backup.unlock.body')}</Text> : null}
      {mode === 'setup' || mode === 'reset' ? <Text style={styles.body}>{t('e2ee.backup.warning')}</Text> : null}

      {mode === 'change' ? (
        <BackupPasswordInput
          label={t('e2ee.backup.fields.oldPassword')}
          value={oldPassword}
          onChange={setOldPassword}
          disabled={submitting}
        />
      ) : null}
      {needsNew ? (
        <BackupPasswordSuggest
          ctx={identity}
          current={password}
          disabled={submitting}
          onUse={(pw) => {
            setPassword(pw);
            setRepeat(pw);
          }}
        />
      ) : null}
      {mode === 'unlock' || needsNew ? (
        <BackupPasswordInput
          label={t(mode === 'change' ? 'e2ee.backup.fields.newPassword' : 'e2ee.backup.fields.password')}
          value={password}
          onChange={setPassword}
          disabled={submitting}
          hint={needsNew ? ruleText : ''}
        />
      ) : null}
      {needsNew ? (
        <BackupPasswordInput
          label={t(mode === 'change' ? 'e2ee.backup.fields.newRepeat' : 'e2ee.backup.fields.repeat')}
          value={repeat}
          onChange={setRepeat}
          disabled={submitting}
          hint={mismatch ? t('e2ee.backup.rules.mismatch') : ''}
        />
      ) : null}

      {needsAck ? (
        <View style={styles.ackRow}>
          <Switch
            value={acked}
            onValueChange={setAcked}
            disabled={submitting}
            trackColor={{ true: theme.colors.accent500, false: theme.colors.borderStrong }}
          />
          <Text style={styles.ackText}>{t('e2ee.backup.ack')}</Text>
        </View>
      ) : null}

      {needsReauth ? (
        <ReauthFields
          value={reauth}
          onChange={setReauth}
          disabled={submitting}
          passwordLabel={t('e2ee.backup.reauth.passwordLabel')}
          passwordHint={t('e2ee.backup.reauth.hint')}
        />
      ) : null}

      {isPrompt ? (
        <Pressable onPress={() => router.back()} disabled={submitting} style={styles.later}>
          <Text style={styles.laterText}>{t('e2ee.backup.setup.later')}</Text>
        </Pressable>
      ) : null}
    </SecurityForm>
  );
}

const styles = StyleSheet.create({
  body: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, lineHeight: 20 },
  danger: { color: theme.colors.danger, fontSize: theme.fontSize.sm, lineHeight: 20 },
  ackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  ackText: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.sm, lineHeight: 20 },
  later: { alignItems: 'center', justifyContent: 'center', minHeight: theme.layout.inputMinHeight },
  laterText: { color: theme.colors.textMuted, fontSize: theme.fontSize.base, fontWeight: '600' },
});
