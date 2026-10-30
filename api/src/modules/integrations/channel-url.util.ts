import { ExternalProvider } from '@prisma/client';

/** Kanal adresi tek yerde: adaptörler ve profil kartı aynı kuralı kullanır. */
export function externalAccountUrl(provider: ExternalProvider, username: string): string {
  if (provider === 'KICK') {
    // Kick kanal adresi: küçük harf, alt çizgi tire olur (belgelenmedi, gözlemlenen kural)
    return `https://kick.com/${username.toLowerCase().replace(/_/g, '-')}`;
  }
  return `https://twitch.tv/${username.toLowerCase()}`;
}
