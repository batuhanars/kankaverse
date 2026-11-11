// E2EE istemci akışı: gerçek çekirdek (MLS) + sahte sunucu + bellek içi depo. Her "profil" ayrı bir cihaz gibidir
// (aynı kullanıcının ikinci cihazı dahil). Aynı senaryolar iki sağlayıcıyla koşar (web: WebCrypto, pure: noble).
import { beforeEach, describe, expect, it } from 'vitest'
import type { CryptoProvider } from '@kankaverse/e2ee-core'
import { E2eeEngine } from '../src/engine'
import { serialLock } from '../src/lock'
import type { WarningKind } from '../src/ports'
import { FakeServer } from './fakeServer'
import { MemoryVault } from './memoryVault'

export const CH = 'ch1'
export const T0 = '2026-11-10T10:00:00.000Z'

export interface Msg {
  id: string
  channelId: string
  content: string
  createdAt: string
  encrypted?: boolean
  ciphertext?: string
  senderDeviceId?: string | null
  frankingTag?: string | null
  e2eeStatus?: string
}

export interface Profile {
  userId: string
  vault: MemoryVault
  family: string
  engine: E2eeEngine
  warnings: [string, WarningKind][]
  deviceId: () => string
}

// Canlı bağlama olarak dışa açılır: bildirim testleri aynı sunucu ve sağlayıcıyı kullanır (beforeEach burada).
export let server: FakeServer
export let provider: CryptoProvider
let n = 0

type WarnFn = (channelId: string, kind: WarningKind) => void

export const as = <T>(p: Profile, fn: (e: E2eeEngine) => Promise<T>): Promise<T> => fn(p.engine)

/** Aynı cihazı (aynı depo, aynı oturum zinciri) yeniden başlatır: uygulamayı kapatıp açmak. */
export const restart = (userId: string, family: string, vault: MemoryVault, warn: WarnFn = () => {}) =>
  E2eeEngine.start(userId, {
    api: server.apiFor(userId, family),
    openVault: async () => vault,
    withLock: serialLock(),
    provider,
    onWarn: warn,
  })

export async function login(userId: string): Promise<Profile> {
  const vault = new MemoryVault()
  const family = `fam${++n}`
  const warnings: [string, WarningKind][] = []
  const engine = (await restart(userId, family, vault, (c, k) => warnings.push([c, k])))!
  return {
    userId,
    vault,
    family,
    engine,
    warnings,
    deviceId: () => server.deviceOfFamily(family)!.id,
  }
}

/** Sunucunun döneceği mesaj DTO'su (şifreli: content '', ciphertext, senderDeviceId). */
function dto(id: string, from: Profile, ciphertext: string, createdAt = T0, frankingTag?: string): Msg {
  return {
    ...(frankingTag !== undefined && { frankingTag }),
    id,
    channelId: CH,
    content: '',
    createdAt,
    encrypted: true,
    ciphertext,
    senderDeviceId: from.deviceId(),
  }
}

export async function send(p: Profile, id: string, text: string, createdAt = T0): Promise<Msg> {
  const cipher = await as(p, (e) => e.encrypt(CH, text))
  const msg = dto(id, p, cipher!.ciphertext, createdAt, cipher!.frankingTag)
  await as(p, (e) => e.rememberSent(msg))
  return msg
}

export const show = async (p: Profile, msgs: Msg[]) => as(p, (e) => e.hydrate(CH, msgs))

