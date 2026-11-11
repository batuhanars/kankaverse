package expo.modules.conversationnotification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.RemoteInput
import com.facebook.react.HeadlessJsTaskService

/**
 * Bildirimdeki Cevapla / Okundu / Sessize al eylemlerinin hedefi. Yazilan metni RemoteInput'tan okur ve headless JS servisini
 * baslatir (uygulama oldurulmus olsa da JS calisir). Is mantigi yok: gonderme JS'te. Alici `goAsync()` ile
 * gorev bitene kadar (QuickReplyGate) sureci tutar.
 */
class QuickReplyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val conversationId = intent.getStringExtra(ConversationNotifier.EXTRA_CONVERSATION_ID)
    val action = intent.getStringExtra(ConversationNotifier.EXTRA_ACTION) ?: ConversationNotifier.ACTION_REPLY
    val text = if (action == ConversationNotifier.ACTION_REPLY) {
      RemoteInput.getResultsFromIntent(intent)
        ?.getCharSequence(ConversationNotifier.REPLY_KEY)?.toString()?.trim()
    } else {
      null
    }
    if (conversationId == null) return
    if (action == ConversationNotifier.ACTION_REPLY && text.isNullOrEmpty()) return
    // C55: okundu / sessize al'da bildirim ag istegini beklemeden HEMEN kapanir (anlik geri bildirim).
    if (action != ConversationNotifier.ACTION_REPLY) ConversationNotifier.dismiss(context, conversationId)

    val service = Intent(context, QuickReplyService::class.java)
      .putExtra(ConversationNotifier.EXTRA_CONVERSATION_ID, conversationId)
      .putExtra(ConversationNotifier.EXTRA_TYPE, intent.getStringExtra(ConversationNotifier.EXTRA_TYPE))
      .putExtra(ConversationNotifier.EXTRA_GUILD_ID, intent.getStringExtra(ConversationNotifier.EXTRA_GUILD_ID))
      .putExtra(ConversationNotifier.EXTRA_ACTION, action)
      .putExtra(QuickReplyService.EXTRA_TEXT, text)
    // E3 Rev.3: alici JS gorevi bitene kadar (en cok ~9 sn) yasar; MIUI sureci dondurmasin. `goAsync()` yalniz
    // onReceive icinde cagrilabilir. Bitis: JS `finishQuickReply()` ya da QuickReplyGate'in native zaman asimi.
    val pending = goAsync()
    if (pending != null) QuickReplyGate.hold(pending)
    // Servis ayaga kalkana kadar islemci uyumasin (HeadlessJsTaskService dokumani: receiver'dan baslatirken sart).
    HeadlessJsTaskService.acquireWakeLockNow(context)
    try {
      context.startService(service)
    } catch (e: Exception) {
      // Android 12+ arka plan servis kisiti (bildirim eyleminden normalde muaf; MIUI'de gozlenmeli).
      Log.e(TAG, "servis baslatilamadi", e)
      QuickReplyGate.finishOldest() // gorev hic baslamadi: alicinin cikisini bekletme
    }
  }

  private companion object {
    const val TAG = "QuickReplyReceiver"
  }
}
