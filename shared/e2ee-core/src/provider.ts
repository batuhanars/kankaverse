// Kripto sağlayıcıları. Uygulama yalnız `webProvider` ya da `pureProvider` seçer, ts-mls tiplerini görmez.
import { getCiphersuiteImpl, type CiphersuiteImpl } from 'ts-mls'
import { pureSuiteImpl } from './pure/suite'

/** Tek desteklenen paket: MLS suite 1 (sözleşme §0). */
const SUITE_NAME = 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519'

export interface CryptoProvider {
  readonly name: 'web' | 'pure'
  /** @internal çekirdek içi kullanım; uygulama kodu çağırmaz. */
  loadSuite(): Promise<CiphersuiteImpl>
}

function makeProvider(name: 'web' | 'pure', load: () => Promise<CiphersuiteImpl>): CryptoProvider {
  let cached: Promise<CiphersuiteImpl> | undefined
  return { name, loadSuite: () => (cached ??= load()) }
}

/** Varsayılan yol: WebCrypto (tarayıcı, Electron, Node). */
export const webProvider: CryptoProvider = makeProvider('web', () => getCiphersuiteImpl(SUITE_NAME))

/** Saf @noble yolu: crypto.subtle olmayan Hermes için. getRandomValues yoksa açık hata. */
export const pureProvider: CryptoProvider = makeProvider('pure', async () => pureSuiteImpl)

/** Tek deneme için önbellek (süreç boyunca değişmez). */
let detected: Promise<CryptoProvider> | undefined

/** @internal test: önbelleği sıfırlar. */
export function resetDetectedProvider(): void {
  detected = undefined
}

/**
 * WebCrypto'nun ts-mls web suite'inin kullandığı ilkelleri GERÇEKTEN çalıştırdığını sınar:
 * Ed25519 (imza), X25519 (deriveBits), AES-GCM, HMAC-SHA-256. Hepsi çalışırsa `webProvider`,
 * biri bile eksikse (Chromium < 137 / Electron 36'da Ed25519 yok) ya da `crypto.subtle` yoksa `pureProvider`.
 */
async function probeWebCrypto(): Promise<boolean> {
  try {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return false
    const msg = new Uint8Array([1, 2, 3])
    const ed = (await subtle.generateKey('Ed25519', false, ['sign', 'verify'])) as CryptoKeyPair
    const sig = await subtle.sign('Ed25519', ed.privateKey, msg)
    if (!(await subtle.verify('Ed25519', ed.publicKey, sig, msg))) return false
    const a = (await subtle.generateKey('X25519', false, ['deriveBits'])) as CryptoKeyPair
    const b = (await subtle.generateKey('X25519', false, ['deriveBits'])) as CryptoKeyPair
    const bits = await subtle.deriveBits({ name: 'X25519', public: b.publicKey }, a.privateKey, 256)
    if (bits.byteLength !== 32) return false
    const aes = await subtle.generateKey({ name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt'])
    const iv = new Uint8Array(12)
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, aes, msg)
    const pt = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, aes, ct))
    if (pt.length !== 3 || pt[2] !== 3) return false
    const hmac = await subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    await subtle.sign('HMAC', hmac, msg)
    return true
  } catch {
    return false
  }
}

/** Ortama göre sağlayıcı seçer; sonuç önbelleğe alınır. Web istemcisi sabit `webProvider` yerine bunu kullanır. */
export function detectWebProvider(): Promise<CryptoProvider> {
  return (detected ??= probeWebCrypto().then((ok) => (ok ? webProvider : pureProvider)))
}
