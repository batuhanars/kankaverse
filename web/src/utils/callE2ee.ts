import { ExternalE2EEKeyProvider, isE2EESupported, type RoomOptions } from 'livekit-client'
import { CallKeyUnavailableError, toB64 } from '@kankaverse/e2ee-client'
import { useE2eeStore } from '@/stores/e2ee'

/**
 * E8 — DM aramalarında kare şifrelemesi (sözleşme §4, §5.1). 🔴 R7: anahtarın odaya verildiği yer.
 *
 * Anahtar METİN (base64) verilir: livekit-client metin anahtarı PBKDF2 ile, bayt anahtarı HKDF ile işler.
 * Telefonun native tarafı PBKDF2 kullanır; iki istemci aynı kareyi çözebilsin diye web de metin yolunda kalır.
 *
 * Tek anahtar yuvası (indeks 0): telefondaki şifreleyici indeksi yalnız kurulurken okur ve paylaşılan
 * anahtar modunda hep 0 kalır. Epoch değişince yuvanın üstüne yazılır. Hazır `ExternalE2EEKeyProvider`
 * tam bunu yapar (metin → PBKDF2, indeks 0).
 */

/** Tarayıcı çerçeve şifrelemesini destekliyor mu (Insertable Streams / RTCRtpScriptTransform). */
export const callE2eeSupported = (): boolean => isE2EESupported()

/** Aramaya şifreli katılınamıyor; `i18nKey` kullanıcıya gösterilecek metin (sözleşme §6). */
export class CallE2eeError extends Error {
  readonly i18nKey: string

  constructor(i18nKey: string) {
    super(i18nKey)
    this.name = 'CallE2eeError'
    this.i18nKey = i18nKey
  }
}

/** Sunucunun 426 kodu: arama şifreli, istemci yeteneğini bildirmedi. */
export const CALL_E2EE_UPDATE_REQUIRED = 'CALL_E2EE_UPDATE_REQUIRED'

/** 426 geldiyse hangi metin: tarayıcı destekliyorsa sorun sürüm, desteklemiyorsa tarayıcı. */
export const updateRequiredKey = (): string =>
  callE2eeSupported() ? 'call.e2ee.updateRequired' : 'call.e2ee.unsupportedBrowser'

/** Bir şifreli aramanın düzeni. Arama bitince `dispose`. */
export interface CallCrypto {
  roomOptions: Pick<RoomOptions, 'e2ee'>
  /** Grup değişmiş olabilir: anahtarı yeniden türet, epoch değiştiyse 0 numaralı yuvanın üstüne yaz. */
  refresh(): Promise<void>
  dispose(): void
}

function keyError(e: unknown): CallE2eeError {
  if (e instanceof CallKeyUnavailableError && e.reason === 'NOT_MEMBER') {
    return new CallE2eeError('call.e2ee.notMember')
  }
  // STALE ya da ağ/MLS hatası: kısa süre sonra tekrar denenebilir.
  return new CallE2eeError('call.e2ee.stale')
}

/**
 * `room.connect`'ten ÖNCE: anahtarı türet, şifreleme işçisini kur, anahtarı yuvaya yaz.
 * Herhangi bir adım tutmazsa `CallE2eeError` fırlar; çağıran BAĞLANMAZ (§1.4 geri düşme yok).
 */
export async function prepareCallCrypto(
  channelId: string,
  serverEpoch: number,
): Promise<CallCrypto> {
  if (!callE2eeSupported()) throw new CallE2eeError('call.e2ee.unsupportedBrowser')
  const e2ee = useE2eeStore()
  const first = await e2ee.callKey(channelId, serverEpoch).catch((e: unknown) => {
    throw keyError(e)
  })

  const keyProvider = new ExternalE2EEKeyProvider()
  await keyProvider.setKey(toB64(first.key))
  let epoch = first.epoch
  // Şifreleme ana iş parçacığında değil ayrı bir işçide (Web Worker) yapılır; Vite bu URL'yi ayrı dosya olarak paketler.
  const worker = new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), {
    type: 'module',
  })

  // Yenilemeler sıraya girer: iki olay üst üste gelse de yuvaya eski anahtar sonradan yazılmaz.
  let queue: Promise<void> = Promise.resolve()
  const refreshOnce = async () => {
    const next = await e2ee.callKey(channelId, epoch)
    if (next.epoch === epoch) return
    await keyProvider.setKey(toB64(next.key))
    epoch = next.epoch
  }

  return {
    roomOptions: { e2ee: { keyProvider, worker } },
    refresh: () => {
      // Çıkarıldıysak (NOT_MEMBER) sunucu zaten odadan atar; burada yalnız loglanır, anahtar/içerik yazılmaz.
      queue = queue.then(refreshOnce).catch((e: unknown) => {
        console.warn('[e8] arama anahtarı yenilenemedi', channelId, (e as Error)?.name)
      })
      return queue
    },
    dispose: () => worker.terminate(),
  }
}

/** Arka arkaya çözme hatası bu süreyi aşarsa kullanıcıya "çözülemiyor" denir (kısa bozulma sayılmaz, §4.2). */
const FAILING_AFTER_MS = 6000
/** Bu süre hata gelmezse seri biter. */
const STREAK_GAP_MS = 2000
/** Çözme hatasında anahtar yenileme en fazla bu sıklıkta denenir. */
const REFRESH_EVERY_MS = 3000

/**
 * `RoomEvent.EncryptionError` izleyicisi (§4.3): kanal kimliği + sayaç loglanır (anahtar/kare yok). Her hata
 * seyrek bir anahtar yenilemesi dener (kaçırılmış commit). Hata kesintisiz sürerse `onFailing(true)`.
 */
export function watchDecryptErrors(
  channelId: string,
  crypto: CallCrypto,
  onFailing: (failing: boolean) => void,
): () => void {
  let count = 0
  let streakStart = 0
  let lastError = 0
  let lastRefresh = 0
  let failing = false
  let quietTimer: ReturnType<typeof setTimeout> | null = null

  const setFailing = (v: boolean) => {
    if (v === failing) return
    failing = v
    onFailing(v)
  }

  return () => {
    const now = Date.now()
    count += 1
    if (now - lastError > STREAK_GAP_MS) streakStart = now
    lastError = now
    if (count === 1 || count % 50 === 0) console.warn('[e8] çözme hatası', channelId, count)
    if (now - lastRefresh > REFRESH_EVERY_MS) {
      lastRefresh = now
      void crypto.refresh()
    }
    if (now - streakStart > FAILING_AFTER_MS) setFailing(true)
    if (quietTimer) clearTimeout(quietTimer)
    quietTimer = setTimeout(() => setFailing(false), STREAK_GAP_MS)
  }
}
