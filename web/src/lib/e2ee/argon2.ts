// Web için Argon2id (E5a §2.4): önce Web Worker'da noble; Worker yoksa ya da açılamazsa ana iş parçacığında
// aynı noble'a düşer (çalışır ama ~1 sn arayüzü dondurur; eski/kısıtlı ortam yedeği, kullanıcıyı kilitlemez).
import { nobleArgon2id, type Argon2idFn } from '@kankaverse/e2ee-core'

export interface Argon2Request {
  password: Uint8Array
  salt: Uint8Array
  opts: { m: number; t: number; p: number; dkLen: number }
}
export type Argon2Response = { ok: true; out: Uint8Array } | { ok: false; message: string }

/** Tek hesaplık Worker: iş bitince kapatılır (64 MiB bellek tutulmasın). */
function runInWorker(req: Argon2Request): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./argon2.worker.ts', import.meta.url), { type: 'module' })
    const done = () => worker.terminate()
    worker.onmessage = (e: MessageEvent<Argon2Response>) => {
      done()
      if (e.data.ok) resolve(e.data.out)
      else reject(new Error(e.data.message))
    }
    worker.onerror = () => {
      done()
      reject(new WorkerStartError('Argon2 worker çalışmadı'))
    }
    worker.postMessage(req)
  })
}

/** Worker açılamadı/çöktü (hesap hatası değil): ana iş parçacığına düşülür. */
export class WorkerStartError extends Error {}

export const webArgon2id: Argon2idFn = async (password, salt, opts) => {
  if (typeof Worker === 'undefined') return nobleArgon2id(password, salt, opts)
  try {
    return await runInWorker({ password, salt, opts })
  } catch (e) {
    if (e instanceof WorkerStartError) return nobleArgon2id(password, salt, opts)
    throw e
  }
}
