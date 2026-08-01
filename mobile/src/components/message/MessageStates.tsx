import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Mesaj listesinin üç "içerik yok" hâli: yükleniyor · hata + tekrar dene · hiç mesaj yok.
 * `MessageScreen`den ayrıldı (M1d-C §2.1, saf taşıma).
 *
 * Üçü tek dosyada çünkü üçü de aynı ortalanmış kabuğu paylaşıyor; ayrı dosyalara bölmek aynı
 * `center` stilini üç yere kopyalamak olurdu.
 */
export function MessageLoading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.colors.accent500} />
    </View>
  );
}

export function MessageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.error}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryText}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  );
}

export function MessageEmpty() {
  return (
    <View style={styles.center}>
      <Text style={styles.empty}>{t('message.noMessages')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap * 1.5,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
    marginBottom: theme.layout.panelGap,
  },
  retryButton: {
    minHeight: theme.layout.control,
    paddingHorizontal: theme.layout.panelGap,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.base,
    textAlign: 'center',
  },
});
