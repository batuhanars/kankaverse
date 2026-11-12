// E5b §2.3: aktarım el sıkışması. Türetme Node'un bağımsız kripto uygulamasıyla (X25519 + HKDF) çapraz doğrulanır.
import { createHash, createPrivateKey, createPublicKey, diffieHellman, hkdfSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  TransferCommitError,
  TransferKeyError,
  TransferOpenError,
  deriveTransferSecrets,
  formatSas,
  newTransferKeyPair,
  newTransferNonce,
  openTransfer,
  sealTransfer,
  transferCommit,
  verifyTransferCommit,
  utf8,
  type TransferTranscript,
} from '../src'
import { sasDigits } from '../src/transfer'

const ids = { userId: 'cmuser0001', transferId: 'cmtransfer01', newDeviceId: 'cmdevnew01', oldDeviceId: 'cmdevold01' }
const seq = (start: number) => Uint8Array.from({ length: 32 }, (_, i) => (start + i) & 0xff)

function handshake() {
  const n = newTransferKeyPair()
  const o = newTransferKeyPair()
  const nonce = newTransferNonce()
  const t: TransferTranscript = { ...ids, newPub: n.publicKey, oldPub: o.publicKey, nonce }
  return { n, o, nonce, t }
}

// Bağımsız uygulama: Node X25519 (JWK) + hkdfSync, aynı döküm düzeniyle (4 bayt büyük uçlu uzunluk önekli).
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url')
function nodeShared(secret: Uint8Array, pub: Uint8Array, ownPub: Uint8Array): Buffer {
  const privateKey = createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', d: b64u(secret), x: b64u(ownPub) }, format: 'jwk' })
  const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: b64u(pub) }, format: 'jwk' })
  return diffieHellman({ privateKey, publicKey })
}
function nodePack(parts: Uint8Array[]): Buffer {
  return Buffer.concat(
    parts.map((p) => {
      const h = Buffer.alloc(4)
      h.writeUInt32BE(p.length)
      return Buffer.concat([h, Buffer.from(p)])
    }),
  )
}

