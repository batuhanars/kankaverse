import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { GuildJoinService } from '../../shared/guild-join/guild-join.service';
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
    private guildJoin: GuildJoinService,
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
   *   2. Sprint 7A yaş/ban/üyelik kapısı + üye create + realtime → GuildJoinService (TEK kaynak)
   *      + invite.uses atomik artımı aynı transaction'da (extra tx op).
   */
  async joinByInvite(userId: string, code: string) {
    // 1. Davet geçerliliği (Keşfet'in discoverable kapısının davet karşılığı)
    const invite = await this.prisma.invite.findUnique({
      where: { code },
      include: { guild: true },
    });

    if (!invite || !isInviteActive(invite)) {
      throw new NotFoundException({ message: 'Davet geçersiz veya süresi dolmuş.', error: 'INVITE_INVALID' });
    }

    const guild = invite.guild;

    // 2. Ortak Sprint 7A gate: adultsOnly&&minör→403, ban→403, zaten-üye→409,
    //    atomik üye create + invite.uses artımı + realtime member_joined.
    await this.guildJoin.joinGuild(userId, guild, [
      this.prisma.invite.update({
        where: { id: invite.id },
        data: { uses: { increment: 1 } },
      }),
    ]);

    return toGuildDto(guild);
  }
}
