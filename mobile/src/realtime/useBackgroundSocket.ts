import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { connectSocket, disconnectSocket } from './socket';

// Sprint M1a contract §4.3 — (app) grubu kökünde BİR KEZ mount edilir (oturum açıkken).
// Boot: bağlan. Arka plana düşünce (AppState 'background'): pil/veri gerekçesiyle soket kapanır.
// Ön plana dönünce: yeniden bağlan — 'connect' olayı (realtime/socket.ts) açık kanalın mesajlarını
// yeniden çeker + channel:join'i tekrarlar (boşluk bırakma yasağı).
export function useBackgroundSocket(): void {
  useEffect(() => {
    connectSocket();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        disconnectSocket();
      } else if (next === 'active') {
        connectSocket();
      }
    });

    return () => {
      sub.remove();
      disconnectSocket();
    };
  }, []);
}
