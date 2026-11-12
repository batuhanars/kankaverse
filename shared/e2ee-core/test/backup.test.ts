import { describe, expect, it } from 'vitest'
import {
  BackupParamsError,
  BackupPasswordError,
  BackupSnapshotError,
  BACKUP_KDF_DEFAULT,
  BACKUP_KDF_FLOOR,
  BACKUP_KDF_MAX,
  SNAPSHOT_VERSION,
  checkBackupPassword,
  suggestBackupPassword,
  deriveBackupKek,
  newBackupKey,
  newBackupSalt,
  nobleArgon2id,
  openSnapshot,
  sealSnapshot,
  unwrapBackupKey,
  wrapBackupKey,
} from '../src'

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const enc = (s: string) => new TextEncoder().encode(s)
const SALT = new Uint8Array(16).fill(7)
const PASSWORD = 'kanka-yedek-sifre-2026'

describe('Argon2id vektörleri (E5a §2.1, §2.4)', () => {
  it('C referansı: password/somesalt, m=65536 t=2 p=1', async () => {
    const out = await nobleArgon2id(enc('password'), enc('somesalt'), { m: 65536, t: 2, p: 1, dkLen: 32 })
    expect(hex(out)).toBe('09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7')
  })

  it('sabit şifre/tuz/taban -> sabit KEK (native ile birebir doğrulandı)', async () => {
    const kek = await deriveBackupKek(PASSWORD, SALT, BACKUP_KDF_FLOOR, nobleArgon2id)
    expect(hex(kek)).toBe('7318c7199271823fa754bfca8915612543ebe60e2a868dc88ffa10f5a4aa6ebf')
  })

  it('NFC: bileşik ve ayrık "ş" aynı KEK', async () => {
    const composed = 'sifre-ş-uzun-2026'
    const decomposed = 'sifre-ş-uzun-2026'
    expect(composed).not.toBe(decomposed)
    const a = await deriveBackupKek(composed, SALT, BACKUP_KDF_FLOOR, nobleArgon2id)
    const b = await deriveBackupKek(decomposed, SALT, BACKUP_KDF_FLOOR, nobleArgon2id)
    expect(hex(a)).toBe(hex(b))
  })
})

describe('deriveBackupKek parametre denetimi', () => {
  const never = async () => {
    throw new Error('Argon2 çağrılmamalıydı')
  }
  const derive = (salt: Uint8Array, params: { m: number; t: number; p: number }) =>
    deriveBackupKek(PASSWORD, salt, params, never)

  it('hedef parametreler tabanın üstünde', () => {
    expect(BACKUP_KDF_DEFAULT.m).toBeGreaterThanOrEqual(BACKUP_KDF_FLOOR.m)
    expect(BACKUP_KDF_DEFAULT.t).toBeGreaterThanOrEqual(BACKUP_KDF_FLOOR.t)
  })

  it.each([
    ['m taban altı', { m: 19455, t: 2, p: 1 }],
    ['t taban altı', { m: 19456, t: 1, p: 1 }],
    ['p=2', { m: 19456, t: 2, p: 2 }],
    ['p=0', { m: 19456, t: 2, p: 0 }],
    ['tam sayı değil', { m: 19456.5, t: 2, p: 1 }],
    ['m üst sınırın üstü', { m: 262145, t: 4, p: 1 }],
    ['t üst sınırın üstü', { m: 65536, t: 17, p: 1 }],
    ['aşırı bellek (4 GiB)', { m: 4194304, t: 4, p: 1 }],
  ])('%s reddedilir (Argon2 çağrılmaz)', async (_n, params) => {
    await expect(derive(SALT, params)).rejects.toBeInstanceOf(BackupParamsError)
  })

  it('15 ve 17 baytlık tuz reddedilir', async () => {
    await expect(derive(new Uint8Array(15), BACKUP_KDF_FLOOR)).rejects.toBeInstanceOf(BackupParamsError)
    await expect(derive(new Uint8Array(17), BACKUP_KDF_FLOOR)).rejects.toBeInstanceOf(BackupParamsError)
  })

  it('üst sınırın kendisi (m=262144, t=16) kabul edilir; hedef parametre sınırın içinde', async () => {
    expect(BACKUP_KDF_DEFAULT.m).toBeLessThanOrEqual(BACKUP_KDF_MAX.m)
    expect(BACKUP_KDF_DEFAULT.t).toBeLessThanOrEqual(BACKUP_KDF_MAX.t)
    let seen: { m: number; t: number } | undefined
    await deriveBackupKek(PASSWORD, SALT, BACKUP_KDF_MAX, async (_pw, _s, o) => {
      seen = o
      return new Uint8Array(32)
    })
    expect(seen).toMatchObject({ m: 262144, t: 16 })
  })

  it('tabanın üstü (m=19457, t=3) kabul edilir', async () => {
    let seen: { m: number; t: number; p: number; dkLen: number } | undefined
    await deriveBackupKek(PASSWORD, SALT, { m: 19457, t: 3, p: 1 }, async (_pw, _s, o) => {
      seen = o
      return new Uint8Array(32)
    })
    expect(seen).toEqual({ m: 19457, t: 3, p: 1, dkLen: 32 })
  })
})

