import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

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
 *     a. Ortak ALAN yoksa → deny USER_NOT_FOUND (jenerik). Ortak alan = ortak ortam (karantina
 *        basamaklı) VEYA ortak grup DM (M1d-0 R1; grup üyeliği zaten yetişkin + kefil kapılı)
 *     b. sender VEYA target isMinor → deny USER_NOT_FOUND (jenerik) [G1 — statü sızdırılmaz]
 *     c. İkisi yetişkin + ortak alan → allow
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
    private moderation: ModerationService,
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

    // R7 Enforcement: sender aktif global BAN → arkadaş isteği yasak (jenerik ret)
    const hasBan = await this.moderation.hasActiveBan(senderId);
    if (hasBan) {
      return { allowed: false, reason: 'USER_NOT_FOUND' };
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

    // REV-10: mevcut 1-1 DM kanalı = önceki rızalı temas (canDm bir noktada geçmiş).
    // Eski-arkadaşların ortak-ortam olmadan re-add'ine izin (CODE gibi, minör dahil).
    // Güvenli: minörün 1-1 DM'i YALNIZ arkadaşlıkla oluşur (canDm 4a yabancı-minör DM'i
    // kapatır) → mevcut DM ⟹ önceki arkadaşlık → yabancı cold-add vektörü açılmaz.
    // Blok zaten Kural 3'te jenerik reddedildi (engelliyken bu noktaya gelinmez).
    const hasDm = await this.hasExistingDmChannel(senderId, targetId);
    if (hasDm) {
      return { allowed: true };
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
      // 6a-2. Ortak GRUP DM de "ortak alan" sayılır (M1d-0 R1, sahip kararı 2026-07-31) [R7].
      //
      // Neden güvenli — grup DM'e minör HİÇBİR yoldan giremez, iki kapı da kapalı:
      //   · kurulum:   dm.service.ts createGroup → creator VEYA üye minörse GROUP_MINOR_FORBIDDEN
      //   · üye ekleme: dm.service.ts addGroupMember → hedef minörse jenerik NOT_FRIEND
      // Yani grup üyeliği ⟹ yetişkin. Üstelik gruba giriş "katılma" ile değil, yalnız BİR ÜYENİN
      // EKLEMESİYLE olur ve ekleyen kişi eklenenle arkadaş olmak zorundadır → ortak ortamdan farklı
      // olarak burada üçüncü bir kişinin iki tarafa da kefaleti vardır.
      //
      // Karantina neden UYGULANMADI: guild karantinası "büyük/açık ortama katılıp anında cold-add"
      // sürtünmesi içindir. Grup DM'de "katılma" diye bir yol yok; giriş zaten mevcut bir arkadaşlıkla
      // kapılı. Eklenmek için saldırganın kurbanla ZATEN arkadaş olan birine ihtiyacı var — bu durumda
      // eklediği kişi de kendi arkadaşı olmak zorunda. Drive-by vektörü oluşmuyor, ek basamak
      // kullanıcıya bedel yükler, korumaya bir şey katmaz.
      //
      // Gruptan ayrılmak/çıkarılmak bu izni GERİ ALIR (sorgu anlık üyeliğe bakar, geçmişe değil).
      const sharedGroupDm = sharedGuild ? false : await this.hasSharedGroupDmChannel(senderId, targetId);
      if (!sharedGuild && !sharedGroupDm) {
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

  /** REV-10: iki kullanıcı arasında aktif 1-1 DM kanalı var mı (önceki rızalı temas kanıtı). */
  private async hasExistingDmChannel(a: string, b: string): Promise<boolean> {
    const aDmChannels = await this.prisma.channelMember.findMany({
      where: {
        userId: a,
        channel: {
          type: 'DM',
          deletedAt: null,
          // C9 (R7): PENDING mesaj isteği kanalı "önceki rızalı temas" DEĞİL — hariç tut.
          // null (legacy) + ACCEPTED = rıza sayılır; yalnız PENDING dışlanır. (not+null
          // muğlaklığına düşmemek için açık OR — yanlışlıkla legacy DM'leri elemeyelim.)
          OR: [{ dmRequestStatus: null }, { dmRequestStatus: 'ACCEPTED' }],
        },
      },
      select: { channelId: true },
    });
    if (!aDmChannels?.length) return false;
    const shared = await this.prisma.channelMember.findFirst({
      where: { userId: b, channelId: { in: aDmChannels.map((c) => c.channelId) } },
      select: { channelId: true },
    });
    return shared !== null;
  }

  /**
   * M1d-0 R1: iki kullanıcı ŞU AN aynı aktif grup DM'inde mi (Kural 6a-2 "ortak alan" kanıtı).
   *
   * Anlık üyeliğe bakar — biri gruptan ayrılırsa/çıkarılırsa izin de düşer. `dmRequestStatus`
   * süzgeci YOK: o alan 1-1 mesaj isteği akışına ait (C9), grup DM'de kullanılmıyor.
   */
  private async hasSharedGroupDmChannel(a: string, b: string): Promise<boolean> {
    const aGroupChannels = await this.prisma.channelMember.findMany({
      where: { userId: a, channel: { type: 'GROUP_DM', deletedAt: null } },
      select: { channelId: true },
    });
    if (!aGroupChannels?.length) return false;
    const shared = await this.prisma.channelMember.findFirst({
      where: { userId: b, channelId: { in: aGroupChannels.map((c) => c.channelId) } },
      select: { channelId: true },
    });
    return shared !== null;
  }
}

