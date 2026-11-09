import { onMounted, onUnmounted, nextTick, type Ref } from 'vue'

const ACTIVE_CLASS = 'kv-active'
// Başlık ikonuna tıklayınca kütüphane gövdeyi YUMUŞAK kaydırır; arada geçilen gruplar aktifliği
// titretmesin diye kaydırma bitene kadar izleme durur. `scrollend` gelmezse bu süre sonunda açılır.
const CLICK_LOCK_MS = 800

/**
 * `vue3-emoji-picker` başlıktaki kategori ikonlarında aktif sekmeyi göstermiyor (sahip 2026-11-09:
 * "hangi sekmede olduğumu anlayamıyorum"). Kütüphanenin durumu dışarı açık değil, o yüzden DOM'dan
 * izleniyor: tıklanan ikon anında aktif olur, elle kaydırmada görünen grup aktif olur.
 *
 * Başlık düğmeleri ve gövde grupları kütüphanede aynı sıralı anahtar listesinden (`orderedGroupKeys`)
 * üretiliyor; eşleme sıra ile yapılıyor. Sayılar tutmazsa (kütüphane sürümü değişti) hiçbir şey
 * işaretlenmez, seçici eskisi gibi çalışır.
 *
 * İkonlar maske olarak çizilir: kütüphanenin ikonları `<img>`, rengi CSS ile değişmiyor. Her düğmenin
 * `--kv-icon` değişkenine kendi görselinin adresi yazılır, renk `EmojiPicker.vue` stilinden gelir.
 */
export function useEmojiPickerActiveGroup(root: Ref<HTMLElement | null>) {
  let body: HTMLElement | null = null
  let header: HTMLElement | null = null
  let buttons: HTMLElement[] = []
  let lockedUntil = 0

  function groups(): HTMLElement[] {
    return body ? Array.from(body.querySelectorAll<HTMLElement>(':scope > .v3-group')) : []
  }

  function setActive(index: number) {
    buttons.forEach((b, i) => b.classList.toggle(ACTIVE_CLASS, i === index))
  }

  function onScroll() {
    if (!body || Date.now() < lockedUntil) return
    const list = groups()
    if (list.length !== buttons.length) return
    const top = body.getBoundingClientRect().top + 8
    let index = 0
    list.forEach((g, i) => {
      if (g.offsetHeight > 0 && g.getBoundingClientRect().top <= top) index = i
    })
    setActive(index)
  }

  function onScrollEnd() {
    lockedUntil = 0
  }

  function onHeaderClick(e: Event) {
    const button = (e.target as HTMLElement).closest<HTMLElement>('.v3-group')
    const index = button ? buttons.indexOf(button) : -1
    if (index === -1) return
    lockedUntil = Date.now() + CLICK_LOCK_MS
    setActive(index)
  }

  onMounted(async () => {
    await nextTick()
    const el = root.value
    if (!el) return
    body = el.querySelector<HTMLElement>('.v3-body-inner')
    buttons = Array.from(el.querySelectorAll<HTMLElement>('.v3-header .v3-groups .v3-group'))
    for (const b of buttons) {
      const src = b.querySelector('img')?.getAttribute('src')
      if (src) b.style.setProperty('--kv-icon', `url("${src}")`)
    }
    header = el.querySelector<HTMLElement>('.v3-header .v3-groups')
    header?.addEventListener('click', onHeaderClick)
    body?.addEventListener('scroll', onScroll, { passive: true })
    body?.addEventListener('scrollend', onScrollEnd)
    if (groups().length === buttons.length) setActive(0)
  })

  onUnmounted(() => {
    body?.removeEventListener('scroll', onScroll)
    body?.removeEventListener('scrollend', onScrollEnd)
    header?.removeEventListener('click', onHeaderClick)
  })
}
