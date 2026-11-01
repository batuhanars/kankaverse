import { useMemo, useRef, type ReactNode } from 'react';
import { Pressable, View, type AccessibilityRole, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';

/** Tap süresi sınırı: bundan uzun basış, baloncuğun uzun basma menüsüne kalır (350 ms). */
export const BUBBLE_TAP_MAX_DURATION_MS = 300;
const TAP_MAX_DISTANCE = 12;

interface Props {
  /** Baloncuğun çift dokunma jesti. Verilmezse düz `Pressable`: tek dokunuş hiç beklemez. */
  doubleTap?: GestureType;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  accessibilityRole: AccessibilityRole;
  accessibilityLabel: string;
  children: ReactNode;
}

/**
 * C46 §6.1 — baloncuk içi medyanın dokunma hedefi. RN `Pressable` ilk dokunuşta tetiklenir ve tam
 * ekran açılınca ikinci dokunuşa sıra gelmez; burada tek dokunuş, çift dokunma jesti başarısız
 * olunca çalışır. Bu yüzden baloncukta tek dokunuş `maxDelay` kadar gecikir.
 */
export function MediaPressable({ doubleTap, ...props }: Props) {
  if (!doubleTap) {
    const { onPress, style, hitSlop, accessibilityRole, accessibilityLabel, children } = props;
    return (
      <Pressable
        onPress={onPress}
        style={style}
        hitSlop={hitSlop}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    );
  }
  return <DeferredPressable doubleTap={doubleTap} {...props} />;
}

function DeferredPressable({
  doubleTap,
  onPress,
  style,
  hitSlop,
  accessibilityRole,
  accessibilityLabel,
  children,
}: Props & { doubleTap: GestureType }) {
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const singleTap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(TAP_MAX_DISTANCE)
        .maxDuration(BUBBLE_TAP_MAX_DURATION_MS)
        .hitSlop(hitSlop ?? 0)
        .requireExternalGestureToFail(doubleTap)
        .runOnJS(true)
        .onEnd((_e, success) => {
          if (success) onPressRef.current();
        }),
    [doubleTap, hitSlop],
  );

  return (
    <GestureDetector gesture={singleTap}>
      <View
        collapsable={false}
        style={style}
        accessible
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        onAccessibilityTap={() => onPressRef.current()}
      >
        {children}
      </View>
    </GestureDetector>
  );
}
