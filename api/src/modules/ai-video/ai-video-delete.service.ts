import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiVideoGeneration } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import { ACTIVE_STATUSES, AiVideoError } from './ai-video.constants';
import { AI_VIDEO_MESSAGES } from './ai-video.mapper';
import { PikaClient } from './pika.client';

/**
 * C14c §2 silme: çıktı/girdi objeleri + Pika işi silinir, satır YUMUŞAK silinir (deletedAt); harcama kaydı ve
 * tavan hesabı için satır kalır. Obje/Pika silme hataları loglanır, işlemi düşürmez.
 */
@Injectable()
export class AiVideoDeleteService {
  private readonly logger = new Logger(AiVideoDeleteService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private pika: PikaClient,
  ) {}

  async deleteOne(userId: string, id: string): Promise<void> {
    const row = await this.prisma.aiVideoGeneration.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Üretim bulunamadı.');
    if (ACTIVE_STATUSES.includes(row.status)) {
      throw new ConflictException({
        message: AI_VIDEO_MESSAGES[AiVideoError.BUSY],
        error: AiVideoError.BUSY,
      });
    }
    await this.purge(row);
  }

  async deleteAll(userId: string): Promise<{ deleted: number }> {
    const rows = await this.prisma.aiVideoGeneration.findMany({
      where: { userId, deletedAt: null, status: { notIn: ACTIVE_STATUSES } },
    });
    for (const row of rows) await this.purge(row);
    return { deleted: rows.length };
  }

  private async purge(row: AiVideoGeneration): Promise<void> {
    this.pika.discardPartial(row.id);
    await this.safely(`çıktı objesi id=${row.id}`, row.outputKey, (k) => this.storage.delete(k));
    await this.safely(`girdi objesi id=${row.id}`, row.inputKey, (k) => this.storage.delete(k));
    await this.safely(`Pika işi id=${row.id}`, row.providerJobId, (j) => this.pika.deleteJob(j));
    await this.prisma.aiVideoGeneration.update({
      where: { id: row.id },
      data: { outputKey: null, deletedAt: new Date() },
    });
  }

  private async safely(
    what: string,
    arg: string | null,
    fn: (a: string) => Promise<void>,
  ): Promise<void> {
    if (arg === null) return;
    try {
      await fn(arg);
    } catch (err) {
      this.logger.warn(`silinemedi (${what}): ${(err as Error).message}`);
    }
  }
}
