import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi, type ReauthFields as ReauthValue } from '@/api/auth';
import { extractErrorMessage } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { ReauthFields, reauthReady } from '@/components/security/ReauthFields';
import { SecurityForm } from '@/components/security/SecurityForm';
import { t } from '@/i18n';
import { theme } from '@/theme';

const CODE_LENGTH = 6;

/**
 * Sprint M1f §2.5 — İki Adımlı Doğrulama.
 *
 * Üç durum tek ekranda: **kapalı → kur** (reauth → gizli anahtar → doğrulama kodu → kurtarma kodları),
 * **açık → kapat** (reauth).
 *
 * 🔴 **QR ÇİZİLMEZ.** Sunucu `qrDataUrl` dönüyor ama telefonun kendi ekranındaki QR'ı yine aynı
 * telefondaki authenticator ile okutmak mümkün değil. Mobilde doğru affordance **kopyalanabilir metin
 * anahtar**; web'de QR doğru olan, orada duruyor. (Sözleşme §2.5, sapma değil bilinçli fark.)
 *
 * 🔴 **Kurtarma kodları bir kez** gösterilir, hiçbir yere yazılmaz (AsyncStorage'a ASLA). Ekranda bu
 * açıkça yazılı; kullanıcı "sonra bakarım" sanmasın.
 */
export default function SecurityTwoFactorScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const twoFactorEnabled = user?.twoFactorEnabled ?? false;

  const [reauth, setReauth] = useState<ReauthValue>({ currentPassword: '' });
  /** Kurulum başladıysa sunucudan gelen gizli anahtar — YALNIZ bellekte, kalıcı hiçbir yere gitmez. */
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  async function refreshUser() {
    const fresh = await authApi.me();
    useAuthStore.setState({ user: fresh });
  }

  async function run(fn: () => Promise<void>) {
    setSubmitting(true);
    setErrorMessage('');
    try {
      await fn();
    } catch (e) {
      setErrorMessage(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const onSetup = () =>
    run(async () => {
      const res = await authApi.setupTwoFactor(reauth);
      setSecret(res.secret);
      // Şifre işi bitti — ekranda tutulmaz.
      setReauth({ currentPassword: '' });
    });

  const onEnable = () =>
    run(async () => {
      const res = await authApi.enableTwoFactor(code);
      setRecoveryCodes(res.codes);
      setSecret('');
      setCode('');
      await refreshUser();
    });

  const onDisable = () =>
    run(async () => {
      await authApi.disableTwoFactor(reauth);
      setReauth({ currentPassword: '' });
      await refreshUser();
      router.back();
    });

  async function copy(value: string) {
    await Clipboard.setStringAsync(value);
    setCopied(true);
  }

  // ── Kurtarma kodları (kurulum bitti) ──────────────────────────────────────
  if (recoveryCodes) {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: t('security.twoFactor.recoveryTitle') }} />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.warn}>{t('security.twoFactor.recoveryHint')}</Text>
          <Text style={styles.warnStrong}>{t('mobile.security.recoveryOnceNotice')}</Text>

          <View style={styles.codeBox}>
            {recoveryCodes.map((c) => (
              <Text key={c} style={styles.recoveryCode} selectable>
                {c}
              </Text>
            ))}
          </View>

          {/* İndirme yok (web'in .txt'si mobilde dosya yönetimi demek); kopyala yeterli. */}
          <Pressable onPress={() => copy(recoveryCodes.join('\n'))} style={styles.secondaryButton}>
            <Ionicons name="copy-outline" size={18} color={theme.colors.textPrimary} />
            <Text style={styles.secondaryText}>
              {copied ? t('invite.copied') : t('invite.copy')}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryText}>{t('security.twoFactor.done')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Kurulum ikinci adım: doğrulama kodu ───────────────────────────────────
  if (secret) {
    return (
      <SecurityForm
        title={t('security.twoFactor.title')}
        submitLabel={t('security.twoFactor.enableButton')}
        onSubmit={onEnable}
        submitting={submitting}
        canSubmit={code.length === CODE_LENGTH}
        errorMessage={errorMessage}
      >
        <Text style={styles.hint}>{t('mobile.security.secretHint')}</Text>

        <Pressable onPress={() => copy(secret)} style={styles.secretBox}>
          <Text style={styles.secretLabel}>{t('security.twoFactor.secret')}</Text>
          <Text style={styles.secret} selectable>
            {secret}
          </Text>
          <Text style={styles.copyHint}>{copied ? t('invite.copied') : t('invite.copy')}</Text>
        </Pressable>

        <Text style={styles.label}>{t('security.twoFactor.enterCodeLabel')}</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          style={styles.input}
          placeholder={t('security.twoFactor.enterCodePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          editable={!submitting}
        />
      </SecurityForm>
    );
  }

  // ── Açık: kapat · Kapalı: kurulumu başlat ─────────────────────────────────
  return (
    <SecurityForm
      title={t('security.twoFactor.title')}
      submitLabel={
        twoFactorEnabled ? t('security.twoFactor.disable') : t('security.twoFactor.setup')
      }
      onSubmit={twoFactorEnabled ? onDisable : onSetup}
      submitting={submitting}
      canSubmit={reauthReady(reauth, twoFactorEnabled)}
      errorMessage={errorMessage}
      danger={twoFactorEnabled}
    >
      <View style={styles.statusRow}>
        <Ionicons
          name={twoFactorEnabled ? 'shield-checkmark' : 'shield-outline'}
          size={20}
          color={twoFactorEnabled ? theme.colors.success : theme.colors.textMuted}
        />
        <Text style={[styles.status, twoFactorEnabled && styles.statusOn]}>
          {twoFactorEnabled
            ? t('security.twoFactor.statusEnabled')
            : t('security.twoFactor.statusDisabled')}
        </Text>
      </View>

      <Text style={styles.hint}>{t('security.twoFactor.description')}</Text>
      <Text style={styles.label}>
        {twoFactorEnabled
          ? t('security.twoFactor.disableHint')
          : t('security.twoFactor.setupPasswordLabel')}
      </Text>

      <ReauthFields value={reauth} onChange={setReauth} disabled={submitting} />
    </SecurityForm>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: { padding: theme.layout.panelGap * 1.5, gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { color: theme.colors.textMuted, fontSize: theme.fontSize.base, fontWeight: '700' },
  statusOn: { color: theme.colors.success },
  hint: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, lineHeight: 19 },
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
  secretBox: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    padding: 12,
    gap: 4,
  },
  secretLabel: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, fontWeight: '700' },
  secret: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontFamily: theme.fontFamily.mono,
    letterSpacing: 1,
  },
  copyHint: { color: theme.colors.accent500, fontSize: theme.fontSize.xs, fontWeight: '700' },
  warn: { color: theme.colors.textBody, fontSize: theme.fontSize.sm, lineHeight: 19 },
  warnStrong: { color: theme.colors.warning, fontSize: theme.fontSize.sm, lineHeight: 19 },
  codeBox: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    padding: 12,
    gap: 6,
  },
  recoveryCode: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontFamily: theme.fontFamily.mono,
    letterSpacing: 1,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  secondaryText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '600' },
  primaryButton: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: theme.colors.textPrimary, fontSize: theme.fontSize.base, fontWeight: '700' },
});
