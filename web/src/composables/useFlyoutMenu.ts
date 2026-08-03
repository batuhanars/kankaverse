import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { isMobile } from '@/composables/useResponsive'

/**
 * useFlyoutMenu — menü içi "yana açılan" alt panellerin (flyout) açılma davranışı.
 * Kullananlar: `MuteDurationFlyout`, `NotifLevelFlyout` (Sprint WEB-PARITE §3.2).
 *
 * Neden ortak: iki bileşende de aynı üç kural geçerli ve bunlardan biri (aynı anda tek flyout)
 * zaten **modül-seviyesi paylaşılan state** gerektiriyor — davranışı da yanına koymak
 * ikinci bir kopya yazmaktan iyi. `useMenuCoordinator` KULLANILMAZ: o, host menüleri
 * (context menü / dropdown) birbirine kapattırıyor; flyout onu tetiklerse içinde durduğu
 * menü de kapanırdı.
 *
 * Kurallar:
 *  1. Hover ile açılır (Discord deseni), `mouseleave`de ~150ms gecikmeyle kapanır — imleç
 *     tetikleyiciden panele geçerken kapanmasın (klasik submenu tuzağı).
 *  2. Hover davranışı YALNIZ hover destekleyen işaretçide ve alt-sayfa modu dışında (<768).
 *     Dokunmatikte her şey eskisi gibi: tıkla-aç, tıkla-kapat.
 *  3. Tıklama ve klavye her koşulda çalışır (erişilebilirlik): Enter/Space/→ açar,
 *     Esc/← kapatır, ↑/↓ öğeler arasında gezer.
 */
const CLOSE_DELAY_MS = 150

// Aynı anda tek flyout açık kalır (menü içi kardeşler birbirini kapatır).
let seq = 0
const activeFlyout = ref<number | null>(null)

export function useFlyoutMenu(opts: { enabled?: () => boolean } = {}) {
  const id = ++seq
  const open = ref(false)
  const triggerEl = ref<HTMLElement | null>(null)
  const panelEl = ref<HTMLElement | null>(null)
  let closeTimer: ReturnType<typeof setTimeout> | null = null

  // `(hover: hover)` = gerçek imleci olan cihaz (dokunmatik tablet dar sayılmasa da hover'ı yok).
  const pointerHasHover =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover)').matches
      : true
  const hoverEnabled = computed(() => pointerHasHover && !isMobile.value)

  /** Tetikleyici bir alt panel açıyor mu (MuteDurationFlyout susturulmuşken düz aksiyon). */
  const canOpen = () => opts.enabled?.() ?? true

  function cancelScheduledClose() {
    if (closeTimer !== null) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
  }

  function closeFlyout() {
    cancelScheduledClose()
    open.value = false
    if (activeFlyout.value === id) activeFlyout.value = null
  }

  /** `onOpen`: konumlama gibi açılış işi (bileşen kendi ölçümünü yapar). */
  function openFlyout(onOpen?: () => void) {
    if (!canOpen()) return
    cancelScheduledClose()
    open.value = true
    activeFlyout.value = id
    onOpen?.()
  }

  function toggleFlyout(onOpen?: () => void) {
    if (open.value) closeFlyout()
    else openFlyout(onOpen)
  }

  function scheduleClose() {
    cancelScheduledClose()
    closeTimer = setTimeout(() => {
      closeTimer = null
      closeFlyout()
    }, CLOSE_DELAY_MS)
  }

  // ── Hover (yalnız hover destekleyen cihazda) ──
  function onTriggerEnter(onOpen?: () => void) {
    if (!hoverEnabled.value) return
    openFlyout(onOpen)
  }
  function onTriggerLeave() {
    if (!hoverEnabled.value) return
    scheduleClose()
  }
  function onPanelEnter() {
    cancelScheduledClose()
  }
  function onPanelLeave() {
    if (!hoverEnabled.value) return
    scheduleClose()
  }

  // ── Klavye ──
  function panelItems(): HTMLElement[] {
    return Array.from(panelEl.value?.querySelectorAll<HTMLElement>('button') ?? [])
  }

  function focusItem(index: number) {
    const items = panelItems()
    if (!items.length) return
    const i = (index + items.length) % items.length
    items[i].focus()
  }

  /** Klavyeyle açılış: panel gelince ilk öğeye odaklan (fare açılışında odak taşınmaz). */
  function openByKeyboard(onOpen?: () => void) {
    openFlyout(onOpen)
    if (!open.value) return
    void nextTick(() => focusItem(0))
  }

  function onTriggerKeydown(e: KeyboardEvent, onOpen?: () => void) {
    if (e.key === 'Escape' || e.key === 'ArrowLeft') {
      if (open.value) {
        e.stopPropagation() // önce flyout kapanır, host menü açık kalır
        closeFlyout()
      }
      return
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      if (!canOpen()) return // alt panel yok → tarayıcı native click'i (aksiyon) çalışsın
      e.preventDefault()
      if (open.value) focusItem(0)
      else openByKeyboard(onOpen)
    }
  }

  function onPanelKeydown(e: KeyboardEvent) {
    const items = panelItems()
    const current = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem(current + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusItem(current - 1)
    } else if (e.key === 'Escape' || e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      closeFlyout()
      triggerEl.value?.focus()
    }
  }

  // Kardeş flyout açılınca bu kapanır (aynı anda tek panel).
  const stopWatch = watch(activeFlyout, (cur) => {
    if (cur !== null && cur !== id && open.value) closeFlyout()
  })

  onUnmounted(() => {
    stopWatch()
    cancelScheduledClose()
    if (activeFlyout.value === id) activeFlyout.value = null
  })

  return {
    open,
    triggerEl,
    panelEl,
    hoverEnabled,
    openFlyout,
    closeFlyout,
    toggleFlyout,
    onTriggerEnter,
    onTriggerLeave,
    onPanelEnter,
    onPanelLeave,
    onTriggerKeydown,
    onPanelKeydown,
  }
}
