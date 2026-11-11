import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportReason } from '@prisma/client';
import { EvidenceRow, ReportEvidenceService } from './report-evidence.service';

/**
 * contextSnapshot minimal referans (içerik burada TUTULMAZ):
 *   { targetType, targetId, reason, reportedAt }
 * E4 (sahip kararı 2026-11-11): mesaj şikâyetinde kanıt (hedef + önceki 5 mesaj) `ReportEvidence`
 * satırlarında saklanır; şikâyet kapanınca 90 gün sonra silinir (`ReportEvidenceService`).
 *
 * Priority hesabı (R7):
 *   CSAM / MINOR_SAFETY → 100 (en yüksek — dakikalar içinde insan incelemesi)
 *   VIOLENCE / SELF_HARM → 50
 *   diğer (SPAM, HARASSMENT, OTHER) → 0
 */
function calcPriority(reason: ReportReason): number {
  switch (reason) {
    case 'CSAM':
    case 'MINOR_SAFETY':
      return 100;
    case 'VIOLENCE':
    case 'SELF_HARM':
      return 50;
    default:
      return 0;
  }
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private evidenceService: ReportEvidenceService,
  ) {}

  async create(reporterId: string, dto: CreateReportDto) {
    const priority = calcPriority(dto.reason);

    // contextSnapshot = YALNIZCA minimal referans — içerik `ReportEvidence`'ta
    const contextSnapshot: Record<string, string> = {
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason,
      reportedAt: new Date().toISOString(),
    };

    // C35 §5.1: webhook mesajı raporu webhook kimliğini ve SORUMLU üyeyi (oluşturan) taşır; moderatör
    // "webhook mesajı, sorumlu: X" görür. Snapshot'a içerik girmez, yalnız iki referans.
    if (dto.targetType === 'MESSAGE') {
      const target = await this.prisma.message.findUnique({
        where: { id: dto.targetId },
        select: { webhookId: true, authorId: true },
      });
      if (target?.webhookId) {
        contextSnapshot.webhookId = target.webhookId;
        contextSnapshot.responsibleUserId = target.authorId;
      }
    }

    // E4: kanıt, rapor ile TEK yazımda (iç içe create → tek transaction); doğrulama hatası raporu da düşürür.
    // Önceliklendirme (calcPriority) kanıttan etkilenmez.
    const evidence: EvidenceRow[] =
      dto.targetType === 'MESSAGE'
        ? await this.evidenceService.build(reporterId, dto.targetId, dto.evidence)
        : [];

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        description: dto.description ?? null,
        status: 'OPEN',
        priority,
        contextSnapshot,
        ...(evidence.length > 0 ? { evidence: { create: evidence } } : {}),
      },
      select: { id: true, status: true, priority: true, createdAt: true },
    });

    // Kullanıcıya jenerik yanıt — içerik/karar bilgisi yok
    return { id: report.id };
  }
}