export function flowSuite(label: string, p: CryptoProvider) {
  beforeEach(() => {
    provider = p
    server = new FakeServer()
    server.members.set(CH, ['A', 'B'])
  })

  describe(`[${label}] 1-1 akış: grup kurma, karşılıklı mesaj`, () => {
    it('A grup kurar, B Welcome ile katılıp çözer, B cevaplar, A çözer; kendi mesajı yerelden gelir', async () => {
      const A1 = await login('A')
      const B1 = await login('B')
      const m1 = await send(A1, 'm1', 'merhaba Türkçe çğıöşü 🔒')

      expect(await as(B1, (e) => e.onWelcome())).toEqual([CH])
      expect((await show(B1, [m1]))[0].content).toBe('merhaba Türkçe çğıöşü 🔒')

      const m2 = await send(B1, 'm2', 'selam A')
      const onA = await show(A1, [m1, m2])
      expect(onA.map((m) => m.content)).toEqual(['merhaba Türkçe çğıöşü 🔒', 'selam A'])
      expect(onA.every((m) => m.ciphertext === undefined)).toBe(true) // şifreli yük ekran durumunda yok
    })

    it('her mesaj bir kez çözülür: yeniden başlatınca geçmiş yerel depodan gelir (MLS tekrar çözmez)', async () => {
      const A1 = await login('A')
      const B1 = await login('B')
      const m1 = await send(A1, 'm1', 'bir kez')
      await as(B1, (e) => e.onWelcome())
      expect((await show(B1, [m1]))[0].content).toBe('bir kez')

      const again = (await restart('B', B1.family, B1.vault))!
      expect((await again.hydrate(CH, [m1]))[0].content).toBe('bir kez')
    })

    it('düzenleme: yeni ciphertext yeni metni verir (özet farklı, eski kayıt karışmaz)', async () => {
      const A1 = await login('A')
      const B1 = await login('B')
      const m1 = await send(A1, 'm1', 'ilk')
      await as(B1, (e) => e.onWelcome())
      expect((await show(B1, [m1]))[0].content).toBe('ilk')

      const edited = await send(A1, 'm1', 'düzenlendi')
      expect((await show(B1, [edited]))[0].content).toBe('düzenlendi')
      expect((await show(A1, [edited]))[0].content).toBe('düzenlendi')
    })

    it('karşı tarafın cihazı yoksa DM şifresiz kalır (encrypt null)', async () => {
      const A1 = await login('A')
      expect(await as(A1, (e) => e.encrypt(CH, 'düz'))).toBeNull() // B'nin cihazı yok
    })
  })

  describe(`[${label}] cihaz kaydı ve KeyPackage stoku`, () => {
    it('girişte 20 KeyPackage + son çare yüklenir; 10 altına inince tamamlanır', async () => {
      const A1 = await login('A')
      const dev = server.devices.get(A1.deviceId())!
      expect(dev.kps).toHaveLength(20)
      expect(dev.lastResort).toBeTruthy()

      dev.kps.splice(0, 12) // başkaları 12 paket tüketti (8 kaldı)
      const lastResort = dev.lastResort
      await restart('A', A1.family, A1.vault)
      expect(dev.kps).toHaveLength(20)
      expect(dev.lastResort).toBe(lastResort) // son çare tekrar üretilmez
    })

    it('aynı oturumla yeniden başlatma aynı cihazı kullanır (yeni cihaz açılmaz)', async () => {
      const A1 = await login('A')
      const id = A1.deviceId()
      await restart('A', A1.family, A1.vault)
      expect(server.devices.size).toBe(1)
      expect(A1.deviceId()).toBe(id)
    })

    it('yerel cihaz kimliği sunucununkiyle uyuşmazsa uyarı + hata (sessiz devam yok)', async () => {
      const A1 = await login('A')
      // Sunucu aynı oturum zinciri için başka kimlik bildiriyor (yerel durum bu oturuma ait değil).
      server.devices.get(A1.deviceId())!.id = 'baska'
      server.devices.set('baska', server.devices.get(A1.deviceId())!)
      const warnings: [string, WarningKind][] = []
      await expect(
        restart('A', A1.family, A1.vault, (c, k) => warnings.push([c, k])),
      ).rejects.toThrow()
      expect(warnings).toContainEqual(['', 'device-broken'])
    })
  })

  describe(`[${label}] cihaz ekleme ve iptal`, () => {
    async function trio() {
      const A1 = await login('A')
      const B1 = await login('B')
      const m1 = await send(A1, 'm1', 'eski mesaj')
      await as(B1, (e) => e.onWelcome())
      await show(B1, [m1])
      return { A1, B1, m1 }
    }

    async function addA2(A1: Profile, B1: Profile) {
      const A2 = await login('A')
      await as(A1, (e) => e.onGroupChanged(CH)) // e2ee:devices-changed
      await as(A2, (e) => e.onWelcome())
      await as(B1, (e) => e.onGroupChanged(CH)) // e2ee:commit
      return A2
    }

    it('yeni cihaz eklenir: eski mesaj "cihaz eklenmeden önce", yeni mesaj çözülür', async () => {
      const { A1, B1, m1 } = await trio()
      const A2 = await addA2(A1, B1)
      const m2 = await send(B1, 'm2', 'yeni mesaj')

      const onA2 = await show(A2, [m1, m2])
      expect(onA2[0]).toMatchObject({
        content: '',
        e2eeStatus: 'undecryptable',
      })
      expect(onA2[1].content).toBe('yeni mesaj')
      expect((await show(A1, [m2]))[0].content).toBe('yeni mesaj')
      // Çözülemeyen kalıcı yazıldı: ikinci kez denenmez, aynı sonuç.
      expect((await show(A2, [m1]))[0].e2eeStatus).toBe('undecryptable')
    })

    it('A2 mesaj gönderir, B ve A1 çözer', async () => {
      const { A1, B1 } = await trio()
      const A2 = await addA2(A1, B1)
      const m3 = await send(A2, 'm3', 'A2 den')
      expect((await show(B1, [m3]))[0].content).toBe('A2 den')
      expect((await show(A1, [m3]))[0].content).toBe('A2 den')
    })

    it('iptal edilen cihaz gruptan çıkarılır; kalanlar yazışmaya devam eder', async () => {
      const { A1, B1 } = await trio()
      const A2 = await addA2(A1, B1)
      const before = server.handshakes.length
      server.revoke(A2.deviceId(), new Date('2026-11-10T12:00:00Z')) // A2 çıkış yaptı
      await as(A1, (e) => e.onGroupChanged(CH))
      await as(B1, (e) => e.onGroupChanged(CH))
      expect(server.handshakes.length).toBe(before + 1) // yalnız bir çıkarma commit'i

      const m4 = await send(B1, 'm4', 'A2 artık yok')
      expect((await show(A1, [m4]))[0].content).toBe('A2 artık yok')
      // A2 yeni mesajı çözemez (oturumu iptal: sunucuya da erişemez)
      expect((await show(A2, [m4]))[0]).toMatchObject({
        content: '',
        e2eeStatus: 'undecryptable',
      })
    })

    it('iptal cihazın iptalden SONRAKİ mesajı gösterilmez, öncesi kalır', async () => {
      const { A1, B1 } = await trio()
      const A2 = await addA2(A1, B1)
      const early = await send(A2, 'e1', 'iptalden önce', '2026-11-10T11:00:00.000Z')
      const late = await send(A2, 'e2', 'iptalden sonra', '2026-11-10T13:00:00.000Z')
      server.revoke(A2.deviceId(), new Date('2026-11-10T12:00:00Z'))
      await as(A1, (e) => e.onGroupChanged(CH)) // A1 çıkarır; B henüz geride (çıkarma commit'i işlenmedi)

      const shown = await show(B1, [early, late])
      expect(shown.map((m) => m.id)).toEqual(['e1'])
      expect(shown[0].content).toBe('iptalden önce')
    })

    it('epoch çakışması (409): eksikleri işleyip yeniden dener, cihaz yine de eklenir', async () => {
      const { A1, B1 } = await trio()
      server.conflictOnce = true
      const A2 = await addA2(A1, B1)
      const m2 = await send(B1, 'm2', 'çakışma sonrası')
      expect((await show(A2, [m2]))[0].content).toBe('çakışma sonrası')
    })

    it('tanınmayan cihaz: sunucu listesinde olmayan yaprak commit reddedilir, uyarı çıkar, durum ilerlemez', async () => {
      const { A1, B1 } = await trio()
      const A2 = await login('A')
      server.hidden.set('B', new Set([A2.deviceId()])) // B'nin gördüğü kayıt listesinde A2 yok
      await as(A1, (e) => e.onGroupChanged(CH)) // A1 listeyi görüyor, A2'yi ekler
      await expect(as(B1, (e) => e.onGroupChanged(CH))).rejects.toThrow()
      expect(B1.warnings).toContainEqual([CH, 'unknown-device'])
    })
  })

  describe(`[${label}] geri alma sonrası bayat yerel grup (§6.4)`, () => {
    async function pair() {
      const A1 = await login('A')
      const B1 = await login('B')
      const m1 = await send(A1, 'm1', 'geri almadan önce')
      await as(B1, (e) => e.onWelcome())
      await show(B1, [m1])
      return { A1, B1, m1 }
    }

    it('eski grup yerelde, farklı groupId yeni Welcome: katılır, yeni mesaj çözülür, eski kayıt korunur', async () => {
      const { A1, B1, m1 } = await pair()
      const oldId = server.groups.get(CH)!.groupId
      server.rollback(CH)
      const m2 = await send(A1, 'm2', 'geri almadan sonra') // A bayat grubunu düşer, yeni grup kurar
      expect(server.groups.get(CH)!.groupId).not.toBe(oldId)

      expect(await as(B1, (e) => e.onWelcome())).toEqual([CH]) // bayat sayılıp katılındı
      const shown = await show(B1, [m1, m2])
      expect(shown.map((m) => m.content)).toEqual(['geri almadan önce', 'geri almadan sonra'])
      // B yeni grupla cevap verir, A çözer.
      const m3 = await send(B1, 'm3', 'cevap')
      expect((await show(A1, [m3]))[0].content).toBe('cevap')
    })

    it('kanal açılışı (open) bayat grubu düşer ve yeni Welcome ile katılır', async () => {
      const { A1, B1, m1 } = await pair()
      server.rollback(CH)
      const m2 = await send(A1, 'm2', 'yeni grup')
      expect((await as(B1, (e) => e.open(CH))).encrypted).toBe(true)
      expect((await show(B1, [m1, m2])).map((m) => m.content)).toEqual(['geri almadan önce', 'yeni grup'])
    })

    it('geri alma sonrası sunucu şifresiz (encrypted:false): bayat grup düşülür, mesaj kayıtları kalır', async () => {
      const { B1, m1 } = await pair()
      server.rollback(CH)
      expect((await as(B1, (e) => e.open(CH))).encrypted).toBe(false)
      expect(await B1.vault.get('groups', CH)).toBeNull()
      expect((await show(B1, [m1]))[0].content).toBe('geri almadan önce')
    })

    it('aynı groupId: bayat Welcome hâlâ atlanır, grup durumu bozulmaz', async () => {
      const { A1, B1, m1 } = await pair()
      for (const w of server.welcomes) w.done = false // aynı grubun Welcome yeniden teslim
      expect(await as(B1, (e) => e.onWelcome())).toEqual([]) // katılım yok, ack edildi
      expect(server.welcomes.every((w) => w.done)).toBe(true)
      const m2 = await send(A1, 'm2', 'hâlâ aynı grup')
      expect((await show(B1, [m1, m2])).map((m) => m.content)).toEqual([
        'geri almadan önce',
        'hâlâ aynı grup',
      ])
    })

    it('ağ/sunucu hatasında yerel grup SİLİNMEZ', async () => {
      const { B1 } = await pair()
      const real = server.apiFor('B', B1.family)
      const down = () => Promise.reject(new Error('ağ yok'))
      const broken = (await E2eeEngine.start('B', {
        api: new Proxy(real, { get: (t, k) => (k === 'channelState' ? down : t[k as keyof typeof t]) }),
        openVault: async () => B1.vault,
        withLock: serialLock(),
        provider,
        onWarn: () => {},
      }))!
      await expect(broken.open(CH)).rejects.toThrow('ağ yok')
      await expect(broken.onGroupChanged(CH)).rejects.toThrow('ağ yok')
      expect(await B1.vault.get('groups', CH)).not.toBeNull()
    })

    it('etiket: katılımdan önceki mesaj undecryptable, katılımdan sonra çözülemeyen failed', async () => {
      const { A1, B1, m1 } = await pair()
      const A2 = await login('A')
      await as(A1, (e) => e.onGroupChanged(CH))
      await as(A2, (e) => e.onWelcome())
      await as(B1, (e) => e.onGroupChanged(CH))
      const m2 = await send(B1, 'm2', 'ikinci')
      expect((await show(A2, [m1]))[0].e2eeStatus).toBe('undecryptable') // cihaz eklenmeden önce
      expect((await show(A2, [m2]))[0].content).toBe('ikinci')
      // Aynı şifreli yük ikinci kez: anahtar tüketildi, katılımdan SONRA gönderildi -> failed.
      const replay = { ...m2, id: 'm2b', createdAt: '2099-01-01T00:00:00.000Z' }
      expect((await show(A2, [replay]))[0]).toMatchObject({ content: '', e2eeStatus: 'failed' })
    })
  })
}
