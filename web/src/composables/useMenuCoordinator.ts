import { ref, watch, onUnmounted } from 'vue'

/**
 * Menü koordinatörü — aynı anda yalnız BİR açılır menü açık kalsın (Görsel #14:
 * ServerRail sağ-tık menüsü ile ChannelPanel başlık dropdown'ı üst üste binmesin).
 *
 * Modül-seviyesi tek `activeMenu`: bir menü açılınca id'sini yazar; diğer kayıtlı
 * menüler `activeMenu` kendilerinden başkasına geçince kendini kapatır.
 */
const activeMenu = ref<string | null>(null)

export function useMenuCoordinator() {
  /** Bu menüyü "tek açık" yap — diğerleri (watch'larıyla) kapanır. */
  function openExclusive(id: string) {
    activeMenu.value = id
  }
  /** Bu menü kapandı — sahibiyse koordinatörü temizle. */
  function releaseIfOwner(id: string) {
    if (activeMenu.value === id) activeMenu.value = null
  }
  /** Başka bir menü açılınca `close()` çağır (kendi açılışını yok sayar). */
  function closeOnOther(id: string, close: () => void) {
    const stop = watch(activeMenu, (cur) => {
      if (cur !== null && cur !== id) close()
    })
    onUnmounted(stop)
  }
  return { openExclusive, releaseIfOwner, closeOnOther }
}
