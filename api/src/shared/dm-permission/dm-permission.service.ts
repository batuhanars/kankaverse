import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

export interface CanDmResult {
  allowed: boolean;
  reason?: string;
  // C9: allowed=true iken bu true ise DM DİREKT değil, "mesaj isteği" (PENDING) olarak açılır.
  // Yalnız arkadaş-olmayan + yetişkin↔yetişkin + target.dmPolicy=EVERYONE yolunda set edilir.
  asRequest?: boolean;
}

/**
 * 🫀 DM Karar Fonksiyonu — tek T&S DM otoritesi (brief §13 #2, §5.1, §5.1.b).
 *
 * Kural sırası (R7 — insan incelemesi zorunlu). C9 (Mesaj İstekleri) ile güncellendi:
 *  1. Kendi kendine DM → deny CANNOT_DM_SELF
 *  2. Blok (her iki yönde) → deny BLOCKED
 *  3. C9 — target.dmPolicy=NONE → deny DM_NOT_ALLOWED  [ARKADAŞTAN ÖNCE: kanka dahil herkesi keser;
 *     "DM karartma" / bir süre DM almama. Blok hariç mutlak sessizlik.]
 *  4. Arkadaş (ACCEPTED) → allow (direkt)  [minor + arkadaş = izinli; blok/NONE hariç geçer]
 *  5. Arkadaş değil:
 *     a. sender VEYA target isMinor → deny DM_NOT_ALLOWED  [istek yolu minöre KAPALI — C9 kilitli karar]
 *     b. sender VEYA target yeni hesap (NEW_ACCOUNT_DM_LOCK) → deny DM_NOT_ALLOWED (§5.1.b)
 *     c. İkisi de yetişkin + yerleşik → target.dmPolicy:
 *        EVERYONE → allow + asRequest  [C9: direkt değil, mesaj isteği/PENDING]
 *        FRIENDS  → deny  [C9: yalnız kanka; ortak-sunucu-yabancısı yolu KALDIRILDI]
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
    private moderation: ModerationService,
  ) {}

  async canDm(senderId: string, targetId: string): Promise<CanDmResult> {
    // Kural 1: kendi kendine DM
    if (senderId === targetId) {
      return { allowed: false, reason: 'CANNOT_DM_SELF' };
    }

    // R7 Enforcement: sender aktif global BAN → DM başlatma yasak
    const hasBan = await this.moderation.hasActiveBan(senderId);
    if (hasBan) {
      return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }

    const [sender, target] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId, deletedAt: null },
        select: {
          id: true,
          isMinor: true,
          dmPolicy: true,
          verificationStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: targetId, deletedAt: null },
        select: {
          id: true,
          isMinor: true,
          dmPolicy: true,
          verificationStatus: true,
          createdAt: true,
        },
      }),
    ]);

    if (!sender || !target) {
      return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }

    // Kural 2: blok (her iki yönde) — G3: JENERİK DM_NOT_ALLOWED (BLOCKED istemciye dönmez)
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: targetId },
          { blockerId: targetId, blockedId: senderId },
        ],
      },
    });
    if (block) {
      return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }

    // Kural 3 (C9): target NONE → kanka DAHİL herkesi keser (DM karartma). Arkadaşlıktan ÖNCE.
    // "Bir süre DM almak istemiyorum" — blok hariç mutlak sessizlik. Mevcut kanka konuşmaları da durur.
    if (target.dmPolicy === 'NONE') {
      return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }

    // Kural 4: arkadaş (ACCEPTED) — minor + arkadaş = izinli; direkt DM (istek değil)
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

    // Kural 5: arkadaş değil

    // 5a. Reşit olmayan — yabancı cold-DM kapalı (§5.1). C9: istek yolu da minöre KAPALI (kilitli karar).
    if (sender.isMinor || target.isMinor) {
      return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }

    // 5b. Yeni hesap koruması — beyan yaşından bağımsız (§5.1.b)
    const lockDays = this.config.get<number>('newAccountDmLockDays') ?? 7;
    const lockMs = lockDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (now - sender.createdAt.getTime() < lockMs || now - target.createdAt.getTime() < lockMs) {
      // Hook: davranışsal koruma / karantina gevşemesi → Sprint 4/7 no-op
      return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }

    // 5c. İkisi de yetişkin + yerleşik → dmPolicy (NONE zaten Kural 3'te kesildi)
    // Hook: topluluk report'u / "muhtemel reşit değil" → Sprint 4 no-op
    switch (target.dmPolicy) {
      case 'EVERYONE':
        // C9: yabancı direkt DM'e düşmez → mesaj isteği (PENDING). Alıcı kabul/reddet eder.
        return { allowed: true, asRequest: true };

      case 'FRIENDS':
        // C9: yalnız kanka. Yabancı istek bile atamaz (ortak-sunucu-yabancısı yolu kaldırıldı).
        return { allowed: false, reason: 'DM_NOT_ALLOWED' };

      // NONE zaten Kural 3'te kesildi (buraya ulaşmaz); default fail-closed kalır.
      default:
        return { allowed: false, reason: 'DM_NOT_ALLOWED' };
    }
  }
}
