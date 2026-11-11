import { ReportsService } from './reports.service';

const prismaMock = {
  report: { create: jest.fn() },
  message: { findUnique: jest.fn() },
};

// E4: kanıt üretimi report-evidence.service.spec.ts'te; burada yalnız snapshot davranışı.
const evidenceMock = { build: jest.fn() };

describe('ReportsService (C35 §5.1 webhook mesajı)', () => {
  let service: ReportsService;

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.report.create.mockResolvedValue({ id: 'rpt-1' });
    evidenceMock.build.mockResolvedValue([]);
    service = new ReportsService(prismaMock as never, evidenceMock as never);
  });

  it('webhook mesajı raporu webhookId ve sorumlu üyeyi (oluşturan) taşır; içerik yok', async () => {
    prismaMock.message.findUnique.mockResolvedValue({ webhookId: 'wh-1', authorId: 'creator-1' });
    await service.create('reporter', { targetType: 'MESSAGE', targetId: 'm1', reason: 'SPAM' });
    const snapshot = prismaMock.report.create.mock.calls[0][0].data.contextSnapshot;
    expect(snapshot).toMatchObject({ webhookId: 'wh-1', responsibleUserId: 'creator-1' });
    expect(Object.keys(snapshot).sort()).toEqual(
      ['reason', 'reportedAt', 'responsibleUserId', 'targetId', 'targetType', 'webhookId'].sort(),
    );
  });

  it('normal mesaj raporunda webhook alanı yok', async () => {
    prismaMock.message.findUnique.mockResolvedValue({ webhookId: null, authorId: 'a' });
    await service.create('reporter', { targetType: 'MESSAGE', targetId: 'm1', reason: 'SPAM' });
    const snapshot = prismaMock.report.create.mock.calls[0][0].data.contextSnapshot;
    expect(snapshot).not.toHaveProperty('webhookId');
    expect(snapshot).not.toHaveProperty('responsibleUserId');
  });

  it('mesaj dışı hedefte mesaj sorgusu açılmaz', async () => {
    await service.create('reporter', { targetType: 'USER', targetId: 'u1', reason: 'SPAM' });
    expect(prismaMock.message.findUnique).not.toHaveBeenCalled();
  });
});
