import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalProvider } from '@prisma/client';
import {
  headerValue,
  isFreshTimestamp,
  twitchSignatureMatches,
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

const ID_HOST = 'https://id.twitch.tv/oauth2';
const API_HOST = 'https://api.twitch.tv/helix';
const EVENT_TYPE = 'stream.online';
/** Twitch'in kalıcı düşürdüğü abonelik durumları: yeniden açılmaları gerekir */
const HEALTHY_STATUSES = new Set(['enabled', 'webhook_callback_verification_pending']);

interface TwitchList<T> {
  data: T[];
  pagination?: { cursor?: string };
}

/**
 * Twitch adaptörü. Belgeler: dev.twitch.tv (authorization code flow, PKCE YOK; EventSub webhook
 * taşıması uygulama token'ı ister; `stream.online` yetkilendirme gerektirmez; imza HMAC-SHA256).
 * Kimlik okuma için kapsam istenmez (`GET /helix/users` kullanıcı token'ıyla kendi kimliğini verir).
 */
@Injectable()
export class TwitchProvider implements StreamProvider {
  readonly key = 'twitch' as const;
  readonly db = ExternalProvider.TWITCH;
  readonly displayName = 'Twitch';
  readonly usesPkce = false;
  private readonly appToken = new AppTokenCache();

  constructor(private config: ConfigService) {}

  private get cfg() {
    return this.config.getOrThrow<{
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      eventsubSecret: string;
    }>('streamLink.twitch');
  }

  isEnabled(): boolean {
    return this.config.get<boolean>('streamLink.twitch.enabled') === true;
  }

  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      response_type: 'code',
      scope: '', // kapsam yok: yalnız kimlik
      state,
      force_verify: 'true',
    });
    return `${ID_HOST}/authorize?${params.toString()}`;
  }

  async identify(code: string): Promise<LinkedIdentity> {
    const tokens = await requestJson<{ access_token: string }>(`${ID_HOST}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.cfg.redirectUri,
      }),
    });
    // Token yalnız bu çağrının bellek kapsamında yaşar; hiçbir yere yazılmaz.
    const res = await requestJson<TwitchList<{ id: string; login: string }>>(`${API_HOST}/users`, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'Client-Id': this.cfg.clientId },
    });
    const user = res.data?.[0];
    if (!user?.id || !user.login) throw new Error('Twitch kullanıcı bilgisi okunamadı.');
    return { externalId: user.id, username: user.login };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- StreamProvider arayüzü Promise ister (Kick anahtar çeker)
  async verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): Promise<VerifiedEvent> {
    const messageId = headerValue(headers, 'twitch-eventsub-message-id');
    const timestamp = headerValue(headers, 'twitch-eventsub-message-timestamp');
    const signature = headerValue(headers, 'twitch-eventsub-message-signature');
    const type = headerValue(headers, 'twitch-eventsub-message-type');
    if (!messageId || !timestamp || !signature || !type) unauthorized();
    if (!isFreshTimestamp(timestamp)) unauthorized();
    if (
      !twitchSignatureMatches(this.cfg.eventsubSecret, messageId, timestamp, rawBody, signature)
    ) {
      unauthorized();
    }

    let body: {
      challenge?: unknown;
      subscription?: { type?: unknown; condition?: { broadcaster_user_id?: unknown } };
      event?: { broadcaster_user_id?: unknown; type?: unknown };
    };
    try {
      body = JSON.parse(rawBody.toString('utf8')) as typeof body;
    } catch {
      return { type: 'ignored', messageId };
    }

    if (type === 'webhook_callback_verification') {
      // İmza doğrulandıktan SONRA: challenge düz metin olarak geri döner
      return typeof body.challenge === 'string'
        ? { type: 'challenge', challenge: body.challenge }
        : { type: 'ignored', messageId };
    }
    if (type === 'revocation') {
      const id = body.subscription?.condition?.broadcaster_user_id;
      return { type: 'revocation', messageId, externalId: typeof id === 'string' ? id : null };
    }
    if (type === 'notification' && body.subscription?.type === EVENT_TYPE) {
      const id = body.event?.broadcaster_user_id;
      // `type: live` dışındakiler (playlist, watch_party, rerun) duyuru değildir
      if (typeof id === 'string' && body.event?.type === 'live') {
        return { type: 'online', messageId, externalId: id, title: null };
      }
    }
    return { type: 'ignored', messageId };
  }

  private getAppToken(): Promise<string> {
    return this.appToken.get(() =>
      requestJson(`${ID_HOST}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody({
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
          grant_type: 'client_credentials',
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
        'Client-Id': this.cfg.clientId,
      },
    });
  }

  /** Callback adresi: frontend kökü + /api (Caddy /api önekini soyar) */
  private callbackUrl(): string {
    const base = (this.config.get<string>('frontendUrl') ?? 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    return `${base}/api/integrations/twitch/webhook`;
  }

  async subscribe(externalId: string): Promise<void> {
    await this.authed('/eventsub/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: EVENT_TYPE,
        version: '1',
        condition: { broadcaster_user_id: externalId },
        transport: {
          method: 'webhook',
          callback: this.callbackUrl(),
          secret: this.cfg.eventsubSecret,
        },
      }),
    });
  }

  async listSubscriptions(): Promise<RemoteSubscription[]> {
    const out: RemoteSubscription[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ type: EVENT_TYPE });
      if (cursor) query.set('after', cursor);
      const res = await this.authed<
        TwitchList<{ id: string; status: string; condition: { broadcaster_user_id: string } }>
      >(`/eventsub/subscriptions?${query.toString()}`);
      for (const s of res.data ?? []) {
        out.push({
          id: s.id,
          externalId: s.condition.broadcaster_user_id,
          healthy: HEALTHY_STATUSES.has(s.status),
        });
      }
      cursor = res.pagination?.cursor;
    } while (cursor);
    return out;
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    await this.authed(`/eventsub/subscriptions?id=${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
    });
  }

  async fetchStream(externalId: string): Promise<StreamInfo | null> {
    const streams = await this.authed<
      TwitchList<{
        title: string;
        game_id: string;
        game_name: string;
        is_mature?: boolean;
        user_login: string;
        type: string;
      }>
    >(`/streams?user_id=${encodeURIComponent(externalId)}`);
    const live = streams.data?.[0];
    if (!live || live.type !== 'live') return null;
    // İçerik sınıflandırma etiketleri kanal bilgisinde; okunamazsa fırlatır (çağıran fail-closed)
    const channels = await this.authed<TwitchList<{ content_classification_labels?: string[] }>>(
      `/channels?broadcaster_id=${encodeURIComponent(externalId)}`,
    );
    const channel = channels.data?.[0];
    if (!channel) throw new Error('Twitch kanal bilgisi okunamadı.');
    return {
      title: live.title ?? '',
      categoryId: live.game_id || null,
      categoryName: live.game_name || null,
      mature: live.is_mature === true,
      labels: channel.content_classification_labels ?? [],
      channelSlug: live.user_login,
    };
  }

  channelUrl(username: string): string {
    return externalAccountUrl(this.db, username);
  }
}
