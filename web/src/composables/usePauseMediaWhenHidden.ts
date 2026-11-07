/**
 * Masaüstünde pencere görünmez olunca (X → tepsiye gizlenme ya da simge durumu) çalan mesaj
 * medyasını duraklatır. Sebep (sahip bulgusu 2026-11-07): tepsiye gizlenen uygulamada sayfa canlı
 * kaldığı için video kullanıcı görmeden oynamaya devam ediyordu.
 *
 * - Yalnız Electron'da: tarayıcıda sekme değiştirince sesli mesaj dinlemeye devam etmek beklenen davranış.
 * - Yalnız dosyadan çalan medya (`src`): sesli arama/yayın `srcObject` (canlı akış) ile çalar ve
 *   tepsideyken de sürmeli; zil sesi Web Audio ile sentezlenir, burada hiç görünmez.
 * - Geri açılınca otomatik devam ETMEZ: kullanıcı nerede kaldığını görüp kendisi başlatır.
 *   Oynatıcılar `pause` olayını dinlediği için düğme durumları kendiliğinden güncellenir.
 *
 * Yeni masaüstü sürümü gerektirmesin diye köprüye değil Page Visibility API'ye dayanır
 * (Electron gizli/simge durumundaki pencerede `visibilityState = 'hidden'` verir).
 */
import { onBeforeUnmount, onMounted } from 'vue'

function pausePlayingFileMedia() {
  document.querySelectorAll<HTMLMediaElement>('video, audio').forEach((el) => {
    if (!el.paused && !el.srcObject) el.pause()
  })
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') pausePlayingFileMedia()
}

export function usePauseMediaWhenHidden() {
  if (!window.kankaverse?.isElectron) return
  onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange))
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibilityChange))
}
