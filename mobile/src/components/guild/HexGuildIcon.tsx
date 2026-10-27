import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path, Polygon, Text as SvgText } from 'react-native-svg';
import { hexPoints } from '../hexShape';
import { animatedOrStatic, useReduceMotion } from '@/utils/animatedMedia';
import { theme } from '@/theme';

interface Props {
  size: number;
  name: string;
  /** Statik kare (daima dolu olabilir). */
  iconUrl: string | null | undefined;
  /** C19 §7: hareketli WebP. Normal RN <Image> ile çizilir; azaltılmış harekette kullanılmaz. */
  iconAnimatedUrl?: string | null;
  /** Altıgen DIŞINDA kalan köşelerin örtüleceği zemin rengi (ray: bgRail, kart: bgElevated). */
  backgroundColor: string;
  /** false ise hareketli adres kullanılmaz (statik kare). Ray: yalnız seçili ortam true; kart: true. */
  animate?: boolean;
  /** Seçili çerçeve (Kor, 2px). */
  active?: boolean;
  /** Yedek harf; verilmezse adın baş harfi. */
  fallbackText?: string;
}

/**
 * Sprint C19 §7 — altıgen ortam simgesi (ray + Keşfet kartı + öneri bloğu ortak).
 *
 * 🔴 Neden SVG <Image> DEĞİL: react-native-svg <Image> Android'de GIF/animasyonlu görselle uygulamayı
 * çökertiyordu (2026-10-27). Görsel normal RN <Image> (animasyonlu WebP desteği var); altıgenin dışında
 * kalan köşeleri zemin rengiyle örten evenodd SVG yolu üstüne biner. Bu yüzden `backgroundColor` zemine
 * UYMAK ZORUNDA; farklı tonlu zeminde prop ile verilir. MaskedView / yeni native paket yok.
 *
 * Katman sırası (alttan üste): yedek altıgen + harf → statik görsel → hareketli görsel → köşe örtüsü +
 * seçili çerçeve. Statik kare hep altta durur, hareketli sürüm yüklenince (onLoad) görünür olur: ortam
 * seçilirken kaynak değişiminde harf yer tutucusu bir an görünmesin (sahip turu 2026-10-27).
 * Rozet/pip gibi göstergeler bu bileşenin DIŞINDA, ebeveynde mutlak konumlanır (etkilenmez).
 */
export function HexGuildIcon({
  size,
  name,
  iconUrl,
  iconAnimatedUrl,
  backgroundColor,
  animate = true,
  active = false,
  fallbackText,
}: Props) {
  const reduceMotion = useReduceMotion();
  const animatedSrc = animatedOrStatic(null, animate ? iconAnimatedUrl : null, reduceMotion);
  // Hangi hareketli adresin yüklendiği; adres değişince yeniden yüklenene kadar gizli kalır.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const points = hexPoints(size);
  // Dış dikdörtgen 1px taşar (kenar yumuşatma izi kalmasın); evenodd ile altıgen delik olur.
  const pad = 1;
  const corners =
    `M${-pad},${-pad} H${size + pad} V${size + pad} H${-pad} Z ` +
    `M${points.split(' ').join(' L')} Z`;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFill}>
        <Polygon points={points} fill={theme.colors.accentSubtle} />
        <SvgText
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          alignmentBaseline="central"
          fontSize={theme.fontSize.lg}
          fontWeight="700"
          fill={theme.colors.accent500}
        >
          {fallbackText ?? name.charAt(0).toUpperCase()}
        </SvgText>
      </Svg>

      {iconUrl ? <Image source={{ uri: iconUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      {animatedSrc ? (
        <Image
          source={{ uri: animatedSrc }}
          style={[StyleSheet.absoluteFill, { opacity: loadedSrc === animatedSrc ? 1 : 0 }]}
          resizeMode="cover"
          onLoad={() => setLoadedSrc(animatedSrc)}
        />
      ) : null}

      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Path d={corners} fill={backgroundColor} fillRule="evenodd" />
        <Polygon
          points={points}
          fill="none"
          stroke={active ? theme.colors.accent500 : 'transparent'}
          strokeWidth={2}
        />
      </Svg>
    </View>
  );
}
