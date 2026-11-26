import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { E2EE_EVICT_IDLE_DAYS } from './e2ee.constants';
import { deviceRevokeOps } from './e2ee-revocation.service';

const DAY_MS = 24 * 60 * 60 * 1000;

type ActivityRow = {
  id: string;
  tokenFamily: string | null;
  lastSeenAt: Date;
  parkedAt: Date | null;
};

/**
 * C79 §1 — cihazın son kullanımı. `lastSeenAt` uygulama açılışında, oturumun `lastActiveAt`'i her token
 * yenilemesinde güncellenir; ikisinin büyüğü alınır. Park cihazın ailesi yoktur, `parkedAt` sayılır.
 */
export async function activityByDevice(
  prisma: PrismaService,
  userId: string,
  rows: ActivityRow[],
): Promise<Map<string, Date>> {
  const families = rows.map((r) => r.tokenFamily).filter((f): f is string => f !== null);
  const live = families.length
    ? await prisma.session.groupBy({
        by: ['tokenFamily'],
        where: { userId, revokedAt: null, tokenFamily: { in: families } },
        _max: { lastActiveAt: true },
      })
    : [];
  const byFamily = new Map(live.map((s) => [s.tokenFamily, s._max.lastActiveAt]));
  const out = new Map<string, Date>();
  for (const r of rows) {
    const other = r.tokenFamily ? byFamily.get(r.tokenFamily) : r.parkedAt;
    out.set(r.id, other && other > r.lastSeenAt ? other : r.lastSeenAt);
  }
  return out;
}

export type EvictionCandidate = {
  id: string;
  tokenFamily: string | null;
  platform: string;
  label: string | null;
  activityAt: Date;
};

/**
 * 🔴 R7 — C79 §2.1: sınır doluyken çıkarılabilecek cihaz. Yalnız `E2EE_EVICT_IDLE_DAYS` gündür kullanılmamış
 * olanlar aday olur; içlerinden en eskisi seçilir. Aday yoksa null (çağıran 422 döner, hiçbir şey değişmez).
 */
export async function findEvictable(
  prisma: PrismaService,
  userId: string,
  now: Date,
): Promise<EvictionCandidate | null> {
  const rows = await prisma.e2eeDevice.findMany({
    where: { userId, revokedAt: null },
    select: {
      id: true,
      tokenFamily: true,
      platform: true,
      label: true,
      lastSeenAt: true,
      parkedAt: true,
    },
  });
  const activity = await activityByDevice(prisma, userId, rows);
  const cutoff = now.getTime() - E2EE_EVICT_IDLE_DAYS * DAY_MS;
  let pick: EvictionCandidate | null = null;
  for (const r of rows) {
    const at = activity.get(r.id) as Date;
    if (at.getTime() > cutoff) continue;
    if (!pick || at < pick.activityAt) {
      pick = {
        id: r.id,
        tokenFamily: r.tokenFamily,
        platform: r.platform,
        label: r.label,
        activityAt: at,
      };
    }
  }
  return pick;
}

/**
 * Çıkarma işlemleri (yeni cihaz kaydıyla AYNI transaction'a eklenir): adayın ailesinin açık oturumları kapanır
 * (o kurulum açılırsa giriş ekranına düşer), cihaz iptal edilir, denetim kaydı yazılır.
 */
export function evictionOps(
  prisma: PrismaService,
  userId: string,
  victim: EvictionCandidate,
): Prisma.PrismaPromise<unknown>[] {
  const now = new Date();
  return [
    ...(victim.tokenFamily
      ? [
          prisma.session.updateMany({
            where: { userId, tokenFamily: victim.tokenFamily, revokedAt: null },
            data: { revokedAt: now },
          }),
        ]
      : []),
    ...deviceRevokeOps(prisma, { id: victim.id, userId }),
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'e2ee.device.evict',
        entityType: 'E2eeDevice',
        entityId: victim.id,
      },
    }),
  ];
}
