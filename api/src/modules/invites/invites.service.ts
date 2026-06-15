import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { InviteDto, InvitePreviewDto } from './dto/invite.dto';
import { generateInviteCode } from './utils/invite-code.util';
import { Invite, Guild } from '@prisma/client';

function toInviteDto(invite: Invite): InviteDto {
  return {
    code: invite.code,
    guildId: invite.guildId,
    maxUses: invite.maxUses,
    uses: invite.uses,
    expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
    createdAt: invite.createdAt.toISOString(),
  };
}

function toGuildDto(guild: Guild) {
  return {
    id: guild.id,
    name: guild.name,
    ownerId: guild.ownerId,
    adultsOnly: guild.adultsOnly,
    iconUrl: guild.iconUrl,
    createdAt: guild.createdAt.toISOString(),
  };
}

/** Davet geçerlilik kontrolü: deletedAt null + expiresAt geçmemiş + maxUses dolmamış */
function isInviteActive(invite: Invite): boolean {
  if (invite.deletedAt !== null) return false;
  if (invite.expiresAt !== null && invite.expiresAt <= new Date()) return false;
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return false;
  return true;
}

@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private membershipService: MembershipService,
    private permissions: PermissionsService,
    private realtime: RealtimeService,
  ) {}

  /** POST /guilds/:id/invites — CREATE_INVITE izni */
  async createInvite(userId: string, guildId: string, dto: CreateInviteDto): Promise<InviteDto> {
    await this.membershipService.requireGuildMembership(userId, guildId);
    const canCreate = await this.permissions.hasGuildPermission(userId, guildId, 'CREATE_INVITE');
    if (!canCreate) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    // Çakışmada yeniden üret (en fazla 5 deneme)
    let code: string;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateInviteCode();
      const existing = await this.prisma.invite.findUnique({ where: { code } });
      if (!existing) break;
      if (attempt === 4) {
        // Olağanüstü durum — pratikte neredeyse imkânsız
        code = generateInviteCode();
      }
    }

    const expiresAt = dto.expiresInHours
      ? new Date(Date.now() + dto.expiresInHours * 60 * 60 * 1000)
      : null;

    const invite = await this.prisma.invite.create({
      data: {
        code: code!,
        guildId,
        creatorId: userId,
        maxUses: dto.maxUses ?? null,
        expiresAt,
      },
    });

    return toInviteDto(invite);
  }

  /** GET /guilds/:id/invites — MANAGE_GUILD izni: aktif davetler */
  async listInvites(userId: string, guildId: string): Promise<InviteDto[]> {
    await this.membershipService.requireGuildMembership(userId, guildId);
    const canManage = await this.permissions.hasGuildPermission(userId, guildId, 'MANAGE_GUILD');
    if (!canManage) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    const now = new Date();
    const invites = await this.prisma.invite.findMany({
      where: {
        guildId,
        deletedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    });

    // maxUses dolmuş olanları filtrele
    return invites
      .filter((inv) => inv.maxUses === null || inv.uses < inv.maxUses)
      .map(toInviteDto);
  }

  /** DELETE /invites/:code — o ortamın OWNER/ADMIN'i */
  async revokeInvite(userId: string, code: string): Promise<null> {
    const invite = await this.prisma.invite.findUnique({ where: { code } });
    if (!invite || invite.deletedAt !== null) {
      throw new NotFoundException({ message: 'Davet bulunamadı.', error: 'INVITE_INVALID' });
    }

    // Yetki: MANAGE_GUILD izni olmalı
    await this.membershipService.requireGuildMembership(userId, invite.guildId);
    const canManage = await this.permissions.hasGuildPermission(userId, invite.guildId, 'MANAGE_GUILD');
    if (!canManage) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }

    await this.prisma.invite.update({
      where: { code },
      data: { deletedAt: new Date() },
    });

    return null;
  }

  /** GET /invites/:code — auth: önizleme */
  async previewInvite(code: string): Promise<InvitePreviewDto> {
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { guild: true },
    });

    if (!invite) {
      return { guildName: '', adultsOnly: false, valid: false };
    }

    const valid = isInviteActive(invite);

    return {
      guildName: invite.guild.name,
      adultsOnly: invite.guild.adultsOnly,
      valid,
    };
  }

  /**
   * POST /invites/:code/join — auth
   *
   * [R7] Kapı sırası (fail-closed):
   *   1. Davet geçerli mi → değilse 404 INVITE_INVALID
   *   2. guild.adultsOnly && user.isMinor → 403 AGE_RESTRICTED (minör statüsü sızdırılmaz)
   *   3. Zaten üye → 409 ALREADY_MEMBER
   *   4. Transaction: GuildMember oluştur (MEMBER) + invite.uses atomik artır → GuildDto
   */
  async joinByInvite(userId: string, code: string) {
    // 1. Davet geçerliliği
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { guild: true },
    });

    if (!invite || !isInviteActive(invite)) {
      throw new NotFoundException({ message: 'Davet geçersiz veya süresi dolmuş.', error: 'INVITE_INVALID' });
    }

    const guild = invite.guild;

    // 2. [R7] adultsOnly kapısı: minör statüsü yalnız jenerik AGE_RESTRICTED ile döner
    if (guild.adultsOnly) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { isMinor: true },
      });
      if (user?.isMinor) {
        throw new ForbiddenException({ message: 'Bu ortama erişim yaşınız nedeniyle kısıtlanmıştır.', error: 'AGE_RESTRICTED' });
      }
    }

    // 2.5. Ortam-ban kontrolü — yasaklı kullanıcı davetle giremez (kendi yasağı; açık mesaj)
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

    // 4. Transaction: üye oluştur + uses atomik artır
    await this.prisma.$transaction([
      this.prisma.guildMember.create({
        data: { guildId: guild.id, userId, role: 'MEMBER' },
      }),
      this.prisma.invite.update({
        where: { id: invite.id },
        data: { uses: { increment: 1 } },
      }),
    ]);

    // REV-14 realtime: mevcut üyelere yeni katılanı anlık bildir (üye listesi +
    // mention autocomplete sayfa yenilemeden güncellensin). Transaction SONRASI.
    await this.notifyMemberJoined(guild.id, userId);

    return toGuildDto(guild);
  }

  /** REV-14: yeni üyeyi guild'in diğer üyelerine `guild.member_joined` ile yay. */
  private async notifyMemberJoined(guildId: string, newUserId: string) {
    const newMember = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: newUserId } },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
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
      },
    });
  }
}
