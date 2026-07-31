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
import { Stack, useRouter } from 'expo-router';
import { guildsApi } from '@/api/guilds';
import { extractErrorCode, extractErrorMessage } from '@/api/errors';
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sözleşme §4 sabiti — `api/.../create-guild.dto.ts`: @MinLength(2) @MaxLength(64).
// Kaynak DTO'dur; buradaki sayı onun aynası (kök CLAUDE.md: istemci validasyonu yalnız UX,
// güvenlik otoritesi backend).
const NAME_MIN = 2;
const NAME_MAX = 64;

// Sprint M1d contract §2.3 — "Ortam Kur".
//
// 🔴 Bu ekran M1c'den SARKAN DoD maddesini kapatır: "doğrulanmamış e-posta ortam kuramaz ve
// sebebini görür". M1c'de doğrulama bandı yazılmıştı ama tetikleyecek bir yüzey yoktu, çünkü
// mobilde ortam kurma yoktu. Sunucudaki kapı `VerifiedEmailGuard` → 403 EMAIL_NOT_VERIFIED.
// İstemci bu kapıyı YENİDEN KURMAZ: "e-postan doğrulanmamışsa düğmeyi kilitle" yapılmıyor,
// sunucunun cevabı gösteriliyor ve kullanıcı mevcut doğrulama akışına yönlendiriliyor.
export default function NewGuildScreen() {
  const router = useRouter();
  const emailVerified = useAuthStore((s) => s.user?.emailVerified ?? true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);

  const trimmed = name.trim();
  const canSubmit = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX && !creating;

  async function onCreate() {
    if (!canSubmit) return;
    setCreating(true);
    setErrorMessage('');
    setNeedsVerification(false);
    try {
      const guild = await guildsApi.create(trimmed);
      router.replace({ pathname: '/(app)/(tabs)/home', params: { joinedGuildId: guild.id } });
    } catch (e) {
      // Sebebi göster + çıkış yolu ver. Mesaj sunucudan gelir, uydurulmaz; `needsVerification`
      // yalnız "nereye gideceğini söyleyen" satırı açar.
      if (extractErrorCode(e) === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification(true);
      }
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title: t('guild.createTitle') }} />

      <View style={styles.body}>
        <Text style={styles.description}>{t('guild.modal.createDesc')}</Text>

        {/* M1c'de yazılan bandın AYNISI (yeni doğrulama akışı yazılmadı, sözleşme §2.3). İçinde
            "tekrar gönder" zaten var, bu yüzden ayrıca bir yönlendirme satırı konmadı.
            Doğrulanmamışsa ÖNCEDEN görünür — kullanıcı adı yazıp reddedilmektense baştan bilsin.
            Bu bir KAPI DEĞİL: alan ve düğme açık kalır, kararı sunucu verir (istemcideki bayrak
            bayat olabilir; istemci kendi kapısını kurmaz). */}
        {(!emailVerified || needsVerification) && <EmailVerificationBanner />}

        <Text style={styles.label}>{t('guild.nameLabel')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('guild.namePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          maxLength={NAME_MAX}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onCreate}
        />

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable
          onPress={onCreate}
          disabled={!canSubmit}
          style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
        >
          {creating ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('guild.createButton')}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  body: {
    padding: theme.layout.panelGap,
    gap: 10,
  },
  description: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  label: {
    color: theme.colors.textSecondary,
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
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  primaryButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
});
