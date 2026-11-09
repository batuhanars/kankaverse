package expo.modules.conversationnotification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import java.net.HttpURLConnection
import java.net.URL

/** SPIKE: MessagingStyle sohbet bildirimi cizer. Arka plan thread'inden cagrilir. */
object ConversationNotifier {
  private const val TAG = "spike-push"
  private const val SHORTCUT_PREFIX = "conv_"

  fun show(context: Context, p: Map<String, Any?>) {
    val conversationId = p["conversationId"] as? String ?: return
    val title = p["conversationTitle"] as? String
    val isGroup = p["isGroup"] as? Boolean ?: false
    val senderId = p["senderId"] as? String ?: conversationId
    val senderName = p["senderName"] as? String ?: ""
    val text = p["text"] as? String ?: ""
    val timestamp = (p["timestamp"] as? Number)?.toLong() ?: System.currentTimeMillis()
    val channelId = p["notificationChannelId"] as? String ?: "default"

    val avatar = (p["senderAvatarUrl"] as? String)?.let { downloadCircle(it) }
    val convIcon = (p["conversationIconUrl"] as? String)?.let { downloadCircle(it) }

    val senderBuilder = Person.Builder()
      .setKey(senderId)
      .setName(senderName)
      .setImportant(true)
    if (avatar != null) senderBuilder.setIcon(IconCompat.createWithBitmap(avatar))
    val sender = senderBuilder.build()
    val me = Person.Builder().setName("Ben").setKey("me").build()

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val notifId = conversationId.hashCode()

    // Ayni sohbetin gorunen bildirimi varsa onun MessagingStyle'ina ekle.
    val style = existingStyle(manager, conversationId, notifId)
      ?: NotificationCompat.MessagingStyle(me)
    style.isGroupConversation = isGroup
    if (isGroup && title != null) style.conversationTitle = title
    style.addMessage(NotificationCompat.MessagingStyle.Message(text, timestamp, sender))

    val shortcutId = SHORTCUT_PREFIX + conversationId
    pushShortcut(context, shortcutId, title ?: senderName, sender, convIcon ?: avatar)

    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    launch?.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    val contentIntent = launch?.let {
      PendingIntent.getActivity(context, notifId, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    val builder = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(smallIconRes(context))
      .setStyle(style)
      .setShortcutId(shortcutId)
      .setLocusId(LocusIdCompat(shortcutId))
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setWhen(timestamp)
      .setShowWhen(true)
      .setAutoCancel(true)
    if (contentIntent != null) builder.setContentIntent(contentIntent)
    // Android <11 icin sol tarafta buyuk ikon.
    val large = convIcon ?: avatar
    if (large != null) builder.setLargeIcon(large)

    try {
      NotificationManagerCompat.from(context).notify(conversationId, notifId, builder.build())
    } catch (e: SecurityException) {
      Log.w(TAG, "POST_NOTIFICATIONS izni yok", e)
    }
  }

  private fun existingStyle(manager: NotificationManager, tag: String, id: Int): NotificationCompat.MessagingStyle? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null
    return try {
      val active = manager.activeNotifications.firstOrNull { it.id == id && it.tag == tag }
      if (active == null) null
      else NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(active.notification)
    } catch (e: Exception) {
      Log.w(TAG, "mevcut stil okunamadi", e)
      null
    }
  }

  private fun pushShortcut(context: Context, id: String, label: String, person: Person, icon: Bitmap?) {
    try {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
      intent.action = Intent.ACTION_VIEW
      val b = ShortcutInfoCompat.Builder(context, id)
        .setShortLabel(if (label.isEmpty()) "Sohbet" else label)
        .setLongLived(true)
        .setPerson(person)
        .setIntent(intent)
      if (icon != null) b.setIcon(IconCompat.createWithBitmap(icon))
      ShortcutManagerCompat.pushDynamicShortcut(context, b.build())
    } catch (e: Exception) {
      Log.w(TAG, "shortcut basarisiz", e)
    }
  }

  /** Uygulamanin bildirim kucuk ikonu (expo-notifications plugin'i `notification_icon` drawable'i yazar). */
  private fun smallIconRes(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun downloadCircle(url: String): Bitmap? {
    return try {
      val conn = URL(url).openConnection() as HttpURLConnection
      conn.connectTimeout = 3000
      conn.readTimeout = 3000
      conn.instanceFollowRedirects = true
      conn.inputStream.use { stream ->
        val bmp = BitmapFactory.decodeStream(stream)
        if (bmp == null) null else circle(bmp)
      }
    } catch (e: Exception) {
      Log.w(TAG, "gorsel indirilemedi: $url", e)
      null
    }
  }

  private fun circle(src: Bitmap): Bitmap {
    val size = minOf(src.width, src.height)
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
    val left = (src.width - size) / 2
    val top = (src.height - size) / 2
    canvas.drawBitmap(src, Rect(left, top, left + size, top + size), Rect(0, 0, size, size), paint)
    return out
  }
}
