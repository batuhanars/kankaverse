// E2EE istemci akışı: gerçek çekirdek (MLS) + gerçek şifreli depo (fake-indexeddb) + sahte sunucu.
// Her "profil" kendi IndexedDB'sine sahip ayrı bir tarayıcı gibidir (aynı kullanıcının ikinci cihazı dahil).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { E2eeEngine } from '../engine'
import type { WarningKind } from '../context'
import { FakeServer } from './fakeServer'

const CH = 'ch1'
const T0 = '2026-11-10T10:00:00.000Z'

interface Msg {
  id: string
  channelId: string
  content: string
  createdAt: string
  encrypted?: boolean
  ciphertext?: string
  senderDeviceId?: string | null
  e2eeStatus?: string
}

interface Profile {
  userId: string
  idb: IDBFactory
  family: string
  engine: E2eeEngine
  warnings: [string, WarningKind][]
  deviceId: () => string
}

let server: FakeServer
let n = 0

/** Profilin tarayıcısı etkin: bu profilin IndexedDB'si global yapılır (testler sırayla, eşzamanlı değil). */
async function as<T>(p: Profile, fn: (e: E2eeEngine) => Promise<T>): Promise<T> {
  globalThis.indexedDB = p.idb
  return fn(p.engine)
}

async function login(userId: string): Promise<Profile> {
  const idb = new IDBFactory()
  globalThis.indexedDB = idb
  const family = `fam${++n}`
  const warnings: [string, WarningKind][] = []
  const api = server.apiFor(userId, family)
  const engine = (await E2eeEngine.start(userId, api, (c, k) => warnings.push([c, k])))!
  return {
    userId,
    idb,
    family,
    engine,
    warnings,
    deviceId: () => server.deviceOfFamily(family)!.id,
  }
}

/** Sunucunun döneceği mesaj DTO'su (şifreli: content '', ciphertext, senderDeviceId). */
function dto(id: string, from: Profile, ciphertext: string, createdAt = T0): Msg {
  return {
    id,
    channelId: CH,
    content: '',
    createdAt,
    encrypted: true,
    ciphertext,
    senderDeviceId: from.deviceId(),
  }
}

async function send(p: Profile, id: string, text: string, createdAt = T0): Promise<Msg> {
  const cipher = await as(p, (e) => e.encrypt(CH, text))
  const msg = dto(id, p, cipher!.ciphertext, createdAt)
  await as(p, (e) => e.rememberSent(msg))
  return msg
}

const show = async (p: Profile, msgs: Msg[]) => as(p, (e) => e.hydrate(CH, msgs))

beforeEach(() => {
  server = new FakeServer()
  server.members.set(CH, ['A', 'B'])
})

describe('1-1 akış: grup kurma, karşılıklı mesaj', () => {
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

    globalThis.indexedDB = B1.idb
    const again = (await E2eeEngine.start('B', server.apiFor('B', B1.family), () => {}))!
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

describe('cihaz kaydı ve KeyPackage stoku', () => {
  it('girişte 20 KeyPackage + son çare yüklenir; 10 altına inince tamamlanır', async () => {
    const A1 = await login('A')
    const dev = server.devices.get(A1.deviceId())!
    expect(dev.kps).toHaveLength(20)
    expect(dev.lastResort).toBeTruthy()

    dev.kps.splice(0, 12) // başkaları 12 paket tüketti (8 kaldı)
    const lastResort = dev.lastResort
    globalThis.indexedDB = A1.idb
    await E2eeEngine.start('A', server.apiFor('A', A1.family), () => {})
    expect(dev.kps).toHaveLength(20)
    expect(dev.lastResort).toBe(lastResort) // son çare tekrar üretilmez
  })

  it('aynı oturumla yeniden başlatma aynı cihazı kullanır (yeni cihaz açılmaz)', async () => {
    const A1 = await login('A')
    const id = A1.deviceId()
    globalThis.indexedDB = A1.idb
    await E2eeEngine.start('A', server.apiFor('A', A1.family), () => {})
    expect(server.devices.size).toBe(1)
    expect(A1.deviceId()).toBe(id)
  })

  it('yerel cihaz kimliği sunucununkiyle uyuşmazsa uyarı + hata (sessiz devam yok)', async () => {
    const A1 = await login('A')
    // Sunucu aynı oturum zinciri için başka kimlik bildiriyor (yerel durum bu oturuma ait değil).
    server.devices.get(A1.deviceId())!.id = 'baska'
    server.devices.set('baska', server.devices.get(A1.deviceId())!)
    const warnings: [string, WarningKind][] = []
    globalThis.indexedDB = A1.idb
    await expect(
      E2eeEngine.start('A', server.apiFor('A', A1.family), (c, k) => warnings.push([c, k])),
    ).rejects.toThrow()
    expect(warnings).toContainEqual(['', 'device-broken'])
  })
})

describe('cihaz ekleme ve iptal', () => {
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
    expect(onA2[0]).toMatchObject({ content: '', e2eeStatus: 'undecryptable' })
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
    expect((await show(A2, [m4]))[0]).toMatchObject({ content: '', e2eeStatus: 'undecryptable' })
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
