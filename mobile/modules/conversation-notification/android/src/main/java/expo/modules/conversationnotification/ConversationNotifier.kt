package expo.modules.conversationnotification

import android.app.Notification
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
import android.graphics.Typeface
import android.os.Build
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
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
  internal const val EXTRA_CONVERSATION_ID = "kv_conversation_id"
  internal const val EXTRA_TYPE = "kv_type"
  internal const val EXTRA_GUILD_ID = "kv_guild_id"
  private const val EXTRA_MESSAGE_ID = "kv_message_id"

  // MessagingStyle.Message extras anahtari (E3 Rev.2): satirin mesaj kimligi; yoksa satir degistirilemez.
  private const val EXTRA_MSG_ID = "kv_msg_id"

  private val tapCounter = java.util.concurrent.atomic.AtomicLong()

  /** RemoteInput sonuc anahtari (Cevapla eylemi). */
  internal const val REPLY_KEY = "kv_reply_text"

  // C55: eylem turu (alici -> JS). Eski bildirimlerde ekstra yoktur; yoklukta "reply" sayilir.
  internal const val EXTRA_ACTION = "kv_action"
  internal const val ACTION_REPLY = "reply"
  internal const val ACTION_MARK_READ = "markRead"
  internal const val ACTION_MUTE = "mute"

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
    val me = buildMe(meName, if (isGroup) p["meAvatarUrl"] as? String else null)

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val notifId = conversationId.hashCode()

    // Ayni sohbetin gorunen bildirimi varsa mesajlarini al, yenisini ekle, zaman sirasina diz, son
    // MAX_MESSAGES kadarini tut. MessagingStyle'dan mesaj silinemedigi icin stil yeniden kurulur;
    // son mesaj listenin sonundadir (kucuk halde gorunen mesaj odur).
    val newMessage = NotificationCompat.MessagingStyle.Message(text, timestamp, sender)
    // E3 Rev.2: JS sonradan bu satirin metnini degistirebilsin diye mesaj kimligi satira yazilir.
    messageId?.let { newMessage.extras.putString(EXTRA_MSG_ID, it) }
    val messages = (existingMessages(manager, conversationId, notifId) + newMessage)
      .sortedBy { it.timestamp }
      .takeLast(MAX_MESSAGES)
    val style = NotificationCompat.MessagingStyle(me)
    style.isGroupConversation = isGroup
    if (isGroup && title != null) style.conversationTitle = title
    messages.forEach { style.addMessage(it) }

    val shortcutId = SHORTCUT_PREFIX + conversationId
    // Sohbet simgesi: grupta grup simgesi ya da baş harf (gönderen avatarı ASLA), 1-1'de gönderen avatarı.
    val groupInitial = p["groupInitial"] as? String
    val conversationIcon: Bitmap? =
      if (isGroup) convIcon ?: groupInitial?.let { drawInitial(it, color) } else convIcon ?: avatar
    pushShortcut(context, shortcutId, title ?: senderName, sender, conversationIcon)

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
    (p["replyLabel"] as? String)?.let { label ->
      builder.addAction(buildReplyAction(context, notifId, label, conversationId, type, guildId))
    }
    (p["markReadLabel"] as? String)?.let { label ->
      builder.addAction(
        buildSimpleAction(
          context, label, conversationId, type, guildId, ACTION_MARK_READ,
          NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ,
        ),
      )
    }
    (p["muteLabel"] as? String)?.let { label ->
      builder.addAction(
        buildSimpleAction(
          context, label, conversationId, type, guildId, ACTION_MUTE,
          NotificationCompat.Action.SEMANTIC_ACTION_MUTE,
        ),
      )
    }
    if (color != null) builder.setColor(color)
    // Android <11 icin sol tarafta buyuk ikon.
    if (conversationIcon != null) builder.setLargeIcon(conversationIcon)

    try {
      NotificationManagerCompat.from(context).notify(conversationId, notifId, builder.build())
    } catch (e: SecurityException) {
      Log.w(TAG, "POST_NOTIFICATIONS izni yok", e)
    }
  }

  /** "Ben" kisisi; kendi statik avatari verilirse daire kirpilip simge olur (yalniz grup/ortam). */
  private fun buildMe(name: String, avatarUrl: String?): Person {
    val b = Person.Builder().setName(name).setKey("me")
    val icon = avatarUrl?.let { downloadCircle(it) }
    if (icon != null) b.setIcon(IconCompat.createWithBitmap(icon))
    return b.build()
  }

  /**
   * Cevapla eylemi. PendingIntent FLAG_MUTABLE olmak ZORUNDA (RemoteInput sonucu intent'e yazilir,
   * Android 12+); mutable oldugu icin intent ACIK (component'li) kurulur, ekstralar sabit.
   */
  private fun buildReplyAction(
    context: Context,
    notifId: Int,
    label: String,
    conversationId: String,
    type: String?,
    guildId: String?,
  ): NotificationCompat.Action {
    val intent = Intent(context, QuickReplyReceiver::class.java)
      .putExtra(EXTRA_CONVERSATION_ID, conversationId)
      .putExtra(EXTRA_ACTION, ACTION_REPLY)
    type?.let { intent.putExtra(EXTRA_TYPE, it) }
    guildId?.let { intent.putExtra(EXTRA_GUILD_ID, it) }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    val pending = PendingIntent.getBroadcast(context, notifId, intent, flags)
    val remoteInput = RemoteInput.Builder(REPLY_KEY).setLabel(label).build()
    return NotificationCompat.Action.Builder(smallIconRes(context), label, pending)
      .addRemoteInput(remoteInput)
      .setAllowGeneratedReplies(false)
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .setShowsUserInterface(false)
      .build()
  }

  /**
   * Okundu / Sessize al eylemi (C55). RemoteInput yok: IMMUTABLE, acik bilesen. Ayni aliciya giden
   * uc PendingIntent'in birbirine karismamasi icin sohbet + eylem basina ayri request code ve
   * ayri intent action verilir (intent esitligi ekstralara bakmaz).
   */
  private fun buildSimpleAction(
    context: Context,
    label: String,
    conversationId: String,
    type: String?,
    guildId: String?,
    action: String,
    semantic: Int,
  ): NotificationCompat.Action {
    val intent = Intent(context, QuickReplyReceiver::class.java)
      .setAction("kv.notification.$action")
      .putExtra(EXTRA_CONVERSATION_ID, conversationId)
      .putExtra(EXTRA_ACTION, action)
    type?.let { intent.putExtra(EXTRA_TYPE, it) }
    guildId?.let { intent.putExtra(EXTRA_GUILD_ID, it) }
    val requestCode = "$conversationId:$action".hashCode()
    val pending = PendingIntent.getBroadcast(
      context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Action.Builder(smallIconRes(context), label, pending)
      .setSemanticAction(semantic)
      .setShowsUserInterface(false)
      .build()
  }

  /**
   * Gorunen sohbet bildiriminin sonuna "ben"den (Person null) bir mesaj ekler; eylemler ve dokunma
   * intent'i acikca korunur. Bildirim yoksa false (kullanici kapatmis).
   * Ayni cagri hata gostergesi icin de kullanilir (JS metni hazirlar). Yeniden notify, RemoteInput'un
   * donen halkasini da kapatir.
   */
  fun appendOwnReply(
    context: Context,
    conversationId: String,
    text: String,
    timestamp: Long,
    meAvatarUrl: String?,
  ): Boolean {
    val active = activeConversationNotification(context, conversationId) ?: return false
    val old = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(active.notification)
      ?: return false
    // Grup/ortamda "ben" kisisi kendi avatariyla yeniden kurulur (eski Person simgesi tasinmayabilir);
    // 1-1'de Android satir avatari cizmez, eski kisi aynen kalir.
    val me = if (old.isGroupConversation) {
      buildMe(old.user.name?.toString() ?: "", meAvatarUrl)
    } else {
      old.user
    }
    val style = NotificationCompat.MessagingStyle(me)
    style.isGroupConversation = old.isGroupConversation
    old.conversationTitle?.let { style.conversationTitle = it }
    val own = NotificationCompat.MessagingStyle.Message(text, timestamp, null as Person?)
    (old.messages + own).sortedBy { it.timestamp }.takeLast(MAX_MESSAGES).forEach { style.addMessage(it) }
    return repost(context, conversationId, active.notification, style, text, timestamp)
  }

  /**
   * E3 Rev.2: gorunen bildirimdeki `messageId`'li satirin metnini degistirir (genel metin -> cozulmus metin).
   * Eylemler ve dokunma intent'i korunur, bildirim sessiz yenilenir. Bildirim ya da satir yoksa false
   * (kullanici kapatmis, eski satir, ya da satira kimlik yazilmamis).
   */
  fun updateMessageText(context: Context, conversationId: String, messageId: String, text: String): Boolean {
    val active = activeConversationNotification(context, conversationId) ?: return false
    val old = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(active.notification)
      ?: return false
    var found = false
    val messages = old.messages.map { m ->
      if (m.extras.getString(EXTRA_MSG_ID) != messageId) return@map m
      found = true
      val updated = NotificationCompat.MessagingStyle.Message(text, m.timestamp, m.person)
      updated.extras.putAll(m.extras)
      updated
    }
    if (!found) return false
    val style = NotificationCompat.MessagingStyle(old.user)
    style.isGroupConversation = old.isGroupConversation
    old.conversationTitle?.let { style.conversationTitle = it }
    messages.forEach { style.addMessage(it) }
    // Kucuk halde gorunen metin (MIUI): listedeki son mesaj; zaman damgasi bildirimin kendisinde kalir.
    val shown = messages.lastOrNull()?.text ?: text
    return repost(context, conversationId, active.notification, style, shown, active.notification.`when`)
  }

  /** Bir sohbetin gorunen bildirimi; yoksa (kapatilmis) ya da okunamazsa null. */
  private fun activeConversationNotification(context: Context, conversationId: String): StatusBarNotification? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val notifId = conversationId.hashCode()
    return try {
      manager.activeNotifications.firstOrNull { it.id == notifId && it.tag == conversationId }
    } catch (e: Exception) {
      Log.w(TAG, "aktif bildirimler okunamadi", e)
      null
    }
  }

  /**
   * Gorunen bildirimi yeni stille sessizce yeniden kurar (C52 `appendOwnReply` ve E3 `updateMessageText`
   * ortak yolu). Yapicinin kopyalamasina guvenme: dokunma intent'i ve eylemler (Cevapla/Okundu/Sessize al)
   * acikca tasinir; ayni PendingIntent'ler yeniden kullanilir (ekstralar ve RemoteInput sabit).
   */
  private fun repost(
    context: Context,
    conversationId: String,
    source: Notification,
    style: NotificationCompat.MessagingStyle,
    contentText: CharSequence,
    whenMs: Long,
  ): Boolean {
    val builder = NotificationCompat.Builder(context, source)
      .setStyle(style)
      .setContentText(contentText)
      .setWhen(whenMs)
      .setOnlyAlertOnce(true)
    source.contentIntent?.let { builder.setContentIntent(it) }
    builder.clearActions()
    for (i in 0 until NotificationCompat.getActionCount(source)) {
      NotificationCompat.getAction(source, i)?.let { builder.addAction(it) }
    }
    return try {
      NotificationManagerCompat.from(context).notify(conversationId, conversationId.hashCode(), builder.build())
      true
    } catch (e: SecurityException) {
      Log.w(TAG, "POST_NOTIFICATIONS izni yok", e)
      false
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
      // JS ayni dokunusu (olay + getInitialTap) iki kez islemesin diye artan kimlik.
      "tapId" to tapCounter.incrementAndGet().toDouble(),
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

  /** Simgesiz grup için daire: verilen renkle dolu, ortada beyaz kalın baş harf. Renk yoksa nötr gri. */
  private fun drawInitial(letter: String, fill: Int?): Bitmap {
    val size = 192
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val bg = Paint(Paint.ANTI_ALIAS_FLAG)
    bg.color = fill ?: Color.GRAY
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, bg)
    val fg = Paint(Paint.ANTI_ALIAS_FLAG)
    fg.color = Color.WHITE
    fg.typeface = Typeface.DEFAULT_BOLD
    fg.textSize = size * 0.45f
    fg.textAlign = Paint.Align.CENTER
    val y = size / 2f - (fg.descent() + fg.ascent()) / 2f
    canvas.drawText(letter, size / 2f, y, fg)
    return out
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
