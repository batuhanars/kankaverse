import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { PresignAttachmentDto } from './dto/presign-attachment.dto';

// ── Mock fabrikaları ──────────────────────────────────────────────────────────

const prismaMock = {
  attachment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

const storageMock = {
  presignPut: jest.fn(),
  presignGet: jest.fn(),
  delete: jest.fn(),
};

const membershipMock = {
  requireChannelAccess: jest.fn(),
};

const configMock = {
  get: jest.fn((key: string) => {
    const values: Record<string, unknown> = {
      maxUploadMb: 25,
      attachmentScanEnabled: false,
      uploadsEnabled: true,
    };
    return values[key];
  }),
};

function makeService() {
  return new AttachmentsService(
    prismaMock as any,
    storageMock as any,
    membershipMock as any,
    configMock as any,
  );
}

function resetMocks() {
  jest.resetAllMocks();
  configMock.get.mockImplementation((key: string) => {
    const values: Record<string, unknown> = {
      maxUploadMb: 25,
      attachmentScanEnabled: false,
      uploadsEnabled: true,
    };
    return values[key];
  });
}

// ── Sabit fixture'lar ─────────────────────────────────────────────────────────

const USER_ID = 'user-abc';
const ATTACHMENT_ID = 'att-1';
const CHANNEL_ID = 'ch-guild-1';
const MESSAGE_ID = 'msg-1';

const VALID_DTO: PresignAttachmentDto = {
  filename: 'test.png',
  contentType: 'image/png',
  size: 1024 * 1024, // 1 MB
};

const ATTACHMENT_FIXTURE = {
  id: ATTACHMENT_ID,
  uploaderId: USER_ID,
  messageId: MESSAGE_ID,
  storageKey: 'abc123.png',
  filename: 'test.png',
  contentType: 'image/png',
  size: 1024,
  scanStatus: 'CLEAN',
  message: { channelId: CHANNEL_ID },
};

// ── AttachmentsService.presign ────────────────────────────────────────────────

describe('AttachmentsService.presign', () => {
  let service: AttachmentsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    storageMock.presignPut.mockResolvedValue('https://minio/presigned-put-url');
    prismaMock.attachment.create.mockResolvedValue({
      id: ATTACHMENT_ID,
      storageKey: 'abc123.png',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PRESIGN — boyut aşımı → FILE_TOO_LARGE
  // ─────────────────────────────────────────────────────────────────────────
  it('boyut > maxUploadMb → BadRequestException FILE_TOO_LARGE', async () => {
    const dto: PresignAttachmentDto = {
      ...VALID_DTO,
      size: 26 * 1024 * 1024, // 26 MB
    };

    await expect(service.presign(USER_ID, dto)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'FILE_TOO_LARGE' }),
    });

    expect(prismaMock.attachment.create).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PRESIGN — izin verilmeyen tip → UNSUPPORTED_TYPE
  // ─────────────────────────────────────────────────────────────────────────
  it('izin verilmeyen contentType → BadRequestException UNSUPPORTED_TYPE', async () => {
    const dto: PresignAttachmentDto = {
      ...VALID_DTO,
      contentType: 'video/quicktime',
    };

    await expect(service.presign(USER_ID, dto)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'UNSUPPORTED_TYPE' }),
    });

    expect(prismaMock.attachment.create).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PRESIGN — geçerli istek → { attachmentId, uploadUrl, storageKey }
  // ─────────────────────────────────────────────────────────────────────────
  it('geçerli DTO → attachment oluşturulur, presignPut çağrılır, sonuç döner', async () => {
    const result = await service.presign(USER_ID, VALID_DTO);

    expect(prismaMock.attachment.create).toHaveBeenCalledTimes(1);
    expect(storageMock.presignPut).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('attachmentId');
    expect(result).toHaveProperty('uploadUrl');
    expect(result).toHaveProperty('storageKey');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PRESIGN — tam sınırda geçer (25 MB tam)
  // ─────────────────────────────────────────────────────────────────────────
  it('size = 25 MB (tam sınır) → kabul edilir', async () => {
    const dto: PresignAttachmentDto = {
      ...VALID_DTO,
      size: 25 * 1024 * 1024,
    };

    await expect(service.presign(USER_ID, dto)).resolves.toBeDefined();
  });
});

// ── AttachmentsService.getDownloadUrl ─────────────────────────────────────────

describe('AttachmentsService.getDownloadUrl — [R7] erişim + scan kapısı', () => {
  let service: AttachmentsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    storageMock.presignGet.mockResolvedValue('https://minio/presigned-get-url');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // messageId null → 404 (henüz iliştirilmemiş)
  // ─────────────────────────────────────────────────────────────────────────
  it('messageId null (henüz mesaja bağlanmamış) → NotFoundException', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      ...ATTACHMENT_FIXTURE,
      messageId: null,
      message: null,
    });

    await expect(service.getDownloadUrl(USER_ID, ATTACHMENT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // [R7] Üye değil → requireChannelAccess 403 fırlatır → propagate
  // ─────────────────────────────────────────────────────────────────────────
  it('[R7] kanal üyesi değil → requireChannelAccess ForbiddenException fırlatır', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(ATTACHMENT_FIXTURE);
    membershipMock.requireChannelAccess.mockRejectedValue(
      new ForbiddenException({ message: 'Erişim yok.', error: 'NOT_CHANNEL_MEMBER' }),
    );

    await expect(service.getDownloadUrl(USER_ID, ATTACHMENT_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    // presignGet çağrılmamalı
    expect(storageMock.presignGet).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // scanStatus PENDING → ATTACHMENT_NOT_READY (403)
  // ─────────────────────────────────────────────────────────────────────────
  it('scanStatus PENDING → ForbiddenException ATTACHMENT_NOT_READY', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      ...ATTACHMENT_FIXTURE,
      scanStatus: 'PENDING',
    });
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID, guildId: 'g-1' });

    let thrown: ForbiddenException | undefined;
    try {
      await service.getDownloadUrl(USER_ID, ATTACHMENT_ID);
    } catch (e) {
      thrown = e as ForbiddenException;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('ATTACHMENT_NOT_READY');
    expect(storageMock.presignGet).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // scanStatus FLAGGED → ATTACHMENT_BLOCKED (403)
  // ─────────────────────────────────────────────────────────────────────────
  it('scanStatus FLAGGED → ForbiddenException ATTACHMENT_BLOCKED', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      ...ATTACHMENT_FIXTURE,
      scanStatus: 'FLAGGED',
    });
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID, guildId: 'g-1' });

    let thrown: ForbiddenException | undefined;
    try {
      await service.getDownloadUrl(USER_ID, ATTACHMENT_ID);
    } catch (e) {
      thrown = e as ForbiddenException;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    const response = thrown!.getResponse() as { error: string };
    expect(response.error).toBe('ATTACHMENT_BLOCKED');
    expect(storageMock.presignGet).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // scanStatus CLEAN → presignGet çağrılır → { url }
  // ─────────────────────────────────────────────────────────────────────────
  it('scanStatus CLEAN + kanal üyesi → presignGet çağrılır, { url } döner', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(ATTACHMENT_FIXTURE);
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID, guildId: 'g-1' });

    const result = await service.getDownloadUrl(USER_ID, ATTACHMENT_ID);

    expect(membershipMock.requireChannelAccess).toHaveBeenCalledWith(USER_ID, CHANNEL_ID);
    expect(storageMock.presignGet).toHaveBeenCalledWith(ATTACHMENT_FIXTURE.storageKey);
    expect(result).toEqual({ url: 'https://minio/presigned-get-url' });
  });

  // C15: download=1 → presignGet downloadFilename ile; erişim/scan kapısı aynı
  it('C15: download=true → presignGet kayıtlı dosya adıyla çağrılır', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      ...ATTACHMENT_FIXTURE,
      filename: 'Şiir "1".png',
    });
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID, guildId: 'g-1' });

    const result = await service.getDownloadUrl(USER_ID, ATTACHMENT_ID, true);

    expect(storageMock.presignGet).toHaveBeenCalledWith(ATTACHMENT_FIXTURE.storageKey, {
      downloadFilename: 'Şiir 1.png',
    });
    expect(result).toEqual({ url: 'https://minio/presigned-get-url' });
  });

  it('C15: download=true + boş ad → kankaverse-<id> + storageKey uzantısı', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      ...ATTACHMENT_FIXTURE,
      filename: '"/\\',
      storageKey: 'abc123.mp4',
    });
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID, guildId: 'g-1' });

    await service.getDownloadUrl(USER_ID, ATTACHMENT_ID, true);

    expect(storageMock.presignGet).toHaveBeenCalledWith('abc123.mp4', {
      downloadFilename: `kankaverse-${ATTACHMENT_FIXTURE.id}.mp4`,
    });
  });

  it('C15 [R7]: erişimi olmayan kullanıcı download=true ile de reddedilir', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(ATTACHMENT_FIXTURE);
    membershipMock.requireChannelAccess.mockRejectedValue(
      new ForbiddenException({ message: 'Erişim yok.', error: 'NOT_CHANNEL_MEMBER' }),
    );

    await expect(service.getDownloadUrl(USER_ID, ATTACHMENT_ID, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(storageMock.presignGet).not.toHaveBeenCalled();
  });

  it('C15 [R7]: scan CLEAN değilse download=true da reddedilir', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      ...ATTACHMENT_FIXTURE,
      scanStatus: 'PENDING',
    });
    membershipMock.requireChannelAccess.mockResolvedValue({ id: CHANNEL_ID, guildId: 'g-1' });

    await expect(service.getDownloadUrl(USER_ID, ATTACHMENT_ID, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(storageMock.presignGet).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Attachment hiç yok → 404
  // ─────────────────────────────────────────────────────────────────────────
  it('attachment bulunamadı → NotFoundException', async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(null);

    await expect(service.getDownloadUrl(USER_ID, 'ghost-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ── Scan-gate (MessagesService'e entegre) ─────────────────────────────────────
// Scan-gate attachment.updateMany scan status değeri messages.service.spec'te test edilir.
// Burada sadece presign akışı test edilir (scan-gate AttachmentsService'in sorumluluğu değil).

describe('AttachmentsService.presign — allowlist kapsamı', () => {
  let service: AttachmentsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    storageMock.presignPut.mockResolvedValue('https://minio/presigned-put-url');
    prismaMock.attachment.create.mockResolvedValue({ id: ATTACHMENT_ID, storageKey: 'k.pdf' });
  });

  const allowedTypes = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/zip',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'audio/mp4',
    'audio/webm',
    'audio/mpeg',
    'video/mp4',
    'video/webm',
  ];

  for (const ct of allowedTypes) {
    it(`contentType "${ct}" → kabul edilir`, async () => {
      const dto: PresignAttachmentDto = { filename: 'f', contentType: ct, size: 100 };
      await expect(service.presign(USER_ID, dto)).resolves.toBeDefined();
    });
  }

  it('contentType "video/quicktime" → UNSUPPORTED_TYPE', async () => {
    const dto: PresignAttachmentDto = { filename: 'f', contentType: 'video/quicktime', size: 100 };
    await expect(service.presign(USER_ID, dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('contentType "application/exe" → UNSUPPORTED_TYPE', async () => {
    const dto: PresignAttachmentDto = { filename: 'f', contentType: 'application/exe', size: 100 };
    await expect(service.presign(USER_ID, dto)).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── M6b: sesli mesaj süresi ────────────────────────────────────────────────────
describe('AttachmentsService.presign — durationMs (M6b)', () => {
  let service: AttachmentsService;

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.attachment.create.mockResolvedValue({ id: 'att-1', storageKey: 'k.m4a' });
    storageMock.presignPut.mockResolvedValue('https://upload');
  });

  const audio = (extra: Partial<PresignAttachmentDto> = {}): PresignAttachmentDto => ({
    filename: 'ses.m4a',
    contentType: 'audio/mp4',
    size: 1000,
    ...extra,
  });

  it('ses + durationMs → kaydedilir', async () => {
    await service.presign(USER_ID, audio({ durationMs: 7300 }));
    expect(prismaMock.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ durationMs: 7300 }),
    });
  });

  it('ses, durationMs yok → null', async () => {
    await service.presign(USER_ID, audio());
    expect(prismaMock.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ durationMs: null }),
    });
  });

  it('tam 300000 ms → kabul', async () => {
    await expect(service.presign(USER_ID, audio({ durationMs: 300000 }))).resolves.toBeDefined();
  });

  it('300000 ms üstü → DURATION_TOO_LONG', async () => {
    await expect(service.presign(USER_ID, audio({ durationMs: 300001 }))).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'DURATION_TOO_LONG' }),
    });
    expect(prismaMock.attachment.create).not.toHaveBeenCalled();
  });

  it('ses-dışı türde durationMs yok sayılır (kaydedilmez, sınır uygulanmaz)', async () => {
    await service.presign(USER_ID, {
      filename: 'a.png',
      contentType: 'image/png',
      size: 100,
      durationMs: 999999,
    });
    expect(prismaMock.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ durationMs: null }),
    });
  });
});

