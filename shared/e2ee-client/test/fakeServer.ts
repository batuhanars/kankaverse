// Testler için bellekte sahte E2EE sunucusu: sözleşme §2 uçlarının kurallarını (atomik KeyPackage, epoch kapısı,
// iptal edilen cihazın 403'ü) taklit eder. Gerçek HTTP kanıtı ayrıca scripts/e2ee-e2e ile alınır.
import { createPublicKey, randomBytes, verify } from 'node:crypto'
import { rebindMessage } from '@kankaverse/e2ee-core'
import type { E2eeApi, E2eeChannelState } from '../src/ports'
import { FakeBackupStore } from './fakeBackup'
import { FakeIdentityStore } from './fakeIdentity'
import { FakeTransferStore } from './fakeTransfer'

interface Dev {
  id: string
  userId: string
  family: string
  key: string
  revokedAt: Date | null
  /** C69: çıkışta park edilmiş (family '' = hiçbir oturuma bağlı değil). */
  parked?: boolean
  kps: string[]
  lastResort?: string
}

const fail = (status: number, error: string, extra: object = {}) =>
  Object.assign(new Error(error), {
    response: { status, data: { error, ...extra } },
  })

export class FakeServer {
  devices = new Map<string, Dev>()
  members = new Map<string, string[]>()
  /** GROUP_DM (E2 §2.3): üyenin katılım zamanı (ISO) ve eski üyelerin ayrılma zamanı. Yoksa 1-1 gibi davranır. */
  joined = new Map<string, Map<string, string>>()
  former = new Map<string, Map<string, string>>()
  groups = new Map<string, { epoch: number; groupId: string; createdAt: string }>()
  /** E7 §5.4: `messagesExist(…, true)` için mesaj üst verisi (testler kaydeder; kayıtsız kimlik meta'da yok). */
  messageMeta = new Map<string, { channelId: string; createdAt: string; authorId: string }>()
  handshakes: {
    channelId: string
    epoch: number
    sender: string
    commit: string
    /** Sunucu kabul zamanı (ISO); testler geçmişe çekebilir. */
    at?: string
  }[] = []
  welcomes: {
    id: string
    channelId: string
    epoch: number
    target: string
    welcome: string
    done: boolean
  }[] = []
  /** channelState, bu kullanıcıya şu cihazları "bilmiyormuş" gibi gizler (tanınmayan cihaz testi). */
  hidden = new Map<string, Set<string>>()
  /** true ise bir sonraki commit gönderimi 409 ile reddedilir (çakışma yeniden deneme testi). */
  conflictOnce = false
  /** true ise TÜM commit gönderimleri 409 ile reddedilir (çıkarma commit'i kabul edilemiyor: gönderim kapısı testi). */
  rejectCommits = false
  /** true ise channelState 403 (C62: gruptan çıkarılmış eski üye). */
  failChannelState = false
  /** true ise commit satırlarında createdAt yok (eski sunucu). */
  legacyCommits = false
  /** `/e2ee/status.franking` (E4 §2.2): istemcinin v2 gönderip göndermeyeceği. */
  franking = false
  /** E5a yedek uçları (bayrak, anahtar kayıtları, görüntü satırları, nesne deposu). */
  backup = new FakeBackupStore()
  /** E5b aktarım: yük nesneleri yedekle aynı sahte depoda. */
  transfer = new FakeTransferStore(this.backup)
  /** E7 kimlik uçları ve sahte kimlik enjeksiyonu. */
  identity = new FakeIdentityStore(this)
  /** E5a Rev.2 §4.7 varlık kontrolü: varsayılan her mesaj var; silinmiş/olmayan kimlikler buraya. */
  goneMessages = new Set<string>()
  /** Çağıranın erişemediği kanallar (403). */
  noAccessChannels = new Set<string>()
  /** Doluysa varlık kontrolü bu hatayla düşer (ağ/5xx). */
  existsError: Error | null = null
  existsCalls: { channelId: string; count: number }[] = []
  /** C69 rebind: kullanıcı başına tek bekleyen nonce; çağrı sayaçları; doluysa ağ/5xx hatası. */
  rebindNonces = new Map<string, Uint8Array>()
  rebindCalls = { challenge: 0, rebind: 0 }
  rebindNetworkError: Error | null = null
  /** Sıradaki N rebind çağrısında nonce başka cihazca düşürülmüş gibi 400 NONCE_INVALID. */
  rebindNonceLost = 0
  private seq = 0

  revoke(deviceId: string, at: Date) {
    const d = this.devices.get(deviceId)!
    d.revokedAt = at
    d.kps = []
  }

  /** C69: çıkış (park). Cihaz iptal edilmez, oturum zincirinden ayrılır. */
  park(deviceId: string) {
    const d = this.devices.get(deviceId)!
    d.family = ''
    d.parked = true
  }

  /** Kanalı grup yapar: üyelerin katılım zamanı bildirilir (E2 §2.3). */
  /** İzin listesi dönemi: listede olmayan kullanıcılar (claim 422 E2EE_NOT_ELIGIBLE). */
  notEligible = new Set<string>()

