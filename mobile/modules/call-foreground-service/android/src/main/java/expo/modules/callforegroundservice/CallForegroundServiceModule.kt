package expo.modules.callforegroundservice

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS ↔ native köprüsü. `start`/`update`/`stop` servisi (CallForegroundService.kt) başlatır/günceller/
 * durdurur; `onAction` bildirim eylemlerini (Bağlantıyı Kes / Sustur) JS tarafına — `stores/voice.ts`
 * `leave()`/`toggleMute()` çağırsın diye — geri iletir. Şablon: `expo-modules-core`'un kendi
 * `ModuleDefinitionBuilder`/`ObjectDefinitionBuilder` DSL'i (node_modules/expo-modules-core/android/
 * .../kotlin/modules) — `AsyncFunction`/`Events`/`Name` imzaları oradan birebir doğrulandı.
 */
class CallForegroundServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallForegroundService")

    Events("onAction")

    OnCreate {
      instance = this@CallForegroundServiceModule
    }

    OnDestroy {
      if (instance === this@CallForegroundServiceModule) {
        instance = null
      }
    }

    // channelName — PM incelemesi (2026-08-06): Android bildirim kanalı adı Ayarlar'da kullanıcıya
    // görünür, bu yüzden native tarafta sabitlenemez; JS'ten (`mobile.call.notifChannel`) gelir.
    AsyncFunction("start") { title: String, body: String, muteLabel: String, disconnectLabel: String, channelName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val intent = CallForegroundService.startIntent(context, title, body, muteLabel, disconnectLabel, channelName)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    AsyncFunction("update") { body: String, muteLabel: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      context.startService(CallForegroundService.updateIntent(context, body, muteLabel))
    }

    // 🔴 Parametresiz `AsyncFunction`ta `return@AsyncFunction` KULLANILMAZ. Parametreli
    // kardeşlerinin (yukarıda) aksine bu aşırı yükleme lambda'nın dönüş tipini `Any?` olarak
    // çözüyor; boş `return@` yalnız beklenen tip `Unit` iken geçerli olduğundan derleme
    // "Return type mismatch: expected 'Any?', actual 'Unit'" ile patlıyor (EAS derlemesini
    // düşüren hata buydu, 2026-08-06). Aynı kontrol `?.let` ile ifade olarak yazılır.
    AsyncFunction("stop") {
      appContext.reactContext?.let { context ->
        context.startService(CallForegroundService.stopIntent(context))
      }
    }
  }

  companion object {
    @Volatile
    private var instance: CallForegroundServiceModule? = null

    /** Servisin BroadcastReceiver'ı YOK; PendingIntent doğrudan servisin kendi `onStartCommand`'ına
     *  düşüyor (bkz. CallForegroundService), o da bu companion üzerinden JS'e olay yayıyor. */
    fun emitAction(action: String) {
      instance?.sendEvent("onAction", mapOf("action" to action))
    }
  }
}
