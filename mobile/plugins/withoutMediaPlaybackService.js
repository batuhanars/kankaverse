const { withAndroidManifest } = require('expo/config-plugins');

// withoutMediaPlaybackService — `expo-audio`nun getirdiği medya oynatma ön plan servisini ve
// iznini birleştirilmiş manifestten ÇIKARIR.
//
// 🔴 SORUN (Play Console, 2026-09-19). Sprint M5f `expo-audio`yu ekleyince paket
// `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` beyan etmeye başladı ve Play yeni bir
// "Ön plan hizmeti izinleri" beyanı istedi: hangi görev için gerekiyor + kullanımı gösteren video.
// Kütüphanenin kendi manifesti (`node_modules/expo-audio/android/src/main/AndroidManifest.xml`)
// izni ve `.service.AudioControlsService`i (media3 `MediaSessionService`, kilit ekranı oynatma
// kontrolleri) beraberinde sürüklüyor.
//
// BİZ BU SERVİSİ KULLANMIYORUZ. `expo-audio` bu projede yalnız iki kısa sesi ÖN PLANDA çalıyor
// (`audio/messageTone.ts`, `hooks/useOutgoingCallRing.ts` — `play`/`pause`/`seekTo`/`volume`).
// Servise tek giriş noktası `AudioPlayer.setActiveForLockScreen(true)`; `src/` altında hiç
// çağrılmıyor. Temizleme yolu (`AudioControlsService.clearSession()`) servis hiç başlamamışsa
// `getInstance()` null görüp sessizce dönüyor, yani kaldırmak çalışma anında çökme üretmez.
//
// NEDEN BEYAN ETMİYORUZ: Google'ın sorduğu "hangi görevler için" sorusunun dürüst cevabı
// "hiçbiri". Olmayan bir kullanımı beyan etmek hem yanlış hem de gösterilemeyecek bir demo
// videosu gerektirir. Kullanmadığımız izni taşımamak doğru olan.
//
// ⚠️ TETİKLEYİCİ — bu plugin ne zaman KALDIRILMALI: `expo-audio` ile kilit ekranı oynatma
// kontrolü (ör. sesli mesaj oynatıcı, müzik) gerçekten yapılırsa. O gün bu dosya silinir, izin
// geri gelir ve Play beyanı videosuyla birlikte doldurulur. Servis manifestte yokken
// `setActiveForLockScreen(true)` çağırmak ÇÖKER.
//
// Mikrofon tarafına DOKUNULMUYOR: `FOREGROUND_SERVICE_MICROPHONE` bizim aramadaki kendi ön plan
// servisimiz için gerçekten gerekli ve Play'de zaten beyan edilmiş durumda.
const TOOLS_NS = 'http://schemas.android.com/tools';
const PERMISSION = 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK';
const SERVICE = 'expo.modules.audio.service.AudioControlsService';

module.exports = function withoutMediaPlaybackService(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // `tools:` ad alanı şablonda olmayabilir; `tools:node` onsuz sessizce YOK SAYILIR.
    manifest.$ = manifest.$ ?? {};
    manifest.$['xmlns:tools'] = TOOLS_NS;

    // İzin: varsa önce sıradan girdiyi at, sonra "remove" kuralını koy — ikisi bir arada
    // bulunursa birleştirici hangisini uygulayacağı belirsiz kalır.
    manifest['uses-permission'] = (manifest['uses-permission'] ?? []).filter(
      (item) => item?.$?.['android:name'] !== PERMISSION,
    );
    manifest['uses-permission'].push({ $: { 'android:name': PERMISSION, 'tools:node': 'remove' } });

    const application = manifest.application?.[0];
    if (!application) {
      // Şablon her zaman bir `<application>` üretiyor; yoksa sessiz kalmak yerine bağır —
      // sessiz kalmak, iznin geri sızdığını ancak Play'de fark etmek demek.
      throw new Error('withoutMediaPlaybackService: AndroidManifest içinde <application> bulunamadı.');
    }
    application.service = (application.service ?? []).filter(
      (item) => item?.$?.['android:name'] !== SERVICE,
    );
    application.service.push({ $: { 'android:name': SERVICE, 'tools:node': 'remove' } });

    return config;
  });
};
