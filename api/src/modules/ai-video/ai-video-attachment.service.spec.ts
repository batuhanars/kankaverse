import { AiVideoStatus, ScanStatus } from '@prisma/client';
import { AiVideoAttachmentService } from './ai-video-attachment.service';
import { extractVideoPoster } from '../../shared/media/video-poster';

jest.mock('../../shared/media/video-poster');
const poster = extractVideoPoster as jest.MockedFunction<typeof extractVideoPoster>;

function setup(rowOver: Record<string, unknown> | null = {}, scan = false, uploads = true) {
  const row =
    rowOver === null
      ? null
      : {
          id: 'g1',
          userId: 'u1',
          durationS: 5,
          status: AiVideoStatus.COMPLETED,
          outputKey: 'ai-video/u1/g1.mp4',
          ...rowOver,
        };
  const prisma = {
    aiVideoGeneration: { findFirst: jest.fn().mockResolvedValue(row) },
    attachment: { create: jest.fn().mockResolvedValue({ id: 'att1' }) },
  };
  const storage = {
    headSize: jest.fn().mockResolvedValue(4242),
    copy: jest.fn().mockResolvedValue(undefined),
    getBuffer: jest.fn().mockResolvedValue(Buffer.from('mp4')),
  };
  const values: Record<string, unknown> = { attachmentScanEnabled: scan, uploadsEnabled: uploads };
  const config = { get: (k: string) => values[k] };
  const service = new AiVideoAttachmentService(prisma as any, storage as any, config as any);
  return { service, prisma, storage };
}

describe('AiVideoAttachmentService.createFromGeneration [R7]', () => {
  beforeEach(() => {
    poster.mockReset();
    poster.mockResolvedValue({ thumbnail: 'dGh1bWI=', width: 1280, height: 720 });
  });

  it('basari: kopyalar, messageId=null bekleyen ek, aiGenerationId, scan kapali = CLEAN', async () => {
    const { service, prisma, storage } = setup();
    expect(await service.createFromGeneration('u1', 'g1')).toEqual({ attachmentId: 'att1' });
    expect(prisma.aiVideoGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: 'g1', userId: 'u1' },
    });
    const destKey = storage.copy.mock.calls[0][1] as string;
    expect(storage.copy).toHaveBeenCalledWith('ai-video/u1/g1.mp4', destKey);
    expect(destKey).toMatch(/^[0-9a-f]{32}\.mp4$/); // mesaj eki anahtar deseni (buildStorageKey)
    expect(prisma.attachment.create).toHaveBeenCalledWith({
      data: {
        uploaderId: 'u1',
        messageId: null,
        storageKey: destKey,
        filename: 'kankaverse-yz.mp4',
        contentType: 'video/mp4',
        size: 4242,
        durationMs: 5000,
        thumbnail: 'dGh1bWI=',
        width: 1280,
        height: 720,
        aiGenerationId: 'g1',
        scanStatus: ScanStatus.CLEAN,
      },
      select: { id: true },
    });
  });

  it('tarama acik: scanStatus PENDING', async () => {
    const { service, prisma } = setup({}, true);
    await service.createFromGeneration('u1', 'g1');
    expect(prisma.attachment.create.mock.calls[0][0].data.scanStatus).toBe(ScanStatus.PENDING);
  });

  it('baskasinin / olmayan uretim: 404, kopya yok', async () => {
    const { service, storage, prisma } = setup(null);
    await expect(service.createFromGeneration('u2', 'g1')).rejects.toMatchObject({ status: 404 });
    expect(storage.copy).not.toHaveBeenCalled();
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it.each([
    ['COMPLETED degil', { status: AiVideoStatus.RUNNING }],
    ['outputKey bos', { outputKey: null }],
  ])('%s: 409 AI_VIDEO_NOT_READY', async (_n, over) => {
    const { service, storage } = setup(over);
    await expect(service.createFromGeneration('u1', 'g1')).rejects.toMatchObject({
      status: 409,
      response: { error: 'AI_VIDEO_NOT_READY' },
    });
    expect(storage.copy).not.toHaveBeenCalled();
  });

  it('UPLOADS_ENABLED kapali: 403 UPLOADS_DISABLED (presign ile ayni), hicbir sey yapilmaz', async () => {
    const { service, storage, prisma } = setup({}, false, false);
    await expect(service.createFromGeneration('u1', 'g1')).rejects.toMatchObject({
      status: 403,
      response: { error: 'UPLOADS_DISABLED', message: 'Dosya yükleme şu an kapalı.' },
    });
    expect(storage.copy).not.toHaveBeenCalled();
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it('ffmpeg hatasi ek olusturmayi dusurmez: thumbnail/width/height null', async () => {
    poster.mockRejectedValue(new Error('ffmpeg yok'));
    const { service, prisma } = setup();
    await expect(service.createFromGeneration('u1', 'g1')).resolves.toEqual({
      attachmentId: 'att1',
    });
    expect(prisma.attachment.create.mock.calls[0][0].data).toMatchObject({
      thumbnail: null,
      width: null,
      height: null,
    });
  });
});
