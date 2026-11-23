// RowStore'un expo-sqlite gerçeklemesi + KeyStore'un expo-secure-store gerçeklemesi (E1 §5).
// İçerik burada DÜZ görünmez: satırlar SealedVault tarafından zaten mühürlenmiş gelir.
import * as SecureStore from 'expo-secure-store'
import * as SQLite from 'expo-sqlite'
import * as Crypto from 'expo-crypto'
import { fromB64, toB64 } from '@kankaverse/e2ee-client'
import {
  SealedVault,
  destroyAllVaults,
  type KeyStore,
  type RowStore,
  type SealedRow,
} from './sealedVault'

const DB_NAME = 'kv-e2ee.db'
// Tek veritabanı, `user_id` ile ayrık. Tablo adı sürümlüdür: şema değişirse yeni ad, eskisi yetim kalmaz.
const SCHEMA = `CREATE TABLE IF NOT EXISTS sealed_v1 (
  user_id TEXT NOT NULL, store TEXT NOT NULL, key TEXT NOT NULL, iv BLOB NOT NULL, ct BLOB NOT NULL,
  PRIMARY KEY (user_id, store, key)
);`

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null

function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= SQLite.openDatabaseAsync(DB_NAME).then(async (d) => {
    await d.execAsync(SCHEMA)
    return d
  })
  return dbPromise
}

const sqliteRows: RowStore = {
  async get(userId, store, key) {
    const r = await (await db()).getFirstAsync<SealedRow>(
      'SELECT iv, ct FROM sealed_v1 WHERE user_id = ? AND store = ? AND key = ?',
      [userId, store, key],
    )
    return r ? { iv: r.iv, ct: r.ct } : null
  },
  async put(userId, store, key, row) {
    await (await db()).runAsync(
      'INSERT OR REPLACE INTO sealed_v1 (user_id, store, key, iv, ct) VALUES (?, ?, ?, ?, ?)',
      [userId, store, key, row.iv, row.ct],
    )
  },
  async delete(userId, store, key) {
    await (await db()).runAsync(
      'DELETE FROM sealed_v1 WHERE user_id = ? AND store = ? AND key = ?',
      [userId, store, key],
    )
  },
  async keys(userId, store) {
    const rows = await (await db()).getAllAsync<{ key: string }>(
      'SELECT key FROM sealed_v1 WHERE user_id = ? AND store = ?',
      [userId, store],
    )
    return rows.map((r) => r.key)
  },
  async entries(userId, store) {
    return (await db()).getAllAsync<SealedRow & { key: string }>(
      'SELECT key, iv, ct FROM sealed_v1 WHERE user_id = ? AND store = ?',
      [userId, store],
    )
  },
  async deleteStores(userId, stores) {
    const d = await db()
    for (const s of stores) {
      await d.runAsync('DELETE FROM sealed_v1 WHERE user_id = ? AND store = ?', [userId, s])
    }
  },
  async deleteUser(userId) {
    await (await db()).runAsync('DELETE FROM sealed_v1 WHERE user_id = ?', [userId])
  },
  async users() {
    const rows = await (await db()).getAllAsync<{ user_id: string }>(
      'SELECT DISTINCT user_id FROM sealed_v1',
    )
    return rows.map((r) => r.user_id)
  },
}

// SecureStore anahtar adı: yalnız harf/rakam/. - _ ; kullanıcı kimliği (cuid) bunlara uyar.
const keyName = (userId: string) => `kv_e2ee_vault_key_${userId}`

const secureKeys: KeyStore = {
  async get(userId) {
    const v = await SecureStore.getItemAsync(keyName(userId))
    return v ? fromB64(v) : null
  },
  set: (userId, key) => SecureStore.setItemAsync(keyName(userId), toB64(key)),
  delete: (userId) => SecureStore.deleteItemAsync(keyName(userId)),
}

const random = (n: number) => Crypto.getRandomBytes(n)

/**
 * Bu kullanıcının deposunu açar. C69 (sahip kararı 2026-11-13): diğer hesapların depoları SİLİNMEZ; her depo kendi
 * Keystore anahtarıyla ayrı, yalnız giriş yapan hesabınki açılır. Hesap silme `wipeMobileVaults` ile hepsini siler.
 */
export async function openMobileVault(userId: string): Promise<SealedVault> {
  return SealedVault.open(userId, sqliteRows, secureKeys, random)
}


/** Hesap silme: bu cihazdaki TÜM kullanıcıların şifreli depoları silinir. */
export function wipeMobileVaults(): Promise<void> {
  return destroyAllVaults(sqliteRows, secureKeys)
}
