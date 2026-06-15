import { watch } from 'vue'
import { useIdle } from '@vueuse/core'
import { usePresenceStore } from '@/stores/presence'
import { useAuthStore } from '@/stores/auth'
import { useSocket } from '@/composables/useSocket'

/** Hareketsizlik eşiği: bu süre etkileşim olmazsa "Boşta"ya düş. */
const IDLE_TIMEOUT_MS = 5 * 60_000 // 5 dk

/**
 * Auto-boşta presence — kullanıcı bir süre hareketsiz kalınca durumu 'away'a düşürür,
 * tekrar etkileşince (mouse/klavye/scroll/dokunma) 'online'a çeker. Amaç: boşta socket'i
 * gereksiz "çevrimiçi" tutmamak + doğru durum yansıtmak.
 *
 * Manuel seçime saygı (UserCard): yalnız manualStatus === 'online' iken otomatik yönetir.
 * Kullanıcı 'dnd' / 'away' seçtiyse otomatik DEĞİŞTİRMEZ. Auto geçiş manualStatus'u değiştirmez
 * (geçici); böylece "online → (boşta) away → (aktif) online" döngüsü manuel niyeti bozmaz.
 *
 * NOT: Bu çevrimDIŞI düşmeyi çözmez (o reconnect/token işi — useSocket auth_error). Bu yalnız
 * "boşta" otomasyonu; ikisi birlikte "bir süre sonra çevrimdışı" şikâyetini kapatır.
 */
export function useIdlePresence() {
  const presenceStore = usePresenceStore()
  const authStore = useAuthStore()
  const { setPresence } = useSocket()
  const { idle } = useIdle(IDLE_TIMEOUT_MS)

  // Otomatik olarak en son uyguladığımız durum ('online' | 'away' | null=manuel mod).
  let lastAuto: 'online' | 'away' | null = null

  function applyOwn(status: 'online' | 'away') {
    setPresence(status)
    // Sunucu 'presence:set'i yalnız kitleye yayar (kendine değil) → kendi UI'mızı optimistik güncelle
    const myId = authStore.user?.id
    if (myId) presenceStore.applyUpdate(myId, status)
  }

  watch(
    [idle, () => presenceStore.manualStatus],
    ([isIdle, manual]) => {
      // Manuel mod (dnd / kullanıcı-seçili away): otomatik yönetim yok
      if (manual !== 'online') {
        lastAuto = null
        return
      }
      const desired = isIdle ? 'away' : 'online'
      if (desired !== lastAuto) {
        lastAuto = desired
        applyOwn(desired)
      }
    },
    { immediate: false },
  )
}
