import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ForbiddenException, HttpException } from '@nestjs/common';
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
const membership = { requireChannelAccess: jest.fn(), requireGroupHistoryAccess: jest.fn() };

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
      expect(membership.requireChannelAccess).toHaveBeenCalledWith('rep', 'ch1'); // Rev.1: şifresizde de kapı
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

    it('Rev.1: erişemeyen şikâyetçi (üye değil) şifresiz mesajı şikâyet edemez; bağlam sorgusu açılmaz', async () => {
      prisma.message.findUnique.mockResolvedValue(plain('t', 10));
      membership.requireChannelAccess.mockRejectedValue(
        new HttpException('NOT_CHANNEL_MEMBER', 403),
      );
      await expect(svc.build('rep', 't', undefined)).rejects.toMatchObject({ status: 403 });
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('Rev.1: hedef clearedAt öncesiyse 422; bağlam sorgusu createdAt > clearedAt ile süzülür', async () => {
      prisma.message.findUnique.mockResolvedValue(plain('t', 10));
      prisma.channelMember.findUnique.mockResolvedValue({ clearedAt: at(12) });
      await expect(svc.build('rep', 't', undefined)).rejects.toMatchObject({
        status: 422,
        response: { error: 'REPORT_EVIDENCE_INVALID' },
      });

      prisma.channelMember.findUnique.mockResolvedValue({ clearedAt: at(5) });
      prisma.message.findMany.mockResolvedValue([]);
      await svc.build('rep', 't', undefined);
      expect(prisma.message.findMany.mock.calls[0][0].where.createdAt).toEqual({
        lt: at(10),
        gt: at(5),
      });
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

    it('evidence yok/boş → kanıt satırı yok (erişim kapısı yine uygulanır)', async () => {
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

/** C62 §2.3.c: eski grup üyesi penceresindeki mesajları şikâyet edebilir (T&S: mağdura çıkış yolu). */
describe('ReportEvidenceService: eski grup üyesi (C62 §2.3.c)', () => {
  const LEFT = at(30);
  const CLEARED = at(2);
  let svc: ReportEvidenceService;
  const notMember = () => new ForbiddenException({ message: 'x', error: 'NOT_CHANNEL_MEMBER' });

  function asFormer(clearedAt: Date | null = null) {
    membership.requireChannelAccess.mockRejectedValue(notMember());
    membership.requireGroupHistoryAccess.mockResolvedValue({
      channel: {},
      window: { joinedAt: at(0), leftAt: LEFT, clearedAt },
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    svc = new ReportEvidenceService(prisma as never, membership as never);
  });

  it('pencere içi hedef (leftAt öncesi) şifresiz: kanıt üretilir (201 yolu); üyelik satırı okunmaz', async () => {
    asFormer();
    prisma.message.findUnique.mockResolvedValue(plain('t', 10));
    prisma.message.findMany.mockResolvedValue([plain('c1', 9)]);
    const rows = await svc.build('old', 't', undefined);
    expect(rows.map((r) => r.messageId)).toEqual(['t', 'c1']);
    expect(membership.requireGroupHistoryAccess).toHaveBeenCalledWith('old', 'ch1');
    expect(prisma.channelMember.findUnique).not.toHaveBeenCalled();
  });

  it('bağlam sorgusu leftAt üst sınırı ve clearedAt alt sınırıyla gider (leftAt sonrası satır kanıta girmez)', async () => {
    asFormer(CLEARED);
    prisma.message.findUnique.mockResolvedValue(plain('t', 10));
    prisma.message.findMany.mockResolvedValue([]);
    await svc.build('old', 't', undefined);
    expect(prisma.message.findMany.mock.calls[0][0].where.createdAt).toEqual({
      lt: at(10),
      gt: CLEARED,
      lte: LEFT,
    });
  });

  it('hedef leftAt SONRASI: 422 REPORT_EVIDENCE_INVALID, bağlam sorgusu açılmaz', async () => {
    asFormer();
    prisma.message.findUnique.mockResolvedValue(plain('t', 31));
    await expect(svc.build('old', 't', undefined)).rejects.toMatchObject({
      status: 422,
      response: { error: 'REPORT_EVIDENCE_INVALID' },
    });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('hedef clearedAt öncesi (eski üyenin temizlediği): 422', async () => {
    asFormer(CLEARED);
    prisma.message.findUnique.mockResolvedValue(plain('t', 1));
    await expect(svc.build('old', 't', undefined)).rejects.toMatchObject({ status: 422 });
  });

  it('şifreli kanıt: leftAt sonrası bir mesaj listede varsa 422; hepsi pencere içindeyse kabul', async () => {
    asFormer();
    prisma.message.findUnique.mockResolvedValue(enc('t', 10));
    prisma.message.findMany.mockResolvedValue([enc('t', 10), enc('late', 31)]);
    await expect(svc.build('old', 't', [item('t'), item('late')] as never)).rejects.toMatchObject({
      status: 422,
    });

    prisma.message.findMany.mockResolvedValue([enc('t', 10), enc('early', 9)]);
    const rows = await svc.build('old', 't', [item('t'), item('early')] as never);
    expect(rows.map((r) => r.messageId)).toEqual(['t', 'early']);
  });

  it('yabancı (ayrılma kaydı yok): bugünkü 403 aynen; sorgular açılmaz', async () => {
    membership.requireChannelAccess.mockRejectedValue(notMember());
    membership.requireGroupHistoryAccess.mockRejectedValue(notMember());
    prisma.message.findUnique.mockResolvedValue(plain('t', 10));
    const err = await svc.build('stranger', 't', undefined).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ error: 'NOT_CHANNEL_MEMBER' });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('üyelik kapısı başka hata verirse (yaş kapısı vb.) departure kapısına bakılmaz', async () => {
    membership.requireChannelAccess.mockRejectedValue(
      new ForbiddenException({ message: 'x', error: 'AGE_RESTRICTED' }),
    );
    prisma.message.findUnique.mockResolvedValue(plain('t', 10));
    await expect(svc.build('old', 't', undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect(membership.requireGroupHistoryAccess).not.toHaveBeenCalled();
  });
});
