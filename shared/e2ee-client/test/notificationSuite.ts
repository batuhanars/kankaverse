// E3 §9.1: bildirim için ağsız tek mesaj çözme (decryptOffline). Sunucu/sağlayıcı kurulumu flowSuite beforeEach'inden gelir.
import { deserializeGroup, type TextPayload } from '@kankaverse/e2ee-core'
import { describe, expect, it, vi } from 'vitest'
import { toB64 } from '../src/b64'
import { E2eeEngine } from '../src/engine'
import { serialLock } from '../src/lock'
import { backupDeps } from './fakeBackup'
import { as, CH, login, provider, send, server, show, type Msg, type Profile } from './flowSuite'
import { LocalStore } from '../src/localStore'
import { MemoryVault } from './memoryVault'

/** B'nin grup durumuna yazım sayısı: her MLS çözmesi anahtar tükettiği için bir `saveGroup` demektir. */
function countGroupWrites(p: Profile) {
  const spy = vi.spyOn(p.vault, 'put')
  return () => spy.mock.calls.filter(([store, key]) => store === 'groups' && key === CH).length
}

type Lock = ReturnType<typeof serialLock>

/** Profilin deposunu AĞ PORTSUZ açar (bildirim görevinin motoru). `log` çıktısı `logs`a düşer. */
async function local(
  p: Profile,
  logs: string[] = [],
  withLock: Lock = serialLock(),
  yieldToUi?: () => Promise<void>,
) {
  const engine = await E2eeEngine.openLocal(p.userId, {
    openVault: async () => p.vault,
    withLock,
    provider,
    log: (message, error) => logs.push(`${message} ${String(error ?? '')}`),
    yieldToUi,
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
        ...backupDeps(server),
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

    it('çevrimdışı çözmede yieldToUi HİÇ çağrılmaz (Rev.3 k.1: arka planda JS zamanlayıcısı durur); çevrimiçi yol çağırır', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'molasız')
      const m2 = await send(A1, 'm2', 'molasız iki')
      await as(B1, (e) => e.onWelcome())
      const yielded = vi.fn(async () => {})
      const offline = await local(B1, [], serialLock(), yielded)

      expect(await offline.decryptOffline(m1)).toEqual({ kind: 'text', body: 'molasız' })
      expect(await offline.decryptOffline(m2)).toEqual({ kind: 'text', body: 'molasız iki' })
      expect(yielded).not.toHaveBeenCalled()
    })

    it('karşı örnek: casus bağlıyken çevrimiçi hydrate yieldToUi çağırır (yukarıdaki test yanlış yeşil olmasın)', async () => {
      const { A1, B1 } = await pair()
      const n1 = await send(A1, 'n1', 'mola var')
      await as(B1, (e) => e.onWelcome())
      const yielded = vi.fn(async () => {})
      const online = (await E2eeEngine.start('B', {
        ...backupDeps(server),
        api: server.apiFor('B', B1.family),
        openVault: async () => B1.vault,
        withLock: serialLock(),
        provider,
        onWarn: () => {},
        yieldToUi: yielded,
      }))!
      await online.hydrate(CH, [n1])
      expect(yielded).toHaveBeenCalled()
    })

    it('encryptOffline: ağsız şifreler, karşı taraf çözer, rememberSent sonrası kendi mesajım depodan okunur', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'selam')
      await as(B1, (e) => e.onWelcome())
      const logs: string[] = []
      const offline = await local(B1, logs) // ağ portu yok: groupForSend/channelState çağrılsaydı OfflineApiError

      const cipher = await offline.encryptOffline(CH, 'hızlı cevap')
      expect(cipher).not.toBeNull()
      expect(logs).toEqual([])
      const reply: Msg = { ...m1, id: 'r1', ciphertext: cipher!.ciphertext, senderDeviceId: B1.deviceId() }
      await offline.rememberSent(reply)
      expect(await B1.vault.get('messages', 'r1')).not.toBeNull()

      expect((await show(A1, [m1, reply])).map((m) => m.content)).toEqual(['selam', 'hızlı cevap'])
      expect((await show(B1, [m1, reply])).map((m) => m.content)).toEqual(['selam', 'hızlı cevap']) // yerelden
    })

    it('encryptOffline: yerel grup yok → null (şifresiz sohbet), depo değişmez', async () => {
      const { B1 } = await pair()
      const offline = await local(B1)
      expect(await offline.encryptOffline(CH, 'düz')).toBeNull()
    })

    it('bilinmeyen yük sürümü: unavailable', async () => {
      const { A1, B1 } = await pair()
      const first = await send(A1, 'm1', 'önce') // grup kurulsun
      await as(B1, (e) => e.onWelcome())
      await show(B1, [first])
      // v:3 yükü (v1/v2 bilinir, E4): motor v3 üretmez, bu yüzden göndericinin grubunu doğrudan açıp şifreliyoruz.
      const group = deserializeGroup((await A1.vault.get('groups', CH))!, provider)
      const v3 = { v: 3, t: 'text', body: 'x', sentAt: 1 } as unknown as TextPayload
      const sealed = await group.encrypt(v3)
      await A1.vault.put('groups', CH, group.serialize())
      const m2: Msg = { ...first, id: 'm2', ciphertext: toB64(sealed.ciphertext) }

      expect(await (await local(B1)).decryptOffline(m2)).toEqual({ kind: 'unavailable' })
    })
  })

  describe(`[${label}] push commit'li ağsız önizleme (C66)`, () => {
    /** Deponun tüm içeriği: bayt bayt karşılaştırma için. */
    async function dump(p: Profile) {
      const out: Record<string, string> = {}
      for (const store of ['device', 'groups', 'messages'] as const) {
        for (const k of (await p.vault.keys(store)).sort()) out[`${store}/${k}`] = toB64((await p.vault.get(store, k))!)
      }
      return out
    }
    const pushCommits = () =>
      server.handshakes.filter((h) => h.channelId === CH && h.epoch >= 1).map((h) => ({ epoch: h.epoch, commit: h.commit }))

    /** B bir commit geride: A2 eklendi (commit sunucuda), A2'nin mesajı yeni epoch'ta. */
    async function behind(freshView = true) {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'önce')
      await as(B1, (e) => e.onWelcome())
      await show(B1, [m1])
      const A2 = await login('A')
      await as(A1, (e) => e.onGroupChanged(CH))
      await as(A2, (e) => e.onWelcome())
      const m2 = await send(A2, 'm2', 'yeni epoch metni')
      // Önizleme yeni cihazı önbellek görünümüyle doğrular (ağsız: tazeleme yok); B kanalı yeni üyeden sonra açmış gibi.
      if (freshView) {
        const state = (await server.apiFor('B', B1.family).channelState(CH)).data
        await new LocalStore(B1.vault, provider).saveView(CH, state)
      }
      return { B1, m2, A2 }
    }

    it('commit ile metin çözülür; depo bayt bayt aynı; ağ yok; sonra çevrimiçi yol aynı mesajı çözer', async () => {
      const { B1, m2 } = await behind()
      const before = await dump(B1)
      const logs: string[] = []
      const offline = await local(B1, logs) // ağ portu yok: çağrılırsa OfflineApiError loglanır

      expect(await offline.previewWithCommits(m2, pushCommits())).toEqual({ kind: 'text', body: 'yeni epoch metni' })
      expect(logs).toEqual([])
      expect(await dump(B1)).toEqual(before)
      expect(B1.warnings).toEqual([])
      expect((await show(B1, [m2]))[0]).toMatchObject({ content: 'yeni epoch metni', e2eeStatus: 'ok' })
    })

    it("bayat önbellek (yeni cihaz kayıtlı değil): ekleme commit'iyle metin yine doğru, depo aynı", async () => {
      const { B1, m2 } = await behind(false)
      const before = await dump(B1)
      expect(await (await local(B1)).previewWithCommits(m2, pushCommits())).toEqual({ kind: 'text', body: 'yeni epoch metni' })
      expect(await dump(B1)).toEqual(before)
    })

    it('önbellekteki kimlik farklı anahtarla gelirse: unavailable (kayıtlı kimlik bayt bayt doğrulanır)', async () => {
      const { B1, m2, A2 } = await behind(true)
      const store = new LocalStore(B1.vault, provider)
      const view = (await store.loadView(CH))!
      for (const mem of view.members) for (const d of mem.devices) if (d.deviceId === A2.deviceId()) d.signatureKey = toB64(new Uint8Array(32).fill(7))
      await store.saveView(CH, view)
      const before = await dump(B1)
      expect(await (await local(B1)).previewWithCommits(m2, pushCommits())).toEqual({ kind: 'unavailable' })
      expect(await dump(B1)).toEqual(before)
    })

    it('aynı commit kalıcı çevrimiçi yolda tanınmayan cihaz kuralıyla değerlendirilir (davranış değişmedi)', async () => {
      const { B1, A2 } = await behind(false)
      server.hidden.set('B', new Set([A2.deviceId()])) // B'nin gördüğü kayıt listesinde A2 yok
      await as(B1, (e) => e.onGroupChanged(CH)).catch(() => {})
      expect(B1.warnings).toContainEqual([CH, 'unknown-device'])
    })

    it('commit yoksa bugünkü davranış: unavailable, depo aynı', async () => {
      const { B1, m2 } = await behind()
      const before = await dump(B1)
      const offline = await local(B1)
      expect(await offline.previewWithCommits(m2, [])).toEqual({ kind: 'unavailable' })
      expect(await dump(B1)).toEqual(before)
    })

    it('yerel epoch yetiyorsa commit uygulanmaz (decryptOffline yolu aynen)', async () => {
      const { A1, B1 } = await pair()
      const m1 = await send(A1, 'm1', 'normal')
      await as(B1, (e) => e.onWelcome())
      const offline = await local(B1)
      expect(await offline.previewWithCommits(m1, [{ epoch: 99, commit: 'AAAA' }])).toEqual({ kind: 'text', body: 'normal' })
    })

    it('yanlış epoch, boşluk ya da bozuk commit: unavailable, depo aynı', async () => {
      const { B1, m2 } = await behind()
      const before = await dump(B1)
      const offline = await local(B1)
      const good = pushCommits()
      const bad = [
        [{ ...good[good.length - 1], epoch: good[good.length - 1].epoch + 1 }], // yerel epoch'tan ileri (boşluk)
        [{ ...good[good.length - 1], epoch: 0 }], // yanlış epoch
        [good[good.length - 1], { epoch: good[good.length - 1].epoch + 2, commit: good[0].commit }], // arada boşluk
        [{ epoch: good[good.length - 1].epoch, commit: 'bozuk!' }],
      ]
      for (const c of bad) expect(await offline.previewWithCommits(m2, c)).toEqual({ kind: 'unavailable' })
      expect(await dump(B1)).toEqual(before)
    })
  })
}
