package expo.modules.conversationnotification

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ConversationNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ConversationNotification")

    // Bildirime dokunma: uygulama zaten acikken (singleTask) yeni intent bu olayi uretir.
    Events("onTap")

    // Map ile alinir: alan sozlesmesi index.ts ConversationNotificationParams.
    AsyncFunction("show") { params: Map<String, Any?> ->
      val context = appContext.reactContext
      if (context != null) {
        ConversationNotifier.show(context, params)
      }
    }

    // SPIKE quick-reply: bildirime "ben"den mesaj ekler (yanit gitti / gonderilemedi gostergesi).
    AsyncFunction("appendOwnReply") { conversationId: String, text: String, timestamp: Double ->
      val context = appContext.reactContext
      if (context != null) {
        ConversationNotifier.appendOwnReply(context, conversationId, text, timestamp.toLong())
      } else {
        false
      }
    }

    AsyncFunction("dismiss") { conversationId: String ->
      val context = appContext.reactContext
      if (context != null) {
        ConversationNotifier.dismiss(context, conversationId)
      }
    }

    // Soguk acilis: uygulamayi bildirime dokunarak acan intent'in ekstralari (bir kez okunur, tuketilir).
    Function("getInitialTap") {
      val context = appContext.reactContext
      val intent = appContext.currentActivity?.intent
      if (context != null && intent != null) ConversationNotifier.consumeTap(context, intent) else null
    }

    OnNewIntent { intent ->
      val context = appContext.reactContext
      if (context != null) {
        ConversationNotifier.consumeTap(context, intent)?.let { sendEvent("onTap", it) }
      }
    }
  }
}
