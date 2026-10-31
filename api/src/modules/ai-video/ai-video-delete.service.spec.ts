import { AiVideoStatus } from '@prisma/client';
import { AiVideoDeleteService } from './ai-video-delete.service';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  userId: 'u1',
  status: AiVideoStatus.COMPLETED,
  outputKey: 'ai-video/u1/g1.mp4',
  inputKey: 'ai-input/u1/a.png',
  providerJobId: 'media_1',
  references: null,
  ...over,
});

function setup(rows: unknown[]) {
  const prisma = {
    aiVideoGeneration: {
      findFirst: jest.fn().mockResolvedValue(rows[0] ?? null),
      findMany: jest.fn().mockResolvedValue(rows),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const storage = { delete: jest.fn().mockResolvedValue(undefined) };
  const pika = { deleteJob: jest.fn().mockResolvedValue(undefined), discardPartial: jest.fn() };
  const service = new AiVideoDeleteService(prisma as any, storage as any, pika as any);
  return { service, prisma, storage, pika };
}

describe('AiVideoDeleteService', () => {
  it('tek silme: objeler + Pika isi silinir, satir yumusak silinir', async () => {
    const s = setup([row()]);
    await s.service.deleteOne('u1', 'g1');
    expect(s.storage.delete).toHaveBeenCalledWith('ai-video/u1/g1.mp4');
    expect(s.storage.delete).toHaveBeenCalledWith('ai-input/u1/a.png');
    expect(s.pika.deleteJob).toHaveBeenCalledWith('media_1');
    const data = s.prisma.aiVideoGeneration.update.mock.calls[0][0].data;
    expect(data.outputKey).toBeNull();
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it.each([AiVideoStatus.QUEUED, AiVideoStatus.RUNNING])('%s: 409 AI_VIDEO_BUSY', async (st) => {
    const s = setup([row({ status: st })]);
    await expect(s.service.deleteOne('u1', 'g1')).rejects.toMatchObject({
      response: { error: 'AI_VIDEO_BUSY' },
    });
    expect(s.prisma.aiVideoGeneration.update).not.toHaveBeenCalled();
  });

  it('baskasinin / yok satir: 404 (sahiplik sorguda)', async () => {
    const s = setup([]);
    await expect(s.service.deleteOne('u2', 'g1')).rejects.toThrow('bulunamadı');
    expect(s.prisma.aiVideoGeneration.findFirst.mock.calls[0][0].where).toEqual({
      id: 'g1',
      userId: 'u2',
      deletedAt: null,
    });
  });

  it('C42: tum referans anahtarlari silinir, biri patlasa digerleri silinir', async () => {
    const references = [
      { kind: 'image', key: 'ai-input/u1/r1.png' },
      { kind: 'video', key: 'ai-input/u1/r2.mp4' },
      { kind: 'audio', key: 'ai-input/u1/r3.mp3' },
    ];
    const s = setup([row({ inputKey: null, references })]);
    s.storage.delete.mockImplementation((k: string) =>
      k.endsWith('.mp4') ? Promise.reject(new Error('s3')) : Promise.resolve(),
    );
    await s.service.deleteOne('u1', 'g1');
    for (const r of references) expect(s.storage.delete).toHaveBeenCalledWith(r.key);
    expect(s.prisma.aiVideoGeneration.update).toHaveBeenCalledTimes(1);
  });

  it('obje ve Pika silme hatasi islemi dusurmez', async () => {
    const s = setup([row()]);
    s.storage.delete.mockRejectedValue(new Error('s3'));
    s.pika.deleteJob.mockRejectedValue(new Error('pika'));
    await expect(s.service.deleteOne('u1', 'g1')).resolves.toBeUndefined();
    expect(s.prisma.aiVideoGeneration.update).toHaveBeenCalledTimes(1);
  });

  it('toplu: yalniz QUEUED/RUNNING olmayan, silinmemis satirlar sorgulanir; sayi doner', async () => {
    const s = setup([row(), row({ id: 'g2', outputKey: null, inputKey: null })]);
    await expect(s.service.deleteAll('u1')).resolves.toEqual({ deleted: 2 });
    expect(s.prisma.aiVideoGeneration.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      deletedAt: null,
      status: { notIn: [AiVideoStatus.QUEUED, AiVideoStatus.RUNNING] },
    });
    expect(s.prisma.aiVideoGeneration.update).toHaveBeenCalledTimes(2);
  });
});
