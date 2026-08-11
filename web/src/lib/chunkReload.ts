import { watch } from 'vue'
import type { Router } from 'vue-router'
import { i18n } from '@/i18n'
import { useToastStore } from '@/stores/toast'
import { useVoiceStore } from '@/stores/voice'

/**
 * D63 — Dağıtım sonrası bayat parça öz-onarımı.
 *
 * Sorun: router'daki ekranlar tembel yükleniyor (`() => import(...)`), Vite bunları içerik-hash'li
 * parçalara bölüyor. Yeni dağıtım eski parça dosyalarını siliyor. Açık duran sekme hâlâ ESKİ
 * index.html'i çalıştırdığı için elindeki parça adları eski; o ana kadar girmediği bir ekrana
 * tıklayınca import patlıyor ve ekran hiç açılmıyor — hiçbir hata mesajı olmadan.
 *
 * Çözüm: Vite'ın `vite:preloadError` olayını dinleyip sayfayı BİR KEZ yenilemek. index.html
 * `no-cache` ile servis edildiği için yenileme taze parça adlarını getiriyor.
 *
 * Yenileme aynı adrese değil, kullanıcının GİTMEK İSTEDİĞİ adrese yapılır. Import patladığında
 * gezinme commit edilmediği için URL hâlâ eski ekranı gösteriyor; düz `reload()` kullanıcıyı
 * bulunduğu yere geri koyar ve hedefe varmak için ikinci kez tıklaması gerekir (2026-08-11
 * sınamasında ölçüldü). Tam sayfa gezinmesi tek tıklamayla hedefe götürür.
 */

/** Son öz-onarım yenilemesinin damgası. Sekme başına: bir sekmedeki başarısız deneme ötekini kilitlemesin. */
const STAMP_KEY = 'kv.chunkReload.at'

/** Bu pencere içinde ikinci kez yenilenmez — yenileme çözmediyse uygulama sonsuz yenilenmesin. */
const RETRY_WINDOW_MS = 15_000

function recentlyReloaded(): boolean {
  const raw = sessionStorage.getItem(STAMP_KEY)
  if (!raw) return false
  const at = Number(raw)
  return Number.isFinite(at) && Date.now() - at < RETRY_WINDOW_MS
}

/**
 * @param target Gidilmek istenen adres. Verilmezse bulunulan sayfa yeniden yüklenir (aramadan
 *   sonra ertelenmiş onarım: kullanıcı zaten bulunduğu ekranda kalmış durumda).
 */
function reloadNow(target?: string) {
  sessionStorage.setItem(STAMP_KEY, String(Date.now()))
  window.location.assign(target ?? window.location.href)
}

export function installChunkReload(router: Router) {
  let pendingReload = false

  // Gezinme commit edilmeden patladığı için hedefi olaydan öğrenemiyoruz; son denenen rotayı burada
  // tutuyoruz. Guard hiçbir şey döndürmez → gezinmeyi etkilemez.
  let lastTarget: string | null = null
  router.beforeEach((to) => {
    lastTarget = to.fullPath
  })

  window.addEventListener('vite:preloadError', (event) => {
    const toast = useToastStore()
    const voice = useVoiceStore()

    // Görüşmenin ortasında yenilemek kullanıcı için çökmedir — üstelik bu kusurdan en çok etkilenen
    // istemci (günlerce açık kalan masaüstü) aramada olma ihtimali en yüksek olan istemci.
    // Burada preventDefault ÇAĞIRMIYORUZ: gezinme normal yolundan başarısız olsun, kullanıcı
    // bulunduğu ekranda kalsın. Arama biter bitmez kendi kendine onarılır.
    if (voice.connectedChannelId) {
      if (!pendingReload) {
        pendingReload = true
        toast.info(i18n.global.t('toast.updateAfterCall'))
        watch(
          () => voice.connectedChannelId,
          (channelId) => {
            if (!channelId && !recentlyReloaded()) reloadNow()
          },
        )
      }
      return
    }

    // Bir kez yeniledik ve hâlâ patlıyor: sorun bayat parça değil. Sessiz kalma, kullanıcıya söyle.
    if (recentlyReloaded()) {
      toast.error(i18n.global.t('toast.chunkLoadFailed'))
      return
    }

    // Vite, preventDefault çağrılmazsa hatayı yeniden fırlatır. Zaten yeniliyoruz, susturuyoruz.
    event.preventDefault()
    reloadNow(lastTarget ?? undefined)
  })
}
