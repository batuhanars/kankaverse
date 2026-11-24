package expo.modules.conversationnotification

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Process
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.concurrent.atomic.AtomicLong

/**
 * C72: gelen arama push'unu (v2 `call` / `call_end`) JS'i BEKLEMEDEN cizer. Dusuk bellekli cihazda (MIUI, 4 GB)
 * React Native 3-5 sn'de ayaga kalkmadan surec oldurulur; arama bildirimini yalniz JS cizince hic gorunmuyordu.
 * JS ayaga kalkarsa `isNativeCallShowing` ile bu bildirimi sahiplenir, ikinci bildirim cizmez.
 *
 * Bu nesne yalniz cizer/kapatir; kanal JS'te kurulur (burada KURULMAZ), metinler JS onbellegindedir (gomulu metin yok).
 */
internal object CallPush {
  private const val TAG = "CallPush"
  private const val CHANNEL_ID = "incoming_call_v5" // incomingCall.ts CHANNEL_ID ile ayni (C73: desen degisti, v4 -> v5)
  private const val NOTIFICATION_ID = 7201
  const val TAG_PREFIX = "kv-call:"
  private const val RING_TIMEOUT_MS = 30_000L // sunucu ttl'i ve JS RING_TIMEOUT_MS ile ayni

  // Dokunma/Katil ekstralari (JS'e consumeAction ile tasinir) ve Reddet gorevi icin.
  const val EXTRA_CALL_ACTION = "kvCallAction"
  const val EXTRA_CHANNEL_ID = "channelId"
  const val EXTRA_CALLER_NAME = "callerName"
  const val EXTRA_IS_GROUP = "isGroup"
  const val EXTRA_POSTED_AT = "postedAt"
  const val ACTION_ACCEPT = "accept"
  const val ACTION_OPEN = "open"
  const val ACTION_REJECT = "reject"

  private val actionCounter = AtomicLong()

  class Incoming(
    val kind: String,
    val channelId: String,
    val callerName: String?,
    val isGroup: Boolean,
    /** Yalniz `call_end`: canceled / answered / rejected; eski sunucuda null. */
    val reason: String?,
  )

  /** v2 `call`/`call_end`; `call` icin `callerId` zorunlu. Aksi halde (arama degil/eksik alan) null. */
  fun parse(data: Map<String, String>): Incoming? {
    val p = PushHold.v2Payload(data) ?: return null
    val kind = p.optString("kind")
    if (kind != "call" && kind != "call_end") return null
    val channelId = PushHold.str(p, "callChannelId") ?: return null
    if (kind == "call" && PushHold.str(p, "callerId") == null) return null
    return Incoming(kind, channelId, PushHold.str(p, "callerName"), p.optBoolean("isGroup", false), PushHold.str(p, "reason"))
  }

  /** `super.onMessageReceived`'dan ONCE cagrilir. Kosullar saglanmazsa hicbir sey yapmaz (JS yolu surer). */
  fun handle(context: Context, incoming: Incoming) {
    if (incoming.kind == "call_end") {
      cancel(context, incoming.channelId)
      // C73: yalniz arayan kapattiysa cevapsiz; baska cihazda yanit (ya da nedeni bilinmeyen eski sunucu) sessiz.
      if (incoming.reason == "canceled") {
        MissedCall.missed(context, incoming.channelId)
      } else {
        MissedCall.resolve(context, incoming.channelId)
      }
      return
    }
    // On planda WS + uygulama ici serit calisir; native cizim burada cift sinyal olur.
    if (isAppForeground(context)) return
    // Sahip karari 2026-08-12: arkada + izin yok = hicbir sey.
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
    if (!isChannelUsable(context)) return
    if (isShowing(context, incoming.channelId)) return // ayni kanala ikinci push: var olani birak
    draw(context, incoming)
  }

  private fun draw(context: Context, incoming: Incoming) {
    val prefs = context.getSharedPreferences(PushHold.PREFS, Context.MODE_PRIVATE)
    val titleTemplate = prefs.getString(if (incoming.isGroup) "callGroupTitle" else "callTitle", null)
    val bodyTemplate = prefs.getString(if (incoming.isGroup) "callGroupBody" else "callBody", null)
    val rejectLabel = prefs.getString("callRejectLabel", null)
    val joinLabel = prefs.getString("callJoinLabel", null)
    // Onbellek bossa (guncellemeden sonra uygulama hic acilmamis) cizme: gomulu metin yok.
    if (titleTemplate == null || bodyTemplate == null || rejectLabel == null || joinLabel == null) return

    val postedAt = System.currentTimeMillis()
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(ConversationNotifier.smallIconRes(context))
      .setContentTitle(titleTemplate)
      .setContentText(bodyTemplate.replace("{name}", incoming.callerName ?: ""))
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(false)
      .setOngoing(false)
      // Surec olse bile sistem kaldirir; zil suresi sunucu ttl'i ile ayni.
      .setTimeoutAfter(RING_TIMEOUT_MS)
      .setWhen(postedAt)
      .addAction(0, rejectLabel, rejectIntent(context, incoming, postedAt))
    openIntent(context, incoming.channelId, incoming.callerName, incoming.isGroup)?.let { builder.setContentIntent(it) }
    activityIntent(context, incoming.channelId, incoming.callerName, incoming.isGroup, ACTION_ACCEPT)
      ?.let { builder.addAction(0, joinLabel, it) }
    prefs.getString("color", null)
      ?.let { c -> runCatching { Color.parseColor(c) }.getOrNull() }
      ?.let { builder.setColor(it) }
    val notification = builder.build()
    // C72 Rev.1: kanal titresimi bildirim basina TEK atis; JS'in Vibration.vibrate dongusu native sahiplenmede yok.
    // INSISTENT ses + titresimi bildirim kapanana (kabul/reddet/call_end/30 sn) dek tekrarlar; zil boyle olur.
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    try {
      NotificationManagerCompat.from(context).notify(TAG_PREFIX + incoming.channelId, NOTIFICATION_ID, notification)
      MissedCall.ringStarted(context, incoming.channelId, incoming.callerName, incoming.isGroup, postedAt)
    } catch (e: SecurityException) {
      Log.w(TAG, "POST_NOTIFICATIONS izni yok", e)
    }
  }

