import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Şifreli sohbetin başındaki bilgi kutusu (sahip 2026-11-24; web `E2eeIntroBox` ile aynı metin).
 * Sohbetin en başında, "bu noktadan sonra şifreli" ayracının yerine çizilir. Dokununca güvenlik kodu
 * açılır (E7); kimlik henüz hazır değilse `onPress` verilmez ve kutu yalnız bilgi olarak kalır
 * (başlıktaki kilitle aynı kapı).
 */
export function E2eeIntroBox({ onPress }: { onPress?: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : 'text'}
        accessibilityLabel={`${t('e2ee.intro.title')}. ${t('e2ee.intro.body')}`}
        style={styles.box}
      >
        <Ionicons name="lock-closed" size={13} color={theme.colors.warning} style={styles.icon} />
        <View style={styles.texts}>
          <Text style={styles.title}>{t('e2ee.intro.title')}</Text>
          <Text style={styles.body}>
            {onPress ? `${t('e2ee.intro.body')} ${t('e2ee.intro.actionTap')}` : t('e2ee.intro.body')}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', marginTop: 16, marginBottom: 8, paddingHorizontal: 16 },
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: 420,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warningSubtle,
  },
  icon: { marginTop: 2 },
  texts: { flexShrink: 1, gap: 2 },
  title: { color: theme.colors.warning, fontSize: theme.fontSize.sm, fontWeight: '600' },
  body: { color: theme.colors.warning, fontSize: theme.fontSize.xs },
});
