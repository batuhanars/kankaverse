import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { VideoView, type VideoPlayer } from 'expo-video';
import type { AnimatedTarget, MediaCrop } from '@/api/users';
import { theme } from '@/theme';

/**
 * Sprint C13b §4: avatar/afis konumlandirma. Hedef oraninda sabit cerceve (avatar daire, afis 5:2),
 * icinde kaynak; surukle + yakinlastir (1x-4x). Kaynak cerceveyi her zaman doldurur ("cover" tabani),
 * kenardan tasamaz. Cikti sozlesme §2.1 kesirleri (kaynagin gercek boyutuna orani); kirpmayi sunucu yapar.
 *
 * 🔴 `GestureHandlerRootView` BURADA degil, ust `Modal`da: Android'de Modal ayri pencere ve kokteki
 * sarmalayici ona ulasmaz (bkz. `ImageViewer`). Bu bilesen onu bekler.
 * 🔴 Video onizlemesinde `surfaceType="textureView"` SART: SurfaceView donusumle tasinan/kirpilan
 * goruntuyu yok sayar, video cerceveden tasar (C13 cihaz turu dersi).
 */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export type PositionerSource = { kind: 'image'; uri: string } | { kind: 'video'; player: VideoPlayer };

interface Props {
  source: PositionerSource;
  /** Kaynagin gercek (EXIF yonu uygulanmis) piksel boyutu. */
  naturalWidth: number;
  naturalHeight: number;
  target: AnimatedTarget;
  /** Yakinlastirma disaridan da degisir (kaydirici); jestler bitince `onZoomChange` ile bildirilir. */
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onCropChange: (crop: MediaCrop) => void;
  disabled?: boolean;
}

const AVATAR_SIZE = 180;
const BANNER_RATIO = 5 / 2;
/** C19: ortam afisi kanal panelinde ~2:1 gorunur (profil afisi 5:2'den farkli). */
const GUILD_BANNER_RATIO = 2;

function clamp(v: number, lo: number, hi: number) {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
}

interface Geometry {
  fw: number;
  fh: number;
  /** Zoom 1'deki gosterim boyutu ("cover" tabani). */
  bw: number;
  bh: number;
}

/** Kirpma kesirleri: gorunen pencerenin kaynaga orani. */
function computeCrop(g: Geometry, z: number, tx: number, ty: number): MediaCrop {
  'worklet';
  const dw = g.bw * z;
  const dh = g.bh * z;
  const width = Math.min(1, g.fw / dw);
  const height = Math.min(1, g.fh / dh);
  const x = clamp(((dw - g.fw) / 2 - tx) / dw, 0, 1 - width);
  const y = clamp(((dh - g.fh) / 2 - ty) / dh, 0, 1 - height);
  return { x, y, width, height };
}

