import { describe, expect, it } from 'vitest';
import { parseE2eePayload } from '../../src/notifications/e2eePayload';

const ok = { ciphertext: 'AAEC', senderDeviceId: 'dev1', createdAt: '2026-11-11T10:00:00.000Z' };

describe('parseE2eePayload', () => {
  it('nesneyi ve JSON metnini çözer', () => {
    expect(parseE2eePayload(ok)).toEqual(ok);
    expect(parseE2eePayload(JSON.stringify(ok))).toEqual(ok);
  });
  it('eksik, boş ve bozuk girdide null döner', () => {
    expect(parseE2eePayload(undefined)).toBeNull();
    expect(parseE2eePayload('{bozuk')).toBeNull();
    expect(parseE2eePayload({ ...ok, ciphertext: '' })).toBeNull();
    expect(parseE2eePayload({ ...ok, senderDeviceId: 5 })).toBeNull();
    expect(parseE2eePayload({ ciphertext: 'x' })).toBeNull();
  });
});
