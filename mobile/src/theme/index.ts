import { colors, radius, fontSize, layout, fontFamily } from './tokens';

export const theme = {
  colors,
  radius,
  fontSize,
  layout,
  fontFamily,
} as const;

export type Theme = typeof theme;
