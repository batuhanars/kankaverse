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
