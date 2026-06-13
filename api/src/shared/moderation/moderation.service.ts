import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActiveRestriction {
  type: 'BAN' | 'MUTE';
  scope: string | null;
  expiresAt: Date | null;
}

/**
 * 🫀 Moderasyon Enforcement Servisi (R7 — insan incelemesi zorunlu)
 *
 * getActiveRestrictions: BAN veya MUTE türündeki aktif (süresi dolmamış veya süresiz)
 * aksiyonları döndürür.
 *
 * Enforcement noktaları:
 *  - BAN (global, scope=null): mesaj gönderme + DM başlatma + arkadaş isteği → deny
 *  - MUTE (scope-aware): o kanalın guildId scope'una uyan → mesaj gönderme → deny
 *
 * Kendi statüsü kullanıcıya dönebilir (USER_BANNED/USER_MUTED) — başka kullanıcının
 * aksiyon bilgisi ASLA dönmez.
 */
@Injectable()
export class ModerationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Kullanıcının aktif kısıtlamalarını döndürür.
   *
   * @param userId  Sorgulanacak kullanıcı
   * @param guildId Kanal bağlamı (MUTE scope eşleşmesi için); null/undefined = yalnızca global kontrol
   */
  async getActiveRestrictions(userId: string, guildId?: string | null): Promise<ActiveRestriction[]> {
    const now = new Date();

    // scope filtresi: global (null) VEYA verilen guildId
    const scopeFilter = guildId
      ? { OR: [{ scope: null }, { scope: guildId }] }
      : { scope: null };

    const actions = await this.prisma.moderationAction.findMany({
      where: {
        targetUserId: userId,
        type: { in: ['BAN', 'MUTE'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...scopeFilter,
      },
      select: { type: true, scope: true, expiresAt: true },
    });

    return actions as ActiveRestriction[];
  }

  /** Kullanıcının aktif global BAN'ı var mı (scope=null, süresi dolmamış). */
  async hasActiveBan(userId: string): Promise<boolean> {
    const now = new Date();
    const ban = await this.prisma.moderationAction.findFirst({
      where: {
        targetUserId: userId,
        type: 'BAN',
        scope: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    return !!ban;
  }

  /**
   * Kullanıcının verilen kanalda aktif MUTE'u var mı.
   * Scope: global (null) VEYA kanalın guildId'si.
   */
  async hasActiveMute(userId: string, guildId: string | null): Promise<boolean> {
    const now = new Date();
    const muteFilter = guildId
      ? { OR: [{ scope: null }, { scope: guildId }] }
      : { scope: null };

    const mute = await this.prisma.moderationAction.findFirst({
      where: {
        targetUserId: userId,
        type: 'MUTE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...muteFilter,
      },
    });
    return !!mute;
  }
}