  makeGroup(channelId: string, userIds: string[], at: string) {
    this.members.set(channelId, [...userIds])
    this.joined.set(channelId, new Map(userIds.map((u) => [u, at])))
    this.former.set(channelId, new Map())
  }

  addMember(channelId: string, userId: string, at: string) {
    this.members.get(channelId)!.push(userId)
    this.joined.get(channelId)!.set(userId, at)
    this.former.get(channelId)!.delete(userId)
  }

  /** Ayrılma/çıkarma: üyelik biter, eski üye kaydı yazılır (grupta E2eeGroup varsa; test hep yazar). */
  removeMember(channelId: string, userId: string, at: string) {
    this.members.set(channelId, this.members.get(channelId)!.filter((u) => u !== userId))
    this.joined.get(channelId)!.delete(userId)
    this.former.get(channelId)!.set(userId, at)
  }

  /** Geri alma temizliği (§6.4): kanalın grubu, commit'leri ve Welcome'ları silinir; cihazlara dokunulmaz. */
  rollback(channelId: string) {
    this.groups.delete(channelId)
    this.handshakes = this.handshakes.filter((h) => h.channelId !== channelId)
    this.welcomes = this.welcomes.filter((w) => w.channelId !== channelId)
  }

  deviceOfFamily(family: string): Dev | undefined {
    return [...this.devices.values()].find((d) => d.family === family)
  }

