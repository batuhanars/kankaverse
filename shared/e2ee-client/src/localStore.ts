// Tür bilen yerel depo: cihaz, grup durumları ve çözülmüş mesajlar (E1 §1.6: her mesaj bir kez çözülür).
// Tüm yazımlar Vault üzerinden şifrelidir; burada yalnız şekil ve anahtar adları var.
import {
  deserializeDevice,
  deserializeGroup,
  fromUtf8,
  sha256,
  type CryptoProvider,
  type Device,
  type Group,
  utf8,
} from '@kankaverse/e2ee-core'
import { fromB64, toB64 } from './b64'
import type { E2eeViewSnapshot, Vault } from './ports'

/**
 * Çözme sonucu: ok = metin var; unverified = v2 parmak izi tutmadı ya da yok (gövde yerelde saklanır, tag gelince yeniden doğrulanır; hiçbir yerde gösterilmez); unsupported = bilinmeyen yük sürümü; undecryptable = cihaz gruba
 * katılmadan önceki mesaj (ya da katılım zamanı bilinmiyor); failed = katılımdan sonra ama çözülemedi.
 */
export type StoredStatus = 'ok' | 'unsupported' | 'undecryptable' | 'failed' | 'unverified'

export interface StoredMessage {
  id: string
  channelId: string
  status: StoredStatus
  body: string
  /** Şifreli yükün özeti: düzenlenmiş (yeni ciphertext'li) mesaj eski kayıtla karıştırılmaz. */
  digest: string
  /** E4: v2 yükün parmak izi anahtarı (base64). Şikâyette kanıt olarak iletilir. v1'de yok. */
  fk?: string
  /** E4: yükteki gönderim zamanı (ms). Parmak izi `canon`'unda bu değer var (createdAt DEĞİL). */
  sentAt?: number
}

/** Grupta görülen üye → görüldüğü andaki katılım zamanı (ISO; 1-1'de ''). Yeniden eklenen üye farklı değer taşır. */
export type SeenMembers = Record<string, string>

/** Sohbette gri bilgi satırı: `userId` kullanıcısı bu grupta yeni bir cihaz ekledi (E2 §3.3). `at` = ms. */
export interface DeviceNotice {
  userId: string
  at: number
  /** Aynı commit'te eklenen cihaz sayısı. */
  count: number
}

export interface Flags {
  lastResortUploaded: boolean
  /** Son bilinen `/e2ee/status.franking`: ağsız motor (bildirim hızlı cevabı) hangi sürümü göndereceğini buradan bilir. */
  franking?: boolean
  /** E5a: son başarılı yedeğin zamanı (ms). */
  lastBackupAt?: number
  /** E5a: son yedekten beri mesaj eklendi/değişti/silindi. */
  backupDirty?: boolean
  /** E5a: yükleme başladı, bitmedi. Süreç yarıda ölürse (MIUI dondurma) bir sonraki açılışta baştan denenir. */
  backupInFlight?: boolean
  /**
   * E5b §4.4 (E5a Rev.3): "eski mesajlarını getir" bandı bu cihazda soruldu. Cihaz bölümünde durur: çıkışta ve
   * oturum zinciri değişince (yeni cihaz) silinir, yeni cihazda bant bir kez daha sorulur.
   */
  historyAsked?: boolean
  /** E5b §4.4: bu cihaz bu sürümle yeni kaydoldu (yerelde cihaz yoktu). Bant yalnız bunda değerlendirilir. */
  historyFresh?: boolean
}

/** Bu cihazda açılmış yedek ana anahtarı (BMK). Vault zaten şifreli; ek sarma yok. */
export interface BackupKeyRecord {
  bmk: Uint8Array
  keyVersion: number
}

const BACKUP_KEY = 'backupKey'
const BACKUP_FLAGS = ['lastBackupAt', 'backupDirty', 'backupInFlight'] as const

/** Ciphertext'in kısa özeti (SHA-256 ilk 16 bayt). Gizli değil; yalnız sürüm ayırt etmek için. */
export function digestOf(ciphertext: Uint8Array): string {
  return toB64(sha256(ciphertext).subarray(0, 16))
}

export class LocalStore {
  private vault: Vault
  private provider: CryptoProvider

  constructor(vault: Vault, provider: CryptoProvider) {
    this.vault = vault
    this.provider = provider
  }

