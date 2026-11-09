import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAiVideoViewerStore } from '@/stores/aiVideoViewer';
import { theme } from '@/theme';

/**
 * C49 R3: yapay zeka video giriş simgesi. Süren (QUEUED/RUNNING) üretim varken sağ üstte küçük kırmızı nokta (sahip 2026-11-09: Kor yerine kırmızı)
 * ("sürüyor"). Durumun tek kaynağı `aiVideoViewer` store'u; ek yoklama yok.
 */
export function AiVideoSparkles({ size, color }: { size: number; color: string }) {
  const active = useAiVideoViewerStore((s) => s.activeId !== null);
  return (
    <View>
      <Ionicons name="sparkles-outline" size={size} color={color} />
      {active ? <View style={styles.dot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.colors.danger,
    borderWidth: 1.5,
    borderColor: theme.colors.bgSidebar,
  },
});
