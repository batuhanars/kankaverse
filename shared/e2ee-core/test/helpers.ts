// Test yardımcıları: cihaz/grup kurulumu. Sunucu rolünü test oynar (liste, sıra, Welcome dağıtımı).
import {
  createDevice,
  createGroup,
  joinFromWelcome,
  textPayload,
  type CryptoProvider,
  type Device,
  type ExpectedDevice,
  type Group,
  type PendingCommit,
} from '../src'

export interface Peer {
  id: string
  device: Device
  group?: Group
}

export async function makePeer(provider: CryptoProvider, id: string): Promise<Peer> {
  const device = await createDevice(provider)
  device.assignDeviceId(id)
  return { id, device }
}

/** Sunucunun `members` listesi: her cihazın kayıtlı imza anahtarı. */
export const listOf = (peers: Peer[]): ExpectedDevice[] =>
  peers.map((p) => ({ deviceId: p.id, signatureKey: p.device.signaturePublicKey }))

export const groupOf = (p: Peer): Group => {
  if (!p.group) throw new Error(`${p.id} grupta değil`)
  return p.group
}

const GROUP_ID = new Uint8Array(32).fill(7)

/** creator grubu kurar, others Welcome ile katılır (sunucu kabulü simüle edilir). */
export async function setupGroup(creator: Peer, others: Peer[]): Promise<void> {
  const keyPackages: Uint8Array[] = []
  for (const o of others) keyPackages.push(...(await o.device.exportKeyPackages(1)))
  const members = listOf([creator, ...others])
  const { group, pending } = await createGroup(creator.device, { groupId: GROUP_ID, members, keyPackages })
  group.confirmCommit(pending)
  creator.group = group
  await deliverWelcomes(pending, others, members)
}

export async function deliverWelcomes(pending: PendingCommit, joiners: Peer[], members: ExpectedDevice[]) {
  for (const w of pending.welcomes) {
    const joiner = joiners.find((j) => j.id === w.deviceId)
    if (!joiner) throw new Error(`Welcome hedefi yok: ${w.deviceId}`)
    joiner.group = await joinFromWelcome(joiner.device, w.welcome, members)
  }
}

/** from gönderir, to'lar çözer; çözülen metinleri döner. */
export async function send(from: Peer, to: Peer[], body: string): Promise<string[]> {
  const { ciphertext } = await groupOf(from).encrypt(textPayload(body, 1))
  const out: string[] = []
  for (const t of to) {
    const r = await groupOf(t).decrypt(ciphertext, from.id)
    if (r.payload.kind !== 'text') throw new Error('metin değil')
    out.push(r.payload.payload.body)
  }
  return out
}

/** Sunucu kabul etti: önce committer uygular, diğerleri commit'i işler. */
export async function applyCommit(
  committer: Peer,
  pending: PendingCommit,
  others: Peer[],
  members: ExpectedDevice[],
): Promise<void> {
  groupOf(committer).confirmCommit(pending)
  for (const o of others) await groupOf(o).processCommit(pending.commit, members)
}
