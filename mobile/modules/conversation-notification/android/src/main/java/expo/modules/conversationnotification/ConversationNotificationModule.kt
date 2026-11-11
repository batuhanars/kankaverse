package expo.modules.conversationnotification

import android.content.Intent
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ConversationNotificationModule : Module() {
  /**
   * Native tarafta ilk gorulen dokunus burada bekler; JS `getInitialTap` ile alir ve temizler.
   * C52 koku: veri-yalniz push JS'i ekransiz uyandirmisken MainActivity calisan runtime'in ustune
   * olusur; `onNewIntent` tetiklenmez ve JS mount aninda `currentActivity` henuz yoktur. Dokunus bu
   * yuzden etkinlik one gelirken (OnActivityEntersForeground) yakalanir.
   */
  @Volatile private var pendingTap: Map<String, Any?>? = null

  private fun capture(source: String, intent: Intent?, emit: Boolean) {
    val hasExtra = intent?.hasExtra(ConversationNotifier.EXTRA_CONVERSATION_ID) == true
    val context = appContext.reactContext
    if (context == null || intent == null || !hasExtra) return
    val tap = ConversationNotifier.consumeTap(context, intent) ?: return
    pendingTap = tap
    if (emit) {
      sendEvent("onTap", tap)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ConversationNotification")

    // Bildirime dokunma olayi (JS dinleyicisi varsa); ayni dokunus getInitialTap ile de gelebilir,
    // JS tarafi tapId ile tekilleştirir.
    Events("onTap")

    // Map ile alinir: alan sozlesmesi index.ts ConversationNotificationParams.
    AsyncFunction("show") { params: Map<String, Any?> ->
      val context = appContext.reactContext
      if (context != null) {
        ConversationNotifier.show(context, params)
      }
    }

    // Hizli cevap: bildirime "ben"den mesaj ekler (yanit gitti / gonderilemedi gostergesi).
    AsyncFunction("appendOwnReply") { conversationId: String, text: String, timestamp: Double, meAvatarUrl: String? ->
      val context = appContext.reactContext
      if (context != null) {
        ConversationNotifier.appendOwnReply(context, conversationId, text, timestamp.toLong(), meAvatarUrl)
      } else {
        false
      }
    }

    // E3 Rev.2: gorunen bildirimdeki mesaj satirinin metnini degistirir (cozulmus metin). Yoksa false.
    AsyncFunction("updateMessageText") { conversationId: String, messageId: String, text: String ->
      val context = appContext.reactContext
      if (context != null) {
        ConversationNotifier.updateMessageText(context, conversationId, messageId, text)
      } else {
        false
      }
    }

    // E3 Rev.3: hizli cevap JS gorevi bitti; alicinin goAsync() ile tuttugu sonucu birakir (cift cagri zararsiz).
    AsyncFunction("finishQuickReply") {
      QuickReplyGate.finishOldest()
    }

    AsyncFunction("dismiss") { conversationId: String ->
      val context = appContext.reactContext
      if (context != null) {
        ConversationNotifier.dismiss(context, conversationId)
      }
    }

    // Bekleyen dokunus (yoksa etkinligin intent'i); bir kez teslim edilir, sonra temizlenir.
    Function("getInitialTap") {
      if (pendingTap == null) capture("getInitialTap", appContext.currentActivity?.intent, false)
      val tap = pendingTap
      pendingTap = null
      tap
    }

    OnActivityEntersForeground {
      capture("foreground", appContext.currentActivity?.intent, true)
    }

    OnNewIntent { intent ->
      capture("newIntent", intent, true)
    }
  }

  private companion object {
    const val TAG = "ConversationTap"
  }
}
