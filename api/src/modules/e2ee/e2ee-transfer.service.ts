import { createHash } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { E2eeTransferStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../shared/realtime/realtime.service';
import { StorageService } from '../../shared/storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { RequestUser } from '../../common/types/request-user';
import type {
  AcceptTransferDto,
  CreateTransferDto,
  RevealTransferDto,
  TransferBlobDto,
} from './dto/e2ee-transfer.dto';
import {
  E2EE_EVENT_TRANSFER_ACCEPTED,
  E2EE_EVENT_TRANSFER_CLOSED,
  E2EE_EVENT_TRANSFER_READY,
  E2EE_EVENT_TRANSFER_REQUESTED,
  E2EE_EVENT_TRANSFER_REVEALED,
  E2EE_TRANSFER_MAX_BYTES,
  E2EE_TRANSFER_PRESIGN_SECONDS,
  E2EE_TRANSFER_RETENTION_MS,
  E2EE_TRANSFER_TTL_MS,
} from './e2ee.constants';
import { E2EE_ERRORS, bytesEqual, e2eeError, fromB64, toB64 } from './e2ee.util';

const OCTET = 'application/octet-stream';
type Caller = Pick<RequestUser, 'id' | 'tokenFamily'>;
type Tx = Prisma.TransactionClient;

/** Bitmemiş durumlar: tek açık istek kuralı ve iptal/süre dolumu bunlara uygulanır. */
const OPEN: E2eeTransferStatus[] = ['PENDING', 'ACCEPTED', 'REVEALED', 'UPLOADED'];

const TRANSFER_ERRORS = {
  notFound: () =>
    e2eeError(HttpStatus.NOT_FOUND, 'Aktarım isteği bulunamadı.', 'E2EE_TRANSFER_NOT_FOUND'),
  state: () =>
    e2eeError(
      HttpStatus.CONFLICT,
      'Aktarım bu adım için uygun durumda değil.',
      'E2EE_TRANSFER_STATE',
    ),
  expired: () =>
    e2eeError(
      HttpStatus.GONE,
      'Aktarım isteğinin süresi doldu. Yeniden başlat.',
      'E2EE_TRANSFER_EXPIRED',
    ),
  role: () =>
    e2eeError(HttpStatus.FORBIDDEN, 'Bu cihaz aktarımın bu adımını yapamaz.', 'E2EE_TRANSFER_ROLE'),
  commit: () =>
    e2eeError(HttpStatus.BAD_REQUEST, 'Anahtar taahhütle uyuşmuyor.', 'E2EE_TRANSFER_COMMIT'),
  tooLarge: () =>
    e2eeError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'Geçmiş çok büyük, yedekten geri yükle.',
      'E2EE_TRANSFER_TOO_LARGE',
    ),
  objectMissing: () =>
    e2eeError(
      HttpStatus.BAD_REQUEST,
      'Yük yüklenmemiş ya da boyutu tutmuyor.',
      'E2EE_TRANSFER_OBJECT_MISSING',
    ),
};

/** e2ee-core `transferCommit` ile aynı: SHA256(pack("kv-e5b-commit-v1", EN, rN)), 4 bayt büyük uçlu uzunluk önekli. */
export function transferCommitOf(newPub: Uint8Array, nonce: Uint8Array): Uint8Array {
  const parts = [Buffer.from('kv-e5b-commit-v1', 'utf8'), Buffer.from(newPub), Buffer.from(nonce)];
  const h = createHash('sha256');
  for (const p of parts) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(p.length);
    h.update(len).update(p);
  }
  return new Uint8Array(h.digest());
}

/**
 * E5b cihazdan cihaza geçmiş aktarımı (sözleşme §3). Sunucu taşır, okuyamaz: taahhüt, geçici açık anahtarlar
 * ve şifreli yük. Rol (N/O) çağıranın OTURUM cihazından çözülür; gövdeden cihaz kimliği alınmaz.
 * Durum geçişleri koşullu güncellemeyle (aynı adım iki kez ilerlemez). Log'a anahtar/yük yazılmaz.
 */
@Injectable()
export class E2eeTransferService {
  private readonly logger = new Logger(E2eeTransferService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private realtime: RealtimeService,
    private notifications: NotificationsService,
  ) {}

