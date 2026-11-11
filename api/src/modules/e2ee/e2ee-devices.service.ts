import { ConflictException, ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { E2eeNotifyService } from './e2ee-notify.service';
import { RegisterDeviceDto, UploadKeyPackagesDto } from './dto/e2ee.dto';
import {
  E2EE_KEY_PACKAGES_PENDING_MAX,
  E2EE_MAX_ACTIVE_DEVICES,
  E2EE_SIGNATURE_KEY_BYTES,
} from './e2ee.constants';
import { E2EE_ERRORS, bytesEqual, e2eeError, fromB64, toB64 } from './e2ee.util';

/** Cihaz kaydı + KeyPackage yükleme/sayım + cihaz listeleme (§2.3; claim: E2eeClaimService). */
@Injectable()
export class E2eeDevicesService {
  constructor(
    private prisma: PrismaService,
    private notify: E2eeNotifyService,
  ) {}

  /** Çağıranın oturum zincirindeki ETKİN cihaz; yoksa/iptalse 403 E2EE_DEVICE_REQUIRED. */
  async requireActiveDevice(user: Pick<RequestUser, 'id' | 'tokenFamily'>) {
    const device = await this.prisma.e2eeDevice.findUnique({
      where: { tokenFamily: user.tokenFamily },
    });
    if (!device || device.userId !== user.id || device.revokedAt)
      throw E2EE_ERRORS.deviceRequired();
    return device;
  }

  async register(user: RequestUser, dto: RegisterDeviceDto): Promise<{ deviceId: string }> {
    const key = fromB64(dto.signatureKey);
    if (key.length !== E2EE_SIGNATURE_KEY_BYTES) {
      throw E2EE_ERRORS.invalidPayload('İmza anahtarı 32 bayt olmalı.');
    }

    const existing = await this.prisma.e2eeDevice.findUnique({
      where: { tokenFamily: user.tokenFamily },
    });
    if (existing) return this.returnExisting(existing, key);

    const active = await this.prisma.e2eeDevice.count({
      where: { userId: user.id, revokedAt: null },
    });
    if (active >= E2EE_MAX_ACTIVE_DEVICES) {
      throw e2eeError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'En fazla 10 etkin cihaz kaydedebilirsiniz.',
        'E2EE_DEVICE_LIMIT',
      );
    }

    try {
      const created = await this.prisma.e2eeDevice.create({
        data: {
          userId: user.id,
          tokenFamily: user.tokenFamily,
          platform: dto.platform,
          signatureKey: key,
        },
      });
      return { deviceId: created.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Aynı zincirle eşzamanlı iki kayıt: kazananı döndür (anahtar aynıysa idempotent).
        const winner = await this.prisma.e2eeDevice.findUnique({
          where: { tokenFamily: user.tokenFamily },
        });
        if (winner) return this.returnExisting(winner, key);
      }
      throw err;
    }
  }

  private async returnExisting(
    device: { id: string; revokedAt: Date | null; signatureKey: Uint8Array },
    key: Uint8Array,
  ) {
    if (device.revokedAt) throw E2EE_ERRORS.deviceRequired();
    if (!bytesEqual(device.signatureKey, key)) {
      throw new ConflictException({
        message: 'Bu oturum için kayıtlı cihaz anahtarı farklı.',
        error: 'E2EE_DEVICE_KEY_MISMATCH',
      });
    }
    await this.prisma.e2eeDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });
    return { deviceId: device.id };
  }

  /** Tüketilmemiş (son çare hariç) KeyPackage sayısı. */
  private countAvailable(deviceId: string): Promise<number> {
    return this.prisma.e2eeKeyPackage.count({
      where: { deviceId, consumedAt: null, lastResort: false },
    });
  }

  /** Cihazın claim edilebilir paketi var mı: tüketilmemiş paket VEYA son çare paketi. */
  private async hasClaimablePackage(deviceId: string): Promise<boolean> {
    const n = await this.prisma.e2eeKeyPackage.count({
      where: { deviceId, OR: [{ consumedAt: null }, { lastResort: true }] },
    });
    return n > 0;
  }

  async available(user: RequestUser): Promise<{ available: number }> {
    const device = await this.requireActiveDevice(user);
    return { available: await this.countAvailable(device.id) };
  }

  async uploadKeyPackages(user: RequestUser, dto: UploadKeyPackagesDto) {
    const device = await this.requireActiveDevice(user);
    const pending = await this.countAvailable(device.id);
    if (pending + dto.keyPackages.length > E2EE_KEY_PACKAGES_PENDING_MAX) {
      throw e2eeError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Bekleyen KeyPackage sayısı sınırı (100) aşılırdı.',
        'E2EE_KEY_PACKAGE_LIMIT',
      );
    }
    // §6.5: yayın kayıtta değil, cihaz ilk kez claim edilebilir hale gelince (paket yokken yükleme).
    const hadClaimable = await this.hasClaimablePackage(device.id);
    await this.prisma.$transaction([
      ...(dto.lastResort
        ? [
            this.prisma.e2eeKeyPackage.deleteMany({
              where: { deviceId: device.id, lastResort: true },
            }),
            this.prisma.e2eeKeyPackage.create({
              data: { deviceId: device.id, data: fromB64(dto.lastResort), lastResort: true },
            }),
          ]
        : []),
      this.prisma.e2eeKeyPackage.createMany({
        data: dto.keyPackages.map((kp) => ({ deviceId: device.id, data: fromB64(kp) })),
      }),
    ]);
    if (!hadClaimable && (dto.keyPackages.length > 0 || dto.lastResort)) {
      void this.notify.devicesChanged(user.id);
    }
    return { available: await this.countAvailable(device.id) };
  }

  /** Yalnız kendisi ya da çağıranla ORTAK bir DM kanalı olan kullanıcı; aksi 403. Yalnız etkin cihazlar. */
  async listUserDevices(callerId: string, userId: string) {
    if (callerId !== userId) {
      const shared = await this.prisma.channelMember.findFirst({
        where: {
          userId,
          channel: {
            guildId: null,
            deletedAt: null,
            members: { some: { userId: callerId } },
          },
        },
        select: { id: true },
      });
      if (!shared) {
        throw new ForbiddenException({
          message: 'Bu kullanıcının cihazlarını göremezsiniz.',
          error: 'FORBIDDEN',
        });
      }
    }
    const devices = await this.prisma.e2eeDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return devices.map((d) => ({
      deviceId: d.id,
      platform: d.platform,
      signatureKey: toB64(d.signatureKey),
      createdAt: d.createdAt.toISOString(),
    }));
  }
}
