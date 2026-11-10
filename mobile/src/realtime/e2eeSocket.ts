import type { Socket } from 'socket.io-client';
import { openE2eeChannel, useE2eeStore } from '@/stores/e2ee';

/**
 * E1 §2.7 — şifreleme soket olayları. Hepsi motorun sıralı kuyruğundan geçer; olay sırası korunur
 * (Welcome, mesajdan önce işlenir). Motor yoksa (E2EE kapalı) olaylar zaten gelmez, gelirse yok sayılır.
 */
export function bindE2eeSocket(socket: Socket): void {
  const log = (e: unknown) => console.error('[E2EE] olay işlenemedi', e instanceof Error ? e.name : '');

  // Yeni Welcome: gruba katıl; açık/yeni kanalın şifreli bilgisini (ayraç zamanı) tazele.
  socket.on('e2ee:welcome', () => {
    void useE2eeStore
      .getState()
      .engine?.onWelcome()
      .then((joined) => joined.forEach((id) => void openE2eeChannel(id)))
      .catch(log);
  });

  // Başka cihaz commit gönderdi ya da kanaldaki bir cihaz eklendi/iptal edildi: eksikleri işle, farkı kapat.
  const sync = ({ channelId }: { channelId: string }) => {
    void useE2eeStore.getState().engine?.onGroupChanged(channelId).catch(log);
  };
  socket.on('e2ee:commit', sync);
  socket.on('e2ee:devices-changed', sync);
}
