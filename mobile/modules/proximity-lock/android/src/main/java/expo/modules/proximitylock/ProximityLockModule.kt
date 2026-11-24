package expo.modules.proximitylock

import android.content.Context
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Ahizeden arama sırasında yakınlık kilidi (sahip kararı 2026-11-24). Telefon kulağa yaklaşınca ekran
 * kapanır, uzaklaşınca açılır; yanak susturma/kapatma düğmesine değmez. Android'in kendi
 * `PROXIMITY_SCREEN_OFF_WAKE_LOCK`u: sensörü sistem yönetir, JS'e olay gelmez, ek izin yalnız WAKE_LOCK.
 * Kilidi ne zaman tutacağına JS karar verir (`stores/voice.ts`: bağlı + çıkış ahize + kamera kapalı).
 */
class ProximityLockModule : Module() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun definition() = ModuleDefinition {
    Name("ProximityLock")

    AsyncFunction("setEnabled") { enabled: Boolean ->
      if (enabled) acquire() else release()
    }

    OnDestroy {
      release()
    }
  }

  private fun acquire() {
    if (wakeLock?.isHeld == true) return
    val pm = appContext.reactContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return
    val lock = wakeLock ?: pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "kankaverse:proximity")
      .also { it.setReferenceCounted(false); wakeLock = it }
    lock.acquire()
  }

  private fun release() {
    val lock = wakeLock ?: return
    // Kulaktayken bırakılırsa ekran telefon uzaklaşınca açılır (aniden yanağa açılmaz).
    if (lock.isHeld) lock.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY)
  }
}
