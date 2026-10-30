import { ExternalProvider } from '@prisma/client';

export type ProviderKey = 'kick' | 'twitch';

/** OAuth ile okunan dış hesap kimliği. Token bu noktadan öteye TAŞINMAZ (§2.4). */
export interface LinkedIdentity {
  externalId: string;
  username: string;
}

/** Duyuru kapısının (§5.3) ihtiyaç duyduğu yayın bilgisi. */
export interface StreamInfo {
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  /** Platformun yetişkin işareti (Kick has_mature_content, Twitch is_mature) */
  mature: boolean;
  /** Twitch içerik sınıflandırma etiketleri; Kick'te boş */
  labels: string[];
  /** Kanal adresi parçası (Kick slug, Twitch login) */
  channelSlug: string;
}

/** İmzası doğrulanmış olay. İmza geçmeden bu tür hiç üretilmez. */
export type VerifiedEvent =
  | { type: 'challenge'; challenge: string }
  | { type: 'online'; messageId: string; externalId: string; title: string | null }
  | { type: 'offline'; messageId: string; externalId: string }
  | { type: 'revocation'; messageId: string; externalId: string | null }
  | { type: 'ignored'; messageId: string };

export interface RemoteSubscription {
  id: string;
  externalId: string;
  /** false: platform aboneliği düşürmüş (ör. Twitch revoked/failures); yeniden açılmalı */
  healthy: boolean;
}

/**
 * Sağlayıcıya özgü her şey (OAuth uçları, olay doğrulama, yayın okuma) bir adaptörde; bağlama, duyuru ve
 * arayüz ortaktır. İki adaptör için eklenti sistemi yok: bu arayüz + iki sınıf yeter.
 */
export interface StreamProvider {
  readonly key: ProviderKey;
  readonly db: ExternalProvider;
  readonly displayName: string;
  isEnabled(): boolean;
  /** codeChallenge null ise (PKCE yok) yalnız state gönderilir */
  buildAuthorizeUrl(state: string, codeChallenge: string | null): string;
  /** PKCE kullanılıyor mu (state satırına verifier yazılır mı) */
  readonly usesPkce: boolean;
  identify(code: string, codeVerifier: string): Promise<LinkedIdentity>;
  /** Geçersiz imza / eski zaman damgası / eksik başlık → UnauthorizedException */
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): Promise<VerifiedEvent>;
  subscribe(externalId: string): Promise<void>;
  listSubscriptions(): Promise<RemoteSubscription[]>;
  unsubscribe(subscriptionId: string): Promise<void>;
  /** Canlı yayın yoksa null; okuma hatasında fırlatır (çağıran fail-closed sayar) */
  fetchStream(externalId: string): Promise<StreamInfo | null>;
  channelUrl(username: string): string;
}
