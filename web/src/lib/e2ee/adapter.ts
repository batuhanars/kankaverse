// Web adaptörü: paylaşılan motoru (shared/e2ee-client) tarayıcı parçalarına bağlar: IndexedDB vault,
// Web Locks, WebCrypto sağlayıcısı, axios API. Motor mantığı burada YOK.
import {
  E2eeEngine,
  serialLock,
  type E2eeApi,
  type WarningHandler,
  type WithLock,
} from '@kankaverse/e2ee-client'
import { detectWebProvider } from '@kankaverse/e2ee-core'
import { webArgon2id } from './argon2'
import { webBlobTransport } from './blobTransport'
import { destroyOtherVaults, Vault } from './vault'
import { keepsE2eeDevice } from './keepDevice'

const sameTab = serialLock()

// Aynı sekmedeki işler art arda (SerialQueue); farklı sekmeler Web Locks ile art arda. İkisi de şart:
// MLS durumu "oku, değiştir, yaz" ile ilerler, iki eşzamanlı işlem aynı eski durumdan türeyip
// birinin sonucunu sessizce ezer. Kilit mesaj/ağ boyunca tutulur; sıra, hız değil doğruluk içindir.
const webLock: WithLock = (name, task) => {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) return sameTab(name, task)
  return sameTab(name, () => locks.request(name, task))
}

let loggedPath = false

export async function startWebEngine(
  userId: string,
  api: E2eeApi,
  onWarn: WarningHandler,
): Promise<E2eeEngine | null> {
  // Eski Chromium (Electron 36 = 136) WebCrypto Ed25519 yok: motor saf noble yoluna duser.
  const provider = await detectWebProvider()
  if (!loggedPath) {
    loggedPath = true
    console.info(`[e2ee] kripto yolu: ${provider.name}`)
  }
  return E2eeEngine.start(userId, {
    api,
    // Tarayıcı: başka hesapların kalıntısı silinir (ortak bilgisayar). Masaüstü (C69): diğer hesapların depoları
    // KALIR; her depo kendi anahtarıyla ayrı, yalnız giriş yapan hesabınki açılır (sahip kararı 2026-11-13).
    openVault: async (id) => {
      if (!keepsE2eeDevice()) await destroyOtherVaults(id)
      return Vault.open(id)
    },
    withLock: webLock,
    provider,
    argon2: webArgon2id,
    blob: webBlobTransport,
    onWarn,
  })
}
