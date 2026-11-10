// Şifreli yerel depo (E1 §5): satır içerikleri AES-256-GCM ile mühürlenir (noble), her yazımda yeni
// rastgele IV, AAD = konum. Depo anahtarı 32 bayt rastgele, kullanıcı başı, Android Keystore korumalı
// `expo-secure-store`'da; satırlar SQLite'ta. Bu dosya platformdan bağımsızdır (RowStore/KeyStore enjekte)
// ki şifreleme mantığı cihazsız sınanabilsin. Web karşılığı: web/src/lib/e2ee/vault.ts (aynı ilke).
import { gcm } from '@noble/ciphers/aes.js'
import type { Vault, VaultStore } from '@kankaverse/e2ee-client'

const KEY_BYTES = 32
const IV_BYTES = 12 // AES-GCM standart nonce uzunluğu

export class VaultCorruptError extends Error {}

export interface SealedRow {
  iv: Uint8Array
  ct: Uint8Array
}

/** Düz SQLite satırları (şifreleme YOK, o SealedVault'un işi). Satırlar `userId` ile ayrılır. */
export interface RowStore {
  get(userId: string, store: string, key: string): Promise<SealedRow | null>
  put(userId: string, store: string, key: string, row: SealedRow): Promise<void>
  delete(userId: string, store: string, key: string): Promise<void>
  deleteStores(userId: string, stores: string[]): Promise<void>
  deleteUser(userId: string): Promise<void>
  /** Depoda satırı olan tüm kullanıcılar (çıkışta anahtarlarını da silebilmek için). */
  users(): Promise<string[]>
}

export interface KeyStore {
  get(userId: string): Promise<Uint8Array | null>
  set(userId: string, key: Uint8Array): Promise<void>
  delete(userId: string): Promise<void>
}

export type RandomBytes = (n: number) => Uint8Array

const enc = new TextEncoder()
// AAD = kullanıcı + konum: mühürlü satır başka bir satır (ya da kullanıcı) yerine kopyalanırsa çözme başarısız olur.
const aadFor = (userId: string, store: string, key: string) => enc.encode(`${userId}/${store}/${key}`)

export class SealedVault implements Vault {
  private constructor(
    readonly userId: string,
    private rows: RowStore,
    private keys: KeyStore,
    private key: Uint8Array,
    private random: RandomBytes,
  ) {}

  static async open(
    userId: string,
    rows: RowStore,
    keys: KeyStore,
    random: RandomBytes,
  ): Promise<SealedVault> {
    let key = await keys.get(userId)
    if (!key) {
      // Anahtar yoksa eski satırlar okunamaz (yedekten dönüş, anahtar deposu temizlendi): artık çöp, sil.
      // Sessizce okunamayan kayıtla devam etmek yerine temiz başlanır; cihaz durumu da gittiği için
      // motor (ensureDevice) bunu açık hata olarak yüzeye çıkarır.
      await rows.deleteUser(userId)
      key = random(KEY_BYTES)
      await keys.set(userId, key)
    }
    return new SealedVault(userId, rows, keys, key, random)
  }

  async put(store: VaultStore, key: string, bytes: Uint8Array): Promise<void> {
    // Her yazımda yeni rastgele IV: AES-GCM'de aynı anahtarla IV tekrarı yasak.
    const iv = this.random(IV_BYTES)
    const ct = gcm(this.key, iv, aadFor(this.userId, store, key)).encrypt(bytes)
    await this.rows.put(this.userId, store, key, { iv, ct })
  }

  async get(store: VaultStore, key: string): Promise<Uint8Array | null> {
    const row = await this.rows.get(this.userId, store, key)
    if (!row) return null
    try {
      return gcm(this.key, row.iv, aadFor(this.userId, store, key)).decrypt(row.ct)
    } catch {
      throw new VaultCorruptError(`${store}/${key} çözülemedi`)
    }
  }

  delete(store: VaultStore, key: string): Promise<void> {
    return this.rows.delete(this.userId, store, key)
  }

  /** Cihaz + grup durumunu siler, çözülmüş mesajlar kalır (oturum zinciri değişti, anahtarlar geçersiz). */
  resetDeviceState(): Promise<void> {
    return this.rows.deleteStores(this.userId, ['device', 'groups'])
  }

  /** Bu kullanıcının tüm deposunu siler: satırlar VE depo anahtarı. */
  async destroy(): Promise<void> {
    await this.rows.deleteUser(this.userId)
    await this.keys.delete(this.userId)
  }
}

async function destroyUser(rows: RowStore, keys: KeyStore, userId: string) {
  await rows.deleteUser(userId)
  await keys.delete(userId)
}

/** Çıkış / yeni giriş: bu cihazdaki TÜM kullanıcıların şifreli depoları silinir. */
export async function destroyAllVaults(rows: RowStore, keys: KeyStore): Promise<void> {
  for (const userId of await rows.users()) await destroyUser(rows, keys, userId)
}

/** Hesap değişimi: yalnız `userId` dışındaki kullanıcıların kalıntıları silinir. */
export async function destroyOtherVaults(
  userId: string,
  rows: RowStore,
  keys: KeyStore,
): Promise<void> {
  for (const other of await rows.users()) if (other !== userId) await destroyUser(rows, keys, other)
}
