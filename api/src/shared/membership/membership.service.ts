import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Üyelik/erişim yetki kontrolünün tek kaynağı. Önceden channels.service,
 * messages.service ve messages.gateway'de üç ayrı kopya vardı (denetim #2);
 * T&S yetkilendirme mantığının ayrışmaması için burada toplandı.
 *
 * Metotlar domain exception fırlatır: HTTP çağıranlar (controller/service) doğal
 * olarak propagate eder (GlobalExceptionFilter envelope'ler); WS gateway ise
 * try/catch ile yakalayıp ack `{ ok:false, error }` şekline çevirir.
 */
@Injectable()
export class MembershipService {
  constructor(private prisma: PrismaService) {}

  /** Guild var mı + kullanıcı üye mi. Üyelik (role dahil) döner. */
  async requireGuildMembership(userId: string, guildId: string) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId, deletedAt: null },
    });
    if (!guild) {
      throw new NotFoundException({ message: 'Sunucu bulunamadı.', error: 'GUILD_NOT_FOUND' });
    }

    const membership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException({ message: 'Bu sunucuya erişim izniniz yok.', error: 'FORBIDDEN' });
    }

    return { guild, membership };
  }

  /** Kanal var mı + (guild kanalıysa) kullanıcı o guild'e üye mi. Kanal döner. */
  async requireChannelAccess(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }

    if (channel.guildId) {
      const membership = await this.prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: channel.guildId, userId } },
      });
      if (!membership) {
        throw new ForbiddenException({ message: 'Bu kanala erişim izniniz yok.', error: 'NOT_CHANNEL_MEMBER' });
      }
    }

    return channel;
  }
}
