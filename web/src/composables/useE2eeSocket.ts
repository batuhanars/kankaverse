import type { Socket } from 'socket.io-client'
import { e2eeErrorTag } from '@kankaverse/e2ee-client'
import { useE2eeStore } from '@/stores/e2ee'
import { useE2eeNoticesStore } from '@/stores/e2eeNotices'
import { useE2eeTransferStore } from '@/stores/e2eeTransfer'
import { useVoiceStore } from '@/stores/voice'

/**
 * E1 §2.7 — şifreleme soket olayları. Hepsi motorun sıralı kuyruğundan geçer; olay sırası korunur
 * (Welcome, mesajdan önce işlenir). Motor yoksa (E2EE kapalı) olaylar zaten gelmez, gelirse yok sayılır.
 */
export function bindE2eeSocket(socket: Socket): void {
  const store = useE2eeStore()
  const voice = useVoiceStore()
  const log = (e: unknown) => console.error('[e2ee] olay işlenemedi', e2eeErrorTag(e))

  // Yeni Welcome: gruba katıl; açık/yeni kanalın şifreli bilgisini (ayraç zamanı) tazele.
  socket.on('e2ee:welcome', () => {
    void store.engine
      ?.onWelcome()
      .then((joined) =>
        joined.forEach((id) => {
          void store.openChannel(id)
          voice.refreshCallKey(id) // E8 §4.2: aramadayken gruba (yeniden) katıldık
        }),
      )
      .catch(log)
  })

  // Başka cihaz commit gönderdi ya da kanaldaki bir cihaz eklendi/iptal edildi: eksikleri işle, farkı kapat.
  // İşlenen commit "yeni cihaz eklendi" satırı üretmiş olabilir (E2 §3.3): satırlar tazelenir.
  const notices = useE2eeNoticesStore()
  const sync = ({ channelId }: { channelId: string }) => {
    void store.engine
      ?.onGroupChanged(channelId)
      .then(() => {
        voice.refreshCallKey(channelId) // E8 §4.2: epoch ilerlediyse açık aramanın anahtarı yenilenir
        return notices.load(channelId)
      })
      .catch(log)
  }
  socket.on('e2ee:commit', sync)
  socket.on('e2ee:devices-changed', sync)

  // E5b aktarım: olaylar yalnız kimlik taşır, malzeme HTTP ile çekilir. Kaçan olayı yoklama yakalar.
  const transfer = useE2eeTransferStore()
  socket.on('e2ee:transfer-requested', () => void transfer.checkPending())
  socket.on('e2ee:transfer-accepted', ({ id }: { id: string }) => void transfer.onAccepted(id))
  socket.on('e2ee:transfer-revealed', ({ id }: { id: string }) => void transfer.onRevealed(id))
  socket.on('e2ee:transfer-ready', ({ id }: { id: string }) => void transfer.onReady(id))
  socket.on('e2ee:transfer-closed', ({ id, status }: { id: string; status: string }) =>
    transfer.onClosed(id, status),
  )
}
