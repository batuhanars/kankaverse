import { ref } from 'vue'
import { aiVideoApi, type AiVideoDto } from '@/api/aiVideo'

/**
 * C49: bildirimden açılan yapay zeka video görüntüleyicisi + "diyalog açık" sayacı.
 * Modül düzeyinde tek durum: çan (host) ve masaüstü bildirimi (tıklayınca açar) aynı kaynağı paylaşır.
 * `openCount` her açık `AiVideoDialog` için artar (chat, media ya da view); sıfırdan büyükse
 * bildirim tipi AI_VIDEO_* için açılır toast gösterilmez (çan kaydı kalır).
 */
const viewId = ref<string | null>(null)
const openCount = ref(0)

/**
 * C49 Revize 3: tek global "etkin üretim" kimliği (kişi başı tek eşzamanlı üretim, C43). Giriş butonlarındaki
 * "sürüyor" göstergesi ve kapatırken bilgi toast'ı buna bakar. Ek yoklama yok: set/temizleme mevcut akışlardan gelir
 * (başlatma, form içi yoklamanın terminal durumu, soket AI_VIDEO_* bildirimi, `recent` listesi senkronu).
 */
const activeId = ref<string | null>(null)
let restoredFor: string | null = null

const isWorking = (r: AiVideoDto) => r.status === 'QUEUED' || r.status === 'RUNNING'

/** `aiVideoApi.list()` sonucuyla durumu eşler: süren satır varsa onun kimliği, yoksa temiz. */
export function syncActiveFromRows(rows: AiVideoDto[]) {
  activeId.value = rows.find(isWorking)?.id ?? null
}

/** Uygulama açılışında (kullanıcı başına bir kez) tek list çağrısıyla süren üretimi geri yükler. */
export async function restoreActive(userId: string) {
  if (restoredFor === userId) return
  restoredFor = userId
  activeId.value = null
  try {
    syncActiveFromRows((await aiVideoApi.list()).data)
  } catch {
    restoredFor = null // geçici hata: sonraki montajda yeniden dene
  }
}

export function useAiVideoViewer() {
  return {
    viewId,
    openCount,
    activeId,
    setActive: (id: string) => {
      activeId.value = id
    },
    clearActive: (id?: string) => {
      if (!id || activeId.value === id) activeId.value = null
    },
    openView: (id: string) => {
      viewId.value = id
    },
    closeView: () => {
      viewId.value = null
    },
  }
}
