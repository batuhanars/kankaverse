import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { t } from '@/i18n';
import { theme } from '@/theme';

/** C67: bir mesajı "en son okunan" olarak işaretleyen okuyucu (ad/avatar store'daki üyeden). */
export interface SeenReader {
  userId: string;
  name: string;
  avatarUrl: string | null;
  readAt: string;
  /**
   * C67 §4: bu avatarın önceki konumuna dikey uzaklığı (dp; + = önceki konum aşağıda, - = yukarıda).
   * Doluysa avatar o konumdan 0'a 250 ms kayar; yoksa (ilk görünüm / ölçü bilinmiyor) yerinde belirir.
   */
  fromY?: number;
}

const MAX_SHOWN = 5;
const SIZE = 16;
const LABEL_MS = 2500;
const SLIDE_MS = 250;

/** TR saat biçimi "18.42" (kök CLAUDE.md). */
function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * C67 §3: mesajın altında sağa hizalı okuyucu avatarları (en yeni okuyan sağda, en çok 5 + "+N").
 * Konum değişince avatar yeni mesajın altında `fromY` uzaklığından 0'a kayar (250 ms, ease-out; FLIP);
 * "animasyonları azalt" açıksa animasyonsuz. Uzun basış "{ad} gördü · 18.42" gösterir.
 */
export function SeenAvatars({ readers }: { readers: SeenReader[] }) {
  const reduced = useReducedMotion();
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!label) return;
    const id = setTimeout(() => setLabel(null), LABEL_MS);
    return () => clearTimeout(id);
  }, [label]);

  // readAt artan: en yeni okuyan en sağda. Taşan kısım "+N" olarak soldan gizlenir (en eskiler).
  const sorted = [...readers].sort((a, b) => (a.readAt < b.readAt ? -1 : a.readAt > b.readAt ? 1 : 0));
  const extra = Math.max(0, sorted.length - MAX_SHOWN);
  const shown = sorted.slice(extra);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {extra > 0 ? <Text style={styles.more}>+{extra}</Text> : null}
        {shown.map((r) => {
          const text = t('mobile.seen.byAt', { name: r.name, time: clock(r.readAt) });
          return (
            <SlidingAvatar key={r.userId} reader={r} text={text} animate={!reduced} onLongPress={() => setLabel(text)} />
          );
        })}
      </View>
    </View>
  );
}

/** Mount'ta `fromY`'den 0'a kayar (UI thread'de, köprü yok); kaydırırken hücreyle birlikte durur (hücre içinde). */
function SlidingAvatar({
  reader,
  text,
  animate,
  onLongPress,
}: {
  reader: SeenReader;
  text: string;
  animate: boolean;
  onLongPress: () => void;
}) {
  const from = animate && reader.fromY ? reader.fromY : 0;
  const y = useSharedValue(from);
  useEffect(() => {
    if (from !== 0) y.value = withTiming(0, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) });
    // yalnız mount: sonraki render'larda yeniden başlatma
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={style}>
      <Pressable onLongPress={onLongPress} accessibilityRole="image" accessibilityLabel={text}>
        {reader.avatarUrl ? (
          <Image source={{ uri: reader.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.fallback]}>
            <Text style={styles.fallbackText}>{reader.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Satır yüksekliği SABİT (SIZE): avatar hücreler arası kayarken liste yüksekliği zıplamaz. Etiket mutlak konumlu.
  wrap: { alignItems: 'flex-end', paddingHorizontal: 12, marginTop: 2, height: SIZE },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, height: SIZE },
  avatar: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  fallback: { backgroundColor: theme.colors.accentSubtle, alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: theme.colors.accent500, fontSize: 9, fontWeight: '700' },
  more: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginRight: 2 },
  label: { position: 'absolute', right: 12, bottom: SIZE + 2, color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
});
