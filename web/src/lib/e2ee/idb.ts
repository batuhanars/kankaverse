// Minimal IndexedDB sarmalayıcı (promise). Şifreleme burada YOK: o vault.ts'in işi.
// Kullanıcı başına ayrı veritabanı: aynı tarayıcıda farklı hesap girse veri karışmaz (E1 §4).

export const DB_PREFIX = 'kv-e2ee:'
export const STORES = ['meta', 'device', 'groups', 'messages'] as const
export type StoreName = (typeof STORES)[number]

export const dbNameFor = (userId: string): string => `${DB_PREFIX}${userId}`

const toError = (e: DOMException | null): Error => e ?? new Error('IndexedDB hatası')

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(toError(req.error))
  })

export function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      for (const s of STORES) req.result.createObjectStore(s)
    }
    req.onerror = () => reject(toError(req.error))
    req.onsuccess = () => {
      const db = req.result
      // Başka sekme depoyu silmek isterse (çıkış/hesap değişimi) bağlantıyı bırak, silme bloklanmasın.
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

export const idbGet = <T>(db: IDBDatabase, store: StoreName, key: string): Promise<T | undefined> =>
  wrap(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>)

export const idbPut = async (db: IDBDatabase, store: StoreName, key: string, value: unknown) => {
  await wrap(db.transaction(store, 'readwrite').objectStore(store).put(value, key))
}

export const idbDelete = async (db: IDBDatabase, store: StoreName, key: string) => {
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key))
}

/** Bölümdeki tüm anahtarlar (kayıt anahtarları hep metin). */
export const idbKeys = async (db: IDBDatabase, store: StoreName): Promise<string[]> =>
  (await wrap(db.transaction(store).objectStore(store).getAllKeys())).map(String)

export const idbClear = async (db: IDBDatabase, store: StoreName) => {
  await wrap(db.transaction(store, 'readwrite').objectStore(store).clear())
}

export function deleteDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(toError(req.error))
    req.onblocked = () => resolve() // eski bağlantı versionchange ile kapanır; silme arkada biter
  })
}

/** Bu tarayıcıda bizim adımızla başlayan tüm veritabanları (indexedDB.databases() yoksa boş). */
export async function listE2eeDbNames(): Promise<string[]> {
  const list = (await indexedDB.databases?.()) ?? []
  return list.map((d) => d.name ?? '').filter((n) => n.startsWith(DB_PREFIX))
}
