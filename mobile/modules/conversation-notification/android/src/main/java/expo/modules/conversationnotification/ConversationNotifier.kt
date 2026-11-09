package expo.modules.conversationnotification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
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

/**
 * MessagingStyle sohbet bildirimi cizer. Arka plan thread'inden cagrilir.
 * Is mantigi YOK (C50 sozlesme: metin/kime-gosterilir karari JS'te); yalnizca cizer.
 */
object ConversationNotifier {
  private const val TAG = "ConversationNotifier"
  private const val SHORTCUT_PREFIX = "conv_"
  private const val MAX_MESSAGES = 10

  // Dokunma intent ekstralari (JS'e consumeTap ile tasinir).
  private const val EXTRA_CONVERSATION_ID = "kv_conversation_id"
  private const val EXTRA_TYPE = "kv_type"
  private const val EXTRA_GUILD_ID = "kv_guild_id"
  private const val EXTRA_MESSAGE_ID = "kv_message_id"

  fun show(context: Context, p: Map<String, Any?>) {
    val conversationId = p["conversationId"] as? String ?: return
    val title = p["conversationTitle"] as? String
    val isGroup = p["isGroup"] as? Boolean ?: false
    val senderId = p["senderId"] as? String ?: conversationId
    val senderName = p["senderName"] as? String ?: ""
    val text = p["text"] as? String ?: ""
    val timestamp = (p["timestamp"] as? Number)?.toLong() ?: System.currentTimeMillis()
    val channelId = p["notificationChannelId"] as? String ?: "default"
    val meName = p["meName"] as? String ?: ""
    val color = (p["color"] as? String)?.let { runCatching { Color.parseColor(it) }.getOrNull() }
    val type = p["type"] as? String
    val guildId = p["guildId"] as? String
    val messageId = p["messageId"] as? String

    val avatar = (p["senderAvatarUrl"] as? String)?.let { downloadCircle(it) }
    val convIcon = (p["conversationIconUrl"] as? String)?.let { downloadCircle(it) }

    val senderBuilder = Person.Builder()
      .setKey(senderId)
      .setName(senderName)
      .setImportant(true)
    if (avatar != null) senderBuilder.setIcon(IconCompat.createWithBitmap(avatar))
    val sender = senderBuilder.build()
    val me = Person.Builder().setName(meName).setKey("me").build()

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val notifId = conversationId.hashCode()

    // Ayni sohbetin gorunen bildirimi varsa mesajlarini al, yenisini ekle, zaman sirasina diz, son
    // MAX_MESSAGES kadarini tut. MessagingStyle'dan mesaj silinemedigi icin stil yeniden kurulur;
    // son mesaj listenin sonundadir (kucuk halde gorunen mesaj odur).
    val newMessage = NotificationCompat.MessagingStyle.Message(text, timestamp, sender)
    val messages = (existingMessages(manager, conversationId, notifId) + newMessage)
      .sortedBy { it.timestamp }
      .takeLast(MAX_MESSAGES)
    val style = NotificationCompat.MessagingStyle(me)
    style.isGroupConversation = isGroup
    if (isGroup && title != null) style.conversationTitle = title
    messages.forEach { style.addMessage(it) }

    val shortcutId = SHORTCUT_PREFIX + conversationId
    pushShortcut(context, shortcutId, title ?: senderName, sender, convIcon ?: avatar)

    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    launch?.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    launch?.putExtra(EXTRA_CONVERSATION_ID, conversationId)
    type?.let { launch?.putExtra(EXTRA_TYPE, it) }
    guildId?.let { launch?.putExtra(EXTRA_GUILD_ID, it) }
    messageId?.let { launch?.putExtra(EXTRA_MESSAGE_ID, it) }
    // Her sohbete ayri request code (notifId); UPDATE_CURRENT ekstralarin yenilenmesi icin sart
    // (intent esitligi ekstralara bakmaz). Android 12+ icin IMMUTABLE.
    val contentIntent = launch?.let {
      PendingIntent.getActivity(context, notifId, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    val builder = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(smallIconRes(context))
      .setStyle(style)
      // Bazi uretici arayuzleri (MIUI) kucuk halde stilin degil bu alanlarin metnini cizer: son mesaj.
      .setContentTitle(title ?: senderName)
      .setContentText(text)
      .setShortcutId(shortcutId)
      .setLocusId(LocusIdCompat(shortcutId))
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setWhen(timestamp)
      .setShowWhen(true)
      .setAutoCancel(true)
    if (contentIntent != null) builder.setContentIntent(contentIntent)
    if (color != null) builder.setColor(color)
    // Android <11 icin sol tarafta buyuk ikon.
    val large = convIcon ?: avatar
    if (large != null) builder.setLargeIcon(large)

    try {
      NotificationManagerCompat.from(context).notify(conversationId, notifId, builder.build())
    } catch (e: SecurityException) {
      Log.w(TAG, "POST_NOTIFICATIONS izni yok", e)
    }
  }

  /** Bir sohbetin gorunen bildirimini kaldirir (okundu / dokunma). */
  fun dismiss(context: Context, conversationId: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(conversationId, conversationId.hashCode())
  }

  /**
   * Dokunma intent'inin ekstralarini okur ve TUKETIR (ayni dokunus iki kez teslim edilmesin),
   * o sohbetin bildirimini kapatir. Dokunma intent'i degilse null.
   */
  fun consumeTap(context: Context, intent: Intent): Map<String, Any?>? {
    val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID) ?: return null
    val tap = mapOf(
      "conversationId" to conversationId,
      "type" to intent.getStringExtra(EXTRA_TYPE),
      "guildId" to intent.getStringExtra(EXTRA_GUILD_ID),
      "messageId" to intent.getStringExtra(EXTRA_MESSAGE_ID),
    )
    intent.removeExtra(EXTRA_CONVERSATION_ID)
    intent.removeExtra(EXTRA_TYPE)
    intent.removeExtra(EXTRA_GUILD_ID)
    intent.removeExtra(EXTRA_MESSAGE_ID)
    dismiss(context, conversationId)
    return tap
  }

  private fun existingMessages(
    manager: NotificationManager,
    tag: String,
    id: Int,
  ): List<NotificationCompat.MessagingStyle.Message> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return emptyList()
    return try {
      val active = manager.activeNotifications.firstOrNull { it.id == id && it.tag == tag }
      if (active == null) emptyList()
      else NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(active.notification)
        ?.messages ?: emptyList()
    } catch (e: Exception) {
      Log.w(TAG, "mevcut mesajlar okunamadi", e)
      emptyList()
    }
  }

  private fun pushShortcut(context: Context, id: String, label: String, person: Person, icon: Bitmap?) {
    try {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
      intent.action = Intent.ACTION_VIEW
      // Kisayol etiketi bos olamaz; metin gomulmez, kimlik yedegi.
      val b = ShortcutInfoCompat.Builder(context, id)
        .setShortLabel(if (label.isEmpty()) id else label)
        .setLongLived(true)
        .setPerson(person)
        .setIntent(intent)
      if (icon != null) b.setIcon(IconCompat.createWithBitmap(icon))
      // Sinira ulasilirsa en az kullanilan kisayol duser; hata bildirimi engellemez.
      ShortcutManagerCompat.pushDynamicShortcut(context, b.build())
    } catch (e: Exception) {
      Log.w(TAG, "kisayol basarisiz", e)
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