// ── M6b §7: dalga formu ────────────────────────────────────────────────────────
describe('AttachmentsService.presign — waveform (M6b §7)', () => {
  let service: AttachmentsService;
  const WAVE = Buffer.alloc(64, 7).toString('base64'); // 64 bayt → 88 karakter

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.attachment.create.mockResolvedValue({ id: 'att-1', storageKey: 'k.m4a' });
    storageMock.presignPut.mockResolvedValue('https://upload');
  });

  const audio = (waveform?: string): PresignAttachmentDto => ({
    filename: 'ses.m4a',
    contentType: 'audio/mp4',
    size: 1000,
    waveform,
  });

  it('ses + geçerli 64 baytlık waveform → kaydedilir', async () => {
    await service.presign(USER_ID, audio(WAVE));
    expect(prismaMock.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ waveform: WAVE }),
    });
  });

  it('ses, waveform yok → null', async () => {
    await service.presign(USER_ID, audio());
    expect(prismaMock.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ waveform: null }),
    });
  });

  it.each([
    ['63 bayt', Buffer.alloc(63, 1).toString('base64')],
    ['65 bayt', Buffer.alloc(65, 1).toString('base64')],
    ['base64 değil', '!!!!'.repeat(22)],
  ])('%s → INVALID_WAVEFORM', async (_ad, bad) => {
    await expect(service.presign(USER_ID, audio(bad))).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'INVALID_WAVEFORM' }),
    });
    expect(prismaMock.attachment.create).not.toHaveBeenCalled();
  });

  it('ses-dışı türde waveform yok sayılır (geçersiz olsa da)', async () => {
    await service.presign(USER_ID, {
      filename: 'a.png',
      contentType: 'image/png',
      size: 100,
      waveform: 'bozuk',
    });
    expect(prismaMock.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ waveform: null }),
    });
  });
});

