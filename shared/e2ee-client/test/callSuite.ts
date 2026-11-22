// E8 §4.1: arama anahtarı istemci akışı. Gerçek çekirdek (MLS) + sahte sunucu; sunucu ve sağlayıcı
// flowSuite beforeEach'inden gelir.
import { describe, expect, it } from 'vitest'
import { CallKeyUnavailableError } from '../src/errors'
import { as, CH, login, send, server, type Profile } from './flowSuite'

const EARLY = '2026-11-10T09:00:00.000Z'
const LEFT = '2026-11-10T12:00:00.000Z'
const serverEpoch = () => server.groups.get(CH)!.epoch
const keyOf = (p: Profile, epoch = serverEpoch()) => as(p, (e) => e.callKey(CH, epoch))
const reasonOf = async (p: Profile, epoch = serverEpoch()) => {
  const err = await keyOf(p, epoch).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(CallKeyUnavailableError)
  return (err as CallKeyUnavailableError).reason
}

export function callSuite(label: string) {
  describe(`[${label}] E8 arama anahtarı`, () => {
    it('1-1: iki taraf aynı anahtarı türetir; Welcome henüz işlenmemişse callKey kendisi işler', async () => {
      const A1 = await login('A')
      const B1 = await login('B')
      await send(A1, 'm1', 'merhaba') // grup kurulur; B1'in Welcome'ı bekliyor

      const a = await keyOf(A1)
      const b = await keyOf(B1) // onWelcome çağrılmadı: callKey açılışta işler
      expect(a.key).toHaveLength(32)
      expect(b.key).toEqual(a.key)
      expect(a.epoch).toBe(serverEpoch())
    })

    it('salt okunur: iki çağrı aynı anahtarı verir, sunucuya commit gitmez', async () => {
      const A1 = await login('A')
      const B1 = await login('B')
      await send(A1, 'm1', 'merhaba')
      await as(B1, (e) => e.onWelcome())
      const handshakes = server.handshakes.length

      const first = await keyOf(A1)
      expect((await keyOf(A1)).key).toEqual(first.key)
      expect(server.handshakes.length).toBe(handshakes)
    })

    it('gruba henüz eklenmemiş cihaz → NOT_MEMBER (şifresiz bağlanmaz)', async () => {
      const A1 = await login('A')
      await login('B')
      await send(A1, 'm1', 'merhaba')
      const B2 = await login('B') // yeni cihaz: A1 henüz eşitlemedi, Welcome yok

      expect(await reasonOf(B2)).toBe('NOT_MEMBER')
    })

    it("eşitlemeden sonra hâlâ sunucunun epoch'unun gerisinde → STALE", async () => {
      const A1 = await login('A')
      await login('B')
      await send(A1, 'm1', 'merhaba')

      expect(await reasonOf(A1, serverEpoch() + 1)).toBe('STALE')
    })

    it('geride kalan cihaz callKey ile commit işler: yeni cihaz eklenince herkes YENİ epoch anahtarında buluşur', async () => {
      const A1 = await login('A')
      const B1 = await login('B')
      await send(A1, 'm1', 'merhaba')
      await as(B1, (e) => e.onWelcome())
      const before = await keyOf(A1)

      const B2 = await login('B')
      await as(A1, (e) => e.onGroupChanged(CH)) // B2 eklenir, epoch ilerler; B1 geride

      const a = await keyOf(A1)
      expect(a.epoch).toBe(before.epoch + 1)
      expect(a.key).not.toEqual(before.key)
      expect((await keyOf(B1)).key).toEqual(a.key) // B1 commit'i callKey içinde işledi
      expect((await keyOf(B2)).key).toEqual(a.key) // B2 Welcome'ı callKey içinde işledi
    })

    it('grup DM: çıkarılan üye yeni anahtarı türetemez (NOT_MEMBER), kalanlar yeni anahtarda buluşur', async () => {
      server.makeGroup(CH, ['A', 'B', 'C'], EARLY)
      const A1 = await login('A')
      const B1 = await login('B')
      const C1 = await login('C')
      await send(A1, 'm1', 'ilk')
      const before = await keyOf(C1)
      expect((await keyOf(B1)).key).toEqual(before.key)

      server.removeMember(CH, 'C', LEFT)
      await as(A1, (e) => e.onGroupChanged(CH)) // çıkarma commit'i

      const a = await keyOf(A1)
      expect(a.key).not.toEqual(before.key)
      expect((await keyOf(B1)).key).toEqual(a.key)
      expect(await reasonOf(C1)).toBe('NOT_MEMBER')
    })
  })
}
