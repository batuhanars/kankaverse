import { create } from 'zustand';
import type { DeviceNotice } from '@kankaverse/e2ee-client';
import { useE2eeStore } from '@/stores/e2ee';

/**
 * E2 §3.3 — sohbetteki "{ad} yeni bir cihaz ekledi" satırları (web `stores/e2eeNotices.ts` karşılığı). Satırları
 * motor yerel depoya yazar (mesaj değil, sunucuya gitmez, yedeğe girmez); burası yalnız okuyup ekrana taşır.
 */
interface NoticesState {
  byChannel: Record<string, DeviceNotice[]>;
}

export const useE2eeNoticesStore = create<NoticesState>(() => ({ byChannel: {} }));

export async function loadDeviceNotices(channelId: string): Promise<void> {
  const engine = useE2eeStore.getState().engine;
  if (!engine) return;
  try {
    const list = await engine.deviceNotices(channelId);
    useE2eeNoticesStore.setState((s) => ({ byChannel: { ...s.byChannel, [channelId]: list } }));
  } catch (e) {
    console.error('[E2EE] cihaz satırları okunamadı', e instanceof Error ? e.name : '');
  }
}

/** Çıkışta ya da yeni girişte (başka hesabın satırı kalmasın). */
export function clearDeviceNotices(): void {
  useE2eeNoticesStore.setState({ byChannel: {} });
}
