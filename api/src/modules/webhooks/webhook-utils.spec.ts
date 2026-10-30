import { BadRequestException } from '@nestjs/common';
import { maskWebhookPath } from '../../common/utils/webhook-path.util';
import { parseEmbeds } from './webhook-embed.util';
import { isReservedWebhookName, normalizeWebhookName } from './webhook-name.util';
import { WebhookRateLimiter } from './webhook-rate-limiter';
import { generateWebhookToken, hashWebhookToken, webhookTokenMatches } from './webhook-token.util';

describe('webhook-token.util (§2.2)', () => {
  it('32 bayt rastgele, base64url (43 karakter), her seferinde farklı', () => {
    const a = generateWebhookToken();
    const b = generateWebhookToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
  });

  it('DB değeri yalnız SHA-256 özeti: ham token özetin içinde yok', () => {
    const { token, tokenHash } = generateWebhookToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(tokenHash).toBe(hashWebhookToken(token));
  });

  it('doğru token eşleşir, yanlış / boş / uzun / farklı uzunlukta eşleşmez', () => {
    const { token, tokenHash } = generateWebhookToken();
    expect(webhookTokenMatches(token, tokenHash)).toBe(true);
    expect(webhookTokenMatches(token + 'x', tokenHash)).toBe(false);
    expect(webhookTokenMatches('', tokenHash)).toBe(false);
    expect(webhookTokenMatches('a'.repeat(5000), tokenHash)).toBe(false);
  });

  it('özet yoksa (webhook yok/silinmiş) her zaman false, atmaz', () => {
    expect(webhookTokenMatches('whatever', null)).toBe(false);
  });

  it('bozuk saklanan özet (hex olmayan) false döner, atmaz', () => {
    expect(webhookTokenMatches('x', 'zz')).toBe(false);
  });
});

describe('maskWebhookPath (§2.3)', () => {
  it('token maskelenir, id kalır', () => {
    expect(maskWebhookPath('/webhooks/abc123/SECRET_token-1')).toBe('/webhooks/abc123/***');
  });
  it('/api öneki ve sorgu dizesi korunur', () => {
    expect(maskWebhookPath('/api/webhooks/abc/SECRET?wait=true')).toBe(
      '/api/webhooks/abc/***?wait=true',
    );
  });
  it('yönetim yolları ve diğer yollar değişmez', () => {
    expect(maskWebhookPath('/guilds/g1/webhooks/w1/token')).toBe('/guilds/g1/webhooks/w1/token');
    expect(maskWebhookPath('/auth/login')).toBe('/auth/login');
  });
});

describe('webhook-name.util (§3.5)', () => {
  it.each([
    'Kankaverse',
    'KANKAVERSE Destek',
    'kanka verse',
    'Moderatör',
    'MODERATÖR',
    'moderator',
    'Yönetici',
    'YÖNETİCİ',
    'Admin',
    'Sistem',
    'System Bot',
    'Destek Ekibi',
    'Support',
    'Resmi Hesap',
    'Official',
    'k_a_n_k_a_v_e_r_s_e',
  ])('ayrılmış ad reddedilir: %s', (name) => {
    expect(isReservedWebhookName(name)).toBe(true);
  });

  it.each(['GitHub', 'Derleme Botu', 'Haber Akışı', 'Kanka Bot'])('normal ad geçer: %s', (name) => {
    expect(isReservedWebhookName(name)).toBe(false);
  });

  it('Türkçe karakterler ASCII katlanır', () => {
    expect(normalizeWebhookName('İşÇöĞüı')).toBe('iscogui');
  });
});

