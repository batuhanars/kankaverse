import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Ekran 2/3 devamı (contract §8 + §4) — 2FA challenge: login() 'challenge' dönünce buraya
// gelinir. Challenge token bellekte (store) tutulur, hiçbir yere yazılmaz. Doğrudan bu ekrana
// (login geçmeden) gelinmişse challenge yoktur → girişe geri gönderilir.
export default function TwoFactorScreen() {
  const router = useRouter();
  const challenge = useAuthStore((s) => s.challenge);
  const loginTwoFa = useAuthStore((s) => s.loginTwoFa);
  const clearChallenge = useAuthStore((s) => s.clearChallenge);
  const errorMessage = useAuthStore((s) => s.errorMessage);

  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!challenge) {
      router.replace('/login');
    }
  }, [challenge, router]);

  async function onSubmit() {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    const result = await loginTwoFa(code.trim());
    setSubmitting(false);
    if (result === 'ok') {
      router.replace('/home');
    }
  }

  function goBack() {
    clearChallenge();
    router.replace('/login');
  }

  // Klavye: login.tsx ile aynı gerekçe (sözleşme §8.2/1). Bu ekranda hiç sarmalayıcı yoktu; içerik
  // dikeyde ortalı olduğu için küçük ekranda kod alanı klavyenin altında kalabilir. Sahip hesabı 2FA'lı,
  // yani bu ekran her girişte kritik yolda.
  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <Text style={styles.title}>{t('twoFactorLogin.title')}</Text>
      <Text style={styles.subtitle}>
        {useRecovery ? t('twoFactorLogin.recoverySubtitle') : t('twoFactorLogin.subtitle')}
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>
          {useRecovery ? t('twoFactorLogin.recoveryCode') : t('twoFactorLogin.code')}
        </Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder={
            useRecovery ? t('twoFactorLogin.recoveryCodePlaceholder') : t('twoFactorLogin.codePlaceholder')
          }
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="characters"
          autoComplete="one-time-code"
          style={styles.input}
        />
      </View>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable
        onPress={onSubmit}
        disabled={submitting || !code.trim()}
        style={[styles.button, (submitting || !code.trim()) && styles.buttonDisabled]}
      >
        {submitting ? (
          <ActivityIndicator color={theme.colors.textPrimary} />
        ) : (
          <Text style={styles.buttonText}>{t('twoFactorLogin.submit')}</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          setUseRecovery((v) => !v);
          setCode('');
        }}
        style={styles.linkWrap}
      >
        <Text style={styles.link}>
          {useRecovery ? t('twoFactorLogin.useTotp') : t('twoFactorLogin.useRecovery')}
        </Text>
      </Pressable>

      <Pressable onPress={goBack} style={styles.linkWrap}>
        <Text style={styles.linkMuted}>{t('twoFactorLogin.back')}</Text>
      </Pressable>
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
    letterSpacing: 2,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: theme.layout.panelGap,
  },
  button: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  linkWrap: {
    marginTop: theme.layout.panelGap,
    alignItems: 'center',
  },
  link: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
  },
  linkMuted: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
});
