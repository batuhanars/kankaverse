/**
 * C46 §1.4 — REACTION bildiriminin `preview` alanı "emoji + boşluk + mesaj önizlemesi" biçimindedir.
 * Çan ve masaüstü bildirimi emojiyi metne, kalanını önizleme satırına koyar.
 */
export function reactionEmoji(preview: string | null | undefined): string {
  return preview ? preview.split(' ')[0] : ''
}

/** Önizlemeden baştaki emojiyi çıkarır (`emoji` verilirse onu, yoksa ilk sözcüğü). */
export function reactionPreviewText(preview: string | null | undefined, emoji?: string): string {
  if (!preview) return ''
  const lead = emoji ?? reactionEmoji(preview)
  return preview.startsWith(lead) ? preview.slice(lead.length).trim() : preview
}

/** WS `reaction.notify` (DM) yükü: çan kaydı yok, yalnız masaüstü bildirimi. */
export interface ReactionNotifyPayload {
  actor: { id: string; username: string; avatarUrl: string | null }
  emoji: string
  channelId: string
  messageId: string
  preview: string | null
}

/** useSocket (alıcı) -> useNativeNotifications (gösterici) arası pencere olayı adı. */
export const REACTION_NOTIFY_EVENT = 'kv:reaction-notify'
