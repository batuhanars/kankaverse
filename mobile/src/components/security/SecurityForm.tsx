import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { Stack } from 'expo-router';
import { theme } from '@/theme';

/**
 * Sprint M1f — güvenlik formlarının ortak kabuğu.
 *
 * Beş ekran (şifre, e-posta, 2FA kur/kapat, hesap sil) aynı iskeleti tekrar ediyordu: başlık, klavye
 * kaçınması, hata satırı, başarı satırı, tek gönder düğmesi. Rule of Three fazlasıyla aşıldı (5 kullanım),
 * bu yüzden çıkarıldı — erken soyutlama değil.
 *
 * `danger` yalnız hesap silmede: yıkıcı eylem Kor değil **kırmızı** düğme ister; aynı ekranın "geri
 * alınabilir" metnini yumuşatmaz, sadece dokunmadan önce durdurur.
 */
interface Props {
  title: string;
  children: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  submitting: boolean;
  /** Kapalıyken düğme pasif — sebep zaten formun içinde yazılı olur. */
  canSubmit: boolean;
  /** Sunucudan gelen Türkçe mesaj (`extractErrorMessage`); ham hata metni basılmaz. */
  errorMessage?: string;
  successMessage?: string;
  danger?: boolean;
}

export function SecurityForm({
  title,
  children,
  submitLabel,
  onSubmit,
  submitting,
  canSubmit,
  errorMessage,
  successMessage,
  danger,
}: Props) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
          style={[
            styles.submit,
            danger && styles.submitDanger,
            (!canSubmit || submitting) && styles.submitDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.submitText}>{submitLabel}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
  body: {
    padding: theme.layout.panelGap * 1.5,
    gap: 10,
    paddingBottom: theme.layout.panelGap * 2,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm, lineHeight: 19 },
  success: { color: theme.colors.success, fontSize: theme.fontSize.sm, lineHeight: 19 },
  submit: {
    marginTop: 10,
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDanger: { backgroundColor: theme.colors.danger },
  submitDisabled: { opacity: 0.5 },
  // Kor ve kırmızı zeminde aynı açık metin rengi kullanılıyor (web'de de öyle); ayrı bir
  // "ters metin" token'ı yok, uydurulmuyor.
  submitText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
});
