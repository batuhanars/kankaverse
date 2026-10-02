import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { attachmentsApi } from '@/api/attachments';
import { extractErrorMessage } from '@/api/errors';
import type { AttachmentDto } from '@/api/messages';
import { claimPlayback, releasePlayback } from '@/audio/voicePlayback';
import { useCallAudioBusy } from '@/hooks/useCallAudioBusy';
import { formatClock } from '@/utils/formatClock';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M6b §2 — sesli mesaj oynatıcısı: [▶/⏸] [ilerleme çubuğu] [süre]. Dalga formu ve hız seçimi
 * YOK (sonraki tur).
 *
 * 🔴 Adres GEÇ alınır: presigned GET ömrü 300 sn, mesaj listesi daha uzun açık kalabilir. Adres ilk
 * çalmada (kullanıcı niyetiyle) `GET /attachments/:id`'den alınır; T&S/tarama kapısı sunucuda.
 * Çağıran (`AttachmentView`) `scanStatus === CLEAN` kapısını zaten geçirmiş olarak çizer.
 *
 * `isMine`: kendi baloncuğumda Kor zemin üstünde `accent500` okunmuyor → `accent400` (M6a §4).
 */
export function VoicePlayer({ attachment, isMine }: { attachment: AttachmentDto; isMine: boolean }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const { inCall, ringing } = useCallAudioBusy();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Sürükleme sırasındaki geçici konum (0..1); null = çubuk gerçek konumu gösterir. */
  const [scrub, setScrub] = useState<number | null>(null);
  const sourceSet = useRef(false);
  const trackWidth = useRef(0);

  const accent = isMine ? theme.colors.accent400 : theme.colors.accent500;
  const totalMs = attachment.durationMs ?? (status.duration > 0 ? Math.round(status.duration * 1000) : 0);
  const playing = status.playing;
  const fraction = scrub ?? (totalMs > 0 ? Math.min(1, (status.currentTime * 1000) / totalMs) : 0);

  // "Başkası claim etti → dur" geri çağrısı. Kimliği SABİT olmalı (`claim`/`release` eşlemesi), içeriği
  // her render'da güncel oyuncuyu kullanır.
  const pauseRef = useRef<() => void>(() => {});
  pauseRef.current = () => {
    try {
      player.pause();
    } catch {
      // oyuncu serbest bırakılmış olabilir
    }
  };
  const stop = useRef(() => pauseRef.current()).current;

  // Bitince başa sar (düğme ▶'ye kendiliğinden döner: `playing` false).
  useEffect(() => {
    if (!status.didJustFinish) return;
    releasePlayback(stop);
    void player.seekTo(0).catch(() => {});
  }, [status.didJustFinish, player, stop]);

  // Arama başladı/geliyor: çalan ses durur (M5f zili ve LiveKit oturumuyla çakışmasın).
  useEffect(() => {
    if ((inCall || ringing) && playing) player.pause();
  }, [inCall, ringing, playing, player]);

  useEffect(() => {
    return () => {
      releasePlayback(stop);
      try {
        player.pause();
      } catch {
        // bileşen sökülüyor
      }
    };
  }, [player, stop]);

  async function ensureSource(): Promise<boolean> {
    if (sourceSet.current) return true;
    setLoading(true);
    setError('');
    try {
      const { url } = await attachmentsApi.getUrl(attachment.id);
      player.replace({ uri: url });
      sourceSet.current = true;
      return true;
    } catch (e) {
      setError(extractErrorMessage(e));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function togglePlay() {
    if (loading) return;
    if (playing) {
      player.pause();
      return;
    }
    if (inCall || ringing) return;
    if (!(await ensureSource())) return;
    claimPlayback(stop);
    // Sonda kalmışsa baştan çal.
    if (status.duration > 0 && status.currentTime >= status.duration - 0.05) {
      await player.seekTo(0).catch(() => {});
    }
    player.play();
  }

  async function seekToFraction(f: number) {
    if (totalMs <= 0 || !(await ensureSource())) return;
    await player.seekTo((f * totalMs) / 1000).catch(() => {});
  }

  const fractionAt = (x: number) =>
    trackWidth.current > 0 ? Math.max(0, Math.min(1, x / trackWidth.current)) : 0;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Liste kaydırması çubuğu çalmasın: sürükleme bitene dek jest bizde.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setScrub(fractionAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setScrub(fractionAt(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => {
        const f = fractionAt(e.nativeEvent.locationX);
        setScrub(null);
        void seekToFraction(f);
      },
      onPanResponderTerminate: () => setScrub(null),
    }),
  ).current;

  const shownMs = playing || status.currentTime > 0 ? Math.round(status.currentTime * 1000) : totalMs;

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={() => void togglePlay()}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={playing ? t('mobile.voice.pause') : t('mobile.voice.play')}
          style={styles.playButton}
        >
          {loading ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Ionicons name={playing ? 'pause' : 'play'} size={22} color={accent} />
          )}
        </Pressable>

        <View
          style={styles.trackHit}
          onLayout={(e) => {
            trackWidth.current = e.nativeEvent.layout.width;
          }}
          accessibilityRole="adjustable"
          accessibilityLabel={t('mobile.voice.seek')}
          {...pan.panHandlers}
        >
          <View style={styles.track} pointerEvents="none">
            <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: accent }]} />
          </View>
        </View>

        <Text style={styles.time}>{formatClock(shownMs)}</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 230,
    maxWidth: '100%',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  playButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dokunma/sürükleme alanı çubuktan yüksek (44dp), çizilen çubuk ince.
  trackHit: {
    flex: 1,
    height: theme.layout.inputMinHeight,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
  },
  time: {
    minWidth: 34,
    textAlign: 'right',
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontVariant: ['tabular-nums'],
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
});
