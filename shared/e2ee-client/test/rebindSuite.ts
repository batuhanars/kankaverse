// C69: çıkışta park edilen cihazın yeniden bağlanması (ensureDevice). Sahte sunucu gerçek Ed25519 imzasını doğrular.
import { describe, expect, it } from 'vitest'
import { E2eeEngine } from '../src/engine'
import { LocalStore } from '../src/localStore'
import { as, CH, login, provider, restart, send, server } from './flowSuite'

const flagsOf = async (vault: Parameters<typeof restart>[2]) => new LocalStore(vault, provider).loadFlags()

export function rebindSuite(label: string) {
  describe(`[${label}] C69 park cihazı yeniden bağlama`, () => {
    it('rebind başarılı: aynı deviceId, historyFresh yok, mesajlar yerinde', async () => {
      const A1 = await login('A')
      const B1 = await login('B')
      const m1 = await send(A1, 'm1', 'çıkıştan önce')
      await as(B1, (e) => e.onWelcome())
      const id = A1.deviceId()
      await new LocalStore(A1.vault, provider).patchFlags({ historyFresh: false })

      server.park(id) // çıkış: cihaz iptal edilmez, oturum zincirinden ayrılır
      const again = (await restart('A', 'yeniOturum', A1.vault))!

      expect(again).toBeInstanceOf(E2eeEngine)
      expect(server.rebindCalls).toEqual({ challenge: 1, rebind: 1 })
      expect(server.devices.get(id)!.family).toBe('yeniOturum')
      expect(server.devices.size).toBe(2) // yeni cihaz doğmadı (A + B)
      expect((await flagsOf(A1.vault)).historyFresh).toBe(false)
      expect((await again.hydrate(CH, [m1]))[0].content).toBe('çıkıştan önce')
    })

    it('aynı oturumla yeniden açılışta rebind çağrılmaz', async () => {
      const A1 = await login('A')
      await restart('A', A1.family, A1.vault)
      expect(server.rebindCalls).toEqual({ challenge: 0, rebind: 0 })
    })

    it('çıkıştayken gelen mesaj geri dönüşte çözülür', async () => {
      const A1 = await login('A')
      const B1 = await login('B')
      const m0 = await send(A1, 'm0', 'ilk')
      await as(B1, (e) => e.onWelcome())
      server.park(A1.deviceId())
      const m1 = await send(B1, 'm1', 'sen yokken')
      const again = (await restart('A', 'yeniOturum', A1.vault))!
      const out = await again.hydrate(CH, [m0, m1])
      expect(out.map((m) => m.content)).toEqual(['ilk', 'sen yokken'])
    })

    it('rebind reddedilir (iptal): yerel silinir, yeni cihaz kurulur, historyFresh var', async () => {
      const A1 = await login('A')
      const old = A1.deviceId()
      server.park(old)
      server.devices.get(old)!.revokedAt = new Date() // Oturumlarım'dan kaldırıldı
      await new LocalStore(A1.vault, provider).saveMessage({
        id: 'eski', channelId: CH, status: 'ok', body: 'gizli', digest: 'd',
      })

      const again = (await restart('A', 'yeniOturum', A1.vault))!

      expect(again).toBeInstanceOf(E2eeEngine)
      expect(server.rebindCalls.rebind).toBe(1)
      const fresh = server.deviceOfFamily('yeniOturum')!
      expect(fresh.id).not.toBe(old)
      expect((await flagsOf(A1.vault)).historyFresh).toBe(true)
      expect(await A1.vault.keys('messages')).toEqual([])
    })

    it('yanlış imza reddedilir: eski depo silinir, yeni cihaz', async () => {
      const A1 = await login('A')
      const store = new LocalStore(A1.vault, provider)
      await store.patchFlags({ backupDirty: true })
      const old = A1.deviceId()
      server.park(old)
      // yanlış imza: yerel cihazın anahtarı sunucudakiyle uyuşmuyor
      server.devices.get(old)!.key = Buffer.alloc(32, 1).toString('base64')
      await restart('A', 'yeniOturum', A1.vault)
      expect(server.deviceOfFamily('yeniOturum')!.id).not.toBe(old)
      expect((await flagsOf(A1.vault)).backupDirty).toBeUndefined()
    })

    it('ağ hatasında yerel silinmez, hata yukarı çıkar; sonraki açılışta tekrar denenir', async () => {
      const A1 = await login('A')
      const id = A1.deviceId()
      server.park(id)
      server.rebindNetworkError = Object.assign(new Error('network'), { response: undefined })
      await expect(restart('A', 'yeniOturum', A1.vault)).rejects.toThrow('network')
      expect(await new LocalStore(A1.vault, provider).loadDevice()).not.toBeNull()
      expect(server.devices.get(id)!.parked).toBe(true) // sunucuda park kaydı duruyor

      server.rebindNetworkError = null
      await restart('A', 'yeniOturum', A1.vault)
      expect(server.devices.get(id)!.family).toBe('yeniOturum')
    })

    it('ilk nonce düşer (yarış), ikinci deneme başarılı: bağlanır, silinmez', async () => {
      const A1 = await login('A')
      const id = A1.deviceId()
      await new LocalStore(A1.vault, provider).patchFlags({ historyFresh: false })
      server.park(id)
      server.rebindNonceLost = 1
      await restart('A', 'yeniOturum', A1.vault)
      expect(server.rebindCalls.rebind).toBe(2)
      expect(server.devices.get(id)!.family).toBe('yeniOturum')
      expect((await flagsOf(A1.vault)).historyFresh).toBe(false)
    })

    it('nonce iki kez düşerse yerel SİLİNMEZ, hata yukarı çıkar', async () => {
      const A1 = await login('A')
      const id = A1.deviceId()
      server.park(id)
      server.rebindNonceLost = 2
      await expect(restart('A', 'yeniOturum', A1.vault)).rejects.toMatchObject({
        response: { data: { error: 'E2EE_REBIND_NONCE_INVALID' } },
      })
      expect(await new LocalStore(A1.vault, provider).loadDevice()).not.toBeNull()
      expect(server.devices.get(id)!.parked).toBe(true)
    })

    it('yerelde cihaz yoksa doğrudan yeni cihaz: rebind çağrılmaz', async () => {
      await login('A')
      expect(server.rebindCalls).toEqual({ challenge: 0, rebind: 0 })
    })

    it('başka kullanıcı: B hesabı A\'nın park cihazını bağlayamaz', async () => {
      const A1 = await login('A')
      const id = A1.deviceId()
      server.park(id)
      const api = server.apiFor('B', 'bOturum')
      const { data } = await api.rebindChallenge()
      await expect(async () => api.rebind(id, Buffer.alloc(64).toString('base64'))).rejects.toMatchObject({
        response: { data: { error: 'E2EE_REBIND_REJECTED' } },
      })
      expect(data.nonce).toBeTruthy()
    })
  })
}