// ── M6c: video ─────────────────────────────────────────────────────────────────
describe('AttachmentsService.presign — video (M6c)', () => {
  let service: AttachmentsService;
  const THUMB = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');

  beforeEach(() => {
    resetMocks();
    service = makeService();
    prismaMock.attachment.create.mockResolvedValue({ id: 'att-1', storageKey: 'k.mp4' });
    storageMock.presignPut.mockResolvedValue('https://upload');
  });

  const video = (extra: Partial<PresignAttachmentDto> = {}): PresignAttachmentDto => ({
    filename: 'v.mp4',
    contentType: 'video/mp4',
    size: 1000,
    ...extra,
  });

  it('video + meta → hepsi kaydedilir', async () => {
    await service.presign(
      USER_ID,
      video({ durationMs: 42000, thumbnail: THUMB, width: 1280, height: 720 }),
    );
    expect(prismaMock.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        durationMs: 42000,
        thumbnail: THUMB,
        width: 1280,
        height: 720,
      }),
    });
  });

  it('video, meta yok → null', async () => {
    await service.presign(USER_ID, video());
    expect(prismaMock.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        durationMs: null,
        thumbnail: null,
        width: null,
        height: null,
      }),
    });
  });

  it('60000 ms kabul, 60001 → VIDEO_TOO_LONG', async () => {
    await expect(service.presign(USER_ID, video({ durationMs: 60000 }))).resolves.toBeDefined();
    await expect(service.presign(USER_ID, video({ durationMs: 60001 }))).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'VIDEO_TOO_LONG' }),
    });
  });

  it.each([
    ['JPEG imzası yok', Buffer.from([1, 2, 3, 4]).toString('base64')],
    ['base64 değil', '!!!!!!!!'],
    ['boş', ''],
  ])('thumbnail %s → INVALID_THUMBNAIL', async (_ad, bad) => {
    await expect(service.presign(USER_ID, video({ thumbnail: bad }))).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'INVALID_THUMBNAIL' }),
    });
    expect(prismaMock.attachment.create).not.toHaveBeenCalled();
  });

  it('video-dışı türde thumbnail/width/height yok sayılır', async () => {
    await service.presign(USER_ID, {
      filename: 'a.png',
      contentType: 'image/png',
      size: 100,
      thumbnail: 'bozuk',
      width: 10,
      height: 10,
    });
    expect(prismaMock.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ thumbnail: null, width: null, height: null }),
    });
  });
});
