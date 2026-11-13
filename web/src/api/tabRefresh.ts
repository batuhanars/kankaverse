// D108 — sekmeler arası tek yenileme. Aynı tarayıcıdaki sekmeler AYNI refresh çerezini paylaşır ama access
// token'ı (sessionStorage) ayrı tutar; iki sekme aynı anda yenilemeye kalkarsa biri "az önce yenilendi" yarışına
// düşer. Çözüm: Web Locks ile yenilemeyi seri yap; kilidi alan sekme, bekleme sırasında başka sekmenin
// yayınladığı (BroadcastChannel 'kv-auth') taze token'ı görürse yenileme YAPMAZ, onu kullanır.
//
// Token yalnız bellekte ve sessionStorage'da (her sekme kendisi yazar) kalır; localStorage'a ASLA yazılmaz.
// Locks/BroadcastChannel yoksa (eski tarayıcı, test) bugünkü sekme-içi davranışa düşülür.

export const REFRESH_LOCK_NAME = 'kv-refresh'
export const AUTH_CHANNEL_NAME = 'kv-auth'
export const SIGNED_OUT_EVENT = 'kv:auth:signed-out'
// Kilidi beklemiş sekmenin, önceki sahibin yayınının ulaşması için tanıdığı kısa süre (IPC sıralaması garanti değil).
const SETTLE_MS = 50
const WAIT_THRESHOLD_MS = 20

export type AuthChannelMessage = { type: 'token'; token: string } | { type: 'signed-out' }

export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

export interface ChannelLike {
  postMessage(message: AuthChannelMessage): void
  onmessage: ((event: { data: AuthChannelMessage }) => void) | null
}

export interface TabRefreshDeps {
  getToken: () => string | null
  setToken: (token: string) => void
  /** Gerçek ağ yenilemesi (yeni token döner; ayrıca setToken'ı ÇAĞIRMAZ, burası çağırır). */
  doRefresh: () => Promise<string>
  /** Başka sekme çıkış yaptı / oturumu bitti. */
  onSignedOut?: () => void
  locks?: LockManagerLike | null
  channel?: ChannelLike | null
  settleMs?: number
}

export function createTabRefresher(deps: TabRefreshDeps) {
  const { getToken, setToken, doRefresh, locks, channel } = deps
  const settleMs = deps.settleMs ?? SETTLE_MS

  if (channel) {
    channel.onmessage = (event) => {
      const msg = event.data
      if (msg?.type === 'token' && typeof msg.token === 'string') setToken(msg.token)
      else if (msg?.type === 'signed-out') deps.onSignedOut?.()
    }
  }

  async function refreshInsideLock(staleToken: string | null, waitedMs: number): Promise<string> {
    // Bekleyen sekme: önceki sahibin yayını henüz işlenmemiş olabilir.
    if (waitedMs > WAIT_THRESHOLD_MS) await new Promise((r) => setTimeout(r, settleMs))
    const current = getToken()
    // Token biz beklerken değiştiyse başka sekme (yayınla) yeniledi → ağa gitme.
    if (current && current !== staleToken) return current
    const token = await doRefresh()
    channel?.postMessage({ type: 'token', token })
    return token
  }

  /** `staleToken`: 401 alan isteğin kullandığı token (yoksa null). */
  async function refresh(staleToken: string | null): Promise<string> {
    if (!locks) return refreshInsideLock(staleToken, 0)
    const requestedAt = Date.now()
    return locks.request(REFRESH_LOCK_NAME, () =>
      refreshInsideLock(staleToken, Date.now() - requestedAt),
    )
  }

  function announceSignedOut(): void {
    channel?.postMessage({ type: 'signed-out' })
  }

  function dispose(): void {
    if (channel) channel.onmessage = null
  }

  return { refresh, announceSignedOut, dispose }
}

/** Tarayıcı varsayılanları; yoksa null (geri düşme). */
export function browserLocks(): LockManagerLike | null {
  const l = typeof navigator !== 'undefined' ? navigator.locks : undefined
  return l ?? null
}

export function browserChannel(): ChannelLike | null {
  try {
    return typeof BroadcastChannel !== 'undefined'
      ? (new BroadcastChannel(AUTH_CHANNEL_NAME) as unknown as ChannelLike)
      : null
  } catch {
    return null
  }
}
