import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateActionDto, MediaTarget } from './dto/create-action.dto';

/**
 * Moderasyon kuyruk + aksiyon servisi (R7 — insan incelemesi zorunlu).
 *
 * Enforcement bağlantısı:
 *  BAN (global)  → mesaj gönderme + DM başlatma + arkadaş isteği → shared/ModerationService
 *  MUTE (scope)  → mesaj gönderme → shared/ModerationService
 *  KICK          → GuildMember sil (scope = guildId)
 *  CONTENT_REMOVE → hedef mesajı soft-delete (deletedAt)
 *  MEDIA_REMOVE  → avatar/afiş/ikon takedown (C8/R7); yalnız referans null (S3 objesi SİLİNMEZ)
 *  WARN / SHADOW_LIMIT → kayıt yaz, enforcement yok (SHADOW_LIMIT stub)
 */
@Injectable()
export class ModerationModuleService {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /moderation/queue
   * OPEN + TRIAGED raporlar, priority DESC + createdAt ASC.
   * CSAM raporunda ham içerik zaten saklanmıyor (contextSnapshot minimal) — güvenli.
   */
  async getQueue() {
    const reports = await this.prisma.report.findMany({
      where: { status: { in: ['OPEN', 'TRIAGED'] } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        description: true,
        status: true,
        priority: true,
        contextSnapshot: true,
        reporterId: true,
        createdAt: true,
      },
    });

    return reports.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      description: r.description,
      status: r.status,
      priority: r.priority,
      // CSAM raporu için "render etme, manuel escalate" notu
      csamFlag: r.reason === 'CSAM',
      // contextSnapshot: minimal referans (targetType/targetId/reason/reportedAt) — içerik yok
      contextSnapshot: r.contextSnapshot,
      reporterId: r.reporterId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * POST /moderation/actions
   * ModerationAction oluştur → enforcement (KICK/CONTENT_REMOVE anlık) + AuditLog yaz.
   * relatedReportId varsa report RESOLVED olarak işaretle.
   */
  async createAction(moderatorId: string, dto: CreateActionDto) {
    // C8/R7: MEDIA_REMOVE için mediaTarget zorunlu — kayıt/audit oluşturulmadan ÖNCE doğrula
    // (orphan ModerationAction/AuditLog kaydı bırakmamak için erken red).
    if (dto.type === 'MEDIA_REMOVE' && !dto.mediaTarget) {
      throw new BadRequestException({
        message: 'Medya kaldırma aksiyonu için hedef (mediaTarget) belirtilmelidir.',
        error: 'MEDIA_TARGET_REQUIRED',
      });
    }

    const expiresAt = dto.expiresInHours
      ? new Date(Date.now() + dto.expiresInHours * 60 * 60 * 1000)
      : null;

    // relatedReportId geçerliliği — varsa kontrol et
    if (dto.relatedReportId) {
      const report = await this.prisma.report.findUnique({
        where: { id: dto.relatedReportId },
      });
      if (!report) {
        throw new NotFoundException({
          message: 'İlgili rapor bulunamadı.',
          error: 'REPORT_NOT_FOUND',
        });
      }
    }

    // targetUser varlığı
    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.targetUserId, deletedAt: null },
    });
    if (!targetUser) {
      throw new NotFoundException({
        message: 'Hedef kullanıcı bulunamadı.',
        error: 'USER_NOT_FOUND',
      });
    }

    // Aksiyonu oluştur
    const action = await this.prisma.moderationAction.create({
      data: {
        moderatorId,
        targetUserId: dto.targetUserId,
        type: dto.type,
        scope: dto.scope ?? null,
        reason: dto.reason,
        relatedReportId: dto.relatedReportId ?? null,
        expiresAt,
      },
    });

    // AuditLog yaz
    await this.prisma.auditLog.create({
      data: {
        actorId: moderatorId,
        action: `moderation.${dto.type.toLowerCase()}`,
        entityType: 'ModerationAction',
        entityId: action.id,
        metadata: {
          targetUserId: dto.targetUserId,
          type: dto.type,
          scope: dto.scope ?? null,
          reason: dto.reason,
          relatedReportId: dto.relatedReportId ?? null,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
      },
    });

    // Enforcement: anlık aksiyonlar
    await this.applyInstantEnforcement(moderatorId, dto);

    // relatedReportId varsa raporu RESOLVED yap
    if (dto.relatedReportId) {
      await this.prisma.report.update({
        where: { id: dto.relatedReportId },
        data: {
          status: 'RESOLVED',
          resolvedById: moderatorId,
          resolvedAt: new Date(),
        },
      });
    }

    return { id: action.id, type: action.type };
  }

  /**
   * Anlık enforcement: KICK (GuildMember sil), CONTENT_REMOVE (mesaj soft-delete).
   * BAN/MUTE → lazy enforcement (her istek sırasında shared/ModerationService okur).
   * WARN/SHADOW_LIMIT → yalnızca kayıt (SHADOW_LIMIT stub).
   */
  private async applyInstantEnforcement(moderatorId: string, dto: CreateActionDto) {
    switch (dto.type) {
      case 'KICK': {
        if (!dto.scope) {
          throw new BadRequestException({
            message: 'KICK aksiyonu için guildId (scope) gereklidir.',
            error: 'SCOPE_REQUIRED',
          });
        }
        // GuildMember kaydını sil
        const membership = await this.prisma.guildMember.findUnique({
          where: { guildId_userId: { guildId: dto.scope, userId: dto.targetUserId } },
        });
        if (membership) {
          await this.prisma.guildMember.delete({
            where: { id: membership.id },
          });
        }
        break;
      }

      case 'CONTENT_REMOVE': {
        // scope = messageId (CONTENT_REMOVE konvansiyonu: scope alana messageId yazılır)
        if (dto.scope) {
          const msg = await this.prisma.message.findUnique({ where: { id: dto.scope } });
          if (msg && msg.authorId === dto.targetUserId) {
            await this.prisma.message.update({
              where: { id: dto.scope },
              data: { deletedAt: new Date() },
            });
          }
        }
        break;
      }

      // C8/R7: MEDIA_REMOVE — avatar/afiş/ikon takedown. Yalnız REFERANSI düşürür;
      // S3 objesi SİLİNMEZ (fiziksel silme/kanıt-saklama A2/hukuk kapsamında; obje D13 orphan
      // temizliğine kalır). mediaTarget zorunluluğu createAction başında doğrulandı.
      case 'MEDIA_REMOVE': {
        switch (dto.mediaTarget) {
          case MediaTarget.USER_AVATAR:
            await this.prisma.user.update({
              where: { id: dto.targetUserId },
              // C13 (R7): hareketli adres de düşer — yoksa takedown sonrası animasyon yayında kalır.
              data: { avatarUrl: null, avatarAnimatedUrl: null },
            });
            break;

          case MediaTarget.USER_BANNER:
            await this.prisma.user.update({
              where: { id: dto.targetUserId },
              data: { bannerUrl: null, bannerAnimatedUrl: null },
            });
            break;

          case MediaTarget.GUILD_BANNER: {
            if (!dto.scope) {
              throw new BadRequestException({
                message: 'GUILD_BANNER hedefi için scope (guildId) gereklidir.',
                error: 'SCOPE_REQUIRED',
              });
            }
            await this.prisma.guild.update({
              where: { id: dto.scope },
              // C19 (R7): hareketli afiş de düşer, yoksa takedown sonrası animasyon yayında kalır.
              data: { bannerUrl: null, bannerAnimatedUrl: null },
            });
            break;
          }

          case MediaTarget.GUILD_ICON: {
            if (!dto.scope) {
              throw new BadRequestException({
                message: 'GUILD_ICON hedefi için scope (guildId) gereklidir.',
                error: 'SCOPE_REQUIRED',
              });
            }
            await this.prisma.guild.update({
              where: { id: dto.scope },
              // C19 (R7): hareketli simge de düşer.
              data: { iconUrl: null, iconAnimatedUrl: null },
            });
            break;
          }
        }
        break;
      }

      // BAN, MUTE → lazy enforcement (shared/ModerationService.hasActiveBan/hasActiveMute okur)
      // WARN, SHADOW_LIMIT → yalnız kayıt; SHADOW_LIMIT enforcement stub
      case 'BAN':
      case 'MUTE':
      case 'WARN':
      case 'SHADOW_LIMIT':
      default:
        break;
    }
  }

  /**
   * GET /audit
   * AuditLog listesi, yeni→eski.
   */
  async getAuditLog() {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    });

    return logs.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
    }));
  }
}
