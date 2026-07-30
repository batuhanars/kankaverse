import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Ekran 2/3 (contract §8) — Giriş: kullanıcı adı/e-posta + şifre. 2FA'lı hesapta login()
// 'challenge' döner → two-factor ekranına yönlendirilir. Kayıt/şifre-sıfırlama linki YOK
// (M0 kapsam dışı, contract §0 — olmayan özelliğe kapı açılmaz).
export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const errorMessage = useAuthStore((s) => s.errorMessage);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await login(identifier.trim(), password);
    setSubmitting(false);
    if (result === 'challenge') {
      router.push('/two-factor');
    } else if (result === 'ok') {
      router.replace('/home');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Image
          source={require('@/assets/brand/kankaverse-logo-dikey.png')}
          style={styles.brand}
          resizeMode="contain"
          accessibilityLabel={t('brand.name')}
        />
        <Text style={styles.title}>{t('auth.loginTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.identifier')}</Text>
          <TextInput
            value={identifier}
            onChangeText={setIdentifier}
            placeholder={t('auth.identifierPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.password')}</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.passwordPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.buttonText}>{t('auth.login')}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgRail,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  // Dikey marka kilidi (altıgen + kelime işareti). Kaynak: web/src/assets/brand — mobil kopyası
  // assets/brand altında; marka değişirse iki yerde de güncellenir.
  brand: {
    width: 200,
    height: 120,
    alignSelf: 'center',
    marginBottom: theme.layout.panelGap,
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
});
