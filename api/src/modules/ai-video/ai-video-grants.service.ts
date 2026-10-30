import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiVideoGrant, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_CREDIT_MICRO_USD, fromCredits, toCredits } from './ai-video.mapper';
import { grantStatus, spentSinceMicro } from './ai-video-grant';
import { AiVideoGrantRowDto, UpsertAiVideoGrantDto } from './dto/ai-video-grant.dto';

const INT4_MAX = 2_147_483_647;

const USERS_INCLUDE = {
  user: { select: { id: true, username: true } },
  grantedBy: { select: { id: true, username: true } },
} as const;

type GrantWithUsers = AiVideoGrant & {
  user: { id: string; username: string };
  grantedBy: { id: string; username: string };
};

/**
 * C40 (R7) — admin hak yönetimi. Kapı `PlatformAdminGuard` (controller). Minöre hak verilemez.
 * Her yazma AuditLog. `note` yalnız admin yanıtlarında döner; kullanıcı yüzeylerine hiç girmez.
 */
@Injectable()
export class AiVideoGrantsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private creditMicro(): number {
    return this.config.get<number>('aiVideo.creditMicroUsd') ?? DEFAULT_CREDIT_MICRO_USD;
  }

  async list(): Promise<AiVideoGrantRowDto[]> {
    const rows = await this.prisma.aiVideoGrant.findMany({
      orderBy: { updatedAt: 'desc' },
      include: USERS_INCLUDE,
    });
    return Promise.all(rows.map((r) => this.toRow(r)));
  }

  async upsert(actorId: string, userId: string, dto: UpsertAiVideoGrantDto) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isMinor: true, deletedAt: true },
    });
    if (!target || target.deletedAt !== null) throw new NotFoundException('Kullanıcı bulunamadı.');
    if (target.isMinor) {
      throw new ForbiddenException({
        message: 'Reşit olmayan kullanıcıya yapay zeka erişimi verilemez.',
        error: 'MINOR_NOT_ALLOWED',
      });
    }
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        message: 'Bitiş tarihi gelecekte olmalı.',
        error: 'AI_VIDEO_GRANT_EXPIRY_PAST',
      });
    }
    const budgetMicroUsd = fromCredits(dto.budgetCredits, this.creditMicro());
    if (budgetMicroUsd > INT4_MAX) {
      throw new BadRequestException({
        message: 'Kredi çok büyük.',
        error: 'AI_VIDEO_GRANT_TOO_BIG',
      });
    }
    const note = dto.note ? dto.note : null;
    // Yeniden verme = yeni dönem: startsAt sıfırlanır (harcanan yeniden 0'dan sayılır), iptal kalkar.
    const data = {
      budgetMicroUsd,
      startsAt: new Date(),
      expiresAt,
      revokedAt: null,
      grantedById: actorId,
      note,
    };
    const saved = await this.prisma.aiVideoGrant.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      include: USERS_INCLUDE,
    });
    await this.audit(actorId, 'ai_video.grant', userId, {
      budgetCredits: dto.budgetCredits,
      expiresAt: expiresAt?.toISOString() ?? null,
      note,
    });
    return this.toRow(saved);
  }

  async revoke(actorId: string, userId: string): Promise<void> {
    const grant = await this.prisma.aiVideoGrant.findUnique({ where: { userId } });
    if (!grant) throw new NotFoundException('Erişim hakkı bulunamadı.');
    await this.prisma.aiVideoGrant.update({ where: { userId }, data: { revokedAt: new Date() } });
    await this.audit(actorId, 'ai_video.revoke', userId, {
      budgetCredits: toCredits(grant.budgetMicroUsd, this.creditMicro()),
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      note: grant.note,
    });
  }

  private audit(
    actorId: string,
    action: string,
    userId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entityType: 'user', entityId: userId, metadata: metadata },
    });
  }

  private async toRow(r: GrantWithUsers): Promise<AiVideoGrantRowDto> {
    const spentMicro = await spentSinceMicro(this.prisma, r.userId, r.startsAt);
    const credit = this.creditMicro();
    return {
      user: r.user,
      budgetCredits: toCredits(r.budgetMicroUsd, credit),
      spentCredits: toCredits(spentMicro, credit),
      startsAt: r.startsAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      status: grantStatus(r, spentMicro, new Date()),
      note: r.note,
      grantedBy: r.grantedBy,
    };
  }
}
