/**
 * Tek seferlik backfill: mevcut kullanıcıların 8-char friendCode'larını
 * benzersiz 6-char koda yeniler.
 *
 * Çalıştır:
 *   cd api
 *   npx ts-node prisma/regenerate-friend-codes.ts
 *
 * Not: Prisma v7 driver-adapter tabanlı çalışır; PrismaPg adapter'ı kullanıyoruz
 * (PrismaService ile aynı kurulum).
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomBytes } from 'crypto';

const BASE32_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateFriendCode(): string {
  const bytes = randomBytes(4);
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_CHARS[(value >> bits) & 0x1f];
    }
  }
  return result.padEnd(6, BASE32_CHARS[0]).slice(0, 6);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.findMany({
      select: { id: true, friendCode: true },
      where: { deletedAt: null },
    });

    console.log(`Toplam kullanıcı: ${users.length}`);

    const usedCodes = new Set<string>();
    let updated = 0;
    let skipped = 0;

    for (const user of users) {
      // Zaten 6-char ise atla
      if (user.friendCode && user.friendCode.length === 6) {
        usedCodes.add(user.friendCode);
        skipped++;
        continue;
      }

      // Benzersiz 6-char kod üret
      let newCode: string;
      let attempts = 0;
      do {
        newCode = generateFriendCode();
        attempts++;
        if (attempts > 1000) {
          throw new Error('Benzersiz kod üretilemedi (1000 deneme aşıldı).');
        }
      } while (usedCodes.has(newCode));

      usedCodes.add(newCode);

      await prisma.user.update({
        where: { id: user.id },
        data: { friendCode: newCode },
      });

      updated++;
    }

    console.log(`Güncellenen: ${updated} kullanıcı`);
    console.log(`Zaten 6-char (atlandı): ${skipped} kullanıcı`);
    console.log('Backfill tamamlandı.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Backfill hatası:', err);
  process.exit(1);
});
