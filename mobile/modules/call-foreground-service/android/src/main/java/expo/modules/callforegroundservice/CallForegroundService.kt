package expo.modules.callforegroundservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * M4a-1 sözleşme §6 — sesli arama sürerken Android'in mikrofon erişimini arka planda kesmemesi için
 * mikrofon tipli foreground service + kalıcı, silinemez bildirim (Bağlantıyı Kes / Sustur eylemleri).
 *
 * Desen `expo-audio`'nun kendi `AudioRecordingService`'i ile (node_modules/expo-audio/android/.../
 * service/AudioRecordingService.kt) BİREBİR aynı — bu paket zaten kurulu ve derleniyor, o yüzden
 * kanıtlanmış bir şablon. Tüm kullanıcıya görünen metinler (başlık/gövde/eylem etiketleri) JS
 * tarafından `start`/`update` çağrısına parametre olarak geçirilir — i18n kaynağı `web/src/i18n/
 * tr.json` `mobile.call.*`, native tarafta hiçbir string GÖMÜLMEZ (kök CLAUDE.md i18n kuralı).
 */
class CallForegroundService : Service() {
  private var title: String = ""
  private var body: String = ""
  private var muteLabel: String = ""
  private var disconnectLabel: String = ""
  // 🔴 PM incelemesi (2026-08-06) — Android Ayarlar > Bildirimler'de KULLANICIYA GÖRÜNÜR (kanal
  // adı), bu yüzden "Sesli arama" gibi sabit bir dize burada GÖMÜLEMEZ. JS'ten `start()` ile gelir
  // (`mobile.call.notifChannel`, tr.json). Kanal İLK oluşturulduktan sonra Android adını sabitler
  // (sistem kısıtı — sonraki `start()` çağrıları adı güncelleyemez); kabul edilebilir, önemli olan
  // metnin KAYNAĞININ tr.json olması, native'e ikinci bir kopya açılmaması.
  private var channelName: String = ""
  private var started = false

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        title = intent.getStringExtra(EXTRA_TITLE) ?: title
        body = intent.getStringExtra(EXTRA_BODY) ?: body
        muteLabel = intent.getStringExtra(EXTRA_MUTE_LABEL) ?: muteLabel
        disconnectLabel = intent.getStringExtra(EXTRA_DISCONNECT_LABEL) ?: disconnectLabel
        channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME) ?: channelName
        createChannelIfNeeded()
        startForegroundWithNotification()
      }
      ACTION_UPDATE -> {
        body = intent.getStringExtra(EXTRA_BODY) ?: body
        muteLabel = intent.getStringExtra(EXTRA_MUTE_LABEL) ?: muteLabel
        if (started) updateNotification()
      }
      ACTION_DISCONNECT -> {
        CallForegroundServiceModule.emitAction("disconnect")
        stopSelf()
      }
      ACTION_TOGGLE_MUTE -> {
        CallForegroundServiceModule.emitAction("toggleMute")
      }
      ACTION_STOP -> {
        stopSelf()
      }
    }
    return START_NOT_STICKY
  }

  private fun createChannelIfNeeded() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        // IMPORTANCE_LOW: ses/titreşim yok — M4a-2'nin zil kanalından bilinçli ayrı (o kanal ayrı,
        // yüksek önemde olacak). Bu bildirim yalnız "arama sürüyor" durumunu gösterir. Ad JS'ten
        // gelir (bkz. sınıf-üstü yorum) — boşsa (teorik olarak `channelName` hiç set edilmemişse)
        // Android'in kendi jenerik kanal adını göstermesine izin ver, sabit Türkçe metne düşmez.
        val channel = NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_LOW).apply {
          setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
      }
    }
  }

  private fun buildNotification(): Notification {
    val disconnectIntent = Intent(this, CallForegroundService::class.java).apply { action = ACTION_DISCONNECT }
    val disconnectPending = PendingIntent.getService(
      this, 0, disconnectIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val muteIntent = Intent(this, CallForegroundService::class.java).apply { action = ACTION_TOGGLE_MUTE }
    val mutePending = PendingIntent.getService(
      this, 1, muteIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    // Bildirime dokunma → uygulamayı öne getirir (§6 "Bildirime dokunmak arama ekranını açar").
    // Doğrudan /call rotasına değil, uygulamanın kendi başlangıç intent'ine — arama ekranda zaten
    // bağlıysa mini pencere/route state'i JS tarafında zaten "aramadayım" bilgisini taşıyor.
    val contentIntent = packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      PendingIntent.getActivity(
        this, 0, launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      // 🔴 Rapor notu: marka ikonu YOK, sistem çizimi kullanılıyor (Play ikon paketi bu sprintin
      // kapsamı değil). `ic_btn_speak_now` bilinçli seçildi — `expo-audio`nun kendi
      // `AudioRecordingService`'i (bu projede zaten derlenen) AYNI kaynağı kullanıyor; "ic_menu_call"
      // gibi eski/az belgelenmiş kaynak ID'lerine güvenmek yerine KANITLANMIŞ olanı tercih edildi.
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(contentIntent)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .addAction(0, muteLabel, mutePending)
      .addAction(0, disconnectLabel, disconnectPending)
      .build()
  }

  private fun startForegroundWithNotification() {
    val notification = buildNotification()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      started = true
    } catch (_: Exception) {
      // 🔴 PM incelemesi (2026-08-06) — `startForegroundService()` çağrıldıktan sonra Android
      // sistemi 5 saniyelik bir sayaç başlatır; bu süre içinde `startForeground()` çağrılmazsa
      // (tam burada olduğu gibi — Android 14 arka plan kısıtı veya RECORD_AUDIO iptali istisnayı
      // fırlattığında) sistem uygulamayı "did not then call Service.startForeground()" ANR'iyle
      // ÖLDÜRÜR. `catch` istisnayı yutmak sayacı DURDURMAZ — kullanıcı bunu "aramaya basınca
      // uygulama kapandı" olarak görür. `stopSelf()` servisi kendi isteğimizle bitirip sistemin
      // sayacını iptal eder; arama LiveKit tarafında sürer, yalnız bildirim/servis eksik kalır.
      started = false
      stopSelf()
    }
  }

  private fun updateNotification() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, buildNotification())
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    started = false
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL_ID = "kankaverse_call_channel"
    private const val NOTIFICATION_ID = 4101
    const val ACTION_START = "expo.modules.callforegroundservice.action.START"
    const val ACTION_UPDATE = "expo.modules.callforegroundservice.action.UPDATE"
    const val ACTION_STOP = "expo.modules.callforegroundservice.action.STOP"
    const val ACTION_DISCONNECT = "expo.modules.callforegroundservice.action.DISCONNECT"
    const val ACTION_TOGGLE_MUTE = "expo.modules.callforegroundservice.action.TOGGLE_MUTE"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_MUTE_LABEL = "muteLabel"
    const val EXTRA_DISCONNECT_LABEL = "disconnectLabel"
    const val EXTRA_CHANNEL_NAME = "channelName"

    fun startIntent(
      context: Context,
      title: String,
      body: String,
      muteLabel: String,
      disconnectLabel: String,
      channelName: String,
    ): Intent =
      Intent(context, CallForegroundService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_BODY, body)
        putExtra(EXTRA_MUTE_LABEL, muteLabel)
        putExtra(EXTRA_DISCONNECT_LABEL, disconnectLabel)
        putExtra(EXTRA_CHANNEL_NAME, channelName)
      }

    fun updateIntent(context: Context, body: String, muteLabel: String): Intent =
      Intent(context, CallForegroundService::class.java).apply {
        action = ACTION_UPDATE
        putExtra(EXTRA_BODY, body)
        putExtra(EXTRA_MUTE_LABEL, muteLabel)
      }

    fun stopIntent(context: Context): Intent =
      Intent(context, CallForegroundService::class.java).apply { action = ACTION_STOP }
  }
}
