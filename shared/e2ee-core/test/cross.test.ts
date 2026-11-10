// Çapraz uyum: web (WebCrypto) cihazı ile mobil (saf noble) cihazı aynı grupta çalışır.
import { describe, expect, it } from 'vitest'
import { pureProvider, textPayload, webProvider } from '../src'
import { applyCommit, deliverWelcomes, groupOf, listOf, makePeer, send, setupGroup } from './helpers'

describe('webProvider <-> pureProvider', () => {
  it('web kurar, saf katılır; her iki yöne mesaj ve commit (UpdatePath HPKE) geçer', async () => {
    const web = await makePeer(webProvider, 'W')
    const pure = await makePeer(pureProvider, 'P')
    await setupGroup(web, [pure])
    expect(await send(web, [pure], 'web -> pure')).toEqual(['web -> pure'])
    expect(await send(pure, [web], 'pure -> web')).toEqual(['pure -> web'])

    // Saf cihaz yeni bir web cihazı ekler: commit'i web işler, Welcome'ı yeni cihaz çözer.
    const web2 = await makePeer(webProvider, 'W2')
    const members = listOf([web, pure, web2])
    const pending = await groupOf(pure).addDevices(await web2.device.exportKeyPackages(1), members)
    await applyCommit(pure, pending, [web], members)
    await deliverWelcomes(pending, [web2], members)
    expect(await send(web2, [web, pure], 'üçlü')).toHaveLength(2)
  })

  it('saf kurar, web katılır', async () => {
    const pure = await makePeer(pureProvider, 'P')
    const web = await makePeer(webProvider, 'W')
    await setupGroup(pure, [web])
    expect(await send(pure, [web], 'pure kurdu')).toEqual(['pure kurdu'])
    const m = await groupOf(web).encrypt(textPayload('geri', 2))
    const r = await groupOf(pure).decrypt(m.ciphertext, 'W')
    expect(r.payload.kind).toBe('text')
  })
})
