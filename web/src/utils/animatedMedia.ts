import { usePreferredReducedMotion } from '@vueuse/core'

// Sprint C13 §5.3 — hareketli adres varsa onu, yoksa statiği göster.
// prefers-reduced-motion: reduce → her zaman statik.
const motion = usePreferredReducedMotion()

interface AnimatedSource {
  avatarUrl: string | null
  bannerUrl: string | null
  avatarAnimatedUrl?: string | null
  bannerAnimatedUrl?: string | null
}

export function animatedOrStatic(
  user: AnimatedSource | null | undefined,
  kind: 'avatar' | 'banner',
): string | null {
  if (!user) return null
  const staticUrl = kind === 'avatar' ? user.avatarUrl : user.bannerUrl
  const animatedUrl = kind === 'avatar' ? user.avatarAnimatedUrl : user.bannerAnimatedUrl
  if (animatedUrl && motion.value !== 'reduce') return animatedUrl
  return staticUrl
}

// Sprint C13 §0 — kesit sabitleri (sözleşme §2.1 ile aynı; sunucu otorite)
export const ANIMATED_MIN_MS = 500
export const ANIMATED_MAX_MS = 6000
export const ANIMATED_DEFAULT_MS = 3000
export const ANIMATED_GIF_MAX_BYTES = 15 * 1024 * 1024
export const ANIMATED_ACCEPT = 'image/gif,video/mp4,video/webm,video/quicktime'
export const ANIMATED_TYPES = ANIMATED_ACCEPT.split(',')
