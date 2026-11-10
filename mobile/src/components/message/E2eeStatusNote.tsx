import { StyleSheet, Text } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Çözülemeyen / bilinmeyen sürümlü şifreli mesajın baloncuk içeriği (E1 §4): metin yok, durum cümlesi var.
 * `unsupported` = bu uygulama sürümü o yük biçimini bilmiyor; `undecryptable` = cihaz eklenmeden önce gönderildi; `failed` = katılımdan sonra ama çözülemedi (§6.4).
 */
const KEYS = {
  unsupported: 'e2ee.unsupported',
  undecryptable: 'e2ee.beforeDevice',
  failed: 'e2ee.undecryptable',
} as const;

export function E2eeStatusNote({ status }: { status: 'unsupported' | 'undecryptable' | 'failed' }) {
  return (
    <Text style={styles.note}>{t(KEYS[status])}</Text>
  );
}

const styles = StyleSheet.create({
  note: { color: theme.colors.textMuted, fontSize: theme.fontSize.md, fontStyle: 'italic' },
});
