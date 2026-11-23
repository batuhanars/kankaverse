// E7 §2.5: kimlik, cihaz imzası, yedek sarma, güvenlik kodu. İmza ve özet Node'un bağımsız kripto uygulamasıyla
// çapraz doğrulanır (noble ile Node aynı baytı üretmezse iki istemci ve sunucu birbirini doğrulayamaz).
import { createHash, createPublicKey, verify as nodeVerify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  IdentityKeyError,
  IdentityOpenError,
  createIdentity,
  deviceSigMessage,
  fingerprint,
  safetyCode,
  signDevice,
  unwrapIdentity,
  verifyDevice,
  wrapIdentity,
  type IdentityKeyPair,
  type SignedDevice,
} from '../src'
import { pack, utf8 } from '../src/bytes'

const userId = 'cmuser0001'
const otherUserId = 'cmuser0002'
const seq = (start: number, n = 32) => Uint8Array.from({ length: n }, (_, i) => (start + i) & 0xff)

function device(identity: IdentityKeyPair, deviceId = 'cmdev0001', owner = userId): SignedDevice {
  const signatureKey = seq(7)
  return { deviceId, signatureKey, identitySig: signDevice(identity, owner, deviceId, signatureKey), identityVersion: identity.version }
}

/** Ham 32 baytlık Ed25519 açık anahtarını Node KeyObject'e çevirir (SPKI başlığı + anahtar). */
function nodePublicKey(raw: Uint8Array) {
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(raw)])
  return createPublicKey({ key: spki, format: 'der', type: 'spki' })
}

describe('createIdentity', () => {
  it('32 baytlık anahtar çifti ve sürüm üretir', () => {
    const id = createIdentity()
    expect(id.privateKey).toHaveLength(32)
    expect(id.publicKey).toHaveLength(32)
    expect(id.version).toBe(1)
    expect(createIdentity(3).version).toBe(3)
  })

  it('geçersiz sürümü reddeder', () => {
    expect(() => createIdentity(0)).toThrow(IdentityKeyError)
    expect(() => createIdentity(1.5)).toThrow(IdentityKeyError)
  })
})

describe('cihaz imzası', () => {
  it('imzalanan bayt sözleşmedeki pack düzenindedir', () => {
    const key = seq(1)
    expect(deviceSigMessage(userId, 2, 'cmdev0001', key)).toEqual(
      pack([utf8('kv-e7-dev-v1'), utf8(userId), utf8('2'), utf8('cmdev0001'), key]),
    )
  })

  it('Node imzayı doğrular (çapraz uygulama)', () => {
    const id = createIdentity()
    const d = device(id)
    const msg = deviceSigMessage(userId, id.version, d.deviceId, d.signatureKey)
    expect(nodeVerify(null, msg, nodePublicKey(id.publicKey), d.identitySig!)).toBe(true)
  })

  it('doğru kimlikle geçer', () => {
    const id = createIdentity()
    expect(verifyDevice(id, userId, device(id))).toBe(true)
  })

  it('imzasız cihaz geçmez', () => {
    const id = createIdentity()
    expect(verifyDevice(id, userId, { ...device(id), identitySig: null, identityVersion: null })).toBe(false)
  })

  it('başka kimliğin imzası geçmez (sunucunun koyduğu sahte cihaz)', () => {
    const real = createIdentity()
    const fake = createIdentity()
    expect(verifyDevice(real, userId, device(fake))).toBe(false)
  })

  it('eski sürümle atılmış imza yeni sürümde geçmez', () => {
    const v1 = createIdentity(1)
    const d = device(v1)
    // Aynı anahtar, sunucu sürümü ileri aldı: imzadaki sürüm farklı, geçmemeli.
    expect(verifyDevice({ publicKey: v1.publicKey, version: 2 }, userId, { ...d, identityVersion: 2 })).toBe(false)
    expect(verifyDevice({ publicKey: v1.publicKey, version: 2 }, userId, d)).toBe(false)
  })

  it('başka kullanıcıya ait imza bu kullanıcının cihazı için geçmez', () => {
    const id = createIdentity()
    expect(verifyDevice(id, otherUserId, device(id))).toBe(false)
  })

  it('kurcalanmış imza anahtarı ya da cihaz kimliği geçmez', () => {
    const id = createIdentity()
    const d = device(id)
    const key = d.signatureKey.slice()
    key[0] ^= 1
    expect(verifyDevice(id, userId, { ...d, signatureKey: key })).toBe(false)
    expect(verifyDevice(id, userId, { ...d, deviceId: 'cmdev0002' })).toBe(false)
  })

  it('bozuk uzunluklu imza ya da açık anahtar hata fırlatmadan false döner', () => {
    const id = createIdentity()
    const d = device(id)
    expect(verifyDevice(id, userId, { ...d, identitySig: d.identitySig!.subarray(0, 10) })).toBe(false)
    expect(verifyDevice({ publicKey: seq(0, 31), version: 1 }, userId, d)).toBe(false)
  })
})

