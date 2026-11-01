/**
 * C46 §4b 🔴 R7 — DM/grup satırında "{actor} {emoji} tepkisi bıraktı" göstergesi.
 * `ChannelMember.lastReaction` Json'u burada okunur/süzülür; bozuk veri her zaman null'a düşer.
 */
export interface LastReaction {
  actorId: string;
  actorUsername: string;
  emoji: string;
  messageId: string;
  /** ISO 8601 */
  at: string;
}

/** Json kolonundan güvenli okuma: şekil tutmuyor veya tarih geçersizse null. */
export function parseLastReaction(raw: unknown): LastReaction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const { actorId, actorUsername, emoji, messageId, at } = r;
  if (
    typeof actorId !== 'string' ||
    typeof actorUsername !== 'string' ||
    typeof emoji !== 'string' ||
    typeof messageId !== 'string' ||
    typeof at !== 'string' ||
    !actorId ||
    !emoji ||
    !messageId ||
    Number.isNaN(Date.parse(at))
  ) {
    return null;
  }
  return { actorId, actorUsername, emoji, messageId, at };
}

/**
 * Liste DTO'suna taşınıp taşınmayacağı (§4b.4). Yalnız şunlar doğruysa dolu döner:
 * `at > lastReadAt` (veya lastReadAt null) VE `at > lastMessage.createdAt` (son mesaj yoksa geçer)
 * VE aktör engelli değil (iki yön; çağıran `blockedEitherWay`i hesaplar).
 */
export function visibleLastReaction(input: {
  raw: unknown;
  lastReadAt: Date | null;
  lastMessageAt: Date | null;
  blockedEitherWay: (actorId: string) => boolean;
}): LastReaction | null {
  const lr = parseLastReaction(input.raw);
  if (!lr) return null;
  const at = Date.parse(lr.at);
  if (input.lastReadAt !== null && at <= input.lastReadAt.getTime()) return null;
  if (input.lastMessageAt !== null && at <= input.lastMessageAt.getTime()) return null;
  if (input.blockedEitherWay(lr.actorId)) return null;
  return lr;
}
