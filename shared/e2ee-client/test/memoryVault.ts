// Bellek içi Vault: motor testleri için (şifreleme adaptör testlerinin konusu, burada değil).
import type { Vault, VaultStore } from '../src/ports'

export class MemoryVault implements Vault {
  private rows = new Map<string, Uint8Array>()

  private k = (store: VaultStore, key: string) => `${store}/${key}`

  async get(store: VaultStore, key: string) {
    return this.rows.get(this.k(store, key)) ?? null
  }

  async put(store: VaultStore, key: string, bytes: Uint8Array) {
    this.rows.set(this.k(store, key), bytes.slice())
  }

  async delete(store: VaultStore, key: string) {
    this.rows.delete(this.k(store, key))
  }

  async keys(store: VaultStore) {
    const prefix = `${store}/`
    return [...this.rows.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
  }

  async resetDeviceState() {
    for (const k of [...this.rows.keys()]) if (!k.startsWith('messages/')) this.rows.delete(k)
  }

  async destroy() {
    this.rows.clear()
  }
}
