import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalProvider } from '@prisma/client';
import {
  headerValue,
  isFreshTimestamp,
  kickSignatureMatches,
  unauthorized,
} from './webhook-signature.util';
import { externalAccountUrl } from '../channel-url.util';
import { AppTokenCache, formBody, requestJson } from './http.util';
import {
  LinkedIdentity,
  RemoteSubscription,
  StreamInfo,
  StreamProvider,
  VerifiedEvent,
} from './stream-provider';

const ID_HOST = 'https://id.kick.com';
const API_HOST = 'https://api.kick.com/public';
const EVENT_NAME = 'livestream.status.updated';
/** Geçersiz imza seli, her istekte Kick'in anahtar ucuna gitmeyi tetiklemesin */
const KEY_REFRESH_MIN_INTERVAL_MS = 60_000;

interface KickEnvelope<T> {
  data: T;
}

/**
 * Kick adaptörü. Belgeler: docs.kick.com (OAuth 2.1 + PKCE S256, `user:read` kapsamı, webhook imzası
 * RSA PKCS#1 v1.5 SHA-256 üzerinde `id.timestamp.gövde`, açık anahtar `GET /public/v1/public-key`).
 * Abonelik UYGULAMA token'ıyla (client credentials) `broadcaster_user_id` verilerek açılır.
 */
@Injectable()
export class KickProvider implements StreamProvider {
  readonly key = 'kick' as const;
  readonly db = ExternalProvider.KICK;
  readonly displayName = 'Kick';
  readonly usesPkce = true;
  private readonly logger = new Logger(KickProvider.name);
  private readonly appToken = new AppTokenCache();
  private publicKeyPem: string | null = null;
  private lastKeyFetchAt = 0;

  constructor(private config: ConfigService) {}

  private get cfg() {
    return this.config.getOrThrow<{
      enabled: boolean;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    }>('streamLink.kick');
  }

  isEnabled(): boolean {
    return this.config.get<boolean>('streamLink.kick.enabled') === true;
  }

  buildAuthorizeUrl(state: string, codeChallenge: string | null): string {
    const params = new URLSearchParams({
      client_id: this.cfg.clientId,
      response_type: 'code',
      redirect_uri: this.cfg.redirectUri,
      scope: 'user:read', // en az kapsam: yalnız kullanıcı kimliği
      code_challenge: codeChallenge ?? '',
      code_challenge_method: 'S256',
      state,
    });
    return `${ID_HOST}/oauth/authorize?${params.toString()}`;
  }

