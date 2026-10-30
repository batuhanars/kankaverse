import { generateKeyPairSync, createHmac, sign } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { KickProvider } from './kick.provider';
import { TwitchProvider } from './twitch.provider';

const SECRET = 'test-eventsub-secret-0123456789';

function makeConfig(): ConfigService {
  const values: Record<string, unknown> = {
    'streamLink.kick': {
      enabled: true,
      clientId: 'k',
      clientSecret: 's',
      redirectUri: 'https://x/cb',
    },
    'streamLink.kick.enabled': true,
    'streamLink.twitch': {
      enabled: true,
      clientId: 't',
      clientSecret: 's',
      redirectUri: 'https://x/cb',
      eventsubSecret: SECRET,
    },
    'streamLink.twitch.enabled': true,
  };
  return { get: (k: string) => values[k], getOrThrow: (k: string) => values[k] } as ConfigService;
}

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

describe('KickProvider.verifyWebhook (C36 §3.1)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let fetchMock: jest.SpyInstance;
  let provider: KickProvider;

  const body = (isLive: boolean) =>
    Buffer.from(
      JSON.stringify({
        broadcaster: { user_id: 42, username: 'Yayinci', channel_slug: 'yayinci' },
        is_live: isLive,
        title: 'Baslik',
      }),
    );
  function signed(id: string, ts: string, raw: Buffer, key = privateKey) {
    return sign('RSA-SHA256', Buffer.concat([Buffer.from(`${id}.${ts}.`), raw]), key).toString(
      'base64',
    );
  }
  function headers(id: string, ts: string, sig: string, type = 'livestream.status.updated') {
    return {
      'kick-event-message-id': id,
      'kick-event-message-timestamp': ts,
      'kick-event-signature': sig,
      'kick-event-type': type,
    };
  }

  beforeEach(() => {
    provider = new KickProvider(makeConfig());
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(pem, { status: 200 }));
  });
  afterEach(() => jest.restoreAllMocks());

  it('geçerli imza + yayın başladı → online olayı', async () => {
    const raw = body(true);
    const ts = iso();
    const ev = await provider.verifyWebhook(headers('m1', ts, signed('m1', ts, raw)), raw);
    expect(ev).toEqual({ type: 'online', messageId: 'm1', externalId: '42', title: 'Baslik' });
  });

  it('yayın bitti → offline olayı', async () => {
    const raw = body(false);
    const ts = iso();
    const ev = await provider.verifyWebhook(headers('m2', ts, signed('m2', ts, raw)), raw);
    expect(ev.type).toBe('offline');
  });

  it('başka anahtarla atılmış imza 401', async () => {
    const raw = body(true);
    const ts = iso();
    await expect(
      provider.verifyWebhook(headers('m1', ts, signed('m1', ts, raw, other.privateKey)), raw),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('gövde değişirse (imza bozulur) 401', async () => {
    const raw = body(true);
    const ts = iso();
    const sig = signed('m1', ts, raw);
    await expect(
      provider.verifyWebhook(headers('m1', ts, sig), body(false)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('mesaj kimliği imzaya dahil: farklı kimlikle 401', async () => {
    const raw = body(true);
    const ts = iso();
    await expect(
      provider.verifyWebhook(headers('m-baska', ts, signed('m1', ts, raw)), raw),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('5 dakikadan eski zaman damgası, imza geçerli olsa da 401', async () => {
    const raw = body(true);
    const ts = iso(-6 * 60 * 1000);
    await expect(
      provider.verifyWebhook(headers('m1', ts, signed('m1', ts, raw)), raw),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('eksik başlık 401, anahtar ucuna hiç gidilmez', async () => {
    await expect(provider.verifyWebhook({}, body(true))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('anahtar rotasyonu: önbellekteki eski anahtar düşünce bir kez yenilenir', async () => {
    const raw = body(true);
    const ts = iso();
    // Önbelleğe ESKİ anahtar girer (eski anahtarla imzalı bir mesajla)
    fetchMock.mockResolvedValueOnce(
      new Response(other.publicKey.export({ type: 'spki', format: 'pem' }).toString(), {
        status: 200,
      }),
    );
    await provider.verifyWebhook(headers('m0', ts, signed('m0', ts, raw, other.privateKey)), raw);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Kick anahtarı döndürdü; yenileme aralığı geçmiş
    (provider as unknown as { lastKeyFetchAt: number }).lastKeyFetchAt = 0;
    await expect(
      provider.verifyWebhook(headers('m1', ts, signed('m1', ts, raw)), raw),
    ).resolves.toMatchObject({ type: 'online' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('geçersiz imza seli anahtar ucunu dakikada birden fazla çağırmaz', async () => {
    const raw = body(true);
    const ts = iso();
    for (let i = 0; i < 5; i++) {
      await expect(
        provider.verifyWebhook(headers('m1', ts, signed('m1', ts, raw, other.privateKey)), raw),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('JSON sarmalı public-key yanıtı da kabul edilir', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { public_key: pem }, message: 'OK' }), {
        status: 200,
      }),
    );
    const raw = body(true);
    const ts = iso();
    await expect(
      provider.verifyWebhook(headers('m1', ts, signed('m1', ts, raw)), raw),
    ).resolves.toMatchObject({ type: 'online' });
  });

  it('başka olay türü yok sayılır (imza yine de doğrulanır)', async () => {
    const raw = body(true);
    const ts = iso();
    const ev = await provider.verifyWebhook(
      headers('m1', ts, signed('m1', ts, raw), 'chat.message.sent'),
      raw,
    );
    expect(ev.type).toBe('ignored');
  });
});

describe('TwitchProvider.verifyWebhook (C36 §3.2)', () => {
  const provider = new TwitchProvider(makeConfig());
  const hmac = (id: string, ts: string, raw: Buffer, secret = SECRET) =>
    'sha256=' + createHmac('sha256', secret).update(id).update(ts).update(raw).digest('hex');
  const hdr = (id: string, ts: string, sig: string, type: string) => ({
    'twitch-eventsub-message-id': id,
    'twitch-eventsub-message-timestamp': ts,
    'twitch-eventsub-message-signature': sig,
    'twitch-eventsub-message-type': type,
  });
  const notification = Buffer.from(
    JSON.stringify({
      subscription: { type: 'stream.online' },
      event: { broadcaster_user_id: '99', type: 'live' },
    }),
  );

  it('geçerli HMAC + stream.online → online olayı', async () => {
    const ts = iso();
    const ev = await provider.verifyWebhook(
      hdr('t1', ts, hmac('t1', ts, notification), 'notification'),
      notification,
    );
    expect(ev).toEqual({ type: 'online', messageId: 't1', externalId: '99', title: null });
  });

  it('yanlış sırla üretilmiş imza 401', async () => {
    const ts = iso();
    await expect(
      provider.verifyWebhook(
        hdr('t1', ts, hmac('t1', ts, notification, 'baska-sir-baska-sir'), 'notification'),
        notification,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sha256= öneki olmayan / kısa imza 401 (timingSafeEqual uzunluk hatası fırlatmaz)', async () => {
    const ts = iso();
    await expect(
      provider.verifyWebhook(hdr('t1', ts, 'abc', 'notification'), notification),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('eski zaman damgası 401', async () => {
    const ts = iso(-6 * 60 * 1000);
    await expect(
      provider.verifyWebhook(
        hdr('t1', ts, hmac('t1', ts, notification), 'notification'),
        notification,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('webhook_callback_verification → challenge (imza doğrulandıktan sonra)', async () => {
    const raw = Buffer.from(JSON.stringify({ challenge: 'pogchamp-kappa-360' }));
    const ts = iso();
    const ev = await provider.verifyWebhook(
      hdr('t2', ts, hmac('t2', ts, raw), 'webhook_callback_verification'),
      raw,
    );
    expect(ev).toEqual({ type: 'challenge', challenge: 'pogchamp-kappa-360' });
  });

  it('imzasız challenge isteği 401 (challenge yansıtılmaz)', async () => {
    const raw = Buffer.from(JSON.stringify({ challenge: 'x' }));
    await expect(
      provider.verifyWebhook(
        hdr('t2', iso(), 'sha256=' + '0'.repeat(64), 'webhook_callback_verification'),
        raw,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revocation → revocation olayı; live olmayan yayın türü yok sayılır', async () => {
    const rev = Buffer.from(
      JSON.stringify({ subscription: { condition: { broadcaster_user_id: '99' } } }),
    );
    const ts = iso();
    const ev = await provider.verifyWebhook(hdr('t3', ts, hmac('t3', ts, rev), 'revocation'), rev);
    expect(ev).toEqual({ type: 'revocation', messageId: 't3', externalId: '99' });

    const rerun = Buffer.from(
      JSON.stringify({
        subscription: { type: 'stream.online' },
        event: { broadcaster_user_id: '99', type: 'rerun' },
      }),
    );
    const ev2 = await provider.verifyWebhook(
      hdr('t4', ts, hmac('t4', ts, rerun), 'notification'),
      rerun,
    );
    expect(ev2.type).toBe('ignored');
  });
});
