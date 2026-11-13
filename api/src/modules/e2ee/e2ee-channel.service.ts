import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2EE_ERRORS } from './e2ee.util';

/** E2EE uçlarının ortak kanal kapısı: üyelik (MembershipService) + DM/GROUP_DM + üyelerin uygunluğu. */
@Injectable()
export class E2eeChannelService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private flag: E2eeFlagService,
  ) {}

  /**
   * Çağıran kanal üyesi mi (403 aksi) ve kanal şifrelenebilir tipte mi: 1-1 DM ya da GROUP_DM (E2 §2.2;
   * değilse 422 E2EE_NOT_ELIGIBLE). Üye kimliklerini döner. (Ad E1'den kaldı; davranış grubu da kapsar.)
   */
  async requireDmMembers(userId: string, channelId: string): Promise<string[]> {
    const { isOneToOneDm, isGroupDm, memberIds } = await this.access(userId, channelId);
    if (!isOneToOneDm && !isGroupDm) throw E2EE_ERRORS.notEligible();
    return memberIds;
  }

  /** Üyelik kapısı (MembershipService) + üye kimlikleri + kanal tipi (1-1 DM / GROUP_DM). */
  async access(userId: string, channelId: string) {
    const channel = await this.membership.requireChannelAccess(userId, channelId);
    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true, createdAt: true },
    });
    return {
      isOneToOneDm: channel.type === 'DM',
      isGroupDm: channel.type === 'GROUP_DM',
      memberIds: members.map((m) => m.userId),
      /** Katılım zamanı (E2 §2.3): `ChannelMember.createdAt`; yeniden eklenen üyenin satırı yenidir. */
      joinedAt: new Map(members.map((m) => [m.userId, m.createdAt])),
    };
  }

  /**
   * §2.2: TÜM üyeler bayrak açısından uygun olmalı (1-1'de iki üye, grupta hepsi); değilse 422 E2EE_NOT_ELIGIBLE.
   * Üye sayısı en az 2 (1-1 kanalı zaten tam 2 üyelidir, E1 davranışı değişmez).
   */
  assertAllEligible(memberIds: string[]): void {
    if (memberIds.length < 2 || !memberIds.every((id) => this.flag.isEligible(id))) {
      throw E2EE_ERRORS.notEligible();
    }
  }
}