  /** N: istek aç. Açık eski istek iptal edilir (kullanıcı başına tek açık istek). */
  async create(user: Caller, dto: CreateTransferDto) {
    const device = await this.callerDevice(user);
    const now = new Date();
    const { row, closed } = await this.prisma.$transaction(async (tx) => {
      const closed = await this.closeOpen(tx, user.id, 'CANCELLED');
      const row = await tx.e2eeTransfer.create({
        data: {
          userId: user.id,
          newDeviceId: device.id,
          commit: fromB64(dto.commit),
          expiresAt: new Date(now.getTime() + E2EE_TRANSFER_TTL_MS),
        },
      });
      await this.audit(tx, user.id, 'e2ee.transfer.request', row.id, { newDeviceId: device.id });
      return { row, closed };
    });
    await this.afterClose(user.id, closed);
    this.realtime.emitToUser(user.id, E2EE_EVENT_TRANSFER_REQUESTED, {
      id: row.id,
      newDevice: await this.deviceInfo(device.id),
      expiresAt: row.expiresAt.toISOString(),
    });
    return { id: row.id, expiresAt: row.expiresAt.toISOString() };
  }

  /** O: kullanıcının açık isteği (çağıranın kendi açtığı istek gösterilmez). */
  async pending(user: Caller) {
    const device = await this.callerDevice(user);
    const row = await this.prisma.e2eeTransfer.findFirst({
      where: {
        userId: user.id,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        newDeviceId: { not: device.id },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    return {
      id: row.id,
      newDevice: await this.deviceInfo(row.newDeviceId),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /** N ya da O: durum + karşı tarafın açık malzemesi (soket kaçarsa yoklama). */
  async get(user: Caller, id: string) {
    const device = await this.callerDevice(user);
    const row = await this.load(user.id, id);
    const isNew = row.newDeviceId === device.id;
    const isOld = row.oldDeviceId === device.id;
    if (!isNew && !isOld) throw TRANSFER_ERRORS.role();
    return {
      id: row.id,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      newDeviceId: row.newDeviceId,
      oldDeviceId: row.oldDeviceId,
      ...(isNew && row.oldPub && { oldPub: toB64(row.oldPub) }),
      ...(isOld && { commit: toB64(row.commit) }),
      ...(isOld &&
        row.newPub &&
        row.newNonce && { newPub: toB64(row.newPub), nonce: toB64(row.newNonce) }),
    };
  }

  /** O: kabul et, geçici açık anahtarını ver. N kendi isteğini kabul edemez. */
  async accept(user: Caller, id: string, dto: AcceptTransferDto) {
    const device = await this.callerDevice(user);
    const row = await this.loadOpen(user.id, id);
    if (row.newDeviceId === device.id) throw TRANSFER_ERRORS.role();
    await this.advance(user.id, id, 'PENDING', 'ACCEPTED', 'e2ee.transfer.accept', {
      oldDeviceId: device.id,
      oldPub: fromB64(dto.pub),
    });
    this.realtime.emitToUser(user.id, E2EE_EVENT_TRANSFER_ACCEPTED, { id });
    return { id, status: 'ACCEPTED' as const };
  }

  /** N: taahhüdü aç. Sunucu da doğrular (O ayrıca kendi tarafında doğrular, buna güvenmez). */
  async reveal(user: Caller, id: string, dto: RevealTransferDto) {
    const device = await this.callerDevice(user);
    const row = await this.loadOpen(user.id, id);
    if (row.newDeviceId !== device.id) throw TRANSFER_ERRORS.role();
    const pub = fromB64(dto.pub);
    const nonce = fromB64(dto.nonce);
    if (!bytesEqual(transferCommitOf(pub, nonce), row.commit)) throw TRANSFER_ERRORS.commit();
    await this.advance(user.id, id, 'ACCEPTED', 'REVEALED', null, { newPub: pub, newNonce: nonce });
    this.realtime.emitToUser(user.id, E2EE_EVENT_TRANSFER_REVEALED, { id });
    return { id, status: 'REVEALED' as const };
  }

  /** O: şifreli yük için presigned PUT (≤25 MB). */
  async upload(user: Caller, id: string, dto: TransferBlobDto) {
    const row = await this.requireOld(user, id, 'REVEALED');
    if (dto.size > E2EE_TRANSFER_MAX_BYTES) throw TRANSFER_ERRORS.tooLarge();
    const url = await this.storage.presignPut(this.objectKey(row.userId, row.id), OCTET, {
      contentLength: dto.size,
      expiresIn: E2EE_TRANSFER_PRESIGN_SECONDS,
    });
    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': OCTET },
      expiresIn: E2EE_TRANSFER_PRESIGN_SECONDS,
    };
  }

  /** O: yük yüklendi (HEAD ile boyut doğrulanır) → UPLOADED, N'ye haber. */
  async commit(user: Caller, id: string, dto: TransferBlobDto) {
    const row = await this.requireOld(user, id, 'REVEALED');
    if (dto.size > E2EE_TRANSFER_MAX_BYTES) throw TRANSFER_ERRORS.tooLarge();
    const objectKey = this.objectKey(row.userId, row.id);
    let actual: number;
    try {
      actual = await this.storage.headSize(objectKey);
    } catch {
      throw TRANSFER_ERRORS.objectMissing();
    }
    if (actual !== dto.size) throw TRANSFER_ERRORS.objectMissing();
    await this.advance(user.id, id, 'REVEALED', 'UPLOADED', null, {
      objectKey,
      size: dto.size,
      sha256: dto.sha256,
    });
    this.realtime.emitToUser(user.id, E2EE_EVENT_TRANSFER_READY, { id });
    return { id, status: 'UPLOADED' as const };
  }

  /** N: şifreli yük için kısa ömürlü presigned GET. */
  async blob(user: Caller, id: string) {
    const device = await this.callerDevice(user);
    const row = await this.loadOpen(user.id, id);
    if (row.newDeviceId !== device.id) throw TRANSFER_ERRORS.role();
    if (row.status !== 'UPLOADED' || !row.objectKey) throw TRANSFER_ERRORS.state();
    const url = await this.storage.presignGet(row.objectKey, {
      expiresIn: E2EE_TRANSFER_PRESIGN_SECONDS,
    });
    return { url, size: row.size, sha256: row.sha256, expiresIn: E2EE_TRANSFER_PRESIGN_SECONDS };
  }

  /** N: aldım → DONE, nesne silinir, TÜM cihazlara güvenlik bildirimi (kurul k.1). */
  async done(user: Caller, id: string) {
    const device = await this.callerDevice(user);
    const row = await this.loadOpen(user.id, id);
    if (row.newDeviceId !== device.id) throw TRANSFER_ERRORS.role();
    await this.advance(user.id, id, 'UPLOADED', 'DONE', 'e2ee.transfer.done', {});
    await this.deleteObjects(row.objectKey ? [row.objectKey] : []);
    this.realtime.emitToUser(user.id, E2EE_EVENT_TRANSFER_CLOSED, { id, status: 'DONE' });
    const name = (await this.deviceInfo(row.newDeviceId)).name;
    await this.notifications
      .create(user.id, { type: NotificationType.E2EE_TRANSFER, preview: name ?? undefined })
      .catch((err: Error) => this.logger.warn(`aktarım bildirimi üretilemedi: ${err.message}`));
    return { id, status: 'DONE' as const };
  }

  /** N ya da O: ara durumdan iptal; nesne silinir, karşı tarafa haber. */
  async cancel(user: Caller, id: string) {
    const device = await this.callerDevice(user);
    const row = await this.load(user.id, id);
    if (row.newDeviceId !== device.id && row.oldDeviceId !== device.id) {
      // Bekleyen isteği henüz kabul etmemiş eski cihaz da "Ben değilim" diyebilir.
      if (row.status !== 'PENDING') throw TRANSFER_ERRORS.role();
    }
    const closed = await this.prisma.$transaction(async (tx) => {
      const res = await tx.e2eeTransfer.updateMany({
        where: { id, userId: user.id, status: { in: OPEN } },
        data: { status: 'CANCELLED' },
      });
      if (res.count === 0) throw TRANSFER_ERRORS.state();
      await this.audit(tx, user.id, 'e2ee.transfer.cancel', id, { byDeviceId: device.id });
      return [{ id, objectKey: row.objectKey }];
    });
    await this.afterClose(user.id, closed);
    return { id, status: 'CANCELLED' as const };
  }

  // ── Temizlik (zamanlanmış iş çağırır) ────────────────────────────────────

  /** Süresi geçmiş açık istekler → EXPIRED + nesne silinir; eski bitmiş satırlar silinir. */
  async sweep(now: Date): Promise<{ expired: number; deleted: number }> {
    const due = await this.prisma.e2eeTransfer.findMany({
      where: { status: { in: OPEN }, expiresAt: { lte: now } },
      select: { id: true, userId: true, objectKey: true },
    });
    let expired = 0;
    for (const t of due) {
      const res = await this.prisma.$transaction(async (tx) => {
        const r = await tx.e2eeTransfer.updateMany({
          where: { id: t.id, status: { in: OPEN } },
          data: { status: 'EXPIRED' },
        });
        if (r.count > 0) await this.audit(tx, t.userId, 'e2ee.transfer.expire', t.id, {});
        return r.count;
      });
      if (res > 0) {
        expired++;
        await this.afterClose(t.userId, [{ id: t.id, objectKey: t.objectKey }], 'EXPIRED');
      }
    }
    const { count: deleted } = await this.prisma.e2eeTransfer.deleteMany({
      where: {
        status: { in: ['DONE', 'CANCELLED', 'EXPIRED'] },
        updatedAt: { lt: new Date(now.getTime() - E2EE_TRANSFER_RETENTION_MS) },
      },
    });
    return { expired, deleted };
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  /** Çağıranın oturum zincirindeki ETKİN cihaz (E1 `requireActiveDevice` ile aynı kural); yoksa 403. */
  private async callerDevice(user: Caller) {
    const device = await this.prisma.e2eeDevice.findUnique({
      where: { tokenFamily: user.tokenFamily },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (!device || device.userId !== user.id || device.revokedAt)
      throw E2EE_ERRORS.deviceRequired();
    return device;
  }

  /** Kendi isteği değilse 404 (başkasının isteğinin varlığı sızdırılmaz). */
  private async load(userId: string, id: string) {
    const row = await this.prisma.e2eeTransfer.findFirst({ where: { id, userId } });
    if (!row) throw TRANSFER_ERRORS.notFound();
    return row;
  }

  /** Açık ve süresi geçmemiş; süresi geçmişse 410, bitmişse 409. */
  private async loadOpen(userId: string, id: string) {
    const row = await this.load(userId, id);
    if (row.status === 'EXPIRED' || (OPEN.includes(row.status) && row.expiresAt <= new Date())) {
      throw TRANSFER_ERRORS.expired();
    }
    if (!OPEN.includes(row.status)) throw TRANSFER_ERRORS.state();
    return row;
  }

  private async requireOld(user: Caller, id: string, status: E2eeTransferStatus) {
    const device = await this.callerDevice(user);
    const row = await this.loadOpen(user.id, id);
    if (row.oldDeviceId !== device.id) throw TRANSFER_ERRORS.role();
    if (row.status !== status) throw TRANSFER_ERRORS.state();
    return row;
  }

  /** Koşullu geçiş: beklenen durumda ve süresi geçmemişse ilerlet; değilse 409. */
  private async advance(
    userId: string,
    id: string,
    from: E2eeTransferStatus,
    to: E2eeTransferStatus,
    auditAction: string | null,
    data: Prisma.E2eeTransferUpdateManyMutationInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.e2eeTransfer.updateMany({
        where: { id, userId, status: from, expiresAt: { gt: new Date() } },
        data: { ...data, status: to },
      });
      if (res.count === 0) throw TRANSFER_ERRORS.state();
      if (auditAction) await this.audit(tx, userId, auditAction, id, {});
    });
  }

  /** Açık istekleri kapatır (yeni istek eskisini iptal eder). Kapananların kimlik + nesne anahtarı döner. */
  private async closeOpen(tx: Tx, userId: string, status: 'CANCELLED' | 'EXPIRED') {
    const open = await tx.e2eeTransfer.findMany({
      where: { userId, status: { in: OPEN } },
      select: { id: true, objectKey: true },
    });
    if (open.length > 0) {
      await tx.e2eeTransfer.updateMany({
        where: { id: { in: open.map((o) => o.id) } },
        data: { status },
      });
    }
    return open;
  }

  private async afterClose(
    userId: string,
    closed: { id: string; objectKey: string | null }[],
    status: 'CANCELLED' | 'EXPIRED' = 'CANCELLED',
  ) {
    await this.deleteObjects(closed.map((c) => c.objectKey).filter((k): k is string => !!k));
    for (const c of closed)
      this.realtime.emitToUser(userId, E2EE_EVENT_TRANSFER_CLOSED, { id: c.id, status });
  }

  /** Cihaz bilgisi: platform + oturumdaki cihaz adı (ör. "Chrome, Windows"). IP verilmez. */
  private async deviceInfo(deviceId: string) {
    const device = await this.prisma.e2eeDevice.findUnique({
      where: { id: deviceId },
      select: { platform: true, tokenFamily: true, createdAt: true },
    });
    if (!device) return { platform: null, name: null, createdAt: null };
    const session = await this.prisma.session.findFirst({
      where: { tokenFamily: device.tokenFamily },
      orderBy: { createdAt: 'desc' },
      select: { device: true },
    });
    return {
      platform: device.platform,
      name: session?.device ?? null,
      createdAt: device.createdAt.toISOString(),
    };
  }

  private objectKey(userId: string, id: string): string {
    return `e2ee-transfer/${userId}/${id}`;
  }

  /** En iyi çaba (yedekle aynı kabul edilmiş risk): hata loglanır, yalnız nesne anahtarı yazılır. */
  private async deleteObjects(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (err) {
        this.logger.error(
          `E2EE aktarım nesnesi silinemedi (yetim kalabilir): ${key}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** İçerik yok: yalnız eylem + aktarım kimliği + cihaz kimlikleri. */
  private audit(
    tx: Tx,
    userId: string,
    action: string,
    id: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: { actorId: userId, action, entityType: 'E2eeTransfer', entityId: id, metadata },
    });
  }
}
