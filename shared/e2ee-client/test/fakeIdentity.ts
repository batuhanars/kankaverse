// E7 kimlik uçlarının (§3.2) bellekte sahte sunucusu. Kurallar gerçek api ile aynı: imza yalnız çağıranın kendi
// etkin cihazına, sunucu imzayı kayıtlı açık anahtarla DOĞRULAR (Node kripto), sıfırlama reauth ister.
// Saldırı simülasyonu için: `forgedIdentity` okumalarda bir kullanıcının kimliğini sahtesiyle değiştirir.
import { createPublicKey, verify } from 'node:crypto'
import { deviceSigMessage } from '@kankaverse/e2ee-core'
import type { E2eeApi, E2eeIdentityInfo, IdentityMaterial, Reauth } from '../src/ports'
import { REAUTH_PASSWORD } from './fakeBackup'
import type { FakeServer } from './fakeServer'

const fail = (status: number, error: string) =>
  Object.assign(new Error(error), { response: { status, data: { error } } })

const SPKI = Buffer.from('302a300506032b6570032100', 'hex')

function verifySig(pubB64: string, msg: Uint8Array, sigB64: string): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI, Buffer.from(pubB64, 'base64')]),
      format: 'der',
      type: 'spki',
    })
    return verify(null, msg, key, Buffer.from(sigB64, 'base64'))
  } catch {
    return false
  }
}

export class FakeIdentityStore {
  /** `/e2ee/status.identity` ve okuma alanları (gerçek sunucuda bayrak kapalıyken alanlar null).
   * Varsayılan KAPALI: E7 öncesi suitler bugünkü davranışı sınar; kimlik suiti açar. */
  enabled = false
  identities = new Map<string, E2eeIdentityInfo>()
  /** Cihaz → imza. Kimlik sıfırlanınca kullanıcının tüm satırları silinir. */
  sigs = new Map<string, { sig: string; version: number }>()
  /** Okumalarda gösterilecek sahte kimlik (null = "kimlik yok" der): kötü niyetli sunucu simülasyonu. */
  forgedIdentity = new Map<string, E2eeIdentityInfo | null>()
  calls = { create: 0, sign: 0, putBackup: 0 }

  private server: FakeServer

  constructor(server: FakeServer) {
    this.server = server
  }

  visibleIdentity(userId: string): E2eeIdentityInfo | null {
    if (!this.enabled) return null
    if (this.forgedIdentity.has(userId)) return this.forgedIdentity.get(userId) ?? null
    return this.identities.get(userId) ?? null
  }

  sigView(deviceId: string): { identitySig: string | null; identityVersion: number | null } {
    const s = this.enabled ? this.sigs.get(deviceId) : undefined
    return { identitySig: s?.sig ?? null, identityVersion: s?.version ?? null }
  }

  private apply(userId: string, info: E2eeIdentityInfo, signatures: IdentityMaterial['signatures']) {
    for (const { deviceId, sig } of signatures) {
      const d = this.server.devices.get(deviceId)
      if (!d || d.userId !== userId || d.revokedAt) throw fail(403, 'E2EE_DEVICE_REQUIRED')
      const msg = deviceSigMessage(userId, info.version, deviceId, Buffer.from(d.key, 'base64'))
      if (!verifySig(info.publicKey, msg, sig)) throw fail(400, 'E2EE_IDENTITY_SIG_INVALID')
    }
    for (const { deviceId, sig } of signatures) this.sigs.set(deviceId, { sig, version: info.version })
  }

  api(
    userId: string,
  ): Pick<E2eeApi, 'userDevices' | 'identityCreate' | 'identityReset' | 'signDevice' | 'backupPutIdentity'> {
    const ok = <T>(data: T) => Promise.resolve({ data })
    const gate = () => {
      if (!this.enabled) throw fail(404, 'E2EE_DISABLED')
    }
    return {
      userDevices: (target: string) =>
        ok({
          identity: this.visibleIdentity(target),
          devices: [...this.server.devices.values()]
            .filter((d) => d.userId === target && !d.revokedAt)
            .map((d) => ({
              deviceId: d.id,
              platform: 'web',
              signatureKey: d.key,
              createdAt: new Date(0).toISOString(),
              ...this.sigView(d.id),
            })),
        }),
      identityCreate: (body: IdentityMaterial) => {
        gate()
        this.calls.create++
        if (this.identities.has(userId)) throw fail(409, 'E2EE_IDENTITY_EXISTS')
        const info = { publicKey: body.publicKey, version: 1 }
        this.apply(userId, info, body.signatures)
        this.identities.set(userId, info)
        return ok({ version: 1 })
      },
      identityReset: (body: IdentityMaterial & Reauth) => {
        gate()
        if (body.currentPassword !== REAUTH_PASSWORD) throw fail(401, 'UNAUTHORIZED')
        const cur = this.identities.get(userId)
        if (!cur) throw fail(404, 'E2EE_IDENTITY_NOT_FOUND')
        const info = { publicKey: body.publicKey, version: cur.version + 1 }
        for (const d of this.server.devices.values()) if (d.userId === userId) this.sigs.delete(d.id)
        this.apply(userId, info, body.signatures)
        this.identities.set(userId, info)
        const key = this.server.backup.keys.get(userId)
        if (key) this.server.backup.keys.set(userId, { ...key, wrappedIdentity: null, identityVersion: null })
        return ok({ version: info.version })
      },
      signDevice: (deviceId: string, body: { identityVersion: number; sig: string }) => {
        gate()
        this.calls.sign++
        const cur = this.identities.get(userId)
        if (!cur) throw fail(404, 'E2EE_IDENTITY_NOT_FOUND')
        if (body.identityVersion !== cur.version) throw fail(409, 'E2EE_IDENTITY_VERSION')
        this.apply(userId, cur, [{ deviceId, sig: body.sig }])
        return ok(null)
      },
      backupPutIdentity: (body: { wrappedIdentity: string; identityVersion: number; keyVersion: number }) => {
        gate()
        this.calls.putBackup++
        const key = this.server.backup.keys.get(userId)
        if (!key) throw fail(404, 'E2EE_BACKUP_NOT_CONFIGURED')
        if (key.keyVersion !== body.keyVersion) throw fail(409, 'E2EE_BACKUP_KEY_VERSION')
        if (this.identities.get(userId)?.version !== body.identityVersion) throw fail(409, 'E2EE_IDENTITY_VERSION')
        this.server.backup.keys.set(userId, {
          ...key,
          wrappedIdentity: body.wrappedIdentity,
          identityVersion: body.identityVersion,
        })
        return ok(null)
      },
    }
  }
}
