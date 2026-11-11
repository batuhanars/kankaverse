import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';

/**
 * E5a Rev.2 §4.7 — istemcinin yerel şifreli mesaj kayıtlarının sunucuda hâlâ var olup olmadığını sorar.
 * Silinmiş mesaj geçmişte dönmediği için istemci "silindi"yi başka türlü öğrenemez (çevrimdışıyken silinenler).
 * Yanıt yalnız kimlik taşır, içerik yok. Çağıran kanala erişemiyorsa 403 (mevcut üyelik kapısı).
 */
@Injectable()
export class E2eeExistsService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
  ) {}

  async existing(
    userId: string,
    channelId: string,
    ids: string[],
  ): Promise<{ existing: string[] }> {
    await this.membership.requireChannelAccess(userId, channelId);
    // Yalnız bu kanalın ve silinmemiş mesajları: başka kanalın kimliği dönmez (varlık sızdırılmaz).
    const rows = await this.prisma.message.findMany({
      where: { id: { in: [...new Set(ids)] }, channelId, deletedAt: null },
      select: { id: true },
    });
    return { existing: rows.map((r) => r.id) };
  }
}
