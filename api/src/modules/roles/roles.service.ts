import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { GuildRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { filterKnownPermissions, DEFAULT_EVERYONE_PERMISSIONS } from '../../common/permissions';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleDto } from './dto/role.dto';

/** Prisma Role kaydını RoleDto'ya dönüştürür. memberCount sorgu sonucu verilir. */
function toRoleDto(role: {
  id: string;
  guildId: string;
  name: string;
  color: string;
  position: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string[];
  iconUrl: string | null;
  isEveryone: boolean;
}, memberCount: number): RoleDto {
  return {
    id: role.id,
    guildId: role.guildId,
    name: role.name,
    color: role.color,
    position: role.position,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions,
    iconUrl: role.iconUrl,
    isEveryone: role.isEveryone,
    memberCount,
  };
}

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private membership: MembershipService,
    private realtime: RealtimeService,
  ) {}

  /** Guild'in tüm üyelerinin userId'lerini döner (realtime broadcast hedefi). */
  private async guildMemberIds(guildId: string): Promise<string[]> {
    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  /** Aktör OWNER veya ADMIN değilse 403 fırlatır. Guild üyeliği de doğrulanır. */
  private async requireOwnerOrAdmin(actorId: string, guildId: string): Promise<void> {
    const { membership } = await this.membership.requireGuildMembership(actorId, guildId);
    if (membership.role !== GuildRole.OWNER && membership.role !== GuildRole.ADMIN) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }
  }

  /**
   * Rol kaydını getirir; yoksa 404 fırlatır.
   * İsteğe bağlı: `requireGuildId` ile belirli bir guild'e ait olup olmadığını da kontrol eder.
   */
  private async findRoleOrFail(roleId: string, requireGuildId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException({ message: 'Rol bulunamadı.', error: 'ROLE_NOT_FOUND' });
    }
    if (requireGuildId && role.guildId !== requireGuildId) {
      throw new NotFoundException({ message: 'Rol bulunamadı.', error: 'ROLE_NOT_FOUND' });
    }
    return role;
  }

  /** Rol için GuildMemberRole sayısını döner. */
  private async roleMemberCount(roleId: string): Promise<number> {
    return this.prisma.guildMemberRole.count({ where: { roleId } });
  }

  // ─── GET /guilds/:id/roles ─────────────────────────────────────────────────

  async listRoles(actorId: string, guildId: string): Promise<RoleDto[]> {
    await this.membership.requireGuildMembership(actorId, guildId);

    const roles = await this.prisma.role.findMany({
      where: { guildId },
      orderBy: { position: 'desc' },
    });

    // memberCount'ları paralel çek (N+1 önlemi: Promise.all batch ile)
    const counts = await Promise.all(roles.map((r) => this.roleMemberCount(r.id)));

    return roles.map((r, i) => toRoleDto(r, counts[i]));
  }

  // ─── POST /guilds/:id/roles ────────────────────────────────────────────────

  async createRole(actorId: string, guildId: string, dto: CreateRoleDto): Promise<RoleDto> {
    await this.requireOwnerOrAdmin(actorId, guildId);

    // Yeni rol pozisyonu = mevcut max + 1
    const maxPos = await this.prisma.role.aggregate({
      where: { guildId },
      _max: { position: true },
    });
    const position = (maxPos._max.position ?? 0) + 1;

    const permissions = dto.permissions ? filterKnownPermissions(dto.permissions) : [];

    const role = await this.prisma.role.create({
      data: {
        guildId,
        name: dto.name,
        color: dto.color ?? '#99AAB5',
        position,
        hoist: dto.hoist ?? false,
        mentionable: dto.mentionable ?? false,
        permissions,
        isEveryone: false,
      },
    });

    const roleDto = toRoleDto(role, 0);

    // Realtime: tüm guild üyelerine yay
    const memberIds = await this.guildMemberIds(guildId);
    this.realtime.emitToUsers(memberIds, 'guild.role_created', roleDto);

    return roleDto;
  }

  // ─── PATCH /roles/:id ─────────────────────────────────────────────────────

  async updateRole(actorId: string, roleId: string, dto: UpdateRoleDto): Promise<RoleDto> {
    const role = await this.findRoleOrFail(roleId);
    await this.requireOwnerOrAdmin(actorId, role.guildId);

    // @everyone kısıtlamaları: name ve hoist değiştirilemez
    if (role.isEveryone) {
      if (dto.name !== undefined) {
        throw new BadRequestException({
          message: '@everyone rolünün adı değiştirilemez.',
          error: 'CANNOT_EDIT_EVERYONE_NAME',
        });
      }
      // hoist sessizce yok say (kontratta 400 tercih → biz de 400 fırlatalım, tutarlılık için)
      if (dto.hoist !== undefined) {
        throw new BadRequestException({
          message: '@everyone rolünün hoist ayarı değiştirilemez.',
          error: 'CANNOT_EDIT_EVERYONE_HOIST',
        });
      }
    }

    const permissions = dto.permissions !== undefined
      ? filterKnownPermissions(dto.permissions)
      : undefined;

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.hoist !== undefined && { hoist: dto.hoist }),
        ...(dto.mentionable !== undefined && { mentionable: dto.mentionable }),
        ...(permissions !== undefined && { permissions }),
      },
    });

    const memberCount = await this.roleMemberCount(roleId);
    const roleDto = toRoleDto(updated, memberCount);

    const memberIds = await this.guildMemberIds(role.guildId);
    this.realtime.emitToUsers(memberIds, 'guild.role_updated', roleDto);

    return roleDto;
  }

  // ─── DELETE /roles/:id ────────────────────────────────────────────────────

  async deleteRole(actorId: string, roleId: string): Promise<null> {
    const role = await this.findRoleOrFail(roleId);
    await this.requireOwnerOrAdmin(actorId, role.guildId);

    if (role.isEveryone) {
      throw new BadRequestException({
        message: '@everyone rolü silinemez.',
        error: 'CANNOT_DELETE_EVERYONE',
      });
    }

    const memberIds = await this.guildMemberIds(role.guildId);

    // GuildMemberRole cascade ile silinir (şemada onDelete: Cascade)
    await this.prisma.role.delete({ where: { id: roleId } });

    this.realtime.emitToUsers(memberIds, 'guild.role_deleted', { roleId });

    return null;
  }

  // ─── POST /roles/:id/members/:userId ──────────────────────────────────────

  async assignRole(
    actorId: string,
    roleId: string,
    targetUserId: string,
  ): Promise<import('../guilds/dto/guild-member.dto').GuildMemberDto & { roles: { id: string; name: string; color: string; position: number; hoist: boolean }[] }> {
    const role = await this.findRoleOrFail(roleId);
    await this.requireOwnerOrAdmin(actorId, role.guildId);

    // @everyone örtük — atama/çıkarma yasak
    if (role.isEveryone) {
      throw new BadRequestException({
        message: '@everyone rolü atanamaz veya çıkarılamaz.',
        error: 'CANNOT_ASSIGN_EVERYONE',
      });
    }

    // Hedef bu guild'in üyesi mi?
    const targetMember = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: role.guildId, userId: targetUserId } },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        roleLinks: { include: { role: true } },
      },
    });
    if (!targetMember) {
      throw new NotFoundException({
        message: 'Kullanıcı bu sunucunun üyesi değil.',
        error: 'NOT_GUILD_MEMBER',
      });
    }

    // Upsert (idempotent)
    await this.prisma.guildMemberRole.upsert({
      where: { memberId_roleId: { memberId: targetMember.id, roleId } },
      update: {},
      create: { memberId: targetMember.id, roleId },
    });

    // Güncel üye DTO'su için role links'i yeniden çek
    const updatedMember = await this.prisma.guildMember.findUnique({
      where: { id: targetMember.id },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        roleLinks: { include: { role: true }, orderBy: { role: { position: 'desc' } } },
      },
    });

    const memberDto = this.toExtendedMemberDto(updatedMember!);

    const memberIds = await this.guildMemberIds(role.guildId);
    this.realtime.emitToUsers(memberIds, 'guild.member_updated', {
      guildId: role.guildId,
      member: memberDto,
    });

    return memberDto;
  }

  // ─── DELETE /roles/:id/members/:userId ────────────────────────────────────

  async removeRole(
    actorId: string,
    roleId: string,
    targetUserId: string,
  ): Promise<import('../guilds/dto/guild-member.dto').GuildMemberDto & { roles: { id: string; name: string; color: string; position: number; hoist: boolean }[] }> {
    const role = await this.findRoleOrFail(roleId);
    await this.requireOwnerOrAdmin(actorId, role.guildId);

    if (role.isEveryone) {
      throw new BadRequestException({
        message: '@everyone rolü atanamaz veya çıkarılamaz.',
        error: 'CANNOT_ASSIGN_EVERYONE',
      });
    }

    const targetMember = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: role.guildId, userId: targetUserId } },
    });
    if (!targetMember) {
      throw new NotFoundException({
        message: 'Kullanıcı bu sunucunun üyesi değil.',
        error: 'NOT_GUILD_MEMBER',
      });
    }

    // Idempotent: kayıt yoksa hata fırlatma, deleteMany kullan
    await this.prisma.guildMemberRole.deleteMany({
      where: { memberId: targetMember.id, roleId },
    });

    // Güncel üye DTO'su için role links'i yeniden çek (assignRole ile tutarlı)
    const updatedMember = await this.prisma.guildMember.findUnique({
      where: { id: targetMember.id },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        roleLinks: { include: { role: true }, orderBy: { role: { position: 'desc' } } },
      },
    });

    const memberDto = this.toExtendedMemberDto(updatedMember!);

    const memberIds = await this.guildMemberIds(role.guildId);
    this.realtime.emitToUsers(memberIds, 'guild.member_updated', {
      guildId: role.guildId,
      member: memberDto,
    });

    return memberDto;
  }

  /** GuildMember kaydını genişletilmiş DTO'ya dönüştürür (role enum + atanmış roller[]). */
  private toExtendedMemberDto(member: {
    user: { id: string; username: string; avatarUrl: string | null };
    role: GuildRole;
    roleLinks: { role: { id: string; name: string; color: string; position: number; hoist: boolean } }[];
  }) {
    return {
      userId: member.user.id,
      username: member.user.username,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      roles: member.roleLinks.map((rl) => ({
        id: rl.role.id,
        name: rl.role.name,
        color: rl.role.color,
        position: rl.role.position,
        hoist: rl.role.hoist,
      })),
    };
  }
}