export function MediaPositioner({
  source,
  naturalWidth,
  naturalHeight,
  target,
  zoom,
  onZoomChange,
  onCropChange,
  disabled,
}: Props) {
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const scale = useSharedValue(MIN_ZOOM);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  // Jest baslangic degerleri; pinch ve pan AYRI cift kullanir (ikisi ayni anda etkin, ortak olursa
  // ikincinin onStart'i birincinin tabanini ezip goruntuyu ziplatir).
  const pinchScale = useSharedValue(MIN_ZOOM);
  const pinchX = useSharedValue(0);
  const pinchY = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const ready = frame.w > 0 && frame.h > 0 && naturalWidth > 0 && naturalHeight > 0;
  const cover = ready ? Math.max(frame.w / naturalWidth, frame.h / naturalHeight) : 1;
  const g: Geometry = { fw: frame.w, fh: frame.h, bw: naturalWidth * cover, bh: naturalHeight * cover };

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setFrame((cur) => (cur.w === width && cur.h === height ? cur : { w: width, h: height }));
  }

  // Cerceve olculunce ve kaynak/zoom degisince: sinira kistir, kesiti bildir.
  useEffect(() => {
    if (!ready) return;
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    scale.value = z;
    const mx = Math.max(0, (g.bw * z - g.fw) / 2);
    const my = Math.max(0, (g.bh * z - g.fh) / 2);
    tx.value = clamp(tx.value, -mx, mx);
    ty.value = clamp(ty.value, -my, my);
    onCropChange(computeCrop(g, z, tx.value, ty.value));
    // `g` her render yeni nesne; bagimlilik olarak asil girdileri veriyoruz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, frame.w, frame.h, naturalWidth, naturalHeight, zoom]);

  function report(z: number) {
    'worklet';
    runOnJS(onZoomChange)(z);
    runOnJS(onCropChange)(computeCrop(g, z, tx.value, ty.value));
  }

  const pinch = Gesture.Pinch()
    .enabled(ready && !disabled)
    .onStart((e) => {
      pinchScale.value = scale.value;
      pinchX.value = tx.value;
      pinchY.value = ty.value;
      focalX.value = e.focalX - g.fw / 2;
      focalY.value = e.focalY - g.fh / 2;
    })
    .onUpdate((e) => {
      const next = clamp(pinchScale.value * e.scale, MIN_ZOOM, MAX_ZOOM);
      const ratio = next / pinchScale.value;
      // Parmaklarin ortasindaki nokta yerinde kalsin (ImageViewer ile ayni turetme), sonra sinira kistir.
      const mx = Math.max(0, (g.bw * next - g.fw) / 2);
      const my = Math.max(0, (g.bh * next - g.fh) / 2);
      scale.value = next;
      tx.value = clamp(focalX.value * (1 - ratio) + ratio * pinchX.value, -mx, mx);
      ty.value = clamp(focalY.value * (1 - ratio) + ratio * pinchY.value, -my, my);
    })
    .onEnd(() => report(scale.value));

  const pan = Gesture.Pan()
    .enabled(ready && !disabled)
    .onStart(() => {
      panX.value = tx.value;
      panY.value = ty.value;
    })
    .onUpdate((e) => {
      const mx = Math.max(0, (g.bw * scale.value - g.fw) / 2);
      const my = Math.max(0, (g.bh * scale.value - g.fh) / 2);
      tx.value = clamp(panX.value + e.translationX, -mx, mx);
      ty.value = clamp(panY.value + e.translationY, -my, my);
    })
    .onEnd(() => report(scale.value));

  const gesture = Gesture.Simultaneous(pan, pinch);

  const mediaStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const isAvatar = target === 'AVATAR' || target === 'GUILD_ICON';
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.frame,
        isAvatar ? styles.frameAvatar : styles.frameBanner,
        target === 'GUILD_BANNER' && styles.frameGuildBanner,
      ]}
    >
      {ready ? (
        <GestureDetector gesture={gesture}>
          {/* Taban boyut zoom 1'deki "cover" boyutu, cercevede ortali; zoom donusumle (merkez etrafinda). */}
          <Animated.View
            style={[
              styles.media,
              { width: g.bw, height: g.bh, left: (g.fw - g.bw) / 2, top: (g.fh - g.bh) / 2 },
              mediaStyle,
            ]}
          >
            {source.kind === 'video' ? (
              <VideoView
                player={source.player}
                style={styles.fill}
                contentFit="fill"
                nativeControls={false}
                surfaceType="textureView"
              />
            ) : (
              <Image source={{ uri: source.uri }} style={styles.fill} resizeMode="stretch" />
            )}
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: theme.colors.bgElevated,
  },
  frameAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignSelf: 'center',
  },
  frameBanner: {
    width: '100%',
    aspectRatio: BANNER_RATIO,
    borderRadius: theme.radius.md,
  },
  frameGuildBanner: {
    aspectRatio: GUILD_BANNER_RATIO,
  },
  media: {
    position: 'absolute',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
});
