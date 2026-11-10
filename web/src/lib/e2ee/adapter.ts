// Web adaptörü: paylaşılan motoru (shared/e2ee-client) tarayıcı parçalarına bağlar: IndexedDB vault,
// Web Locks, WebCrypto sağlayıcısı, axios API. Motor mantığı burada YOK.
import {
  E2eeEngine,
  serialLock,
  type E2eeApi,
  type WarningHandler,
  type WithLock,
} from '@kankaverse/e2ee-client'
import { webProvider } from '@kankaverse/e2ee-core'
import { destroyOtherVaults, Vault } from './vault'

const sameTab = serialLock()

// Aynı sekmedeki işler art arda (SerialQueue); farklı sekmeler Web Locks ile art arda. İkisi de şart:
// MLS durumu "oku, değiştir, yaz" ile ilerler, iki eşzamanlı işlem aynı eski durumdan türeyip
// birinin sonucunu sessizce ezer. Kilit mesaj/ağ boyunca tutulur; sıra, hız değil doğruluk içindir.
const webLock: WithLock = (name, task) => {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks) return sameTab(name, task)
  return sameTab(name, () => locks.request(name, task))
}

export function startWebEngine(
  userId: string,
  api: E2eeApi,
  onWarn: WarningHandler,
): Promise<E2eeEngine | null> {
  return E2eeEngine.start(userId, {
    api,
    // Aynı tarayıcıdaki başka hesapların kalıntısı bu kullanıcıya karışmasın / sızmasın (hesap değişimi).
    openVault: async (id) => {
      await destroyOtherVaults(id)
      return Vault.open(id)
    },
    withLock: webLock,
    provider: webProvider,
    onWarn,
  })
}
