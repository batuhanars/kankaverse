// Testler için bellekte sahte E2EE sunucusu: sözleşme §2 uçlarının kurallarını (atomik KeyPackage, epoch kapısı,
// iptal edilen cihazın 403'ü) taklit eder. Gerçek HTTP kanıtı ayrıca scripts/e2ee-e2e ile alınır.
import type { E2eeApi, E2eeChannelState } from '../src/ports'

interface Dev {
  id: string
  userId: string
  family: string
  key: string
  revokedAt: Date | null
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
  groups = new Map<string, { epoch: number; groupId: string; createdAt: string }>()
  handshakes: {
    channelId: string
    epoch: number
    sender: string
    commit: string
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
  private seq = 0

  revoke(deviceId: string, at: Date) {
    const d = this.devices.get(deviceId)!
    d.revokedAt = at
    d.kps = []
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
      status: () => ok({ enabled: true }),
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
      uploadKeyPackages: (kps: string[], lastResort?: string) => {
        const d = active()
        d.kps.push(...kps)
        if (lastResort) d.lastResort = lastResort
        return ok({ available: d.kps.length })
      },
      channelState: (channelId: string) => {
        active()
        return ok(this.state(channelId, userId))
      },
      claim: (channelId: string, ids: string[]) => {
        active()
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
        const g = this.groups.get(channelId)!
        if (this.conflictOnce) {
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

  private state(channelId: string, viewer: string): E2eeChannelState {
    const hide = this.hidden.get(viewer) ?? new Set<string>()
    const g = this.groups.get(channelId)
    return {
      encrypted: !!g,
      epoch: g?.epoch ?? null,
      groupId: g?.groupId ?? null,
      createdAt: g?.createdAt ?? null,
      members: (this.members.get(channelId) ?? []).map((userId) => ({
        userId,
        devices: [...this.devices.values()]
          .filter((d) => d.userId === userId && !hide.has(d.id))
          .map((d) => ({
            deviceId: d.id,
            signatureKey: d.key,
            revokedAt: d.revokedAt?.toISOString() ?? null,
          })),
      })),
    }
  }
}
