import type { Socket } from 'socket.io-client'
import { useE2eeStore } from '@/stores/e2ee'

/**
 * E1 §2.7 — şifreleme soket olayları. Hepsi motorun sıralı kuyruğundan geçer; olay sırası korunur
 * (Welcome, mesajdan önce işlenir). Motor yoksa (E2EE kapalı) olaylar zaten gelmez, gelirse yok sayılır.
 */
export function bindE2eeSocket(socket: Socket): void {
  const store = useE2eeStore()
  const log = (e: unknown) => console.error('[e2ee] olay işlenemedi', e)

  // Yeni Welcome: gruba katıl; açık/yeni kanalın şifreli bilgisini (ayraç zamanı) tazele.
  socket.on('e2ee:welcome', () => {
    void store.engine
      ?.onWelcome()
      .then((joined) => joined.forEach((id) => void store.openChannel(id)))
      .catch(log)
  })

  // Başka cihaz commit gönderdi ya da kanaldaki bir cihaz eklendi/iptal edildi: eksikleri işle, farkı kapat.
  const sync = ({ channelId }: { channelId: string }) => {
    void store.engine?.onGroupChanged(channelId).catch(log)
  }
  socket.on('e2ee:commit', sync)
  socket.on('e2ee:devices-changed', sync)
}
