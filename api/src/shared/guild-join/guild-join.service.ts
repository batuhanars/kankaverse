import {
  Injectable,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * C6 — Ortam katılım kapısı (Sprint 7A gate dizisi; TEK kaynak).
 *
 * Hem davet-join (`InvitesService.joinByInvite`) hem Keşfet-join
 * (`DiscoveryService` / `GuildsService.joinDiscovery`) bu helper'ı çağırır;
 * yaş/ban/üyelik kapısı DUPLİKE EDİLMEZ.
 *
 * [R7] Kapı sırası (fail-closed):
 *   1. guild.adultsOnly && user.isMinor → 403 AGE_RESTRICTED (minör statüsü sızdırılmaz)
 *   2. GuildBan → 403 GUILD_BANNED
 *   3. Zaten üye → 409 ALREADY_MEMBER
 *   4. Atomik GuildMember create (MEMBER) [+ ek tx işlemleri] → realtime member_joined
 *
 * Çağıran taraf giriş kapısını (davet geçerliliği YA DA discoverable) kendisi tutar;
 * bu servis yalnız ortak yaş/ban/üyelik gate'ini + member create'i + realtime'ı üstlenir.
 */
@Injectable()
export class GuildJoinService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  /**
   * Sprint 7A yaş/ban/üyelik kapısını uygular ve üyeyi oluşturur.
   *
   * @param extraTxOps  member create ile aynı transaction'da çalışacak ek işlemler
   *                    (örn. davet `uses` artırımı). Boşsa yalnız member create.
   */
  async joinGuild(
    userId: string,
    guild: { id: string; adultsOnly: boolean },
    extraTxOps: Prisma.PrismaPromise<unknown>[] = [],
  ): Promise<void> {
    // 1. [R7] adultsOnly kapısı: minör statüsü yalnız jenerik AGE_RESTRICTED ile döner
    if (guild.adultsOnly) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { isMinor: true },
      });
      if (user?.isMinor) {
        throw new ForbiddenException({
          message: 'Bu ortama erişim yaşınız nedeniyle kısıtlanmıştır.',
          error: 'AGE_RESTRICTED',
        });
      }
    }

    // 2. Ortam-ban kontrolü — yasaklı kullanıcı giremez
    const ban = await this.prisma.guildBan.findUnique({
      where: { guildId_userId: { guildId: guild.id, userId } },
    });
    if (ban) {
      throw new ForbiddenException({ message: 'Bu ortamdan yasaklandınız.', error: 'GUILD_BANNED' });
    }

    // 3. Zaten üye kontrolü
    const existing = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: guild.id, userId } },
    });
    if (existing) {
      throw new ConflictException({ message: 'Bu sunucuya zaten üyesiniz.', error: 'ALREADY_MEMBER' });
    }

    // 4. Transaction: üye oluştur (+ çağıranın ek işlemleri)
    await this.prisma.$transaction([
      this.prisma.guildMember.create({
        data: { guildId: guild.id, userId, role: 'MEMBER' },
      }),
      ...extraTxOps,
    ] as Prisma.PrismaPromise<unknown>[]);

    // 4b. Varsayılan rol: yetkililer ayardan belirlediyse yeni üyeye otomatik ata.
    await this.assignDefaultRole(guild.id, userId);

    // REV-14 realtime: mevcut üyelere yeni katılanı anlık bildir. Transaction SONRASI.
    await this.notifyMemberJoined(guild.id, userId);

    // Çağıranın diğer oturumlarına (masaüstü + tarayıcı) yeni ortamı anlık ekle → rail güncellenir.
    this.realtime.emitToUser(userId, 'guild.joined', { guildId: guild.id });
  }

  /** Yeni üyeye guild'in varsayılan rolünü (Role.isDefault) bağla. Yoksa no-op. */
  private async assignDefaultRole(guildId: string, userId: string) {
    const role = await this.prisma.role.findFirst({
      where: { guildId, isDefault: true, isEveryone: false },
      select: { id: true },
    });
    if (!role) return;
    const member = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { id: true },
    });
    if (!member) return;
    // İdempotent: zaten bağlıysa (teorik) yok say.
    await this.prisma.guildMemberRole
      .create({ data: { memberId: member.id, roleId: role.id } })
      .catch(() => undefined);
  }

  /** REV-14: yeni üyeyi guild'in diğer üyelerine `guild.member_joined` ile yay. */
  private async notifyMemberJoined(guildId: string, newUserId: string) {
    const newMember = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: newUserId } },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        // Varsayılan rol atandıysa üye doğru rol başlığı altında ANLIK görünsün.
        roleLinks: { include: { role: { select: { id: true, name: true, color: true, position: true, hoist: true, isEveryone: true } } } },
      },
    });
    if (!newMember) return;

    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    const recipients = (members ?? []).map((m) => m.userId).filter((id) => id !== newUserId);

    this.realtime.emitToUsers(recipients, 'guild.member_joined', {
      guildId,
      member: {
        userId: newMember.user.id,
        username: newMember.user.username,
        avatarUrl: newMember.user.avatarUrl,
        role: newMember.role,
        roles: (newMember.roleLinks ?? [])
          .filter((rl) => !rl.role.isEveryone)
          .map((rl) => ({
            id: rl.role.id,
            name: rl.role.name,
            color: rl.role.color,
            position: rl.role.position,
            hoist: rl.role.hoist,
          })),
      },
    });
  }
}