describe('rastgele üreticiler', () => {
  it('uzunluklar ve her çağrıda farklı', () => {
    expect(newBackupKey()).toHaveLength(32)
    expect(newBackupSalt()).toHaveLength(16)
    expect(hex(newBackupKey())).not.toBe(hex(newBackupKey()))
    expect(hex(newBackupSalt())).not.toBe(hex(newBackupSalt()))
  })
})

describe('BMK sarma (E5a §2.2)', () => {
  const kek = new Uint8Array(32).fill(1)
  const bmk = newBackupKey()

  it('gidiş-dönüş; çıktı nonce(12) + bmk(32) + tag(16)', () => {
    const wrapped = wrapBackupKey(kek, bmk, 'u1', 1)
    expect(wrapped).toHaveLength(12 + 32 + 16)
    expect(hex(unwrapBackupKey(kek, wrapped, 'u1', 1))).toBe(hex(bmk))
  })

  it('yanlış KEK -> BackupPasswordError', () => {
    const wrapped = wrapBackupKey(kek, bmk, 'u1', 1)
    expect(() => unwrapBackupKey(new Uint8Array(32).fill(2), wrapped, 'u1', 1)).toThrow(BackupPasswordError)
  })

  it('farklı userId ya da keyVersion (AAD) -> BackupPasswordError', () => {
    const wrapped = wrapBackupKey(kek, bmk, 'u1', 1)
    expect(() => unwrapBackupKey(kek, wrapped, 'u2', 1)).toThrow(BackupPasswordError)
    expect(() => unwrapBackupKey(kek, wrapped, 'u1', 2)).toThrow(BackupPasswordError)
  })

  it('kurcalanmış bayt ve kısa girdi -> BackupPasswordError', () => {
    const wrapped = wrapBackupKey(kek, bmk, 'u1', 1)
    for (const i of [0, 12, wrapped.length - 1]) {
      const bad = wrapped.slice()
      bad[i] ^= 1
      expect(() => unwrapBackupKey(kek, bad, 'u1', 1)).toThrow(BackupPasswordError)
    }
    expect(() => unwrapBackupKey(kek, new Uint8Array(5), 'u1', 1)).toThrow(BackupPasswordError)
  })

  it('aynı girdiyle iki sarma farklı (nonce rastgele)', () => {
    expect(hex(wrapBackupKey(kek, bmk, 'u1', 1))).not.toBe(hex(wrapBackupKey(kek, bmk, 'u1', 1)))
  })
})

