import type { PrismaService } from '../../prisma/prisma.service';

/** Emojisi olan EN YÜKSEK pozisyonlu rolün emojisi; yoksa null (C21, tek kaynak). */
export function pickRoleEmoji(
  roles: { position: number; unicodeEmoji: string | null }[] | undefined,
): string | null {
  let best: { position: number; unicodeEmoji: string } | null = null;
  for (const r of roles ?? []) {
    if (r.unicodeEmoji && (!best || r.position > best.position)) {
      best = { position: r.position, unicodeEmoji: r.unicodeEmoji };
    }
  }
  return best ? best.unicodeEmoji : null;
}

/** Ortam içinde kullanıcı -> roleEmoji (yalnız emojisi olanlar). Tek sorgu. */
export async function loadRoleEmojis(
  prisma: PrismaService,
  guildId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const links = await prisma.guildMemberRole.findMany({
    where: {
      member: { guildId, userId: { in: userIds } },
      role: { unicodeEmoji: { not: null } },
    },
    select: {
      member: { select: { userId: true } },
      role: { select: { position: true, unicodeEmoji: true } },
    },
  });
  const byUser = new Map<string, { position: number; unicodeEmoji: string | null }[]>();
  for (const l of links) {
    const list = byUser.get(l.member.userId) ?? [];
    list.push(l.role);
    byUser.set(l.member.userId, list);
  }
  for (const [uid, roles] of byUser) {
    const e = pickRoleEmoji(roles);
    if (e) out.set(uid, e);
  }
  return out;
}
