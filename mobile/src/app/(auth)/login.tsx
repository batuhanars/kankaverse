import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Ekran 2/3 (contract §8) — Giriş: kullanıcı adı/e-posta + şifre. 2FA'lı hesapta login()
// 'challenge' döner → two-factor ekranına yönlendirilir.
// Sprint M1c — "Kayıt ol" + "Şifremi unuttum" linkleri eklendi (M0'da bilinçli yoktu, o sprintte
// olmayan özelliğe kapı açılmazdı; artık her iki ekran da var — contract §3.1/§3.3).
export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const errorMessage = useAuthStore((s) => s.errorMessage);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  // Klavye: Android'de de `padding` — MessageScreen ile AYNI kusur, aynı düzeltme (sözleşme §8.2/1;
  // sahip mesaj ekranında cihazda doğruladı). Buradaki belirti: klavye açılınca şifre alanı klavyenin
  // altında kalıyor, kullanıcı ne yazdığını görmüyor. Sebep edge-to-edge: pencere küçülmüyor, o yüzden
  // `behavior` undefined bırakıldığında KeyboardAvoidingView hiçbir şey yapmıyor.
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
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
          <View style={styles.passwordWrap}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.passwordPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              style={[styles.input, styles.passwordInput]}
            />
            {/* §1 (M5c) — varsayılan gizli, kullanıcı isteyerek gösterir. Dokunma hedefi 44dp
                (`theme.layout.inputMinHeight`), ikon 20px; MessageComposer'daki emoji ikonuyla
                aynı mutlak-konum deseni. */}
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t('mobile.auth.hidePassword') : t('mobile.auth.showPassword')}
              style={styles.passwordToggle}
              hitSlop={4}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={theme.colors.textSecondary}
              />
            </Pressable>
          </View>
        </View>

        <Pressable onPress={() => router.push('/forgot-password')} style={styles.forgotPasswordWrap}>
          <Text style={styles.forgotPasswordText}>{t('auth.forgotPassword')}</Text>
        </Pressable>

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

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
          <Pressable onPress={() => router.push('/register')}>
            <Text style={styles.footerLink}>{t('auth.register')}</Text>
          </Pressable>
        </View>
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
  // Şifre kutusu — göster/gizle ikonu sağda mutlak konumlu (§1). `position: 'relative'` View
  // varsayılanı olduğu için ayrıca belirtmeye gerek yok.
  passwordWrap: {
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: theme.layout.inputMinHeight,
  },
  passwordToggle: {
    position: 'absolute',
    right: 0,
    width: theme.layout.inputMinHeight,
    height: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotPasswordWrap: {
    alignItems: 'flex-end',
    marginBottom: theme.layout.panelGap,
  },
  forgotPasswordText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: theme.layout.panelGap * 1.5,
  },
  footerText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  footerLink: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