describe('E5b aktarım el sıkışması', () => {
  it('iki taraf aynı kodu ve anahtarı bulur', () => {
    const { n, o, t } = handshake()
    const atN = deriveTransferSecrets(n.secretKey, o.publicKey, t)
    const atO = deriveTransferSecrets(o.secretKey, n.publicKey, t)
    expect(atN.sas).toMatch(/^\d{6}$/)
    expect(atN.sas).toBe(atO.sas)
    expect(Buffer.from(atN.key).equals(Buffer.from(atO.key))).toBe(true)
  })

  it('Node X25519 + HKDF ile çapraz doğrulama (bağımsız uygulama, sabit girdi)', () => {
    const nSecret = seq(1)
    const oSecret = seq(101)
    const n = { secretKey: nSecret, publicKey: newTransferKeyPair(() => nSecret.slice()).publicKey }
    const o = { secretKey: oSecret, publicKey: newTransferKeyPair(() => oSecret.slice()).publicKey }
    const nonce = seq(201)
    const t: TransferTranscript = { ...ids, newPub: n.publicKey, oldPub: o.publicKey, nonce }
    const ours = deriveTransferSecrets(n.secretKey, o.publicKey, t)

    const z = nodeShared(nSecret, o.publicKey, n.publicKey)
    const salt = createHash('sha256')
      .update(
        nodePack([
          utf8('kv-e5b-v1'),
          utf8(ids.userId),
          utf8(ids.transferId),
          utf8(ids.newDeviceId),
          utf8(ids.oldDeviceId),
          n.publicKey,
          o.publicKey,
          nonce,
        ]),
      )
      .digest()
    const sasBytes = Buffer.from(hkdfSync('sha256', z, salt, 'kv-e5b-sas-v1', 4))
    const key = Buffer.from(hkdfSync('sha256', z, salt, 'kv-e5b-key-v1', 32))
    expect(ours.sas).toBe(String(sasBytes.readUInt32BE(0) % 1_000_000).padStart(6, '0'))
    expect(Buffer.from(ours.key).equals(key)).toBe(true)
  })

  it('taahhüt: doğru açılış geçer; değişmiş anahtar ya da rastgelelik reddedilir', () => {
    const { n, nonce } = handshake()
    const c = transferCommit(n.publicKey, nonce)
    expect(() => verifyTransferCommit(c, n.publicKey, nonce)).not.toThrow()
    const other = newTransferKeyPair()
    expect(() => verifyTransferCommit(c, other.publicKey, nonce)).toThrow(TransferCommitError)
    expect(() => verifyTransferCommit(c, n.publicKey, newTransferNonce())).toThrow(TransferCommitError)
    expect(() => verifyTransferCommit(c, n.publicKey.slice(0, 31), nonce)).toThrow(TransferCommitError)
  })

  it('araya giren sunucu: iki tarafa farklı anahtar verirse kodlar farklı çıkar', () => {
    const { n, o, nonce } = handshake()
    const mitm = newTransferKeyPair()
    // N, O yerine saldırganın anahtarını görür; O, N'nin gerçek anahtarını görür.
    const tN: TransferTranscript = { ...ids, newPub: n.publicKey, oldPub: mitm.publicKey, nonce }
    const tO: TransferTranscript = { ...ids, newPub: n.publicKey, oldPub: o.publicKey, nonce }
    const atN = deriveTransferSecrets(n.secretKey, mitm.publicKey, tN)
    const atO = deriveTransferSecrets(o.secretKey, n.publicKey, tO)
    expect(atN.sas).not.toBe(atO.sas)
  })

  it('döküm alanı değişirse (başka aktarım/cihaz kimliği) kod ve anahtar değişir', () => {
    const { n, o, t } = handshake()
    const base = deriveTransferSecrets(n.secretKey, o.publicKey, t)
    for (const k of ['userId', 'transferId', 'newDeviceId', 'oldDeviceId'] as const) {
      const other = deriveTransferSecrets(n.secretKey, o.publicKey, { ...t, [k]: t[k] + 'x' })
      expect(Buffer.from(other.key).equals(Buffer.from(base.key))).toBe(false)
    }
  })

  it('geçersiz ya da sıfır sır veren açık anahtar reddedilir', () => {
    const { n, t } = handshake()
    expect(() => deriveTransferSecrets(n.secretKey, new Uint8Array(32), t)).toThrow(TransferKeyError)
    expect(() => deriveTransferSecrets(n.secretKey, new Uint8Array(31), t)).toThrow(TransferKeyError)
    expect(() => deriveTransferSecrets(n.secretKey, n.publicKey, { ...t, nonce: new Uint8Array(5) })).toThrow(
      TransferKeyError,
    )
  })

  it('yük: aç/kapat; başka aktarım, başka kullanıcı ya da kurcalanmış bayt reddedilir', () => {
    const { n, o, t } = handshake()
    const { key } = deriveTransferSecrets(n.secretKey, o.publicKey, t)
    const plain = utf8('{"v":1,"kind":"transfer","messages":[]}')
    const sealed = sealTransfer(key, plain, ids.userId, ids.transferId)
    expect(Buffer.from(openTransfer(key, sealed, ids.userId, ids.transferId)).equals(Buffer.from(plain))).toBe(true)
    expect(() => openTransfer(key, sealed, ids.userId, 'baska')).toThrow(TransferOpenError)
    expect(() => openTransfer(key, sealed, 'baska', ids.transferId)).toThrow(TransferOpenError)
    const tampered = sealed.slice()
    tampered[tampered.length - 1] ^= 1
    expect(() => openTransfer(key, tampered, ids.userId, ids.transferId)).toThrow(TransferOpenError)
    expect(() => openTransfer(key, sealed.slice(0, 5), ids.userId, ids.transferId)).toThrow(TransferOpenError)
  })

  it('kod biçimi: 6 hane, başta sıfır korunur; ekran biçimi "123 456"', () => {
    expect(sasDigits(Uint8Array.from([0, 0, 0, 5]))).toBe('000005')
    expect(sasDigits(Uint8Array.from([0xff, 0xff, 0xff, 0xff]))).toBe(String(0xffffffff % 1_000_000))
    expect(formatSas('004217')).toBe('004 217')
  })
})
