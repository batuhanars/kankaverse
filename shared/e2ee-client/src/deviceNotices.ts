// E2 §3.3: "{ad} yeni bir cihaz ekledi" satırı. Başkasının commit'i, o kişinin ZATEN üye olduğu grupta yeni bir
// cihazını ekliyorsa sohbete gri bilgi satırı düşer. Kimin "yeni üye" olduğunu sunucu bildirmez; bu cihaz kendi
// gözlemini (`seen`: hangi üyeyi hangi katılım zamanıyla gruptan gördük) yerel depoda tutar.
//
// Yeni üye ⇔ (üyenin katılımı grup kurulduktan SONRA) VE (bu katılım zamanıyla daha önce yaprağını görmedik).
// - Grup kurulurken zaten kanalda olan üyenin (cihazsızken bile) her yeni cihazı satır üretir.
// - Sonradan eklenen üyenin ilk cihazları satır üretmez; sonraki cihazı (seen'de var) üretir.
// - Çıkıp yeniden eklenen üyenin katılım zamanı değişir: yeni üye sayılır, satır yok.
// - 1-1'de katılım zamanı yok: karşı tarafın her yeni cihazı satır üretir.
import type { Group } from '@kankaverse/e2ee-core'
import type { E2eeContext } from './context'
import type { DeviceNotice, SeenMembers } from './localStore'
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

/** Eklenen cihazların sahipleri (kendi hesabım ve yeni üye hariç) → cihaz sayısı. */
function noticeOwners(devices: ChannelDevices, seen: SeenMembers, added: string[], ownOwner: string | undefined) {
  const counts = new Map<string, number>()
  for (const id of added) {
    const owner = devices.owners.get(id)
    if (owner === undefined || owner === ownOwner || isNewMember(devices, seen, owner)) continue
    counts.set(owner, (counts.get(owner) ?? 0) + 1)
  }
  return counts
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
    const ownOwner = devices.owners.get(group.ownDeviceId)
    const added = leaves.filter((id) => !before.has(id))
    const notices = [...noticeOwners(devices, seen, added, ownOwner)].map(
      ([userId, count]): DeviceNotice => ({ userId, count, at }),
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
