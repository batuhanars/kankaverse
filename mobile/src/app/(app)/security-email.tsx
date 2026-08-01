import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { authApi, type ReauthFields as ReauthValue } from '@/api/auth';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { ReauthFields, reauthReady } from '@/components/security/ReauthFields';
import { SecurityForm } from '@/components/security/SecurityForm';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** Web'in `security.email.validation.newEmailInvalid` kontrolüyle aynı kabalıkta; otorite sunucuda. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sprint M1f §2.6 — E-posta Değiştir.
 *
 * 🔴 **Bu ekran e-postayı DEĞİŞTİRMEZ**, değişiklik TALEBİ oluşturur: sunucu yeni adrese doğrulama,
 * eski adrese geri-al postası gönderir. Onay/geri-al **linkten** yürür (web landing'i); mobil kendi
 * onay ekranını açmaz — olmayan bir akışı taklit etmek yerine gerçekte olan anlatılır.
 */
export default function SecurityEmailScreen() {
  const user = useAuthStore((s) => s.user);
  const twoFactorEnabled = user?.twoFactorEnabled ?? false;
  const [reauth, setReauth] = useState<ReauthValue>({ currentPassword: '' });
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const emailValid = EMAIL_RE.test(newEmail.trim());
  const canSubmit = reauthReady(reauth, twoFactorEnabled) && emailValid;

  async function onSubmit() {
    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await authApi.changeEmail(reauth, newEmail.trim());
      setSuccessMessage(t('security.email.success'));
      setReauth({ currentPassword: '' });
      setNewEmail('');
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SecurityForm
      title={t('security.email.title')}
      submitLabel={t('security.email.submit')}
      onSubmit={onSubmit}
      submitting={submitting}
      canSubmit={canSubmit}
      errorMessage={errorMessage}
      successMessage={successMessage}
    >
      <View style={styles.currentBox}>
        <Text style={styles.currentLabel}>{t('security.email.current')}</Text>
        <Text style={styles.currentValue}>{user?.email}</Text>
      </View>

      <ReauthFields value={reauth} onChange={setReauth} disabled={submitting} />

      <Text style={styles.label}>{t('security.email.newEmail')}</Text>
      <TextInput
        value={newEmail}
        onChangeText={setNewEmail}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitting}
      />
      {newEmail.length > 0 && !emailValid ? (
        <Text style={styles.hint}>{t('security.email.validation.newEmailInvalid')}</Text>
      ) : null}

      <Text style={styles.notice}>{t('mobile.security.emailLinkNotice')}</Text>
    </SecurityForm>
  );
}

const styles = StyleSheet.create({
  currentBox: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    padding: 12,
    gap: 2,
  },
  currentLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  currentValue: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base },
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
