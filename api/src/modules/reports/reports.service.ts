import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportReason } from '@prisma/client';

/**
 * KURUL §0 — contextSnapshot minimal referans:
 *   { targetType, targetId, reason, reportedAt }
 *   Kullanıcı içeriği/kanıt YAKALANMAZ. Gerçek kanıt-yakalama hukuk sonrası.
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
  constructor(private prisma: PrismaService) {}

  async create(reporterId: string, dto: CreateReportDto) {
    const priority = calcPriority(dto.reason);

    // §0 KURUL: contextSnapshot = YALNIZCA minimal referans — içerik yok
    const contextSnapshot: Record<string, string> = {
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason,
      reportedAt: new Date().toISOString(),
    };

    // C35 §5.1: webhook mesajı raporu webhook kimliğini ve SORUMLU üyeyi (oluşturan) taşır; moderatör
    // "webhook mesajı, sorumlu: X" görür. İçerik yakalanmaz (KURUL §0 değişmedi), yalnız iki referans.
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
      },
      select: { id: true, status: true, priority: true, createdAt: true },
    });

    // Kullanıcıya jenerik yanıt — içerik/karar bilgisi yok
    return { id: report.id };
  }
}
