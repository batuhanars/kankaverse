import { computed, watch, type Ref } from 'vue'
import { useIdle, useDocumentVisibility } from '@vueuse/core'
import { usePresenceStore } from '@/stores/presence'
import { useSocket, sendClientActivity } from '@/composables/useSocket'

/** Hareketsizlik eşiği: bu süre etkileşim olmazsa "Boşta"ya düş. */
const IDLE_TIMEOUT_MS = 5 * 60_000 // 5 dk

/**
 * C76 Rev.1: pencere "aktif" = görünür VE 5 dk içinde hareket (tek hesap, tek `useIdle` kaynağı).
 * Tepsiye gizlenen/simge durumundaki/arka plandaki pencere hemen pasif olur; görünür olunca idle
 * değilse hemen aktif. Manuel DND/Boşta seçimi bunu etkilemez. Değer sunucuya her değişimde
 * (ve ilk çağrıda) gider; bağlanma/yeniden bağlanmada `useSocket` son değeri tekrar yollar.
 */
export function useClientActivitySync(idle: Ref<boolean>) {
  const visibility = useDocumentVisibility()
  const clientActive = computed(() => visibility.value === 'visible' && !idle.value)
  watch(clientActive, (active) => sendClientActivity(active), { immediate: true })
  return clientActive
}

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
 *
 * 🔴 Bu pencerenin boştalığı ARTIK hesabın boştalığı değil (2026-08-12): sunucu durumu bağlantı
 * başına tutuyor ve hesap, herhangi bir penceresi aktifse aktif sayılıyor. Bu dosya yalnız
 * "bu pencerenin başında biri var mı" sorusunu cevaplar; birleştirme sunucunun işi.
 */
export function useIdlePresence() {
  const presenceStore = usePresenceStore()
  const { setPresence } = useSocket()
  const { idle } = useIdle(IDLE_TIMEOUT_MS)

  // Otomatik olarak en son uyguladığımız durum ('online' | 'away' | null=manuel mod).
  let lastAuto: 'online' | 'away' | null = null

  function applyOwn(status: 'online' | 'away') {
    // `auto: true` — bu bir OTOMASYON, kullanıcının seçimi değil: sunucu yalnız bu pencerenin
    // durumunu günceller, hesabın manuel seçimine dokunmaz.
    setPresence(status, { auto: true })
    // 🔴 İyimser kendi-yazımı KALDIRILDI (sahip bulgusu 2026-08-12): bu pencerenin boşta olması
    // artık hesabın boşta olduğu anlamına gelmiyor — başka bir pencere aktif olabilir. Doğru
    // cevabı yalnız sunucu biliyor ve artık kullanıcının kendisine de yolluyor (`presence:update`,
    // `messages.gateway.ts`). Buraya tahmin yazmak, düzeltmek için uğraştığımız yalanın ta kendisi.
  }

  useClientActivitySync(idle)

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
