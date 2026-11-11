// Yedek uçlarının (E5a §3.2) bellekte sahte sunucusu ve sahte nesne deposu. Gerçek HTTP kanıtı api spec'lerinde.
import { sha256, utf8, type Argon2idFn } from '@kankaverse/e2ee-core'
import type { BackupInfo, BackupKeyMaterial, BlobTransport, E2eeApi, Reauth, SnapshotRef } from '../src/ports'
import type { FakeServer } from './fakeServer'

const MAX_BYTES = 25 * 1024 * 1024
const MAX_SNAPSHOTS = 5
export const REAUTH_PASSWORD = 'hesap-sifresi'

const fail = (status: number, error: string) =>
  Object.assign(new Error(error), { response: { status, data: { error } } })

interface KeyRow extends BackupKeyMaterial {
  keyVersion: number
}
interface SnapRow {
  deviceId: string
  keyVersion: number
  objectKey: string
  size: number
  sha256: string
  updatedAt: number
}

/** Hızlı sahte Argon2id: akış testi için (gerçek vektörler core'da). Parametre ve tuzu girdiye katar. */
export const fastArgon2: Argon2idFn = async (password, salt, { m, t, p }) =>
  sha256(new Uint8Array([...password, ...salt, ...utf8(`${m}:${t}:${p}`)]))

export class FakeBackupStore {
  enabled = true
  keys = new Map<string, KeyRow>()
  snaps = new Map<string, Map<string, SnapRow>>() // userId -> deviceId -> satır
  objects = new Map<string, Uint8Array>()
  puts = 0
  private clock = 1

  snapsOf(userId: string): Map<string, SnapRow> {
    if (!this.snaps.has(userId)) this.snaps.set(userId, new Map())
    return this.snaps.get(userId)!
  }

  /** Sahte nesne deposuna erişim: adres `blob://<anahtar>`. */
  readonly blob: BlobTransport = {
    put: async (url, bytes) => {
      this.puts++
      this.objects.set(url, bytes.slice())
    },
    get: async (url) => {
      const bytes = this.objects.get(url)
      if (!bytes) throw new Error('nesne yok')
      return bytes.slice()
    },
  }

  private dropAll(userId: string) {
    for (const s of this.snapsOf(userId).values()) this.objects.delete(`blob://${s.objectKey}`)
    this.snaps.delete(userId)
  }

  private reauth(r: Reauth) {
    if (r.currentPassword !== REAUTH_PASSWORD) throw fail(401, 'UNAUTHORIZED')
  }

  api(userId: string, activeDeviceId: () => string): Pick<
    E2eeApi,
    'backupGet' | 'backupPutKey' | 'backupReset' | 'backupDelete' | 'snapshotPresign' | 'snapshotCommit' | 'snapshotGetUrl'
  > {
    const ok = <T>(data: T) => Promise.resolve({ data })
    const keyOf = () => this.keys.get(userId) ?? null
    const checkRef = (ref: SnapshotRef) => {
      const key = keyOf()
      if (!key) throw fail(404, 'E2EE_BACKUP_NOT_CONFIGURED')
      if (ref.deviceId !== activeDeviceId()) throw fail(403, 'E2EE_DEVICE_REQUIRED')
      if (ref.keyVersion !== key.keyVersion) throw fail(409, 'E2EE_BACKUP_KEY_VERSION')
      if (ref.size > MAX_BYTES) throw fail(413, 'E2EE_BACKUP_TOO_LARGE')
      return `e2ee-backup/${userId}/${ref.deviceId}/${ref.sha256}`
    }
    return {
      backupGet: () => {
        const snapshots = [...this.snapsOf(userId).values()].map((s) => ({
          deviceId: s.deviceId,
          size: s.size,
          updatedAt: new Date(s.updatedAt).toISOString(),
        }))
        const key = keyOf()
        const info: BackupInfo = key ? { configured: true, ...key, snapshots } : { configured: false, snapshots }
        return ok(info)
      },
      backupPutKey: (body) => {
        const { keyVersion, ...material } = body
        const cur = keyOf()
        if (!cur && keyVersion !== 1) throw fail(409, 'E2EE_BACKUP_KEY_VERSION')
        if (cur && cur.keyVersion !== keyVersion) throw fail(409, 'E2EE_BACKUP_KEY_VERSION')
        this.keys.set(userId, { ...material, keyVersion })
        return ok({ keyVersion })
      },
      backupReset: (body) => {
        this.reauth(body)
        const cur = keyOf()
        if (!cur) throw fail(404, 'E2EE_BACKUP_NOT_CONFIGURED')
        const { currentPassword: _p, totpCode: _t, ...material } = body
        this.keys.set(userId, { ...material, keyVersion: cur.keyVersion + 1 })
        this.dropAll(userId)
        return ok({ keyVersion: cur.keyVersion + 1 })
      },
      backupDelete: (reauth) => {
        this.reauth(reauth)
        this.dropAll(userId)
        this.keys.delete(userId)
        return ok(null)
      },
      snapshotPresign: (ref) => {
        checkRef(ref)
        return ok({ url: `blob://e2ee-backup/${userId}/${ref.deviceId}/${ref.sha256}` })
      },
      snapshotCommit: (ref) => {
        const objectKey = checkRef(ref)
        if (this.objects.get(`blob://${objectKey}`)?.length !== ref.size) throw fail(400, 'E2EE_BACKUP_OBJECT_MISSING')
        const rows = this.snapsOf(userId)
        const prev = rows.get(ref.deviceId)
        if (prev && prev.objectKey !== objectKey) this.objects.delete(`blob://${prev.objectKey}`)
        rows.set(ref.deviceId, { ...ref, objectKey, updatedAt: ++this.clock })
        while (rows.size > MAX_SNAPSHOTS) {
          const oldest = [...rows.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0]
          rows.delete(oldest.deviceId)
          this.objects.delete(`blob://${oldest.objectKey}`)
        }
        return ok({ deviceId: ref.deviceId, size: ref.size, keyVersion: ref.keyVersion })
      },
      snapshotGetUrl: (deviceId) => {
        const row = this.snapsOf(userId).get(deviceId)
        if (!row) throw fail(404, 'E2EE_BACKUP_SNAPSHOT_NOT_FOUND')
        return ok({ url: `blob://${row.objectKey}`, deviceId, size: row.size, sha256: row.sha256, keyVersion: row.keyVersion })
      },
    }
  }
}

/** Motor bağımlılıklarının yedekle ilgili kısmı: hızlı sahte Argon2 + sahte nesne deposu. */
export const backupDeps = (server: FakeServer) => ({ argon2: fastArgon2, blob: server.backup.blob })
