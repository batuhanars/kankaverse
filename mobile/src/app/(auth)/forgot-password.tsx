import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { authApi } from '@/api/auth';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1c contract §3.3 — Şifremi unuttum (YENİ). 🔴 R7 kritik kural §4/5: yanıt HER KOŞULDA
// aynı gösterilir — hesabın var olup olmadığı sızdırılmaz. Web `ForgotPasswordView.vue` deseni
// BİREBİR: try/finally, hata olsa da olmasa da `sent=true`. İstemci burada bir yorum/dallanma
// YAPMAZ — bu uçta "gönderim başarısız oldu" ile "hesap yok" ayrımını göstermek bile sinyal sızdırır.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const canSubmit = email.trim().length > 0 && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
    } finally {
      // Her zaman "gönderildi" göster — kullanıcı sayımı sızdırılmaz (web deseni birebir).
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <Text style={styles.title}>{t('forgotPassword.title')}</Text>
      <Text style={styles.subtitle}>{t('forgotPassword.subtitle')}</Text>

      {sent ? (
        <>
          <View style={styles.successBox}>
            <Text style={styles.successText}>{t('forgotPassword.successMessage')}</Text>
          </View>
          <Pressable onPress={() => router.replace('/login')} style={styles.linkWrap}>
            <Text style={styles.link}>{t('forgotPassword.backToLogin')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.email')}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color={theme.colors.textPrimary} />
            ) : (
              <Text style={styles.buttonText}>{t('forgotPassword.submitButton')}</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.replace('/login')} style={styles.linkWrap}>
            <Text style={styles.link}>{t('forgotPassword.backToLogin')}</Text>
          </Pressable>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
    backgroundColor: theme.colors.bgRail,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: theme.layout.panelGap * 1.5,
  },
  field: {
    marginBottom: theme.layout.panelGap,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginBottom: 6,
  },
  input: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    fontSize: theme.fontSize.base,
  },
  button: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  successBox: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: theme.layout.panelGap,
  },
  successText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
  linkWrap: {
    marginTop: theme.layout.panelGap,
    alignItems: 'center',
  },
  link: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
  },
});
