// E5a §4: yedek kurulum/açma/değiştirme/sıfırlama, görüntü, geri yükleme birleştirmesi (§4.5) ve silme boşluğu.
// Sunucu ve sağlayıcı flowSuite beforeEach'inden gelir; Argon2 hızlı sahte (gerçek vektörler core'da).
import { describe, expect, it } from 'vitest'
import {
  BackupPasswordError,
  fromUtf8,
  nobleArgon2id,
  openSnapshot,
  sha256,
  utf8,
} from '@kankaverse/e2ee-core'
import { BackupLockedError } from '../src/errors'
import { E2eeEngine } from '../src/engine'
import { LocalStore, type StoredMessage } from '../src/localStore'
import { serialLock } from '../src/lock'
import { backupDeps, REAUTH_PASSWORD } from './fakeBackup'
import { as, CH, login, provider, restart, send, server, show, type Profile } from './flowSuite'
import { MemoryVault } from './memoryVault'

const PW = 'kanka-yedek-sifresi-2026'
const NEW_PW = 'baska-bir-yedek-sifre-77'
const ID = { username: 'ayse', email: 'ayse@example.com' }
const REAUTH = { currentPassword: REAUTH_PASSWORD }
const H = 3_600_000
const T0 = Date.UTC(2026, 10, 11, 12)
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

const bk = (p: Profile) => p.engine.backup!
const rec = (id: string, status: StoredMessage['status'], body: string, extra: Partial<StoredMessage> = {}): StoredMessage => ({
  id,
  channelId: CH,
  status,
  body,
  digest: `dg-${id}-${body}`,
  ...extra,
})
const putRec = (p: Profile, r: StoredMessage) => p.vault.put('messages', r.id, utf8(JSON.stringify(r)))
const getRec = async (p: Profile, id: string): Promise<StoredMessage | null> => {
  const bytes = await p.vault.get('messages', id)
  return bytes ? (JSON.parse(fromUtf8(bytes)) as StoredMessage) : null
}
const local = (p: Profile) => new LocalStore(p.vault, provider)

/** Kullanıcı 'A'nın yeni cihazı: yedek kurulu, bu cihazda açık, kayıtlar yerelde. */
async function deviceWith(records: StoredMessage[], unlock = true): Promise<Profile> {
  const p = await login('A')
  for (const r of records) await putRec(p, r)
  if (unlock) await bk(p).unlockBackup(PW)
  return p
}

async function configured(records: StoredMessage[] = []): Promise<Profile> {
  const p = await login('A')
  for (const r of records) await putRec(p, r)
  expect(await bk(p).setupBackup(PW, ID)).toMatchObject({ ok: true, keyVersion: 1 })
  return p
}

