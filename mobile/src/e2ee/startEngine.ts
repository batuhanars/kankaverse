// Mobil adaptörleri paylaşılan motora (shared/e2ee-client) bağlar: SQLite+Keystore vault, SerialQueue kilidi,
// pureProvider (Hermes'te crypto.subtle yok), mobil HTTP. Motor mantığı burada YOK.
import { E2eeEngine, serialLock, type WarningHandler } from '@kankaverse/e2ee-client'
import { pureProvider, utf8Path } from '@kankaverse/e2ee-core'
import { mobileE2eeApi } from './mobileApi'
import { openMobileVault } from './sqliteRows'

// Tek JS ortamı: bildirim görevi (C50/C52) de aynı ortamda koşar, ileride E3 aynı kuyruğa girecek.
// Süreçler arası kilit gerekmez (web'deki Web Locks'un karşılığı yok).
const withLock = serialLock()

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Yalnız süre ve adet loglanır; içerik (metin, anahtar) ASLA. */
const metric = (name: string, ms: number, count: number) => console.log(`[E2EE] ${name} ${ms}ms n=${count}`)

const log = (message: string, error?: unknown) =>
  console.error(message, error instanceof Error ? error.name : '')

let pathLogged = false

/**
 * E3 Rev.2: bildirim görevi için AĞSIZ motor (yalnız yerel depo; cihaz yoksa null). Aynı `withLock`
 * kuyruğunu paylaşır, bu yüzden UI motoruyla çakışmaz. Ağ portu, API, oturum yenileme yok.
 */
export function openLocalMobileEngine(userId: string): Promise<E2eeEngine | null> {
  return E2eeEngine.openLocal(userId, {
    openVault: openMobileVault,
    withLock,
    provider: pureProvider,
    log,
    yieldToUi,
    metric,
  })
}

export function startMobileEngine(userId: string, onWarn: WarningHandler): Promise<E2eeEngine | null> {
  if (!pathLogged) {
    pathLogged = true
    console.log(`[E2EE] UTF-8 yolu: ${utf8Path() === 'builtin' ? 'yerleşik' : 'saf JS'}`) // yalnız seçim, içerik yok
  }
  return E2eeEngine.start(userId, {
    api: mobileE2eeApi,
    openVault: openMobileVault,
    withLock,
    provider: pureProvider,
    onWarn,
    log,
    yieldToUi,
    metric,
  })
}