  /** Govdeye dokunma (zil ve C73 cevapsiz bildirimi): sohbeti acar. */
  fun openIntent(context: Context, channelId: String, callerName: String?, isGroup: Boolean): PendingIntent? =
    activityIntent(context, channelId, callerName, isGroup, ACTION_OPEN)

  /** Katil / govdeye dokunma: MainActivity (baslatma intent'i), JS ekstrayi acilista okur. */
  private fun activityIntent(
    context: Context,
    channelId: String,
    callerName: String?,
    isGroup: Boolean,
    action: String,
  ): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    launch.putExtra(EXTRA_CALL_ACTION, action)
      .putExtra(EXTRA_CHANNEL_ID, channelId)
      .putExtra(EXTRA_CALLER_NAME, callerName)
      .putExtra(EXTRA_IS_GROUP, isGroup)
    // Kanal + eylem basina ayri request code (intent esitligi ekstralara bakmaz).
    return PendingIntent.getActivity(
      context, requestCode(channelId, action), launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Reddet: headless JS servisi; `postedAt` ile JS "eski yanit" kuralini uygular. */
  private fun rejectIntent(context: Context, incoming: Incoming, postedAt: Long): PendingIntent {
    val intent = Intent(context, CallActionService::class.java)
      .putExtra(EXTRA_CALL_ACTION, ACTION_REJECT)
      .putExtra(EXTRA_CHANNEL_ID, incoming.channelId)
      .putExtra(EXTRA_IS_GROUP, incoming.isGroup)
      .putExtra(EXTRA_POSTED_AT, postedAt)
    return PendingIntent.getService(
      context, requestCode(incoming.channelId, ACTION_REJECT), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun requestCode(channelId: String, action: String): Int = "$TAG_PREFIX$channelId:$action".hashCode()

  /**
   * Katil/dokunma ekstralarini okur ve TUKETIR (bir kez), bildirimi kapatir (autoCancel kapali).
   * Arama eylemi intent'i degilse null. `consumeTap` deseni.
   */
  fun consumeAction(context: Context, intent: Intent): Map<String, Any?>? {
    val action = intent.getStringExtra(EXTRA_CALL_ACTION) ?: return null
    val channelId = intent.getStringExtra(EXTRA_CHANNEL_ID) ?: return null
    val result = mapOf(
      "action" to action,
      "channelId" to channelId,
      "callerName" to (intent.getStringExtra(EXTRA_CALLER_NAME) ?: ""),
      "isGroup" to intent.getBooleanExtra(EXTRA_IS_GROUP, false),
      // JS ayni eylemi (olay + getInitialCallAction) iki kez islemesin diye artan kimlik.
      "tapId" to actionCounter.incrementAndGet().toDouble(),
    )
    intent.removeExtra(EXTRA_CALL_ACTION)
    intent.removeExtra(EXTRA_CHANNEL_ID)
    intent.removeExtra(EXTRA_CALLER_NAME)
    intent.removeExtra(EXTRA_IS_GROUP)
    cancel(context, channelId)
    // C73: Katil yanittir (cevapsiz dusmez). Govdeye dokunmak degil: acip cevap vermezse cevapsiz duser.
    if (action == ACTION_ACCEPT) MissedCall.resolve(context, channelId)
    return result
  }

  fun cancel(context: Context, channelId: String) {
    NotificationManagerCompat.from(context).cancel(TAG_PREFIX + channelId, NOTIFICATION_ID)
  }

  fun isShowing(context: Context, channelId: String): Boolean =
    activeCallTags(context).contains(TAG_PREFIX + channelId)

  /** Bayat temizlik: `exceptChannelId` disindaki tum native arama bildirimlerini kaldirir. */
  fun cancelAll(context: Context, exceptChannelId: String?) {
    val keep = exceptChannelId?.let { TAG_PREFIX + it }
    activeCallTags(context)
      .filter { it != keep }
      .forEach { NotificationManagerCompat.from(context).cancel(it, NOTIFICATION_ID) }
  }

  private fun activeCallTags(context: Context): List<String> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return emptyList()
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return try {
      manager.activeNotifications
        .filter { it.id == NOTIFICATION_ID && it.tag?.startsWith(TAG_PREFIX) == true }
        .mapNotNull { it.tag }
    } catch (e: Exception) {
      Log.w(TAG, "aktif bildirimler okunamadi", e)
      emptyList()
    }
  }

  /** Kanali JS kurar; yoksa ya da kullanici kapattiysa (NONE) cizilmez. */
  private fun isChannelUsable(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = manager.getNotificationChannel(CHANNEL_ID) ?: return false
    return channel.importance != NotificationManager.IMPORTANCE_NONE
  }

  /** Yalniz gorunur bir ekran (IMPORTANCE_FOREGROUND); on plan servisi/onbellek sureci "on plan" sayilmaz. */
  private fun isAppForeground(context: Context): Boolean {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val pid = Process.myPid()
    val me = manager.runningAppProcesses?.firstOrNull { it.pid == pid }
    return me?.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }
}
