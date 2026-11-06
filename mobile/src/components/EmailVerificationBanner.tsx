import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { authApi } from '@/api/auth';
import { extractErrorCode, extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1c contract §3.4 — mobilde HİÇ yoktu (`emailVerified` geçen tek satır bulunmuyordu).
// Web `components/shared/EmailVerificationBanner.vue` karşılığı, aynı i18n anahtarları
// (`emailVerification.*`, mobil için yeni/kısa metin yazılmadı). Çağıran (me.tsx) yalnız
// `user && !user.emailVerified` iken mount eder (web `AppShell.vue` deseniyle birebir — boş
// yüzey açılmaz, bu bant zaten yalnız gerçekten doğrulanmamışken var).
export function EmailVerificationBanner() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function resend() {
    setLoading(true);
    setError('');
    try {
      await authApi.resendVerification();
      setSent(true);
    } catch (e) {
      // Başka cihazda doğrulandıysa yerel bayrak bayat: oturumu tazele, şerit kendiliğinden kalkar
      // (artık her ekranda durduğu için uygulama yeniden açılana dek asılı kalmasın).
      if (extractErrorCode(e) === 'EMAIL_ALREADY_VERIFIED') {
        try {
          useAuthStore.getState().updateUser(await authApi.me());
          return;
        } catch {
          /* tazeleme olmazsa sunucu mesajı gösterilir */
        }
      }
      // `EMAIL_ALREADY_VERIFIED` dahil TÜM sunucu mesajları olduğu gibi gösterilir (kod bazlı
      // dallanma yok) — web'in `EMAIL_ALREADY_VERIFIED` özel-durumu burada atlanmadı: o mesaj
      // zaten "e-postan doğrulanmış" bilgisini taşıyor, kullanıcı için yeterince açık.
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.banner}>
      {sent ? (
        <Text style={styles.message}>{t('emailVerification.resendSuccess')}</Text>
      ) : (
        <>
          <Text style={styles.message}>{t('emailVerification.bannerMessage')}</Text>
          <View style={styles.actions}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable disabled={loading} onPress={resend}>
              {loading ? (
                <ActivityIndicator size="small" color={theme.colors.warning} />
              ) : (
                <Text style={styles.resend}>{t('emailVerification.resend')}</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 10,
    backgroundColor: theme.colors.warningSubtle,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderStrong,
  },
  message: {
    color: theme.colors.warning,
    fontSize: theme.fontSize.xs,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
  },
  resend: {
    color: theme.colors.warning,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
