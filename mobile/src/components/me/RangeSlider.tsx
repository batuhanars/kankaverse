import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { theme } from '@/theme';

/**
 * Sprint C13 §6.3: kesit seçicinin kaydırıcısı. Saf JS (PanResponder): yeni native paket
 * (`@react-native-community/slider`) sözleşme gereği PM kararı, o yüzden eklenmedi.
 * Adım yuvarlaması 0,1 sn; dokunma alanı 44dp.
 */
interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}

const THUMB = 22;
const HIT = 44;

export function RangeSlider({ value, min, max, step = 0.1, disabled, onChange, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(0);
  // PanResponder bir kez kurulur; güncel değerler dokunuş anında ref'ten okunur.
  const live = useRef({ width, min, max, step, disabled, onChange });
  live.current = { width, min, max, step, disabled, onChange };

  const [pan] = useState(() => {
    function fromX(x: number) {
      const s = live.current;
      if (s.disabled || s.width <= 0 || s.max <= s.min) return;
      const ratio = Math.min(1, Math.max(0, x / s.width));
      const raw = s.min + ratio * (s.max - s.min);
      const stepped = Math.round(raw / s.step) * s.step;
      // Sol uç tam alt sınır: alt sınır adımın katı olmayabilir (uzaklaştırmada kaynağın sığdığı değer).
      s.onChange(ratio === 0 ? s.min : Math.min(s.max, Math.max(s.min, Number(stepped.toFixed(2)))));
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => fromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => fromX(e.nativeEvent.locationX),
    });
  });

  const span = max - min;
  const ratio = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0;
  const x = ratio * width;

  return (
    <View
      {...pan.panHandlers}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.hit, disabled && styles.disabled]}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: x }]} />
      </View>
      <View style={[styles.thumb, { left: x - THUMB / 2 }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    height: HIT,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    backgroundColor: theme.colors.accent500,
  },
  thumb: {
    position: 'absolute',
    top: (HIT - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: theme.colors.accent500,
    borderWidth: 2,
    borderColor: theme.colors.bgContent,
  },
});