describe('görüntü şifreleme (E5a §2.2)', () => {
  const bmk = newBackupKey()
  const plain = enc(JSON.stringify({ v: SNAPSHOT_VERSION, deviceId: 'd1', createdAt: 1, messages: [] }))

  it('SNAPSHOT_VERSION 1', () => expect(SNAPSHOT_VERSION).toBe(1))

  it('gidiş-dönüş', () => {
    const sealed = sealSnapshot(bmk, plain, 'u1', 'd1', 1)
    expect(sealed).toHaveLength(12 + plain.length + 16)
    expect(hex(openSnapshot(bmk, sealed, 'u1', 'd1', 1))).toBe(hex(plain))
  })

  it('boş düz metin de gidip gelir', () => {
    const sealed = sealSnapshot(bmk, new Uint8Array(0), 'u1', 'd1', 1)
    expect(openSnapshot(bmk, sealed, 'u1', 'd1', 1)).toHaveLength(0)
  })

  it('farklı userId / deviceId / keyVersion / anahtar -> BackupSnapshotError', () => {
    const sealed = sealSnapshot(bmk, plain, 'u1', 'd1', 1)
    expect(() => openSnapshot(bmk, sealed, 'u2', 'd1', 1)).toThrow(BackupSnapshotError)
    expect(() => openSnapshot(bmk, sealed, 'u1', 'd2', 1)).toThrow(BackupSnapshotError)
    expect(() => openSnapshot(bmk, sealed, 'u1', 'd1', 2)).toThrow(BackupSnapshotError)
    expect(() => openSnapshot(newBackupKey(), sealed, 'u1', 'd1', 1)).toThrow(BackupSnapshotError)
  })

  it('kurcalanmış bayt ve kısa girdi -> BackupSnapshotError', () => {
    const sealed = sealSnapshot(bmk, plain, 'u1', 'd1', 1)
    const bad = sealed.slice()
    bad[20] ^= 1
    expect(() => openSnapshot(bmk, bad, 'u1', 'd1', 1)).toThrow(BackupSnapshotError)
    expect(() => openSnapshot(bmk, new Uint8Array(3), 'u1', 'd1', 1)).toThrow(BackupSnapshotError)
  })

  it('aynı girdiyle iki sealSnapshot farklı (nonce rastgele)', () => {
    expect(hex(sealSnapshot(bmk, plain, 'u1', 'd1', 1))).not.toBe(hex(sealSnapshot(bmk, plain, 'u1', 'd1', 1)))
  })
})

