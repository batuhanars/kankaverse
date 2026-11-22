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

  /**
   * `e2ee:commit` kanal odasına ve kanalın ŞİMDİKİ üyelerinin kişisel odalarına.
   * 🔴 E8 §9 bulgusu (2026-11-22): yalnız kanal odasına gidince sohbet ekranı açık olmayan cihaz (ör. aramaya
   * listeden katılan telefon) epoch değişimini duymuyor, arama anahtarını yenilemiyor, ses kalıcı kesiliyordu.
   * Çıkarılan üye artık `ChannelMember` değil, olayı almaz. Üye okunamazsa en azından kanal odasına gider.
   */
  async commit(channelId: string, epoch: number): Promise<void> {
    const payload = { channelId, epoch };
    try {
      const members = await this.prisma.channelMember.findMany({
        where: { channelId },
        select: { userId: true },
      });
      this.realtime.emitToRoomAndUsers(
        channelId,
        members.map((m) => m.userId),
        E2EE_EVENT_COMMIT,
        payload,
      );
    } catch (err) {
      this.logger.error(`commit yayını üyelere gidemedi (kanal ${channelId})`, err);
      this.realtime.emitToRoom(channelId, E2EE_EVENT_COMMIT, payload);
    }
  }

  welcome(userIds: string[], channelId: string): void {
    this.realtime.emitToUsers([...new Set(userIds)], E2EE_EVENT_WELCOME, { channelId });
  }

  /** Tek kanal odasına `e2ee:devices-changed` (üyelik değişimi, E2 §2.4). */
  deviceChangedInChannel(channelId: string, userId: string): void {
    this.realtime.emitToRoom(channelId, E2EE_EVENT_DEVICES_CHANGED, { channelId, userId });
  }

  /** Kullanıcının grup kurulmuş 1-1 DM ve GROUP_DM kanallarının odalarına `e2ee:devices-changed`. Hata yutulur, loglanır. */
  async devicesChanged(userId: string): Promise<void> {
    try {
      const memberships = await this.prisma.channelMember.findMany({
        where: {
          userId,
          channel: { type: { in: ['DM', 'GROUP_DM'] }, guildId: null, deletedAt: null },
        },
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
