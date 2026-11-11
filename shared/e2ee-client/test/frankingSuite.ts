// E4 §2/§4: parmak izi (franking) gönderme, doğrulama ve şikâyet kanıtı toplama. Sunucu/sağlayıcı flowSuite beforeEach'inden gelir.
import { describe, expect, it } from 'vitest'
import { E2eeEngine } from '../src/engine'
import { serialLock } from '../src/lock'
import { as, CH, login, provider, send, server, show, type Msg } from './flowSuite'

const at = (i: number) => new Date(Date.UTC(2026, 10, 10, 10, 0, i)).toISOString()
const B64_32 = /^[A-Za-z0-9+/]{43}=$/ // 32 bayt base64

async function pairWithFranking(on = true) {
  server.franking = on
  const A1 = await login('A')
  const B1 = await login('B')
  return { A1, B1 }
}

export function frankingSuite(label: string) {
  describe(`[${label}] E4 parmak izi (franking)`, () => {
    it('bayrak açık: v2 + frankingTag gider, karşı taraf doğrular ve gösterir', async () => {
      const { A1, B1 } = await pairWithFranking()
      const cipher = await as(A1, (e) => e.encrypt(CH, 'selam'))
      expect(cipher!.frankingTag).toMatch(B64_32)
      const m1 = await send(A1, 'm1', 'merhaba çğı 🔒')
      expect(m1.frankingTag).toMatch(B64_32)
      await as(B1, (e) => e.onWelcome())
      const [shown] = await show(B1, [m1])
      expect(shown).toMatchObject({ content: 'merhaba çğı 🔒', e2eeStatus: 'ok' })
    })

    it('bayrak kapalı: bugünkü v1, frankingTag yok; fk kayıtta yok', async () => {
      const { A1, B1 } = await pairWithFranking(false)
      const cipher = await as(A1, (e) => e.encrypt(CH, 'v1'))
      expect(cipher!.frankingTag).toBeUndefined()
      const m1 = await send(A1, 'm1', 'v1 mesaj')
      await as(B1, (e) => e.onWelcome())
      expect((await show(B1, [m1]))[0].content).toBe('v1 mesaj')
      const ev = await as(B1, (e) => e.collectEvidence(CH, 'm1', []))
      expect(ev).toHaveLength(1)
      expect(ev[0].fk).toBeUndefined()
    })

    it('v1 mesaj bayrağı açık alıcıda da okunur (eski gönderici)', async () => {
      server.franking = false
      const A1 = await login('A')
      server.franking = true
      const B1 = await login('B')
      const m1 = await send(A1, 'm1', 'eski istemci')
      await as(B1, (e) => e.onWelcome())
      expect((await show(B1, [m1]))[0]).toMatchObject({ content: 'eski istemci', e2eeStatus: 'ok' })
    })

    it('tag kurcalanırsa ya da eksikse: unverified, gövde gösterilmez', async () => {
      const { A1, B1 } = await pairWithFranking()
      const good = await send(A1, 'm1', 'gerçek')
      const wrong = await send(A1, 'm2', 'ikinci')
      const missing = await send(A1, 'm3', 'üçüncü')
      await as(B1, (e) => e.onWelcome())
      const tampered: Msg = { ...wrong, frankingTag: good.frankingTag } // başka mesajın tag'i
      const noTag: Msg = { ...missing, frankingTag: null }
      const out = await show(B1, [good, tampered, noTag])
      expect(out[0]).toMatchObject({ content: 'gerçek', e2eeStatus: 'ok' })
      expect(out[1]).toMatchObject({ content: '', e2eeStatus: 'unverified' })
      expect(out[2]).toMatchObject({ content: '', e2eeStatus: 'unverified' })
    })

    it('tek bit bozulmuş tag de tutmaz', async () => {
      const { A1, B1 } = await pairWithFranking()
      const m1 = await send(A1, 'm1', 'x')
      await as(B1, (e) => e.onWelcome())
      const tag = m1.frankingTag!
      const flipped = (tag[0] === 'A' ? 'B' : 'A') + tag.slice(1)
      expect((await show(B1, [{ ...m1, frankingTag: flipped }]))[0].e2eeStatus).toBe('unverified')
    })

    it('unverified kalıcıdır: yeniden açılışta aynı kalır', async () => {
      const { A1, B1 } = await pairWithFranking()
      const m1 = await send(A1, 'm1', 'x')
      await as(B1, (e) => e.onWelcome())
      await show(B1, [{ ...m1, frankingTag: null }])
      const again = (await E2eeEngine.start('B', {
        api: server.apiFor('B', B1.family),
        openVault: async () => B1.vault,
        withLock: serialLock(),
        provider,
        onWarn: () => {},
      }))!
      expect((await again.hydrate(CH, [{ ...m1, frankingTag: null }]))[0].e2eeStatus).toBe('unverified')
    })

    it('tag sonradan gelirse unverified, depodaki fk+gövdeyle terfi eder; yanlış tag unverified bırakır; gövde sızmaz', async () => {
      const { A1, B1 } = await pairWithFranking()
      const m1 = await send(A1, 'm1', 'gizli gövde')
      await as(B1, (e) => e.onWelcome())

      // 1) tag'siz v2: unverified, gövde ekranda yok.
      const first = (await show(B1, [{ ...m1, frankingTag: null }]))[0]
      expect(first).toMatchObject({ content: '', e2eeStatus: 'unverified' })

      // 2) yanlış tag: unverified kalır; alıntı, kanıt ve bildirim yolu gövdeyi vermez.
      const wrongTag = (m1.frankingTag![0] === 'A' ? 'B' : 'A') + m1.frankingTag!.slice(1)
      const wrong = (await show(B1, [{ ...m1, frankingTag: wrongTag }]))[0]
      expect(wrong).toMatchObject({ content: '', e2eeStatus: 'unverified' })
      expect(await as(B1, (e) => e.quoteText('m1'))).toBeNull()
      expect(await as(B1, (e) => e.collectEvidence(CH, 'm1', []))).toEqual([])
      const local = (await E2eeEngine.openLocal('B', {
        openVault: async () => B1.vault,
        withLock: serialLock(),
        provider,
      }))!
      expect(await local.decryptOffline({ ...m1, frankingTag: null })).toEqual({ kind: 'unavailable' })
      expect(JSON.stringify([first, wrong])).not.toContain('gizli gövde')

      // 3) doğru tag: çözme gerekmeden ok'a terfi, gövde görünür, kanıta girer.
      const ok = (await show(B1, [m1]))[0]
      expect(ok).toMatchObject({ content: 'gizli gövde', e2eeStatus: 'ok' })
      expect(await as(B1, (e) => e.quoteText('m1'))).toBe('gizli gövde')
      expect((await as(B1, (e) => e.collectEvidence(CH, 'm1', [])))[0]).toMatchObject({ body: 'gizli gövde' })
    })

    it('fk yerel kayda yazılır: alıcıda ve gönderende (kanıt çıktısında görünür)', async () => {
      const { A1, B1 } = await pairWithFranking()
      const m1 = await send(A1, 'm1', 'kanıt')
      await as(B1, (e) => e.onWelcome())
      await show(B1, [m1])
      const onB = await as(B1, (e) => e.collectEvidence(CH, 'm1', []))
      const onA = await as(A1, (e) => e.collectEvidence(CH, 'm1', []))
      expect(onB[0].fk).toMatch(B64_32)
      expect(onA[0].fk).toBe(onB[0].fk) // aynı mesajın aynı anahtarı
      expect(onA[0].sentAt).toBe(onB[0].sentAt)
    })

    it('collectEvidence: hedef + en yakın 5; yalnız ok olanlar; hedef ok değilse boş', async () => {
      const { A1, B1 } = await pairWithFranking()
      const msgs: Msg[] = []
      for (let i = 1; i <= 8; i++) msgs.push(await send(A1, `m${i}`, `mesaj ${i}`, at(i)))
      await as(B1, (e) => e.onWelcome())
      // m6 kurcalı: unverified (kanıta girmez).
      const view = await show(B1, msgs.map((m) => (m.id === 'm6' ? { ...m, frankingTag: null } : m)))
      expect(view.find((m) => m.id === 'm6')!.e2eeStatus).toBe('unverified')

      // Hedef m8; önceki mesajlar ters sırada verilir (sıra önemsiz). En yakın 5 = m3..m7, m6 elenir.
      const older = msgs.slice(0, 7).reverse()
      const ev = await as(B1, (e) => e.collectEvidence(CH, 'm8', older))
      expect(ev.map((x) => x.messageId)).toEqual(['m8', 'm3', 'm4', 'm5', 'm7'])
      expect(ev.every((x) => x.fk !== undefined)).toBe(true)
      expect(ev[0].body).toBe('mesaj 8')

      expect(await as(B1, (e) => e.collectEvidence(CH, 'm6', msgs.slice(0, 5)))).toEqual([]) // hedef unverified
      expect(await as(B1, (e) => e.collectEvidence('baska', 'm8', []))).toEqual([]) // başka kanal
      expect(await as(B1, (e) => e.collectEvidence(CH, 'yok', msgs))).toEqual([]) // hedef depoda yok
    })

    it('ağsız motor son bilinen bayrakla v2 + tag üretir (hızlı cevap yolu)', async () => {
      const { A1, B1 } = await pairWithFranking()
      const m1 = await send(A1, 'm1', 'ilk')
      await as(B1, (e) => e.onWelcome())
      await show(B1, [m1])
      const local = (await E2eeEngine.openLocal('B', {
        openVault: async () => B1.vault,
        withLock: serialLock(),
        provider,
      }))!
      const cipher = await local.encryptOffline(CH, 'cevap')
      expect(cipher!.frankingTag).toMatch(B64_32)
      const reply: Msg = {
        id: 'r1',
        channelId: CH,
        content: '',
        createdAt: at(30),
        encrypted: true,
        ciphertext: cipher!.ciphertext,
        senderDeviceId: B1.deviceId(),
        frankingTag: cipher!.frankingTag,
      }
      expect((await show(A1, [reply]))[0]).toMatchObject({ content: 'cevap', e2eeStatus: 'ok' })
    })
  })
}
