import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MessagesExistDto } from './dto/e2ee.dto';
import { E2eeExistsService } from './e2ee-exists.service';

function setup() {
  const prisma = {
    message: { findMany: jest.fn() },
    channelMember: { findFirst: jest.fn().mockResolvedValue({ clearedAt: null }) },
  };
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

  it('E5b §3.3: clearedAt varsa öncesi "yok" sayılır (temizlenen mesaj yedeğe/aktarıma girmez)', async () => {
    const { prisma, svc } = setup();
    const clearedAt = new Date('2026-11-12T10:00:00Z');
    prisma.channelMember.findFirst.mockResolvedValue({ clearedAt });
    prisma.message.findMany.mockResolvedValue([]);
    await svc.existing('u1', 'ch', ['m1']);
    expect(prisma.channelMember.findFirst).toHaveBeenCalledWith({
      where: { channelId: 'ch', userId: 'u1' },
      select: { clearedAt: true },
    });
    expect(prisma.message.findMany.mock.calls[0][0].where).toMatchObject({
      channelId: 'ch',
      deletedAt: null,
      createdAt: { gt: clearedAt },
    });
  });

  it('clearedAt yoksa tarih koşulu eklenmez (eski davranış)', async () => {
    const { prisma, svc } = setup();
    prisma.message.findMany.mockResolvedValue([]);
    await svc.existing('u1', 'ch', ['m1']);
    expect(prisma.message.findMany.mock.calls[0][0].where).not.toHaveProperty('createdAt');
  });

  it('tekrarlı kimlikler tekilleştirilir', async () => {
    const { prisma, svc } = setup();
    prisma.message.findMany.mockResolvedValue([]);
    await svc.existing('u1', 'ch', ['m1', 'm1', 'm2']);
    expect(prisma.message.findMany.mock.calls[0][0].where.id.in).toEqual(['m1', 'm2']);
  });

  it('E7 §5.4: meta istenmezse yanıtta meta alanı yok (eski istemci aynı yanıtı alır)', async () => {
    const { prisma, svc } = setup();
    prisma.message.findMany.mockResolvedValue([{ id: 'm1' }]);
    const r = await svc.existing('u1', 'ch', ['m1']);
    expect(r).toEqual({ existing: ['m1'] });
    expect(prisma.message.findMany.mock.calls[0][0].select).toEqual({ id: true });
  });

  it('E7 §5.4: meta istenirse yazan + zaman döner, içerik seçilmez, kapılar aynı', async () => {
    const { prisma, svc } = setup();
    const clearedAt = new Date('2026-11-12T10:00:00Z');
    prisma.channelMember.findFirst.mockResolvedValue({ clearedAt });
    const row = {
      id: 'm1',
      createdAt: new Date('2026-11-20T10:00:00Z'),
      author: { id: 'u2', username: 'ayse', avatarUrl: null, avatarAnimatedUrl: null },
    };
    prisma.message.findMany.mockResolvedValue([row]);
    await expect(svc.existing('u1', 'ch', ['m1', 'silinmis'], true)).resolves.toEqual({
      existing: ['m1'],
      meta: [row],
    });
    const call = prisma.message.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      channelId: 'ch',
      deletedAt: null,
      createdAt: { gt: clearedAt },
    });
    expect(Object.keys(call.select as Record<string, unknown>).sort()).toEqual([
      'author',
      'createdAt',
      'id',
    ]);
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

  it('meta isteğe bağlı ve yalnız boolean', async () => {
    expect(await validate(body({ meta: true }))).toHaveLength(0);
    expect((await validate(body({ meta: 'evet' }))).length).toBeGreaterThan(0);
  });
});