  apiFor(userId: string, family: string): E2eeApi {
    const active = () => {
      const d = this.deviceOfFamily(family)
      if (!d || d.revokedAt) throw fail(403, 'E2EE_DEVICE_REQUIRED')
      return d
    }
    const ok = <T>(data: T) => Promise.resolve({ data })
    const api = {
      status: () =>
        ok({
          enabled: true,
          franking: this.franking,
          backup: this.backup.enabled,
          transfer: this.transfer.enabled,
          identity: this.identity.enabled,
        }),
      registerDevice: (key: string) => {
        const existing = this.deviceOfFamily(family)
        if (existing) {
          if (existing.key !== key) throw fail(409, 'E2EE_DEVICE_KEY_MISMATCH')
          return ok({ deviceId: existing.id })
        }
        const id = `dev${++this.seq}`
        this.devices.set(id, {
          id,
          userId,
          family,
          key,
          revokedAt: null,
          kps: [],
        })
        return ok({ deviceId: id })
      },
      available: () => ok({ available: active().kps.length }),
      rebindChallenge: () => {
        this.rebindCalls.challenge++
        if (this.rebindNetworkError) throw this.rebindNetworkError
        const nonce = new Uint8Array(randomBytes(32))
        this.rebindNonces.set(userId, nonce)
        return ok({ nonce: Buffer.from(nonce).toString('base64') })
      },
      rebind: (deviceId: string, signature: string) => {
        this.rebindCalls.rebind++
        if (this.rebindNetworkError) throw this.rebindNetworkError
        const nonce = this.rebindNonceLost > 0 ? undefined : this.rebindNonces.get(userId)
        if (this.rebindNonceLost > 0) this.rebindNonceLost--
        this.rebindNonces.delete(userId) // tek deneme
        if (!nonce) throw fail(400, 'E2EE_REBIND_NONCE_INVALID')
        const d = this.devices.get(deviceId)
        if (this.deviceOfFamily(family) || !d || d.userId !== userId || d.revokedAt || !d.parked)
          throw fail(403, 'E2EE_REBIND_REJECTED')
        const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(d.key, 'base64')])
        const good = verify(
          null,
          rebindMessage(nonce, userId, deviceId),
          createPublicKey({ key: spki, format: 'der', type: 'spki' }),
          Buffer.from(signature, 'base64'),
        )
        if (!good) throw fail(403, 'E2EE_REBIND_REJECTED')
        d.family = family
        d.parked = false
        return ok({ deviceId })
      },
      uploadKeyPackages: (kps: string[], lastResort?: string) => {
        const d = active()
        d.kps.push(...kps)
        if (lastResort) d.lastResort = lastResort
        return ok({ available: d.kps.length })
      },
      channelState: (channelId: string) => {
        active()
        if (this.failChannelState) throw fail(403, 'NOT_CHANNEL_MEMBER')
        return ok(this.state(channelId, userId))
      },
      claim: (channelId: string, ids: string[]) => {
        active()
        if (ids.length > 20) throw fail(400, 'VALIDATION_ERROR') // E2EE_CLAIM_MAX_DEVICES
        if ((this.members.get(channelId) ?? []).some((u) => this.notEligible.has(u))) throw fail(422, 'E2EE_NOT_ELIGIBLE')
        const out = ids.flatMap((id) => {
          const d = this.devices.get(id)
          if (!d || d.revokedAt || !this.members.get(channelId)?.includes(d.userId)) return []
          const keyPackage = d.kps.shift() ?? d.lastResort // atomik tüketim + son çare
          return keyPackage ? [{ deviceId: id, keyPackage }] : []
        })
        return ok(out)
      },
      createGroup: (
        channelId: string,
        groupId: string,
        commit: string,
        welcomes: { deviceId: string; welcome: string }[],
      ) => {
        const me = active()
        if (welcomes.length > 20) throw fail(400, 'VALIDATION_ERROR') // E2EE_WELCOMES_PER_REQUEST
        if (this.groups.has(channelId)) throw fail(409, 'E2EE_GROUP_EXISTS')
        this.groups.set(channelId, {
          epoch: 1,
          groupId,
          createdAt: new Date().toISOString(),
        })
        this.handshakes.push({ channelId, epoch: 0, sender: me.id, commit })
        this.addWelcomes(channelId, 1, welcomes)
        return ok({ epoch: 1 })
      },
      postCommit: (
        channelId: string,
        epoch: number,
        commit: string,
        welcomes: { deviceId: string; welcome: string }[],
      ) => {
        const me = active()
        if (welcomes.length > 20) throw fail(400, 'VALIDATION_ERROR')
        const g = this.groups.get(channelId)!
        if (this.conflictOnce || this.rejectCommits) {
          this.conflictOnce = false
          throw fail(409, 'E2EE_EPOCH_CONFLICT', { currentEpoch: g.epoch })
        }
        if (g.epoch !== epoch) throw fail(409, 'E2EE_EPOCH_CONFLICT', { currentEpoch: g.epoch })
        this.handshakes.push({ channelId, epoch, sender: me.id, commit })
        g.epoch++
        this.addWelcomes(channelId, g.epoch, welcomes)
        return ok({ epoch: g.epoch })
      },
      commits: (channelId: string, since: number) => {
        active()
        const rows = this.handshakes
          .filter((h) => h.channelId === channelId && h.epoch >= since)
          .sort((a, b) => a.epoch - b.epoch)
          .map((h) => ({
            epoch: h.epoch,
            commit: h.commit,
            senderDeviceId: h.sender,
            ...(!this.legacyCommits && { createdAt: h.at ?? new Date().toISOString() }),
          }))
        return ok(rows)
      },
      welcomes: () => {
        const me = active()
        return ok(
          this.welcomes
            .filter((w) => w.target === me.id && !w.done)
            .map((w) => ({
              id: w.id,
              channelId: w.channelId,
              epoch: w.epoch,
              welcome: w.welcome,
            })),
        )
      },
      ackWelcome: (id: string) => {
        active()
        this.welcomes.find((w) => w.id === id)!.done = true
        return ok(null)
      },
      messagesExist: (channelId: string, ids: string[], meta?: boolean) => {
        this.existsCalls.push({ channelId, count: ids.length })
        if (this.existsError) throw this.existsError
        if (this.noAccessChannels.has(channelId)) throw fail(403, 'NOT_CHANNEL_MEMBER')
        const existing = ids.filter((id) => !this.goneMessages.has(id))
        if (!meta) return ok({ existing })
        // E7 §5.4: yazan + zaman sunucudaki mesajdan (bilinmeyen kimlik: kanalda yok sayılır).
        const rows = existing.flatMap((id) => {
          const m = this.messageMeta.get(id)
          if (!m || m.channelId !== channelId) return []
          return [{ id, createdAt: m.createdAt, author: { id: m.authorId, username: m.authorId, avatarUrl: null } }]
        })
        return ok({ existing: rows.map((r) => r.id), meta: rows })
      },
      ...this.backup.api(userId, () => active().id),
      ...this.transfer.api(userId, () => active().id),
      ...this.identity.api(userId),
    }
    return api as unknown as E2eeApi
  }

  private addWelcomes(
    channelId: string,
    epoch: number,
    list: { deviceId: string; welcome: string }[],
  ) {
    for (const w of list) {
      this.welcomes.push({
        id: `w${++this.seq}`,
        channelId,
        epoch,
        target: w.deviceId,
        welcome: w.welcome,
        done: false,
      })
    }
  }

  private devicesOfUser(userId: string, hide: Set<string>) {
    return [...this.devices.values()]
      .filter((d) => d.userId === userId && !hide.has(d.id))
      .map((d) => ({
        deviceId: d.id,
        signatureKey: d.key,
        revokedAt: d.revokedAt?.toISOString() ?? null,
        ...this.identity.sigView(d.id),
      }))
  }

  private state(channelId: string, viewer: string): E2eeChannelState {
    const hide = this.hidden.get(viewer) ?? new Set<string>()
    const g = this.groups.get(channelId)
    const joined = this.joined.get(channelId)
    return {
      encrypted: !!g,
      epoch: g?.epoch ?? null,
      groupId: g?.groupId ?? null,
      createdAt: g?.createdAt ?? null,
      members: (this.members.get(channelId) ?? []).map((userId) => ({
        userId,
        joinedAt: joined?.get(userId) ?? null,
        identity: this.identity.visibleIdentity(userId),
        devices: this.devicesOfUser(userId, hide),
      })),
      formerMembers: [...(this.former.get(channelId) ?? [])].map(([userId, leftAt]) => ({
        userId,
        leftAt,
        devices: this.devicesOfUser(userId, hide),
      })),
    }
  }
}
