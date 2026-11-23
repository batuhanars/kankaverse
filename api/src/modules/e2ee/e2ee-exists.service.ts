import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { MESSAGE_AUTHOR_SELECT } from '../../common/utils/message-author.select';

/** E7 §5.4: yerel arama sonucunun satırı için yazan + zaman (içerik yok). */
export interface ExistingMeta {
  id: string;
  createdAt: Date;
  author: {
    id: string;
    username: string;
    avatarUrl: string | null;
    avatarAnimatedUrl: string | null;
  };
}

/**
 * E5a Rev.2 §4.7 — istemcinin yerel şifreli mesaj kayıtlarının sunucuda hâlâ var olup olmadığını sorar.
 * Silinmiş mesaj geçmişte dönmediği için istemci "silindi"yi başka türlü öğrenemez (çevrimdışıyken silinenler).
 * Yanıt kimlik taşır, içerik yok. Çağıran kanala erişemiyorsa 403 (mevcut üyelik kapısı).
 * E7 §5.4: `meta` istenirse aynı kapılardan geçen mesajların yazanı ve zamanı da döner (yerel arama sonucu);
 * çağıranın geçmiş ucundan zaten görebildiğinden fazlası değil.
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
    withMeta = false,
  ): Promise<{ existing: string[]; meta?: ExistingMeta[] }> {
    await this.membership.requireChannelAccess(userId, channelId);
    // E5b §3.3 (E5a §4.8 PM bulgusu): "Sohbeti temizle" çağıranın clearedAt'ini yazar, mesaj kalır. Temizlenen
    // şifreli mesajın yerel düz kaydı yedeğe/aktarıma girmesin diye clearedAt'ten önceki mesajlar SİLİNMİŞ sayılır.
    const member = await this.prisma.channelMember.findFirst({
      where: { channelId, userId },
      select: { clearedAt: true },
    });
    // Yalnız bu kanalın ve silinmemiş mesajları: başka kanalın kimliği dönmez (varlık sızdırılmaz).
    const where = {
      id: { in: [...new Set(ids)] },
      channelId,
      deletedAt: null,
      ...(member?.clearedAt && { createdAt: { gt: member.clearedAt } }),
    };
    if (!withMeta) {
      const rows = await this.prisma.message.findMany({ where, select: { id: true } });
      return { existing: rows.map((r) => r.id) };
    }
    const rows = await this.prisma.message.findMany({
      where,
      select: { id: true, createdAt: true, author: { select: MESSAGE_AUTHOR_SELECT } },
    });
    return { existing: rows.map((r) => r.id), meta: rows };
  }
}