describe('checkBackupPassword (E5a §2.3)', () => {
  const ctx = { username: 'batuhan', email: 'ornek.kisi@example.com' }
  const reason = (pw: string, c = ctx) => {
    const r = checkBackupPassword(pw, c)
    return r.ok ? 'ok' : r.reason
  }

  it('uzunluk sınırı: 11 ret, 12 kabul (kod noktası)', () => {
    expect(reason('abcdefghijk')).toBe('too-short')
    expect(reason('abcdefghijkl')).toBe('ok')
  })

  it('uzunluk NFC sonrası kod noktasıyla sayılır', () => {
    // Ayrık "ş" (s + birleştirici) NFC ile tek kod noktası olur: 6 + 6 = 12.
    expect(reason('şşşşşşabcdef')).toBe('ok')
    // Emoji tek kod noktası (UTF-16'da 2 birim): 5 + 2 + 4 = 11 kod noktası, 13 birim.
    expect(reason('abcde' + '\u{1F600}'.repeat(2) + 'fghi')).toBe('too-short')
  })

  it('farklı karakter sınırı: 5 ret, 6 kabul', () => {
    expect(reason('abcdeabcdeabcde')).toBe('too-few-distinct')
    expect(reason('abcdefabcdefabcdef')).toBe('ok')
    expect(reason('aaaaaaaaaaaa')).toBe('too-few-distinct')
    expect(reason('121212121212')).toBe('too-few-distinct')
  })

  it('sıra: kısa önce, çeşitlilik sonra, kimlik en son', () => {
    expect(reason('aaa')).toBe('too-short')
    expect(reason('batuhan' + 'a'.repeat(10))).toBe('contains-identity')
    expect(reason('aaaaaaaaaaaa', { username: 'aaa', email: 'x@y.z' })).toBe('too-few-distinct')
  })

  it('kullanıcı adını büyük/küçük duyarsız içeremez', () => {
    expect(reason('xx-BaTuHaN-2026-yy')).toBe('contains-identity')
  })

  it('e-postanın @ öncesini içeremez; alan adı kısmı serbest', () => {
    expect(reason('Ornek.Kisi-sifre-99')).toBe('contains-identity')
    expect(reason('example-com-sifre-99')).toBe('ok')
  })

  it('Türkçe İ/ı: kullanıcı adı "İpek" şifrede "ipek" olarak yakalanır, "Irmak" da "ırmak" olarak', () => {
    expect(reason('xx-ipek-yyyy-1234', { username: 'İpek', email: 'a@b.c' })).toBe('contains-identity')
    expect(reason('xx-ırmak-yyyy-1234', { username: 'IRMAK', email: 'a@b.c' })).toBe('contains-identity')
    // Türkçe kurala göre I -> ı, i ile eşleşmez.
    expect(reason('xx-irmak-yyyy-1234', { username: 'IRMAK', email: 'a@b.c' })).toBe('ok')
  })

  it('3 karakterden kısa kullanıcı adı / e-posta öneki yok sayılır', () => {
    expect(reason('xx-ab-yyyy-12345', { username: 'ab', email: 'cd@x.y' })).toBe('ok')
    expect(reason('xx-abc-yyyy-12345', { username: 'abc', email: 'cd@x.y' })).toBe('contains-identity')
  })

  it('boş kimlik alanları sorun çıkarmaz', () => {
    expect(reason('abcdefghijkl', { username: '', email: '' })).toBe('ok')
    expect(reason('abcdefghijkl', { username: '', email: '@x.y' })).toBe('ok')
  })
})

describe('suggestBackupPassword (sahip kararı 2026-11-12)', () => {
  const ctx = { username: 'batuhan', email: 'ornek.kisi@example.com' }

  it('4x5 biçim, karışan karakter yok, kuraldan geçer', () => {
    for (let i = 0; i < 200; i++) {
      const pw = suggestBackupPassword(ctx)
      expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]{5}(-[A-HJ-NP-Za-km-z2-9]{5}){3}$/)
      expect(checkBackupPassword(pw, ctx).ok).toBe(true)
    }
  })

  it('her çağrı farklı (rastgelelik gerçekten kullanılıyor)', () => {
    const set = new Set(Array.from({ length: 50 }, () => suggestBackupPassword(ctx)))
    expect(set.size).toBe(50)
  })

  it('alfabe dışı baytlar atılır (modülo yanlılığı yok)', () => {
    // İlk çağrı yalnız atılacak baytlar (>= 224) döner; ikinci çağrı 0,1,2... → "ABCDE-...".
    let round = 0
    const random = (n: number) =>
      round++ === 0 ? new Uint8Array(n).fill(250) : Uint8Array.from({ length: n }, (_, i) => i % 56)
    expect(suggestBackupPassword(ctx, random).startsWith('ABCDE-FGHJK-')).toBe(true)
    expect(round).toBe(2)
  })

  it('kimliği içeren aday atılır, yenisi üretilir', () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    const enc = (s: string) => [...s].map((c) => alphabet.indexOf(c))
    // İlk aday ilk grubunda kullanıcı adını ("kanka") taşır → ret; sonraki çağrı çeşitli aday verir.
    const first = Uint8Array.from([...enc('kanka'), ...enc('Q2rT5'), ...enc('wZmK8'), ...enc('pYbcd')])
    let round = 0
    const random = (n: number) =>
      round++ === 0 ? first : Uint8Array.from({ length: n }, (_, i) => (i * 7) % 56)
    const pw = suggestBackupPassword({ username: 'kanka', email: 'x@y.z' }, random)
    expect(pw.toLocaleLowerCase('tr')).not.toContain('kanka')
    expect(round).toBeGreaterThan(1)
  })
})