export function backupSuite(label: string) {
  describe(`[${label}] E5a yedek: anahtar yönetimi`, () => {
    it('zayıf şifre reddedilir: sebep döner, fırlatmaz, sunucuya hiçbir şey gitmez', async () => {
      const p = await login('A')
      expect(await bk(p).setupBackup('kisa', ID)).toEqual({ ok: false, reason: 'too-short' })
      expect(await bk(p).setupBackup('aaaaaaaaaaaaaaaa', ID)).toEqual({ ok: false, reason: 'too-few-distinct' })
      expect(await bk(p).setupBackup('benim-AYSE-sifrem-1', ID)).toEqual({ ok: false, reason: 'contains-identity' })
      expect(server.backup.keys.size).toBe(0)
      expect((await bk(p).backupState()).configured).toBe(false)
    })

    it('kurulum: sunucuda sarılı anahtar (keyVersion 1), bu cihazda BMK açık, durum yansır', async () => {
      const p = await configured()
      const row = server.backup.keys.get('A')!
      expect(row.keyVersion).toBe(1)
      expect(row.params.m).toBeGreaterThanOrEqual(65536)
      const state = await bk(p).backupState()
      expect(state).toMatchObject({ enabled: true, configured: true, unlockedHere: true, keyVersion: 1, snapshots: [] })
      expect((await local(p).loadBackupKey())!.bmk).toHaveLength(32)
    })

    it('bayrak kapalıyken durum boş döner ve çalıştırma hiçbir şey yapmaz', async () => {
      server.backup.enabled = false
      const p = await login('A')
      expect(await bk(p).backupState()).toEqual({ enabled: false, configured: false, unlockedHere: false, snapshots: [] })
      expect(await bk(p).runBackupIfDue(T0)).toEqual({ status: 'skipped', reason: 'disabled' })
    })

    it('yeni cihaz: kilit aç; yanlış şifre BackupPasswordError ve anahtar yazılmaz', async () => {
      await configured()
      const d2 = await login('A')
      await expect(bk(d2).unlockBackup('yanlis-sifre-12345')).rejects.toBeInstanceOf(BackupPasswordError)
      expect((await bk(d2).backupState()).unlockedHere).toBe(false)
      expect(await bk(d2).unlockBackup(PW)).toEqual({ keyVersion: 1 })
      expect((await bk(d2).backupState()).unlockedHere).toBe(true)
    })

    it('şifre değişimi: diğer cihaz yeni şifreyle açar, eskiyle açamaz; keyVersion aynı, BMK aynı', async () => {
      const d1 = await configured()
      const bmkBefore = hex((await local(d1).loadBackupKey())!.bmk)
      expect(await bk(d1).changeBackupPassword(PW, NEW_PW, ID)).toEqual({ ok: true, keyVersion: 1 })
      expect(server.backup.keys.get('A')!.keyVersion).toBe(1)

      const d2 = await login('A')
      await expect(bk(d2).unlockBackup(PW)).rejects.toBeInstanceOf(BackupPasswordError)
      await bk(d2).unlockBackup(NEW_PW)
      expect(hex((await local(d2).loadBackupKey())!.bmk)).toBe(bmkBefore)
    })

    it('şifre değişimi: yanlış eski şifre ve zayıf yeni şifre sunucudaki anahtarı değiştirmez', async () => {
      const d1 = await configured()
      const before = JSON.stringify(server.backup.keys.get('A'))
      await expect(bk(d1).changeBackupPassword('yanlis-sifre-12345', NEW_PW, ID)).rejects.toBeInstanceOf(BackupPasswordError)
      expect(await bk(d1).changeBackupPassword(PW, 'kisa', ID)).toEqual({ ok: false, reason: 'too-short' })
      expect(JSON.stringify(server.backup.keys.get('A'))).toBe(before)
    })

    it('sıfırlama: görüntüler silinir; diğer cihazın yedeği 409 ile düşer, yeni şifreyle yeniden açılır', async () => {
      const d1 = await configured([rec('m1', 'ok', 'eski')])
      const d2 = await deviceWith([rec('m2', 'ok', 'baska')])
      expect(await bk(d1).runBackupIfDue(T0)).toMatchObject({ status: 'uploaded' })
      expect(server.backup.snapsOf('A').size).toBe(1)

      await expect(bk(d1).resetBackup(NEW_PW, ID, { currentPassword: 'yanlis' })).rejects.toMatchObject({
        response: { status: 401 },
      })
      expect(server.backup.keys.get('A')!.keyVersion).toBe(1)

      expect(await bk(d1).resetBackup(NEW_PW, ID, REAUTH)).toEqual({ ok: true, keyVersion: 2 })
      expect(server.backup.snapsOf('A').size).toBe(0)
      expect(server.backup.objects.size).toBe(0)

      // d2 eski anahtarla yükler: 409, sessiz; yerel BMK düşer, kirli kalır.
      expect(await bk(d2).runBackupIfDue(T0)).toEqual({ status: 'key-dropped' })
      expect((await bk(d2).backupState()).unlockedHere).toBe(false)
      expect(await local(d2).loadBackupKey()).toBeNull()
      expect(await bk(d2).runBackupIfDue(T0 + 1)).toEqual({ status: 'skipped', reason: 'no-key' })
      await expect(bk(d2).unlockBackup(PW)).rejects.toBeInstanceOf(BackupPasswordError)
      await bk(d2).unlockBackup(NEW_PW)
      expect(await bk(d2).runBackupIfDue(T0 + 2)).toMatchObject({ status: 'uploaded' })
    })

    it('sıfırlama: sunucu beklenenden farklı keyVersion verirse sarma gerçek sürümle yenilenir', async () => {
      const d1 = await configured()
      const base = server.apiFor('A', d1.family)
      // Arada başka cihaz sıfırlamış gibi: sürüm GET ile reset arasında bir artar, sunucu +2 verir.
      const api = new Proxy(base, {
        get: (t, k) =>
          k === 'backupReset'
            ? (body: Parameters<typeof t.backupReset>[0]) => {
                const cur = server.backup.keys.get('A')!
                server.backup.keys.set('A', { ...cur, keyVersion: cur.keyVersion + 1 })
                return t.backupReset(body)
              }
            : t[k as keyof typeof t],
      })
      const engine = (await E2eeEngine.start('A', {
        api,
        openVault: async () => d1.vault,
        withLock: serialLock(),
        provider,
        ...backupDeps(server),
        onWarn: () => {},
      }))!
      expect(await engine.backup!.resetBackup(NEW_PW, ID, REAUTH)).toEqual({ ok: true, keyVersion: 3 })
      const d2 = await login('A')
      expect(await bk(d2).unlockBackup(NEW_PW)).toEqual({ keyVersion: 3 }) // AAD gerçek sürümle: açılır
    })

    it('yedeği kapat: sunucu kaydı, görüntüler ve yerel BMK gider', async () => {
      const d1 = await configured([rec('m1', 'ok', 'x')])
      await bk(d1).runBackupIfDue(T0)
      await bk(d1).deleteBackup(REAUTH)
      expect(server.backup.keys.size).toBe(0)
      expect(server.backup.objects.size).toBe(0)
      expect(await local(d1).loadBackupKey()).toBeNull()
      expect((await bk(d1).backupState()).configured).toBe(false)
    })

    it('gerçek Argon2id (noble) ile kurulum ve yeni cihazda açılış', async () => {
      const mk = async (vault: MemoryVault, family: string) =>
        (await E2eeEngine.start('A', {
          api: server.apiFor('A', family),
          openVault: async () => vault,
          withLock: serialLock(),
          provider,
          argon2: nobleArgon2id,
          blob: server.backup.blob,
          onWarn: () => {},
        }))!
      const e1 = await mk(new MemoryVault(), 'real1')
      expect(await e1.backup!.setupBackup(PW, ID)).toMatchObject({ ok: true })
      const e2 = await mk(new MemoryVault(), 'real2')
      expect(await e2.backup!.unlockBackup(PW)).toEqual({ keyVersion: 1 })
    })

    it('resetDeviceState BMK ve yedek bayraklarını korur, cihaz kaydını siler', async () => {
      const d1 = await configured()
      const store = local(d1)
      const bmk = hex((await store.loadBackupKey())!.bmk)
      await store.patchFlags({ lastBackupAt: 5 })
      await store.resetDeviceState()
      expect(hex((await store.loadBackupKey())!.bmk)).toBe(bmk)
      expect(await store.loadFlags()).toMatchObject({ backupDirty: true, lastBackupAt: 5, lastResortUploaded: false })
      expect(await store.loadDevice()).toBeNull()
    })
  })

  describe(`[${label}] E5a yedek: görüntü alma`, () => {
    it('BMK yoksa ya da kirli değilse hiçbir şey yüklenmez', async () => {
      const p = await login('A')
      expect(await bk(p).runBackupIfDue(T0)).toEqual({ status: 'skipped', reason: 'no-key' })
      await bk(p).setupBackup(PW, ID)
      expect(await bk(p).runBackupIfDue(T0)).toMatchObject({ status: 'uploaded' })
      const puts = server.backup.puts
      expect(await bk(p).runBackupIfDue(T0 + 7 * H)).toEqual({ status: 'skipped', reason: 'not-dirty' })
      expect(server.backup.puts).toBe(puts)
    })

    it('yeni/silinen kayıt sonrası da en erken 6 saat geçince yüklenir', async () => {
      const p = await configured([rec('m1', 'ok', 'bir')])
      await bk(p).runBackupIfDue(T0)
      await local(p).saveMessage(rec('m2', 'ok', 'iki'))
      expect(await bk(p).runBackupIfDue(T0 + 5 * H)).toEqual({ status: 'skipped', reason: 'too-soon' })
      expect(await bk(p).runBackupIfDue(T0 + 6 * H)).toMatchObject({ status: 'uploaded', messages: 2 })
    })

    it('elle "Şimdi yedekle" 6 saati atlar ama değişiklik yoksa yüklemez (2026-11-12)', async () => {
      const p = await configured([rec('m1', 'ok', 'bir'), rec('m2', 'ok', 'iki')])
      await bk(p).runBackupIfDue(T0)
      const puts = server.backup.puts
      // Değişiklik yok: elle de olsa yükleme olmaz.
      expect(await bk(p).runBackupIfDue(T0 + H, { manual: true })).toEqual({ status: 'skipped', reason: 'not-dirty' })
      expect(server.backup.puts).toBe(puts)
      // Silme sonrası: zamanlayıcı bekler, elle basınca hemen yüklenir ve silinen kayıt görüntüden çıkar.
      await local(p).deleteMessage('m2')
      expect(await bk(p).runBackupIfDue(T0 + H)).toEqual({ status: 'skipped', reason: 'too-soon' })
      expect(await bk(p).runBackupIfDue(T0 + H, { manual: true })).toMatchObject({ status: 'uploaded', messages: 1 })
    })

    it('görüntü yalnız ok/unverified kayıtları ve §4.2 alanlarını taşır; kimlik ve sürüm AAD ile bağlı', async () => {
      const p = await configured([
        rec('ok1', 'ok', 'merhaba çğı', { fk: 'FK', sentAt: 123 }),
        rec('un1', 'unverified', 'gizli', { fk: 'FK2', sentAt: 456 }),
        rec('bad1', 'undecryptable', ''),
        rec('bad2', 'failed', ''),
        rec('bad3', 'unsupported', ''),
      ])
      await putRec(p, { ...rec('ek1', 'ok', 'ek alan'), secret: 'sizmamali' } as StoredMessage)
      await bk(p).runBackupIfDue(T0)
      const row = [...server.backup.snapsOf('A').values()][0]
      const sealed = server.backup.objects.get(`blob://${row.objectKey}`)!
      expect(row.sha256).toBe(hex(sha256(sealed)))
      const { bmk } = (await local(p).loadBackupKey())!
      const content = JSON.parse(fromUtf8(openSnapshot(bmk, sealed, 'A', p.deviceId(), 1)))
      expect(content).toMatchObject({ v: 1, deviceId: p.deviceId(), createdAt: T0 })
      expect(content.messages.map((m: StoredMessage) => m.id).sort()).toEqual(['ek1', 'ok1', 'un1'])
      expect(content.messages.find((m: StoredMessage) => m.id === 'ok1')).toEqual({
        id: 'ok1', channelId: CH, status: 'ok', body: 'merhaba çğı', digest: 'dg-ok1-merhaba çğı', fk: 'FK', sentAt: 123,
      })
      expect(JSON.stringify(content)).not.toContain('sizmamali')
      expect(() => openSnapshot(bmk, sealed, 'A', p.deviceId(), 2)).toThrow() // başka sürüm
      expect(() => openSnapshot(bmk, sealed, 'B', p.deviceId(), 1)).toThrow() // başka kullanıcı
    })

    it('ağ hatası fırlatmaz: failed döner, kirli kalır, sonraki tur yükler', async () => {
      const p = await configured([rec('m1', 'ok', 'x')])
      const real = server.backup.blob.put
      server.backup.blob.put = async () => {
        throw new Error('ağ yok')
      }
      expect(await bk(p).runBackupIfDue(T0)).toEqual({ status: 'failed', code: undefined })
      expect((await local(p).loadFlags()).backupDirty).toBe(true)
      server.backup.blob.put = real
      expect(await bk(p).runBackupIfDue(T0 + 60_000)).toMatchObject({ status: 'uploaded' })
    })

    it('yükleme sırasında gelen mesaj kirliyi korur; süreç yarıda ölürse (inFlight) sonraki tur yükler', async () => {
      const p = await configured([rec('m1', 'ok', 'x'), rec('m2', 'ok', 'y')])
      const real = server.backup.blob.put
      server.backup.blob.put = async (url, bytes) => {
        await p.engine.forgetMessage('m2') // yükleme sürerken silindi
        return real(url, bytes)
      }
      expect(await bk(p).runBackupIfDue(T0)).toMatchObject({ status: 'uploaded', messages: 2 })
      server.backup.blob.put = real
      expect((await local(p).loadFlags()).backupDirty).toBe(true)
      expect(await bk(p).runBackupIfDue(T0 + 6 * H)).toMatchObject({ status: 'uploaded', messages: 1 })

      // Yarıda ölen yükleme: put hiç dönmez, motor yeniden başlatılır.
      await local(p).saveMessage(rec('m3', 'ok', 'z'))
      server.backup.blob.put = () => new Promise<void>(() => {})
      void bk(p).runBackupIfDue(T0 + 13 * H)
      await new Promise((r) => setTimeout(r, 50))
      server.backup.blob.put = real
      const reopened = (await restart('A', p.family, p.vault))!
      expect(await reopened.backup!.runBackupIfDue(T0 + 8 * H)).toMatchObject({ status: 'skipped', reason: 'too-soon' })
      expect(await reopened.backup!.runBackupIfDue(T0 + 13 * H)).toMatchObject({ status: 'uploaded', messages: 2 })
    })

    it('silinen mesaj sonraki görüntüde yoktur (forgetMessage), olmayan kayıt yedeği kirletmez', async () => {
      const p = await configured([rec('m1', 'ok', 'silinecek'), rec('m2', 'ok', 'kalacak')])
      await bk(p).runBackupIfDue(T0)
      await p.engine.forgetMessage('yok-boyle-id')
      expect(await bk(p).runBackupIfDue(T0 + 7 * H)).toEqual({ status: 'skipped', reason: 'not-dirty' })
      await p.engine.forgetMessage('m1')
      expect(await getRec(p, 'm1')).toBeNull()
      expect(await bk(p).runBackupIfDue(T0 + 7 * H)).toMatchObject({ status: 'uploaded', messages: 1 })

      const d2 = await deviceWith([])
      await bk(d2).restoreBackup([CH])
      expect(await getRec(d2, 'm1')).toBeNull()
      expect(await getRec(d2, 'm2')).toMatchObject({ body: 'kalacak' })
    })
  })

  describe(`[${label}] E5a Rev.2 yedek: sunucuda silinen mesaj (§4.7)`, () => {
    it('çevrimdışıyken silinen mesaj görüntüde yok, yerelden de silinir; geri yüklemede gelmez', async () => {
      const p = await configured([rec('m1', 'ok', 'silinmis'), rec('m2', 'ok', 'duruyor')])
      server.goneMessages.add('m1') // başka cihazdan silindi, bu cihaz çevrimdışıydı
      expect(await bk(p).runBackupIfDue(T0)).toMatchObject({ status: 'uploaded', messages: 1 })
      expect(await getRec(p, 'm1')).toBeNull()
      expect(await getRec(p, 'm2')).not.toBeNull()
      // Silme görüntüye zaten yansıdı: yeniden yedek gerekmez.
      expect(await bk(p).runBackupIfDue(T0 + 7 * H)).toEqual({ status: 'skipped', reason: 'not-dirty' })
      const d2 = await deviceWith([])
      await bk(d2).restoreBackup([CH])
      expect(await getRec(d2, 'm1')).toBeNull()
      expect(await getRec(d2, 'm2')).toMatchObject({ body: 'duruyor' })
    })

    it('kontrol ağ hatasında görüntü YÜKLENMEZ, yerel kayıtlara dokunulmaz, kirli kalır; sonra yüklenir', async () => {
      const p = await configured([rec('m1', 'ok', 'a'), rec('m2', 'ok', 'b')])
      server.goneMessages.add('m1')
      server.existsError = Object.assign(new Error('ağ yok'), { response: { status: 503, data: {} } })
      const puts = server.backup.puts
      expect(await bk(p).runBackupIfDue(T0)).toEqual({ status: 'failed', code: undefined })
      expect(server.backup.puts).toBe(puts)
      expect(await getRec(p, 'm1')).not.toBeNull() // kontrol yapılamadı: silme kararı verilmedi
      expect((await local(p).loadFlags()).backupDirty).toBe(true)
      server.existsError = null
      expect(await bk(p).runBackupIfDue(T0 + 60_000)).toMatchObject({ status: 'uploaded', messages: 1 })
    })

    it('kanal başına 500\'lük gruplar; yalnız ok/unverified kayıtlar sorulur', async () => {
      const many = Array.from({ length: 1203 }, (_, i) => rec(`a${i}`, 'ok', 'x'))
      const p = await configured([...many, { ...rec('b1', 'ok', 'y'), channelId: 'ch2' }, rec('bad', 'undecryptable', '')])
      await bk(p).runBackupIfDue(T0)
      const calls = server.existsCalls.map((c) => `${c.channelId}:${c.count}`).sort()
      expect(calls).toEqual(['ch1:203', 'ch1:500', 'ch1:500', 'ch2:1'])
    })

    it('erişilemeyen kanal (403) yedeği takmaz: o kanalın kayıtları korunur, diğer kanal yine denetlenir', async () => {
      server.noAccessChannels.add('ch-eski')
      server.goneMessages.add('x1')
      const p = await configured([
        { ...rec('e1', 'ok', 'eski kanal'), channelId: 'ch-eski' },
        rec('x1', 'ok', 'silinmis'),
        rec('k1', 'ok', 'duruyor'),
      ])
      expect(await bk(p).runBackupIfDue(T0)).toMatchObject({ status: 'uploaded', messages: 2 })
      expect(await getRec(p, 'e1')).not.toBeNull()
      expect(await getRec(p, 'x1')).toBeNull()
    })

    it('geri yükleme: sunucuda silinmiş aday yazılmaz ve atlanan sayılır', async () => {
      const d1 = await configured([rec('a', 'ok', 'duruyor'), rec('b', 'ok', 'sonradan silindi')])
      await bk(d1).runBackupIfDue(T0)
      server.goneMessages.add('b') // yedekten sonra silindi
      const d2 = await deviceWith([])
      expect(await bk(d2).restoreBackup([CH])).toEqual({ restored: 1, skipped: 1, badSnapshots: 0 })
      expect(await getRec(d2, 'b')).toBeNull()
      expect(await getRec(d2, 'a')).toMatchObject({ body: 'duruyor' })
    })

    it('geri yükleme: kontrol ağ hatasında hata fırlar ve hiçbir şey yazılmaz', async () => {
      const d1 = await configured([rec('a', 'ok', 'x')])
      await bk(d1).runBackupIfDue(T0)
      const d2 = await deviceWith([])
      server.existsError = new Error('ağ yok')
      await expect(bk(d2).restoreBackup([CH])).rejects.toThrow('ağ yok')
      expect(await getRec(d2, 'a')).toBeNull()
    })
  })

  describe(`[${label}] E5a yedek: geri yükleme`, () => {
    it('gerçek akış: yeni cihaz kilit açar, geri yükler, mesajlar ok ve fk/sentAt/digest korunur', async () => {
      server.franking = true
      const A1 = await login('A')
      const B1 = await login('B')
      const m1 = await send(A1, 'm1', 'merhaba çğı 🔒')
      await as(B1, (e) => e.onWelcome())
      expect((await show(B1, [m1]))[0].e2eeStatus).toBe('ok')
      const m2 = await send(B1, 'm2', 'cevap')
      await bk(B1).setupBackup(PW, { username: 'veli', email: 'veli@example.com' })
      expect(await bk(B1).runBackupIfDue(T0)).toMatchObject({ status: 'uploaded', messages: 2 })

      const B2 = await login('B') // yeni cihaz, boş depo: Welcome yok, geçmiş çözülemez
      await bk(B2).unlockBackup(PW)
      expect(await bk(B2).restoreBackup([CH])).toEqual({ restored: 2, skipped: 0, badSnapshots: 0 })
      const [r1, r2] = await Promise.all([getRec(B2, 'm1'), getRec(B2, 'm2')])
      const [o1, o2] = await Promise.all([getRec(B1, 'm1'), getRec(B1, 'm2')])
      expect(r1).toEqual(o1)
      expect(r2).toEqual(o2)
      expect(r1).toMatchObject({ status: 'ok', body: 'merhaba çğı 🔒' })
      expect(r1!.fk).toBeTruthy()
      expect(r1!.sentAt).toBeGreaterThan(0)
      // Hidratör geri yüklenen kaydı tanır: özeti tutuyor, ekran düz metni gösterir.
      const shown = await show(B2, [m1, m2])
      expect(shown.map((m) => [m.content, m.e2eeStatus])).toEqual([['merhaba çğı 🔒', 'ok'], ['cevap', 'ok']])
    })

    it('BMK açık değilse geri yükleme BackupLockedError', async () => {
      await configured()
      const d2 = await login('A')
      await expect(bk(d2).restoreBackup([CH])).rejects.toBeInstanceOf(BackupLockedError)
    })

    // §4.5 tablosu, satır satır: yerel durum x gelen durum -> yazılır mı.
    it.each<[string, StoredMessage | null, StoredMessage, boolean]>([
      ['yerelde yok -> yaz', null, rec('r', 'ok', 'gelen'), true],
      ['yerelde undecryptable -> yaz', rec('r', 'undecryptable', ''), rec('r', 'ok', 'gelen'), true],
      ['yerelde failed -> yaz', rec('r', 'failed', ''), rec('r', 'unverified', 'gelen'), true],
      ['yerelde unsupported -> yaz', rec('r', 'unsupported', ''), rec('r', 'ok', 'gelen'), true],
      ['yerelde unverified + gelen ok -> yaz', rec('r', 'unverified', 'yerel'), rec('r', 'ok', 'gelen'), true],
      ['yerelde unverified + gelen unverified -> dokunma', rec('r', 'unverified', 'yerel'), rec('r', 'unverified', 'gelen'), false],
      ['yerelde ok + gelen ok -> DOKUNMA', rec('r', 'ok', 'yerel'), rec('r', 'ok', 'gelen'), false],
      ['yerelde ok + gelen unverified -> DOKUNMA', rec('r', 'ok', 'yerel'), rec('r', 'unverified', 'gelen'), false],
    ])('birleştirme §4.5: %s', async (_name, localRec, incoming, written) => {
      const d1 = await configured([incoming])
      await bk(d1).runBackupIfDue(T0)
      const d2 = await deviceWith(localRec ? [localRec] : [])
      const result = await bk(d2).restoreBackup([CH])
      expect(result).toEqual({ restored: written ? 1 : 0, skipped: written ? 0 : 1, badSnapshots: 0 })
      expect(await getRec(d2, 'r')).toEqual(written ? incoming : localRec)
    })

    it('aynı id iki görüntüde: ok > unverified (yeni görüntüde unverified olsa da)', async () => {
      const d1 = await configured([rec('r', 'ok', 'saglam')])
      const d2 = await deviceWith([rec('r', 'unverified', 'sonradan')])
      await bk(d1).runBackupIfDue(T0)
      await bk(d2).runBackupIfDue(T0 + 7 * H) // daha yeni görüntü, unverified
      const d3 = await deviceWith([])
      await bk(d3).restoreBackup([CH])
      expect(await getRec(d3, 'r')).toMatchObject({ status: 'ok', body: 'saglam' })
    })

    it('aynı id iki ok görüntüde özet farklıysa createdAt yeni olan kazanır (düzenlenmiş sürüm)', async () => {
      const d1 = await configured([rec('r', 'ok', 'ilk', { digest: 'D1' })])
      const d2 = await deviceWith([rec('r', 'ok', 'duzenlendi', { digest: 'D2' })])
      await bk(d2).runBackupIfDue(T0 + 7 * H) // yeni
      await bk(d1).runBackupIfDue(T0) // eski (yükleme sırası önemsiz, createdAt belirler)
      const d3 = await deviceWith([])
      await bk(d3).restoreBackup([CH])
      expect(await getRec(d3, 'r')).toMatchObject({ body: 'duzenlendi', digest: 'D2' })
    })

    it('kanal erişilebilir listede değilse yazılmaz, atlanan sayılır', async () => {
      const d1 = await configured([rec('a', 'ok', 'acik'), { ...rec('b', 'ok', 'kapali'), channelId: 'ch-yok' }])
      await bk(d1).runBackupIfDue(T0)
      const d2 = await deviceWith([])
      expect(await bk(d2).restoreBackup([CH])).toEqual({ restored: 1, skipped: 1, badSnapshots: 0 })
      expect(await getRec(d2, 'b')).toBeNull()
      expect(await getRec(d2, 'a')).not.toBeNull()
    })

    it('açılamayan görüntü atlanır ve sayılır; sağlam görüntü yine geri yüklenir', async () => {
      const d1 = await configured([rec('a', 'ok', 'bir')])
      const d2 = await deviceWith([rec('b', 'ok', 'iki')])
      const d3 = await deviceWith([rec('c', 'ok', 'uc')])
      await bk(d1).runBackupIfDue(T0)
      await bk(d2).runBackupIfDue(T0)
      await bk(d3).runBackupIfDue(T0)
      const rows = server.backup.snapsOf('A')
      const tamper = (deviceId: string, fixSha: boolean) => {
        const row = rows.get(deviceId)!
        const key = `blob://${row.objectKey}`
        const bytes = server.backup.objects.get(key)!.slice()
        bytes[bytes.length - 1] ^= 1
        server.backup.objects.set(key, bytes)
        if (fixSha) row.sha256 = hex(sha256(bytes)) // özet tutar, yalnız GCM etiketi bozuk
      }
      tamper(d1.deviceId(), false) // özet tutmuyor
      tamper(d2.deviceId(), true) // GCM doğrulaması düşüyor
      const d4 = await deviceWith([])
      expect(await bk(d4).restoreBackup([CH])).toEqual({ restored: 1, skipped: 0, badSnapshots: 2 })
      expect(await getRec(d4, 'c')).toMatchObject({ body: 'uc' })
      expect(await getRec(d4, 'a')).toBeNull()
    })

    it('geri yükleme yedeği kirletir (bu cihazın görüntüsü güncellensin); yazım yoksa kirletmez', async () => {
      const d1 = await configured([rec('a', 'ok', 'bir')])
      await bk(d1).runBackupIfDue(T0)
      const d2 = await deviceWith([rec('a', 'ok', 'zaten var')])
      await bk(d2).runBackupIfDue(T0) // unlock sonrası kirli: ilk görüntü
      expect((await local(d2).loadFlags()).backupDirty).toBe(false)
      await bk(d2).restoreBackup([CH])
      expect((await local(d2).loadFlags()).backupDirty).toBe(false) // hiçbir şey yazılmadı
      const d3 = await deviceWith([])
      await bk(d3).restoreBackup([CH])
      expect(await bk(d3).runBackupIfDue(T0)).toMatchObject({ status: 'uploaded', messages: 1 })
    })
  })
}
