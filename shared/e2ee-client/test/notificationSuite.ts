// E3 §9.1: bildirim için ağsız tek mesaj çözme (decryptOffline). Sunucu/sağlayıcı kurulumu flowSuite beforeEach'inden gelir.
import { deserializeGroup, type TextPayload } from '@kankaverse/e2ee-core'
import { describe, expect, it, vi } from 'vitest'
import { toB64 } from '../src/b64'
import { E2eeEngine } from '../src/engine'
import { serialLock } from '../src/lock'
import { as, CH, login, provider, send, server, show, type Msg, type Profile } from './flowSuite'
import { MemoryVault } from './memoryVault'

/** B'nin grup durumuna yazım sayısı: her MLS çözmesi anahtar tükettiği için bir `saveGroup` demektir. */
function countGroupWrites(p: Profile) {
  const spy = vi.spyOn(p.vault, 'put')
  return () => spy.mock.calls.filter(([store, key]) => store === 'groups' && key === CH).length
}

type Lock = ReturnType<typeof serialLock>

/** Profilin deposunu AĞ PORTSUZ açar (bildirim görevinin motoru). `log` çıktısı `logs`a düşer. */
async function local(p: Profile, logs: string[] = [], withLock: Lock = serialLock()) {
  const engine = await E2eeEngine.openLocal(p.userId, {
    openVault: async () => p.vault,
    withLock,
    provider,
    log: (message, error) => logs.push(`${message} ${String(error ?? '')}`),
  })
  return engine!
}

async function pair() {
  const A1 = await login('A')
  const B1 = await login('B')
  return { A1, B1 }
}

export function notificationSuite(label: string) {
  describe(`[${label}] ağsız bildirim çözmesi (E3 §9)`, () => {
    it('ağ portu olmadan çözer; sohbet açılışında depodan gelir, grup çözmesi ikinci kez yapılmaz', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'bildirimde görünen')
      await as(B1, (e) => e.onWelcome())
      const writes = countGroupWrites(B1)
      const logs: string[] = []
      const offline = await local(B1, logs) // port verilmiyor: sunucuya erişemez

      expect(await offline.decryptOffline(m1)).toEqual({ kind: 'text', body: 'bildirimde görünen' })
      expect(writes()).toBe(1)
      expect(logs).toEqual([]) // ağ denenseydi OfflineApiError loglanır, sonuç unavailable olurdu
      expect(await offline.decryptOffline(m1)).toEqual({ kind: 'text', body: 'bildirimde görünen' }) // depodan
      expect(writes()).toBe(1)

      const shown = await show(B1, [m1])
      expect(shown[0]).toMatchObject({ content: 'bildirimde görünen', e2eeStatus: 'ok' })
      expect(writes()).toBe(1) // ikinci çözme yok (olsaydı anahtar tükenmiş olduğundan "failed" görünürdü)
    })

    it('ağlı ve ağsız motor aynı kuyrukta eşzamanlı başlar: tek çözme', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'eşzamanlı')
      await as(B1, (e) => e.onWelcome())
      const writes = countGroupWrites(B1)
      const lock = serialLock()
      const online = (await E2eeEngine.start('B', {
        api: server.apiFor('B', B1.family),
        openVault: async () => B1.vault,
        withLock: lock,
        provider,
        onWarn: () => {},
      }))!
      const offline = await local(B1, [], lock)

      const [preview, shown] = await Promise.all([offline.decryptOffline(m1), online.hydrate(CH, [m1])])
      expect(preview).toEqual({ kind: 'text', body: 'eşzamanlı' })
      expect(shown[0].content).toBe('eşzamanlı')
      expect(writes()).toBe(1)
    })

    it('sırasız varış: 2. mesaj ağsız önce, 1. mesaj sonra sohbette çözülür', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'bir')
      const m2 = await send(A1, 'm2', 'iki')
      await as(B1, (e) => e.onWelcome())

      expect(await (await local(B1)).decryptOffline(m2)).toEqual({ kind: 'text', body: 'iki' })
      expect((await show(B1, [m1, m2])).map((m) => m.content)).toEqual(['bir', 'iki'])
    })

    it('iptal edilmiş cihazın iptal sonrası mesajı (önbellek görünümüyle): hidden', async () => {
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
      await as(B1, (e) => e.onGroupChanged(CH)) // çevrimiçi yol görünümü tazeler: iptal önbelleğe girer

      expect(await (await local(B1)).decryptOffline(late)).toEqual({ kind: 'hidden' })
    })

    it('eksik commit gereken mesaj: unavailable, depoya kayıt yok, içerik loglanmaz; sonra çevrimiçi yol çözer', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'önce')
      await as(B1, (e) => e.onWelcome())
      await show(B1, [m1])
      const A2 = await login('A')
      await as(A1, (e) => e.onGroupChanged(CH)) // A2 eklendi (yeni epoch); B bu commit'i henüz işlemedi
      await as(A2, (e) => e.onWelcome())
      const m2 = await send(A2, 'm2', 'gizli metin')
      const logs: string[] = []

      expect(await (await local(B1, logs)).decryptOffline(m2)).toEqual({ kind: 'unavailable' })
      expect(await B1.vault.get('messages', 'm2')).toBeNull() // kalıcı failed/undecryptable YAZILMADI
      expect(logs.join()).not.toContain('gizli metin')
      expect((await show(B1, [m2]))[0]).toMatchObject({ content: 'gizli metin', e2eeStatus: 'ok' })
    })

    it('önbellek görünümü yok: unavailable, kayıt yazılmaz, grup durumuna dokunulmaz', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'görünümsüz')
      await as(B1, (e) => e.onWelcome())
      await B1.vault.delete('groups', `${CH}:view`)
      const writes = countGroupWrites(B1)

      expect(await (await local(B1)).decryptOffline(m1)).toEqual({ kind: 'unavailable' })
      expect(await B1.vault.get('messages', 'm1')).toBeNull()
      expect(writes()).toBe(0)
      expect((await show(B1, [m1]))[0].content).toBe('görünümsüz') // çevrimiçi yol çözer
    })

    it('yerel grup yok: unavailable; cihaz yoksa openLocal null', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'grupsuz') // B Welcome işlemedi: yerel grup yok
      expect(await (await local(B1)).decryptOffline(m1)).toEqual({ kind: 'unavailable' })
      expect(await B1.vault.get('messages', 'm1')).toBeNull()

      const none = await E2eeEngine.openLocal('Z', {
        openVault: async () => new MemoryVault(),
        withLock: serialLock(),
        provider,
      })
      expect(none).toBeNull()
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

      expect(await (await local(B1)).decryptOffline(m2)).toEqual({ kind: 'unavailable' })
    })
  })
}
