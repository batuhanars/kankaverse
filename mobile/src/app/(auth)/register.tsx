import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';
import { authApi, type RegistrationModeDto } from '@/api/auth';
import { BirthDateInput } from '@/components/auth/BirthDateInput';
import { ConsentModal } from '@/components/auth/ConsentModal';
import { t } from '@/i18n';
import { theme } from '@/theme';

type RegistrationMode = RegistrationModeDto['mode'];

// Sprint M1c contract §3.1 — Kayıt ekranı (YENİ). Web `RegisterView.vue` ile eşit sıkılık:
// aynı akış (kayıt modu → form → rıza modalı → gerçek kayıt), aynı i18n anahtarları.
// 🔴 R7: bu ekran yaş kararı VERMEZ, yalnız format toplar. `UNDERAGE`/`INVALID_BIRTHDATE` dahil
// TÜM sunucu hataları `store.errorMessage` (extractErrorMessage) üzerinden olduğu gibi gösterilir —
// kod bazlı dallanma yok (login.tsx ile aynı desen).
export default function RegisterScreen() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const errorMessage = useAuthStore((s) => s.errorMessage);

  const [mode, setMode] = useState<RegistrationMode>('open');
  const [modeLoading, setModeLoading] = useState(true);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const [showConsent, setShowConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Ekrana her girişte önceki ekrandan (ör. login'de yanlış şifre) kalmış olabilecek eski hata
  // mesajı temizlenir — errorMessage store-genelinde paylaşılıyor (login/2FA ile aynı alan).
  useEffect(() => {
    useAuthStore.setState({ errorMessage: null });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authApi.getRegistrationMode();
        if (!cancelled) setMode(res.mode);
      } catch {
        // Hata durumunda güvenli taraf: formu açık bırak, sunucu zaten doğrulayacak (web deseni birebir).
        if (!cancelled) setMode('open');
      } finally {
        if (!cancelled) setModeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 🔴 Yalnız FORMAT tam mı bakar (contract §3.1 — "eksik hane" gönderimi engelleyebilir, ağ
  // israfı olmasın diye). Gün/ay geçerliliği ve YAŞ kontrolü burada YOK — sunucunun işi.
  const formatComplete =
    username.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    birthDate.length > 0 &&
    (mode !== 'invite' || inviteCode.trim().length === 8);

  const canSubmit = formatComplete && !submitting;

  // "Kayıt Ol" → asıl kayıt DEĞİL, rıza modalını açar (contract §3.2 — atlanamaz adım).
  function onSubmitPress() {
    if (!canSubmit) return;
    setShowConsent(true);
  }

  // Modal "Okudum, kabul ediyorum" → asıl kayıt burada.
  async function confirmRegister() {
    setSubmitting(true);
    const result = await register({
      username: username.trim(),
      email: email.trim(),
      password,
      birthDate: new Date(birthDate).toISOString(),
      inviteCode: mode === 'invite' ? inviteCode.trim() : undefined,
    });
    setSubmitting(false);
    if (result === 'ok') {
      setShowConsent(false);
      router.replace('/home');
    } else {
      // hata → modalı kapat, kullanıcı formdaki hatayı görsün (web deseni birebir)
      setShowConsent(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.registerTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.registerSubtitle')}</Text>

        {modeLoading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={theme.colors.accent500} />
          </View>
        ) : mode === 'closed' ? (
          <View style={styles.closedCard}>
            <Text style={styles.closedTitle}>{t('register.invite.closedTitle')}</Text>
            <Text style={styles.closedDesc}>{t('register.invite.closedDesc')}</Text>
          </View>
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

            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.username')}</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder={t('auth.usernamePlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
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
                {/* §1 (M5c) — login.tsx ile aynı desen (varsayılan gizli, 44dp dokunma hedefi). */}
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? t('mobile.auth.hidePassword') : t('mobile.auth.showPassword')
                  }
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

            <BirthDateInput onChange={setBirthDate} />

            {mode === 'invite' ? (
              <View style={styles.field}>
                <Text style={styles.label}>{t('register.invite.codeLabel')}</Text>
                <TextInput
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  placeholder={t('register.invite.codePlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                  secureTextEntry
                  autoCapitalize="characters"
                  maxLength={8}
                  style={styles.input}
                />
              </View>
            ) : null}

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <Pressable
              onPress={onSubmitPress}
              disabled={!canSubmit}
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
            >
              <Text style={styles.buttonText}>{t('auth.register')}</Text>
            </Pressable>
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.hasAccount')} </Text>
          <Pressable onPress={() => router.replace('/login')}>
            <Text style={styles.footerLink}>{t('auth.login')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ConsentModal
        visible={showConsent}
        loading={submitting}
        onCancel={() => setShowConsent(false)}
        onConfirm={confirmRegister}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgRail,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
    paddingVertical: theme.layout.panelGap * 2,
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
  centerBlock: {
    paddingVertical: theme.layout.panelGap * 2,
    alignItems: 'center',
  },
  closedCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
    padding: theme.layout.panelGap * 1.5,
    alignItems: 'center',
  },
  closedTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  closedDesc: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
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
  // Şifre kutusu — göster/gizle ikonu sağda mutlak konumlu (§1, login.tsx ile aynı desen).
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
