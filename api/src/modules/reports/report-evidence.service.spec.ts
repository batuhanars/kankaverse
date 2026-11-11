import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { ReportEvidenceService } from './report-evidence.service';

// Vektör kaynağı: shared/e2ee-core/test/vectors/franking.json (kopya; bkz. e2ee-franking.spec.ts)
const [vec] = JSON.parse(
  readFileSync(join(__dirname, '../../../test/fixtures/franking-vectors.json'), 'utf8'),
) as {
  input: { channelId: string; senderDeviceId: string; body: string; sentAt: number };
  fk: string;
  tag: string;
}[];

const prisma = {
  message: { findUnique: jest.fn(), findMany: jest.fn() },
  channelMember: { findUnique: jest.fn() },
};
const membership = { requireChannelAccess: jest.fn() };

const att = { id: 'att1', contentType: 'image/png', size: 10, storageKey: 'k/att1' };
const at = (min: number) => new Date(Date.UTC(2026, 10, 11, 10, min));

function plain(id: string, min: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    channelId: 'ch1',
    authorId: 'author',
    content: `metin ${id}`,
    encrypted: false,
    senderDeviceId: null,
    frankingTag: null,
    createdAt: at(min),
    attachments: [],
    ...extra,
  };
}

/** Vektörle uyumlu şifreli mesaj: kanal/cihaz sunucu kaydından gelir. */
function enc(id: string, min: number, extra: Record<string, unknown> = {}) {
  return plain(id, min, {
    encrypted: true,
    content: '',
    channelId: vec.input.channelId,
    senderDeviceId: vec.input.senderDeviceId,
    frankingTag: Buffer.from(vec.tag, 'base64'),
    ...extra,
  });
}
const item = (id: string, extra: Record<string, unknown> = {}) => ({
  messageId: id,
  body: vec.input.body,
  sentAt: vec.input.sentAt,
  fk: vec.fk,
  ...extra,
});

