import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Göster/gizle düğmeli şifre alanı (sahip kararı 2026-11-12: yedek ve hesap şifresi alanlarının hepsinde).
 * Desen giriş ekranındakiyle aynı (M5c §1): varsayılan gizli, 44dp dokunma hedefi, mutlak konumlu göz ikonu.
 * Değer saklanmaz; yalnız çağıranın state'ine taşınır.
 */
export function SecretTextInput({ style, ...props }: Omit<TextInputProps, 'secureTextEntry'>) {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <TextInput {...props} secureTextEntry={!visible} style={[style, styles.input]} />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? t('mobile.auth.hidePassword') : t('mobile.auth.showPassword')}
        style={styles.toggle}
        hitSlop={4}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { paddingRight: theme.layout.inputMinHeight },
  toggle: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: theme.layout.inputMinHeight,
    height: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
