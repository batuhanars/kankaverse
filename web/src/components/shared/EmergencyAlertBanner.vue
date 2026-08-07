<script setup lang="ts">
/**
 * EmergencyAlertBanner — A4 alıcı tarafı (GLOBAL, App.vue'da mount). Platform güvenliğine gelen
 * acil alarmları üstte kalıcı, belirgin bantlar olarak gösterir. "Odaya git" ilgili kanala götürür.
 *
 * 7a kapsamı: alarm + yönlendirme. 7b (R7): "odaya gir" = R11B teftiş-girişiyle doğrudan sese bağlanma
 * (platform isModerator bypass'ı) — ayrı, sahip kararı bekliyor.
 */
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useEmergencyAlertsStore } from '@/stores/emergencyAlerts'
import { useVoiceStore } from '@/stores/voice'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const router = useRouter()
const store = useEmergencyAlertsStore()
const voiceStore = useVoiceStore()
const toast = useToastStore()

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

async function enterRoom(alert: {
  reportId: string
  channelId: string | null
  guildId: string | null
}) {
  if (!alert.channelId) return
  // Kanala git (mod o Ortamın üyesiyse oda görünür; değilse görünüm render olmaz ama sese bağlanır).
  if (alert.guildId)
    await router.push({
      name: 'channel',
      params: { guildId: alert.guildId, channelId: alert.channelId },
    })
  else await router.push({ name: 'dm', params: { channelId: alert.channelId } })
  try {
    await voiceStore.join(alert.channelId)
    // Başarılı bağlanma → net geri-bildirim ("oda gelmedi" karışıklığını giderir) + alarmı kaldır (sahip isteği).
    toast.success(t('emergencyAlert.joined'))
    store.dismiss(alert.reportId)
  } catch {
    // Başarısızsa alarm KALIR (tekrar dene); kaldırmıyoruz.
    toast.error(t('emergencyAlert.joinError'))
  }
}
</script>

<template>
  <div
    v-if="store.alerts.length"
    class="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[min(92vw,440px)]"
  >
    <div
      v-for="alert in store.alerts"
      :key="alert.reportId"
      class="rounded-[var(--kv-radius-md)] p-3 shadow-lg"
      style="background-color: var(--kv-danger); color: #fff"
    >
      <div class="flex items-start gap-2">
        <svg
          class="mt-0.5 shrink-0"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div class="flex-1 min-w-0">
          <p class="text-[13px] font-bold leading-tight">
            {{ t('emergencyAlert.title') }}
            <span
              v-if="alert.isMinor"
              class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
              style="background-color: rgba(255, 255, 255, 0.25)"
            >
              {{ t('emergencyAlert.minor') }}
            </span>
          </p>
          <p class="text-[12px] mt-0.5" style="color: rgba(255, 255, 255, 0.9)">
            {{ t('emergencyAlert.subtitle', { time: timeLabel(alert.triggeredAt) }) }}
          </p>
        </div>
      </div>
      <div class="flex gap-2 justify-end mt-2">
        <button
          class="text-[12px] px-2.5 py-1 rounded-full cursor-pointer"
          style="background-color: rgba(255, 255, 255, 0.18); color: #fff"
          @click="store.dismiss(alert.reportId)"
        >
          {{ t('emergencyAlert.dismiss') }}
        </button>
        <button
          v-if="alert.channelId"
          class="text-[12px] font-semibold px-2.5 py-1 rounded-full cursor-pointer"
          style="background-color: #fff; color: var(--kv-danger)"
          @click="enterRoom(alert)"
        >
          {{ t('emergencyAlert.goToChannel') }}
        </button>
      </div>
    </div>
  </div>
</template>
