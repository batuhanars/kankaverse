package expo.modules.pictureinpicture

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * M4p sözleşme §2 — Android PiP (resim içinde resim). `call-foreground-service`ten BİLEREK AYRI
 * ikinci modül (aynı desen, dev kararı — rapora bkz.): o bir Android **Service** (arka planda ses
 * için canlı tutma), bu ise **Activity yaşam döngüsü** kancası (`onUserLeaveHint`/
 * `onPictureInPictureModeChanged`). İkisi farklı katman (Service vs. Activity); PiP mantığını
 * Service modülüne eklemek kavramsal olarak yanlış yere iş sokardı.
 *
 * Bu sınıf `MainActivity.kt`ye enjekte edilen native koda (`plugin/withPictureInPicture.js` — bir
 * Expo modülü kendi başına app'in Activity dosyasını DEĞİŞTİREMEZ, yalnız config plugin ile
 * `expo prebuild` sırasında kod enjekte edilebilir) SABİT bir çağrı yüzeyi sağlar:
 * - `onUserLeaveHint()` → [tryEnterPip]
 * - `onPictureInPictureModeChanged()` → [notifyModeChanged]
 */
class PictureInPictureModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PictureInPicture")

    Events("onModeChanged")

    OnCreate {
      instance = this@PictureInPictureModule
    }

    OnDestroy {
      if (instance === this@PictureInPictureModule) {
        instance = null
      }
    }

    // §2 — `stores/voice.ts` `startOrJoin`/`leave` çağırır. Yalnız bu true iken `onUserLeaveHint`
    // PiP'e girmeyi DENER; arama yokken uygulama normal arka plana düşer (sözleşme "çağrı yokken
    // davranış değişmez").
    AsyncFunction("setCallActive") { active: Boolean ->
      callActive = active
    }

    AsyncFunction("isSupported") {
      isPipSupported(appContext.reactContext?.packageManager)
    }

    // 🔴 SENKRON — BİLEREK `Events`/`AsyncFunction` yerine `Function` (JSI senkron çağrı).
    // `stores/voice.ts` `handleAppStateChange`'in AppState 'background' dalı bunu native GERÇEĞİ
    // OKUMAK için kullanıyor: `onPictureInPictureModeChanged` (bu değeri native tarafta yazan yer)
    // Android'in `onPause()`ından (RN AppState'in 'background' olayını tetikleyen çağrı) ÖNCE
    // çalışıyor — ama JS'e giden İKİ ayrı bridge olayının (bizim `onModeChanged` event'imiz ile
    // AppState'in kendi olayı) JS tarafına HANGİ SIRAYLA düştüğü garanti değil. Senkron okuma bu
    // yarışı tamamen ortadan kaldırıyor: `handleAppStateChange` olayı işlerken native'deki AN'lık
    // durumu doğrudan sorguluyor, hiçbir JS event sırasına güvenmiyor.
    Function("isInPip") {
      isInPipState
    }
  }

  companion object {
    @Volatile
    private var instance: PictureInPictureModule? = null

    @Volatile
    private var callActive = false

    @Volatile
    private var isInPipState = false

    private fun isPipSupported(pm: PackageManager?): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
      return pm?.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE) ?: false
    }

    /**
     * `MainActivity.onUserLeaveHint()`ten çağrılır. 🔴 Sözleşme §6 — MIUI gibi OEM'lerde PiP izni
     * uygulama başına kapalı olabilir; `enterPictureInPictureMode` bu durumda istisna
     * fırlatabilir (bazı OEM'ler) ya da sessizce hiçbir şey yapmayabilir (bazıları). İkisi de aynı
     * `catch` ile karşılanıyor: uygulama ASLA bu yüzden çökmez, `isInPipState` `false` kalır ve
     * `onPictureInPictureModeChanged` hiç çağrılmadığı için JS tarafı da hiç haberdar olmaz —
     * `handleAppStateChange` bugünkü davranışa (kamera durur) kendiliğinden düşer, ek bir dal
     * YAZILMADI (sözleşmenin istediği "sessizce düşme" doğal sonuç).
     */
    fun tryEnterPip(activity: Activity) {
      if (!callActive) return
      if (!isPipSupported(activity.packageManager)) return
      try {
        activity.enterPictureInPictureMode(PictureInPictureParams.Builder().build())
      } catch (_: Exception) {
        // §6 — sessizce bugünkü davranışa düş, kullanıcıya hata gösterilmez.
      }
    }

    /** `MainActivity.onPictureInPictureModeChanged()`ten çağrılır. */
    fun notifyModeChanged(isInPip: Boolean) {
      isInPipState = isInPip
      instance?.sendEvent("onModeChanged", mapOf("isInPip" to isInPip))
    }
  }
}
