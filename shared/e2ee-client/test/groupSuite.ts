// E2 §3.5: grup DM (3+ üye) istemci akışı. Gerçek çekirdek (MLS) + sahte sunucu. Sunucu ve sağlayıcı flowSuite
// beforeEach'inden gelir. Her kullanıcının ayrı cihazları `login` ile açılır.
import { describe, expect, it } from 'vitest'
import { utf8 } from '@kankaverse/e2ee-core'
import { GroupNotReadyError } from '../src/context'
import { LocalStore } from '../src/localStore'
import { as, CH, login, provider, send, server, show, type Msg, type Profile } from './flowSuite'

const EARLY = '2026-11-10T09:00:00.000Z' // grup kurulmadan önce üye olunan zaman
const LEFT = '2026-11-10T12:00:00.000Z'
const later = () => new Date(Date.now() + 60_000).toISOString() // grup kurulduktan SONRA katılım
const sync = async (...ps: Profile[]) => {
  for (const p of ps) await as(p, (e) => e.onGroupChanged(CH))
}
const notices = (p: Profile) => as(p, (e) => e.deviceNotices(CH))
const text = async (p: Profile, m: Msg) => (await show(p, [m]))[0].content

export function groupSuite(label: string) {
  describe(`[${label}] grup DM: kurma ve mesajlaşma`, () => {
    it('3 kullanıcı x 2 cihaz: ilk mesajla grup kurulur, her cihaz çözer, her cihaz yazabilir', async () => {
      server.makeGroup(CH, ['A', 'B', 'C'], EARLY)
      const A1 = await login('A')
      const A2 = await login('A')
      const B1 = await login('B')
      const B2 = await login('B')
      const C1 = await login('C')
      const C2 = await login('C')
      const m1 = await send(A1, 'm1', 'herkese merhaba çğı')
      for (const p of [A2, B1, B2, C1, C2]) {
        expect(await as(p, (e) => e.onWelcome())).toEqual([CH])
        expect(await text(p, m1)).toBe('herkese merhaba çğı')
      }
      const m2 = await send(C2, 'm2', 'C2 den')
      for (const p of [A1, A2, B1, B2, C1]) expect(await text(p, m2)).toBe('C2 den')
      expect(server.groups.get(CH)!.epoch).toBe(1) // tek kurma commit'i, hiç ek commit yok
    })

    it('cihazsız üye grubu engellemez; sonradan cihaz kaydedince eklenir, öncesini görmez, sonrasını çözer', async () => {
      server.makeGroup(CH, ['A', 'B', 'C'], EARLY)
      const A1 = await login('A')
      const B1 = await login('B')
      const m1 = await send(A1, 'm1', 'C henüz cihazsız') // C cihazsız: A ve B ile kurulur
      await as(B1, (e) => e.onWelcome())
      const C1 = await login('C')
      await sync(A1) // e2ee:devices-changed: çevrimiçi üye C1'i ekler
      expect(await as(C1, (e) => e.onWelcome())).toEqual([CH])
      await sync(B1)
      const m2 = await send(B1, 'm2', 'C artık içeride')
      expect(await text(C1, m2)).toBe('C artık içeride')
      expect((await show(C1, [m1]))[0]).toMatchObject({ content: '', e2eeStatus: 'undecryptable' })
    })

    it('listede olmayan üyeli grupta claim 422: grup kurulmaz, düz yola düşer', async () => {
      server.makeGroup(CH, ['A', 'B', 'C'], EARLY)
      server.notEligible.add('C')
      const A1 = await login('A')
      await login('B')
      await login('C')
      expect(await as(A1, (e) => e.encrypt(CH, 'düz'))).toBeNull()
      expect(server.groups.has(CH)).toBe(false)
    })

    it('yalnız gönderen cihazlıysa şifresiz kalır; gönderen dahil iki üye cihazlıysa kurulur', async () => {
      server.makeGroup(CH, ['A', 'B', 'C'], EARLY)
      const A1 = await login('A')
      expect(await as(A1, (e) => e.encrypt(CH, 'düz'))).toBeNull()
      expect(server.groups.has(CH)).toBe(false)
      await login('C')
      expect(await as(A1, (e) => e.encrypt(CH, 'şimdi şifreli'))).not.toBeNull()
    })

    it('1-1 kuralı değişmedi: iki üyeli kanalda karşı tarafın cihazı yoksa şifresiz kalır', async () => {
      const A1 = await login('A') // beforeEach: CH = A,B (1-1)
      expect(await as(A1, (e) => e.encrypt(CH, 'düz'))).toBeNull()
    })

    it('grup mesajında şikâyet kanıtı (E4): çözülen mesaj + parmak izi anahtarı toplanır', async () => {
      server.franking = true
      server.makeGroup(CH, ['A', 'B', 'C'], EARLY)
      const A1 = await login('A')
      await login('B')
      const C1 = await login('C')
      const m1 = await send(A1, 'm1', 'kötü söz')
      await as(C1, (e) => e.onWelcome())
      expect(await text(C1, m1)).toBe('kötü söz')
      const ev = await as(C1, (e) => e.collectEvidence(CH, 'm1', []))
      expect(ev).toHaveLength(1)
      expect(ev[0]).toMatchObject({ messageId: 'm1', body: 'kötü söz' })
      expect(ev[0].fk).toBeTruthy()
    })
  })

  describe(`[${label}] grup DM: üye çıkarma (R7)`, () => {
    async function trio() {
      server.makeGroup(CH, ['A', 'B', 'C'], EARLY)
      const A1 = await login('A')
      const B1 = await login('B')
      const C1 = await login('C')
      const m1 = await send(A1, 'm1', 'ilk')
      await as(B1, (e) => e.onWelcome())
      await as(C1, (e) => e.onWelcome())
      await show(B1, [m1])
      await show(C1, [m1])
      return { A1, B1, C1, m1 }
    }

    it('eski üyenin yaprakları tanınır (sahte alarm yok), çıkarılır, sonraki mesajı çözemez', async () => {
      const { A1, B1, C1 } = await trio()
      const C2 = await login('C')
      await sync(A1) // C2 eklenir (epoch 2); B1 geride kalır
      await as(C2, (e) => e.onWelcome())
      server.removeMember(CH, 'C', LEFT) // C çıkarıldı: C1 ve C2 artık eski üyenin cihazı
      await sync(A1) // tek commit ile iki yaprak da çıkar
      const handshakes = server.handshakes.length
      await sync(B1) // B1: C2'nin eklendiği commit'i, C2 artık yalnız formerMembers'ta iken işler
      expect(B1.warnings).toEqual([]) // "tanınmayan cihaz" sahte alarmı YOK
      expect(server.handshakes.length).toBe(handshakes) // B1 yeni commit üretmedi (çıkarma zaten yapılmış)

      const m2 = await send(B1, 'm2', 'C artık yok')
      expect(await text(A1, m2)).toBe('C artık yok')
      for (const gone of [C1, C2]) expect((await show(gone, [m2]))[0].content).toBe('')
    })

    // Çıkarılıp geri eklenen üyenin cihazı: yerel grup PASİF (isActive=false) kalır; yok gibi davranıp Welcome işlemeli.
    async function removedThenReAdded() {
      const { A1, B1, C1 } = await trio()
      server.removeMember(CH, 'C', LEFT)
      await sync(A1, B1)
      await sync(C1) // C1 çıkarıldığını işler: yerel grup pasif
      expect(C1.warnings).toContainEqual([CH, 'removed'])
      server.addMember(CH, 'C', later())
      await sync(A1) // C1 yeniden eklenir (yeni Welcome)
      await sync(B1)
      return { A1, B1, C1 }
    }

    it('geri eklenen üye (a) kanal açılışında yeniden katılır, sonraki mesajı çözer ve gönderebilir', async () => {
      const { A1, B1, C1 } = await removedThenReAdded()
      await as(C1, (e) => e.open(CH))
      const m = await send(A1, 'm5', 'C döndü')
      expect(await text(C1, m)).toBe('C döndü')
      const sent = await send(C1, 'm6', 'döndüm')
      expect(await text(B1, sent)).toBe('döndüm')
    })

    it('geri eklenen üye (b) doğrudan gönderimde yeniden katılır', async () => {
      const { B1, C1 } = await removedThenReAdded()
      const sent = await send(C1, 'm6', 'döndüm')
      expect(await text(B1, sent)).toBe('döndüm')
    })

    it('geri eklenen üye (c) Welcome olayıyla yeniden katılır', async () => {
      const { A1, C1 } = await removedThenReAdded()
      expect(await as(C1, (e) => e.onWelcome())).toEqual([CH])
      const m = await send(A1, 'm5', 'C döndü')
      expect(await text(C1, m)).toBe('C döndü')
    })

    it('yeniden katılınca "çıkarıldı" uyarısı kalkar (null); aradaki (katılım öncesi) mesaj "çözülemedi" değil cihaz öncesi', async () => {
      const { A1, C1 } = await removedThenReAdded()
      const gap = await send(A1, 'mg', 'C henüz MLS dışında', new Date(Date.now() + 60_000).toISOString())
      expect((await show(C1, [gap]))[0]).toMatchObject({ content: '', e2eeStatus: 'undecryptable' }) // hâlâ pasif
      await as(C1, (e) => e.open(CH))
      expect(C1.warnings[C1.warnings.length - 1]).toEqual([CH, null])
    })

    it('gönderim kapısı: çıkarma commit kabul edilemezken mesaj ŞİFRELENMEZ; kabul edilince gider', async () => {
      const { A1, B1, C1 } = await trio()
      server.removeMember(CH, 'C', LEFT)
      server.rejectCommits = true
      await expect(as(A1, (e) => e.encrypt(CH, 'sızmasın'))).rejects.toBeInstanceOf(GroupNotReadyError)
      expect(server.groups.get(CH)!.epoch).toBe(1) // hiçbir şey ilerlemedi

      server.rejectCommits = false
      const m2 = await send(A1, 'm2', 'artık güvenli') // kapı önce çıkarmayı yapar, sonra şifreler
      expect(await text(B1, m2)).toBe('artık güvenli')
      expect((await show(C1, [m2]))[0].content).toBe('')
    })

    it('gönderim kapısı: çıkarılacak yaprak yokken ek commit ya da engel yok', async () => {
      const { A1 } = await trio()
      const before = server.handshakes.length
      await send(A1, 'm2', 'normal')
      expect(server.handshakes.length).toBe(before)
    })

    it('eski üye cihazından leftAt SONRASI gelen mesaj gösterilmez, öncesi kalır', async () => {
      const { B1, C1 } = await trio()
      const early = await send(C1, 'e1', 'ayrılmadan önce', '2026-11-10T11:00:00.000Z')
      const late = await send(C1, 'e2', 'ayrıldıktan sonra', '2026-11-10T13:00:00.000Z')
      server.removeMember(CH, 'C', LEFT)
      const shown = await show(B1, [early, late])
      expect(shown.map((m) => m.id)).toEqual(['e1'])
    })

    it('çıkarılan üye yeniden eklenir: aradaki mesajları görmez, sonrakini çözer; "yeni cihaz" satırı yok', async () => {
      const { A1, B1, C1 } = await trio()
      server.removeMember(CH, 'C', LEFT)
      await sync(A1, B1)
      await sync(C1) // C1 çıkarıldığını işler
      expect(C1.warnings).toContainEqual([CH, 'removed'])
      const between = await send(A1, 'm2', 'C yokken')
      server.addMember(CH, 'C', later())
      await sync(A1)
      expect(await as(C1, (e) => e.onWelcome())).toEqual([CH])
      await sync(B1)
      const after = await send(B1, 'm3', 'C döndü')
      expect(await text(C1, after)).toBe('C döndü')
      expect((await show(C1, [between]))[0]).toMatchObject({ content: '', e2eeStatus: 'undecryptable' })
      expect(await notices(A1)).toEqual([])
      expect(await notices(B1)).toEqual([])
    })
  })

  describe(`[${label}] grup DM: "yeni cihaz eklendi" satırı (§3.3)`, () => {
    async function trio() {
      server.makeGroup(CH, ['A', 'B', 'C'], EARLY)
      const A1 = await login('A')
      const B1 = await login('B')
      const C1 = await login('C')
      await send(A1, 'm1', 'ilk')
      await as(B1, (e) => e.onWelcome())
      await as(C1, (e) => e.onWelcome())
      return { A1, B1, C1 }
    }

    it('mevcut üye yeni cihaz ekler: diğer üyelerde BİR satır (ekleyen dahil), kendi cihazlarında yok', async () => {
      const { A1, B1, C1 } = await trio()
      const B2 = await login('B')
      await sync(A1) // A1 commit'i gönderir
      await as(B2, (e) => e.onWelcome())
      await sync(B1, C1)
      expect(await notices(A1)).toMatchObject([{ userId: 'B', count: 1 }])
      expect(await notices(C1)).toMatchObject([{ userId: 'B', count: 1 }])
      expect(await notices(B1)).toEqual([]) // kendi hesabım: E5b aktarım bildirimi var
      expect(await notices(B2)).toEqual([])
      await sync(A1, B1, C1) // tekrar işlem satır çoğaltmaz
      expect(await notices(C1)).toHaveLength(1)
    })

    it('satır zamanı commit zamanı SUNUCU saatidir (geride kalan cihaz biriken commiti işlese de)', async () => {
      const { A1, B1, C1 } = await trio()
      await login('B')
      await sync(A1) // commit epoch 1 -> 2
      const commit = server.handshakes[server.handshakes.length - 1]
      commit.at = '2026-11-10T11:00:00.000Z'
      await sync(C1) // C1 commit'i sonradan işler
      expect(await notices(C1)).toMatchObject([{ userId: 'B', at: Date.parse(commit.at) }])
      void B1
    })

    it('eski sunucu (createdAt yok): satır yerel saatle yazılır', async () => {
      const { A1, C1 } = await trio()
      await login('B')
      await sync(A1)
      server.legacyCommits = true
      const before = Date.now()
      await sync(C1)
      const [n] = await notices(C1)
      expect(n.at).toBeGreaterThanOrEqual(before)
    })

    it('1-1 DM: karşı tarafın yeni cihazı satır üretir (ekleyen taraf da görür)', async () => {
      const A1 = await login('A') // CH = A,B (1-1)
      const B1 = await login('B')
      await send(A1, 'm1', 'ilk')
      await as(B1, (e) => e.onWelcome())
      const B2 = await login('B')
      await sync(A1)
      await as(B2, (e) => e.onWelcome())
      expect(await notices(A1)).toMatchObject([{ userId: 'B', count: 1 }])
      expect(await notices(B1)).toEqual([])
    })

    it('sonradan eklenen üyenin İLK cihazları satır üretmez, sonraki cihazı üretir', async () => {
      const { A1, B1 } = await trio()
      const D1 = await login('D')
      await login('D')
      server.addMember(CH, 'D', later())
      await sync(A1) // D1 ve D2 aynı commit'te
      await as(D1, (e) => e.onWelcome())
      await sync(B1)
      expect(await notices(A1)).toEqual([])
      expect(await notices(B1)).toEqual([])

      await login('D') // D3: D zaten üyeydi, yaprağı vardı
      await sync(A1, B1)
      expect(await notices(B1)).toMatchObject([{ userId: 'D', count: 1 }])
    })

    it('sonradan eklenen üyenin 1 cihazı eklenir, SONRA ikinci cihazı: ekleyen ve eklemeyen cihazda tek satır', async () => {
      const { A1, B1, C1 } = await trio()
      const D1 = await login('D')
      server.addMember(CH, 'D', later())
      await sync(A1) // D1 yalnız ilk cihaz: satır yok
      await as(D1, (e) => e.onWelcome())
      await sync(B1, C1, D1)
      expect(await notices(A1)).toEqual([])
      expect(await notices(B1)).toEqual([])

      await login('D') // D2: ikinci cihaz
      await sync(A1) // A1 commit'i gönderir (ekleyen)
      await sync(B1, C1) // eklemeyen cihazlar
      for (const p of [A1, B1, C1]) expect(await notices(p)).toMatchObject([{ userId: 'D', count: 1 }])
      expect(await notices(D1)).toEqual([])
    })

    it('sonradan eklenen üyenin ikinci cihazını KENDİ ilk cihazı ekler: diğer üyelerde tek satır', async () => {
      const { A1, B1, C1 } = await trio()
      const D1 = await login('D')
      server.addMember(CH, 'D', later())
      await sync(A1)
      await as(D1, (e) => e.onWelcome())
      await sync(B1, C1)
      await login('D')
      await sync(D1) // D1 kendi hesabının yeni cihazını ekler
      await sync(A1, B1, C1)
      for (const p of [A1, B1, C1]) expect(await notices(p)).toMatchObject([{ userId: 'D', count: 1 }])
    })

    it('YENİ ÜYE İKİNCİ CİHAZ: ilk mesaj çözülürken (hydrate yolu) yakalanan commit de tek satır üretir', async () => {
      const { A1, B1, C1 } = await trio()
      const D1 = await login('D')
      server.addMember(CH, 'D', later())
      await sync(A1)
      await as(D1, (e) => e.onWelcome())
      await sync(B1, C1)
      const D2 = await login('D')
      await sync(D1)
      await as(D2, (e) => e.onWelcome())
      const m = await send(D2, 'm9', 'D ikinci cihazdan')
      for (const p of [A1, B1, C1]) {
        expect(await text(p, m)).toBe('D ikinci cihazdan')
        expect(await notices(p)).toMatchObject([{ userId: 'D', count: 1 }])
      }
    })

    it('sonradan eklenen CİHAZSIZ üye: ilk cihazı satır üretmez, ikinci cihazı üretir', async () => {
      const { A1, B1, C1 } = await trio()
      server.addMember(CH, 'D', later())
      await sync(A1, B1, C1) // D cihazsız: yaprak yok
      const D1 = await login('D')
      await sync(A1)
      await as(D1, (e) => e.onWelcome())
      await sync(B1, C1)
      expect(await notices(B1)).toEqual([])
      await login('D')
      await sync(A1)
      await sync(B1, C1)
      for (const p of [A1, B1, C1]) expect(await notices(p)).toMatchObject([{ userId: 'D', count: 1 }])
    })

    it('çıkarılıp yeniden eklenen üyenin yaprağı ağaçta KALDIYSA (çıkarma işlenmeden döndü): yeni cihazı satır üretir', async () => {
      const { A1, B1, C1 } = await trio()
      server.removeMember(CH, 'C', LEFT)
      server.addMember(CH, 'C', later()) // kimse çıkarmayı işlemedi: C1 yaprağı hâlâ ağaçta
      await login('C')
      await sync(A1)
      await sync(B1)
      for (const p of [A1, B1]) expect(await notices(p)).toMatchObject([{ userId: 'C', count: 1 }])
      void C1
    })

    it('tek cihazlı üye çıkış yapıp yeniden girer: yeni cihaz satır üretir (yaprağı daha önce vardı)', async () => {
      const { A1, B1, C1 } = await trio()
      server.revoke(B1.deviceId(), new Date()) // B çıkış yaptı
      await sync(A1) // B1'in yaprağı çıkar
      const B2 = await login('B')
      await sync(A1)
      await as(B2, (e) => e.onWelcome())
      await sync(C1)
      expect(await notices(C1)).toMatchObject([{ userId: 'B', count: 1 }])
    })

    it('cihaz çıkarma satır üretmez; satırlar mesaj deposunda değildir (yedeğe girmez)', async () => {
      const { A1, B1 } = await trio()
      const C2 = await login('C')
      await sync(A1)
      await as(C2, (e) => e.onWelcome())
      await sync(B1)
      const count = (await notices(B1)).length
      server.revoke(C2.deviceId(), new Date())
      await sync(A1, B1)
      expect(await notices(B1)).toHaveLength(count)
      expect(await B1.vault.keys('messages')).toEqual([])
    })

    it('önceden cihazsız (grup kurulurken üye) kullanıcının İLK cihazı da satır üretir', async () => {
      server.makeGroup(CH, ['A', 'B', 'C'], EARLY)
      const A1 = await login('A')
      const B1 = await login('B')
      await send(A1, 'm1', 'C cihazsız')
      await as(B1, (e) => e.onWelcome())
      await login('C')
      await sync(A1, B1)
      expect(await notices(B1)).toMatchObject([{ userId: 'C', count: 1 }])
    })
  })

  describe(`[${label}] grup DM: önbellek ve yedek uyumu`, () => {
    it('E2 öncesi yazılmış görünüm (yalnız members dizisi) hâlâ okunur', async () => {
      const A1 = await login('A')
      const store = new LocalStore(A1.vault, provider)
      await A1.vault.put('groups', 'x:view', utf8(JSON.stringify([{ userId: 'A', devices: [] }])))
      expect(await store.loadView('x')).toEqual({ members: [{ userId: 'A', devices: [] }], createdAt: null })
    })

    it('grup mesajları yedeğe girer ve yeni cihazda geri yüklenir (E5a)', async () => {
      server.backup.enabled = true
      server.makeGroup(CH, ['A', 'B', 'C'], EARLY)
      const A1 = await login('A')
      const B1 = await login('B')
      await login('C')
      const m1 = await send(A1, 'm1', 'grup yedeği')
      await as(B1, (e) => e.onWelcome())
      await show(B1, [m1])
      const PW = 'kanka-yedek-sifresi-2026'
      await B1.engine.backup!.setupBackup(PW, { username: 'x', email: 'x@example.com' })
      expect((await B1.engine.backup!.runBackupIfDue(Date.UTC(2026, 10, 11, 12))).status).toBe('uploaded')
      const B2 = await login('B')
      await B2.engine.backup!.unlockBackup(PW)
      expect(await B2.engine.backup!.restoreBackup([CH])).toMatchObject({ restored: 1 })
      expect(await as(B2, (e) => e.quoteText('m1'))).toBe('grup yedeği')
    })
  })
}
