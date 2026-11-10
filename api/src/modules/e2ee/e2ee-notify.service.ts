import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import {
  E2EE_EVENT_COMMIT,
  E2EE_EVENT_DEVICES_CHANGED,
  E2EE_EVENT_WELCOME,
} from './e2ee.constants';

/** §2.7 soket olayları. Yükler içerik taşımaz (yalnız kimlik/sıra); istemci veriyi HTTP ile çeker. */
@Injectable()
export class E2eeNotifyService {
  private readonly logger = new Logger(E2eeNotifyService.name);

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  commit(channelId: string, epoch: number): void {
    this.realtime.emitToRoom(channelId, E2EE_EVENT_COMMIT, { channelId, epoch });
  }

  welcome(userIds: string[], channelId: string): void {
    this.realtime.emitToUsers([...new Set(userIds)], E2EE_EVENT_WELCOME, { channelId });
  }

  /** Kullanıcının grup kurulmuş 1-1 DM kanallarının odalarına `e2ee:devices-changed`. Hata yutulur, loglanır. */
  async devicesChanged(userId: string): Promise<void> {
    try {
      const memberships = await this.prisma.channelMember.findMany({
        where: { userId, channel: { type: 'DM', guildId: null, deletedAt: null } },
        select: { channelId: true },
      });
      if (memberships.length === 0) return;
      const groups = await this.prisma.e2eeGroup.findMany({
        where: { channelId: { in: memberships.map((m) => m.channelId) } },
        select: { channelId: true },
      });
      for (const g of groups) {
        this.realtime.emitToRoom(g.channelId, E2EE_EVENT_DEVICES_CHANGED, {
          channelId: g.channelId,
          userId,
        });
      }
    } catch (err) {
      this.logger.error(`devices-changed yayını başarısız (kullanıcı ${userId})`, err);
    }
  }
}
