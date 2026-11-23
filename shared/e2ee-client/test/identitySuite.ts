// E7 §9: kimlik geçişi, imza yolları (yedek, aktarım, "Bu cihazı doğrula"), cihaz satırı kuralı, sabitleme (TOFU),
// sıfırlama ve güvenlik kodu. Saldırı simülasyonu: sahte kimlik, kimliği geri alma (sürüm düşürme), imzasız cihaz.
// Gerçek çekirdek (MLS + Ed25519) + sahte sunucu (imzayı Node kriptoyla doğrular). Sunucu flowSuite'ten gelir.
import { describe, expect, it } from 'vitest'
import { REAUTH_PASSWORD } from './fakeBackup'
import { as, CH, login, restart, send, server, type Profile } from './flowSuite'

const PW = 'yedek-sifresi-uzun-1'
const ID = { username: 'kullanici', email: 'k@ornek.com' }

const sync = async (...ps: Profile[]) => {
  for (const p of ps) await as(p, (e) => e.onGroupChanged(CH))
}
const notices = (p: Profile) => as(p, (e) => e.deviceNotices(CH))
const idm = (p: Profile) => p.engine.identity!

/** Kimlik bayrağı açık oturum; açılıştaki eşitlemeyi bekler. */
async function enter(userId: string): Promise<Profile> {
  const p = await login(userId)
  await p.engine.identitySynced
  return p
}

const signed = (p: Profile) => server.identity.sigs.has(p.deviceId())

/** A1 ↔ B1 şifreli 1-1 DM kurulu. */
async function pair() {
  const A1 = await enter('A')
  const B1 = await enter('B')
  await send(A1, 'm1', 'ilk')
  await as(B1, (e) => e.onWelcome())
  await sync(A1, B1)
  return { A1, B1 }
}

/** O'dan N'ye aktarım (geçmiş ya da yalnız kimlik). */
async function transfer(O: Profile, N: Profile, identityOnly: boolean) {
  const { id } = await N.engine.transfer!.start()
  await O.engine.transfer!.accept(id)
  await N.engine.transfer!.reveal(id)
  await O.engine.transfer!.code(id)
  await O.engine.transfer!.send(id, { identityOnly })
  return N.engine.transfer!.receive(id, [CH])
}

