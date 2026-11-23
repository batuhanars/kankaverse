import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { ReauthFieldsDto } from '../auth/dto/reauth-fields.dto';
import type {
  DeviceSignatureDto,
  IdentityMaterialDto,
  PutBackupIdentityDto,
  SignDeviceDto,
} from './dto/e2ee-identity.dto';
import { BACKUP_ERRORS } from './e2ee-backup.service';
import { E2eeNotifyService } from './e2ee-notify.service';
import { verifyDeviceSig } from './e2ee-identity.util';
import { E2EE_ERRORS, e2eeError, fromB64 } from './e2ee.util';

export const IDENTITY_ERRORS = {
  exists: () =>
    e2eeError(
      HttpStatus.CONFLICT,
      'Bu hesabın güvenlik kimliği zaten var.',
      'E2EE_IDENTITY_EXISTS',
    ),
  notFound: () =>
    e2eeError(HttpStatus.NOT_FOUND, 'Bu hesabın güvenlik kimliği yok.', 'E2EE_IDENTITY_NOT_FOUND'),
  version: () =>
    e2eeError(
      HttpStatus.CONFLICT,
      'Güvenlik kimliği sürümü eşleşmiyor; yeniden dene.',
      'E2EE_IDENTITY_VERSION',
    ),
  sigInvalid: () =>
    e2eeError(HttpStatus.BAD_REQUEST, 'Cihaz imzası geçersiz.', 'E2EE_IDENTITY_SIG_INVALID'),
};

/**
 * 🔴 R7 — E7 kullanıcı kimliği ve cihaz imzaları (sözleşme §3).
 * Sunucu yalnız AÇIK anahtarı ve imzaları tutar; özel anahtar buraya düz gelmez (yalnız yedekte BMK ile sarılı).
 * İmza doğrulaması burada hijyendir: asıl güvenlik istemcinin sabitlediği kimlikle yaptığı doğrulamadadır.
 * İmza yalnız çağıranın KENDİ aktif cihazına yazılabilir; başkasının cihazını kimse imzalayamaz.
 */
