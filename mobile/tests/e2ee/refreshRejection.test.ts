import { describe, expect, it } from 'vitest';
import { isDefinitiveRefreshRejection, retryTransient } from '../../src/api/refreshRejection';

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

describe('retryTransient', () => {
  const netErr = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

  it('geçici hatadan sonra başarılı olursa sonucu döner', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw netErr;
      return 'ok';
    };
    await expect(retryTransient(fn, [1, 1], isDefinitiveRefreshRejection)).resolves.toBe('ok');
    expect(calls).toBe(3);
  });
  it('kesin hatada tek deneme yapar', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw httpError(401);
    };
    await expect(retryTransient(fn, [1, 1], isDefinitiveRefreshRejection)).rejects.toThrow('HTTP 401');
    expect(calls).toBe(1);
  });
  it('hep geçici hatada 3 deneme sonra hatayı fırlatır', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw netErr;
    };
    await expect(retryTransient(fn, [1, 1], isDefinitiveRefreshRejection)).rejects.toBe(netErr);
    expect(calls).toBe(3);
  });
});
