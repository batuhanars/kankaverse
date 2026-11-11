import { ReportEvidencePurgeJob } from './report-evidence-purge.job';

const prisma = { reportEvidence: { deleteMany: jest.fn() } };

describe('ReportEvidencePurgeJob (E4 §3.4)', () => {
  let job: ReportEvidencePurgeJob;
  beforeEach(() => {
    jest.resetAllMocks();
    job = new ReportEvidencePurgeJob(prisma as never);
  });

  it('yalnız evidencePurgeAt < now olan raporların kanıtını siler (dolmayan/boş tarihe dokunmaz)', async () => {
    prisma.reportEvidence.deleteMany.mockResolvedValue({ count: 7 });
    const now = new Date('2026-11-11T03:00:00Z');
    await expect(job.purge(now)).resolves.toBe(7);
    // `lt` NULL ile eşleşmez: kapanmamış rapor (evidencePurgeAt null) silinmez
    expect(prisma.reportEvidence.deleteMany).toHaveBeenCalledWith({
      where: { report: { evidencePurgeAt: { lt: now } } },
    });
  });

  it('run() yalnız sayıyı loglar; hata işi düşürmez', async () => {
    prisma.reportEvidence.deleteMany.mockRejectedValue(new Error('db'));
    await expect(job.run()).resolves.toBeUndefined();
  });
});
