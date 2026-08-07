<script setup lang="ts">
/**
 * EmergencyButton — A4 Acil Yardım / Panik. Sözleşme: contracts/SPRINT_A4_EMERGENCY_CONTRACT.md
 *
 * Tek-onay → backend tetik (anında-çek + platform eskalasyon) → GLOBAL mağdur modalını aç (store) →
 * lokal görüşmeden ayrıl. Modal global olduğu için (App.vue), leave() bu component'i unmount etse de yaşar.
 * Ses/video kontrol çubuğunda kullanılır (en yüksek maruziyet bağlamı).
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVoiceStore } from '@/stores/voice'
import { useEmergencyStore } from '@/stores/emergency'
import { emergencyApi } from '@/api/emergency'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const { t } = useI18n()
const voiceStore = useVoiceStore()
const emergencyStore = useEmergencyStore()

const showConfirm = ref(false)
const sending = ref(false)

async function handleConfirm() {
  sending.value = true
  const channelId = voiceStore.connectedChannelId ?? undefined
  let reportId: string | null = null
  let failed = false
  try {
    const res = await emergencyApi.trigger(channelId ? { channelId } : {})
    reportId = res.data?.reportId ?? null
  } catch {
    // Acil bildirimi başarısız olsa bile mağduru bloke etme — yine de çıkar + yardım kaynaklarını göster.
    failed = true
  } finally {
    sending.value = false
    showConfirm.value = false
    // Global mağdur modalını aç (bu component leave() ile unmount olsa da modal App.vue'da yaşar).
    emergencyStore.openFeedback({ reportId, failed })
    // Maruziyeti kes: lokal görüşmeden ayrıl (sunucu removeParticipant'a ek güvence).
    try {
      await voiceStore.leave()
    } catch {
      /* best-effort */
    }
  }
}
</script>

<template>
  <!-- Belirgin, etiketli pill — kaza önlemek için Ayrıl'dan (kırmızı daire) görsel olarak ayrı. -->
  <button
    class="emergency-pill h-11 px-3 flex items-center gap-1.5 rounded-full cursor-pointer transition-colors"
    :title="t('emergency.button')"
    @click="showConfirm = true"
  >
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    <span class="text-[13px] font-semibold">{{ t('emergency.button') }}</span>
  </button>

  <ConfirmDialog
    v-if="showConfirm"
    :title="t('emergency.confirmTitle')"
    :message="t('emergency.confirmMessage')"
    :confirm-label="t('emergency.confirmAction')"
    :loading="sending"
    @confirm="handleConfirm"
    @cancel="showConfirm = false"
  />
</template>

<style scoped>
/* Temel: şeffaf zemin, danger kenarlık + yazı. Hover: içi dolar (danger zemin + beyaz yazı). */
.emergency-pill {
  border: 1.5px solid var(--kv-danger);
  color: var(--kv-danger);
  background-color: transparent;
}
.emergency-pill:hover {
  background-color: var(--kv-danger);
  color: #fff;
}
</style>
