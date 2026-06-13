import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export type FriendRequestMethod = 'CODE' | 'USER_CLICK';

export interface CanSendFriendRequestResult {
  allowed: boolean;
  reason?: string;
}

/**
 * 🫀 Arkadaş İsteği Karar Fonksiyonu — tek T&S arkadaş-istek otoritesi (Sprint 4A §3, brief §5.1.b).
 *
 * Kural sırası (R7 — insan incelemesi zorunlu):
 *  1. senderId === targetId → deny CANNOT_FRIEND_SELF
 *  2. sender/target yok (deletedAt=null) → deny USER_NOT_FOUND
 *  3. Blok (her iki yönde) → deny USER_NOT_FOUND (JENERİK — blok sızdırmaz, G3)
 *  4. Zaten ACCEPTED arkadaş → deny ALREADY_FRIENDS
 *  5. Bekleyen istek:
 *     - karşıdan PENDING (hedef→biz) → allow  [FriendsService otomatik kabul eder]
 *     - aynı yönde PENDING (biz→hedef) → deny REQUEST_EXISTS
 *  6. method == USER_CLICK (kart/tıkla-ekle — §3.6):
 *     a. Ortak ortam yoksa → deny USER_NOT_FOUND (jenerik)
 *     b. sender VEYA target isMinor → deny USER_NOT_FOUND (jenerik) [G1 — statü sızdırılmaz]
 *     c. İkisi yetişkin + ortak ortam → allow
 *  7. method == CODE (bilinçli paylaşım — minör dahil herkes):
 *     → allow
 *
 * Sızıntı kuralı (G1/G3): jenerik USER_NOT_FOUND "yok / blok / minör / ortam yok"
 * ayırt edilemez olarak döner — sebep hiçbir yanıtta açığa çıkmaz.
 */
@Injectable()
export class FriendPermissionService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async canSendFriendRequest(
    senderId: string,
    targetId: string,
    method: FriendRequestMethod,
  ): Promise<CanSendFriendRequestResult> {
    // Kural 1: kendi kendine istek
    if (senderId === targetId) {
      return { allowed: false, reason: 'CANNOT_FRIEND_SELF' };
    }

    // Kural 2: kullanıcı varlığı
    const [sender, target] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId, deletedAt: null },
        select: { id: true, isMinor: true },
      }),
      this.prisma.user.findUnique({
        where: { id: targetId, deletedAt: null },
        select: { id: true, isMinor: true },
      }),
    ]);

    if (!sender || !target) {
      return { allowed: false, reason: 'USER_NOT_FOUND' };
    }

    // Kural 3: blok (her iki yönde) — JENERİK USER_NOT_FOUND (G3, blok-obfuscation)
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: targetId },
          { blockerId: targetId, blockedId: senderId },
        ],
      },
    });
    if (block) {
      return { allowed: false, reason: 'USER_NOT_FOUND' };
    }

    // Kural 4: mevcut arkadaşlık durumu
    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: senderId, addresseeId: targetId },
          { requesterId: targetId, addresseeId: senderId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        return { allowed: false, reason: 'ALREADY_FRIENDS' };
      }
      if (existing.status === 'PENDING') {
        // Karşıdan gelen bekleyen istek → FriendsService otomatik kabul eder
        if (existing.addresseeId === senderId) {
          return { allowed: true };
        }
        // Aynı yönde bekleyen istek → reddet
        return { allowed: false, reason: 'REQUEST_EXISTS' };
      }
      // DECLINED → izin ver (FriendsService upsert eder)
    }

    // Kural 6: USER_CLICK — kod istemeden, karttan
    if (method === 'USER_CLICK') {
      // 6a. Ortak ortam zorunlu — karantina: sender o guild'de yeni üyeyse basamak geçmez (R7)
      // Yalnız initiator (sender) karantinası kapılar; target joinedAt bakılmaz.
      const quarantineHours = this.config.get<number>('quarantineHours') ?? 24;
      const cutoff = new Date(Date.now() - quarantineHours * 60 * 60 * 1000);
      const sharedGuild = await this.prisma.guildMember.findFirst({
        where: {
          userId: senderId,
          joinedAt: { lt: cutoff }, // sender karantinada değil (joinedAt cutoff'tan önce)
          guild: {
            deletedAt: null,
            members: { some: { userId: targetId } },
          },
        },
      });
      if (!sharedGuild) {
        return { allowed: false, reason: 'USER_NOT_FOUND' };
      }

      // 6b. Minör koruma — sender VEYA target minörse jenerik ret [G1]
      // Statü HİÇBİR yanıtta sızdırılmaz; jenerik USER_NOT_FOUND döner.
      if (sender.isMinor || target.isMinor) {
        return { allowed: false, reason: 'USER_NOT_FOUND' };
      }

      // 6c. İkisi de yetişkin + ortak ortam → izin ver
      return { allowed: true };
    }

    // Kural 7: CODE — bilinçli paylaşım, minör dahil herkes
    return { allowed: true };
  }
}
