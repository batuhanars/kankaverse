// E2 §3.3: "{ad} yeni bir cihaz ekledi" satırı. Başkasının commit'i, o kişinin ZATEN üye olduğu grupta yeni bir
// cihazını ekliyorsa sohbete gri bilgi satırı düşer. Kimin "yeni üye" olduğunu sunucu bildirmez; bu cihaz kendi
// gözlemini (`seen`: hangi üyeyi hangi katılım zamanıyla gruptan gördük) yerel depoda tutar.
//
// Yeni üye ⇔ (üyenin katılımı grup kurulduktan SONRA) VE (bu katılım zamanıyla daha önce yaprağını görmedik).
// - Grup kurulurken zaten kanalda olan üyenin (cihazsızken bile) her yeni cihazı satır üretir.
// - Sonradan eklenen üyenin ilk cihazları satır üretmez; sonraki cihazı (seen'de var) üretir.
// - Çıkıp yeniden eklenen üyenin katılım zamanı değişir: yeni üye sayılır, satır yok.
// - 1-1'de katılım zamanı yok: karşı tarafın her yeni cihazı satır üretir.
//
// 🔴 R7 — E7 §4.2-4.3: kişinin kimliği varsa yukarıdaki kural yerine İMZA kuralı geçer:
// - Kimlik bu kanalda ilk kez görülür → sessizce sabitlenir (TOFU). Sonra değişirse → "güvenlik kodu değişti" satırı.
// - Eklenen cihaz o (sabitlenmiş) kimlikle imzalıysa satır YOK; imzasızsa ya da imza tutmuyorsa "doğrulanmamış"
//   satırı (yeni üyenin ilk cihazları dahil: sahte cihaz üye eklemesine gizlenmesin).
// - Sunucu bir kişinin kimliğini GERİ ALIRSA (null) sabitleme düşmez: cihazlar yine eski kimlikle sınanır
//   (sürüm düşürme saldırısı "yeni cihaz" satırına kaçamaz).
// Satır MLS akışını durdurmaz (kurul k.1); yalnız görünür kılar.
import { toBase64, verifyDevice, type Group, type PublicIdentity } from '@kankaverse/e2ee-core'
import { fromB64 } from './b64'
import type { E2eeContext } from './context'
import type { DeviceNotice, SeenIdentities, SeenMembers } from './localStore'
import type { ChannelDevices } from './registry'

const MAX_NOTICES = 100

/** Üyenin katılım zamanı anahtarı (seen değeri); katılım zamanı yoksa ''. */
const joinKey = (devices: ChannelDevices, userId: string): string => String(devices.joinedAt.get(userId) ?? '')

function isNewMember(devices: ChannelDevices, seen: SeenMembers, userId: string): boolean {
  const joined = devices.joinedAt.get(userId)
  const created = devices.groupCreatedAt
  const joinedAfterGroup = joined !== undefined && created !== null && joined > created
  return joinedAfterGroup && seen[userId] !== joinKey(devices, userId)
}

const identityKey = (id: PublicIdentity): string => `${toBase64(id.publicKey)}|${id.version}`

function parseIdentityKey(key: string): PublicIdentity {
  const [pub, version] = key.split('|')
  return { publicKey: fromB64(pub), version: Number(version) }
}

/** Eklenen cihaz sahibinin sabitlenmiş kimliğiyle imzalı mı. */
function signedBy(devices: ChannelDevices, identity: PublicIdentity, owner: string, deviceId: string): boolean {
  const reg = devices.registered.find((d) => d.deviceId === deviceId)
  const sig = devices.sigs.get(deviceId)
  if (!reg) return false
  return verifyDevice(identity, owner, {
    deviceId,
    signatureKey: reg.signatureKey,
    identitySig: sig?.sig ?? null,
    identityVersion: sig?.version ?? null,
  })
}

/** Eklenen cihazlardan satır üretenler: (sahip, tür) → cihaz sayısı. Kendi hesabım hiç satır üretmez. */
function noticeOwners(
  devices: ChannelDevices,
  seen: SeenMembers,
  ids: SeenIdentities,
  added: string[],
  ownOwner: string | undefined,
) {
  const counts = new Map<string, { userId: string; kind: 'new' | 'unverified'; count: number }>()
  const bump = (userId: string, kind: 'new' | 'unverified') => {
    const key = `${userId}|${kind}`
    const cur = counts.get(key) ?? { userId, kind, count: 0 }
    cur.count++
    counts.set(key, cur)
  }
  for (const id of added) {
    const owner = devices.owners.get(id)
    if (owner === undefined || owner === ownOwner) continue
    const pinned = ids[owner]
    if (pinned !== undefined) {
      if (!signedBy(devices, parseIdentityKey(pinned), owner, id)) bump(owner, 'unverified')
      continue
    }
    if (isNewMember(devices, seen, owner)) continue
    bump(owner, 'new')
  }
  return [...counts.values()]
}

