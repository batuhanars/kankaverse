// C77 §2: bekleyen Welcome kuyruğunda bir kanalın hatası diğerlerini durdurmaz. Gerçek çekirdek (MLS) + sahte
// sunucu; sunucu ve sağlayıcı flowSuite beforeEach'inden gelir.
import { describe, expect, it } from 'vitest'
import { e2eeErrorTag, isChannelGoneError } from '../src/errors'
import { fail } from './fakeServer'
import { as, login, server, type Profile } from './flowSuite'

const GONE = 'ch-gone' // silinmiş istek kanalı: channelState 404 CHANNEL_NOT_FOUND
const FLAKY = 'ch-flaky' // geçici sunucu hatası: 503
const OK = 'ch-ok' // gerçek sohbet

/** A her kanalda grup kurar; B'nin cihazına üç Welcome bırakılır (sunucu sırası: GONE, FLAKY, OK). */
async function threeWelcomes(): Promise<{ A1: Profile; B1: Profile }> {
  for (const ch of [GONE, FLAKY, OK]) server.members.set(ch, ['A', 'B'])
  const A1 = await login('A')
  const B1 = await login('B')
  for (const ch of [GONE, FLAKY, OK]) expect(await as(A1, (e) => e.encrypt(ch, 'selam'))).not.toBeNull()
  server.channelStateErrors.set(GONE, fail(404, 'CHANNEL_NOT_FOUND'))
  server.channelStateErrors.set(FLAKY, fail(503, 'INTERNAL'))
  server.channelStateCalls = []
  return { A1, B1 }
}

const welcomeOf = (ch: string) => server.welcomes.find((w) => w.channelId === ch)!

export function welcomeQueueSuite(label: string) {
  describe(`[${label}] C77 Welcome kuyruğu yalıtımı`, () => {
    it('biri 404, biri 503 veren üç Welcome: sağlam olan işlenir, onWelcome fırlatmaz', async () => {
      const { B1 } = await threeWelcomes()
      expect(await as(B1, (e) => e.onWelcome())).toEqual([OK])
      expect(welcomeOf(OK).done).toBe(true)
      expect(await as(B1, (e) => e.encrypt(OK, 'cevap'))).not.toBeNull() // gerçek sohbet yazılabilir
    })

    it('404 olan kalıcı atlanır (ack), bir daha denenmez', async () => {
      const { B1 } = await threeWelcomes()
      await as(B1, (e) => e.onWelcome())
      expect(welcomeOf(GONE).done).toBe(true)
      server.channelStateCalls = []
      await as(B1, (e) => e.onWelcome())
      expect(server.channelStateCalls).not.toContain(GONE)
    })

    it('5xx olan ack lenmez, sonraki çağrıda yeniden denenir ve katılınır', async () => {
      const { B1 } = await threeWelcomes()
      await as(B1, (e) => e.onWelcome())
      expect(welcomeOf(FLAKY).done).toBe(false)
      server.channelStateErrors.delete(FLAKY)
      expect(await as(B1, (e) => e.onWelcome())).toEqual([FLAKY])
      expect(welcomeOf(FLAKY).done).toBe(true)
    })

    it('kanal açılışı (open) başka kanalın 404 Welcome u yüzünden düşmez', async () => {
      const { B1 } = await threeWelcomes()
      server.channelStateErrors.delete(FLAKY)
      expect((await as(B1, (e) => e.open(OK))).encrypted).toBe(true)
      expect(await as(B1, (e) => e.encrypt(OK, 'açıldı'))).not.toBeNull()
    })

    it('cihaz/hesap düzeyi 403/404 (E2EE_*) kalıcı sayılmaz; kanal düzeyi 404/403 sayılır; ağ hatası sayılmaz', () => {
      expect(isChannelGoneError(fail(404, 'CHANNEL_NOT_FOUND'))).toBe(true)
      expect(isChannelGoneError(fail(403, 'NOT_CHANNEL_MEMBER'))).toBe(true)
      expect(isChannelGoneError(fail(403, 'E2EE_DEVICE_REQUIRED'))).toBe(false)
      expect(isChannelGoneError(fail(404, 'E2EE_DISABLED'))).toBe(false)
      expect(isChannelGoneError(fail(503, 'INTERNAL'))).toBe(false)
      expect(isChannelGoneError(new Error('ağ yok'))).toBe(false)
    })

    it('hata etiketi içeriksiz: ad + durum + kod + yöntem ve yol (sorgu dizesi yok)', () => {
      const e = Object.assign(fail(404, 'CHANNEL_NOT_FOUND'), {
        name: 'AxiosError',
        config: { method: 'get', url: '/e2ee/channels/c1?x=gizli', data: 'gövde' },
      })
      expect(e2eeErrorTag(e)).toBe('AxiosError 404 CHANNEL_NOT_FOUND GET /e2ee/channels/c1')
      expect(e2eeErrorTag('metin')).toBe('string')
    })
  })
}
