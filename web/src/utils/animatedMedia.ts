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

// Sprint C16 — liste/satır yüzeyleri: hareketli avatar yalnız satır hover'dayken (aksi halde statik).
export function hoverAvatarSrc(
  user: { avatarUrl: string | null; avatarAnimatedUrl?: string | null },
  hovered: boolean,
): string | null {
  if (!hovered) return user.avatarUrl
  return animatedOrStatic({ avatarUrl: user.avatarUrl, bannerUrl: null, avatarAnimatedUrl: user.avatarAnimatedUrl }, 'avatar')
}

// Sprint C19 — ortam simgesi/afişi. iconUrl/bannerUrl daima statik kare; hareketli sürüm ayrı alanda.
// Azaltılmış harekette her zaman statik. §7.1 (sahip kararı): ray simgesi yalnız seçili ortamda sürekli, diğerlerinde hover'da oynar; kart/afiş/önizleme sürekli.
interface GuildMediaSource {
  iconUrl: string | null
  bannerUrl?: string | null
  iconAnimatedUrl?: string | null
  bannerAnimatedUrl?: string | null
}

export function guildIconSrc(guild: GuildMediaSource, playing: boolean): string | null {
  if (playing && guild.iconAnimatedUrl && motion.value !== 'reduce') return guild.iconAnimatedUrl
  return guild.iconUrl
}

export function guildBannerSrc(guild: GuildMediaSource): string | null {
  if (guild.bannerAnimatedUrl && motion.value !== 'reduce') return guild.bannerAnimatedUrl
  return guild.bannerUrl ?? null
}

// Sprint C13 §0 — kesit sabitleri (sözleşme §2.1 ile aynı; sunucu otorite)
export const ANIMATED_MIN_MS = 500
export const ANIMATED_MAX_MS = 6000
export const ANIMATED_DEFAULT_MS = 3000
export const ANIMATED_GIF_MAX_BYTES = 15 * 1024 * 1024
export const STATIC_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const ANIMATED_ACCEPT = 'image/gif,video/mp4,video/webm,video/quicktime'
// C13b: statik görseller de konumlandırma modalına girer (aynı C13 uçları)
export const ANIMATED_TYPES = [...STATIC_IMAGE_TYPES, ...ANIMATED_ACCEPT.split(',')]

// C13b §2.1 — kırpma dikdörtgeni: kaynağın doğal boyutuna oranla 0..1 kesirler
export interface CropFractions {
  x: number
  y: number
  width: number
  height: number
}
