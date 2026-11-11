package expo.modules.conversationnotification

import android.content.Context
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch

/**
 * E3 Rev.4 §11.1: push penceresini tutma. `KvFirebaseMessagingService` sifreli v2 mesaj push'unda JS "bitti"
 * (`pushHandled`) diyene ya da native zaman asimi (8 sn) dolana dek `onMessageReceived`'den donmez; boylece
 * surec (MIUI) dondurulmaz ve JS cozup bildirimi TEK SEFERDE gercek metinle cizer.
 *
 * Bu nesne yalniz durum tutar ve sure dolarsa GENEL metinle cizim yaptirir; metin/kime-gosterilir karari yoktur.
 * Zamanlayici kurali (§10): burada JS zamanlayicisi yok; bekleme native `CountDownLatch.await`.
 */
internal object PushHold {
  const val HOLD_TIMEOUT_SECONDS = 8L
  private const val FALLBACK_CHANNEL_ID = "messages_v6" // push.ts MESSAGE_CHANNEL_ID ile ayni; JS onbellegi yoksa yedek
  private const val PREFS = "kv_notification_defaults"
  private val DEFAULT_KEYS = listOf("replyLabel", "markReadLabel", "muteLabel", "meName", "color", "notificationChannelId")

  private val latches = ConcurrentHashMap<String, CountDownLatch>()
  private val jsDrew: MutableSet<String> = ConcurrentHashMap.newKeySet()
  private val fallbackDrew: MutableSet<String> = ConcurrentHashMap.newKeySet()

  /** Tutulacak push: sifreli yuklu v2 `message`. Aksi halde (bekletme yok) null. */
  class Incoming(val messageId: String, val payload: JSONObject)

  /**
   * JS `extractV2` ile ayni alanlar: Expo FCM `data` haritasinda nesneyi `body` (JSON metni) altinda tasir;
   * `dataString` ve duz alanlar yedek.
   */
  fun parse(data: Map<String, String>): Incoming? {
    val candidates = listOf(data["body"], data["dataString"]).mapNotNull { raw ->
      raw?.let { runCatching { JSONObject(it) }.getOrNull() }
    } + JSONObject(data as Map<*, *>)
    val p = candidates.firstOrNull { it.optString("v") == "2" } ?: return null
    if (p.optString("kind") != "message" || !p.has("e2ee") || p.isNull("e2ee")) return null
    val messageId = str(p, "messageId") ?: return null
    if (str(p, "conversationId") == null) return null
    return Incoming(messageId, p)
  }

  fun register(messageId: String): CountDownLatch = CountDownLatch(1).also { latches[messageId] = it }

  fun unregister(messageId: String) {
    latches.remove(messageId)
    jsDrew.remove(messageId)
  }

  /** JS gorevi bitti (modul `pushHandled`). Bilinmeyen kimlik zararsiz. */
  fun handled(messageId: String) {
    latches[messageId]?.countDown()
  }

  /** JS bu mesaj icin bildirimi cizdi (modul `show`); sure dolsa bile cift cizim yapilmaz. */
  fun markJsDrew(messageId: String?) {
    if (messageId != null && latches.containsKey(messageId)) jsDrew.add(messageId)
  }

  /**
   * JS gec kalip native yedek cizimden SONRA cizmek isterse: ikinci satir eklemek yerine mevcut satirin metni
   * guncellenir. Kaydi tuketir (bir kez).
   */
  fun takeFallbackDrew(messageId: String?): Boolean = messageId != null && fallbackDrew.remove(messageId)

  /** Uygulama JS'i her gorevde etiket/renk/"ben" adini onbellege yazar; native yedek cizim bunlari kullanir. */
  fun saveDefaults(context: Context, defaults: Map<String, Any?>) {
    val editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
    DEFAULT_KEYS.forEach { key -> (defaults[key] as? String)?.let { editor.putString(key, it) } }
    editor.apply()
  }

  /**
   * Sure doldu ve JS cizmedi: payload'daki GENEL metinle (`text`) cizer. Yalniz cizim; cizim parametreleri
   * JS'in verdikleri ile ayni anahtarlar (index.ts ConversationNotificationParams).
   */
  fun drawFallback(context: Context, messageId: String, p: JSONObject) {
    if (jsDrew.remove(messageId)) return // JS cizmis ama bitti dememis: ikinci cizim yok
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val params = mapOf<String, Any?>(
      "conversationId" to str(p, "conversationId"),
      "conversationTitle" to str(p, "conversationTitle"),
      "isGroup" to p.optBoolean("isGroup", false),
      "senderId" to str(p, "senderId"),
      "senderName" to str(p, "senderName"),
      "senderAvatarUrl" to str(p, "senderAvatarUrl"),
      "conversationIconUrl" to str(p, "conversationIconUrl"),
      "text" to (str(p, "text") ?: "").take(200),
      "timestamp" to (if (p.has("timestamp")) p.optLong("timestamp") else System.currentTimeMillis()),
      "type" to str(p, "type"),
      "guildId" to str(p, "guildId"),
      "messageId" to messageId,
      "notificationChannelId" to (prefs.getString("notificationChannelId", null) ?: FALLBACK_CHANNEL_ID),
      "meName" to (prefs.getString("meName", null) ?: ""),
      "color" to prefs.getString("color", null),
      "replyLabel" to prefs.getString("replyLabel", null),
      "markReadLabel" to prefs.getString("markReadLabel", null),
      "muteLabel" to prefs.getString("muteLabel", null),
    )
    fallbackDrew.add(messageId)
    ConversationNotifier.show(context, params)
  }

  /** Eksik ya da JSON null ise null (org.json `optString` null'u "null" metnine cevirir). */
  private fun str(p: JSONObject, key: String): String? =
    if (p.isNull(key)) null else p.optString(key).takeIf { it.isNotEmpty() }
}
