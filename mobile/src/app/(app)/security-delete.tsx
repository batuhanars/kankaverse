import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { authApi, type ReauthFields as ReauthValue } from '@/api/auth';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ReauthFields, reauthReady } from '@/components/security/ReauthFields';
import { SecurityForm } from '@/components/security/SecurityForm';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1f §2.7 — Hesabımı Sil.
 *
 * 🔴 Silme **geri alınabilir**: sunucu 30 günlük grace başlatır, o süre içinde tekrar giriş yapmak
 * talebi iptal eder (`cancelPendingDeletionOnLogin`). Metin bunu net söyler — ne korkutur ne yanıltır.
 * İptal için ayrı bir uç YOK, o yüzden mobilde "silmeyi iptal et" düğmesi de yok; iptal yolu giriştir.
 *
 * Sunucu talebi alınca tüm oturumları düşürüyor → istemci de yerel tokenları temizleyip giriş
 * ekranına gider (aksi hâlde uygulama geçersiz tokenla ayakta kalırdı).
 */
export default function SecurityDeleteScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const twoFactorEnabled = useAuthStore((s) => s.user?.twoFactorEnabled ?? false);

  const [reauth, setReauth] = useState<ReauthValue>({ currentPassword: '' });
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function onDelete() {
    setConfirming(false);
    setSubmitting(true);
    setErrorMessage('');
    try {
      await authApi.deleteAccount(reauth);
      await logout({ wipeE2ee: true }); // hesap silme: yerel şifreli depo da silinir (C69)
      router.replace('/login');
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
      setSubmitting(false);
    }
  }

  return (
    <>
      <SecurityForm
        title={t('security.deleteAccount.title')}
        submitLabel={t('security.deleteAccount.confirm')}
        // Gönder düğmesi doğrudan silmez — önce onay diyaloğu (geri dönüşü olan tek adım).
        onSubmit={() => setConfirming(true)}
        submitting={submitting}
        canSubmit={reauthReady(reauth, twoFactorEnabled)}
        errorMessage={errorMessage}
        danger
      >
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>{t('security.deleteAccount.warning')}</Text>
        </View>

        <ReauthFields value={reauth} onChange={setReauth} disabled={submitting} />
      </SecurityForm>

      {confirming ? (
        <ConfirmDialog
          title={t('security.deleteAccount.title')}
          message={t('security.deleteAccount.warning')}
          confirmLabel={t('security.deleteAccount.confirm')}
          loading={submitting}
          onConfirm={onDelete}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  warnBox: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.dangerSubtle,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    padding: 12,
  },
  warnText: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, lineHeight: 20 },
});
