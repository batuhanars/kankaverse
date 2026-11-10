// Sunucunun kanal durumundan çekirdeğin beklediği cihaz listelerini türetir (E1 §3.3).
import type { ExpectedDevice } from '@kankaverse/e2ee-core'
import type { E2eeChannelState } from '@/api/e2ee'
import { fromB64 } from './b64'

export interface ChannelDevices {
  /**
   * Doğrulama listesi: kanal üyelerinin KAYITLI TÜM cihazları, iptal edilmişler dahil. Neden dahil:
   * geride kalan cihaz eski commit'leri işlerken sonradan iptal edilmiş bir cihazın eklendiği commit'e
   * rastlar; kayıtlı olmayan cihaz yine reddedilir (§3.3 geçmiş commit kuralı).
   */
  registered: ExpectedDevice[]
  /** Yalnız etkin cihazlar: gruba eklenmesi gerekenler bunlar. */
  active: ExpectedDevice[]
  /** İptal edilmiş cihaz kimliği → iptal zamanı (ms). */
  revokedAt: Map<string, number>
}

export function devicesOf(state: E2eeChannelState): ChannelDevices {
  const registered: ExpectedDevice[] = []
  const active: ExpectedDevice[] = []
  const revokedAt = new Map<string, number>()
  for (const member of state.members) {
    for (const d of member.devices) {
      const device = { deviceId: d.deviceId, signatureKey: fromB64(d.signatureKey) }
      registered.push(device)
      if (d.revokedAt) revokedAt.set(d.deviceId, Date.parse(d.revokedAt))
      else active.push(device)
    }
  }
  return { registered, active, revokedAt }
}
