import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionFlag, filterKnownPermissions } from '../../common/permissions';

/**
 * Guild izin çözümü — tek yetki kaynağı (Faz 3, R7-AĞIR).
 *
 * hasGuildPermission(userId, guildId, flag) adımları:
 *  1. Üye değil → false (fail-closed).
 *  2. guild.ownerId === userId VEYA membership.role === 'OWNER' → true.
 *  3. membership.role === 'ADMIN' (enum geçiş-uyum) → true.
 *  4. Efektif izinler = @everyone izinleri ∪ üyenin atanmış rollerinin izinleri.
 *     ADMINISTRATOR bayrağı efektif kümede → true. Aksi hâlde flag ∈ efektif.
 *
 * Hiyerarşi yardımcıları (§70-74):
 *  - actorHighestPosition(actorId, guildId): üyenin atanmış rollerinin max position (OWNER=∞/muaf).
 *  - requireRoleHierarchy:  hedef rol < aktör; sadece OWNER muaf.
 *  - requireMemberHierarchy: hedef üye < aktör; OWNER asla hedef; sadece OWNER muaf.
 *
 * Dokunulmaz: yaş/adultsOnly/CSAM kapıları bu servisi devre dışı bırakmaz;
 * MembershipService.requireChannelAccess korunur.
 */
@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Aktörün efektif izin kümesi + tam-yetki bayrağı.
   *  - `all: true` → OWNER / enum-ADMIN (geçiş-uyum) / ADMINISTRATOR bayrağı: her izne sahip.
   *  - `all: false` → `flags` = @everyone ∪ atanmış rollerin bilinen bayrakları.
   * Fail-closed: guild/membership yok → `{ all: false, flags: boş }`.
   * `hasGuildPermission` ve "veremezsin" guard'ı (F1) bu tek kaynaktan türetilir (DRY).
   */
  async effectivePermissions(
    userId: string,
    guildId: string,
  ): Promise<{ all: boolean; flags: Set<PermissionFlag> }> {
    const empty = { all: false, flags: new Set<PermissionFlag>() };

    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId, deletedAt: null },
      select: { ownerId: true },
    });
    if (!guild) return empty;

    const membership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: {
        role: true,
        roleLinks: { select: { role: { select: { permissions: true } } } },
      },
    });
    if (!membership) return empty;

    // OWNER (ownerId veya enum) + enum-ADMIN (geçiş-uyum) → tam yetki
    if (guild.ownerId === userId || membership.role === 'OWNER' || membership.role === 'ADMIN') {
      return { all: true, flags: new Set<PermissionFlag>() };
    }

    // @everyone ∪ atanmış roller
    const everyoneRole = await this.prisma.role.findFirst({
      where: { guildId, isEveryone: true },
      select: { permissions: true },
    });
    const everyonePerms = everyoneRole?.permissions ?? [];
    const assignedPerms = membership.roleLinks.flatMap((rl) => rl.role.permissions);

    const flags = new Set<PermissionFlag>([
      ...filterKnownPermissions(everyonePerms),
      ...filterKnownPermissions(assignedPerms),
    ]);

    // ADMINISTRATOR bayrağı → tam yetki
    if (flags.has('ADMINISTRATOR')) return { all: true, flags };

    return { all: false, flags };
  }

  /**
   * Efektif izin çözümü. Fail-closed: üye-değil/hata → false (exception fırlatmaz).
   */
  async hasGuildPermission(
    userId: string,
    guildId: string,
    flag: PermissionFlag,
  ): Promise<boolean> {
    const { all, flags } = await this.effectivePermissions(userId, guildId);
    return all || flags.has(flag);
  }

  // ─── Hiyerarşi yardımcıları ─────────────────────────────────────────────────

  /**
   * Üyenin hiyerarşi sıralamasındaki konumu.
   *  - OWNER → Infinity (hiyerarşi kontrolünden tamamen muaf).
   *  - enum-ADMIN → Number.MAX_SAFE_INTEGER (geçiş-uyum, §70): tüm MEMBER+rollerin üstünde
   *    ama OWNER'ın altında; ADMIN-vs-ADMIN beraberliği (>=) "yönetici yöneticiyi yönetemez"
   *    eski davranışını korur.
   *  - MEMBER → atanmış rollerin max position (yoksa 0 = @everyone seviyesi).
   *  - Üye değil → -1 (hiyerarşi dışı).
   */
  async actorHighestPosition(userId: string, guildId: string): Promise<number> {
    const membership = await this.prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: {
        role: true,
        roleLinks: {
          select: { role: { select: { position: true } } },
        },
      },
    });

    if (!membership) return -1; // üye değil — hiyerarşi dışı

    if (membership.role === 'OWNER') return Infinity;

    if (membership.role === 'ADMIN') return Number.MAX_SAFE_INTEGER; // enum geçiş-uyum muaf

    if (membership.roleLinks.length === 0) return 0;

    return Math.max(...membership.roleLinks.map((rl) => rl.role.position));
  }

  /**
   * Rol yönet hiyerarşisi (düzenle/sil/ata/sırala): hedef rolün position'ı < aktörün en yükseği.
   * OWNER muaf; ADMINISTRATOR bayrağı hiyerarşiyi DELMEZ.
   * İhlal → 403 ROLE_HIERARCHY.
   */
  async requireRoleHierarchy(
    actorId: string,
    guildId: string,
    targetRolePosition: number,
  ): Promise<void> {
    const actorPos = await this.actorHighestPosition(actorId, guildId);
    if (actorPos === Infinity) return; // OWNER muaf

    if (targetRolePosition >= actorPos) {
      throw new ForbiddenException({
        message: 'Bu rolü yönetmek için yeterli hiyerarşiniz yok.',
        error: 'ROLE_HIERARCHY',
      });
    }
  }

  /**
   * Üye aksiyonu hiyerarşisi (kick/ban/rol-ata): hedef üyenin en yüksek position'ı < aktörünki.
   * OWNER asla hedef alınamaz; OWNER muaf.
   * İhlal → 403 MEMBER_HIERARCHY.
   */
  async requireMemberHierarchy(
    actorId: string,
    guildId: string,
    targetUserId: string,
  ): Promise<void> {
    const targetPos = await this.actorHighestPosition(targetUserId, guildId);
    const actorPos = await this.actorHighestPosition(actorId, guildId);

    if (actorPos === Infinity) return; // OWNER muaf

    // OWNER asla hedef alınamaz (Infinity position)
    if (targetPos === Infinity) {
      throw new ForbiddenException({
        message: 'Ortam sahibine bu aksiyonu uygulayamazsınız.',
        error: 'MEMBER_HIERARCHY',
      });
    }

    if (targetPos >= actorPos) {
      throw new ForbiddenException({
        message: 'Bu üyeye aksiyon uygulamak için yeterli hiyerarşiniz yok.',
        error: 'MEMBER_HIERARCHY',
      });
    }
  }
}
