// Şifreli yerel depo (E1 §4). MLS durumu, cihaz anahtarları ve çözülmüş mesajlar burada,
// çıkarılamaz (extractable:false) bir AES-GCM CryptoKey ile şifreli durur. Anahtar IndexedDB'de
// CryptoKey nesnesi olarak saklanır: JS onu bayt olarak okuyamaz, yalnız şifrelemek/çözmek için kullanır.
import {
  dbNameFor,
  deleteDb,
  idbClear,
  idbDelete,
  idbGet,
  idbPut,
  listE2eeDbNames,
  openDb,
  type StoreName,
} from './idb'

const KEY_SLOT = 'storeKey'
const IV_BYTES = 12

interface SealedRecord {
  iv: Uint8Array
  ct: ArrayBuffer
}

export class VaultCorruptError extends Error {}

const enc = new TextEncoder()
// AAD = kayıt konumu: şifreli kayıt başka bir kayıt yerine kopyalanırsa çözme başarısız olur.
const aadFor = (store: StoreName, key: string) => enc.encode(`${store}/${key}`)

export class Vault {
  readonly userId: string
  private db: IDBDatabase
  private cryptoKey: CryptoKey

  private constructor(userId: string, db: IDBDatabase, cryptoKey: CryptoKey) {
    this.userId = userId
    this.db = db
    this.cryptoKey = cryptoKey
  }

  static async open(userId: string): Promise<Vault> {
    const db = await openDb(dbNameFor(userId))
    let key = await idbGet<CryptoKey>(db, 'meta', KEY_SLOT)
    if (!key) {
      // extractable:false → anahtar baytları hiçbir yoldan dışarı çıkmaz (XSS bile yalnız kullanabilir).
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ])
      await idbPut(db, 'meta', KEY_SLOT, key)
    }
    return new Vault(userId, db, key)
  }

  async put(store: StoreName, key: string, bytes: Uint8Array): Promise<void> {
    // Her yazımda yeni rastgele IV: AES-GCM'de aynı anahtarla IV tekrarı yasak.
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aadFor(store, key) },
      this.cryptoKey,
      bytes as BufferSource,
    )
    await idbPut(this.db, store, key, { iv, ct } satisfies SealedRecord)
  }

  async get(store: StoreName, key: string): Promise<Uint8Array | null> {
    const rec = await idbGet<SealedRecord>(this.db, store, key)
    if (!rec) return null
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: rec.iv as BufferSource, additionalData: aadFor(store, key) },
        this.cryptoKey,
        rec.ct,
      )
      return new Uint8Array(plain)
    } catch {
      throw new VaultCorruptError(`${store}/${key} çözülemedi`)
    }
  }

  delete(store: StoreName, key: string): Promise<void> {
    return idbDelete(this.db, store, key)
  }

  /** Cihaz + grup durumunu siler, çözülmüş mesajlar kalır (oturum zinciri değişti, anahtarlar geçersiz). */
  async resetDeviceState(): Promise<void> {
    await idbClear(this.db, 'device')
    await idbClear(this.db, 'groups')
  }

  /** Bu kullanıcının tüm veritabanını siler (anahtar dahil). */
  async destroy(): Promise<void> {
    this.db.close()
    await deleteDb(dbNameFor(this.userId))
  }

  close(): void {
    this.db.close()
  }
}

/** Çıkış / yeni giriş: bu tarayıcıdaki TÜM kullanıcıların şifreli depoları silinir. */
export async function destroyAllVaults(): Promise<void> {
  for (const name of await listE2eeDbNames()) await deleteDb(name)
}

/** Hesap değişimi: yalnız `userId` dışındaki kullanıcıların kalıntıları silinir. */
export async function destroyOtherVaults(userId: string): Promise<void> {
  const keep = dbNameFor(userId)
  for (const name of await listE2eeDbNames()) if (name !== keep) await deleteDb(name)
}
