// Sunucunun kanal durumundan çekirdeğin beklediği cihaz listelerini türetir (E1 §3.3, E2 §3.2).
import type { ExpectedDevice } from '@kankaverse/e2ee-core'
import type { E2eeDeviceInfo, E2eeViewSnapshot } from './ports'
import { fromB64 } from './b64'

export interface ChannelDevices {
  /**
   * Doğrulama listesi: kanal üyelerinin VE eski üyelerin KAYITLI TÜM cihazları, iptal edilmişler dahil. Neden:
   * geride kalan cihaz eski commit'leri işlerken sonradan iptal edilmiş / çıkarılmış bir cihazın eklendiği
   * commit'e rastlar; yaprağı hâlâ gruptaki eski üye "tanınmayan cihaz" sahte alarmı vermemeli. Kayıtlı
   * olmayan cihaz yine reddedilir (§3.3 geçmiş commit kuralı).
   */
  registered: ExpectedDevice[]
  /** Yalnız ŞU ANKİ üyelerin etkin cihazları: gruba eklenmesi gerekenler bunlar. Eski üye ASLA burada değil. */
  active: ExpectedDevice[]
  /** İptal edilmiş cihaz kimliği → iptal zamanı (ms). */
  revokedAt: Map<string, number>
  /** Eski üyenin cihaz kimliği → üyeliğin bittiği zaman (ms). Çıkarma planı ve mesaj gizleme bunu kullanır. */
  former: Map<string, number>
  /** Cihaz kimliği → sahibi (üye ya da eski üye). "Yeni cihaz eklendi" ayrımı ve kendi cihazımın sahibi için. */
  owners: Map<string, string>
  /** Üye → katılım zamanı (ms); yalnız grupta dolu (1-1'de yok). */
  joinedAt: Map<string, number>
  /** Grubun kurulma zamanı (ms), yoksa null. */
  groupCreatedAt: number | null
}

export function devicesOf(state: E2eeViewSnapshot): ChannelDevices {
  const out: ChannelDevices = {
    registered: [],
    active: [],
    revokedAt: new Map(),
    former: new Map(),
    owners: new Map(),
    joinedAt: new Map(),
    groupCreatedAt: state.createdAt ? Date.parse(state.createdAt) : null,
  }
  for (const member of state.members) {
    if (member.joinedAt) out.joinedAt.set(member.userId, Date.parse(member.joinedAt))
    for (const d of member.devices) addDevice(out, member.userId, d, true)
  }
  const current = new Set(state.members.map((m) => m.userId))
  for (const f of state.formerMembers ?? []) {
    if (current.has(f.userId)) continue // yeniden eklenmiş üye artık üyedir (sunucu satırı siler; savunma)
    for (const d of f.devices) {
      out.former.set(d.deviceId, Date.parse(f.leftAt))
      addDevice(out, f.userId, d, false)
    }
  }
  return out
}

function addDevice(out: ChannelDevices, userId: string, d: E2eeDeviceInfo, current: boolean) {
  const device = { deviceId: d.deviceId, signatureKey: fromB64(d.signatureKey) }
  out.registered.push(device)
  out.owners.set(d.deviceId, userId)
  if (d.revokedAt) out.revokedAt.set(d.deviceId, Date.parse(d.revokedAt))
  else if (current) out.active.push(device)
}
