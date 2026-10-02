import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { attachmentsApi } from '@/api/attachments';
import { extractErrorMessage } from '@/api/errors';
import type { AttachmentDto } from '@/api/messages';
import { claimPlayback, releasePlayback } from '@/audio/voicePlayback';
import { useCallAudioBusy } from '@/hooks/useCallAudioBusy';
import { Waveform } from './Waveform';
import { formatClock } from '@/utils/formatClock';
import { decodeWaveform, fallbackWaveform } from '@/utils/waveform';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M6b §2/§7.3 — WhatsApp tarzı sesli mesaj oynatıcısı: [36px Kor daire ▶/⏸] [64 çubuklu dalga,
 * çalındıkça griden Kor'a boyanır] ve dalganın altında süre. Dalgaya dokun/sürükle = konum değiştir
 * (ayrı ilerleme çubuğu yok). Hız seçimi YOK (sonraki tur).
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

  // Dalga yoksa (M6b-1 mesajları / bozuk veri) ek id'sinden türetilen sabit desen — çökmez.
  const levels = useMemo(
    () => decodeWaveform(attachment.waveform) ?? fallbackWaveform(attachment.id),
    [attachment.waveform, attachment.id],
  );
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
            <ActivityIndicator size="small" color={theme.colors.textPrimary} />
          ) : (
            <Ionicons name={playing ? 'pause' : 'play'} size={20} color={theme.colors.textPrimary} />
          )}
        </Pressable>

        <View style={styles.main}>
          <View
            style={styles.waveHit}
            onLayout={(e) => {
              trackWidth.current = e.nativeEvent.layout.width;
            }}
            accessibilityRole="adjustable"
            accessibilityLabel={t('mobile.voice.seek')}
            {...pan.panHandlers}
          >
            <Waveform levels={levels} progress={fraction} activeColor={accent} />
          </View>
          <Text style={styles.time}>{formatClock(shownMs)}</Text>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 250,
    maxWidth: '100%',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  // §7.3 — 36px Kor daire, içinde beyaz ikon.
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  // Sürükleme alanı dalgadan yüksek; dalga ortada kalır.
  waveHit: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
  },
  time: {
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