export function identitySuite(label: string) {
  describe(`[${label}] E7 kimlik ve güvenlik kodu`, () => {
    const on = () => {
      server.identity.enabled = true
      server.transfer.enabled = true
    }

    it('geçiş: ilk açılış kimliği kurar ve o anki cihazları imzalar; ikinci cihaz yarışı kaybeder ama imzalıdır', async () => {
      const A1 = await login('A') // bayrak kapalı: kimlik yok
      const A2 = await login('A')
      on()
      // Bayrak açılışta okunur: güncelleme sonrası uygulama yeniden açılır. İki cihaz aynı anda açılır.
      const [e1, e2] = await Promise.all([
        restart('A', A1.family, A1.vault),
        restart('A', A2.family, A2.vault),
      ])
      await Promise.all([e1!.identitySynced, e2!.identitySynced])
      expect(server.identity.identities.get('A')?.version).toBe(1)
      expect(signed(A1) && signed(A2)).toBe(true)
      // Yarışı kaybeden 409 alır, kimliği yeniden okur; ikinci kurulum yok, kimlik tek cihazda.
      expect(server.identity.calls.create).toBe(2)
      const holders = [await e1!.identity!.hasLocalIdentity(), await e2!.identity!.hasLocalIdentity()]
      expect(holders.filter(Boolean)).toHaveLength(1)
    })

    it('bayrak kapalıyken hiçbir şey kurulmaz, bugünkü "yeni cihaz" satırı sürer', async () => {
      const { A1 } = await pair()
      await login('B')
      await sync(A1)
      expect(server.identity.identities.size).toBe(0)
      expect(await notices(A1)).toMatchObject([{ userId: 'B', kind: 'new' }])
    })

    it('imzasız yeni cihaz: karşı tarafta "doğrulanmamış"; MLS akışı sürer (mesaj çözülür)', async () => {
      on()
      const { A1 } = await pair()
      const B2 = await enter('B') // yedek yok, aktarım yok: imzasız
      expect(signed(B2)).toBe(false)
      await sync(A1)
      await as(B2, (e) => e.onWelcome())
      expect(await notices(A1)).toMatchObject([{ userId: 'B', kind: 'unverified', count: 1 }])
      const m = await send(A1, 'm2', 'yine de gider')
      expect((await as(B2, (e) => e.hydrate(CH, [m])))[0].content).toBe('yine de gider')
    })

    it('"Bu cihazı doğrula" (yalnız kimlik aktarımı): sonra eklenen imzalı cihaz satır üretmez', async () => {
      on()
      const { A1, B1 } = await pair()
      const B2 = await enter('B')
      const res = await transfer(B1, B2, true)
      expect(res).toEqual({ received: 0, identityAdopted: true })
      expect(signed(B2)).toBe(true)
      await sync(A1)
      await as(B2, (e) => e.onWelcome())
      expect(await notices(A1)).toEqual([])
    })

    it('geçmiş aktarımı kimliği de taşır; eski cihaz kimlik taşımıyorsa yeni cihaz imzasız kalır', async () => {
      on()
      const { B1 } = await pair()
      const B2 = await enter('B')
      expect((await transfer(B1, B2, false)).identityAdopted).toBe(true)
      expect(await idm(B2).hasLocalIdentity()).toBe(true)
      // B3 kimlik taşımayan bir cihazdan (B2 taşıyor, ama B4 taşımaz) alırsa: B4 → B5
      const B4 = await enter('B')
      const B5 = await enter('B')
      expect((await transfer(B4, B5, false)).identityAdopted).toBe(false)
      expect(signed(B5)).toBe(false)
    })

    it('yedek yolu: kimlik yedeğe sarılır; yeni cihazda yedek şifresi girilince cihaz kendini imzalar', async () => {
      on()
      const { A1, B1 } = await pair()
      expect((await B1.engine.backup!.setupBackup(PW, ID)).ok).toBe(true)
      expect(server.backup.keys.get('B')?.identityVersion).toBe(1)
      const B2 = await enter('B')
      expect(signed(B2)).toBe(false)
      await B2.engine.backup!.unlockBackup(PW)
      expect(signed(B2)).toBe(true)
      await sync(A1)
      expect(await notices(A1)).toEqual([])
    })

    it('şifre değişimi sarılı kimliği korur; yedek sıfırlanınca kimliği taşıyan cihaz yeniden sarar', async () => {
      on()
      const { B1 } = await pair()
      await B1.engine.backup!.setupBackup(PW, ID)
      await B1.engine.backup!.changeBackupPassword(PW, 'baska-uzun-sifre-2', ID)
      expect(server.backup.keys.get('B')?.wrappedIdentity).toBeTruthy()
      await B1.engine.backup!.resetBackup('ucuncu-uzun-sifre-3', ID, { currentPassword: REAUTH_PASSWORD })
      const row = server.backup.keys.get('B')!
      expect(row.keyVersion).toBe(2)
      expect(row.wrappedIdentity).toBeTruthy()
      expect(row.identityVersion).toBe(1)
    })

    it('güvenlik kodu iki tarafta aynı (12 × 5 hane); işaret yalnız bu cihazda', async () => {
      on()
      const { A1, B1 } = await pair()
      const a = await idm(A1).safetyCode('B')
      const b = await idm(B1).safetyCode('A')
      expect(a?.groups).toHaveLength(12)
      expect(a?.groups).toEqual(b?.groups)
      expect(a?.verified).toBe(false)
      await idm(A1).setVerified('B', true)
      expect((await idm(A1).safetyCode('B'))?.verified).toBe(true)
      expect((await idm(B1).safetyCode('A'))?.verified).toBe(false)
    })

    it('kimlik sıfırlama: karşı tarafta bir kez "kod değişti", işaret düşer, kod değişir; eski cihazlar imzasız', async () => {
      on()
      const { A1, B1 } = await pair()
      const B2 = await enter('B')
      await transfer(B1, B2, true)
      await sync(A1) // B2 sıfırlamadan ÖNCE imzalı eklenir: satır yok
      expect(await notices(A1)).toEqual([])
      const before = await idm(A1).safetyCode('B')
      await idm(A1).setVerified('B', true)
      await idm(B1).reset({ currentPassword: REAUTH_PASSWORD })
      expect(server.identity.identities.get('B')?.version).toBe(2)
      expect(signed(B1)).toBe(true)
      expect(signed(B2)).toBe(false)
      await sync(A1)
      await sync(A1) // tekrar senkron satır çoğaltmaz
      expect(await notices(A1)).toMatchObject([{ userId: 'B', kind: 'identity' }])
      const after = await idm(A1).safetyCode('B')
      expect(after?.verified).toBe(false)
      expect(after?.groups).not.toEqual(before?.groups)
      // B2 eski kimliği taşıyordu: açılışta bayat kimliği düşürür.
      await idm(B2).sync()
      expect(await idm(B2).hasLocalIdentity()).toBe(false)
    })

    it('sıfırlama reauth ister', async () => {
      on()
      const { B1 } = await pair()
      await expect(idm(B1).reset({ currentPassword: 'yanlis' })).rejects.toBeTruthy()
      expect(server.identity.identities.get('B')?.version).toBe(1)
    })

    it('SALDIRI: sunucu sahte kimlik gösterir → "kod değişti" satırı ve işaret düşer (sessiz değişim yok)', async () => {
      on()
      const { A1 } = await pair()
      await idm(A1).setVerified('B', true)
      server.identity.forgedIdentity.set('B', { publicKey: Buffer.alloc(32, 7).toString('base64'), version: 1 })
      await sync(A1)
      expect(await notices(A1)).toMatchObject([{ userId: 'B', kind: 'identity' }])
      expect((await idm(A1).safetyCode('B'))?.verified).toBe(false)
    })

    it('SALDIRI: sunucu kimliği gizler (null) + imzasız cihaz → "yeni cihaz"a kaçamaz, "doğrulanmamış" kalır', async () => {
      on()
      const { A1 } = await pair()
      server.identity.forgedIdentity.set('B', null)
      await enter('B') // imzasız yeni cihaz
      await sync(A1)
      const list = await notices(A1)
      expect(list).toMatchObject([{ userId: 'B', kind: 'unverified' }])
      expect(list.some((n) => n.kind === 'identity')).toBe(false)
    })

    it('kimliği hiç olmayan kişi (eski sürüm): bugünkü "yeni cihaz" satırı; kod yok', async () => {
      on()
      server.identity.forgedIdentity.set('B', null) // B hiç kimlik kurmamış gibi
      const { A1 } = await pair()
      await enter('B')
      await sync(A1)
      expect(await notices(A1)).toMatchObject([{ userId: 'B', kind: 'new' }])
      expect(await idm(A1).safetyCode('B')).toBeNull()
    })

    it('grup: yeni üyenin imzasız ilk cihazı da "doğrulanmamış" (üye eklemesine gizlenmez); imzalısı satırsız', async () => {
      on()
      server.makeGroup(CH, ['A', 'B'], '2026-11-10T09:00:00.000Z')
      const A1 = await enter('A')
      const B1 = await enter('B')
      await send(A1, 'm1', 'ilk')
      await as(B1, (e) => e.onWelcome())
      const C1 = await enter('C') // C'nin ilk cihazı kimliği kurar ve kendini imzalar
      server.addMember(CH, 'C', new Date(Date.now() + 60_000).toISOString())
      await sync(A1)
      expect(await notices(A1)).toEqual([]) // imzalı ilk cihaz: satır yok (üye ekleme zaten görünür)
      await as(C1, (e) => e.onWelcome())
      await enter('C') // C2 imzasız
      await sync(A1)
      expect(await notices(A1)).toMatchObject([{ userId: 'C', kind: 'unverified' }])
    })

    it('kendi cihazlarım: hangisi doğrulanmış, bu cihaz hangisi', async () => {
      on()
      const A1 = await enter('A')
      const A2 = await enter('A')
      const view = await idm(A2).ownDevices()
      expect(view.hasIdentity).toBe(true)
      expect(view.thisDeviceVerified).toBe(false)
      expect(view.devices.find((d) => d.deviceId === A1.deviceId())?.verified).toBe(true)
      expect(view.devices.find((d) => d.current)?.deviceId).toBe(A2.deviceId())
    })
  })
}
