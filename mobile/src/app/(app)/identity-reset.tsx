import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import type { ReauthFields as ReauthValue } from '@/api/auth';
import { extractErrorMessage } from '@/api/errors';
import { ReauthFields, reauthReady } from '@/components/security/ReauthFields';
import { SecurityForm } from '@/components/security/SecurityForm';
import { useAuthStore } from '@/stores/auth';
import { useE2eeStore } from '@/stores/e2ee';
import { useToastStore } from '@/stores/toast';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * E7 §4.6 — güvenlik kimliğini yeniden oluştur (web'deki uyarı + ReauthModal adımlarının mobil karşılığı:
 * uyarı ve hesap şifresi tek formda, yedek sıfırlamasıyla aynı düzen). Kişilerin sohbetinde "güvenlik kodunu
 * değiştirdi" satırı çıkar; o yüzden uyarı kırmızı ve gönderim reauth ister. Şifre yalnız bu ekranın state'inde.
 */
export default function IdentityResetScreen() {
  const router = useRouter();
  const identity = useE2eeStore((s) => (s.engine?.identity?.enabled ? s.engine.identity : null));
  const twoFactorEnabled = useAuthStore((s) => s.user?.twoFactorEnabled ?? false);
  const [reauth, setReauth] = useState<ReauthValue>({ currentPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function onSubmit() {
    if (!identity) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      await identity.reset(reauth);
      setReauth({ currentPassword: '' });
      useToastStore.getState().show(t('e2ee.identity.resetDone'));
      router.back();
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SecurityForm
      title={t('e2ee.identity.reset')}
      submitLabel={t('e2ee.identity.resetConfirm')}
      onSubmit={onSubmit}
      submitting={submitting}
      canSubmit={!!identity && reauthReady(reauth, twoFactorEnabled)}
      errorMessage={errorMessage}
      danger
    >
      <Text style={styles.danger}>{t('e2ee.identity.resetWarning')}</Text>
      <ReauthFields
        value={reauth}
        onChange={setReauth}
        disabled={submitting}
        passwordLabel={t('e2ee.backup.reauth.passwordLabel')}
        passwordHint={t('e2ee.identity.reauthHint')}
      />
    </SecurityForm>
  );
}

const styles = StyleSheet.create({
  danger: { color: theme.colors.danger, fontSize: theme.fontSize.sm, lineHeight: 20 },
});
