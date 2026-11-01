import { messagesApi } from '@/api/messages'
import type { ReactionGroupDto } from '@/types'

/**
 * C46 §5.2 — "kimler tepki verdi" önbelleği (mesaj başına, modül düzeyinde).
 * O mesaja tepki olayı (reaction.added / reaction.removed) gelince `invalidateReactionUsers`
 * girdiyi düşürür; sıradaki üzerine-gelme yeniden çeker. Eşzamanlı isteklerde tek istek uçar.
 */
const cache = new Map<string, Promise<ReactionGroupDto[]>>()

export function getReactionUsers(
  channelId: string,
  messageId: string,
): Promise<ReactionGroupDto[]> {
  const hit = cache.get(messageId)
  if (hit) return hit
  const p = messagesApi
    .listReactions(channelId, messageId)
    .then((res) => res.data)
    .catch((e: unknown) => {
      // Hata önbelleğe girmez: bir sonraki denemede yeniden çekilir.
      if (cache.get(messageId) === p) cache.delete(messageId)
      throw e
    })
  cache.set(messageId, p)
  return p
}

export function invalidateReactionUsers(messageId: string) {
  cache.delete(messageId)
}
