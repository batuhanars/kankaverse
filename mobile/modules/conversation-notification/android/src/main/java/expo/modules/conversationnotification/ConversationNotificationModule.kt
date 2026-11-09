package expo.modules.conversationnotification

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ConversationNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ConversationNotification")

    // Map ile alinir: alan sozlesmesi index.ts ConversationNotificationParams.
    AsyncFunction("show") { params: Map<String, Any?> ->
      val context = appContext.reactContext
      if (context != null) {
        ConversationNotifier.show(context, params)
      }
    }
  }
}
