package expo.modules.conversationnotification

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * C72: native arama bildirimindeki Reddet dugmesini JS'teki `KvCallAction` headless gorevine tasir
 * (index.js AppRegistry.registerHeadlessTask). `QuickReplyService` deseni: gorev bitince servis kendini durdurur.
 */
class CallActionService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    val channelId = extras.getString(CallPush.EXTRA_CHANNEL_ID) ?: return null
    // Dugmeye basilinca bildirim ag/JS beklenmeden HEMEN kapanir (kullanici beklemesin).
    CallPush.cancel(applicationContext, channelId)
    MissedCall.resolve(applicationContext, channelId) // C73: Reddet yanittir, cevapsiz dusmez
    val data = Arguments.createMap().apply {
      putString("action", extras.getString(CallPush.EXTRA_CALL_ACTION) ?: CallPush.ACTION_REJECT)
      putString("channelId", channelId)
      putBoolean("isGroup", extras.getBoolean(CallPush.EXTRA_IS_GROUP, false))
      putDouble("postedAt", extras.getLong(CallPush.EXTRA_POSTED_AT, 0L).toDouble())
    }
    // timeout 30 sn (oturum yenileme + HTTP reddetme icin yeter); on planda da calissin.
    return HeadlessJsTaskConfig(TASK_KEY, data, 30_000, true)
  }

  companion object {
    const val TASK_KEY = "KvCallAction"
  }
}
