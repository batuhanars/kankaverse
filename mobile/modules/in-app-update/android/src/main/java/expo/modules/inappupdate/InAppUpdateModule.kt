package expo.modules.inappupdate

import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Play mağazası uygulama içi güncelleme (esnek akış). Masaüstündeki "güncelleme var" bandının mobil
 * karşılığı: Play'e "bu kullanıcıya yeni sürüm sunuluyor mu" diye sorulur; kullanıcı onaylarsa
 * indirme Play tarafından arka planda yapılır, bitince [completeUpdate] uygulamayı yeni sürümle
 * yeniden başlatır.
 *
 * Play'den yüklenmemiş kopyada (yerel derleme, APK) Play hata döner; JS tarafı bunu "güncelleme
 * yok" sayar. Durum değişimleri `onStatus` olayıyla JS'e akar.
 */
class InAppUpdateModule : Module() {
  private var manager: AppUpdateManager? = null
  private var lastInfo: AppUpdateInfo? = null

  private val listener = InstallStateUpdatedListener { state ->
    val status = when (state.installStatus()) {
      InstallStatus.PENDING, InstallStatus.DOWNLOADING -> "downloading"
      InstallStatus.DOWNLOADED -> "downloaded"
      InstallStatus.INSTALLING -> "installing"
      InstallStatus.INSTALLED -> "installed"
      InstallStatus.FAILED -> "failed"
      InstallStatus.CANCELED -> "canceled"
      else -> "unknown"
    }
    sendEvent(
      "onStatus",
      mapOf(
        "status" to status,
        "bytesDownloaded" to state.bytesDownloaded().toDouble(),
        "totalBytes" to state.totalBytesToDownload().toDouble(),
      ),
    )
  }

  private fun managerOrNull(): AppUpdateManager? {
    manager?.let { return it }
    val context = appContext.reactContext ?: return null
    return AppUpdateManagerFactory.create(context).also {
      it.registerListener(listener)
      manager = it
    }
  }

  override fun definition() = ModuleDefinition {
    Name("InAppUpdate")

    Events("onStatus")

    OnDestroy {
      manager?.unregisterListener(listener)
      manager = null
    }

    // { available, downloaded, versionCode }. Play'e ulaşılamazsa (Play dışı kurulum, ağ) promise
    // reddedilir; JS sessizce "yok" sayar.
    AsyncFunction("check") { promise: Promise ->
      val m = managerOrNull() ?: return@AsyncFunction promise.resolve(null)
      m.appUpdateInfo
        .addOnSuccessListener { info ->
          lastInfo = info
          val available =
            info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
              info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
          promise.resolve(
            mapOf(
              "available" to available,
              "downloaded" to (info.installStatus() == InstallStatus.DOWNLOADED),
              "versionCode" to info.availableVersionCode(),
            ),
          )
        }
        .addOnFailureListener { e -> promise.reject("ERR_IN_APP_UPDATE", e.message, e) }
    }

    // Play'in onay penceresini açar; kabul edilirse indirme arka planda başlar (durum `onStatus`ta).
    // Dönüş: pencere açıldı mı.
    AsyncFunction("start") { promise: Promise ->
      val m = managerOrNull()
      val info = lastInfo
      val activity = appContext.currentActivity
      if (m == null || info == null || activity == null) return@AsyncFunction promise.resolve(false)
      try {
        val started = m.startUpdateFlowForResult(
          info,
          activity,
          AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(),
          REQUEST_CODE,
        )
        promise.resolve(started)
      } catch (e: Exception) {
        promise.reject("ERR_IN_APP_UPDATE", e.message, e)
      }
    }

    // İndirilen sürümü kurar; Play uygulamayı yeniden başlatır.
    AsyncFunction("complete") {
      managerOrNull()?.completeUpdate()
    }
  }

  companion object {
    private const val REQUEST_CODE = 4610
  }
}