@Injectable()
export class E2eeIdentityService {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
    private notify: E2eeNotifyService,
  ) {}

  /** İlk kurulum (§4.4 geçiş): kimlik yoksa sürüm 1 ile yazılır, verilen imzalar işlenir. Varsa 409. */
  async create(userId: string, dto: IdentityMaterialDto) {
    const publicKey = fromB64(dto.publicKey);
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.e2eeIdentity.findUnique({
          where: { userId },
          select: { userId: true },
        });
        if (existing) throw IDENTITY_ERRORS.exists();
        await tx.e2eeIdentity.create({ data: { userId, publicKey, version: 1 } });
        await this.applySignatures(tx, userId, publicKey, 1, dto.signatures);
        await this.audit(tx, userId, 'e2ee.identity.create', 1);
      });
    } catch (e) {
      // İki cihaz aynı anda geçiş yaptı: ikincisinin create'i birincil anahtara çarpar → aynı 409.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw IDENTITY_ERRORS.exists();
      }
      throw e;
    }
    await this.notify.devicesChanged(userId);
    return { version: 1 };
  }

  /**
   * Sıfırlama (§4.6): reauth, sürüm +1, kullanıcının TÜM imzaları silinir, yalnız gövdedekiler (yeni sürümle)
   * yazılır, yedekteki sarılı kimlik silinir. Kişilerin istemcisi kimlik değişimini görür ("kod değişti").
   */
  async reset(userId: string, dto: ReauthFieldsDto & IdentityMaterialDto) {
    await this.reauth(userId, dto);
    const publicKey = fromB64(dto.publicKey);
    const version = await this.prisma.$transaction(async (tx) => {
      const cur = await tx.e2eeIdentity.findUnique({
        where: { userId },
        select: { version: true },
      });
      if (!cur) throw IDENTITY_ERRORS.notFound();
      const next = cur.version + 1;
      // Sürüm koşulu: eşzamanlı iki sıfırlamadan yalnız biri geçer.
      const res = await tx.e2eeIdentity.updateMany({
        where: { userId, version: cur.version },
        data: { publicKey, version: next },
      });
      if (res.count === 0) throw IDENTITY_ERRORS.version();
      await tx.e2eeDevice.updateMany({
        where: { userId },
        data: { identitySig: null, identityVersion: null },
      });
      await tx.e2eeBackup.updateMany({
        where: { userId },
        data: { wrappedIdentity: null, identityVersion: null },
      });
      await this.applySignatures(tx, userId, publicKey, next, dto.signatures);
      await this.audit(tx, userId, 'e2ee.identity.reset', next);
      return next;
    });
    await this.notify.devicesChanged(userId);
    return { version };
  }

  /** Tek cihaz imzası (§4.5 yolları: yedek, aktarım, "Bu cihazı doğrula"). Sürüm güncel olmalı. */
  async signDevice(userId: string, deviceId: string, dto: SignDeviceDto) {
    await this.prisma.$transaction(async (tx) => {
      const identity = await tx.e2eeIdentity.findUnique({ where: { userId } });
      if (!identity) throw IDENTITY_ERRORS.notFound();
      if (dto.identityVersion !== identity.version) throw IDENTITY_ERRORS.version();
      await this.applySignatures(tx, userId, identity.publicKey, identity.version, [
        { deviceId, sig: dto.sig },
      ]);
    });
    await this.notify.devicesChanged(userId);
    return null;
  }

  /** Kimliğin yedeğe sarılması (§2.3). Yedek ve kimlik sürümleri güncel olmalı; yoksa çağıran yeniden okur. */
  async putBackupIdentity(userId: string, dto: PutBackupIdentityDto) {
    await this.prisma.$transaction(async (tx) => {
      const [backup, identity] = await Promise.all([
        tx.e2eeBackup.findUnique({ where: { userId }, select: { keyVersion: true } }),
        tx.e2eeIdentity.findUnique({ where: { userId }, select: { version: true } }),
      ]);
      if (!backup) throw BACKUP_ERRORS.notConfigured();
      if (dto.keyVersion !== backup.keyVersion) throw BACKUP_ERRORS.keyVersion();
      if (!identity) throw IDENTITY_ERRORS.notFound();
      if (dto.identityVersion !== identity.version) throw IDENTITY_ERRORS.version();
      // Sürüm koşulu tekrar: okuma ile yazma arasında yedek sıfırlandıysa eski BMK'lı sarma yazılmaz.
      const res = await tx.e2eeBackup.updateMany({
        where: { userId, keyVersion: dto.keyVersion },
        data: {
          wrappedIdentity: fromB64(dto.wrappedIdentity),
          identityVersion: dto.identityVersion,
        },
      });
      if (res.count === 0) throw BACKUP_ERRORS.keyVersion();
    });
    return null;
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  /**
   * İmzaları yazar. Her hedef çağıranın kendi, iptal edilmemiş cihazı olmalı (403); imza verilen kimlikle
   * geçmeli (400). Biri bile tutmazsa transaction tümüyle geri alınır.
   */
  private async applySignatures(
    tx: Prisma.TransactionClient,
    userId: string,
    publicKey: Uint8Array,
    version: number,
    signatures: DeviceSignatureDto[],
  ): Promise<void> {
    for (const { deviceId, sig } of signatures) {
      const device = await tx.e2eeDevice.findFirst({
        where: { id: deviceId, userId, revokedAt: null },
        select: { id: true, signatureKey: true },
      });
      if (!device) throw E2EE_ERRORS.deviceRequired();
      const sigBytes = fromB64(sig);
      if (!verifyDeviceSig(publicKey, userId, version, device.id, device.signatureKey, sigBytes)) {
        throw IDENTITY_ERRORS.sigInvalid();
      }
      await tx.e2eeDevice.update({
        where: { id: device.id },
        data: { identitySig: sigBytes, identityVersion: version },
      });
    }
  }

  /** Hassas işlem reauth'u: Sprint 2B `AuthService.verifyReauth` AYNEN (yedek sıfırlamasıyla aynı yol). */
  private async reauth(userId: string, dto: ReauthFieldsDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw e2eeError(HttpStatus.UNAUTHORIZED, 'Kullanıcı bulunamadı.', 'UNAUTHORIZED');
    await this.auth.verifyReauth(user, dto.currentPassword, dto.totpCode);
  }

  private audit(tx: Prisma.TransactionClient, userId: string, action: string, version: number) {
    return tx.auditLog.create({
      data: {
        actorId: userId,
        action,
        entityType: 'E2eeIdentity',
        entityId: userId,
        metadata: { version },
      },
    });
  }
}
