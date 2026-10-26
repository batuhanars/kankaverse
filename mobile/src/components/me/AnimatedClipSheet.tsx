import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { AnimatedTarget } from '@/api/users';
import { extractErrorCode, extractErrorMessage } from '@/api/errors';
import {
  ANIMATED_DEFAULT_MS,
  ANIMATED_MAX_MS,
  ANIMATED_MIN_MS,
  uploadAnimated,
  type PickedProfileMedia,
} from '@/utils/animatedMedia';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { RangeSlider } from './RangeSlider';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint C13 §6.2-6.3: GIF önizleme veya video kesit seçici + yükleme (web `AnimatedClipModal`).
 * Akış: (gerekirse sıkıştır) → presign → PUT → işle. Sunucu hareketli WebP üretir.
 *
 * Kurallar web ile aynı: kesit 0,5 ile 6 sn, varsayılan 3 sn, seçili aralık döngüde oynar.
 * `ANIMATED_DISABLED` gelirse `onDisabled` çağrılır (üst ekran statik moda düşer).
 */
export type ClipMedia = Extract<PickedProfileMedia, { kind: 'gif' | 'video' }>;

interface Props {
  media: ClipMedia | null;
  target: AnimatedTarget;
  onClose: () => void;
  onDone: () => void;
  onDisabled: () => void;
}

const MIN_S = ANIMATED_MIN_MS / 1000;
const MAX_S = ANIMATED_MAX_MS / 1000;
const DEFAULT_S = ANIMATED_DEFAULT_MS / 1000;

