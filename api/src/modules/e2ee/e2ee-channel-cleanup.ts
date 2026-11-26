import { Prisma } from '@prisma/client';

/**
 * 🔴 R7 — C77 §1: kanal soft-delete kuralı tek yerde. Kanal `deletedAt` alırken o kanalın TESLİM EDİLMEMİŞ
 * Welcome'ları AYNI işlemde silinir. Neden: silinmiş kanalın Welcome'ı sunucuda kalırsa istemci onu işlerken
 * kanal durumunu ister, 404 alır ve bekleyen diğer Welcome'lar (gerçek sohbetler) işlenemez (2026-11-26 bulgusu).
 * Teslim edilmiş Welcome'lara dokunulmaz (geçmiş kaydı). Sıra önemsiz; ikisi de aynı transaction'da.
 *
 * Dizi transaction'ında `...channelSoftDeleteOps(this.prisma, id)`; etkileşimli transaction'da
 * `softDeleteChannelInTx(tx, id)`.
 */
export function channelSoftDeleteOps(
  db: Prisma.TransactionClient,
  channelId: string,
): Prisma.PrismaPromise<unknown>[] {
  return [
    db.channel.update({ where: { id: channelId }, data: { deletedAt: new Date() } }),
    db.e2eeWelcome.deleteMany({ where: { channelId, deliveredAt: null } }),
  ];
}

/** Etkileşimli transaction içinde (istek reddi gibi) kanalı soft-delete eder + bekleyen Welcome'ları siler. */
export async function softDeleteChannelInTx(
  tx: Prisma.TransactionClient,
  channelId: string,
): Promise<void> {
  for (const op of channelSoftDeleteOps(tx, channelId)) await op;
}
