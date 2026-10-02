import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M6c §3.4 — tam ekran video oynatıcı (`ImageViewer` deseni: modal, kapat düğmesi).
 * Yerel kontroller açık (`nativeControls`). Adres alma/T&S kapısı `VideoCard`'da; bu bileşen yalnız
 * sunum yapar.
 *
 * `VideoSurface` yalnız modal AÇIKKEN ve adres hazırken monte edilir: kapanınca sökülür ve
 * `useVideoPlayer` oynatıcıyı kendiliğinden durdurup serbest bırakır.
 */
export function VideoViewer({
  visible,
  url,
  errorMessage,
  onClose,
}: {
  visible: boolean;
  url: string | null;
  errorMessage?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root} accessibilityLabel={t('mobile.video.viewer')}>
        {errorMessage ? (
          <Text style={styles.error}>{errorMessage}</Text>
        ) : url ? (
          <VideoSurface url={url} />
        ) : (
          <ActivityIndicator color={theme.colors.textMuted} />
        )}
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={[styles.close, { top: insets.top + 8 }]}
        >
          <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
        </Pressable>
      </View>
    </Modal>
  );
}

function VideoSurface({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.play();
  });
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  close: {
    position: 'absolute',
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    paddingHorizontal: 24,
    textAlign: 'center',
  },
});
