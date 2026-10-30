import { ProviderKey } from './providers/stream-provider';

/** C36 §5.5 — duyuru metinleri tek dosyada (TR). Türkçe ek uyumu sabit: "Kick'te", "Twitch'te". */
export const STREAM_ANNOUNCE_WEBHOOK_NAME = 'Yayın Duyurusu';

export const STREAM_PLATFORM_TEXT: Record<
  ProviderKey,
  { name: string; locative: string; color: number }
> = {
  kick: { name: 'Kick', locative: "Kick'te", color: 0x53fc18 },
  twitch: { name: 'Twitch', locative: "Twitch'te", color: 0x9146ff },
};

export function announceContent(provider: ProviderKey, username: string): string {
  return `${username} ${STREAM_PLATFORM_TEXT[provider].locative} yayında!`;
}
