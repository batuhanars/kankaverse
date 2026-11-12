import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { ReauthFields as ReauthValue } from '@/api/auth';
import { SecretTextInput } from '@/components/security/SecretTextInput';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1f §2.2 — hassas işlemlerin ortak kimlik doğrulama alanları.
 *
 * Beş ekran da (şifre, e-posta, 2FA kur, 2FA kapat, hesap sil) aynı `ReauthFieldsDto`'yu gönderiyor;
 * alanlar **satır içi**, ayrı bir modal değil. Web de böyle yapıyor (`security.password.currentPassword`
 * + `totpCode` aynı formda) — modal koymak mobilde iki katmanlı klavye demek olurdu.
 *
 * 🔴 **Şifre burada tutulmaz, yalnız yukarı taşınır.** Değer ekranın state'inde yaşar, istekle birlikte
 * gider; store'a, AsyncStorage'a veya loga ASLA yazılmaz (sözleşme §3).
 *
 * TOTP alanı yalnız `user.twoFactorEnabled` iken çizilir: 2FA kapalı kullanıcıya "6 haneli kod" sormak
 * cevaplanamaz bir soru olurdu. Sunucu zaten `totpCode`'u opsiyonel kabul ediyor.
 */
interface Props {
  value: ReauthValue;
  onChange: (next: ReauthValue) => void;
  /** Kaydetme sürerken alanlar kilitlenir (çift gönderim + yarı yazılmış istek). */
  disabled?: boolean;
  /**
   * Varsayılan "Mevcut Şifre". Yedek ekranında (sıfırla/kapat) "Hesap şifren" + açıklama verilir:
   * orada "mevcut şifre" yedek şifresi sanılıyordu (sahip bulgusu 2026-11-12).
   */
  passwordLabel?: string;
  passwordHint?: string;
}

export function ReauthFields({ value, onChange, disabled, passwordLabel, passwordHint }: Props) {
  const twoFactorEnabled = useAuthStore((s) => s.user?.twoFactorEnabled ?? false);

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{passwordLabel ?? t('reauth.currentPassword')}</Text>
      {passwordHint ? <Text style={styles.hint}>{passwordHint}</Text> : null}
      <SecretTextInput
        value={value.currentPassword}
        onChangeText={(currentPassword) => onChange({ ...value, currentPassword })}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        textContentType="password"
      />

      {twoFactorEnabled ? (
        <>
          <Text style={styles.label}>{t('reauth.totpCode')}</Text>
          <TextInput
            value={value.totpCode ?? ''}
            onChangeText={(totpCode) => onChange({ ...value, totpCode })}
            style={styles.input}
            placeholder={t('reauth.totpCodePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            editable={!disabled}
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * Gönderime hazır mı — **yalnız alanların dolu olup olmadığına** bakar.
 * 🔴 Şifrenin/kodun DOĞRU olup olmadığı kararı sunucudadır (sözleşme §3); istemci burada tahmin
 * yürütmez, yalnız boş formun sunucuya gitmesini engeller.
 */
export function reauthReady(value: ReauthValue, twoFactorEnabled: boolean): boolean {
  if (!value.currentPassword) return false;
  if (twoFactorEnabled && (value.totpCode ?? '').length !== 6) return false;
  return true;
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, lineHeight: 19 },
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
});
