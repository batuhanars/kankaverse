import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import { AuthService } from '../auth/auth.service';
import type { ReauthFieldsDto } from '../auth/dto/reauth-fields.dto';
import type {
  BackupKeyMaterialDto,
  BackupParamsDto,
  PutBackupKeyDto,
  SnapshotRefDto,
} from './dto/e2ee-backup.dto';
import {
  E2EE_BACKUP_M_MAX,
  E2EE_BACKUP_M_MIN,
  E2EE_BACKUP_MAX_BYTES,
  E2EE_BACKUP_MAX_SNAPSHOTS,
  E2EE_BACKUP_PRESIGN_SECONDS,
  E2EE_BACKUP_T_MAX,
  E2EE_BACKUP_T_MIN,
} from './e2ee.constants';
import { E2EE_ERRORS, e2eeError, fromB64, toB64 } from './e2ee.util';

const OCTET = 'application/octet-stream';

const BACKUP_ERRORS = {
  notConfigured: () =>
    e2eeError(
      HttpStatus.NOT_FOUND,
      'Bu hesap için yedek kurulmamış.',
      'E2EE_BACKUP_NOT_CONFIGURED',
    ),
  keyVersion: () =>
    e2eeError(
      HttpStatus.CONFLICT,
      'Yedek anahtarı sürümü eşleşmiyor; yedeği yeniden aç.',
      'E2EE_BACKUP_KEY_VERSION',
    ),
  tooLarge: () =>
    e2eeError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'Yedek en fazla 25 MB olabilir.',
      'E2EE_BACKUP_TOO_LARGE',
    ),
  weakParams: () =>
    e2eeError(
      HttpStatus.BAD_REQUEST,
      'Yedek şifresi türetme ayarları güvenli tabanın altında.',
      'E2EE_BACKUP_WEAK_PARAMS',
    ),
  objectMissing: () =>
    e2eeError(
      HttpStatus.BAD_REQUEST,
      'Yedek dosyası yüklenmemiş ya da boyutu eşleşmiyor.',
      'E2EE_BACKUP_OBJECT_MISSING',
    ),
  snapshotNotFound: () =>
    e2eeError(
      HttpStatus.NOT_FOUND,
      'Bu cihaz için yedek görüntüsü yok.',
      'E2EE_BACKUP_SNAPSHOT_NOT_FOUND',
    ),
};

/**
 * 🔴 R7 — E5a şifreli DM yedeği sunucu tarafı. Sunucu yalnız tuz/parametre/SARILMIŞ anahtar ve şifreli
 * nesne görür; şifre, KEK, BMK ve düz mesaj bu serviste hiçbir yerde yoktur. Tuz/wrappedKey/presigned URL loglanmaz.
 */
@Injectable()
export class E2eeBackupService {
  private readonly logger = new Logger(E2eeBackupService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private auth: AuthService,
  ) {}

  // ── Okuma ─────────────────────────────────────────────────────────────────

