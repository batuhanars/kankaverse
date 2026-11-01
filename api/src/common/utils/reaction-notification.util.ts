/** C46: tepki bildirimi metinleri (çan satırı push gövdesi ve DM push gövdesi AYNI yardımcıdan). */

/** `Notification.preview` üst sınırı (emoji + boşluk + mesaj önizlemesi). */
export const REACTION_PREVIEW_MAX = 120;

/** Push gövdesi: önizleme varsa `"{actor} mesajına {emoji} bıraktı: {önizleme}"`, yoksa kısa biçim. */
export function buildReactionPushBody(actor: string, emoji: string, text: string): string {
  return text
    ? `${actor} mesajına ${emoji} bıraktı: ${text}`
    : `${actor} mesajına ${emoji} bıraktı.`;
}

/** Kalıcı `preview` (emoji + " " + metin) → parçalar. Emoji boşluk içermez; ilk boşlukta ayrılır. */
export function splitReactionPreview(preview: string | null): { emoji: string; text: string } {
  const value = preview ?? '';
  const idx = value.indexOf(' ');
  if (idx === -1) return { emoji: value, text: '' };
  return { emoji: value.slice(0, idx), text: value.slice(idx + 1) };
}
