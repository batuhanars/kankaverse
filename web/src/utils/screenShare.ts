import type { ChannelDto } from '@/types'

/**
 * C31c §4.2 — ekran paylaşım uygunluğunun TEK tanımı. İki yerde kullanılır:
 * ses panelinin "oyunu yayınla" düğmesi (VoiceControlBar, bildirim yolu useGameActivity) ve
 * yayın penceresinin kanal listesi. Sunucu yine otoritedir (mintToken `canPublishScreen`).
 */

/** Yayın önerisi görünür mü: masaüstü köprüsü + bağlı kanalda ekran grant'i + zaten paylaşmıyor + oyun var. */
export function canOfferGameStream(args: {
  hasBridge: boolean
  canPublishScreen: boolean
  isScreenSharing: boolean
  hasGame: boolean
}): boolean {
  return args.hasBridge && args.canPublishScreen && !args.isScreenSharing && args.hasGame
}

/**
 * Henüz katılmadığımız bir ses kanalında ekran paylaşım açılır mı. Sunucunun kapısının istemci
 * tarafından görülebilen kısmı (voice.service `resolveVideoSources`, GUILD_VOICE dalı): kanal
 * `mediaEnabled` olmalı; ayrıca girebilmemiz gerekir (kilitli değil, 18+ kanala minör giremez).
 * Karantina, sunucu susturması ve global bayrak katıldıktan sonra belli olur: katılınca
 * `canPublishScreen` yanıtı kesin kararı verir.
 */
export function channelAllowsScreenShare(channel: ChannelDto, isMinor: boolean): boolean {
  return (
    channel.type === 'GUILD_VOICE' &&
    channel.mediaEnabled === true &&
    !channel.locked &&
    !(channel.ageGated && isMinor)
  )
}