describe('ReportEvidenceService (E4 §3.3)', () => {
  let svc: ReportEvidenceService;

  beforeEach(() => {
    jest.resetAllMocks();
    membership.requireChannelAccess.mockResolvedValue({});
    prisma.channelMember.findUnique.mockResolvedValue({ clearedAt: null });
    svc = new ReportEvidenceService(prisma as never, membership as never);
  });

  describe('şifresiz (sunucu okur)', () => {
    it('hedef + önceki 5 sunucudan, verified:true, source:server; evidence YOK SAYILIR', async () => {
      const target = plain('t', 10, { attachments: [att] });
      prisma.message.findUnique.mockResolvedValue(target);
      prisma.message.findMany.mockResolvedValue([1, 2, 3, 4, 5].map((i) => plain(`c${i}`, 10 - i)));

      const rows = await svc.build('rep', 't', [item('uydurma')] as never);

      expect(rows).toHaveLength(6);
      expect(rows[0]).toMatchObject({
        messageId: 't',
        isTarget: true,
        source: 'server',
        verified: true,
        content: 'metin t',
        attachments: [att], // yalnız referans
      });
      expect(rows.slice(1).every((r) => !r.isTarget && r.source === 'server' && r.verified)).toBe(
        true,
      );
      expect(membership.requireChannelAccess).not.toHaveBeenCalled();
      // bağlam sorgusu: aynı kanal, silinmemiş, şifresiz, hedeften önce, 5 adet, yeniden eskiye
      expect(prisma.message.findMany.mock.calls[0][0]).toMatchObject({
        where: {
          channelId: 'ch1',
          deletedAt: null,
          encrypted: false,
          createdAt: { lt: target.createdAt },
        },
        take: 5,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });

    it('hedef silinmiş olsa da kanıta girer (hedef sorgusu deletedAt süzmez)', async () => {
      prisma.message.findUnique.mockResolvedValue(plain('t', 10, { deletedAt: at(11) }));
      prisma.message.findMany.mockResolvedValue([]);
      const rows = await svc.build('rep', 't', undefined);
      expect(rows).toHaveLength(1);
      expect(prisma.message.findUnique.mock.calls[0][0].where).toEqual({ id: 't' });
    });

    it('hedef mesaj yoksa kanıt yok (şikâyet yine oluşur)', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(svc.build('rep', 'yok', [])).resolves.toEqual([]);
    });
  });

  describe('şifreli (şikâyetçi iletir)', () => {
    it('geçerli parmak izi → verified:true, source:reporter, içerik şikâyetçiden', async () => {
      prisma.message.findUnique.mockResolvedValue(enc('t', 10));
      prisma.message.findMany.mockResolvedValue([enc('t', 10)]);

      const rows = await svc.build('rep', 't', [item('t')] as never);

      expect(rows).toEqual([
        expect.objectContaining({
          messageId: 't',
          content: vec.input.body,
          source: 'reporter',
          verified: true,
          isTarget: true,
          messageAt: at(10),
        }),
      ]);
      expect(membership.requireChannelAccess).toHaveBeenCalledWith('rep', 'ch_01');
    });

    it('değiştirilmiş body → verified:false (yine saklanır)', async () => {
      prisma.message.findUnique.mockResolvedValue(enc('t', 10));
      prisma.message.findMany.mockResolvedValue([enc('t', 10)]);
      const rows = await svc.build('rep', 't', [item('t', { body: 'sahte' })] as never);
      expect(rows[0]).toMatchObject({ verified: false, content: 'sahte', source: 'reporter' });
    });

    it('canon cihazı SUNUCU kaydından: başka cihazda üretilmiş tag doğrulanmaz', async () => {
      prisma.message.findUnique.mockResolvedValue(enc('t', 10, { senderDeviceId: 'baska' }));
      prisma.message.findMany.mockResolvedValue([enc('t', 10, { senderDeviceId: 'baska' })]);
      const rows = await svc.build('rep', 't', [item('t')] as never);
      expect(rows[0].verified).toBe(false);
    });

    it('fk yok ya da mesajda frankingTag yok (v1) → verified:false', async () => {
      prisma.message.findUnique.mockResolvedValue(enc('t', 10));
      prisma.message.findMany.mockResolvedValue([enc('t', 10)]);
      expect(
        (await svc.build('rep', 't', [item('t', { fk: undefined })] as never))[0].verified,
      ).toBe(false);
      prisma.message.findMany.mockResolvedValue([enc('t', 10, { frankingTag: null })]);
      expect((await svc.build('rep', 't', [item('t')] as never))[0].verified).toBe(false);
    });

    it('evidence yok/boş → kanıt satırı yok, üyelik sorgusu bile açılmaz', async () => {
      prisma.message.findUnique.mockResolvedValue(enc('t', 10));
      await expect(svc.build('rep', 't', undefined)).resolves.toEqual([]);
      await expect(svc.build('rep', 't', [])).resolves.toEqual([]);
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('şikâyetçi kanal üyesi değil → mevcut yetki hatası (requireChannelAccess) aynen yayılır', async () => {
      prisma.message.findUnique.mockResolvedValue(enc('t', 10));
      membership.requireChannelAccess.mockRejectedValue(
        new HttpException('NOT_CHANNEL_MEMBER', 403),
      );
      await expect(svc.build('rep', 't', [item('t')] as never)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('başka kanalın mesajı → 422 REPORT_EVIDENCE_INVALID', async () => {
      prisma.message.findUnique.mockResolvedValue(enc('t', 10));
      prisma.message.findMany.mockResolvedValue([
        enc('t', 10),
        enc('x', 9, { channelId: 'baska-kanal' }),
      ]);
      await expect(svc.build('rep', 't', [item('t'), item('x')] as never)).rejects.toMatchObject({
        status: 422,
        response: { error: 'REPORT_EVIDENCE_INVALID' },
      });
    });

    it('listede hedef yok / yinelenen / var olmayan / şifresiz mesaj → 422', async () => {
      prisma.message.findUnique.mockResolvedValue(enc('t', 10));
      prisma.message.findMany.mockResolvedValue([enc('a', 9)]);
      await expect(svc.build('rep', 't', [item('a')] as never)).rejects.toMatchObject({
        status: 422,
      });
      await expect(svc.build('rep', 't', [item('t'), item('t')] as never)).rejects.toMatchObject({
        status: 422,
      });
      prisma.message.findMany.mockResolvedValue([enc('t', 10)]); // 'yok' dönmedi
      await expect(svc.build('rep', 't', [item('t'), item('yok')] as never)).rejects.toMatchObject({
        status: 422,
      });
      prisma.message.findMany.mockResolvedValue([
        enc('t', 10),
        plain('p', 9, { channelId: 'ch_01' }),
      ]);
      await expect(svc.build('rep', 't', [item('t'), item('p')] as never)).rejects.toMatchObject({
        status: 422,
      });
    });

    it('şikâyetçinin "sohbeti temizle" tarihinden önceki mesaj erişilemez → 422', async () => {
      prisma.message.findUnique.mockResolvedValue(enc('t', 10));
      prisma.message.findMany.mockResolvedValue([enc('t', 10), enc('eski', 1)]);
      prisma.channelMember.findUnique.mockResolvedValue({ clearedAt: at(5) });
      await expect(svc.build('rep', 't', [item('t'), item('eski')] as never)).rejects.toMatchObject(
        {
          status: 422,
        },
      );
    });
  });
});
