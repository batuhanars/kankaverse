// Aktarım uçlarının (E5b §3.2) bellekte sahte sunucusu. Gerçek HTTP kanıtı api spec'lerinde; burada rol,
// durum makinesi ve taahhüt kuralı aynı. `tamper` kancaları kötü niyetli sunucuyu (araya girme) taklit eder.
import { fromBase64, toBase64, transferCommit } from '@kankaverse/e2ee-core'
import type { E2eeApi, TransferStatus, TransferView } from '../src/ports'
import type { FakeBackupStore } from './fakeBackup'

const fail = (status: number, error: string) =>
  Object.assign(new Error(error), { response: { status, data: { error } } })

interface Row {
  id: string
  userId: string
  newDeviceId: string
  oldDeviceId: string | null
  commit: string
  newPub?: string
  nonce?: string
  oldPub?: string
  objectKey?: string
  size?: number
  sha256?: string
  status: TransferStatus
}

const OPEN: TransferStatus[] = ['PENDING', 'ACCEPTED', 'REVEALED', 'UPLOADED']

export class FakeTransferStore {
  enabled = true
  rows = new Map<string, Row>()
  /** Kötü sunucu: N'ye gösterilen eski cihaz anahtarını / O'ya gösterilen yeni cihaz anahtarını değiştirir. */
  tamper: { oldPubForNew?: string; newPubForOld?: string } = {}
  private seq = 0

  private objects: FakeBackupStore

  constructor(objects: FakeBackupStore) {
    this.objects = objects
  }

  api(
    userId: string,
    activeDeviceId: () => string,
  ): Pick<
    E2eeApi,
    | 'transferCreate'
    | 'transferPending'
    | 'transferGet'
    | 'transferAccept'
    | 'transferReveal'
    | 'transferUpload'
    | 'transferCommit'
    | 'transferBlob'
    | 'transferDone'
    | 'transferCancel'
  > {
    const ok = <T>(data: T) => Promise.resolve({ data })
    const load = (id: string) => {
      const r = this.rows.get(id)
      if (!r || r.userId !== userId) throw fail(404, 'E2EE_TRANSFER_NOT_FOUND')
      if (r.status === 'EXPIRED') throw fail(410, 'E2EE_TRANSFER_EXPIRED')
      return r
    }
    const step = (r: Row, from: TransferStatus, to: TransferStatus) => {
      if (r.status !== from) throw fail(409, 'E2EE_TRANSFER_STATE')
      r.status = to
    }
    const dropObject = (r: Row) => {
      if (r.objectKey) this.objects.objects.delete(`blob://${r.objectKey}`)
    }
    return {
      transferCreate: (commit) => {
        const me = activeDeviceId()
        for (const r of this.rows.values()) {
          if (r.userId === userId && OPEN.includes(r.status)) {
            r.status = 'CANCELLED'
            dropObject(r)
          }
        }
        const id = `tr${++this.seq}`
        this.rows.set(id, { id, userId, newDeviceId: me, oldDeviceId: null, commit, status: 'PENDING' })
        return ok({ id, expiresAt: new Date(Date.now() + 600_000).toISOString() })
      },
      transferPending: () => {
        const me = activeDeviceId()
        const r = [...this.rows.values()].find((x) => x.userId === userId && x.status === 'PENDING' && x.newDeviceId !== me)
        return ok(
          r
            ? {
                id: r.id,
                newDevice: { platform: 'web', name: 'Chrome, Windows', createdAt: new Date().toISOString() },
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
              }
            : null,
        )
      },
      transferGet: (id) => {
        const me = activeDeviceId()
        const r = load(id)
        const isNew = r.newDeviceId === me
        const isOld = r.oldDeviceId === me
        if (!isNew && !isOld) throw fail(403, 'E2EE_TRANSFER_ROLE')
        const view: TransferView = {
          id: r.id,
          status: r.status,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          newDeviceId: r.newDeviceId,
          oldDeviceId: r.oldDeviceId,
          ...(isNew && r.oldPub && { oldPub: this.tamper.oldPubForNew ?? r.oldPub }),
          ...(isOld && { commit: r.commit }),
          ...(isOld && r.newPub && { newPub: this.tamper.newPubForOld ?? r.newPub, nonce: r.nonce }),
        }
        return ok(view)
      },
      transferAccept: (id, pub) => {
        const me = activeDeviceId()
        const r = load(id)
        if (r.newDeviceId === me) throw fail(403, 'E2EE_TRANSFER_ROLE')
        step(r, 'PENDING', 'ACCEPTED')
        r.oldDeviceId = me
        r.oldPub = pub
        return ok({ id, status: r.status })
      },
      transferReveal: (id, pub, nonce) => {
        const r = load(id)
        if (r.newDeviceId !== activeDeviceId()) throw fail(403, 'E2EE_TRANSFER_ROLE')
        const c = toBase64(transferCommit(fromBase64(pub)!, fromBase64(nonce)!))
        if (c !== r.commit) throw fail(400, 'E2EE_TRANSFER_COMMIT')
        step(r, 'ACCEPTED', 'REVEALED')
        r.newPub = pub
        r.nonce = nonce
        return ok({ id, status: r.status })
      },
      transferUpload: (id, blob) => {
        const r = load(id)
        if (r.oldDeviceId !== activeDeviceId()) throw fail(403, 'E2EE_TRANSFER_ROLE')
        if (r.status !== 'REVEALED') throw fail(409, 'E2EE_TRANSFER_STATE')
        if (blob.size > 25 * 1024 * 1024) throw fail(413, 'E2EE_TRANSFER_TOO_LARGE')
        return ok({ url: `blob://e2ee-transfer/${userId}/${id}` })
      },
      transferCommit: (id, blob) => {
        const r = load(id)
        if (r.oldDeviceId !== activeDeviceId()) throw fail(403, 'E2EE_TRANSFER_ROLE')
        const key = `e2ee-transfer/${userId}/${id}`
        if (this.objects.objects.get(`blob://${key}`)?.length !== blob.size) throw fail(400, 'E2EE_TRANSFER_OBJECT_MISSING')
        step(r, 'REVEALED', 'UPLOADED')
        Object.assign(r, { objectKey: key, size: blob.size, sha256: blob.sha256 })
        return ok({ id, status: r.status })
      },
      transferBlob: (id) => {
        const r = load(id)
        if (r.newDeviceId !== activeDeviceId()) throw fail(403, 'E2EE_TRANSFER_ROLE')
        if (r.status !== 'UPLOADED') throw fail(409, 'E2EE_TRANSFER_STATE')
        return ok({ url: `blob://${r.objectKey}`, size: r.size!, sha256: r.sha256! })
      },
      transferDone: (id) => {
        const r = load(id)
        if (r.newDeviceId !== activeDeviceId()) throw fail(403, 'E2EE_TRANSFER_ROLE')
        step(r, 'UPLOADED', 'DONE')
        dropObject(r)
        return ok({ id, status: r.status })
      },
      transferCancel: (id) => {
        const r = load(id)
        if (!OPEN.includes(r.status)) throw fail(409, 'E2EE_TRANSFER_STATE')
        r.status = 'CANCELLED'
        dropObject(r)
        return ok({ id, status: r.status })
      },
    }
  }
}