  async loadDevice(): Promise<Device | null> {
    const bytes = await this.vault.get('device', 'device')
    return bytes ? deserializeDevice(bytes, this.provider) : null
  }

  saveDevice(device: Device): Promise<void> {
    return this.vault.put('device', 'device', device.serialize())
  }

  async loadFlags(): Promise<Flags> {
    const bytes = await this.vault.get('device', 'flags')
    return bytes ? (JSON.parse(fromUtf8(bytes)) as Flags) : { lastResortUploaded: false }
  }

  saveFlags(flags: Flags): Promise<void> {
    return this.vault.put('device', 'flags', utf8(JSON.stringify(flags)))
  }

  /** Bu cihazda yedek açık mı: `device` bölümünde `{ bmk(b64), keyVersion }`. */
  async loadBackupKey(): Promise<BackupKeyRecord | null> {
    const bytes = await this.vault.get('device', BACKUP_KEY)
    if (!bytes) return null
    const rec = JSON.parse(fromUtf8(bytes)) as { bmk: string; keyVersion: number }
    return { bmk: fromB64(rec.bmk), keyVersion: rec.keyVersion }
  }

  saveBackupKey(rec: BackupKeyRecord): Promise<void> {
    const json = JSON.stringify({ bmk: toB64(rec.bmk), keyVersion: rec.keyVersion })
    return this.vault.put('device', BACKUP_KEY, utf8(json))
  }

  deleteBackupKey(): Promise<void> {
    return this.vault.delete('device', BACKUP_KEY)
  }

  /** Bayrakların bir kısmını günceller (oku-değiştir-yaz; çağıran motor kilidindedir). */
  async patchFlags(patch: Partial<Flags>): Promise<void> {
    await this.saveFlags({ ...(await this.loadFlags()), ...patch })
  }

  /** Yedeğe girecek bir şey değişti. Zaten kirliyse yazılmaz (her mesajda ikinci yazım olmasın). */
  async markBackupDirty(): Promise<void> {
    const flags = await this.loadFlags()
    if (!flags.backupDirty) await this.saveFlags({ ...flags, backupDirty: true })
  }

  async loadGroup(channelId: string): Promise<Group | null> {
    const bytes = await this.vault.get('groups', channelId)
    return bytes ? deserializeGroup(bytes, this.provider) : null
  }

  saveGroup(channelId: string, group: Group): Promise<void> {
    return this.vault.put('groups', channelId, group.serialize())
  }

  /** Bu cihazın gruba katılma/kurma zamanı (ms, yerel saat); eski kayıtlarda yok. */
  async loadJoinedAt(channelId: string): Promise<number | null> {
    const bytes = await this.vault.get('groups', `${channelId}:joinedAt`)
    return bytes ? Number(fromUtf8(bytes)) : null
  }

  saveJoinedAt(channelId: string, at: number): Promise<void> {
    return this.vault.put('groups', `${channelId}:joinedAt`, utf8(String(at)))
  }

  /**
   * Kanalın son bilinen cihaz görünümü (kayıtlı cihazlar, imza anahtarları, iptal zamanları, eski üyeler).
   * Çevrimiçi yolda her `channelState` sonrası yazılır; ağsız (bildirim) çözme yalnız bunu kullanır (E3 §9.1).
   * Anahtar `groups` bölümünde (joinedAt gibi): cihaz durumu sıfırlanınca birlikte gider, yeni vault bölümü gerekmez.
   * E2'den önce yazılan kayıt yalnız `members` dizisidir; o da okunur.
   */
  async loadView(channelId: string): Promise<E2eeViewSnapshot | null> {
    const bytes = await this.vault.get('groups', `${channelId}:view`)
    if (!bytes) return null
    const raw = JSON.parse(fromUtf8(bytes)) as E2eeViewSnapshot['members'] | E2eeViewSnapshot
    return Array.isArray(raw) ? { members: raw, createdAt: null } : raw
  }

  saveView(channelId: string, view: E2eeViewSnapshot): Promise<void> {
    const { members, formerMembers, createdAt } = view
    return this.vault.put('groups', `${channelId}:view`, utf8(JSON.stringify({ members, formerMembers, createdAt })))
  }

