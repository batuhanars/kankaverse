import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2eeNotifyService } from './e2ee-notify.service';
import { E2EE_ERRORS } from './e2ee.util';

/**
 * 🔴 R7 — GROUP_DM üyelik değişiminin E2EE tarafı (E2 §2.2, §2.4). `DmService` grup yollarından tek satırlık
 * çağrılarla bağlanır; E2EE'ye özgü mantık burada kalır.
 *
 * Akış (ayrılma/çıkarma): `departureOps` → `ChannelMember.delete` ile AYNI transaction → commit sonrası
 * `afterDeparture`. Ekleme: `assertMemberAddable` → `ChannelMember.create` + `addOps` aynı transaction →
 * commit sonrası `afterAdd`. Kanalda `E2eeGroup` yoksa E2EE satırlarına dokunulmaz.
 */
@Injectable()
export class E2eeMembershipService {
  private readonly logger = new Logger(E2eeMembershipService.name);

  constructor(
    private prisma: PrismaService,
    private flag: E2eeFlagService,
    private notify: E2eeNotifyService,
    private realtime: RealtimeService,
  ) {}

  /** §2.2: şifreli gruba, bayrak açısından uygun olmayan üye eklenemez (422). Cihazsız ama uygun üye eklenir. */
  async assertMemberAddable(channelId: string, targetUserId: string): Promise<void> {
    if (!(await this.hasGroup(channelId))) return;
    if (!this.flag.isEligible(targetUserId)) throw E2EE_ERRORS.memberNotEligible();
  }

  /** Ekleme transaction'ına katılan işlemler: yeniden eklenen üyenin eski-üye kaydı silinir (artık üye). */
  addOps(channelId: string, userId: string): Prisma.PrismaPromise<unknown>[] {
    return [this.prisma.e2eeFormerMember.deleteMany({ where: { channelId, userId } })];
  }

  /**
   * Ayrılma/çıkarma transaction'ına katılan işlemler (grup yoksa boş): eski-üye kaydı (upsert; tekrar
   * ayrılmada `leftAt` güncellenir) + o kullanıcının cihazlarına bu kanal için BEKLEYEN Welcome'lar silinir
   * (yoksa çıkarılan cihaz daha önce kuyruğa girmiş Welcome ile gruba katılabilir).
   */
  async departureOps(channelId: string, userId: string): Promise<Prisma.PrismaPromise<unknown>[]> {
    if (!(await this.hasGroup(channelId))) return [];
    const devices = await this.prisma.e2eeDevice.findMany({
      where: { userId },
      select: { id: true },
    });
    return [
      this.prisma.e2eeFormerMember.upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { channelId, userId },
        update: { leftAt: new Date() },
      }),
      this.prisma.e2eeWelcome.deleteMany({
        where: { channelId, deliveredAt: null, targetDeviceId: { in: devices.map((d) => d.id) } },
      }),
    ];
  }

  /** Commit sonrası (ekleme): kanal odasına `e2ee:devices-changed` (çevrimiçi üye eksik cihazları ekler). */
  async afterAdd(channelId: string, userId: string): Promise<void> {
    try {
      if (await this.hasGroup(channelId)) this.notify.deviceChangedInChannel(channelId, userId);
    } catch (err) {
      this.logger.error(`üye ekleme yayını başarısız (kanal ${channelId})`, err);
    }
  }

  /**
   * Commit sonrası (ayrılma/çıkarma). 🔴 Önce kullanıcının TÜM soketleri kanal odasından çıkarılır: yoksa bir
   * sonraki `message.created` yayını (şifreli yük dahil) ona da gider. Sonra (kanal silinmediyse) grup
   * varsa `e2ee:devices-changed`. Yarış güvencesi: `departureOps` sırasında grup yoktu da sonradan kurulduysa
   * eski-üye kaydı burada tamamlanır (`skipDuplicates`).
   */
  async afterDeparture(channelId: string, userId: string, channelDeleted: boolean): Promise<void> {
    try {
      this.realtime.removeUserFromRoom(userId, channelId);
    } catch (err) {
      this.logger.error(`soket odadan çıkarılamadı (kanal ${channelId}, kullanıcı ${userId})`, err);
    }
    try {
      if (channelDeleted || !(await this.hasGroup(channelId))) return;
      await this.prisma.e2eeFormerMember.createMany({
        data: [{ channelId, userId }],
        skipDuplicates: true,
      });
      this.notify.deviceChangedInChannel(channelId, userId);
    } catch (err) {
      this.logger.error(`üye çıkarma yayını başarısız (kanal ${channelId})`, err);
    }
  }

  private async hasGroup(channelId: string): Promise<boolean> {
    const group = await this.prisma.e2eeGroup.findUnique({
      where: { channelId },
      select: { channelId: true },
    });
    return group !== null;
  }
}
