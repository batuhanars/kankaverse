import { ref, computed } from 'vue'

/**
 * useGuildSearchPanel — sağ-sütun "ortam araması" panelinin açık/kapalı durumu (R13).
 *
 * Tetikleyici (GuildTopBar arama ikonu) ile gösterici (TextChannelView sağ sütun) farklı
 * component ağaçlarında (`<component :is>` arasında prop akışı yok) → modül-seviyesi singleton
 * (useActiveMenu/useMessageJump deseni). Arama paneli açıkken üye paneli yerini ona bırakır.
 */
const isOpen = ref(false)

export function useGuildSearchPanel() {
  function toggle() {
    isOpen.value = !isOpen.value
  }
  function close() {
    isOpen.value = false
  }
  function open() {
    isOpen.value = true
  }
  return { isOpen: computed(() => isOpen.value), toggle, close, open }
}
