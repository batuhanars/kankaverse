import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/theme';
import { useToastStore } from '@/stores/toast';

/** Android toast'ının alt kenardan yaklaşık mesafesi. */
const BOTTOM_OFFSET = 64;
const FADE_MS = 180;

/**
 * Android toast görünümünde uygulama içi toast (altta ortalı hap). Fark: isteğe bağlı eylem düğmesi
 * dokunulabilir. Kendisi dışındaki alana dokunuşları engellemez (`box-none`).
 */
export function AppToast() {
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(
        () => hide(current.id),
      );
    }, current.durationMs);
    return () => clearTimeout(timer);
  }, [current, hide, opacity]);

  if (!current) return null;

  const onAction = () => {
    hide(current.id);
    current.action?.run();
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + BOTTOM_OFFSET }]}>
      <Animated.View style={[styles.pill, { opacity }]}>
        <Text style={styles.message}>{current.message}</Text>
        {current.action ? (
          <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
            <Text style={styles.action}>{current.action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    maxWidth: '100%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderStrong,
  },
  message: {
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
  },
  action: {
    color: theme.colors.accent400,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
});
