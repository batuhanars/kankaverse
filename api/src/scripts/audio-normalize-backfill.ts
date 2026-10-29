import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import configuration from '../config/configuration';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AudioNormalizeService } from '../shared/media/audio-normalize.service';
import { StorageService } from '../shared/storage/storage.service';

/**
 * C32 — geriye dönük ses seviyesi eşitleme. Tüm uygulamayı (gateway, cron) KALDIRMAZ: yalnız
 * config + Prisma + storage + eşitleme servisi. Idempotent (audioNormalizedAt dolu olan atlanır).
 * Kullanım: node dist/src/scripts/audio-normalize-backfill.js [--dry-run]
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), PrismaModule],
  providers: [StorageService, AudioNormalizeService],
})
class BackfillModule {}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(BackfillModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const service = app.get(AudioNormalizeService);
    const rows = await prisma.attachment.findMany({
      where: {
        contentType: { in: ['audio/mp4', 'audio/webm', 'audio/mpeg'] },
        scanStatus: 'CLEAN',
        messageId: { not: null },
        audioNormalizedAt: null,
        message: { deletedAt: null },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`Aday ek sayısı: ${rows.length}`);
    if (dryRun) return;

    const counts = { processed: 0, skipped: 0, failed: 0 };
    for (const [i, row] of rows.entries()) {
      counts[await service.normalize(row.id)]++;
      if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${rows.length}`);
    }
    console.log(
      `Islenen: ${counts.processed} / Atlanan: ${counts.skipped} / Hatali: ${counts.failed}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