  async identify(code: string, codeVerifier: string): Promise<LinkedIdentity> {
    const tokens = await requestJson<{ access_token: string }>(`${ID_HOST}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        grant_type: 'authorization_code',
        code,
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        redirect_uri: this.cfg.redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    // Token yalnız bu çağrının bellek kapsamında yaşar; hiçbir yere yazılmaz.
    const res = await requestJson<KickEnvelope<{ user_id: number; name: string }[]>>(
      `${API_HOST}/v1/users`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    const user = res.data?.[0];
    if (!user || typeof user.user_id !== 'number' || !user.name) {
      throw new Error('Kick kullanıcı bilgisi okunamadı.');
    }
    return { externalId: String(user.user_id), username: user.name };
  }

  async verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): Promise<VerifiedEvent> {
    const messageId = headerValue(headers, 'kick-event-message-id');
    const timestamp = headerValue(headers, 'kick-event-message-timestamp');
    const signature = headerValue(headers, 'kick-event-signature');
    if (!messageId || !timestamp || !signature) unauthorized();
    if (!isFreshTimestamp(timestamp)) unauthorized();
    if (!(await this.signatureValid(messageId, timestamp, rawBody, signature))) unauthorized();

    if (headerValue(headers, 'kick-event-type') !== EVENT_NAME) {
      return { type: 'ignored', messageId };
    }
    let body: { is_live?: unknown; title?: unknown; broadcaster?: { user_id?: unknown } };
    try {
      body = JSON.parse(rawBody.toString('utf8')) as typeof body;
    } catch {
      return { type: 'ignored', messageId };
    }
    const userId = body.broadcaster?.user_id;
    if (typeof userId !== 'number' && typeof userId !== 'string') {
      return { type: 'ignored', messageId };
    }
    const externalId = String(userId);
    if (body.is_live === true) {
      return {
        type: 'online',
        messageId,
        externalId,
        title: typeof body.title === 'string' ? body.title : null,
      };
    }
    if (body.is_live === false) return { type: 'offline', messageId, externalId };
    return { type: 'ignored', messageId };
  }

  /** Doğrulama başarısızsa anahtar bir kez yenilenip tekrar denenir (rotasyon), en çok dakikada bir. */
  private async signatureValid(
    messageId: string,
    timestamp: string,
    rawBody: Buffer,
    signature: string,
  ): Promise<boolean> {
    const key = await this.getPublicKey(false);
    if (key && kickSignatureMatches(key, messageId, timestamp, rawBody, signature)) return true;
    if (Date.now() - this.lastKeyFetchAt < KEY_REFRESH_MIN_INTERVAL_MS) return false;
    const fresh = await this.getPublicKey(true);
    return !!fresh && kickSignatureMatches(fresh, messageId, timestamp, rawBody, signature);
  }

  private async getPublicKey(force: boolean): Promise<string | null> {
    if (this.publicKeyPem && !force) return this.publicKeyPem;
    this.lastKeyFetchAt = Date.now();
    try {
      const res = await fetch(`${API_HOST}/v1/public-key`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`public-key -> ${res.status}`);
      const text = (await res.text()).trim();
      // Belge ucun biçimini kesinleştirmiyor: düz PEM ya da { data: { public_key } } kabul edilir.
      const pem = text.startsWith('-----BEGIN') ? text : extractPem(text);
      if (!pem) throw new Error('public-key yanıtında PEM bulunamadı');
      this.publicKeyPem = pem;
    } catch (err) {
      this.logger.error(`Kick açık anahtarı alınamadı: ${(err as Error).message}`);
    }
    return this.publicKeyPem;
  }

  private getAppToken(): Promise<string> {
    return this.appToken.get(() =>
      requestJson(`${ID_HOST}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody({
          grant_type: 'client_credentials',
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
        }),
      }),
    );
  }

  private async authed<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAppToken();
    return requestJson<T>(`${API_HOST}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async subscribe(externalId: string): Promise<void> {
    const res = await this.authed<KickEnvelope<{ error?: string }[]>>('/v1/events/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [{ name: EVENT_NAME, version: 1 }],
        method: 'webhook',
        broadcaster_user_id: Number(externalId),
      }),
    });
    const error = res.data?.[0]?.error;
    if (error) throw new Error(`Kick aboneliği açılamadı: ${error}`);
  }

  async listSubscriptions(): Promise<RemoteSubscription[]> {
    const res = await this.authed<
      KickEnvelope<{ id: string; broadcaster_user_id: number; event: string }[]>
    >('/v1/events/subscriptions');
    return (res.data ?? [])
      .filter((s) => s.event === EVENT_NAME)
      .map((s) => ({ id: s.id, externalId: String(s.broadcaster_user_id), healthy: true }));
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    await this.authed(`/v1/events/subscriptions?id=${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
    });
  }

  async fetchStream(externalId: string): Promise<StreamInfo | null> {
    const res = await this.authed<
      KickEnvelope<
        {
          slug: string;
          stream_title: string;
          has_mature_content: boolean;
          category: { id: number; name: string } | null;
        }[]
      >
    >(`/v1/livestreams?broadcaster_user_id=${encodeURIComponent(externalId)}`);
    const live = res.data?.[0];
    if (!live) return null;
    return {
      title: live.stream_title ?? '',
      categoryId: live.category ? String(live.category.id) : null,
      categoryName: live.category?.name ?? null,
      mature: live.has_mature_content === true,
      labels: [],
      channelSlug: live.slug,
    };
  }

  channelUrl(username: string): string {
    return externalAccountUrl(this.db, username);
  }
}

function extractPem(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as {
      data?: { public_key?: string } | string;
      public_key?: string;
    };
    const candidate =
      typeof parsed.data === 'string'
        ? parsed.data
        : (parsed.data?.public_key ?? parsed.public_key);
    return typeof candidate === 'string' && candidate.includes('BEGIN') ? candidate : null;
  } catch {
    return null;
  }
}
