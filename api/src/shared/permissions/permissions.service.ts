import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionFlag, filterKnownPermissions } from '../../common/permissions';

/**
 * Guild izin çözümü — tek yetki kaynağı (Faz 3, R7-AĞIR).
 *
 * R20 (Sprint R20, 2026-08-11): enum `ADMIN` katmanı KALDIRILDI — bir kullanıcıyı tam yetkili
 * yapmanın tek yolu artık rol sistemi (`ADMINISTRATOR` bayraklı rol atamak). `GuildRole` enum'u
 * yalnız `OWNER | MEMBER` içerir; "yönetici mi" sorusu yerine "şu izne sahip mi" sorulur.
 *
 * hasGuildPermission(userId, guildId, flag) adımları:
 *  1. Üye değil → false (fail-closed).
 *  2. guild.ownerId === userId VEYA membership.role === 'OWNER' → true.
 *  3. Efektif izinler = @everyone izinleri ∪ üyenin atanmış rollerinin izinleri.
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
   *  - `all: true` → OWNER / ADMINISTRATOR bayrağı: her izne sahip.
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

    // OWNER (ownerId veya enum) → tam yetki
    if (guild.ownerId === userId || membership.role === 'OWNER') {
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

  /**
   * R20 — tek-kullanıcı "tam yetkili mi" sorusu (OWNER veya ADMINISTRATOR bayraklı rol).
   * Kaldırılan enum-ADMIN kısa devresinin yerini alan tek doğruluk kaynağı: eskiden
   * `membership.role === 'OWNER' || membership.role === 'ADMIN'` diye sorulan her yerde bunun
   * yerine bu metot çağrılır (slow-mode muafiyeti, özel kanal erişimi, üye listesi/arama
   * görünürlüğü gibi "yönetici mi" sorularının hepsi aynı kurala bağlanır — kopya mantık yok).
   */
  async hasFullAccess(userId: string, guildId: string): Promise<boolean> {
    return (await this.effectivePermissions(userId, guildId)).all;
  }

  /**
   * R20 — TOPLU "tam yetkili mi" sorusu: guild'in TÜM üyeleri için tek sorgu setiyle hesaplar.
   * `hasFullAccess`'i üye sayısı kadar çağırmak (N+1) yerine broadcast/görünürlük hesaplarında
   * (özel kanal locked yayını, @everyone/rol bahsetmesi alıcı kümesi) bu kullanılır.
   * Aynı kural: guild.ownerId === userId VEYA role === 'OWNER' VEYA ADMINISTRATOR ∈
   * (@everyone izinleri ∪ atanmış rollerin izinleri) — `effectivePermissions` ile birebir.
   */
  async guildPrivilegedUserIds(guildId: string): Promise<Set<string>> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId, deletedAt: null },
      select: { ownerId: true },
    });
    if (!guild) return new Set();

    const everyoneRole = await this.prisma.role.findFirst({
      where: { guildId, isEveryone: true },
      select: { permissions: true },
    });
    const everyoneHasAdministrator = (everyoneRole?.permissions ?? []).includes('ADMINISTRATOR');

    const members = await this.prisma.guildMember.findMany({
      where: { guildId },
      select: {
        userId: true,
        role: true,
        roleLinks: { select: { role: { select: { permissions: true } } } },
      },
    });

    const privileged = new Set<string>();
    for (const m of members) {
      if (m.userId === guild.ownerId || m.role === 'OWNER' || everyoneHasAdministrator) {
        privileged.add(m.userId);
        continue;
      }
      const hasAdministrator = m.roleLinks.some((rl) =>
        rl.role.permissions.includes('ADMINISTRATOR'),
      );
      if (hasAdministrator) privileged.add(m.userId);
    }
    return privileged;
  }

  // ─── Hiyerarşi yardımcıları ─────────────────────────────────────────────────

  /**
   * Üyenin hiyerarşi sıralamasındaki konumu.
   *  - OWNER → Infinity (hiyerarşi kontrolünden tamamen muaf).
   *  - MEMBER → atanmış rollerin max position (yoksa 0 = @everyone seviyesi). R20 sonrası
   *    ADMINISTRATOR bayraklı bir rol de bu yoldan geçer: rolün `position`'ı hiyerarşiyi belirler,
   *    bayrak hiyerarşiyi DELMEZ (yalnız izin kontrolünü geçer — requireRoleHierarchy/
   *    requireMemberHierarchy hâlâ rol sıralamasına bakar).
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
