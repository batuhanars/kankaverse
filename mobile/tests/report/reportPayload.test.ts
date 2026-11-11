import { describe, expect, it, vi } from 'vitest';
import {
  buildReportPayload,
  canReportMessage,
  gatherEvidence,
  type EvidenceCandidate,
} from '../../src/utils/reportPayload';

const msg = (n: number, encrypted = true, localStatus?: 'sending' | 'failed'): EvidenceCandidate => ({
  id: `m${n}`,
  createdAt: new Date(1_700_000_000_000 + n * 1000).toISOString(),
  encrypted,
  localStatus,
});
const evidenceOf = (ids: string[]) => ids.map((id) => ({ messageId: id, body: `b-${id}`, sentAt: 1, fk: 'fk' }));
const target = { targetType: 'MESSAGE' as const, targetId: 'm7', channelId: 'c1' };
const noLog = () => {};

describe('gatherEvidence', () => {
  it('sifreli mesajda hedef + onceki mesajlar motora verilir, kanit doludur (<= 6)', async () => {
    const list = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => msg(n));
    const collect = vi.fn(async (_c: string, _t: string, older: EvidenceCandidate[]) =>
      evidenceOf(['m7', ...older.slice(-5).map((m) => m.id)]),
    );
    const out = await gatherEvidence(target, list, collect, noLog);
    expect(collect).toHaveBeenCalledOnce();
    const [channelId, targetId, older] = collect.mock.calls[0];
    expect(channelId).toBe('c1');
    expect(targetId).toBe('m7');
    expect(older.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']); // yalniz hedeften onceki
    expect(out).toHaveLength(6);
    expect(out?.[0].messageId).toBe('m7');
  });

  it('gonderilmemis (yerel) mesajlar baglama girmez', async () => {
    const list = [msg(1), msg(2, true, 'sending'), msg(3, true, 'failed'), msg(7)];
    const collect = vi.fn(async () => evidenceOf(['m7']));
    await gatherEvidence(target, list, collect, noLog);
    expect(collect.mock.calls[0][2].map((m) => m.id)).toEqual(['m1']);
  });

  it('sifresiz mesajda kanit gonderilmez, motor cagrilmaz', async () => {
    const list = [msg(6, false), msg(7, false)];
    const collect = vi.fn(async () => evidenceOf(['m7']));
    expect(await gatherEvidence(target, list, collect, noLog)).toBeUndefined();
    expect(collect).not.toHaveBeenCalled();
  });

  it('MESSAGE olmayan hedefte ya da kanalsiz kanit yok', async () => {
    const collect = vi.fn(async () => evidenceOf(['m7']));
    const list = [msg(7)];
    expect(await gatherEvidence({ targetType: 'USER', targetId: 'u1' }, list, collect, noLog)).toBeUndefined();
    expect(await gatherEvidence({ targetType: 'MESSAGE', targetId: 'm7' }, list, collect, noLog)).toBeUndefined();
    expect(collect).not.toHaveBeenCalled();
  });

  it('hedef listede yoksa kanit yok', async () => {
    const collect = vi.fn(async () => evidenceOf(['m7']));
    expect(await gatherEvidence(target, [msg(1)], collect, noLog)).toBeUndefined();
    expect(collect).not.toHaveBeenCalled();
  });

  it('collectEvidence hata verirse kanit undefined doner ve hata loglanir (sikayet engellenmez)', async () => {
    const boom = new Error('depo bozuk');
    const log = vi.fn();
    const out = await gatherEvidence(target, [msg(6), msg(7)], async () => Promise.reject(boom), log);
    expect(out).toBeUndefined();
    expect(log).toHaveBeenCalledWith(boom);
  });

  it('motor bos dizi dondururse kanit undefined', async () => {
    expect(await gatherEvidence(target, [msg(7)], async () => [], noLog)).toBeUndefined();
  });
});

describe('buildReportPayload', () => {
  it('sifreli: evidence dolu gider', () => {
    const ev = evidenceOf(['m7', 'm6']);
    const p = buildReportPayload(target, 'HARASSMENT', '  detay  ', ev);
    expect(p).toEqual({
      targetType: 'MESSAGE',
      targetId: 'm7',
      reason: 'HARASSMENT',
      description: 'detay',
      evidence: ev,
    });
  });

  it('sifresiz: evidence yok, bos aciklama gonderilmez; kanalId yuke girmez', () => {
    const p = buildReportPayload(target, 'SPAM', '   ', undefined);
    expect(p.evidence).toBeUndefined();
    expect(p.description).toBeUndefined();
    expect('channelId' in p).toBe(false);
  });
});

describe('canReportMessage', () => {
  it('kendi mesajinda sikayet ogesi yok', () => {
    expect(canReportMessage('me', 'me')).toBe(false);
  });
  it('baskasinin mesajinda var', () => {
    expect(canReportMessage('other', 'me')).toBe(true);
  });
  it('gonderilmemis yerel mesajda ve oturumsuzken yok', () => {
    expect(canReportMessage('other', 'me', 'sending')).toBe(false);
    expect(canReportMessage('other', undefined)).toBe(false);
  });
});
