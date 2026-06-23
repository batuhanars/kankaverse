import { useBreakpoints, breakpointsTailwind } from '@vueuse/core'

/**
 * useResponsive — modül-seviyesi tek breakpoint örneği (singleton).
 * Contract §3 imzaları kilitli; bu dosyadan sapma = contract ihlali.
 *
 * Kaynak: SPRINT_RESPONSIVE_CONTRACT.md §3
 * Tailwind v4 md/lg/xl = 768 / 1024 / 1280 (breakpointsTailwind preset birebir uyar).
 */
const bp = useBreakpoints(breakpointsTailwind)

export const isMobile = bp.smaller('md')         // < 768
export const isTablet = bp.between('md', 'lg')   // 768–1023
export const isDesktop = bp.between('lg', 'xl')  // 1024–1279
export const isWide = bp.greaterOrEqual('xl')     // ≥ 1280

export function useResponsive() {
  return { isMobile, isTablet, isDesktop, isWide }
}
