import { EmergencyService } from './emergency.service';

// ── Mock Fabrikaları (moderation.service.spec deseni) ──────────────────────────
const prismaMock = {
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  voiceSession: { findFirst: jest.fn() },
  channel: { findUnique: jest.fn() },
  report: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
};

const voiceMock = {
  captureVoiceContext: jest.fn(),
  pullSelfFromVoice: jest.fn(),
};

const realtimeMock = {
  emitToUser: jest.fn(),
  emitToUsers: jest.fn(),
};

describe('EmergencyService (A4 — R7)', () => {
  let service: EmergencyService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new EmergencyService(prismaMock as any, voiceMock as any, realtimeMock as any);
    // Varsayılanlar
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: false });
    prismaMock.user.findMany.mockResolvedValue([{ id: 'mod-1' }]);
    prismaMock.report.create.mockResolvedValue({ id: 'rpt-1' });
    prismaMock.auditLog.create.mockResolvedValue({});
    voiceMock.captureVoiceContext.mockResolvedValue({
      participants: ['u1', 'u2'],
      broadcasters: [{ userId: 'u2', sources: ['camera', 'screen'] }],
    });
    voiceMock.pullSelfFromVoice.mockResolvedValue(undefined);
    prismaMock.report.update.mockResolvedValue({});
  });

  it('aktif ses kanalında: EMERGENCY rapor + priority 100 + targetType CHANNEL', async () => {
    prismaMock.voiceSession.findFirst.mockResolvedValue({ id: 'vs-1' }); // verilen kanalda içeride
    prismaMock.channel.findUnique.mockResolvedValue({ name: 'genel-ses', guildId: 'g-1' });

    await service.trigger('victim-1', 'ch-1');

    const data = prismaMock.report.create.mock.calls[0][0].data;
    expect(data.reason).toBe('EMERGENCY');
    expect(data.priority).toBe(100);
    expect(data.targetType).toBe('CHANNEL');
    expect(data.targetId).toBe('ch-1');
    expect(data.status).toBe('OPEN');
  });

  it('snapshot METADATA-only — içerik/mesaj alanı YOK', async () => {
    prismaMock.voiceSession.findFirst.mockResolvedValue({ id: 'vs-1' });
    prismaMock.channel.findUnique.mockResolvedValue({ name: 'genel-ses', guildId: 'g-1' });

    await service.trigger('victim-1', 'ch-1');

    const snap = prismaMock.report.create.mock.calls[0][0].data.contextSnapshot;
    // İzinli metadata anahtarları dışında alan olmamalı (içerik sızıntısı koruması)
    const allowed = ['presserId', 'isMinor', 'triggeredAt', 'channelId', 'channelName', 'guildId', 'participants', 'broadcasters'];
    expect(Object.keys(snap).every((k) => allowed.includes(k))).toBe(true);
    expect(snap).not.toHaveProperty('content');
    expect(snap).not.toHaveProperty('message');
    expect(snap.participants).toEqual(['u1', 'u2']);
  });

  it('platform eskalasyonu: alarm YALNIZ isModerator kullanıcılara gider (yerel-mod baypas)', async () => {
    prismaMock.voiceSession.findFirst.mockResolvedValue({ id: 'vs-1' });
    prismaMock.channel.findUnique.mockResolvedValue({ name: 'genel-ses', guildId: 'g-1' });

    await service.trigger('victim-1', 'ch-1');

    // user.findMany YALNIZ isModerator:true sorgusuyla çağrıldı
    const findManyArg = prismaMock.user.findMany.mock.calls[0][0];
    expect(findManyArg.where.isModerator).toBe(true);
    // emitToUsers yalnız mod id'leriyle
    const [ids, event] = realtimeMock.emitToUsers.mock.calls[0];
    expect(ids).toEqual(['mod-1']);
    expect(event).toBe('emergency.alert');
  });

  it('anında-çek: aktif kanalda pullSelfFromVoice çağrılır; rapor pull ÖNCESİ oluşur (bağımsızlık)', async () => {
    prismaMock.voiceSession.findFirst.mockResolvedValue({ id: 'vs-1' });
    prismaMock.channel.findUnique.mockResolvedValue({ name: 'genel-ses', guildId: 'g-1' });

    const order: string[] = [];
    prismaMock.report.create.mockImplementation(() => { order.push('report'); return Promise.resolve({ id: 'rpt-1' }); });
    voiceMock.pullSelfFromVoice.mockImplementation(() => { order.push('pull'); return Promise.resolve(); });

    await service.trigger('victim-1', 'ch-1');

    expect(voiceMock.pullSelfFromVoice).toHaveBeenCalledWith('ch-1', 'victim-1');
    expect(order).toEqual(['report', 'pull']); // rapor pull'dan ÖNCE (pull başarısız olsa da rapor durur)
  });

  it('global tetik (aktif ses yok): targetType USER, pull çağrılmaz, snapshot minimal', async () => {
    prismaMock.voiceSession.findFirst.mockResolvedValue(null); // ne verilen kanalda ne de aktif oturum

    await service.trigger('victim-1');

    const data = prismaMock.report.create.mock.calls[0][0].data;
    expect(data.targetType).toBe('USER');
    expect(data.targetId).toBe('victim-1');
    expect(voiceMock.pullSelfFromVoice).not.toHaveBeenCalled();
    expect(Object.keys(data.contextSnapshot).sort()).toEqual(['isMinor', 'presserId', 'triggeredAt']);
  });

  it('minör tetik: snapshot.isMinor=true + audit metadata isMinor=true (triyaj önceliği)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isMinor: true });
    prismaMock.voiceSession.findFirst.mockResolvedValue(null);

    await service.trigger('minor-1');

    expect(prismaMock.report.create.mock.calls[0][0].data.contextSnapshot.isMinor).toBe(true);
    expect(prismaMock.auditLog.create.mock.calls[0][0].data.metadata.isMinor).toBe(true);
  });

  it('trigger dönüşünde reportId var (mağdurun kendi raporu — beyan için)', async () => {
    prismaMock.voiceSession.findFirst.mockResolvedValue(null);
    const res = await service.trigger('victim-1');
    expect(res).toEqual({ acknowledged: true, reportId: 'rpt-1' });
  });

  // ── B1b — Gönüllü beyan ──────────────────────────────────────────────────────
  it('addStatement: kendi EMERGENCY raporu → description güncellenir (trim) + audit', async () => {
    prismaMock.report.findUnique.mockResolvedValue({ reporterId: 'victim-1', reason: 'EMERGENCY' });

    await service.addStatement('victim-1', 'rpt-1', '  odada biri ekranında uygunsuz şey gösterdi  ');

    expect(prismaMock.report.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'rpt-1' },
      data: { description: 'odada biri ekranında uygunsuz şey gösterdi' },
    });
    expect(prismaMock.auditLog.create.mock.calls[0][0].data.action).toBe('emergency.statement_added');
  });

  it('addStatement: BAŞKASININ raporu → 403, güncelleme YOK (varlık sızdırma yok)', async () => {
    prismaMock.report.findUnique.mockResolvedValue({ reporterId: 'someone-else', reason: 'EMERGENCY' });
    await expect(service.addStatement('victim-1', 'rpt-1', 'x')).rejects.toThrow();
    expect(prismaMock.report.update).not.toHaveBeenCalled();
  });

  it('addStatement: EMERGENCY olmayan rapora → 403 (acil-dışı raporlar dokunulamaz)', async () => {
    prismaMock.report.findUnique.mockResolvedValue({ reporterId: 'victim-1', reason: 'HARASSMENT' });
    await expect(service.addStatement('victim-1', 'rpt-1', 'x')).rejects.toThrow();
    expect(prismaMock.report.update).not.toHaveBeenCalled();
  });
});
