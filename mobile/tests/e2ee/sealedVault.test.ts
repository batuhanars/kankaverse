import { beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  SealedVault,
  VaultCorruptError,
  destroyAllVaults,
  destroyOtherVaults,
  type KeyStore,
  type RowStore,
  type SealedRow,
} from '../../src/e2ee/sealedVault';

// Bellek içi RowStore/KeyStore: SQLite ve SecureStore yerine; şifreleme mantığı aynı SealedVault.
class MemRows implements RowStore {
  rows = new Map<string, SealedRow>();
  private k = (u: string, s: string, key: string) => `${u}\u0000${s}\u0000${key}`;
  async get(u: string, s: string, key: string) {
    return this.rows.get(this.k(u, s, key)) ?? null;
  }
  async put(u: string, s: string, key: string, row: SealedRow) {
    this.rows.set(this.k(u, s, key), { iv: row.iv.slice(), ct: row.ct.slice() });
  }
  async delete(u: string, s: string, key: string) {
    this.rows.delete(this.k(u, s, key));
  }
  async deleteStores(u: string, stores: string[]) {
    for (const k of [...this.rows.keys()]) {
      const [ku, ks] = k.split('\u0000');
      if (ku === u && stores.includes(ks)) this.rows.delete(k);
    }
  }
  async deleteUser(u: string) {
    for (const k of [...this.rows.keys()]) if (k.split('\u0000')[0] === u) this.rows.delete(k);
  }
  async users() {
    return [...new Set([...this.rows.keys()].map((k) => k.split('\u0000')[0]))];
  }
}

class MemKeys implements KeyStore {
  keys = new Map<string, Uint8Array>();
  async get(u: string) {
    return this.keys.get(u) ?? null;
  }
  async set(u: string, key: Uint8Array) {
    this.keys.set(u, key);
  }
  async delete(u: string) {
    this.keys.delete(u);
  }
}

const rand = (n: number) => new Uint8Array(randomBytes(n));
const enc = new TextEncoder();
const dec = new TextDecoder();

let rows: MemRows;
let keys: MemKeys;
const open = (u: string) => SealedVault.open(u, rows, keys, rand);

beforeEach(() => {
  rows = new MemRows();
  keys = new MemKeys();
});

describe('SealedVault', () => {
  it('yazılan veri geri okunur', async () => {
    const v = await open('A');
    await v.put('messages', 'm1', enc.encode('merhaba çğıöşü'));
    expect(dec.decode((await v.get('messages', 'm1'))!)).toBe('merhaba çğıöşü');
    expect(await v.get('messages', 'yok')).toBeNull();
  });

  it('diskteki satır düz metin içermez (şifreli)', async () => {
    const v = await open('A');
    await v.put('messages', 'm1', enc.encode('GIZLI-METIN-123'));
    const [row] = [...rows.rows.values()];
    expect(dec.decode(row.ct)).not.toContain('GIZLI-METIN-123');
    expect(Buffer.from(row.ct).includes(Buffer.from('GIZLI-METIN-123'))).toBe(false);
  });

  it('her yazımda farklı IV kullanır (aynı veri, farklı şifreli çıktı)', async () => {
    const v = await open('A');
    await v.put('messages', 'a', enc.encode('ayni'));
    await v.put('messages', 'b', enc.encode('ayni'));
    const [a, b] = [...rows.rows.values()];
    expect(Buffer.from(a.iv).equals(Buffer.from(b.iv))).toBe(false);
    expect(Buffer.from(a.ct).equals(Buffer.from(b.ct))).toBe(false);
  });

  it('depo anahtarı 32 bayt rastgele ve yeniden açılışta korunur', async () => {
    const v = await open('A');
    await v.put('device', 'device', enc.encode('x'));
    expect(keys.keys.get('A')).toHaveLength(32);
    const again = await open('A');
    expect(dec.decode((await again.get('device', 'device'))!)).toBe('x');
  });

  it('satır başka bir konuma kopyalanırsa çözülmez (AAD = konum)', async () => {
    const v = await open('A');
    await v.put('messages', 'm1', enc.encode('sir'));
    const [row] = [...rows.rows.values()];
    await rows.put('A', 'messages', 'm2', row);
    await expect(v.get('messages', 'm2')).rejects.toBeInstanceOf(VaultCorruptError);
  });

  it('bozulan satır VaultCorruptError verir', async () => {
    const v = await open('A');
    await v.put('groups', 'g', enc.encode('durum'));
    const [row] = [...rows.rows.values()];
    row.ct[0] ^= 0xff;
    await expect(v.get('groups', 'g')).rejects.toBeInstanceOf(VaultCorruptError);
  });

  it('kullanıcılar ayrık: B, A anahtarıyla yazılan satırı okuyamaz', async () => {
    const a = await open('A');
    await a.put('messages', 'm1', enc.encode('A nin'));
    const b = await open('B');
    expect(await b.get('messages', 'm1')).toBeNull();
    const [row] = [...rows.rows.values()];
    await rows.put('B', 'messages', 'm1', row); // A'nın satırı B'nin konumuna taşınsa da
    await expect(b.get('messages', 'm1')).rejects.toBeInstanceOf(VaultCorruptError);
  });

  it('destroy: satırlar VE depo anahtarı silinir, yeniden açınca boş ve yeni anahtarlı', async () => {
    const v = await open('A');
    await v.put('messages', 'm1', enc.encode('x'));
    const oldKey = keys.keys.get('A')!;
    await v.destroy();
    expect(rows.rows.size).toBe(0);
    expect(keys.keys.has('A')).toBe(false);
    const fresh = await open('A');
    expect(await fresh.get('messages', 'm1')).toBeNull();
    expect(Buffer.from(keys.keys.get('A')!).equals(Buffer.from(oldKey))).toBe(false);
  });

  it('anahtar yokken eski satırlar silinir (okunamaz çöp, sessizce devam yok)', async () => {
    const v = await open('A');
    await v.put('messages', 'm1', enc.encode('x'));
    keys.keys.delete('A'); // ör. anahtar deposu temizlendi
    const fresh = await open('A');
    expect(rows.rows.size).toBe(0);
    expect(await fresh.get('messages', 'm1')).toBeNull();
  });

  it('resetDeviceState: cihaz+grup gider, çözülmüş mesajlar kalır', async () => {
    const v = await open('A');
    await v.put('device', 'device', enc.encode('d'));
    await v.put('groups', 'g', enc.encode('g'));
    await v.put('messages', 'm', enc.encode('m'));
    await v.resetDeviceState();
    expect(await v.get('device', 'device')).toBeNull();
    expect(await v.get('groups', 'g')).toBeNull();
    expect(dec.decode((await v.get('messages', 'm'))!)).toBe('m');
  });

  it('destroyAllVaults (çıkış): tüm kullanıcıların satırları ve anahtarları silinir', async () => {
    for (const u of ['A', 'B']) await (await open(u)).put('messages', 'm', enc.encode(u));
    await destroyAllVaults(rows, keys);
    expect(rows.rows.size).toBe(0);
    expect(keys.keys.size).toBe(0);
  });

  it('destroyOtherVaults (hesap değişimi): yalnız diğer hesapların kalıntısı silinir', async () => {
    for (const u of ['A', 'B']) await (await open(u)).put('messages', 'm', enc.encode(u));
    await destroyOtherVaults('A', rows, keys);
    expect(await rows.users()).toEqual(['A']);
    expect([...keys.keys.keys()]).toEqual(['A']);
  });
});
