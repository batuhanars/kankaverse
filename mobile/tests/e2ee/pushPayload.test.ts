import { describe, expect, it } from 'vitest';
import { parseE2eePayload } from '../../src/notifications/e2eePayload';

const ok = { ciphertext: 'AAEC', senderDeviceId: 'dev1', createdAt: '2026-11-11T10:00:00.000Z' };

describe('parseE2eePayload', () => {
  it('nesneyi ve JSON metnini çözer', () => {
    expect(parseE2eePayload(ok)).toEqual(ok);
    expect(parseE2eePayload(JSON.stringify(ok))).toEqual(ok);
  });
  it('frankingTag varsa taşır (E4), yoksa ya da string değilse alanı koymaz', () => {
    const tag = 'q'.repeat(43) + '=';
    expect(parseE2eePayload({ ...ok, frankingTag: tag })).toEqual({ ...ok, frankingTag: tag });
    expect(parseE2eePayload(JSON.stringify({ ...ok, frankingTag: tag }))?.frankingTag).toBe(tag);
    expect(parseE2eePayload(ok)).not.toHaveProperty('frankingTag');
    expect(parseE2eePayload({ ...ok, frankingTag: 7 })).not.toHaveProperty('frankingTag');
  });
  it('commits (C66): geçerli diziyi taşır; geçersiz biçim, 2den fazla ya da boş alanı koymaz', () => {
    const c = [{ epoch: 3, commit: 'QUJD' }, { epoch: 4, commit: 'REVG' }];
    expect(parseE2eePayload({ ...ok, commits: c })).toEqual({ ...ok, commits: c });
    expect(parseE2eePayload(JSON.stringify({ ...ok, commits: c }))?.commits).toEqual(c);
    expect(parseE2eePayload(ok)).not.toHaveProperty('commits');
    expect(parseE2eePayload({ ...ok, commits: [...c, c[0]] })).not.toHaveProperty('commits');
    expect(parseE2eePayload({ ...ok, commits: [{ epoch: '3', commit: 'x' }] })).not.toHaveProperty('commits');
    expect(parseE2eePayload({ ...ok, commits: [{ epoch: 3, commit: '' }] })).not.toHaveProperty('commits');
    expect(parseE2eePayload({ ...ok, commits: 'x' })).not.toHaveProperty('commits');
    expect(parseE2eePayload({ ...ok, commits: [] })).not.toHaveProperty('commits');
  });
  it('eksik, boş ve bozuk girdide null döner', () => {
    expect(parseE2eePayload(undefined)).toBeNull();
    expect(parseE2eePayload('{bozuk')).toBeNull();
    expect(parseE2eePayload({ ...ok, ciphertext: '' })).toBeNull();
    expect(parseE2eePayload({ ...ok, senderDeviceId: 5 })).toBeNull();
    expect(parseE2eePayload({ ciphertext: 'x' })).toBeNull();
  });
});
