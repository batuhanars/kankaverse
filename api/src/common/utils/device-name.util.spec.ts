import { resolveDeviceName } from './device-name.util';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const EDGE_WIN = `${CHROME_WIN} Edg/120.0.0.0`;
const FIREFOX_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
const ELECTRON_WIN = `${CHROME_WIN.replace(' Safari/537.36', '')} kankaverse-desktop/1.0.0 Electron/36.0.0 Safari/537.36`;

describe('resolveDeviceName', () => {
  it.each([
    ['Chrome/Windows', CHROME_WIN, 'Chrome · Windows'],
    ['Edge/Windows', EDGE_WIN, 'Edge · Windows'],
    ['Firefox/macOS', FIREFOX_MAC, 'Firefox · macOS'],
    ['Safari/iOS', SAFARI_IOS, 'Safari · iOS'],
    ['Electron/Windows', ELECTRON_WIN, 'Masaüstü uygulaması · Windows'],
    ['Opera/Windows', `${CHROME_WIN} OPR/105.0.0.0`, 'Opera · Windows'],
  ])('%s', (_n, userAgent, expected) => {
    expect(resolveDeviceName({ userAgent })).toBe(expected);
  });

  it('mobil okhttp UA -> Android uygulaması', () => {
    expect(resolveDeviceName({ userAgent: 'okhttp/4.12.0', clientType: 'mobile' })).toBe(
      'Android uygulaması',
    );
  });

  it('mobil + iOS UA -> iOS uygulaması', () => {
    expect(resolveDeviceName({ userAgent: SAFARI_IOS, clientType: 'mobile' })).toBe(
      'iOS uygulaması',
    );
  });

  it('boş UA: web null, mobil Android uygulaması', () => {
    expect(resolveDeviceName({})).toBeNull();
    expect(resolveDeviceName({ userAgent: '   ' })).toBeNull();
    expect(resolveDeviceName({ clientType: 'mobile' })).toBe('Android uygulaması');
  });

  it('tanınmayan UA -> null', () => {
    expect(resolveDeviceName({ userAgent: 'curl/8.0' })).toBeNull();
  });

  it('x-client-device UA ve clientType üzerinde öncelikli', () => {
    expect(
      resolveDeviceName({
        clientDevice: 'Android · Xiaomi Redmi Note 13',
        userAgent: CHROME_WIN,
        clientType: 'mobile',
      }),
    ).toBe('Android · Xiaomi Redmi Note 13');
  });

  it('başlık 60 karaktere kırpılır ve kontrol karakterleri atılır', () => {
    const out = resolveDeviceName({ clientDevice: `A\u0000B\r\n${'x'.repeat(100)}` });
    expect(out).toHaveLength(60);
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\u0000-\u001f]/);
    expect(out?.startsWith('ABxxx')).toBe(true);
  });

  it('boş/yalnız kontrol karakterli başlık yok sayılır', () => {
    expect(resolveDeviceName({ clientDevice: ' \u0007 ', userAgent: CHROME_WIN })).toBe(
      'Chrome · Windows',
    );
  });
});
