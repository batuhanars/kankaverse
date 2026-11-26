import { defineStore } from 'pinia'
import { ref } from 'vue'
import { e2eeErrorTag, type DeviceNotice } from '@kankaverse/e2ee-client'
import { useE2eeStore } from '@/stores/e2ee'

/**
 * E2 §3.3 — sohbetteki "{ad} yeni bir cihaz ekledi" satırları. Satırları motor yerel depoya yazar (mesaj değil,
 * sunucuya gitmez, yedeğe girmez); burası yalnız okuyup ekrana taşır. Commit işlendikçe (soket) tazelenir.
 */
export const useE2eeNoticesStore = defineStore('e2eeNotices', () => {
  const byChannel = ref<Record<string, DeviceNotice[]>>({})

  async function load(channelId: string): Promise<void> {
    const engine = useE2eeStore().engine
    if (!engine) return
    try {
      byChannel.value[channelId] = await engine.deviceNotices(channelId)
    } catch (e) {
      console.error('[e2ee] cihaz satırları okunamadı', e2eeErrorTag(e))
    }
  }

  /** Çıkışta ya da yeni girişte (başka hesabın satırı kalmasın). */
  function clear(): void {
    byChannel.value = {}
  }

  return { byChannel, load, clear }
})
