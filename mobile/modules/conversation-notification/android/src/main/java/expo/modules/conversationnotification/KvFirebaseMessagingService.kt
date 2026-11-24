package expo.modules.conversationnotification

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import java.util.concurrent.TimeUnit

/**
 * E3 Rev.4 §11.1: Expo'nun FCM servisini genisletir (sinif `open`, `onMessageReceived` override edilebilir) ve
 * sifreli v2 mesaj push'unda push penceresini tutar.
 *
 * Teslim aynen Expo'nundur: `super.onMessageReceived` Expo'nun delegesini cagirir (NotificationsService.receive +
 * runTaskManagerTasks -> JS gorevi). Expo bunu hemen bitirir; biz ardindan JS'ten `pushHandled(messageId)` gelene
 * ya da 8 sn dolana dek bekleriz. FCM bu cagri donene kadar servisi/sureci canli tutar (yuksek oncelikli mesajda
 * ~20 sn sinir; 8 sn bunun altinda). Sifreli olmayan push'lar ve diger tum olaylar beklemez.
 */
class KvFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    // C72: arama bildirimi JS'i beklemeden, `super`den ONCE cizilir (dusuk bellekte JS ayaga kalkmadan surec olur).
    try {
      CallPush.parse(remoteMessage.data)?.let { CallPush.handle(applicationContext, it) }
    } catch (e: Exception) {
      Log.e(TAG, "native arama cizimi basarisiz", e)
    }
    val incoming = PushHold.parse(remoteMessage.data)
    // Kapi, JS gorevi baslamadan ONCE kurulur: JS cok hizli biterse sinyal kaybolmasin.
    val latch = incoming?.let { PushHold.register(it.messageId) }
    try {
      super.onMessageReceived(remoteMessage)
      if (incoming == null || latch == null) return
      val done = try {
        latch.await(PushHold.HOLD_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        false
      }
      if (!done) {
        Log.w(TAG, "JS suresinde bitmedi, genel metinle cizilir")
        try {
          PushHold.drawFallback(applicationContext, incoming.messageId, incoming.payload)
        } catch (e: Exception) {
          Log.e(TAG, "yedek cizim basarisiz", e)
        }
      }
    } finally {
      incoming?.let { PushHold.unregister(it.messageId) }
    }
  }

  private companion object {
    const val TAG = "KvFcmService"
  }
}
