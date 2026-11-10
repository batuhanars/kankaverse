import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  /** Yukarıdayken gelen mesaj sayısı; 0 ise rozet çizilmez. */
  count: number;
  onPress: () => void;
}

/**
 * Mesaj listesinin sağ altındaki "en alta in" düğmesi (web `ScrollToBottomButton.vue` karşılığı).
 * Kullanıcı geçmişe doğru kaydırınca görünür; yukarıdayken gelen mesaj varsa rozet çıkar.
 * Liste kabının içinde mutlak konumlu: mesaj kutusunun üstünde, listeyle birlikte durur.
 */
export function ScrollToBottomButton({ count, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('message.scrollToBottom')}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name="chevron-down" size={22} color={theme.colors.textPrimary} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const SIZE = 42;

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  pressed: {
    opacity: 0.75,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent500,
  },
  badgeText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
});
