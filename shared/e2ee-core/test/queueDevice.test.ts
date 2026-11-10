import { describe, expect, it } from 'vitest'
import {
  DeviceNotRegisteredError,
  NoMatchingKeyPackageError,
  SerialQueue,
  SerializationError,
  createDevice,
  createGroup,
  deserializeDevice,
  deserializeGroup,
  joinFromWelcome,
  pureProvider,
  webProvider,
} from '../src'
import { deliverWelcomes, groupOf, listOf, makePeer, setupGroup } from './helpers'

describe('SerialQueue (§1.7)', () => {
  it('görevler gelme sırasıyla art arda çalışır, çakışmaz', async () => {
    const q = new SerialQueue()
    const log: string[] = []
    const task = (name: string, ms: number) => async () => {
      log.push(`${name}:başla`)
      await new Promise((r) => setTimeout(r, ms))
      log.push(`${name}:bitti`)
      return name
    }
    const results = await Promise.all([q.run(task('a', 20)), q.run(task('b', 1)), q.run(task('c', 5))])
    expect(results).toEqual(['a', 'b', 'c'])
    expect(log).toEqual(['a:başla', 'a:bitti', 'b:başla', 'b:bitti', 'c:başla', 'c:bitti'])
  })

  it('hata veren görev kuyruğu tıkamaz', async () => {
    const q = new SerialQueue()
    await expect(q.run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x')
    await expect(q.run(async () => 'sonraki')).resolves.toBe('sonraki')
  })
})

describe('Device', () => {
  it('deviceId atanmadan KeyPackage üretilmez', async () => {
    const d = await createDevice(webProvider)
    await expect(d.exportKeyPackages(1)).rejects.toBeInstanceOf(DeviceNotRegisteredError)
    expect(d.signaturePublicKey).toHaveLength(32)
  })

  it('KeyPackage sayacı, tüketim ve last-resort', async () => {
    const a = await makePeer(webProvider, 'A')
    const b = await makePeer(webProvider, 'B')
    await b.device.exportKeyPackages(3)
    expect(b.device.availableKeyPackages).toBe(3)
    const lastResort = await b.device.exportLastResortKeyPackage()
    expect(b.device.availableKeyPackages).toBe(3) // last-resort sayılmaz
    await b.device.exportLastResortKeyPackage() // eskisinin yerine geçer
    expect(lastResort.length).toBeGreaterThan(0)
    // Welcome tüketilince normal paket düşer.
    const kp = await b.device.exportKeyPackages(1)
    const { group, pending } = await createGroup(a.device, { groupId: new Uint8Array(32), members: listOf([a, b]), keyPackages: kp })
    group.confirmCommit(pending)
    await deliverWelcomes(pending, [b], listOf([a, b]))
    expect(b.device.availableKeyPackages).toBe(3)
  })

  it('serialize: kimlik, anahtar ve paketler korunur; Welcome yeniden açılmış cihazla çözülür', async () => {
    const a = await makePeer(pureProvider, 'A')
    const b = await makePeer(pureProvider, 'B')
    await b.device.exportKeyPackages(2)
    b.device = deserializeDevice(b.device.serialize(), pureProvider)
    expect(b.device.deviceId).toBe('B')
    expect(b.device.availableKeyPackages).toBe(2)
    await setupGroup(a, [b])
    expect(groupOf(b).epoch).toBe(1)
    expect(b.device.availableKeyPackages).toBe(2) // setupGroup 1 yeni paket üretip tüketti
  })

  it('Welcome\'ın hedeflediği paket cihazda yoksa NoMatchingKeyPackageError', async () => {
    const a = await makePeer(webProvider, 'A')
    const b = await makePeer(webProvider, 'B')
    const stranger = await makePeer(webProvider, 'B2')
    const members = listOf([a, b])
    const { pending } = await createGroup(a.device, { groupId: new Uint8Array(32), members, keyPackages: await b.device.exportKeyPackages(1) })
    await expect(joinFromWelcome(stranger.device, pending.welcomes[0].welcome, members)).rejects.toBeInstanceOf(
      NoMatchingKeyPackageError,
    )
  })

  it('bozuk serialize verisi SerializationError', async () => {
    expect(() => deserializeDevice(new Uint8Array([1, 2, 3]), webProvider)).toThrow(SerializationError)
    expect(() => deserializeGroup(new Uint8Array([0, 0, 0, 1, 9]), webProvider)).toThrow(SerializationError)
  })
})
