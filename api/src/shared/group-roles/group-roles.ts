import type { PrismaService } from '../../prisma/prisma.service';

/**
 * [R7] Grup DM yetki hiyerarşisi: kurucu > yönetici > üye. Ortamdaki rol/izin sisteminin
 * küçük kardeşi; grupta yönetilecek az şey olduğu için tek bayrak (ChannelMember.isAdmin) yeter.
 *
 *  - Kurucu (Channel.ownerId): herkesin mesajını siler, herkesi çıkarır, yönetici atar/alır, grubu siler.
 *  - Yönetici: yalnız NORMAL üyelerin mesajını siler ve onları çıkarır; grubu yeniden adlandırır.
 *  - Üye: yalnız kendi mesajı.
 *
 * Silme soft-delete (deletedAt): içerik moderasyon için kalır, kanıt kaybolmaz.
 */
export type GroupRole = 'owner' | 'admin' | 'member';

/** `actor`, `target`a yönelik moderasyon (mesaj silme, gruptan çıkarma) yapabilir mi? */
export function canModerateGroupTarget(actor: GroupRole, target: GroupRole): boolean {
  if (actor === 'owner') return target !== 'owner';
  if (actor === 'admin') return target === 'member';
  return false;
}

/** Kurucu ya da yönetici mi (yeniden adlandırma gibi hedefsiz grup işlemleri). */
export function isGroupManager(role: GroupRole): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Kullanıcının gruptaki rolü. Üye değilse (ayrılmış/çıkarılmış) 'member' döner: eski üyenin
 * mesajı normal üye mesajı sayılır, yetki ondan türemez (çağıran üyeliği ayrıca doğrular).
 */
export async function getGroupRole(
  prisma: PrismaService,
  channel: { id: string; ownerId: string | null },
  userId: string,
): Promise<GroupRole> {
  if (channel.ownerId === userId) return 'owner';
  const member = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId: channel.id, userId } },
    select: { isAdmin: true },
  });
  return member?.isAdmin ? 'admin' : 'member';
}
