import { StyleSheet, View } from 'react-native';
import { theme } from '@/theme';

const MIN_BAR = 3;
const MAX_BAR = 28;

/**
 * Sprint M6b §7.3 — dikey çubuklu dalga. Çubuklar yatayda eşit pay alır (`flex: 1`), yani genişlik
 * neyse sığar (dar baloncukta taşmaz). Yükseklik örnekle (0-255) orantılı, 3..28px.
 *
 * `progress` (0..1) verilirse ilk `progress * çubuk sayısı` çubuk `activeColor`, kalanı `idleColor`
 * boyanır; verilmezse hepsi `activeColor` (canlı kayıt dalgası).
 */
export function Waveform({
  levels,
  progress,
  activeColor,
  idleColor = theme.colors.textMuted,
}: {
  levels: number[];
  progress?: number;
  activeColor: string;
  idleColor?: string;
}) {
  const playedBars = progress === undefined ? levels.length : Math.round(progress * levels.length);
  return (
    <View style={styles.row} pointerEvents="none">
      {levels.map((level, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: MIN_BAR + (Math.max(0, Math.min(255, level)) / 255) * (MAX_BAR - MIN_BAR),
              backgroundColor: i < playedBars ? activeColor : idleColor,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    height: MAX_BAR,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bar: {
    flex: 1,
    marginHorizontal: 0.75,
    borderRadius: 2,
    minWidth: 1,
  },
});
