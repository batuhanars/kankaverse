import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface CanDmResult {
  allowed: boolean;
  reason?: string;
}

/**
 * 🫀 DM Karar Fonksiyonu — tek T&S DM otoritesi (brief §13 #2, §5.1, §5.1.b).
 *
 * Kural sırası (R7 — insan incelemesi zorunlu):
 *  1. Kendi kendine DM → deny CANNOT_DM_SELF
 *  2. Blok (her iki yönde) → deny BLOCKED
 *  3. Arkadaş (ACCEPTED) → allow  [minor + arkadaş = izinli; blok hariç her şeyi geçer]
 *  4. Arkadaş değil:
 *     a. sender VEYA target isMinor → deny DM_NOT_ALLOWED
 *     b. sender VEYA target yeni hesap (NEW_ACCOUNT_DM_LOCK) → deny DM_NOT_ALLOWED (§5.1.b)
 *     c. İkisi de yetişkin + yerleşik → target.dmPolicy:
 *        EVERYONE → allow
 *        FRIENDS  → ortak sunucu varsa allow, yoksa deny
 *        NONE     → deny
 *
 * Hook'lar (yapı kurulu, davranış ait sprint'te):
 *  - verificationStatus okunur; doğrulanmış-yetişkin gevşemesi → Sprint 8 (e-Devlet)
 *  - Davranışsal koruma ("muhtemel reşit değil") → Sprint 4+ no-op
 *  - Topluluk report'u ("yaşı küçük") → Sprint 4 no-op
 *  - Karantina (yeni-üye) → Sprint 7 no-op
 */
@Injectable()
export class DmPermissionService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async canDm(senderId: string, targetId: string): Promise<CanDmResult> {
    // Kural 1: kendi kendine DM
    if (senderId === targetId) {
      return { allowed: false, reason: 'CANNOT_DM_SELF' };
    }

    const [sender, target] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId, deletedAt: null },
        select: { id: true, isMinor: true, dmPolicy: true, verificationStatus: true, createdAt: true },
      }),
      this.prisma.user.findUnique({
        where: { id: targetId, deletedAt: null },
        select: { id: true, isMinor: true, dmPolicy: true, verificationStatus: true, createdAt: true },
      }),
    ]);

    if (!sender || !target) {
      return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }

    // Kural 2: blok (her iki yönde)
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: targetId },
          { blockerId: targetId, blockedId: senderId },
        ],
      },
    });
    if (block) {
      return { allowed: false, reason: 'BLOCKED' };
    }

    // Kural 3: arkadaş (ACCEPTED) — minor + arkadaş = izinli
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: senderId, addresseeId: targetId },
          { requesterId: targetId, addresseeId: senderId },
        ],
      },
    });
    if (friendship) {
      // Hook: verificationStatus okuma noktası kurulu; doğrulanmış-yetişkin ayrıcalığı Sprint 8
      // _verificationStatus(sender.verificationStatus, target.verificationStatus); // no-op
      return { allowed: true };
    }

    // Kural 4: arkadaş değil

    // 4a. Reşit olmayan — yabancı cold-DM kapalı (§5.1)
    if (sender.isMinor || target.isMinor) {
      return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }

    // 4b. Yeni hesap koruması — beyan yaşından bağımsız (§5.1.b)
    const lockDays = this.config.get<number>('newAccountDmLockDays') ?? 7;
    const lockMs = lockDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (now - sender.createdAt.getTime() < lockMs || now - target.createdAt.getTime() < lockMs) {
      // Hook: davranışsal koruma / karantina gevşemesi → Sprint 4/7 no-op
      return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }

    // 4c. İkisi de yetişkin + yerleşik → dmPolicy
    // Hook: topluluk report'u / "muhtemel reşit değil" → Sprint 4 no-op
    switch (target.dmPolicy) {
      case 'EVERYONE':
        return { allowed: true };

      case 'FRIENDS': {
        // Ortak sunucu kontrolü
        const sharedGuild = await this.prisma.guildMember.findFirst({
          where: {
            userId: senderId,
            guild: {
              members: { some: { userId: targetId } },
              deletedAt: null,
            },
          },
        });
        return sharedGuild ? { allowed: true } : { allowed: false, reason: 'DM_NOT_ALLOWED' };
      }

      case 'NONE':
      default:
        return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }
  }
}
