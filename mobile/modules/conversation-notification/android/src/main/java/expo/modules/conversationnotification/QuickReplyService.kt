package expo.modules.conversationnotification

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Cevapla metnini JS'teki `KvQuickReply` headless gorevine tasir (index.js AppRegistry.registerHeadlessTask).
 * Gorev bitince (promise cozulunce) servis kendini durdurur. Uygulama JS'i zaten calisiyorsa
 * (on plan/arka plan) AYNI ReactContext'te kosar; degilse uygulamanin tekil ReactHost'u baslatilir.
 */
class QuickReplyService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    val data = Arguments.createMap().apply {
      putString("action", extras.getString(ConversationNotifier.EXTRA_ACTION) ?: ConversationNotifier.ACTION_REPLY)
      putString("conversationId", extras.getString(ConversationNotifier.EXTRA_CONVERSATION_ID))
      putString("text", extras.getString(EXTRA_TEXT))
      putString("type", extras.getString(ConversationNotifier.EXTRA_TYPE))
      putString("guildId", extras.getString(ConversationNotifier.EXTRA_GUILD_ID))
    }
    // timeout 30 sn (yenileme + gonderme icin yeter); on planda da calissin (3. soru).
    return HeadlessJsTaskConfig(TASK_KEY, data, 30_000, true)
  }

  companion object {
    const val TASK_KEY = "KvQuickReply"
    const val EXTRA_TEXT = "kv_reply_text_extra"
  }
}
