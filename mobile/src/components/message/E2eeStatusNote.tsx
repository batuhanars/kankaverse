import { StyleSheet, Text } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Çözülemeyen / bilinmeyen sürümlü şifreli mesajın baloncuk içeriği (E1 §4): metin yok, durum cümlesi var.
 * `unsupported` = bu uygulama sürümü o yük biçimini bilmiyor; `undecryptable` = cihaz eklenmeden önce gönderildi.
 */
export function E2eeStatusNote({ status }: { status: 'unsupported' | 'undecryptable' }) {
  return (
    <Text style={styles.note}>{status === 'unsupported' ? t('e2ee.unsupported') : t('e2ee.beforeDevice')}</Text>
  );
}

const styles = StyleSheet.create({
  note: { color: theme.colors.textMuted, fontSize: theme.fontSize.md, fontStyle: 'italic' },
});
