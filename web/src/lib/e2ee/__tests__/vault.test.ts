// Yerel şifreli depo: şifreleme, çıkarılamaz anahtar, kullanıcı ayrımı, çıkışta silme (E1 §4).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { dbNameFor, idbGet, idbPut, listE2eeDbNames, openDb } from '../idb'
import { destroyAllVaults, destroyOtherVaults, Vault, VaultCorruptError } from '../vault'

const enc = new TextEncoder()
const dec = new TextDecoder()

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() // her test temiz tarayıcı profili
})

describe('Vault', () => {
  it('yazılan veri geri okunur', async () => {
    const v = await Vault.open('u1')
    await v.put('messages', 'm1', enc.encode('merhaba'))
    expect(dec.decode((await v.get('messages', 'm1'))!)).toBe('merhaba')
    expect(await v.get('messages', 'yok')).toBeNull()
  })

  it('diskteki kayıt düz metin içermez (şifreli)', async () => {
    const v = await Vault.open('u1')
    await v.put('messages', 'm1', enc.encode('GIZLI-METIN-12345'))
    const db = await openDb(dbNameFor('u1'))
    const raw = await idbGet<{ iv: Uint8Array; ct: ArrayBuffer }>(db, 'messages', 'm1')
    const flat = dec.decode(new Uint8Array(raw!.ct))
    expect(flat).not.toContain('GIZLI-METIN')
    expect(raw!.iv).toHaveLength(12)
  })

  it('her yazımda farklı IV kullanır (aynı veri, farklı şifreli çıktı)', async () => {
    const v = await Vault.open('u1')
    await v.put('messages', 'a', enc.encode('ayni'))
    await v.put('messages', 'b', enc.encode('ayni'))
    const db = await openDb(dbNameFor('u1'))
    const a = await idbGet<{ iv: Uint8Array }>(db, 'messages', 'a')
    const b = await idbGet<{ iv: Uint8Array }>(db, 'messages', 'b')
    expect(Array.from(a!.iv)).not.toEqual(Array.from(b!.iv))
  })

  it('depo anahtarı çıkarılamaz (extractable:false)', async () => {
    await Vault.open('u1')
    const db = await openDb(dbNameFor('u1'))
    const key = await idbGet<CryptoKey>(db, 'meta', 'storeKey')
    expect(key!.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', key!)).rejects.toThrow()
  })

  it('anahtar yeniden açılışta korunur (aynı veri okunur)', async () => {
    const v1 = await Vault.open('u1')
    await v1.put('device', 'd', enc.encode('x'))
    v1.close()
    const v2 = await Vault.open('u1')
    expect(dec.decode((await v2.get('device', 'd'))!)).toBe('x')
  })

  it('kayıt başka bir konuma kopyalanırsa çözülmez (AAD = konum)', async () => {
    const v = await Vault.open('u1')
    await v.put('messages', 'm1', enc.encode('a'))
    const db = await openDb(dbNameFor('u1'))
    await idbPut(db, 'messages', 'm2', await idbGet(db, 'messages', 'm1'))
    await expect(v.get('messages', 'm2')).rejects.toBeInstanceOf(VaultCorruptError)
  })

  it('bozulan kayıt VaultCorruptError verir', async () => {
    const v = await Vault.open('u1')
    await v.put('groups', 'c1', enc.encode('durum'))
    const db = await openDb(dbNameFor('u1'))
    const rec = await idbGet<{ iv: Uint8Array; ct: ArrayBuffer }>(db, 'groups', 'c1')
    new Uint8Array(rec!.ct)[0] ^= 0xff
    await idbPut(db, 'groups', 'c1', rec)
    await expect(v.get('groups', 'c1')).rejects.toBeInstanceOf(VaultCorruptError)
  })

  it('kullanıcılar ayrık: B, A anahtarıyla yazılan veriyi göremez', async () => {
    const a = await Vault.open('A')
    const b = await Vault.open('B')
    await a.put('messages', 'm1', enc.encode('A nin mesaji'))
    expect(await b.get('messages', 'm1')).toBeNull()
    expect((await listE2eeDbNames()).sort()).toEqual([dbNameFor('A'), dbNameFor('B')])
  })

  it('destroy: kullanıcının veritabanını siler, yeniden açınca boş ve yeni anahtarlı', async () => {
    const v = await Vault.open('A')
    await v.put('messages', 'm1', enc.encode('x'))
    await v.destroy()
    expect(await listE2eeDbNames()).toEqual([])
    const again = await Vault.open('A')
    expect(await again.get('messages', 'm1')).toBeNull()
  })

  it('destroyAllVaults: tüm kullanıcıların depoları silinir (çıkış)', async () => {
    await Vault.open('A')
    await Vault.open('B')
    await destroyAllVaults()
    expect(await listE2eeDbNames()).toEqual([])
  })

  it('destroyOtherVaults: hesap değişiminde yalnız diğer hesapların kalıntısı silinir', async () => {
    await Vault.open('A')
    await Vault.open('B')
    await destroyOtherVaults('B')
    expect(await listE2eeDbNames()).toEqual([dbNameFor('B')])
  })

  it('resetDeviceState: cihaz+grup gider, çözülmüş mesajlar kalır', async () => {
    const v = await Vault.open('A')
    await v.put('device', 'device', enc.encode('d'))
    await v.put('groups', 'c1', enc.encode('g'))
    await v.put('messages', 'm1', enc.encode('m'))
    await v.resetDeviceState()
    expect(await v.get('device', 'device')).toBeNull()
    expect(await v.get('groups', 'c1')).toBeNull()
    expect(dec.decode((await v.get('messages', 'm1'))!)).toBe('m')
  })
})
