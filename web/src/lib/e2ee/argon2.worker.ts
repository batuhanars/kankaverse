// Yedek anahtarı türetimi için Web Worker (E5a §2 R7-1 notu): noble Argon2id 64 MiB / t4'te ~1 sn CPU yer,
// ana iş parçacığında arayüz donardı. Worker yalnız hesaplar; NFC/UTF-8 ve parametre tabanı e2ee-core'da.
import { nobleArgon2id } from '@kankaverse/e2ee-core'
import type { Argon2Request, Argon2Response } from './argon2'

self.onmessage = async (e: MessageEvent<Argon2Request>) => {
  const { password, salt, opts } = e.data
  try {
    const out = await nobleArgon2id(password, salt, opts)
    const reply: Argon2Response = { ok: true, out }
    ;(self as unknown as Worker).postMessage(reply, [out.buffer])
  } catch (err) {
    const reply: Argon2Response = {
      ok: false,
      message: err instanceof Error ? err.message : 'hata',
    }
    ;(self as unknown as Worker).postMessage(reply)
  }
}
