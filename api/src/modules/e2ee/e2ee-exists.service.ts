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
    // E5b §3.3 (E5a §4.8 PM bulgusu): "Sohbeti temizle" çağıranın clearedAt'ini yazar, mesaj kalır. Temizlenen
    // şifreli mesajın yerel düz kaydı yedeğe/aktarıma girmesin diye clearedAt'ten önceki mesajlar SİLİNMİŞ sayılır.
    const member = await this.prisma.channelMember.findFirst({
      where: { channelId, userId },
      select: { clearedAt: true },
    });
    // Yalnız bu kanalın ve silinmemiş mesajları: başka kanalın kimliği dönmez (varlık sızdırılmaz).
    const rows = await this.prisma.message.findMany({
      where: {
        id: { in: [...new Set(ids)] },
        channelId,
        deletedAt: null,
        ...(member?.clearedAt && { createdAt: { gt: member.clearedAt } }),
      },
      select: { id: true },
    });
    return { existing: rows.map((r) => r.id) };
  }
}
