package expo.modules.conversationnotification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.RemoteInput
import com.facebook.react.HeadlessJsTaskService

/**
 * Bildirimdeki Cevapla eyleminin hedefi. Yazilan metni RemoteInput'tan okur ve headless JS servisini
 * baslatir (uygulama oldurulmus olsa da JS calisir). Is mantigi yok: gonderme JS'te.
 */
class QuickReplyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val text = RemoteInput.getResultsFromIntent(intent)
      ?.getCharSequence(ConversationNotifier.REPLY_KEY)?.toString()?.trim()
    val conversationId = intent.getStringExtra(ConversationNotifier.EXTRA_CONVERSATION_ID)
    if (text.isNullOrEmpty() || conversationId == null) return

    val service = Intent(context, QuickReplyService::class.java)
      .putExtra(ConversationNotifier.EXTRA_CONVERSATION_ID, conversationId)
      .putExtra(ConversationNotifier.EXTRA_TYPE, intent.getStringExtra(ConversationNotifier.EXTRA_TYPE))
      .putExtra(ConversationNotifier.EXTRA_GUILD_ID, intent.getStringExtra(ConversationNotifier.EXTRA_GUILD_ID))
      .putExtra(QuickReplyService.EXTRA_TEXT, text)
    // Servis ayaga kalkana kadar islemci uyumasin (HeadlessJsTaskService dokumani: receiver'dan baslatirken sart).
    HeadlessJsTaskService.acquireWakeLockNow(context)
    try {
      context.startService(service)
    } catch (e: Exception) {
      // Android 12+ arka plan servis kisiti (bildirim eyleminden normalde muaf; MIUI'de gozlenmeli).
      Log.e(TAG, "servis baslatilamadi", e)
    }
  }

  private companion object {
    const val TAG = "QuickReplyReceiver"
  }
}
