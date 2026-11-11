import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MessagesExistDto } from './dto/e2ee.dto';
import { E2eeExistsService } from './e2ee-exists.service';

function setup() {
  const prisma = { message: { findMany: jest.fn() } };
  const membership = {
    requireChannelAccess: jest.fn().mockResolvedValue({ id: 'ch', type: 'DM' }),
  };
  return { prisma, membership, svc: new E2eeExistsService(prisma as never, membership as never) };
}

describe('E2eeExistsService (E5a Rev.2 §4.7)', () => {
  it('erişimsiz kanal → 403, veritabanına mesaj sorgusu gitmez', async () => {
    const { prisma, membership, svc } = setup();
    membership.requireChannelAccess.mockRejectedValue(new ForbiddenException('NOT_CHANNEL_MEMBER'));
    await expect(svc.existing('x', 'ch', ['m1'])).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('yalnız o kanalın ve silinmemiş mesajları sorgulanır; yalnız kimlik döner', async () => {
    const { prisma, svc } = setup();
    prisma.message.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm3' }]);
    await expect(svc.existing('u1', 'ch', ['m1', 'm2', 'm3'])).resolves.toEqual({
      existing: ['m1', 'm3'],
    });
    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1', 'm2', 'm3'] }, channelId: 'ch', deletedAt: null },
      select: { id: true },
    });
  });

  it('başka kanalın ya da silinmiş mesajın kimliği dönmez (sorgu koşulu bunu zorlar)', async () => {
    const { prisma, svc } = setup();
    prisma.message.findMany.mockResolvedValue([]); // veritabanı: kimlik başka kanalda / deletedAt dolu
    await expect(svc.existing('u1', 'ch', ['baska-kanal-id', 'silinmis-id'])).resolves.toEqual({
      existing: [],
    });
    const where = prisma.message.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ channelId: 'ch', deletedAt: null });
  });

  it('tekrarlı kimlikler tekilleştirilir', async () => {
    const { prisma, svc } = setup();
    prisma.message.findMany.mockResolvedValue([]);
    await svc.existing('u1', 'ch', ['m1', 'm1', 'm2']);
    expect(prisma.message.findMany.mock.calls[0][0].where.id.in).toEqual(['m1', 'm2']);
  });
});

describe('MessagesExistDto', () => {
  const body = (over: Record<string, unknown> = {}) =>
    plainToInstance(MessagesExistDto, { channelId: 'ckabc123', ids: ['ck1', 'ck2'], ...over });
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `ck${i}`);

  it('geçerli gövde kabul', async () => {
    expect(await validate(body())).toHaveLength(0);
    expect(await validate(body({ ids: ids(500) }))).toHaveLength(0);
  });

  it('501 kimlik, boş dizi, dizi olmayan ve geçersiz kimlik reddedilir', async () => {
    expect((await validate(body({ ids: ids(501) }))).length).toBeGreaterThan(0);
    expect((await validate(body({ ids: [] }))).length).toBeGreaterThan(0);
    expect((await validate(body({ ids: 'ck1' }))).length).toBeGreaterThan(0);
    expect((await validate(body({ ids: ['ok', 'kotu kimlik!'] }))).length).toBeGreaterThan(0);
    expect((await validate(body({ ids: [1] }))).length).toBeGreaterThan(0);
    expect((await validate(body({ channelId: '' }))).length).toBeGreaterThan(0);
  });
});
