// E2 §3.5 ölçüm (yalnız Node kısmı): 10 kullanıcı x 2 cihaz (20 yaprak) grup kurma + katılma süresi, Welcome ve commit
// boyutu api DTO sınırına (E2EE_HANDSHAKE_MAX_B64 = 128 KiB karakter) karşı. Telefon ölçümü mobil adımında.
// Süre eşikleri gevşek (CI makinesi değişken); asıl rakamlar console.info ile raporlanır. 100 yaprak: E2EE_SCALE_FULL=1.
import { beforeEach, describe, expect, it } from 'vitest'
import { pureProvider, webProvider } from '@kankaverse/e2ee-core'
import { as, CH, login, send, server, show, flowSetup, type Profile } from './flowSuite'

const HANDSHAKE_MAX_B64 = 128 * 1024 // api e2ee.constants.ts
const WELCOMES_PER_REQUEST = 20
const EARLY = '2026-11-10T09:00:00.000Z'

const ms = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
  const t0 = performance.now()
  const out = await fn()
  return [out, Math.round(performance.now() - t0)]
}
const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0)

async function devicesOf(users: number, perUser: number): Promise<Profile[][]> {
  const all: Profile[][] = []
  for (let u = 0; u < users; u++) {
    const row: Profile[] = []
    for (let d = 0; d < perUser; d++) row.push(await login(`U${u}`))
    all.push(row)
  }
  return all
}

for (const [label, provider] of [['web', webProvider], ['pure', pureProvider]] as const) {
  describe(`[${label}] grup ölçümü`, () => {
    beforeEach(() => flowSetup(provider))

    it('10 kullanıcı x 2 cihaz: kurma + katılma süresi, Welcome/commit boyutu DTO sınırı içinde', async () => {
      const users = Array.from({ length: 10 }, (_, i) => `U${i}`)
      server.makeGroup(CH, users, EARLY)
      const devs = await devicesOf(10, 2)
      const flat = devs.flat()
      const sender = flat[0]

      const [cipher, createMs] = await ms(() => as(sender, (e) => e.encrypt(CH, 'ilk mesaj')))
      expect(cipher).not.toBeNull()
      expect(server.welcomes).toHaveLength(19)
      const welcomeB64 = max(server.welcomes.map((w) => w.welcome.length))
      const commitB64 = max(server.handshakes.map((h) => h.commit.length))

      const joinMs: number[] = []
      for (const p of flat.slice(1)) {
        const [joined, t] = await ms(() => as(p, (e) => e.onWelcome()))
        expect(joined).toEqual([CH])
        joinMs.push(t)
      }
      const m1 = await send(sender, 'm1', 'herkese')
      const [shown, firstDecryptMs] = await ms(() => show(flat[19], [m1]))
      expect(shown[0].content).toBe('herkese')

      // Grup büyükken tek cihaz ekleme (en sık işlem) ve çıkarma commit'i
      const extra = await login('U3')
      const [, addMs] = await ms(() => as(sender, (e) => e.onGroupChanged(CH)))
      const addCommitB64 = server.handshakes[server.handshakes.length - 1].commit.length
      const addWelcomeB64 = server.welcomes[server.welcomes.length - 1].welcome.length
      const [, joinNewMs] = await ms(() => as(extra, (e) => e.onWelcome()))
      server.revoke(extra.deviceId(), new Date())
      const [, removeMs] = await ms(() => as(sender, (e) => e.onGroupChanged(CH)))
      const removeCommitB64 = server.handshakes[server.handshakes.length - 1].commit.length

      console.info(
        `[ölçüm ${label}] 20 yaprak: kurma ${createMs} ms (claim+createGroup+şifreleme); katılma ort ${Math.round(
          joinMs.reduce((a, b) => a + b, 0) / joinMs.length,
        )} ms, en kötü ${max(joinMs)} ms; ilk çözme ${firstDecryptMs} ms; cihaz ekleme ${addMs} ms; yeni cihaz katılma ${joinNewMs} ms; çıkarma ${removeMs} ms\n` +
          `  boyut (base64 karakter, sınır ${HANDSHAKE_MAX_B64}): kurma Welcome ${welcomeB64}, kurma commit ${commitB64}, ekleme commit ${addCommitB64}, ekleme Welcome ${addWelcomeB64}, çıkarma commit ${removeCommitB64}`,
      )
      for (const size of [welcomeB64, commitB64, addCommitB64, addWelcomeB64, removeCommitB64]) {
        expect(size).toBeLessThan(HANDSHAKE_MAX_B64 / 2) // sınırın yarısında: büyümeye pay
      }
      expect(createMs).toBeLessThan(5000)
      expect(max(joinMs)).toBeLessThan(3000)
    }, 120_000)

    it('3 üye x 10 cihaz: tek commit 20 Welcome sınırı aşılmaz, kalan cihazlar sonraki commit ile eklenir', async () => {
      server.makeGroup(CH, ['U0', 'U1', 'U2'], EARLY)
      const devs = await devicesOf(3, 10)
      const flat = devs.flat()
      await send(flat[0], 'm1', 'ilk') // fake sunucu 20'den fazla Welcome/claim'i 400 ile reddeder
      expect(server.welcomes.length).toBeLessThanOrEqual(WELCOMES_PER_REQUEST)
      await as(flat[0], (e) => e.onGroupChanged(CH)) // kalan 10 cihaz eklenir
      const m2 = await send(flat[0], 'm2', 'otuz yaprak')
      for (const p of flat.slice(1)) {
        await as(p, (e) => e.onWelcome())
        await as(p, (e) => e.onGroupChanged(CH)) // sonradan eklenenler, aradaki commit'i de işler
        expect((await show(p, [m2]))[0].content).toBe('otuz yaprak')
      }
      expect(server.welcomes).toHaveLength(29)
    }, 180_000)

    it.runIf(process.env.E2EE_SCALE_FULL === '1')('10 kullanıcı x 10 cihaz (100 yaprak) boyut ölçümü', async () => {
      server.makeGroup(CH, Array.from({ length: 10 }, (_, i) => `U${i}`), EARLY)
      const flat = (await devicesOf(10, 10)).flat()
      await send(flat[0], 'm1', 'yüz yaprak')
      for (let i = 0; i < 6; i++) await as(flat[0], (e) => e.onGroupChanged(CH)) // 20'şerli ekleme turları
      const welcomeB64 = max(server.welcomes.map((w) => w.welcome.length))
      const commitB64 = max(server.handshakes.map((h) => h.commit.length))
      console.info(`[ölçüm ${label}] 100 yaprak: en büyük Welcome ${welcomeB64}, en büyük commit ${commitB64} (sınır ${HANDSHAKE_MAX_B64})`)
    }, 600_000)
  })
}
