// Cihaz görünümü önbelleği (E3 §9.1) ve ağsız motorun "ağ yok" portu.
import type { LocalStore } from './localStore'
import type { E2eeApi } from './ports'

/**
 * Her başarılı `channelState` yanıtında kanalın cihaz görünümünü depoya yazar: tek nokta, çağıranlar
 * (Hydrator, syncChannel, openChannel...) bilmez. Diğer uçlar aynen `api`ya gider.
 */
export function withViewCache(api: E2eeApi, store: LocalStore): E2eeApi {
  const cached = Object.create(api) as E2eeApi
  cached.channelState = async (channelId) => {
    const reply = await api.channelState(channelId)
    await store.saveView(channelId, reply.data.members)
    return reply
  }
  return cached
}

/** Ağsız motorun portu: her çağrı reddedilir, yanlışlıkla ağa çıkılırsa sessizce değil açıkça düşer. */
export class OfflineApiError extends Error {
  constructor(method: string) {
    super(`Çevrimdışı motor ağ çağıramaz: ${method}`)
    this.name = 'OfflineApiError'
  }
}

export const OFFLINE_API = new Proxy({} as E2eeApi, {
  get: (_target, method) => () => Promise.reject(new OfflineApiError(String(method))),
})
