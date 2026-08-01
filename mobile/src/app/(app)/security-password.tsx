import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { authApi, type ReauthFields as ReauthValue } from '@/api/auth';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { ReauthFields, reauthReady } from '@/components/security/ReauthFields';
import { SecurityForm } from '@/components/security/SecurityForm';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** Sunucu sınırı (`ChangePasswordDto`: `@MinLength(8)`) — istemci kendi kuralını uydurmuyor. */
const MIN_PASSWORD = 8;

/**
 * Sprint M1f §2.3 — Şifre Değiştir.
 *
 * 🔴 Başarıda **diğer oturumlar düşer** (sunucu davranışı). Bu ekranda açıkça yazılır: kullanıcı
 * "neden diğer cihazımdan çıktım" diye şaşırmasın. Mevcut oturum ayakta kalır, bu yüzden ekran
 * kullanıcıyı giriş ekranına atmaz.
 */
export default function SecurityPasswordScreen() {
  const twoFactorEnabled = useAuthStore((s) => s.user?.twoFactorEnabled ?? false);
  const [reauth, setReauth] = useState<ReauthValue>({ currentPassword: '' });
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const longEnough = newPassword.length >= MIN_PASSWORD;
  const canSubmit = reauthReady(reauth, twoFactorEnabled) && longEnough;

  async function onSubmit() {
    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await authApi.changePassword(reauth, newPassword);
      setSuccessMessage(t('security.password.success'));
      // 🔴 Başarıdan sonra alanlar temizlenir: şifreler ekranda asılı kalmaz.
      setReauth({ currentPassword: '' });
      setNewPassword('');
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SecurityForm
      title={t('security.password.title')}
      submitLabel={t('security.password.submit')}
      onSubmit={onSubmit}
      submitting={submitting}
      canSubmit={canSubmit}
      errorMessage={errorMessage}
      successMessage={successMessage}
    >
      <ReauthFields value={reauth} onChange={setReauth} disabled={submitting} />

      <Text style={styles.label}>{t('security.password.newPassword')}</Text>
      <TextInput
        value={newPassword}
        onChangeText={setNewPassword}
        style={styles.input}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitting}
      />
      {/* Kural yazıyla söylenir; sunucuya gönderip 400 almak yerine kullanıcı burada öğrenir. */}
      {newPassword.length > 0 && !longEnough ? (
        <Text style={styles.hint}>{t('auth.validation.passwordMin')}</Text>
      ) : null}

      <Text style={styles.notice}>{t('mobile.security.passwordSessionsNotice')}</Text>
    </SecurityForm>
  );
}

const styles = StyleSheet.create({
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginTop: 6,
  },
  input: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    paddingHorizontal: 12,
  },
  hint: { color: theme.colors.warning, fontSize: theme.fontSize.xs },
  notice: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
    marginTop: 6,
  },
});
