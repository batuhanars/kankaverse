import { ref } from 'vue'

/**
 * C49: bildirimden açılan yapay zeka video görüntüleyicisi + "diyalog açık" sayacı.
 * Modül düzeyinde tek durum: çan (host) ve masaüstü bildirimi (tıklayınca açar) aynı kaynağı paylaşır.
 * `openCount` her açık `AiVideoDialog` için artar (chat, media ya da view); sıfırdan büyükse
 * bildirim tipi AI_VIDEO_* için açılır toast gösterilmez (çan kaydı kalır).
 */
const viewId = ref<string | null>(null)
const openCount = ref(0)

export function useAiVideoViewer() {
  return {
    viewId,
    openCount,
    openView: (id: string) => {
      viewId.value = id
    },
    closeView: () => {
      viewId.value = null
    },
  }
}
