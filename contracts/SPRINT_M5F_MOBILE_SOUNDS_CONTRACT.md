# Sprint M5f — Mobil Ses Kimliği (dört özel ses)

> **Kaynak:** sahip isteği 2026-09-19. Dört ses dosyası sahip tarafından seçildi
> (`OneDrive\Belgeler\kanka-ses`), PM tarafından işlenip depoya kondu (§0).
> **Tier:** `mobile/` + `api/` (yalnız §2'nin kanal kimliği, iki satır).
> **Kapsam:** ses kimliği. Yeni ekran, yeni akış, yeni kullanıcıya görünen metin YOK.
> **Yeni bağımlılık:** `expo-audio` (§3/§4 için ZORUNLU, PM onayladı).

---

## §0 Varlıklar — HAZIR, YENİDEN ÜRETME

Dört dosya `mobile/assets/sounds/` altında **zaten duruyor**. Dokunma, yeniden kodlama,
yeniden adlandırma. Ses işleme PM tarafında bitti.

| Dosya | Kaynak | Ne yapıldı | Ölçüm |
|---|---|---|---|
| `incoming_call_channel.wav` (DEĞİŞTİ) | `gelen-arama.mp3` (2 sn) | 15 kez döngülendi → 30 sn; compand + gerçek-tepe denetimi | -9,5 LUFS / -1,4 dBTP · 1,29 MB · 22050 Hz mono s16 |
| `message_channel.wav` (YENİ) | `bildirim.mp3` (0,96 sn) | tepe denetimi | -10,7 LUFS / -1,5 dBTP · 85 KB · 44100 Hz mono s16 |
| `message_tone.mp3` (YENİ) | `mesaj-sesi.mp3` (1 sn) | yalnız tepe normalizasyonu (-3 dBTP), SIKIŞTIRMA YOK | -25,6 LUFS / -3,4 dBTP · 17 KB |
| `outgoing_call.mp3` (YENİ) | `giden-arama.mp3` (1 sn) | 2 sn sessizlik eklendi → 3 sn'lik kusursuz dönen birim; tepe -3 dBTP (kaynak +0,4 dBTP ile KIRPIYORDU) | -9,1 LUFS / -3,4 dBTP · 49 KB |

Neden gelen arama 30 sn'ye döngülendi: **Android bildirim kanal sesini TEKRARLAMAZ.**
2 sn'lik dosya olduğu gibi konsaydı telefon çalmaz, iki saniye ses verip susardı. 30 sn,
`incomingCall.ts` §8.2'nin zaman aşımı ve `api/`nin 30 sn `ttl`siyle örtüşür (mevcut karar).

Uygulama içi iki ses **bilerek sıkıştırılmadı**: sahibin seçtiği sesin karakteri aynen kalsın
diye yalnız seviyesi düşürüldü. Gürlük ayarı kodda `volume` sabitinden yapılır (§6) — yeniden
ses kodlama gerektirmeyen tek düğme budur.

`incoming-call.wav` (M4a-2'nin eski kaynağı) **SİLİNMEZ**, bugünkü haliyle kalır.

---

## §1 Gelen arama zili — YALNIZ DOSYA, KANAL KİMLİĞİ DEĞİŞMEZ

`incoming_call_v4` ve `incoming_call_quiet_v1` **OLDUĞU GİBİ KALIR**. `api/`nin
`androidChannelId: 'incoming_call_v4'` satırına DOKUNULMAZ.

Gerekçe (PM tarafından kaynaktan doğrulandı, tahmin değil):
`expo-notifications`ın `android/.../SoundResolver.java` dosyası kanal sesini **isimle** çözüyor —
`android.resource://<paket>/raw/incoming_call_channel`, sayısal kaynak kimliğiyle değil.
Kanalda saklanan bu URI, kurulu APK'daki ham kaynağa çalma anında bakar. Dosyanın **adı aynı
kalıp içeriği değiştiği** için yeni zil, kanal kimliği artırılmadan çalar.

Bu, "kanal ayarı sonradan değiştirilemez" kuralının istisnası DEĞİL: kanalın ayarı (ses URI'si)
zaten değişmiyor, URI'nin işaret ettiği dosya değişiyor.

Yani §1 için yazılacak kod **YOK**. Dosya zaten yerinde. Bu bölüm bilerek burada: bir sonraki
oturum "zil değişmedi, kimliği artıralım" diye gereksiz bir sürüm yakmasın.

⚠️ Yine de DoD'da cihaz maddesi var (§7). Eski zil çalmaya devam ederse bu varsayım çürümüştür;
o zaman `incoming_call_v5` + `incoming_call_quiet_v2` + `api/` bir satır gerekir — **kendin yapma,
PM'e bildir.**

---

## §2 Mesaj bildirimi kanal sesi — YENİ KANAL ŞART

Bugün `messages_v5` özel ses TAŞIMIYOR (sistem varsayılanı çalıyor). Kanala sonradan ses
eklenemez → yeni kimlik zorunlu. Bu §1'in istisnası değil, tersi: burada kanalın **ayarı**
değişiyor.

`src/notifications/push.ts`:
- `MESSAGE_CHANNEL_ID` → `'messages_v6'`.
- `OLD_MESSAGE_CHANNEL_IDS` listesine `'messages_v5'` eklenir (mevcut silme döngüsü aynen çalışır).
- Yeni kanal `sound: 'message_channel.wav'` ile kurulur.
- 🔴 `importance: HIGH`, `enableVibrate: true` ve `MESSAGE_VIBRATE_PATTERN` **BİREBİR taşınır**.
  Bu desen v1→v5 arası beş turda cihazda oturtuldu (bkz. dosyadaki blok yorumu). Yeni kimlik
  o dersleri sıfırlamaz — değişen tek şey sesin eklenmesidir.
- Kimlik artırma gerekçesi dosyadaki mevcut sürüm günlüğüne bir paragraf olarak eklenir
  (v5 → v6 neden), oradaki desene uyarak.

`app.json` → `expo-notifications` plugin `sounds` dizisine `"./assets/sounds/message_channel.wav"`
eklenir (`incoming_call_channel.wav` zaten orada, kalır).

`api/` — kanal kimliği İKİ yerde, ikisi de `'messages_v6'` olur:
- `api/src/modules/notifications/notifications.service.ts:501`
- `api/src/modules/messages/gateway/messages.gateway.ts:775`

`messages.gateway.ts:415`'teki `incoming_call_v4`e **DOKUNMA** (§1).

### ⚠️ Bilinen ve KABUL EDİLMİŞ bedel (sahip onayladı 2026-09-19)
Sunucu `messages_v6` göndermeye başladığında, güncellemeyi henüz almamış telefonlarda o kanal
yoktur → FCM `fcm_fallback_notification_channel`e düşürür → bildirim gölgeye sessizce iner,
heads-up ve ses gitmez. Kitle küçük olduğu için tek turda ilerlenmesi seçildi. **İstemci ve
sunucu birlikte çıkar.** Bu bir kusur olarak raporlanmaz.

---

## §3 Uygulama içi mesaj sesi

**Ne zaman:** kullanıcı bir DM'in sohbet ekranındayken (`activeDmChannelId`) **başkasından**
yeni mesaj geldiğinde. Kendi mesajında ÇALMAZ.

Bugün bu durumda hiçbir şey duyulmuyor: `push.ts` `isActiveDm` iken banner'ı da listeyi de sesi
de kapatıyor (M5e §1). Bu ses tam o boşluğu doldurur, M5e kararını geri almaz — gösterilen
bildirim yine yok, yalnız kısa bir ses var.

**Nerede:** mesajın istemciye ulaştığı tek nokta. `src/stores/dm.ts` `applyActivity` içinde
`payload.channelId === activeDmChannelId && payload.senderId !== myId` ayrımı zaten var (rozet
düşürme dalı) — tetikleyici oradan okunur, **yeni bir mekanizma kurma**.

🔴 **Ortam (guild) kanallarında ÇALMAZ.** Sahip isteği birebir "bir kullanıcı ile mesajlaşırken
o DM ekranındayken". Ortam kanalına yaymak yeni bir karar → kapsam dışı.

---

## §4 Giden arama zili

**Ne zaman:** 1-1 DM aramasında, biz başlattık ve karşı taraf henüz katılmadı.
Ekranda "Çalıyor…" yazısını üreten koşulun AYNISI: `call.tsx`'teki
`alone && didInvite && callKind === 'dm'`. İkinci bir doğruluk kaynağı üretme, o koşulu kullan.

**Nasıl:** `outgoing_call.mp3` döngüye alınır (`loop`). Dosya 1 sn ton + 2 sn sessizlik olacak
şekilde hazırlandı, yani kusursuz dönen 3 sn'lik ritim kendiliğinden çıkar — **kodda zamanlayıcı
kurma.**

**Durma:** koşul düştüğü anda (karşı taraf katıldı / arama iptal / ekran kapandı / `leave()`).
Sızıntı bırakma: çalar her yoldan durdurulmalı, `unmount`ta da.

🔴 Grup ve ortam kanallarında ÇALMAZ (`callKind === 'dm'` kapısı). `didInvite` M4z §F ile grupta
da true olabiliyor; kapı bu yüzden `callKind`i de okur.

---

## §5 `expo-audio` — kurulum ve iki gerçek risk

Paket M4a-3'te **bilerek** kaldırılmıştı (zil kanal sesine taşınınca kullanımı kalmadı).
Şimdi §3/§4 için geri geliyor. PM onayladı, bu bir sapma değil.

- Kurulum `npx expo install expo-audio` ile (sürümü SDK 54'e uygun seçsin, `package.json`e elle
  sürüm yazma).
- 🔴 `mobile/AGENTS.md`: SDK 54'ün **sürümlü dokümanını** (https://docs.expo.dev/versions/v54.0.0/)
  oku. `expo-av` DEĞİL `expo-audio`. Hatırdan API uydurma.

### §5.1 🔴 LiveKit ses oturumuyla çakışma
`stores/voice.ts` aramada `AudioSession.configureAudio({ audioTypeOptions: communication })` +
`startAudioSession()` çağırıyor. `expo-audio` ile aynı anda ses çalmak bu oturumu bozabilir
(yönlendirme kulaklığa/hoparlöre kayabilir, en kötüsü arama sesini kesebilir).

Kurallar:
- **§3'ün mesaj sesi, aramaya bağlıyken ÇALMAZ.** Kapı: `useVoiceStore.getState().connectedChannelId !== null`
  ise ses atlanır. Tek satırlık koşul, tartışma yok.
- **§4'ün zili aramanın İÇİNDE çalar**, yani çakışma orada kaçınılmaz. Doğrulama sahipte (§7).
  Arama sesini bozuyorsa **düzeltmeye çalışma, raporla** — çözümü ayrı bir karar
  (LiveKit'in kendi ses oturumundan çalmak ya da zili tamamen bırakmak).

### §5.2 🟡 Sessiz/titreşim modu — bilinen borç, bu sprintte ÇÖZÜLMEZ
Kanal sesleri (§1/§2) zil modundan bağımsız çalamaz, bunu Android garanti ediyor (D40 böyle
kapanmıştı). Uygulama içi sesler (§3/§4) bu korumanın DIŞINDA: telefon sessizdeyken de çalarlar.

Bu sprintte çözüm aranmaz (zil modunu okumak native modül işi). **Borç olarak raporla**, PM
`PLAN.md` teknik borç tablosuna yazar.

---

## §6 Gürlük düğmesi

§3 ve §4'ün çalar seviyeleri **adlandırılmış sabit** olarak dursun (ör. `MESSAGE_TONE_VOLUME`,
`OUTGOING_RING_VOLUME`), çağrı yerine gömülü sayı değil. Sahip cihazda dinleyip tek satır
değiştirebilsin — aksi halde her ayar turu yeniden ses kodlama demek.

Başlangıç değerleri: mesaj sesi `0.8`, giden arama zili `0.5`. İkisi ölçülmüş seviyelerden
türetildi: giden arama zili sürekli bir ton (-9,1 LUFS), mesaj sesi kısa bir vuruş (-25,6 LUFS);
aynı tepede giden arama kulakta çok daha gür duyulur.

---

## §7 Doğrulama / DoD

Kod tarafı (dev yapar):
- `npm run typecheck` · `npm run lint` temiz.
- `api/` tarafında build + test temiz; `messages.gateway.spec.ts` ve `push.service.spec.ts`
  kanal kimliği bekleyen yerler varsa güncellenir.
- 🔴 **Native diff var** (`expo-audio` + `app.json` plugin `sounds`). Memory kuralı:
  EAS'a göndermeden önce yerelde `npx expo prebuild` + `gradlew assembleDebug` ile DERLE.
  Bulut yalnız "unknown error" der, yerel derleyici gerçek satırı verir.
  JAVA_HOME = Android Studio jbr.
- `app.json` `versionCode` 17 → **18**.

Cihaz turu (SAHİP yapar, dev "çalışıyor" BEYANI ÜRETMEZ — emülatör bu dördünü de yanıltır):
1. Uygulama kapalıyken DM mesajı → yeni bildirim sesi geliyor mu, heads-up hâlâ iniyor mu,
   çift darbe titreşim korundu mu.
2. Gelen arama → **yeni zil mi çalıyor, eski mi** (§1 varsayımının sınandığı yer).
3. DM ekranı açıkken mesaj → mesaj sesi çalıyor mu, kendi mesajında susuyor mu.
4. Giden 1-1 arama → zil 3 sn ritminde dönüyor mu, karşı taraf açınca SUSUYOR mu.
5. Aramadayken DM mesajı gelince arama sesi bozuluyor mu (§5.1).
6. Dört sesin gürlüğü birbirine göre dengeli mi (§6 sabitleri buna göre ayarlanır).

---

## §8 Sapma kuralı

`api/` dokunuşu §2'de sayılan İKİ satırla sınırlı. Başka bir sunucu değişikliği gerekirse DUR,
PM'e bildir. `mobile/` tarafında da yeni ekran/ayar/metin ekleme — sesler bu sprintte ayarsız,
her zaman açık.
