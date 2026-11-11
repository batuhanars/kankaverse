import { describe, expect, it } from 'vitest';
import { isDefinitiveRefreshRejection } from '../../src/api/refreshRejection';

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

describe('isDefinitiveRefreshRejection', () => {
  it('401, 403 ve NO_REFRESH_TOKEN kesin reddir', () => {
    expect(isDefinitiveRefreshRejection(httpError(401))).toBe(true);
    expect(isDefinitiveRefreshRejection(httpError(403))).toBe(true);
    expect(isDefinitiveRefreshRejection(new Error('NO_REFRESH_TOKEN'))).toBe(true);
  });
  it('ağ hatası, zaman aşımı, 5xx ve geçersiz gövde kesin değildir', () => {
    expect(isDefinitiveRefreshRejection(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))).toBe(false);
    expect(isDefinitiveRefreshRejection(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))).toBe(false);
    expect(isDefinitiveRefreshRejection(httpError(500))).toBe(false);
    expect(isDefinitiveRefreshRejection(httpError(503))).toBe(false);
    expect(isDefinitiveRefreshRejection(httpError(429))).toBe(false);
    expect(isDefinitiveRefreshRejection(new Error('REFRESH_RESPONSE_INVALID'))).toBe(false);
    expect(isDefinitiveRefreshRejection(null)).toBe(false);
    expect(isDefinitiveRefreshRejection(undefined)).toBe(false);
  });
});
