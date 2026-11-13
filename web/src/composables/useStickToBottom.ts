import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/**
 * Mesaj listesi "dibe yapış": kullanıcı en alttaysa (ilk açılış dahil) içerik büyüdükçe
 * (şifre çözme, görsel/önizleme yüklenmesi, ayraç/bildirim satırı eklenmesi) altta kal.
 *
 * Kök neden: dibe kaydırma yalnız tek seferlik (fetch sonrası) yapılıyordu; sonradan boyu değişen
 * satırlar scrollHeight'ı büyütüp görünümü yukarıda bırakıyordu. Burada listenin doğrudan
 * çocuklarını ResizeObserver ile izleriz (liste kabı kendisi büyümez, içeriği büyür).
 * Kullanıcı yukarı kaydırdıysa (`isSticky` false) veya zıplama/başa ekleme sürüyorsa (`isPaused`)
 * dokunmaz.
 */
export function useStickToBottom(
  listEl: Ref<HTMLElement | null>,
  isSticky: () => boolean,
  isPaused: () => boolean,
) {
  let resizeObs: ResizeObserver | null = null
  let mutationObs: MutationObserver | null = null
  const observed = new Set<Element>()

  function stick() {
    const el = listEl.value
    if (el && isSticky() && !isPaused()) el.scrollTop = el.scrollHeight
  }

  function syncChildren() {
    const el = listEl.value
    if (!el || !resizeObs) return
    const current = new Set<Element>(Array.from(el.children))
    for (const c of current) {
      if (!observed.has(c)) {
        resizeObs.observe(c)
        observed.add(c)
      }
    }
    for (const c of observed) {
      if (!current.has(c)) {
        resizeObs.unobserve(c)
        observed.delete(c)
      }
    }
  }

  onMounted(() => {
    const el = listEl.value
    if (!el || typeof ResizeObserver === 'undefined') return
    resizeObs = new ResizeObserver(stick)
    mutationObs = new MutationObserver(() => {
      syncChildren()
      stick()
    })
    mutationObs.observe(el, { childList: true })
    syncChildren()
  })

  onBeforeUnmount(() => {
    resizeObs?.disconnect()
    mutationObs?.disconnect()
    observed.clear()
  })
}
