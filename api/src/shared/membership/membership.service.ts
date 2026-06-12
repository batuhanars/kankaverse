import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Üyelik/erişim yetki kontrolünün tek kaynağı (denetim #2 dersi: tekrar etme).
 *
 * Metotlar domain exception fırlatır: HTTP çağıranlar (controller/service) doğal
 * olarak propagate eder (GlobalExceptionFilter envelope'ler); WS gateway ise
 * try/catch ile yakalayıp ack `{ ok:false, error }` şekline çevirir.
 *
 * R7 (Sprint 3): DM kanalı erişim açığı kapatıldı — guildId=null kanalda
 * ChannelMember kontrolü yapılıyor (önceden atlanıyordu, herkes DM okuyabilirdi).
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

  /**
   * Kanal var mı + kullanıcı erişebilir mi.
   *  - Guild kanalı: guild üyeliği kontrolü (eski davranış korundu)
   *  - DM/GROUP_DM kanalı: ChannelMember kaydı kontrolü (R7 — Sprint 3'te kapanan güvenlik açığı)
   *  - ageGated kanal: isMinor kullanıcı → 403 AGE_RESTRICTED (Sprint 4A §7 — savunma derinliği)
   */
  async requireChannelAccess(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });
    if (!channel) {
      throw new NotFoundException({ message: 'Kanal bulunamadı.', error: 'CHANNEL_NOT_FOUND' });
    }

    // Yaş-kapılı guard (Sprint 4A §7): ageGated=true ise minör erişemez.
    // ageGated kanal oluşturma yüzeyi Sprint 7'de gelir; bu guard savunma derinliği — set edilirse çalışır.
    if (channel.ageGated) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { isMinor: true },
      });
      if (user?.isMinor) {
        throw new ForbiddenException({ message: 'Bu kanala yaşınız nedeniyle erişemezsiniz.', error: 'AGE_RESTRICTED' });
      }
    }

    if (channel.guildId) {
      // Guild kanalı: guild üyeliği
      const membership = await this.prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: channel.guildId, userId } },
      });
      if (!membership) {
        throw new ForbiddenException({ message: 'Bu kanala erişim izniniz yok.', error: 'NOT_CHANNEL_MEMBER' });
      }
    } else {
      // DM kanalı: ChannelMember kaydı — R7 §7 Sprint 3 açık kapanışı
      const member = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!member) {
        throw new ForbiddenException({ message: 'Bu kanala erişim izniniz yok.', error: 'NOT_CHANNEL_MEMBER' });
      }
    }

    return channel;
  }

  /**
   * DM kanalında aktif blok kontrolü.
   * DM mesajı GÖNDERİMİNDE çağrılır: blok sonradan konuşmayı keser.
   * G3: BLOCKED yerine JENERİK DM_NOT_ALLOWED — engellenme bilgisi sızdırılmaz.
   */
  async requireNoDmBlock(userId: string, channelId: string): Promise<void> {
    const otherMember = await this.prisma.channelMember.findFirst({
      where: { channelId, userId: { not: userId } },
      select: { userId: true },
    });
    if (!otherMember) return;

    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherMember.userId },
          { blockerId: otherMember.userId, blockedId: userId },
        ],
      },
    });
    if (block) {
      throw new ForbiddenException({ message: 'Bu kullanıcıya mesaj gönderemezsiniz.', error: 'DM_NOT_ALLOWED' });
    }
  }
}
