// [D91] Oturum listesinde gösterilen kısa cihaz adı. Saf fonksiyon, bağımlılık yok.
// Öncelik: istemcinin kendi bildirdiği ad (x-client-device, yalnız mobil) → User-Agent ayrıştırma → null.
const MAX_DEVICE_LENGTH = 60;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

export interface DeviceNameInput {
  clientDevice?: string;
  userAgent?: string;
  clientType?: 'mobile' | null;
}

function sanitizeClientDevice(raw: string | undefined): string | null {
  if (!raw) return null;
  const clean = raw.replace(CONTROL_CHARS, '').trim().slice(0, MAX_DEVICE_LENGTH).trim();
  return clean.length > 0 ? clean : null;
}

// Sıra önemli: Edge/Opera UA'sı "Chrome", Chrome UA'sı "Safari" içerir.
function detectBrowser(ua: string): string | null {
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return null;
}

// iOS, "like Mac OS X" içerdiği için macOS'tan önce; Android UA'sı "Linux" içerir.
function detectOs(ua: string): string | null {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macOS';
  if (/Linux|X11/.test(ua)) return 'Linux';
  return null;
}

function fromUserAgent(ua: string, clientType: 'mobile' | null): string | null {
  const os = detectOs(ua);
  if (/Electron\//.test(ua)) return os ? `Masaüstü uygulaması · ${os}` : 'Masaüstü uygulaması';
  if (clientType === 'mobile') return os === 'iOS' ? 'iOS uygulaması' : 'Android uygulaması';
  const browser = detectBrowser(ua);
  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os;
}

export function resolveDeviceName(input: DeviceNameInput): string | null {
  const fromClient = sanitizeClientDevice(input.clientDevice);
  if (fromClient) return fromClient;
  const ua = input.userAgent?.trim() ?? '';
  const clientType = input.clientType ?? null;
  if (!ua) return clientType === 'mobile' ? 'Android uygulaması' : null;
  return fromUserAgent(ua, clientType);
}
