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

  /** C72: native arama bildirimi Katil/dokunma eylemi; `pendingTap` ile ayni desen. */
  @Volatile private var pendingCallAction: Map<String, Any?>? = null

  private fun captureCallAction(intent: Intent?, emit: Boolean) {
    val context = appContext.reactContext
    if (context == null || intent == null || !intent.hasExtra(CallPush.EXTRA_CALL_ACTION)) return
    val action = CallPush.consumeAction(context, intent) ?: return
    pendingCallAction = action
    if (emit) sendEvent("onCallAction", action)
  }

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
    Events("onTap", "onCallAction")

    // Map ile alinir: alan sozlesmesi index.ts ConversationNotificationParams.
    AsyncFunction("show") { params: Map<String, Any?> ->
      val context = appContext.reactContext
      if (context != null) {
        val messageId = params["messageId"] as? String
        if (PushHold.takeFallbackDrew(messageId)) {
          // E3 Rev.4: sure dolunca native genel metinle cizdi; JS gec geldi -> ikinci satir yerine metni guncelle.
          ConversationNotifier.updateMessageText(
            context,
            params["conversationId"] as? String ?: return@AsyncFunction,
            messageId ?: return@AsyncFunction,
            params["text"] as? String ?: "",
          )
          Unit
        } else {
          PushHold.markJsDrew(messageId)
          ConversationNotifier.show(context, params)
          Unit
        }
      }
    }

    // E3 Rev.4: JS gorevi bitti; KvFirebaseMessagingService'in tuttugu push penceresini birakir.
    AsyncFunction("pushHandled") { messageId: String ->
      PushHold.handled(messageId)
    }

    // E3 Rev.4: bu fonksiyonun varligi JS'e "push penceresi tutuluyor" der (modul yeni surum).
    Function("isPushHoldActive") { true }

    // E3 Rev.4: native yedek cizim icin etiket/renk/"ben" adi onbellegi (SharedPreferences).
    AsyncFunction("setNotificationDefaults") { defaults: Map<String, Any?> ->
      val context = appContext.reactContext
      if (context != null) PushHold.saveDefaults(context, defaults)
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

    // C72: JS arama bildirimini sahiplenmeden once native cizim var mi (tag `kv-call:<id>`).
    AsyncFunction("isNativeCallShowing") { channelId: String ->
      val context = appContext.reactContext
      context != null && CallPush.isShowing(context, channelId)
    }

    AsyncFunction("dismissNativeCall") { channelId: String ->
      appContext.reactContext?.let { CallPush.cancel(it, channelId) }
    }

    // Bayat temizlik: `exceptChannelId` (JS'in sahiplendigi) disindaki native arama bildirimlerini kaldirir.
    AsyncFunction("dismissNativeCalls") { exceptChannelId: String? ->
      appContext.reactContext?.let { CallPush.cancelAll(it, exceptChannelId) }
    }

    // Bekleyen Katil/ac eylemi (soguk acilis); bir kez teslim edilir.
    Function("getInitialCallAction") {
      if (pendingCallAction == null) captureCallAction(appContext.currentActivity?.intent, false)
      val action = pendingCallAction
      pendingCallAction = null
      action
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
      captureCallAction(appContext.currentActivity?.intent, true)
    }

    OnNewIntent { intent ->
      capture("newIntent", intent, true)
      captureCallAction(intent, true)
    }
  }

  private companion object {
    const val TAG = "ConversationTap"
  }
}
