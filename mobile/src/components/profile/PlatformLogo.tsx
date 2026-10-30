import Svg, { Path } from 'react-native-svg';

/**
 * C36: Kick / Twitch tek renkli marka glifi. Yol verisi `web/src/assets/brand/{kick,twitch}.svg`
 * dosyalarının kopyasıdır (Metro SVG dosyası import etmiyor; kaynak orası, değişirse iki yerde güncellenir).
 * Marka renkleri platformların kendi kimliği; tema token'ı değil.
 */
const LOGOS = {
  kick: {
    color: '#53FC18',
    d: 'M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z',
  },
  twitch: {
    color: '#9146FF',
    d: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z',
  },
} as const;

export function PlatformLogo({ provider, size }: { provider: 'kick' | 'twitch'; size: number }) {
  const logo = LOGOS[provider];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d={logo.d} fill={logo.color} />
    </Svg>
  );
}
