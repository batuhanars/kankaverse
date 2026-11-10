import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2EE_ERRORS } from './e2ee.util';

/** E2EE uçlarının ortak kanal kapısı: üyelik (MembershipService) + 1-1 DM + iki üyenin uygunluğu. */
@Injectable()
export class E2eeChannelService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private flag: E2eeFlagService,
  ) {}

  /** Çağıran kanal üyesi mi (403 aksi) ve kanal 1-1 DM mi (değilse 422 E2EE_NOT_ELIGIBLE). Üye kimliklerini döner. */
  async requireDmMembers(userId: string, channelId: string): Promise<string[]> {
    const { isOneToOneDm, memberIds } = await this.access(userId, channelId);
    if (!isOneToOneDm) throw E2EE_ERRORS.notEligible();
    return memberIds;
  }

  /** Üyelik kapısı (MembershipService) + üye kimlikleri + 1-1 DM mi. */
  async access(userId: string, channelId: string) {
    const channel = await this.membership.requireChannelAccess(userId, channelId);
    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });
    return { isOneToOneDm: channel.type === 'DM', memberIds: members.map((m) => m.userId) };
  }

  /** §2.2: iki üye de uygun olmalı; değilse 422 E2EE_NOT_ELIGIBLE. */
  assertAllEligible(memberIds: string[]): void {
    if (memberIds.length !== 2 || !memberIds.every((id) => this.flag.isEligible(id))) {
      throw E2EE_ERRORS.notEligible();
    }
  }
}
