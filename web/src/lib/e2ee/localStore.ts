// Tür bilen yerel depo: cihaz, grup durumları ve çözülmüş mesajlar (E1 §1.6: her mesaj bir kez çözülür).
// Tüm yazımlar Vault üzerinden şifrelidir; burada yalnız şekil ve anahtar adları var.
import {
  deserializeDevice,
  deserializeGroup,
  webProvider,
  type Device,
  type Group,
} from '@kankaverse/e2ee-core'
import { toB64 } from './b64'
import type { Vault } from './vault'

/** Çözme sonucu: ok = metin var; unsupported = bilinmeyen yük sürümü; undecryptable = çözülemedi. */
export type StoredStatus = 'ok' | 'unsupported' | 'undecryptable'

export interface StoredMessage {
  id: string
  channelId: string
  status: StoredStatus
  body: string
  /** Şifreli yükün özeti: düzenlenmiş (yeni ciphertext'li) mesaj eski kayıtla karıştırılmaz. */
  digest: string
}

interface Flags {
  lastResortUploaded: boolean
}

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Ciphertext'in kısa özeti (SHA-256 ilk 16 bayt). Gizli değil; yalnız sürüm ayırt etmek için. */
export async function digestOf(ciphertext: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', ciphertext as BufferSource)
  return toB64(new Uint8Array(hash).subarray(0, 16))
}

export class LocalStore {
  private vault: Vault

  constructor(vault: Vault) {
    this.vault = vault
  }

  async loadDevice(): Promise<Device | null> {
    const bytes = await this.vault.get('device', 'device')
    return bytes ? deserializeDevice(bytes, webProvider) : null
  }

  saveDevice(device: Device): Promise<void> {
    return this.vault.put('device', 'device', device.serialize())
  }

  async loadFlags(): Promise<Flags> {
    const bytes = await this.vault.get('device', 'flags')
    return bytes ? (JSON.parse(dec.decode(bytes)) as Flags) : { lastResortUploaded: false }
  }

  saveFlags(flags: Flags): Promise<void> {
    return this.vault.put('device', 'flags', enc.encode(JSON.stringify(flags)))
  }

  async loadGroup(channelId: string): Promise<Group | null> {
    const bytes = await this.vault.get('groups', channelId)
    return bytes ? deserializeGroup(bytes, webProvider) : null
  }

  saveGroup(channelId: string, group: Group): Promise<void> {
    return this.vault.put('groups', channelId, group.serialize())
  }

  async loadMessage(id: string): Promise<StoredMessage | null> {
    const bytes = await this.vault.get('messages', id)
    return bytes ? (JSON.parse(dec.decode(bytes)) as StoredMessage) : null
  }

  saveMessage(msg: StoredMessage): Promise<void> {
    return this.vault.put('messages', msg.id, enc.encode(JSON.stringify(msg)))
  }

  resetDeviceState(): Promise<void> {
    return this.vault.resetDeviceState()
  }
}
