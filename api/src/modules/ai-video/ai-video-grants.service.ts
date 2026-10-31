import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiVideoGrant, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_CREDIT_MICRO_USD, fromCredits, toCredits } from './ai-video.mapper';
import { grantStatus, lockAiVideoUser, spentSinceMicro } from './ai-video-grant';
import { ACTIVE_STATUSES } from './ai-video.constants';
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

  /** C45: etkin (iptal/süre dolumu/bitti hariç) hakların kalan bütçesi toplamı, mikro-USD. */
  async outstandingMicro(): Promise<number> {
    const now = new Date();
    const grants = await this.prisma.aiVideoGrant.findMany({
      where: { revokedAt: null },
      select: {
        userId: true,
        startsAt: true,
        expiresAt: true,
        revokedAt: true,
        budgetMicroUsd: true,
      },
    });
    const left = await Promise.all(
      grants.map(async (g) => {
        const spent = await spentSinceMicro(this.prisma, g.userId, g.startsAt);
        return grantStatus(g, spent, now) === 'ACTIVE' ? Math.max(0, g.budgetMicroUsd - spent) : 0;
      }),
    );
    return left.reduce((a, b) => a + b, 0);
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
    const enteredMicro = fromCredits(dto.budgetCredits, this.creditMicro());
    const note = dto.note ? dto.note : null;
    const { saved, carriedMicro } = await this.prisma.$transaction(async (tx) => {
      // C44: devir hesabı kullanıcıya özgü kilit altında (süren üretimin rezervi kaçmasın)
      await lockAiVideoUser(tx, userId);
      const existing = await tx.aiVideoGrant.findUnique({ where: { userId } });
      let carried = 0;
      if (existing) {
        const active = await tx.aiVideoGeneration.findFirst({
          where: { userId, status: { in: ACTIVE_STATUSES } },
          select: { id: true },
        });
        if (active) {
          throw new ConflictException({
            message: 'Kullanıcının süren bir üretimi var. Bitince yenile.',
            error: 'AI_VIDEO_GRANT_RENEW_BUSY',
          });
        }
        // Kalan = bütçe - kullanılan (`spentSinceMicro`, kapı ile aynı kural); iptal edilmiş hak devretmez.
        if (existing.revokedAt === null) {
          const spent = await spentSinceMicro(tx, userId, existing.startsAt);
          carried = Math.max(0, existing.budgetMicroUsd - spent);
        }
      }
      const budgetMicroUsd = enteredMicro + carried;
      if (budgetMicroUsd > INT4_MAX) {
        throw new BadRequestException({
          message: 'Kredi çok büyük.',
          error: 'AI_VIDEO_GRANT_TOO_BIG',
        });
      }
      // Yeniden verme = yeni dönem: startsAt sıfırlanır (harcanan yeniden 0'dan sayılır), iptal kalkar.
      const data = {
        budgetMicroUsd,
        startsAt: new Date(),
        expiresAt,
        revokedAt: null,
        grantedById: actorId,
        note,
      };
      const row = await tx.aiVideoGrant.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
        include: USERS_INCLUDE,
      });
      return { saved: row, carriedMicro: carried };
    });
    await this.audit(actorId, 'ai_video.grant', userId, {
      budgetCredits: dto.budgetCredits,
      carriedCredits: toCredits(carriedMicro, this.creditMicro()),
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
      remainingCredits: toCredits(Math.max(0, r.budgetMicroUsd - spentMicro), credit),
      startsAt: r.startsAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      status: grantStatus(r, spentMicro, new Date()),
      note: r.note,
      grantedBy: r.grantedBy,
    };
  }
}
