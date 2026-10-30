import { Injectable, NotFoundException } from '@nestjs/common';
import { KickProvider } from './providers/kick.provider';
import { TwitchProvider } from './providers/twitch.provider';
import { ProviderKey, StreamProvider } from './providers/stream-provider';

/** `:provider` yol parçası → adaptör. Bilinmeyen ya da bayrağı kapalı sağlayıcı HER ZAMAN 404 (§2). */
@Injectable()
export class StreamProvidersRegistry {
  private readonly all: StreamProvider[];

  constructor(kick: KickProvider, twitch: TwitchProvider) {
    this.all = [kick, twitch];
  }

  list(): StreamProvider[] {
    return this.all;
  }

  enabled(): StreamProvider[] {
    return this.all.filter((p) => p.isEnabled());
  }

  /** Sağlayıcı bayrağı kapalıysa da bulunur (bağlı hesabı kopar/profil için); null = bilinmiyor */
  find(key: string): StreamProvider | null {
    return this.all.find((p) => p.key === (key as ProviderKey)) ?? null;
  }

  /** Bağlama akışı için: bilinmeyen / kapalı → 404 */
  requireEnabled(key: string): StreamProvider {
    const provider = this.find(key);
    if (!provider || !provider.isEnabled()) {
      throw new NotFoundException({ message: 'Bağlantı bulunamadı.', error: 'PROVIDER_NOT_FOUND' });
    }
    return provider;
  }
}
