import type { Socket } from 'socket.io-client';
import { loadDeviceNotices } from '@/stores/e2eeNotices';
import { openE2eeChannel, useE2eeStore } from '@/stores/e2ee';
import { refreshCallKey } from '@/stores/voice';
import {
  checkPendingTransfer,
  onTransferAccepted,
  onTransferClosed,
  onTransferReady,
  onTransferRevealed,
} from '@/stores/e2eeTransfer';

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
      .then((joined) =>
        joined.forEach((id) => {
          void openE2eeChannel(id);
          refreshCallKey(id); // E8 §4.2: aramadayken gruba (yeniden) katıldık
        }),
      )
      .catch(log);
  });

  // Başka cihaz commit gönderdi ya da kanaldaki bir cihaz eklendi/iptal edildi: eksikleri işle, farkı kapat.
  const sync = ({ channelId }: { channelId: string }) => {
    // İşlenen commit "yeni cihaz eklendi" satırı üretmiş olabilir (E2 §3.3): satırlar tazelenir.
    void useE2eeStore
      .getState()
      .engine?.onGroupChanged(channelId)
      .then(() => {
        refreshCallKey(channelId); // E8 §4.2: epoch ilerlediyse açık aramanın anahtarı yenilenir
        return loadDeviceNotices(channelId);
      })
      .catch(log);
  };
  socket.on('e2ee:commit', sync);
  socket.on('e2ee:devices-changed', sync);

  // E5b aktarım: olaylar yalnız kimlik taşır, malzeme HTTP ile çekilir. Kaçan olayı yoklama yakalar.
  socket.on('e2ee:transfer-requested', () => void checkPendingTransfer());
  socket.on('e2ee:transfer-accepted', ({ id }: { id: string }) => void onTransferAccepted(id));
  socket.on('e2ee:transfer-revealed', ({ id }: { id: string }) => void onTransferRevealed(id));
  socket.on('e2ee:transfer-ready', ({ id }: { id: string }) => void onTransferReady(id));
  socket.on('e2ee:transfer-closed', ({ id, status }: { id: string; status: string }) =>
    onTransferClosed(id, status),
  );
}
