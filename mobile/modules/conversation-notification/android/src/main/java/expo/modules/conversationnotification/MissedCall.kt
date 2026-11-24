package expo.modules.conversationnotification

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * C73: cevapsiz arama. Native zil bildirimi cizilince bekleyen kayit yazilir ve 30 sn sonrasina yedek alarm kurulur.
 * Arayan kapatirsa (`call_end` reason=canceled) ya da alarm calarsa kayit tek seferlik alinir, zil kapanir ve
 * "X seni aradi" bildirimi panelde kalir. Kabul/ret (bu cihazda ya da hesabin baska cihazinda) kaydi sessizce siler.
 *
 * Kanal ve metinler JS'ten gelir (kanal burada KURULMAZ, gomulu metin yok); biri eksikse cizilmez.
 */
internal object MissedCall {
  private const val TAG = "MissedCall"
  private const val PENDING_PREFS = "kv-call-pending"
  private const val CHANNEL_ID = "missed_call_v1" // incomingCall.ts MISSED_CHANNEL_ID ile ayni
  private const val NOTIFICATION_ID = 7202
  private const val TAG_PREFIX = "kv-missed:"
  private const val FALLBACK_DELAY_MS = 30_000L // zil suresi (CallPush RING_TIMEOUT_MS) ile ayni
  private const val MAX_AGE_MS = 120_000L // daha eski kayit bayat: cevapsiz cizilmez
  const val EXTRA_CHANNEL_ID = "channelId"

  private val lock = Any()

  /** Zil cizildi: kayit + yedek alarm. */
  fun ringStarted(context: Context, channelId: String, callerName: String?, isGroup: Boolean, at: Long) {
    val record = JSONObject()
      .put("callerName", callerName ?: "")
      .put("isGroup", isGroup)
      .put("at", at)
    synchronized(lock) {
      prefs(context).edit().putString(channelId, record.toString()).apply()
    }
    val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    // Kesin alarm izni istemez; birkac sn gecikebilir. Arayan zaten 30 sn'de kapatir, bu yalniz yedek.
    alarm.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + FALLBACK_DELAY_MS, alarmIntent(context, channelId))
  }

  /** Kabul / ret / baska cihazda yanitlandi: kayit ve alarm silinir, cevapsiz YOK. */
  fun resolve(context: Context, channelId: String) {
    take(context, channelId)
  }

  /** Arayan kapatti ya da zil suresi doldu: kayit hala varsa cevapsiz cizilir (iki yol yarisirsa yalniz biri). */
  fun missed(context: Context, channelId: String) {
    val record = take(context, channelId) ?: return
    CallPush.cancel(context, channelId)
    val at = record.optLong("at", 0L)
    if (at <= 0L || System.currentTimeMillis() - at > MAX_AGE_MS) return
    draw(context, channelId, record.optString("callerName"), record.optBoolean("isGroup", false), at)
  }

  /** Kaydi alir ve siler (senkron, tek seferlik); alarm da iptal edilir. */
  private fun take(context: Context, channelId: String): JSONObject? {
    val raw = synchronized(lock) {
      val p = prefs(context)
      val value = p.getString(channelId, null)
      if (value != null) p.edit().remove(channelId).commit()
      value
    }
    val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarm.cancel(alarmIntent(context, channelId))
    return raw?.let { runCatching { JSONObject(it) }.getOrNull() }
  }

  private fun draw(context: Context, channelId: String, callerName: String, isGroup: Boolean, at: Long) {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled() || !isChannelUsable(context)) return
    val cache = context.getSharedPreferences(PushHold.PREFS, Context.MODE_PRIVATE)
    val title = cache.getString(if (isGroup) "callMissedGroupTitle" else "callMissedTitle", null)
    val body = cache.getString(if (isGroup) "callMissedGroupBody" else "callMissedBody", null)
    if (title == null || body == null) return

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(ConversationNotifier.smallIconRes(context))
      .setContentTitle(title)
      .setContentText(body.replace("{name}", callerName))
      .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
      .setWhen(at)
      .setShowWhen(true)
      .setAutoCancel(true)
    CallPush.openIntent(context, channelId, callerName, isGroup)?.let { builder.setContentIntent(it) }
    cache.getString("color", null)
      ?.let { c -> runCatching { Color.parseColor(c) }.getOrNull() }
      ?.let { builder.setColor(it) }
    try {
      NotificationManagerCompat.from(context).notify(TAG_PREFIX + channelId, NOTIFICATION_ID, builder.build())
    } catch (e: SecurityException) {
      Log.w(TAG, "POST_NOTIFICATIONS izni yok", e)
    }
  }

  private fun alarmIntent(context: Context, channelId: String): PendingIntent {
    val intent = Intent(context, MissedCallReceiver::class.java).putExtra(EXTRA_CHANNEL_ID, channelId)
    return PendingIntent.getBroadcast(
      context, "$TAG_PREFIX$channelId".hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun isChannelUsable(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = manager.getNotificationChannel(CHANNEL_ID) ?: return false
    return channel.importance != NotificationManager.IMPORTANCE_NONE
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PENDING_PREFS, Context.MODE_PRIVATE)
}

/** C73: 30 sn yedek alarmi. Arayan kapatma push'u gelmediyse (ag, cokme) cevapsiz yine duser. */
class MissedCallReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val channelId = intent.getStringExtra(MissedCall.EXTRA_CHANNEL_ID) ?: return
    MissedCall.missed(context.applicationContext, channelId)
  }
}