  async get(userId: string) {
    const [backup, snaps] = await Promise.all([
      this.prisma.e2eeBackup.findUnique({ where: { userId } }),
      // İptal edilmiş cihazların görüntüleri de listelenir (§9: geri yüklemenin asıl kaynağı).
      this.prisma.e2eeBackupSnapshot.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: { deviceId: true, size: true, updatedAt: true },
      }),
    ]);
    if (!backup) return { configured: false, snapshots: snaps };
    return {
      configured: true,
      salt: toB64(backup.salt),
      params: backup.params,
      wrappedKey: toB64(backup.wrappedKey),
      keyVersion: backup.keyVersion,
      snapshots: snaps,
    };
  }

  // ── Anahtar kaydı ─────────────────────────────────────────────────────────

  /** Kurulum (kayıt yok, keyVersion=1) ya da şifre değişimi (keyVersion mevcutla AYNI; yeniden sarma). */
  async putKey(userId: string, dto: PutBackupKeyDto) {
    const params = this.checkParams(dto.params);
    const data = { salt: fromB64(dto.salt), params, wrappedKey: fromB64(dto.wrappedKey) };
    const existing = await this.prisma.e2eeBackup.findUnique({
      where: { userId },
      select: { keyVersion: true },
    });

    if (!existing) {
      if (dto.keyVersion !== 1) throw BACKUP_ERRORS.keyVersion();
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.e2eeBackup.create({ data: { userId, keyVersion: 1, ...data } });
          await this.audit(tx, userId, 'e2ee.backup.configure', 1);
        });
      } catch (e) {
        // Eşzamanlı ilk kurulum: kayıt arada oluştu → sürüm çakışması.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw BACKUP_ERRORS.keyVersion();
        }
        throw e;
      }
      return { keyVersion: 1 };
    }

    if (dto.keyVersion !== existing.keyVersion) throw BACKUP_ERRORS.keyVersion();
    await this.prisma.$transaction(async (tx) => {
      // Sürüm koşullu güncelleme: arada reset olduysa count=0 → 409 (eski sürümün anahtarı yazılmaz).
      const res = await tx.e2eeBackup.updateMany({
        where: { userId, keyVersion: dto.keyVersion },
        data,
      });
      if (res.count === 0) throw BACKUP_ERRORS.keyVersion();
      await this.audit(tx, userId, 'e2ee.backup.rekey', dto.keyVersion);
    });
    return { keyVersion: dto.keyVersion };
  }

  /** "Şifremi unuttum": keyVersion+1, yeni anahtar kaydı, TÜM görüntüler (satır + nesne) silinir. */
  async reset(userId: string, dto: ReauthFieldsDto & BackupKeyMaterialDto) {
    await this.reauth(userId, dto);
    const params = this.checkParams(dto.params);

    const { keyVersion, keys } = await this.prisma.$transaction(async (tx) => {
      const cur = await tx.e2eeBackup.findUnique({
        where: { userId },
        select: { keyVersion: true },
      });
      if (!cur) throw BACKUP_ERRORS.notConfigured();
      const next = cur.keyVersion + 1;
      // Satır kilidi + sürüm koşulu: eşzamanlı commit/presign eski sürümle yazamaz.
      const res = await tx.e2eeBackup.updateMany({
        where: { userId, keyVersion: cur.keyVersion },
        data: {
          keyVersion: next,
          salt: fromB64(dto.salt),
          params,
          wrappedKey: fromB64(dto.wrappedKey),
        },
      });
      if (res.count === 0) throw BACKUP_ERRORS.keyVersion();
      const snaps = await tx.e2eeBackupSnapshot.findMany({
        where: { userId },
        select: { objectKey: true },
      });
      await tx.e2eeBackupSnapshot.deleteMany({ where: { userId } });
      await this.audit(tx, userId, 'e2ee.backup.reset', next);
      return { keyVersion: next, keys: snaps.map((s) => s.objectKey) };
    });

    await this.deleteObjects(keys);
    return { keyVersion };
  }

  /** Yedeği tamamen kapat: anahtar kaydı + tüm görüntüler. Kayıt yoksa da yetim görüntüleri temizler (idempotent). */
  async remove(userId: string, dto: ReauthFieldsDto) {
    await this.reauth(userId, dto);
    const keys = await this.prisma.$transaction(async (tx) => {
      const cur = await tx.e2eeBackup.findUnique({
        where: { userId },
        select: { keyVersion: true },
      });
      const snaps = await tx.e2eeBackupSnapshot.findMany({
        where: { userId },
        select: { objectKey: true },
      });
      await tx.e2eeBackupSnapshot.deleteMany({ where: { userId } });
      await tx.e2eeBackup.deleteMany({ where: { userId } });
      if (cur) await this.audit(tx, userId, 'e2ee.backup.delete', cur.keyVersion);
      return snaps.map((s) => s.objectKey);
    });
    await this.deleteObjects(keys);
    return null;
  }

  // ── Görüntü ───────────────────────────────────────────────────────────────

  async presign(userId: string, dto: SnapshotRefDto) {
    await this.checkSnapshotRef(userId, dto);
    const key = this.objectKey(userId, dto);
    const url = await this.storage.presignPut(key, OCTET, {
      contentLength: dto.size, // imzaya bağlı: başka uzunlukla yükleme reddedilir
      expiresIn: E2EE_BACKUP_PRESIGN_SECONDS,
    });
    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': OCTET },
      expiresIn: E2EE_BACKUP_PRESIGN_SECONDS,
    };
  }

  async commit(userId: string, dto: SnapshotRefDto) {
    await this.checkSnapshotRef(userId, dto);
    const objectKey = this.objectKey(userId, dto);

    let actual: number;
    try {
      actual = await this.storage.headSize(objectKey);
    } catch {
      throw BACKUP_ERRORS.objectMissing();
    }
    if (actual !== dto.size) throw BACKUP_ERRORS.objectMissing();

    const stale = await this.prisma.$transaction(async (tx) => {
      // Sürüm koşullu "kilit": reset arada olduysa count=0 → 409; reset ile eşzamanlı görüntü kalmaz.
      const lock = await tx.e2eeBackup.updateMany({
        where: { userId, keyVersion: dto.keyVersion },
        data: { updatedAt: new Date() },
      });
      if (lock.count === 0) throw BACKUP_ERRORS.keyVersion();

      const prev = await tx.e2eeBackupSnapshot.findUnique({
        where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
        select: { objectKey: true },
      });
      const row = await tx.e2eeBackupSnapshot.upsert({
        where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
        create: {
          userId,
          deviceId: dto.deviceId,
          keyVersion: dto.keyVersion,
          objectKey,
          size: dto.size,
          sha256: dto.sha256,
        },
        update: { keyVersion: dto.keyVersion, objectKey, size: dto.size, sha256: dto.sha256 },
      });

      const stale: string[] = [];
      // Aynı cihazın eski nesnesi (farklı anahtar) silinir; aynı anahtarsa dokunulmaz.
      if (prev && prev.objectKey !== objectKey) stale.push(prev.objectKey);

      // Kullanıcı başına en çok 5 görüntü: fazlası en eski updatedAt'ten silinir (yeni satır hariç).
      const all = await tx.e2eeBackupSnapshot.findMany({
        where: { userId },
        orderBy: { updatedAt: 'asc' },
        select: { id: true, objectKey: true },
      });
      const excess = all.length - E2EE_BACKUP_MAX_SNAPSHOTS;
      if (excess > 0) {
        const victims = all.filter((s) => s.id !== row.id).slice(0, excess);
        await tx.e2eeBackupSnapshot.deleteMany({ where: { id: { in: victims.map((v) => v.id) } } });
        stale.push(...victims.map((v) => v.objectKey));
      }
      return stale;
    });

    await this.deleteObjects(stale);
    return { deviceId: dto.deviceId, size: dto.size, keyVersion: dto.keyVersion };
  }

  /** Yalnız kendi görüntüsü; iptal edilmiş cihazınki DAHİL (§9). Kısa ömürlü presigned GET. */
  async getSnapshot(userId: string, deviceId: string) {
    const row = await this.prisma.e2eeBackupSnapshot.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });
    if (!row) throw BACKUP_ERRORS.snapshotNotFound();
    const url = await this.storage.presignGet(row.objectKey, {
      expiresIn: E2EE_BACKUP_PRESIGN_SECONDS,
    });
    return {
      url,
      deviceId: row.deviceId,
      size: row.size,
      sha256: row.sha256,
      keyVersion: row.keyVersion,
      updatedAt: row.updatedAt,
      expiresIn: E2EE_BACKUP_PRESIGN_SECONDS,
    };
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  /** Hassas işlem reauth'u: Sprint 2B `AuthService.verifyReauth` AYNEN (şifre + 2FA varsa TOTP; 401). */
  private async reauth(userId: string, dto: ReauthFieldsDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw e2eeError(HttpStatus.UNAUTHORIZED, 'Kullanıcı bulunamadı.', 'UNAUTHORIZED');
    await this.auth.verifyReauth(user, dto.currentPassword, dto.totpCode);
  }

  /** Sahiplik + durum kontrolleri; sıra: kurulu mu (404) → cihaz kendi ve aktif mi (403) → sürüm (409) → boyut (413). */
  private async checkSnapshotRef(userId: string, dto: SnapshotRefDto): Promise<void> {
    const backup = await this.prisma.e2eeBackup.findUnique({
      where: { userId },
      select: { keyVersion: true },
    });
    if (!backup) throw BACKUP_ERRORS.notConfigured();

    // Yalnız çağıranın kendi, iptal edilmemiş cihazı (başkasının/iptal edilmişin cihazıyla yazılamaz).
    const device = await this.prisma.e2eeDevice.findFirst({
      where: { id: dto.deviceId, userId, revokedAt: null },
      select: { id: true },
    });
    if (!device) throw E2EE_ERRORS.deviceRequired();

    if (dto.keyVersion !== backup.keyVersion) throw BACKUP_ERRORS.keyVersion();
    if (dto.size > E2EE_BACKUP_MAX_BYTES) throw BACKUP_ERRORS.tooLarge();
  }

  private objectKey(userId: string, dto: SnapshotRefDto): string {
    return `e2ee-backup/${userId}/${dto.deviceId}/${dto.sha256}`;
  }

  /** Taban altı → 400 E2EE_BACKUP_WEAK_PARAMS; p≠1 ya da üst sınır aşımı → 400 geçersiz yük. Yalnız {m,t,p} saklanır. */
  private checkParams(p: BackupParamsDto): { m: number; t: number; p: number } {
    if (p.m < E2EE_BACKUP_M_MIN || p.t < E2EE_BACKUP_T_MIN || p.p < 1)
      throw BACKUP_ERRORS.weakParams();
    if (p.m > E2EE_BACKUP_M_MAX || p.t > E2EE_BACKUP_T_MAX || p.p !== 1) {
      throw E2EE_ERRORS.invalidPayload(
        'Yedek şifresi türetme ayarları izin verilen aralığın dışında.',
      );
    }
    return { m: p.m, t: p.t, p: p.p };
  }

  /**
   * Nesne silme transaction DIŞINDA ve en iyi çaba: hata loglanır, işlem başarısız sayılmaz.
   * Bilinen risk (kabul edildi): silme başarısız olursa özel bucket'ta şifreli YETİM nesne kalır (satır yok, anahtar yok).
   * Log'a yalnız nesne anahtarı (userId/deviceId/sha256) yazılır; URL, tuz, sarılmış anahtar asla.
   */
  async deleteObjects(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (err) {
        this.logger.error(
          `E2EE yedek nesnesi silinemedi (yetim kalabilir): ${key}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** İçerik yok: yalnız eylem + keyVersion. */
  private audit(tx: Prisma.TransactionClient, userId: string, action: string, keyVersion: number) {
    return tx.auditLog.create({
      data: {
        actorId: userId,
        action,
        entityType: 'E2eeBackup',
        entityId: userId,
        metadata: { keyVersion },
      },
    });
  }
}
