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
const OTHER_USER_ID = 'user-other';
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
      contentType: 'video/mp4',
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
  ];

  for (const ct of allowedTypes) {
    it(`contentType "${ct}" → kabul edilir`, async () => {
      const dto: PresignAttachmentDto = { filename: 'f', contentType: ct, size: 100 };
      await expect(service.presign(USER_ID, dto)).resolves.toBeDefined();
    });
  }

  it('contentType "video/mp4" → UNSUPPORTED_TYPE', async () => {
    const dto: PresignAttachmentDto = { filename: 'f', contentType: 'video/mp4', size: 100 };
    await expect(service.presign(USER_ID, dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('contentType "application/exe" → UNSUPPORTED_TYPE', async () => {
    const dto: PresignAttachmentDto = { filename: 'f', contentType: 'application/exe', size: 100 };
    await expect(service.presign(USER_ID, dto)).rejects.toBeInstanceOf(BadRequestException);
  });
});
