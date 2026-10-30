/**
 * Paylaşılan davet bağlantısı, web ile birebir aynı format (`web/src/utils/inviteLink.ts`:
 * `origin + /invite/:code`). Kök `EXPO_PUBLIC_WEB_URL`; `EXPO_PUBLIC_API_URL` ile KARIŞTIRILMAZ:
 * davet bağlantısı insanın tarayıcıda açacağı adrestir.
 */
export function inviteLink(code: string): string {
  const base = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://kankaverse.com').replace(/\/+$/, '');
  return `${base}/invite/${code}`;
}
