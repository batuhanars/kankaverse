import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * A4 alıcı tarafı — platform güvenliğine (isModerator) gelen acil alarmların gelen-kutusu.
 * Backend `emergency.alert` WS event'ini YALNIZ isModerator kullanıcılara yollar (sunucu otorite) →
 * bu store'a düşen her alarm gerçek bir acil çağrıdır. Kalıcı (auto-dismiss YOK) — moderatör elle kapatır.
 */
export interface EmergencyAlert {
  reportId: string
  channelId: string | null
  guildId: string | null
  isMinor: boolean
  triggeredAt: string
}

export const useEmergencyAlertsStore = defineStore('emergencyAlerts', () => {
  const alerts = ref<EmergencyAlert[]>([])

  function add(alert: EmergencyAlert) {
    if (alerts.value.some((a) => a.reportId === alert.reportId)) return // dedup
    alerts.value.unshift(alert)
  }

  function dismiss(reportId: string) {
    alerts.value = alerts.value.filter((a) => a.reportId !== reportId)
  }

  return { alerts, add, dismiss }
})
