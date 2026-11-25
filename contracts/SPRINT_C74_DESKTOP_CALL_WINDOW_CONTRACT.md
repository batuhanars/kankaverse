# SPRINT C74: Masaüstü gelen arama penceresi + web/masaüstünde mobil sesleri

> Durum: **GELİŞTİRMEDE (2026-11-25).** PM compose (Opus). Web + desktop. Backend değişmez.
> R7 kapsamı dışında (auth/T&S karar fonksiyonu yok; arama kabul/ret akışı aynen mevcut fonksiyonlardan geçer).
> Desktop yeni sürüm: `1.2.1` → `1.3.0` (auto-update ile yayılır).

## §0 Sahip isteği (2026-11-25)
1. Masaüstünde gelen arama, uygulama tepsideyken mesaj bildirimi gibi Windows toast'ı olarak geliyor. İstenen:
   ekranın ortasında ayrı bir pencere; arayanın avatarı, adı, "arıyor"; altta yalnız ikonlu iki buton
   (reddet kırmızı, kabul yeşil).
2. Mobildeki özel sesler web/masaüstünde de kullanılsın: gelen arama, giden arama, mesaj bildirimi.

## §1 Arama penceresi: ne zaman çıkar
- Yalnız masaüstünde ve köprüde `showIncomingCall` varsa (eski kurulum → bugünkü toast yolu, kayıp yok).
- Karar main process'te: ana pencere **görünmüyor, simge durumunda ya da odakta değilse** gösterilir.
  Ana pencere öndeyse gösterilmez, uygulama içi üst şerit (`IncomingCallModal`) yeterli (sahip seçeneği a).
- Pencere açıkken kullanıcı ana pencereye odaklanırsa arama penceresi gizlenir (sinyal yok; şerit zaten orada).
- Köprü varken arama için Windows toast'ı **gösterilmez** (aynı arama iki kez görünmesin).

## §2 Arama penceresi: görünüm ve davranış
- Ayrı yerel dosya (`desktop/src/call.html` + `call.js` + `call-preload.js`), picker kalıbı: contextIsolation, sandbox,
  nodeIntegration kapalı, kendi dar köprüsü (`accept`, `reject`, `onData`).
- Çerçevesiz, şeffaf zemin üstünde yuvarlak köşeli kart, gölge yok (token kuralı), görev çubuğunda yok, her zaman üstte.
  İmleç hangi ekrandaysa o ekranın çalışma alanının ortasında açılır.
- **Odak çalmaz** (`showInactive`): klavye odağı kullanıcıda kalır.
- İçerik: avatar (daire; yoksa baş harf, aksan rengi), ad, alt satır `call.incoming` / `call.incomingGroup`.
  Altta iki yuvarlak ikon buton: reddet `--kv-danger`, kabul `#3DB46E`. `title` metinleri `call.reject` / `call.accept`.
- **Metinler web'den gelir** (i18n'den çevrilmiş halde IPC yüküyle). Pencere metin gömmez.
- Kart sürüklenebilir (butonlar hariç).
- **Kabul:** pencere kapanır, ana pencere `bringToFront()`, web `acceptCall(channelId)`.
  **Reddet:** pencere kapanır, web `rejectCall(channelId)`; ana pencere tepside kalır.
- Arama bittiğinde (kabul/ret/iptal/30 sn/grup iptali) web `hideIncomingCall()` çağırır. Tek kaynak yine
  `callStore.incoming.channelId` izleyicisi (bugünkü toast'la aynı yaşam döngüsü).

## §3 IPC yüzeyi
| Yön | Kanal | Yük |
|---|---|---|
| web → main | `call:show` | `{ channelId, name, subtitle, avatarUrl, initial, acceptLabel, rejectLabel }` |
| web → main | `call:hide` | yok |
| call → main | `call:accept` / `call:reject` | yok (main açık aramanın `channelId`'sini bilir) |
| main → web | `call:action` | `{ action: 'accept' \| 'reject', channelId }` |
Köprü (`preload.js`): `showIncomingCall(data)`, `hideIncomingCall()`, `onCallAction(cb)` (abonelikten çıkış döner).
Web tip dosyası (`types/electron.d.ts`) üçünü opsiyonel tanımlar ("1.3.0 öncesinde yok").

## §4 Sesler
Kaynak `mobile/assets/sounds/`. Web kopyası `web/src/assets/sounds/` (Vite hash'li URL). Mobil dosyalara dokunulmaz.
| Ses | Web dosyası | Kaynak | Çalış |
|---|---|---|---|
| Gelen arama | `incoming_call.mp3` | `incoming_call_channel.wav` (30 sn) → MP3 mono 64 kbps | döngü |
| Giden arama | `outgoing_call.mp3` | aynı dosya | döngü |
| Bildirim | `notification.mp3` | `message_channel.wav` (bildirim kanalı sesi; `message_tone` DEĞİL, o DM-açık sesi) | tek atış |
- `useCallSounds` `startRingtone/stopRingtone/startRingback/stopRingback` imzaları değişmez, içleri `HTMLAudioElement`
  döngüsüne geçer. Bağlanma/ayrılma/peer/alert blipleri sentezli kalır (mobilde dosyası yok).
- Mesaj sesi: masaüstü toast'ları `silent: true` ile açılır, yerine `notification.mp3` çalınır. Kapsam: `useMessageToasts`
  (DM, grup DM, kanal) ve `useNativeNotifications` toast'ları (bahsetme, istek, davet, tepki, YZ video).
  Ses toast'ın çıktığı her durumda çalar, çıkmadığı durumda çalmaz (kural değişmez, yalnız ses değişir).
- Tarayıcı autoplay kilidi: `play()` reddi sessizce yutulur (bugünkü davranış). Electron'da kilit yok.

## §5 Kapsam dışı
Uygulama içi şeridin yeniden tasarımı (seçenek b), düz tarayıcıda mesaj sesi (tarayıcıda mesaj toast'ı zaten yok),
ses ayarı/kapatma tercihi, Windows "Odaklanma yardımı" algılama, macOS/Linux'a özel ince ayar.

## §6 Doğrulama
- web: `npx vue-tsc -b` (6 bilinen hata), dokunulan dosyalarda eslint, `npx vite build`.
- desktop: `node --check` (main/preload/call), `npm start` ile yerel açılış.
- Sahip cihaz turu (masaüstü 1.3.0): tepsideyken arama → orta pencere, kabul, reddet, arayan iptali, 30 sn sessiz kapanış,
  grup araması, ana pencere öndeyken pencere çıkmaması, iki ekran, oyun/tam ekran pencereli; üç sesin her biri;
  eski masaüstü sürümünde toast yolunun hâlâ çalışması.
