import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * A4 — Acil yardım mağdur geri-bildirim durumu (GLOBAL).
 *
 * Modal neden global: panik akışı mağduru görüşmeden çıkarır → ses kontrol çubuğu (ve içindeki
 * EmergencyButton) unmount olur. Modal o ağaçta olsaydı yok olurdu (canlı test bug'ı). Bu store
 * App.vue katmanından bağımsız bir modalı sürer → odadan çıkmak modalı öldürmez.
 */
export const useEmergencyStore = defineStore('emergency', () => {
  const open = ref(false)
  const reportId = ref<string | null>(null)
  const failed = ref(false)

  function openFeedback(payload: { reportId: string | null; failed: boolean }) {
    reportId.value = payload.reportId
    failed.value = payload.failed
    open.value = true
  }

  function close() {
    open.value = false
    reportId.value = null
    failed.value = false
  }

  return { open, reportId, failed, openFeedback, close }
})