describe('kimliğin yedekte sarılması', () => {
  const bmk = seq(100)

  it('sarılan kimlik aynı bağlamla açılır, açık anahtar yeniden türetilir', () => {
    const id = createIdentity(2)
    const opened = unwrapIdentity(bmk, wrapIdentity(bmk, id, userId, 5), userId, 2, 5)
    expect(opened.privateKey).toEqual(id.privateKey)
    expect(opened.publicKey).toEqual(id.publicKey)
    expect(opened.version).toBe(2)
  })

  it('yanlış BMK, kullanıcı ya da sürümler açılmaz', () => {
    const id = createIdentity()
    const wrapped = wrapIdentity(bmk, id, userId, 1)
    expect(() => unwrapIdentity(seq(1), wrapped, userId, 1, 1)).toThrow(IdentityOpenError)
    expect(() => unwrapIdentity(bmk, wrapped, otherUserId, 1, 1)).toThrow(IdentityOpenError)
    expect(() => unwrapIdentity(bmk, wrapped, userId, 2, 1)).toThrow(IdentityOpenError)
    expect(() => unwrapIdentity(bmk, wrapped, userId, 1, 2)).toThrow(IdentityOpenError)
  })

  it('kurcalanmış bayt açılmaz', () => {
    const wrapped = wrapIdentity(bmk, createIdentity(), userId, 1)
    wrapped[wrapped.length - 1] ^= 1
    expect(() => unwrapIdentity(bmk, wrapped, userId, 1, 1)).toThrow(IdentityOpenError)
  })

  it('yanlış uzunluklu BMK reddedilir', () => {
    expect(() => wrapIdentity(seq(0, 16), createIdentity(), userId, 1)).toThrow(IdentityKeyError)
  })
})

describe('güvenlik kodu', () => {
  const idA = { publicKey: seq(10), version: 1 }
  const idB = { publicKey: seq(50), version: 1 }

  it('parmak izi Node SHA-512 ile aynı hesaplanır (sabit vektör)', () => {
    const digest = createHash('sha512')
      .update(pack([utf8('kv-e7-fp-v1'), utf8(userId), utf8('1'), idA.publicKey]))
      .digest()
    const expected = Array.from({ length: 6 }, (_, i) =>
      String(digest.readUIntBE(i * 5, 5) % 100000).padStart(5, '0'),
    )
    expect(fingerprint(userId, idA)).toEqual(expected)
  })

  it('6 grup × 5 hane, başta sıfır korunur', () => {
    for (let i = 0; i < 50; i++) {
      const fp = fingerprint(userId, { publicKey: createIdentity().publicKey, version: 1 })
      expect(fp).toHaveLength(6)
      for (const g of fp) expect(g).toMatch(/^\d{5}$/)
    }
  })

  it('iki tarafta aynı kod, 12 grup', () => {
    const fromA = safetyCode({ userId, identity: idA }, { userId: otherUserId, identity: idB })
    const fromB = safetyCode({ userId: otherUserId, identity: idB }, { userId, identity: idA })
    expect(fromA).toEqual(fromB)
    expect(fromA).toHaveLength(12)
    expect(fromA.slice(0, 6)).toEqual(fingerprint(userId, idA))
  })

  it('kimlik ya da sürüm değişince kod değişir', () => {
    const base = safetyCode({ userId, identity: idA }, { userId: otherUserId, identity: idB })
    const otherKey = safetyCode({ userId, identity: { publicKey: seq(11), version: 1 } }, { userId: otherUserId, identity: idB })
    const otherVersion = safetyCode({ userId, identity: { ...idA, version: 2 } }, { userId: otherUserId, identity: idB })
    expect(otherKey).not.toEqual(base)
    expect(otherVersion).not.toEqual(base)
  })
})