export function AnimatedClipSheet({ media, target, onClose, onDone, onDisabled }: Props) {
  const bottomInset = useSheetInsets();
  const [busy, setBusy] = useState(false);
  return (
    <Modal transparent visible={!!media} animationType="slide" onRequestClose={() => !busy && onClose()}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}>
          {/* Her seçimde yeni örnek: kaydırıcı/oynatıcı durumu bir önceki dosyadan kalmasın. */}
          {media ? (
            <ClipBody
              key={media.uri}
              media={media}
              target={target}
              busy={busy}
              setBusy={setBusy}
              onClose={onClose}
              onDone={onDone}
              onDisabled={onDisabled}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ClipBody({
  media,
  target,
  busy,
  setBusy,
  onClose,
  onDone,
  onDisabled,
}: Omit<Props, 'media'> & { media: ClipMedia; busy: boolean; setBusy: (b: boolean) => void }) {
  const isVideo = media.kind === 'video';
  const [durationS, setDurationS] = useState(media.kind === 'video' ? media.durationMs / 1000 : 0);
  const [startS, setStartS] = useState(0);
  const [lenS, setLenS] = useState(DEFAULT_S);
  const [phase, setPhase] = useState<'compress' | 'upload' | 'process'>('upload');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');

  const player = useVideoPlayer(isVideo ? media.uri : null, (p) => {
    p.muted = true;
    p.loop = true;
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });

  // Seçili aralık döngüsü için güncel değerler ref'te (dinleyici bir kez bağlanır).
  const range = useRef({ startS, lenS });
  useEffect(() => {
    range.current = { startS, lenS };
  }, [startS, lenS]);

  useEffect(() => {
    if (!isVideo) return;
    const loaded = player.addListener('sourceLoad', (e) => {
      if (e.duration > 0) {
        setDurationS(e.duration);
        setLenS((cur) => Math.max(MIN_S, Math.min(cur, e.duration)));
      }
    });
    const tick = player.addListener('timeUpdate', ({ currentTime }) => {
      const { startS: s, lenS: l } = range.current;
      if (currentTime >= s + l || currentTime < s - 0.3) player.currentTime = s;
    });
    return () => {
      loaded.remove();
      tick.remove();
    };
  }, [isVideo, player]);

  const maxLen = useMemo(() => Math.min(MAX_S, durationS > 0 ? durationS : MAX_S), [durationS]);
  const effLen = Math.min(lenS, maxLen);
  const maxStart = Math.max(0, durationS - effLen);
  const sliders = isVideo && durationS > 0;

  function changeStart(v: number) {
    setStartS(v);
    player.currentTime = v;
  }
  function changeLen(v: number) {
    setLenS(v);
    const nextMaxStart = Math.max(0, durationS - v);
    if (startS > nextMaxStart) {
      setStartS(nextMaxStart);
      player.currentTime = nextMaxStart;
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await uploadAnimated({
        target,
        media,
        startMs: sliders ? Math.round(startS * 1000) : undefined,
        durationMs: sliders ? Math.round(effLen * 1000) : undefined,
        onPhase: (ph, p) => {
          setPhase(ph);
          setPct(p);
        },
      });
      onDone();
    } catch (e) {
      const code = extractErrorCode(e);
      if (code === 'ANIMATED_DISABLED') {
        onDisabled();
        return;
      }
      // Hata kodu → Türkçe metin (profile.animated.errors.*); eşleşme yoksa sunucunun `message`ı.
      const key = code ? `profile.animated.errors.${code}` : '';
      const mapped = key ? t(key) : key;
      setError(key && mapped !== key ? mapped : code ? extractErrorMessage(e) : t('profile.animated.errorUpload'));
    } finally {
      setBusy(false);
    }
  }

  const status =
    phase === 'compress'
      ? t('mobile.video.preparing', { pct })
      : phase === 'upload'
        ? t('profile.animated.uploading', { pct })
        : t('profile.animated.processing');

  return (
    <View style={styles.content}>
      <Text style={styles.title}>{t('profile.animated.title')}</Text>
      <Text style={styles.hint}>{t(isVideo ? 'profile.animated.hintVideo' : 'profile.animated.hintGif')}</Text>

      <View style={[styles.preview, target === 'AVATAR' ? styles.previewAvatar : styles.previewBanner]}>
        {isVideo ? (
          // Android'de varsayılan SurfaceView üst görünümün kırpmasını yok sayıyor: dikey video 5:2 afiş
          // kutusundan taşıp panelin dışına çıkıyordu. TextureView normal görünüm gibi kırpılır.
          <VideoView
            player={player}
            style={styles.fill}
            contentFit="cover"
            nativeControls={false}
            surfaceType="textureView"
          />
        ) : (
          <Image source={{ uri: media.uri }} style={styles.fill} resizeMode="cover" />
        )}
      </View>

      {isVideo && !sliders ? <Text style={styles.hint}>{t('profile.animated.previewFailed')}</Text> : null}

      {sliders ? (
        <>
          <View>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>{t('profile.animated.start')}</Text>
              <Text style={styles.sliderLabel}>{t('profile.animated.seconds', { n: startS.toFixed(1) })}</Text>
            </View>
            <RangeSlider
              value={startS}
              min={0}
              max={maxStart}
              disabled={busy || maxStart === 0}
              onChange={changeStart}
              accessibilityLabel={t('profile.animated.start')}
            />
          </View>
          <View>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>{t('profile.animated.length')}</Text>
              <Text style={styles.sliderLabel}>{t('profile.animated.seconds', { n: effLen.toFixed(1) })}</Text>
            </View>
            <RangeSlider
              value={effLen}
              min={MIN_S}
              max={maxLen}
              disabled={busy || maxLen <= MIN_S}
              onChange={changeLen}
              accessibilityLabel={t('profile.animated.length')}
            />
          </View>
        </>
      ) : null}

      {busy ? <Text style={styles.hint}>{status}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Pressable onPress={onClose} disabled={busy} style={[styles.secondary, busy && styles.dim]}>
          <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable onPress={submit} disabled={busy} style={[styles.primary, busy && styles.dim]}>
          {busy ? (
            <ActivityIndicator color={theme.colors.textPrimary} size="small" />
          ) : (
            <Text style={styles.primaryText}>{t('profile.animated.use')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    maxHeight: '92%',
  },
  content: {
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 16,
    gap: 12,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  preview: {
    overflow: 'hidden',
    backgroundColor: theme.colors.bgElevated,
  },
  previewAvatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignSelf: 'center',
  },
  previewBanner: {
    width: '100%',
    aspectRatio: 5 / 2,
    borderRadius: theme.radius.md,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  secondary: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  primary: {
    minHeight: theme.layout.controlSm,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  dim: {
    opacity: 0.6,
  },
});
