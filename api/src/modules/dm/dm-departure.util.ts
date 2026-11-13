import { Prisma } from '@prisma/client';
import { previewFromAttachments } from '../../common/utils/attachment-preview.util';
import { preJoinEncryptedFilter, toPeriods } from '../../common/utils/pre-join.util';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * C62 §2: gruptan ayrılan/çıkarılan üyenin listede kalması. 🔴 R7: bu kayıt YALNIZ iki yerde okunur
 * (DM listesi + `MembershipService.requireGroupHistoryAccess` → `findMessages`). Gönderme, tepki, okundu,
 * arama, push, soket odası gibi her kapı `ChannelMember` satırına bakmaya devam eder; eski üye orada kapalıdır.
 */

export type DepartureReasonValue = 'LEFT' | 'REMOVED';

/** Ayrılma/çıkarma transaction'ına girecek departure upsert'i (üyelik silme ve E2EE işlemleriyle aynı tx). */
export function departureUpsertOp(
  prisma: PrismaService,
  input: {
    channelId: string;
    userId: string;
    joinedAt: Date;
    leftAt: Date;
    reason: DepartureReasonValue;
    clearedAt: Date | null;
    memberIds: string[];
  },
): Prisma.PrismaPromise<unknown> {
  const { channelId, userId, ...data } = input;
  return prisma.groupDmDeparture.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId, ...data },
    update: data,
  });
}

const LAST_MESSAGE_INCLUDE = {
  author: { select: { id: true, username: true, avatarUrl: true } },
  attachments: { select: { contentType: true } },
} as const;

/**
 * Listeye eklenecek eski-üye grup öğeleri (§2.3). Kanalı silinmiş olanlar atlanır. `lastMessage` yalnız
 * `leftAt` ve öncesi, `clearedAt` sonrası, katılım öncesi şifreli süzgecinden geçen son mesajdır.
 * Dönen `createdAt` (kanalın oluşturulma anı) yalnız sıralamada son-mesajsız öğe için kullanılır.
 */
export async function loadDepartedGroupItems(
  prisma: PrismaService,
  userId: string,
): Promise<Array<{ item: Record<string, unknown>; channelCreatedAt: number }>> {
  const departures = await prisma.groupDmDeparture.findMany({ where: { userId } });
  if (departures.length === 0) return [];

  const channels = await prisma.channel.findMany({
    where: { id: { in: departures.map((d) => d.channelId) }, type: 'GROUP_DM', deletedAt: null },
    select: { id: true, name: true, ownerId: true, createdAt: true },
  });
  if (channels.length === 0) return [];
  const channelById = new Map(channels.map((c) => [c.id, c]));

  const live = departures.filter((d) => channelById.has(d.channelId));
  // C65: önceki dönemler TEK sorguda (eski üyenin süzgeci de dönem farkında).
  const pastRows =
    (await prisma.groupDmPastPeriod.findMany({
      where: { userId, channelId: { in: live.map((d) => d.channelId) } },
      select: { channelId: true, joinedAt: true, leftAt: true },
    })) ?? [];
  const users = await prisma.user.findMany({
    // KVKK: imha edilmiş (deletedAt dolu) üyeler eski grup listesinde görünmez.
    where: { id: { in: [...new Set(live.flatMap((d) => d.memberIds))] }, deletedAt: null },
    select: { id: true, username: true, avatarUrl: true, avatarAnimatedUrl: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return Promise.all(
    live.map(async (d) => {
      const channel = channelById.get(d.channelId)!;
      const lastMsg = await prisma.message.findFirst({
        where: {
          channelId: d.channelId,
          deletedAt: null,
          createdAt: { lte: d.leftAt, ...(d.clearedAt ? { gt: d.clearedAt } : {}) },
          ...preJoinEncryptedFilter({
            joinedAt: d.joinedAt,
            periods: toPeriods(pastRows.filter((r) => r.channelId === d.channelId)),
          }),
        },
        orderBy: { createdAt: 'desc' },
        include: LAST_MESSAGE_INCLUDE,
      });
      return {
        channelCreatedAt: channel.createdAt.getTime(),
        item: {
          id: channel.id,
          type: 'GROUP_DM' as const,
          name: channel.name ?? null,
          ownerId: channel.ownerId ?? null,
          adminIds: [] as string[],
          members: d.memberIds.flatMap((id) => {
            const u = userById.get(id);
            return u
              ? [
                  {
                    id: u.id,
                    username: u.username,
                    avatarUrl: u.avatarUrl,
                    avatarAnimatedUrl: u.avatarAnimatedUrl,
                  },
                ]
              : [];
          }),
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                channelId: lastMsg.channelId,
                // §2.3.b: `leftAt` sonrası düzenlendiyse gövde verilmez, bayrak gelir.
                content:
                  lastMsg.editedAt && lastMsg.editedAt > d.leftAt
                    ? ''
                    : previewFromAttachments(lastMsg.content, lastMsg.attachments),
                replyToId: lastMsg.replyToId,
                ...(lastMsg.encrypted ? { encrypted: true } : {}),
                ...(lastMsg.editedAt && lastMsg.editedAt > d.leftAt
                  ? { editedAfterLeave: true }
                  : {}),
                author: {
                  id: lastMsg.author.id,
                  username: lastMsg.author.username,
                  avatarUrl: lastMsg.author.avatarUrl,
                },
                createdAt: lastMsg.createdAt.toISOString(),
              }
            : null,
          unread: false,
          lastReaction: null,
          receiptsEnabled: false,
          groupAllReadAt: null,
          // C67: eski grupta görüldü avatarı yok.
          seenBy: [],
          departed: { leftAt: d.leftAt.toISOString(), reason: d.reason },
        },
      };
    }),
  );
}
