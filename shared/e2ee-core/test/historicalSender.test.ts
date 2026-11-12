// 2026-11-12 sahip bulgusu: "tanınmayan cihaz" bandı. Eski epoch'ta gönderilmiş mesajın göndereni, mesajın
// epoch'undaki ağaçtan okunmalı. Gönderen sonradan çıkarılıp koltuğuna başka cihaz oturduysa, şimdiki ağaçtan
// okumak yanlış cihazı verir (sahte SenderMismatch ya da yanlış atıf).
import { describe, expect, it } from 'vitest'
import { pureProvider, textPayload, webProvider, type CryptoProvider } from '../src'
import { applyCommit, deliverWelcomes, groupOf, listOf, makePeer, setupGroup } from './helpers'

describe.each([
  ['webProvider', webProvider],
  ['pureProvider', pureProvider],
] as [string, CryptoProvider][])('eski epoch mesajının göndereni (%s)', (_name, provider) => {
  it('gönderen çıkarılıp koltuğuna yeni cihaz otursa da gönderen doğru çözülür', async () => {
    const [A1, A2, B] = await Promise.all(['A1', 'A2', 'B'].map((id) => makePeer(provider, id)))
    await setupGroup(A1, [A2, B])
    // A2 epoch 1'de yazar; B henüz okumadı.
    const eski = await groupOf(A2).encrypt(textPayload('A2 eski', 1))

    // A2 çıkarılır (çıkış yaptı, cihaz iptal), sonra yeni cihaz C eklenir: C boşalan koltuğa oturur.
    const withoutA2 = listOf([A1, B])
    const rm = await groupOf(A1).removeDevices(['A2'], withoutA2)
    await applyCommit(A1, rm, [B], withoutA2)
    const C = await makePeer(provider, 'C')
    const withC = listOf([A1, B, C])
    const [kp] = await C.device.exportKeyPackages(1)
    const add = await groupOf(A1).addDevices([kp], withC)
    await applyCommit(A1, add, [B], withC)
    await deliverWelcomes(add, [C], withC)

    // B eski mesajı şimdi çözer: gönderen A2 olmalı (C değil, hata değil).
    const r = await groupOf(B).decrypt(eski.ciphertext, 'A2')
    expect(r.senderDeviceId).toBe('A2')
    expect(r.payload).toMatchObject({ kind: 'text', payload: { body: 'A2 eski' } })
  })

  it('gönderen çıkarılıp koltuğu boş kalsa da eski mesajı çözülür', async () => {
    const [A1, A2, B] = await Promise.all(['A1', 'A2', 'B'].map((id) => makePeer(provider, id)))
    await setupGroup(A1, [A2, B])
    const eski = await groupOf(A2).encrypt(textPayload('A2 son', 1))
    const withoutA2 = listOf([A1, B])
    const rm = await groupOf(A1).removeDevices(['A2'], withoutA2)
    await applyCommit(A1, rm, [B], withoutA2)

    const r = await groupOf(B).decrypt(eski.ciphertext, 'A2')
    expect(r.senderDeviceId).toBe('A2')
  })

  it('sunucu eski mesajın göndericisini başka cihaz diye bildirirse yine reddedilir', async () => {
    const [A1, A2, B] = await Promise.all(['A1', 'A2', 'B'].map((id) => makePeer(provider, id)))
    await setupGroup(A1, [A2, B])
    const eski = await groupOf(A2).encrypt(textPayload('A2 eski', 1))
    const withoutA2 = listOf([A1, B])
    const rm = await groupOf(A1).removeDevices(['A2'], withoutA2)
    await applyCommit(A1, rm, [B], withoutA2)
    const C = await makePeer(provider, 'C')
    const withC = listOf([A1, B, C])
    const [kp] = await C.device.exportKeyPackages(1)
    const add = await groupOf(A1).addDevices([kp], withC)
    await applyCommit(A1, add, [B], withC)

    // Koltuğun yeni sahibi C'ye atfetme girişimi: gönderen kontrolü yakalamalı.
    await expect(groupOf(B).decrypt(eski.ciphertext, 'C')).rejects.toThrow()
  })
})