/**
 * 🔴 R7 — E7 §4.2: kanalın üye kimliklerini sabitlemelerle karşılaştırır. İlk görülen kimlik sessizce sabitlenir;
 * değişen kimlik bu kanala bir "güvenlik kodu değişti" satırı yazar ve kişinin doğrulama işaretini düşürür.
 * Sunucu kimliği hiç bildirmiyorsa (null) sabitleme KORUNUR. Kendi kimliğim satır üretmez.
 */
export async function observeIdentities(
  ctx: E2eeContext,
  channelId: string,
  devices: ChannelDevices,
  ownUserId: string | undefined,
  at: number = Date.now(),
): Promise<SeenIdentities> {
  const ids = await ctx.store.loadSeenIdentities(channelId)
  const changedUsers: string[] = []
  let dirty = false
  for (const [userId, identity] of devices.identities) {
    const key = identityKey(identity)
    if (ids[userId] === key) continue
    if (ids[userId] !== undefined && userId !== ownUserId) changedUsers.push(userId)
    ids[userId] = key
    dirty = true
  }
  if (!dirty) return ids
  await ctx.store.saveSeenIdentities(channelId, ids)
  await updatePins(ctx, devices, ownUserId)
  if (changedUsers.length > 0) {
    await appendNotices(
      ctx,
      channelId,
      changedUsers.map((userId): DeviceNotice => ({ userId, count: 1, at, kind: 'identity' })),
    )
  }
  return ids
}

/** Kullanıcı düzeyindeki sabitleme: yoksa yazılır; kimlik değiştiyse güncellenir ve doğrulama işareti düşer. */
async function updatePins(ctx: E2eeContext, devices: ChannelDevices, ownUserId: string | undefined) {
  const pins = await ctx.store.loadPins()
  let dirty = false
  for (const [userId, identity] of devices.identities) {
    if (userId === ownUserId) continue
    const publicKey = toBase64(identity.publicKey)
    const pin = pins[userId]
    if (pin && pin.publicKey === publicKey && pin.version === identity.version) continue
    pins[userId] = { publicKey, version: identity.version, verified: false }
    dirty = true
  }
  if (dirty) await ctx.store.savePins(pins)
}

/**
 * Gruptaki yaprakların sahiplerini `seen`e işler. `before` verilirse (bir commit işlendi) o commit'in
 * eklediği cihazlardan satır üretir (kendi commit'imiz de: ekleyen taraf da görür). Katılma ve kurma `before`suz
 * çağırır (yalnız gözlem: ilk ağaçtaki herkes zaten oradaydı).
 */
export async function observeLeaves(
  ctx: E2eeContext,
  channelId: string,
  group: Group,
  devices: ChannelDevices,
  before?: ReadonlySet<string>,
  at: number = Date.now(),
): Promise<void> {
  const leaves = group.memberDeviceIds()
  // Pasif grupta kendi yaprağımız yok (ts-mls fırlatır); o durumda kendimi ayırt edecek bir şey de eklenmez.
  const ownOwner = group.isActive ? devices.owners.get(group.ownDeviceId) : undefined
  // Kimlikler cihaz satırından ÖNCE: eklenen cihaz güncel (sabitlenmiş) kimlikle sınanır.
  const ids = await observeIdentities(ctx, channelId, devices, ownOwner, at)
  const seen = await ctx.store.loadSeen(channelId)
  let changed = false
  const markSeen = (ids: Iterable<string>) => {
    for (const id of ids) {
      const owner = devices.owners.get(id)
      if (owner === undefined || seen[owner] === joinKey(devices, owner)) continue
      seen[owner] = joinKey(devices, owner)
      changed = true
    }
  }
  if (before) {
    // Commit'ten ÖNCE ağaçta yaprağı olan üye "yeni üye" olamaz: yaprağı zaten görüyorduk. Yoksa çıkarılıp yeniden
    // eklenen ama eski yaprağı ağaçta kalmış üyenin (çıkarma işlenmeden döndü) yeni cihazı, eski katılım zamanıyla
    // kayıtlı `seen` yüzünden "yeni üye" sayılıp satırsız kalırdı.
    markSeen(before)
    const added = leaves.filter((id) => !before.has(id))
    const notices = noticeOwners(devices, seen, ids, added, ownOwner).map(
      ({ userId, kind, count }): DeviceNotice => ({ userId, count, at, kind }),
    )
    if (notices.length > 0) await appendNotices(ctx, channelId, notices)
  }
  markSeen(leaves)
  if (changed) await ctx.store.saveSeen(channelId, seen)
}

async function appendNotices(ctx: E2eeContext, channelId: string, add: DeviceNotice[]) {
  const all = [...(await ctx.store.loadNotices(channelId)), ...add]
  await ctx.store.saveNotices(channelId, all.slice(-MAX_NOTICES))
}
