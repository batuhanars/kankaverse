import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { RebindDto } from './dto/e2ee.dto';
import {
  E2EE_REBIND_NONCE_BYTES,
  E2EE_REBIND_NONCE_TTL_MS,
  E2EE_SIGNATURE_BYTES,
} from './e2ee.constants';
import { e2eeError, fromB64, toB64 } from './e2ee.util';
import { rebindMessage, verifyEd25519 } from './e2ee-rebind.util';

const rejected = () =>
  e2eeError(HttpStatus.FORBIDDEN, 'Bu cihaz yeniden bağlanamadı.', 'E2EE_REBIND_REJECTED');
const nonceInvalid = () =>
  e2eeError(
    HttpStatus.BAD_REQUEST,
    'Doğrulama değeri geçersiz ya da süresi dolmuş.',
    'E2EE_REBIND_NONCE_INVALID',
  );

/**
 * 🔴 R7 — C69: park edilmiş (çıkış yapılmış) cihazı yeni oturum zincirine bağlar. Cihaz sahibi olduğunu
 * cihaz imza anahtarıyla kanıtlar; sunucu yalnız sahibi, iptal edilmemiş, park cihazı bağlar.
 */
@Injectable()
export class E2eeRebindService {
  constructor(private prisma: PrismaService) {}

  /** Tek kullanımlık nonce üretir (DB'de saklı: atomik tüketim için `deleteMany` sayısı yeterli). */
  async challenge(userId: string): Promise<{ nonce: string }> {
    const nonce = randomBytes(E2EE_REBIND_NONCE_BYTES);
    // Kullanıcı başına TEK bekleyen nonce: yenisi eskisini düşürür (istek gövdesi nonce taşımaz).
    await this.prisma.$transaction([
      this.prisma.e2eeRebindNonce.deleteMany({ where: { userId } }),
      this.prisma.e2eeRebindNonce.create({
        data: {
          userId,
          nonce: new Uint8Array(nonce),
          expiresAt: new Date(Date.now() + E2EE_REBIND_NONCE_TTL_MS),
        },
      }),
    ]);
    return { nonce: toB64(nonce) };
  }

  async rebind(user: RequestUser, dto: RebindDto): Promise<{ deviceId: string }> {
    const signature = fromB64(dto.signature);
    if (signature.length !== E2EE_SIGNATURE_BYTES) throw rejected();

    // Nonce, başka hiçbir kontrole bakmadan ATOMİK tüketilir: başarısız deneme de onu yakar (tek deneme).
    const pending = await this.prisma.e2eeRebindNonce.findFirst({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) throw nonceInvalid();
    const consumed = await this.prisma.e2eeRebindNonce.deleteMany({
      where: { id: pending.id, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) throw nonceInvalid();
    const nonce = pending.nonce;

    // Çağıranın zincirinde zaten aktif cihaz varsa (başka cihaz kaydı) bağlama reddedilir.
    const own = await this.prisma.e2eeDevice.findUnique({
      where: { tokenFamily: user.tokenFamily },
      select: { id: true },
    });
    if (own) throw rejected();

    const device = await this.prisma.e2eeDevice.findUnique({ where: { id: dto.deviceId } });
    if (!device || device.userId !== user.id || device.revokedAt || !device.parkedAt)
      throw rejected();

    const message = rebindMessage(nonce, user.id, device.id);
    if (!verifyEd25519(device.signatureKey, message, signature)) throw rejected();

    try {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.e2eeDevice.updateMany({
          // Yarış: bu arada iptal/park durumu değiştiyse hiçbir satır eşleşmez.
          where: { id: device.id, userId: user.id, revokedAt: null, parkedAt: { not: null } },
          data: { tokenFamily: user.tokenFamily, parkedAt: null, lastSeenAt: new Date() },
        });
        if (res.count !== 1) throw rejected();
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'e2ee.device.rebind',
            entityType: 'E2eeDevice',
            entityId: device.id,
            metadata: { platform: device.platform },
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw rejected(); // aynı zincire eşzamanlı ikinci bağlama
      throw err;
    }
    return { deviceId: device.id };
  }
}
