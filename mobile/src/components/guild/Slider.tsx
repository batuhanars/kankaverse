import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

const THUMB_SIZE = 22;

interface Props {
  /** Üstte gösterilen etiket (örn. `t('channel.userLimitLabel')`). */
  label: string;
  value: number;
  min: number;
  max: number;
  /** Adım büyüklüğü — kullanıcı limiti 1, bit hızı 8 (sunucudaki aralıkla birebir, çağıran verir). */
  step: number;
  onValueChange: (value: number) => void;
  /** Etiketin yanında gösterilen değer metni (örn. "∞" ya da "64 kbps"). */
  formatValue: (value: number) => string;
  /** Kaydırıcının altındaki uç etiketleri — web'deki aynı uçlar (örn. "∞"/"99", "8 kbps"/"96 kbps"). */
  minLabel: string;
  maxLabel: string;
}

/**
 * Web'deki `<input type="range">` kaydırıcısının RN karşılığı (Sprint M4k).
 *
 * `@react-native-community/slider` KULLANILMADI — native paket demek yeni derleme demek, sahip
 * yeni derleme aldı (M4k §2). `VoiceChannelSheet.tsx`teki sürükle-kapat aynı gerekçeyle saf JS
 * `PanResponder` kullanıyor; aynı yol izlendi.
 *
 * Kanal düzenlemede iki kez kullanılıyor (kullanıcı limiti · bit hızı) — aralık/adım/biçim
 * çağırana parametre, ortak olan yalnız sürükleme mekaniği.
 *
 * Dokunma hedefi D37 dersine göre ÖLÇÜLEREK kuruldu (göz kararı değil): dokunma alanı görünen ince
 * çizgiden ayrı — tüm genişlik boyunca `theme.layout.inputMinHeight` (44dp) yükseklikte, ince
 * çizgiyi ya da küçük topuzu tutturmaya gerek yok.
 */
export function Slider({ label, value, min, max, step, onValueChange, formatValue, minLabel, maxLabel }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const startXRef = useRef(0);
  // Sürükleme sırasında `onValueChange` referansı değişse de PanResponder yeniden kurulmasın.
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const commit = useCallback(
    (x: number) => {
      if (trackWidth <= 0) return;
      const ratio = Math.min(1, Math.max(0, x / trackWidth));
      const raw = min + ratio * (max - min);
      const stepped = Math.round(raw / step) * step;
      onValueChangeRef.current(Math.min(max, Math.max(min, stepped)));
    },
    [trackWidth, min, max, step],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Dokunulduğu an yakalanır (web'deki range input'un tıkla-atla davranışıyla aynı) —
        // yalnız sürüklemeye özgü `onMoveShouldSetPanResponder` burada eksik olurdu: tek dokunuşla
        // değer değiştirme (sürüklemeden) hiç çalışmazdı.
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          startXRef.current = e.nativeEvent.locationX;
          commit(startXRef.current);
        },
        onPanResponderMove: (_e, g) => commit(startXRef.current + g.dx),
      }),
    [commit],
  );

  const percent = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
  const thumbLeft = Math.min(trackWidth - THUMB_SIZE, Math.max(0, percent * trackWidth - THUMB_SIZE / 2));

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{formatValue(value)}</Text>
      </View>

      <View
        style={styles.touchArea}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value }}
        {...pan.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${percent * 100}%` }]} />
        </View>
        {trackWidth > 0 && <View style={[styles.thumb, { left: thumbLeft }]} />}
      </View>

      <View style={styles.endpoints}>
        <Text style={styles.endpointText}>{minLabel}</Text>
        <Text style={styles.endpointText}>{maxLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  value: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  // Dokunma hedefi: `inputMinHeight` = 44dp (tema tokeni). Görünen çizgi 4dp ama sürüklenebilir
  // alan bu View'ın TAMAMI — genişlik boyunca, 44dp yükseklikte.
  touchArea: {
    height: theme.layout.inputMinHeight,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  trackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.accent500,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: theme.colors.accent500,
    borderWidth: 2,
    borderColor: theme.colors.textPrimary,
  },
  endpoints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  endpointText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
  },
});
