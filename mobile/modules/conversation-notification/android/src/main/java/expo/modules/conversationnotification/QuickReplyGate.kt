package expo.modules.conversationnotification

import android.content.BroadcastReceiver
import android.os.Handler
import android.os.Looper
import java.util.ArrayDeque
import java.util.concurrent.atomic.AtomicBoolean

/**
 * E3 Rev.3: hizli cevap alicisinin `goAsync()` ile aldigi `PendingResult`'lari JS gorevi bitene kadar tutar.
 * Alici donunce Android sureci "bos" sayip MIUI'de dondurabiliyor; `finish()` cagrilana kadar alici yasar ve
 * dondurma penceresi acik kalir. Bitis sinyali JS'ten gelir (`finishQuickReply`); en cok MAX_HOLD_MS sonra
 * NATIVE zamanlayici (Handler, JS zamanlayicisi degil) kendiliginden birakir (sistem ~10 sn'de alicinin
 * ANR'ini ilan eder). Cift `finish` korunur. Is mantigi yok.
 */
internal object QuickReplyGate {
  private const val MAX_HOLD_MS = 9_000L

  private class Held(private val result: BroadcastReceiver.PendingResult) {
    private val done = AtomicBoolean(false)
    lateinit var timeout: Runnable

    /** Ikinci cagri etkisiz (PendingResult.finish ikinci kez IllegalStateException atabilir). */
    fun finish(handler: Handler) {
      if (!done.compareAndSet(false, true)) return
      handler.removeCallbacks(timeout)
      try {
        result.finish()
      } catch (e: IllegalStateException) {
        // Zaten bitmis: yapilacak bir sey yok.
      }
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private val held = ArrayDeque<Held>()

  /** Alici `goAsync()` sonucunu verir; JS bitis sinyali ya da zaman asimi birakir. */
  fun hold(result: BroadcastReceiver.PendingResult) {
    val entry = Held(result)
    entry.timeout = Runnable {
      synchronized(held) { held.remove(entry) }
      entry.finish(handler)
    }
    synchronized(held) { held.addLast(entry) }
    handler.postDelayed(entry.timeout, MAX_HOLD_MS)
  }

  /** JS gorevi bitti: en eski bekleyen alicinin sonucunu birakir (gorev basina bir alici). */
  fun finishOldest() {
    val entry = synchronized(held) { held.pollFirst() } ?: return
    entry.finish(handler)
  }
}
