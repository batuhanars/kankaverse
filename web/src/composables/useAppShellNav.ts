import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { isWide } from '@/composables/useResponsive'

/**
 * useAppShellNav — uygulama kabuğu navigasyon state'i (singleton).
 * Sol drawer (mobil) + sağ üye paneli (< 1280) açık/kapalı durumunu yönetir.
 * useAppModals.ts deseni: modül-seviyesi ref'ler, her çağrıda aynı örnek.
 *
 * Kaynak: SPRINT_RESPONSIVE_CONTRACT.md §3 + §4
 */
const leftDrawerOpen = ref(false)

// Sağ panel: null = "breakpoint varsayılanını kullan" (≥1280 açık, <1280 kapalı).
// Tek bir boolean iki zıt varsayılanı taşıyamaz; kullanıcı toggle'layana kadar null.
const rightPanelOpen = ref<boolean | null>(null)

// Efektif görünürlük: kullanıcı dokunmadıysa (null) breakpoint varsayılanı.
// Resize'da doğru davranır (geniş→dar küçülünce overlay kendiliğinden açılmaz).
const rightPanelVisible = computed(() => rightPanelOpen.value ?? isWide.value)

// Router watch bir kez kurulur (modül yüklendiğinde). Her route değişiminde
// her iki drawer'ı da kapat. AppShell.vue mount'u beklemeden çalışır.
let _routerWatchInstalled = false

export function useAppShellNav() {
  // Router watch — ilk çağrıda kurulur, subsequent çağrılarda skip.
  // Ön koşul: useRouter() çağrısı Vue composition context içinden yapılmalı.
  if (!_routerWatchInstalled) {
    _routerWatchInstalled = true
    const router = useRouter()
    router.afterEach(() => {
      leftDrawerOpen.value = false
      // null = breakpoint varsayılanına dön → ≥1280 üye paneli açık kalır (regresyon yok),
      // <1280 overlay kapanır. (false yazılırsa geniş ekranda kanal değişince panel gizlenir.)
      rightPanelOpen.value = null
    })
  }

  function toggleLeftDrawer() {
    leftDrawerOpen.value = !leftDrawerOpen.value
  }
  function closeLeftDrawer() {
    leftDrawerOpen.value = false
  }
  function toggleRightPanel() {
    // Mevcut efektif görünürlüğü tersine çevir (null'dan da çıkar).
    rightPanelOpen.value = !rightPanelVisible.value
  }
  function closeRightPanel() {
    rightPanelOpen.value = false
  }

  return {
    leftDrawerOpen,
    rightPanelOpen,
    rightPanelVisible,
    toggleLeftDrawer,
    closeLeftDrawer,
    toggleRightPanel,
    closeRightPanel,
  }
}
