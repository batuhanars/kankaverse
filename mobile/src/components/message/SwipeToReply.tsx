import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, Vibration, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

/** C23 §0.3 — balon en fazla bu kadar sağa gider; eşik geçilince alıntı tetiklenir. */
const MAX_DRAG = 72;
const TRIGGER = 56;
/** Eşik geçilince tek kısa titreşim; 10 ms çoğu cihazda hissedilmiyordu. */
const HAPTIC_MS = 30;

function buzz() {
  Vibration.vibrate(HAPTIC_MS);
}

interface Props {
  /** Sağa kaydırma. Verilmezse (onEdit de yoksa) kaydırma KAPALI, sarmalayıcı bir şey eklemez. */
  onReply?: () => void;
  /** Sola kaydırma = düzenle; yalnız eylem panelinde Düzenle görünen (kendi) mesajlarda verilir. */
  onEdit?: () => void;
  children: ReactNode;
}

/**
 * Sağa kaydırarak alıntı (WhatsApp deseni). Paylaşılan değerler UI thread'de; satır başına React
 * durumu YOK, böylece liste performansı korunur.
 *
 * `activeOffsetX` 15 + `failOffsetY` ±10: dikey liste kaydırması her zaman kazanır, yatay niyet
 * net değilse jest hiç başlamaz. Sola kaydırma yalnız `onEdit` varsa çalışır (düzenle), yoksa boş.
 * Gerçek işlev `onReply` ile gelir (eylem panelinin Yanıtla'sıyla aynı fonksiyon).
 * Kök `GestureHandlerRootView` `MessageScreen`de: kök ağaçta yok ve Modal dışı bu ekran için yeterli.
 */
export function SwipeToReply({ onReply, onEdit, children }: Props) {
  const translateX = useSharedValue(0);
  const passed = useSharedValue(false);

  // Jest her render'da yeniden kurulmasın: işleyiciler ref'te, jest yalnız yön var/yok'a bağlı.
  // (Satır içi `() => replyTo(...)` her render yeni kimlik; deps'e girerse Pan sürekli yeniden kurulurdu.)
  const replyRef = useRef(onReply);
  const editRef = useRef(onEdit);
  replyRef.current = onReply;
  editRef.current = onEdit;
  const fireReply = useCallback(() => replyRef.current?.(), []);
  const fireEdit = useCallback(() => editRef.current?.(), []);
  const canReply = !!onReply;
  const canEdit = !!onEdit;

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canReply || canEdit)
        .activeOffsetX([-15, 15])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          // Yön işlevi yoksa o yöne sürükleme 0'a kenetlenir (boş).
          const x = Math.min(Math.max(e.translationX, canEdit ? -MAX_DRAG : 0), canReply ? MAX_DRAG : 0);
          translateX.value = x;
          if (Math.abs(x) >= TRIGGER && !passed.value) {
            passed.value = true;
            runOnJS(buzz)();
          } else if (Math.abs(x) < TRIGGER && passed.value) {
            passed.value = false;
          }
        })
        .onEnd(() => {
          if (!passed.value) return;
          if (translateX.value > 0 && canReply) runOnJS(fireReply)();
          else if (translateX.value < 0 && canEdit) runOnJS(fireEdit)();
        })
        .onFinalize(() => {
          passed.value = false;
          translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        }),
    [canReply, canEdit, fireReply, fireEdit, translateX, passed],
  );

  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, TRIGGER], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(translateX.value, [0, TRIGGER], [0.6, 1], Extrapolation.CLAMP) }],
  }));
  const editIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-translateX.value, [0, TRIGGER], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(-translateX.value, [0, TRIGGER], [0.6, 1], Extrapolation.CLAMP) }],
  }));

  if (!onReply && !onEdit) return <>{children}</>;

  return (
    <View>
      {onReply && (
        <Animated.View style={[styles.icon, styles.iconLeft, replyIconStyle]} pointerEvents="none">
          <Ionicons name="arrow-undo" size={20} color={theme.colors.accent500} />
        </Animated.View>
      )}
      {onEdit && (
        <Animated.View style={[styles.icon, styles.iconRight, editIconStyle]} pointerEvents="none">
          <Ionicons name="create-outline" size={20} color={theme.colors.accent500} />
        </Animated.View>
      )}
      <GestureDetector gesture={gesture}>
        <Animated.View style={bubbleStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  iconLeft: { left: theme.layout.panelGap },
  iconRight: { right: theme.layout.panelGap },
});
