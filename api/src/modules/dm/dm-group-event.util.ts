import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * C64: grup DM üyelik olay satırları ("X gruptan ayrıldı"). Olay bir Message DEĞİLDİR (ayrı tablo): okunmadı,
 * bildirim/push, son mesaj önizlemesi, liste sıralaması, şifreleme, arama, yedek ve şikâyet hattına GİRMEZ.
 */

export type GroupDmEventKindValue = 'MEMBER_ADDED' | 'MEMBER_LEFT' | 'MEMBER_REMOVED';

/** İstemciye dönen olay şekli. Adlar OKUMA ANINDAKİ güncel kullanıcı adıdır. */
export interface GroupDmEventDto {
  id: string;
  channelId: string;
  kind: GroupDmEventKindValue;
  actor: { id: string; username: string } | null;
  target: { id: string; username: string };
  createdAt: string;
}

export interface GroupDmEventInput {
  id: string;
  channelId: string;
  kind: GroupDmEventKindValue;
  actorId: string | null;
  targetId: string;
  createdAt: Date;
}

/** Üyelik transaction'ına girecek olay yazımı. `createdAt` üyelik değişikliğiyle AYNI an (açıkça verilir). */
export function groupEventCreateOp(
  prisma: PrismaService,
  input: Omit<GroupDmEventInput, 'id'>,
): { op: Prisma.PrismaPromise<unknown>; event: GroupDmEventInput } {
  // Kimliği burada üretmek, commit sonrası DTO/yayın için tx sonucuna bağımlılığı kaldırır.
  const event: GroupDmEventInput = { id: randomUUID(), ...input };
  return { op: prisma.groupDmEvent.create({ data: event }), event };
}

type EventUser = {
  id: string;
  username: string;
  avatarUrl: string | null;
  avatarAnimatedUrl: string | null;
};

/** Olay satırlarını güncel kullanıcı adlarıyla DTO'ya çevirir (tek kullanıcı sorgusu, N+1 yok). */
export async function toGroupEventDtos(
  prisma: PrismaService,
  events: GroupDmEventInput[],
): Promise<{ dtos: GroupDmEventDto[]; userById: Map<string, EventUser> }> {
  const ids = [...new Set(events.flatMap((e) => [e.targetId, ...(e.actorId ? [e.actorId] : [])]))];
  const users: EventUser[] = ids.length
    ? ((await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, username: true, avatarUrl: true, avatarAnimatedUrl: true },
      })) ?? [])
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const nameOf = (id: string) => ({ id, username: userById.get(id)?.username ?? '' });
  const dtos = events.map((e) => ({
    id: e.id,
    channelId: e.channelId,
    kind: e.kind,
    actor: e.actorId ? nameOf(e.actorId) : null,
    target: nameOf(e.targetId),
    createdAt: e.createdAt.toISOString(),
  }));
  return { dtos, userById };
}

/**
 * `dm.group_event` payload'ı: `{ channelId, event, member? }`; `member` yalnız MEMBER_ADDED'de (istemci üye
 * listesine yeni üyeyi anında ekleyebilsin).
 */
export async function buildGroupEventPayload(prisma: PrismaService, event: GroupDmEventInput) {
  const { dtos, userById } = await toGroupEventDtos(prisma, [event]);
  const target = userById.get(event.targetId);
  return {
    channelId: event.channelId,
    event: dtos[0],
    ...(event.kind === 'MEMBER_ADDED' && target
      ? {
          member: {
            id: target.id,
            username: target.username,
            avatarUrl: target.avatarUrl,
            avatarAnimatedUrl: target.avatarAnimatedUrl,
          },
        }
      : {}),
  };
}
