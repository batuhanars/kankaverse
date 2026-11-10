// E0 senaryolarının üretim API'siyle karşılığı. Her iki sağlayıcıyla da koşar.
import { describe, expect, it } from 'vitest'
import {
  DecryptError,
  E2eeError,
  GroupOperationError,
  GroupStateError,
  deserializeDevice,
  deserializeGroup,
  pureProvider,
  textPayload,
  webProvider,
  type CryptoProvider,
} from '../src'
import { applyCommit, deliverWelcomes, groupOf, listOf, makePeer, send, setupGroup } from './helpers'

describe.each([
  ['webProvider', webProvider],
  ['pureProvider', pureProvider],
] as [string, CryptoProvider][])('1-1 DM senaryoları (%s)', (_name, provider) => {
  const fleet = async () => {
    const [A1, A2, B] = await Promise.all(['A1', 'A2', 'B'].map((id) => makePeer(provider, id)))
    await setupGroup(A1, [A2, B])
    return { A1, A2, B }
  }

  it('A1 kurar, A2 ve B katılır; üç cihaz her yöne mesajı çözer', async () => {
    const { A1, A2, B } = await fleet()
    expect(groupOf(A1).epoch).toBe(1)
    expect(groupOf(B).memberDeviceIds().sort()).toEqual(['A1', 'A2', 'B'])
    expect(await send(A1, [A2, B], 'A1 hepsine')).toEqual(['A1 hepsine', 'A1 hepsine'])
    expect(await send(B, [A1, A2], 'B hepsine')).toEqual(['B hepsine', 'B hepsine'])
    expect(await send(A2, [A1, B], 'Türkçe çğıöşü 🔒')).toEqual(['Türkçe çğıöşü 🔒', 'Türkçe çğıöşü 🔒'])
  })

  it('cihaz ekleme: B yeni cihaz C ekler, eski mesajları göremez, yenileri çözer', async () => {
    const { A1, A2, B } = await fleet()
    const eski = await groupOf(A1).encrypt(textPayload('eski', 1))
    const C = await makePeer(provider, 'C')
    const members = listOf([A1, A2, B, C])
    const [kp] = await C.device.exportKeyPackages(1)
    const pending = await groupOf(B).addDevices([kp], members)
    expect(pending.baseEpoch).toBe(1)
    await applyCommit(B, pending, [A1, A2], members)
    await deliverWelcomes(pending, [C], members)
    expect(groupOf(C).epoch).toBe(2)
    await expect(groupOf(C).decrypt(eski.ciphertext, 'A1')).rejects.toBeInstanceOf(DecryptError)
    expect(await send(A1, [A2, B, C], 'yeni')).toEqual(['yeni', 'yeni', 'yeni'])
  })

  it('cihaz çıkarma: çıkarılan cihaz yeni mesajı çözemez ve gönderemez', async () => {
    const { A1, A2, B } = await fleet()
    const members = listOf([A1, B]) // A2 iptal edildi
    const pending = await groupOf(A1).removeDevices(['A2'], members)
    await applyCommit(A1, pending, [B], members)
    const r = await groupOf(A2).processCommit(pending.commit, members)
    expect(r.removed).toBe(true)
    expect(groupOf(A2).isActive).toBe(false)
    expect(await send(A1, [B], 'A2 yok artık')).toEqual(['A2 yok artık'])
    const after = await groupOf(A1).encrypt(textPayload('gizli', 1))
    await expect(groupOf(A2).decrypt(after.ciphertext, 'A1')).rejects.toBeInstanceOf(DecryptError)
    await expect(groupOf(A2).encrypt(textPayload('x', 1))).rejects.toBeInstanceOf(GroupStateError)
  })

  it('serialize/deserialize sonrası devam (cihaz ve grup)', async () => {
    const { A1, A2, B } = await fleet()
    for (const p of [A1, A2, B]) {
      p.group = deserializeGroup(groupOf(p).serialize(), provider)
      p.device = deserializeDevice(p.device.serialize(), provider)
    }
    expect(B.device.deviceId).toBe('B')
    expect(await send(A1, [A2, B], 'yeniden açılış')).toEqual(['yeniden açılış', 'yeniden açılış'])
    expect(await send(B, [A1, A2], 'B de devam')).toEqual(['B de devam', 'B de devam'])
  })

  it('aynı epoch çift commit: ikincisi reddedilir, kaybeden toparlanıp yeniden dener', async () => {
    const { A1, A2, B } = await fleet()
    const [C, D] = await Promise.all([makePeer(provider, 'C'), makePeer(provider, 'D')])
    const members = listOf([A1, A2, B, C, D])
    const [kpC] = await C.device.exportKeyPackages(1)
    const [kpD] = await D.device.exportKeyPackages(1)
    const p1 = await groupOf(A1).addDevices([kpC], members)
    const p2 = await groupOf(A2).addDevices([kpD], members)
    // Sunucu sırası: önce p1 kabul.
    await applyCommit(A1, p1, [B], members)
    await expect(groupOf(B).processCommit(p2.commit, members)).rejects.toBeInstanceOf(GroupOperationError)
    // A2 kendi commit'ini hiç uygulamadı: kazananı işler, sonra yeniden üretir.
    await groupOf(A2).processCommit(p1.commit, members)
    await deliverWelcomes(p1, [C], members)
    const p3 = await groupOf(A2).addDevices([(await D.device.exportKeyPackages(1))[0]], members)
    await applyCommit(A2, p3, [A1, B, C], members)
    await deliverWelcomes(p3, [D], members)
    expect(await send(B, [A1, A2, C, D], 'toparlandı')).toHaveLength(4)
  })

  it('bekleyen commit reddedilince (409) yerel durum ilerlemez', async () => {
    const { A1, A2, B } = await fleet()
    const C = await makePeer(provider, 'C')
    const members = listOf([A1, A2, B, C])
    await groupOf(A1).addDevices(await C.device.exportKeyPackages(1), members) // atılır
    expect(groupOf(A1).epoch).toBe(1)
    expect(await send(A1, [A2, B], 'hâlâ epoch 1')).toHaveLength(2)
  })

  it('sırasız gelen mesajlar çözülür', async () => {
    const { A1, A2, B } = await fleet()
    const m1 = await groupOf(A1).encrypt(textPayload('m1', 1))
    const m2 = await groupOf(A1).encrypt(textPayload('m2', 2))
    const r2 = await groupOf(B).decrypt(m2.ciphertext, 'A1')
    const r1 = await groupOf(B).decrypt(m1.ciphertext, 'A1')
    expect([r1.payload, r2.payload].map((p) => (p.kind === 'text' ? p.payload.body : '?'))).toEqual(['m1', 'm2'])
    void A2
  })

  it('aynı şifreli mesaj ikinci kez çözülemez', async () => {
    const { A1, B } = await fleet()
    const m = await groupOf(A1).encrypt(textPayload('bir kez', 1))
    await groupOf(B).decrypt(m.ciphertext, 'A1')
    await expect(groupOf(B).decrypt(m.ciphertext, 'A1')).rejects.toBeInstanceOf(DecryptError)
  })

  it('bozuk bayt DecryptError, commit baytı decrypt yolundan durum ilerletemez', async () => {
    const { A1, A2, B } = await fleet()
    await expect(groupOf(B).decrypt(new Uint8Array([1, 2, 3]), 'A1')).rejects.toBeInstanceOf(DecryptError)
    const C = await makePeer(provider, 'C')
    const members = listOf([A1, A2, B, C])
    const pending = await groupOf(A1).addDevices(await C.device.exportKeyPackages(1), members)
    // decrypt yolunda kimlik listesi boş: ekleme commit'i kimlik doğrulamasında düşer.
    await expect(groupOf(B).decrypt(pending.commit, 'A1')).rejects.toBeInstanceOf(E2eeError)
    // Çıkarma commit'i kimlik denetimine takılmaz ama reddedici callback + tür denetimi durdurur.
    const removal = await groupOf(A1).removeDevices(['A2'], listOf([A1, B]))
    await expect(groupOf(B).decrypt(removal.commit, 'A1')).rejects.toBeInstanceOf(DecryptError)
    expect(groupOf(B).epoch).toBe(1)
  })
})
