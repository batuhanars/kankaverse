import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { GuildRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipService } from '../../shared/membership/membership.service';
import { PermissionsService } from '../../shared/permissions/permissions.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { filterKnownPermissions, DEFAULT_EVERYONE_PERMISSIONS, PermissionFlag } from '../../common/permissions';
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
    private permissions: PermissionsService,
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

  /**
   * MANAGE_ROLES iznini kontrol et; yoksa 403 FORBIDDEN.
   * Guild üyeliği requireGuildMembership ile ayrıca doğrulanır (sızıntı-güvenli sıra).
   */
  private async requireManageRoles(actorId: string, guildId: string): Promise<void> {
    await this.membership.requireGuildMembership(actorId, guildId);
    const allowed = await this.permissions.hasGuildPermission(actorId, guildId, 'MANAGE_ROLES');
    if (!allowed) {
      throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
    }
  }

  /**
   * F1 (R7, sahip kararı 2026-06-15) — "sahip olmadığın izni veremezsin" (Discord kuralı).
   * Aktör yalnız KENDİ efektif izinlerini bir role ekleyebilir. OWNER + enum-ADMIN +
   * ADMINISTRATOR-sahibi muaf (effectivePermissions.all). Yalnız YENİ eklenen bayraklar
   * denetlenir (mevcut bayrağı koruyan güncelleme serbest). İhlal → 403 CANNOT_GRANT_PERMISSION.
   */
  private async requireCanGrant(
    actorId: string,
    guildId: string,
    requested: PermissionFlag[],
    current: PermissionFlag[] = [],
  ): Promise<void> {
    const { all, flags } = await this.permissions.effectivePermissions(actorId, guildId);
    if (all) return;

    const currentSet = new Set(current);
    const lacking = requested.filter((f) => !currentSet.has(f) && !flags.has(f));
    if (lacking.length > 0) {
      throw new ForbiddenException({
        message: 'Sahip olmadığınız bir izni veremezsiniz.',
        error: 'CANNOT_GRANT_PERMISSION',
      });
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
    await this.requireManageRoles(actorId, guildId);

    // Yeni rol pozisyonu = mevcut max + 1
    const maxPos = await this.prisma.role.aggregate({
      where: { guildId },
      _max: { position: true },
    });
    const position = (maxPos._max.position ?? 0) + 1;

    const permissions = dto.permissions ? filterKnownPermissions(dto.permissions) : [];
    // F1: aktör yalnız kendi sahip olduğu izinleri yeni role verebilir (yeni rol → current boş)
    await this.requireCanGrant(actorId, guildId, permissions, []);

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
    await this.requireManageRoles(actorId, role.guildId);
    // Hiyerarşi: @everyone'ı düzenlemek hiyerarşi kontrolünden muaf (position=0, taban).
    if (!role.isEveryone) {
      await this.permissions.requireRoleHierarchy(actorId, role.guildId, role.position);
    }

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
    // F1: izin değişiyorsa aktör yalnız kendi sahip olduğu yeni bayrakları ekleyebilir
    if (permissions !== undefined) {
      await this.requireCanGrant(actorId, role.guildId, permissions, filterKnownPermissions(role.permissions));
    }

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
    await this.requireManageRoles(actorId, role.guildId);
    // @everyone silinemez (aşağıda kontrol) — hiyerarşiyi sadece silinebilir rollere uygula
    if (!role.isEveryone) {
      await this.permissions.requireRoleHierarchy(actorId, role.guildId, role.position);
    }

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
    await this.requireManageRoles(actorId, role.guildId);
    // @everyone örtük — atama/çıkarma yasak (hiyerarşi kontrolünden önce fırlatır)
    if (role.isEveryone) {
      throw new BadRequestException({
        message: '@everyone rolü atanamaz veya çıkarılamaz.',
        error: 'CANNOT_ASSIGN_EVERYONE',
      });
    }
    // Hiyerarşi (1/2): hedef rolün position'ı < aktörün en yükseği (OWNER muaf)
    await this.permissions.requireRoleHierarchy(actorId, role.guildId, role.position);

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

    // Hiyerarşi (2/2): üye aksiyonu — hedef üyenin en yüksek position'ı < aktörünki (OWNER muaf).
    // §74: rol-ata "üye aksiyonu" kapsamında; OWNER asla hedef alınamaz.
    await this.permissions.requireMemberHierarchy(actorId, role.guildId, targetUserId);

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
    await this.requireManageRoles(actorId, role.guildId);
    if (role.isEveryone) {
      throw new BadRequestException({
        message: '@everyone rolü atanamaz veya çıkarılamaz.',
        error: 'CANNOT_ASSIGN_EVERYONE',
      });
    }
    // Hiyerarşi (1/2): hedef rolün position'ı < aktörün en yükseği (OWNER muaf)
    await this.permissions.requireRoleHierarchy(actorId, role.guildId, role.position);

    const targetMember = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: role.guildId, userId: targetUserId } },
    });
    if (!targetMember) {
      throw new NotFoundException({
        message: 'Kullanıcı bu sunucunun üyesi değil.',
        error: 'NOT_GUILD_MEMBER',
      });
    }

    // Hiyerarşi (2/2): üye aksiyonu — hedef üyenin en yüksek position'ı < aktörünki (OWNER muaf).
    // §74: rol-çıkar "üye aksiyonu" kapsamında; OWNER asla hedef alınamaz.
    await this.permissions.requireMemberHierarchy(actorId, role.guildId, targetUserId);

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

  // ─── PATCH /guilds/:id/roles/reorder ────────────────────────────────────────

  /**
   * Toplu sıralama (drag-reorder): rollerin position'ını güncelle (OWNER/ADMIN).
   * @everyone rolü asla taşınmaz — items içinde gelse bile filtrelenir.
   * Geçerli rol yoksa null döner.
   */
  async reorderRoles(
    actorId: string,
    guildId: string,
    items: { id: string; position: number }[],
  ): Promise<null> {
    await this.requireManageRoles(actorId, guildId);

    const ids = items.map((i) => i.id);

    // @everyone filtrelenir (isEveryone: false şartı); hiyerarşi kontrolü de burada yapılır
    const validRoles = await this.prisma.role.findMany({
      where: { id: { in: ids }, guildId, isEveryone: false },
      select: { id: true, position: true },
    });
    if (validRoles.length === 0) return null;

    // Reorder: yalnız aktörün altındaki rolleri taşıyabilir (OWNER muaf)
    for (const r of validRoles) {
      await this.permissions.requireRoleHierarchy(actorId, guildId, r.position);
    }

    const validIdSet = new Set(validRoles.map((r) => r.id));
    const validItems = items.filter((i) => validIdSet.has(i.id));

    await this.prisma.$transaction(
      validItems.map((i) =>
        this.prisma.role.update({
          where: { id: i.id },
          data: { position: i.position },
        }),
      ),
    );

    // Realtime: güncel rolleri tüm guild üyelerine yay
    const updatedRoles = await this.prisma.role.findMany({
      where: { id: { in: validItems.map((i) => i.id) } },
    });
    const memberIds = await this.guildMemberIds(guildId);
    for (const role of updatedRoles) {
      const memberCount = await this.roleMemberCount(role.id);
      this.realtime.emitToUsers(memberIds, 'guild.role_updated', toRoleDto(role, memberCount));
    }

    return null;
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
