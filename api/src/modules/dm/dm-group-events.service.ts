import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { GroupDmEventDto, GroupDmEventInput, toGroupEventDtos } from './dm-group-event.util';

/** Sayfa tavanı: en çok son 200 olay (eskiden yeniye döner). */
const EVENT_LIMIT = 200;

/**
 * C64 §2.3: GET /dm/groups/:id/events. 🔴 R7 (küçük): aktif üye kendi katılımından (ve `clearedAt`ten) sonrasını,
 * eski üye (C62 `requireGroupHistoryAccess` penceresi) `joinedAt <= olay <= leftAt` aralığını görür. İkisi de
 * yoksa jenerik 403 NOT_CHANNEL_MEMBER. Eski üyeye tanınan ÜÇÜNCÜ yetki; başka uç bu kaydı yetki saymaz.
 */
@Injectable()
export class DmGroupEventsService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
  ) {}

  async listEvents(userId: string, groupId: string): Promise<GroupDmEventDto[]> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: groupId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }
    if (channel.type !== 'GROUP_DM') {
      throw new ForbiddenException({
        message: 'Bu kanala erişim izniniz yok.',
        error: 'NOT_CHANNEL_MEMBER',
      });
    }

    const createdAt: { gte?: Date; gt?: Date; lte?: Date } = {};
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: groupId, userId } },
      select: { createdAt: true, clearedAt: true },
    });
    if (member) {
      createdAt.gte = member.createdAt;
      if (member.clearedAt) createdAt.gt = member.clearedAt;
    } else {
      // Eski üye penceresi; kaydı yoksa kapı bugünkü jenerik 403'ü fırlatır.
      const { window } = await this.membership.requireGroupHistoryAccess(userId, groupId);
      createdAt.gte = window.joinedAt;
      createdAt.lte = window.leftAt;
      if (window.clearedAt) createdAt.gt = window.clearedAt;
    }

    const rows = await this.prisma.groupDmEvent.findMany({
      where: { channelId: groupId, createdAt },
      orderBy: { createdAt: 'desc' },
      take: EVENT_LIMIT,
    });
    const { dtos } = await toGroupEventDtos(this.prisma, rows as GroupDmEventInput[]);
    return dtos.reverse();
  }
}