describe('parseEmbeds (§2.5)', () => {
  const ok = { title: 'T', description: 'D', url: 'https://x.test/a', color: 0xff6b3d };

  it('yok / null → boş', () => {
    expect(parseEmbeds(undefined).embeds).toEqual([]);
    expect(parseEmbeds(null).embeds).toEqual([]);
  });

  it('izinli alanlar saklanır; image/thumbnail/video/ikonlar ATILIR', () => {
    const { embeds } = parseEmbeds([
      {
        ...ok,
        image: { url: 'https://evil.test/i.png' },
        thumbnail: { url: 'https://evil.test/t.png' },
        video: { url: 'https://evil.test/v.mp4' },
        author: { name: 'A', url: 'https://a.test', icon_url: 'https://evil.test/a.png' },
        footer: { text: 'F', icon_url: 'https://evil.test/f.png' },
        fields: [{ name: 'n', value: 'v', inline: true, extra: 1 }],
        timestamp: '2026-10-30T10:00:00Z',
        provider: { name: 'x' },
      },
    ]);
    expect(embeds).toEqual([
      {
        title: 'T',
        description: 'D',
        url: 'https://x.test/a',
        color: 0xff6b3d,
        author: { name: 'A', url: 'https://a.test' },
        fields: [{ name: 'n', value: 'v', inline: true }],
        footer: { text: 'F' },
        timestamp: '2026-10-30T10:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(embeds)).not.toContain('evil.test');
  });

  it('http:// ve https:// url kabul edilir', () => {
    expect(parseEmbeds([{ title: 't', url: 'http://x.test/a' }]).embeds[0].url).toBe(
      'http://x.test/a',
    );
    expect(parseEmbeds([{ title: 't', url: 'https://x.test/a' }]).embeds[0].url).toBe(
      'https://x.test/a',
    );
  });

  it('yalnız görselden oluşan embed boş kalır ve saklanmaz', () => {
    expect(parseEmbeds([{ image: { url: 'https://x.test/i.png' } }]).embeds).toEqual([]);
  });

  it('automod metinleri: başlık, açıklama, yazar, alt bilgi, alan adı/değeri', () => {
    const { texts } = parseEmbeds([
      {
        title: 't',
        description: 'd',
        author: { name: 'a' },
        footer: { text: 'f' },
        fields: [{ name: 'fn', value: 'fv' }],
      },
    ]);
    expect(texts).toEqual(['t', 'd', 'a', 'f', 'fn', 'fv']);
  });

  const bad: [string, unknown][] = [
    ['liste değil', {}],
    ['6 embed', Array.from({ length: 6 }, () => ({ title: 'x' }))],
    ['başlık 257', [{ title: 'x'.repeat(257) }]],
    ['açıklama 2001', [{ description: 'x'.repeat(2001) }]],
    ['ftp url', [{ title: 't', url: 'ftp://x.test' }]],
    ['javascript url', [{ title: 't', url: 'javascript:alert(1)' }]],
    ['color negatif', [{ title: 't', color: -1 }]],
    ['color büyük', [{ title: 't', color: 0x1000000 }]],
    ['color kesirli', [{ title: 't', color: 1.5 }]],
    ['author adı yok', [{ author: { url: 'https://a.test' } }]],
    ['11 alan', [{ fields: Array.from({ length: 11 }, () => ({ name: 'n', value: 'v' })) }]],
    ['alan değeri 1025', [{ fields: [{ name: 'n', value: 'x'.repeat(1025) }] }]],
    ['footer 257', [{ footer: { text: 'x'.repeat(257) } }]],
    ['timestamp bozuk', [{ title: 't', timestamp: 'dün' }]],
    ['embed nesne değil', ['x']],
  ];
  it.each(bad)('sınır aşımı / bozuk: %s → 400 INVALID_EMBED', (_label, input) => {
    try {
      parseEmbeds(input);
      throw new Error('atmalıydı');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({ error: 'INVALID_EMBED' });
    }
  });

  it('toplam metin 6000 üstü → INVALID_EMBED', () => {
    const e = { description: 'x'.repeat(2000) };
    expect(() => parseEmbeds([e, e, e, e])).toThrow(BadRequestException);
    expect(() => parseEmbeds([e, e, e])).not.toThrow();
  });
});

describe('WebhookRateLimiter (§2.7)', () => {
  const WINDOWS = [
    { windowMs: 2000, max: 5 },
    { windowMs: 60_000, max: 30 },
  ];

  it('2 sn içinde 5 geçer, 6. reddedilir ve retryAfter döner', () => {
    const l = new WebhookRateLimiter();
    for (let i = 0; i < 5; i++) expect(l.check('k', WINDOWS, 1000 + i)).toBe(0);
    expect(l.check('k', WINDOWS, 1100)).toBeGreaterThan(0);
  });

  it('pencere dolunca yeniden izin verir', () => {
    const l = new WebhookRateLimiter();
    for (let i = 0; i < 5; i++) l.check('k', WINDOWS, 1000);
    expect(l.check('k', WINDOWS, 1001)).toBeGreaterThan(0);
    expect(l.check('k', WINDOWS, 3100)).toBe(0);
  });

  it('dakikada 30 sınırı', () => {
    const l = new WebhookRateLimiter();
    let t = 0;
    for (let i = 0; i < 30; i++) {
      expect(l.check('k', WINDOWS, t)).toBe(0);
      t += 1500; // 2 sn penceresini hiç doldurma (30 istek < 60 sn)
    }
    expect(l.check('k', WINDOWS, t)).toBeGreaterThan(0);
  });

  it('reddedilen istek pencereyi doldurmaz; anahtarlar bağımsız', () => {
    const l = new WebhookRateLimiter();
    for (let i = 0; i < 5; i++) l.check('a', WINDOWS, 0);
    for (let i = 0; i < 50; i++) l.check('a', WINDOWS, 100);
    expect(l.check('a', WINDOWS, 2001)).toBe(0);
    expect(l.check('b', WINDOWS, 100)).toBe(0);
  });

  it('IP sınırı dakikada 60', () => {
    const l = new WebhookRateLimiter();
    const ip = [{ windowMs: 60_000, max: 60 }];
    for (let i = 0; i < 60; i++) expect(l.check('ip', ip, i)).toBe(0);
    expect(l.check('ip', ip, 100)).toBeGreaterThan(0);
  });
});
