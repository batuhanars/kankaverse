// E3 §3.2: bildirim için tek mesaj çözme. Sunucu/sağlayıcı kurulumu flowSuite beforeEach'inden gelir.
import { deserializeGroup, type TextPayload } from '@kankaverse/e2ee-core'
import { describe, expect, it, vi } from 'vitest'
import { toB64 } from '../src/b64'
import { E2eeEngine } from '../src/engine'
import { serialLock } from '../src/lock'
import { as, CH, login, provider, send, server, show, type Msg, type Profile } from './flowSuite'

/** B'nin grup durumuna yazım sayısı: her MLS çözmesi anahtar tükettiği için bir `saveGroup` demektir. */
function countGroupWrites(p: Profile) {
  const spy = vi.spyOn(p.vault, 'put')
  return () => spy.mock.calls.filter(([store, key]) => store === 'groups' && key === CH).length
}

const notify = (p: Profile, m: Msg) => as(p, (e) => e.decryptForNotification(m))

async function pair() {
  const A1 = await login('A')
  const B1 = await login('B')
  return { A1, B1 }
}

export function notificationSuite(label: string) {
  describe(`[${label}] bildirim çözmesi (E3 §3)`, () => {
    it('bildirimden çözülen mesaj sohbet açılışında depodan gelir; grup çözmesi ikinci kez yapılmaz', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'bildirimde görünen')
      await as(B1, (e) => e.onWelcome())
      const writes = countGroupWrites(B1)

      expect(await notify(B1, m1)).toEqual({ kind: 'text', body: 'bildirimde görünen' })
      expect(writes()).toBe(1)
      const shown = await show(B1, [m1])
      expect(shown[0]).toMatchObject({ content: 'bildirimde görünen', e2eeStatus: 'ok' })
      expect(writes()).toBe(1) // ikinci çözme yok (olsaydı anahtar tükenmiş olduğundan "failed" görünürdü)
    })

    it('bildirim ve hydrate eşzamanlı başlar: tek çözme, ikisi de aynı metni görür', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'eşzamanlı')
      await as(B1, (e) => e.onWelcome())
      const writes = countGroupWrites(B1)

      const [preview, shown] = await Promise.all([notify(B1, m1), show(B1, [m1])])
      expect(preview).toEqual({ kind: 'text', body: 'eşzamanlı' })
      expect(shown[0].content).toBe('eşzamanlı')
      expect(writes()).toBe(1)
    })

    it('sırasız varış: 2. mesaj bildirimle önce, 1. mesaj sonra sohbette çözülür', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'bir')
      const m2 = await send(A1, 'm2', 'iki')
      await as(B1, (e) => e.onWelcome())

      expect(await notify(B1, m2)).toEqual({ kind: 'text', body: 'iki' })
      expect((await show(B1, [m1, m2])).map((m) => m.content)).toEqual(['bir', 'iki'])
    })

    it('iptal edilmiş cihazın iptal sonrası mesajı: hidden', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'eski')
      await as(B1, (e) => e.onWelcome())
      await show(B1, [m1])
      const A2 = await login('A')
      await as(A1, (e) => e.onGroupChanged(CH))
      await as(A2, (e) => e.onWelcome())
      await as(B1, (e) => e.onGroupChanged(CH))
      const late = await send(A2, 'e2', 'iptalden sonra', '2026-11-10T13:00:00.000Z')
      server.revoke(A2.deviceId(), new Date('2026-11-10T12:00:00Z'))
      await as(A1, (e) => e.onGroupChanged(CH))

      expect(await notify(B1, late)).toEqual({ kind: 'hidden' })
    })

    it('ağ hatası: unavailable, depoya kayıt yazılmaz; ağ gelince hydrate çözer; içerik loglanmaz', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'gizli metin')
      await as(B1, (e) => e.onWelcome())
      const real = server.apiFor('B', B1.family)
      const down = () => Promise.reject(new Error('ağ yok'))
      const logs: string[] = []
      const offline = (await E2eeEngine.start('B', {
        api: new Proxy(real, { get: (t, k) => (k === 'channelState' ? down : t[k as keyof typeof t]) }),
        openVault: async () => B1.vault,
        withLock: serialLock(),
        provider,
        onWarn: () => {},
        log: (message, error) => logs.push(`${message} ${String(error ?? '')}`),
      }))!

      expect(await offline.decryptForNotification(m1)).toEqual({ kind: 'unavailable' })
      expect(await B1.vault.get('messages', 'm1')).toBeNull() // kalıcı failed/undecryptable YAZILMADI
      expect(logs.join()).not.toContain('gizli metin')
      expect(logs.join()).not.toContain(m1.ciphertext!)
      expect((await show(B1, [m1]))[0]).toMatchObject({ content: 'gizli metin', e2eeStatus: 'ok' })
    })

    it('bilinmeyen yük sürümü: unavailable', async () => {
      const { A1, B1 } = await pair()
      const first = await send(A1, 'm1', 'önce') // grup kurulsun
      await as(B1, (e) => e.onWelcome())
      await show(B1, [first])
      // v:2 yükü: motor yalnız v:1 üretir, bu yüzden göndericinin grubunu doğrudan açıp şifreliyoruz.
      const group = deserializeGroup((await A1.vault.get('groups', CH))!, provider)
      const v2 = { v: 2, t: 'text', body: 'x', sentAt: 1 } as unknown as TextPayload
      const sealed = await group.encrypt(v2)
      await A1.vault.put('groups', CH, group.serialize())
      const m2: Msg = { ...first, id: 'm2', ciphertext: toB64(sealed.ciphertext) }

      expect(await notify(B1, m2)).toEqual({ kind: 'unavailable' })
    })
  })
}
