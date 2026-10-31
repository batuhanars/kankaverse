import { AiVideoGrant, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sumSpentMicro } from './ai-video.mapper';

/** Sorgu istemcisi: normal bağlantı ya da transaction (C43: bütçe kapısı kilit transaction'ında çalışır). */
export type AiVideoDb = PrismaService | Prisma.TransactionClient;

/** C40: etkin hak + harcanan/kalan (mikro-USD). */
export type ActiveAiVideoGrant = {
  grant: AiVideoGrant;
  spentMicro: number;
  remainingMicro: number;
};

/**
 * Hakkın harcananı = kullanıcının `startsAt` SONRASINDAKİ üretimlerinin kesinleşmiş (costMicroUsd) ya da
 * rezerve (teklif) toplamı. `sumSpentMicro` kuralı (FAILED ve QUOTED sayılmaz).
 */
export async function spentSinceMicro(
  prisma: AiVideoDb,
  userId: string,
  since: Date,
): Promise<number> {
  const rows = await prisma.aiVideoGeneration.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { status: true, costMicroUsd: true, quoteMicroUsd: true },
  });
  return sumSpentMicro(rows);
}

/** Hak durumu etiketi (admin listesi): iptal > süresi doldu > bitti > etkin. */
export function grantStatus(
  grant: Pick<AiVideoGrant, 'revokedAt' | 'expiresAt' | 'budgetMicroUsd'>,
  spentMicro: number,
  now: Date,
): 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED' {
  if (grant.revokedAt !== null) return 'REVOKED';
  if (grant.expiresAt !== null && grant.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (spentMicro >= grant.budgetMicroUsd) return 'EXHAUSTED';
  return 'ACTIVE';
}

/**
 * C43 (R7): kapı, bütçe ve gösterim için TEK kural (env açık listesi kalktı; hak yoksa erişim yok).
 * Etkin hak: kayıt var, iptal edilmemiş, süresi dolmamış, harcanan < bütçe. Yoksa null.
 * İptal/süre dolumu DB'ye gitmeden elenir (harcama sorgusu yalnız canlı hak için).
 */
export async function findActiveAiVideoGrant(
  prisma: AiVideoDb,
  userId: string,
  now = new Date(),
): Promise<ActiveAiVideoGrant | null> {
  const grant = await prisma.aiVideoGrant.findUnique({ where: { userId } });
  if (!grant || grant.revokedAt !== null) return null;
  if (grant.expiresAt !== null && grant.expiresAt.getTime() <= now.getTime()) return null;
  const spentMicro = await spentSinceMicro(prisma, userId, grant.startsAt);
  const remainingMicro = grant.budgetMicroUsd - spentMicro;
  if (remainingMicro <= 0) return null;
  return { grant, spentMicro, remainingMicro };
}