  /** E2 §3.3: bu grupta gördüğümüz üyeler (üye → görüldüğü andaki katılım zamanı). Yeni üye / yeni cihaz ayrımı. */
  async loadSeen(channelId: string): Promise<SeenMembers> {
    const bytes = await this.vault.get('groups', `${channelId}:seen`)
    return bytes ? (JSON.parse(fromUtf8(bytes)) as SeenMembers) : {}
  }

  saveSeen(channelId: string, seen: SeenMembers): Promise<void> {
    return this.vault.put('groups', `${channelId}:seen`, utf8(JSON.stringify(seen)))
  }

  /** E2 §3.3 "yeni cihaz eklendi" satırları: mesaj DEĞİL, `groups` bölümünde (yedeğe girmez, sunucuya gitmez). */
  async loadNotices(channelId: string): Promise<DeviceNotice[]> {
    const bytes = await this.vault.get('groups', `${channelId}:notices`)
    return bytes ? (JSON.parse(fromUtf8(bytes)) as DeviceNotice[]) : []
  }

  saveNotices(channelId: string, notices: DeviceNotice[]): Promise<void> {
    return this.vault.put('groups', `${channelId}:notices`, utf8(JSON.stringify(notices)))
  }

  /**
   * C69: bu kullanıcının deposundaki HER şeyi (cihaz, gruplar, mesajlar, bayraklar, yedek anahtarı) siler;
   * vault açık kalır (yeniden kurulum aynı vault üzerinden). Yeniden bağlama reddedilince kullanılır.
   */
  async wipeAll(): Promise<void> {
    for (const store of ['device', 'groups', 'messages'] as const) {
      for (const key of await this.vault.keys(store)) await this.vault.delete(store, key)
    }
  }

  /** Yalnız grup durumunu düşer; çözülmüş mesaj kayıtlarına dokunmaz. */
  async deleteGroup(channelId: string): Promise<void> {
    await this.vault.delete('groups', channelId)
    await this.vault.delete('groups', `${channelId}:joinedAt`)
    await this.vault.delete('groups', `${channelId}:seen`) // bayat grubun üye geçmişi yeni gruba taşınmaz
  }

  async loadMessage(id: string): Promise<StoredMessage | null> {
    const bytes = await this.vault.get('messages', id)
    return bytes ? (JSON.parse(fromUtf8(bytes)) as StoredMessage) : null
  }

  /** Mesaj yazımı yedeği kirletir (E5a §4.3). Toplu geri yüklemede `markDirty=false`, sonunda tek işaret konur. */
  async saveMessage(msg: StoredMessage, markDirty = true): Promise<void> {
    await this.vault.put('messages', msg.id, utf8(JSON.stringify(msg)))
    if (markDirty) await this.markBackupDirty()
  }

  /**
   * Silinen mesajın yerel kaydını düşer (E5a §4.1). Kayıt varsa yedek kirlenir; görüntü kurarken tespit edilen
   * silmelerde (`markDirty=false`) görüntü zaten o kayıt çıkarılarak kurulur.
   */
  async deleteMessage(id: string, markDirty = true): Promise<void> {
    let existed = true
    try {
      existed = (await this.vault.get('messages', id)) !== null
    } catch {
      // bozuk kayıt: yine de sil, yedek yenilensin
    }
    await this.vault.delete('messages', id)
    if (existed && markDirty) await this.markBackupDirty()
  }

  messageIds(): Promise<string[]> {
    return this.vault.keys('messages')
  }

  /**
   * Oturum zinciri değişince cihaz + grup durumu gider, ama BMK ve yedek bayrakları KORUNUR: BMK kullanıcı
   * başınadır (şifre + hesap), cihaz zincirinden bağımsız geçerliliğini sürdürür. Vault yalnız `device`
   * bölümünü topluca siler; koruma burada, tek yerde.
   */
  async resetDeviceState(): Promise<void> {
    const key = await this.loadBackupKey()
    const flags = await this.loadFlags()
    await this.vault.resetDeviceState()
    if (key) await this.saveBackupKey(key)
    const kept = Object.fromEntries(BACKUP_FLAGS.flatMap((k) => (flags[k] === undefined ? [] : [[k, flags[k]]])))
    if (Object.keys(kept).length > 0) await this.saveFlags({ lastResortUploaded: false, ...kept })
  }
}
