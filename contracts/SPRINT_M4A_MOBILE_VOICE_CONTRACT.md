# SPRINT M4a — Mobil Sesli Arama: 1-1 DM

> **Tek doğruluk kaynağı.** Davranış buradan **sapamaz**; sapma ihtiyacı → **DUR**, sahibe bildir.
> PM compose: 2026-08-06 (sahip Discord mobil görselleri `design-refs/m4-ses/` + PLAN.md M4 kararı).
>
> **Faz sırası (PLAN.md, sahip kararı 2026-08-04, KESİN):** (1) 1-1 DM sesli → (2) grup DM sesli →
> (3) ortam sesli kanalı → sonra aynı sırayla görüntülü. **Bu sözleşme yalnız (1)'i kapsar.**
>
> **`api/` DEĞİŞMEZ.** Ses sunucusu Sprint V2/C4/R11'den beri canlı ve R7'den geçmiş. Bu sprint
> **mevcut sisteme mobil istemci** yazar. `api/`ye dokunma ihtiyacı doğarsa → **DUR**.

---

## §0 Neden bu sprint var, ve neden en ağır olan

Mobilde **tek satır ses kodu yok**: `src/api/` altında `voice.ts` yok, store yok, ekran yok.
Sunucuda ise her şey hazır: `voice/token` · `voice/participants` · `voice/leave` uçları, `livekit-server-sdk`,
beş kapılı medya izin modeli, R11 moderasyonu, DM çalma sinyalizasyonu (`voice:call_invite` ailesi).

Sahip bu parçayı bilerek başa aldı: **1-1 DM araması ağır platform işinin tamamını taşıyor**
(WebRTC native bağımlılığı, mikrofon izni, foreground service, ses yönlendirme, çalma akışı,
uygulama kapalıyken gelen arama). PM ortam kanalıyla başlamayı önermişti, sahip reddetti,
gerekçesi kabul edildi: en zor durum başa alınırsa temel baştan doğru kurulur (PLAN.md M4 bloğu).

---

## §0.1 🔴 İç sıralama — üç durak, üçü de cihazda doğrulanabilir

Faz sırası değişmiyor; M4a **içeriden** üçe bölünüyor. Gerekçe M1d dersi: tek hamlede inen büyük
native iş patladığında hangi katmanın patladığı anlaşılmıyor.

| Durak | Kapsam | Cihazda doğrulanan |
|---|---|---|
| **M4a-1** | Var olan aramaya **katıl** + arama ekranı + ses yönlendirme + foreground service + mini pencere | Web'den başlatılan DM aramasına telefondan katılıp **karşılıklı konuşmak** |
| **M4a-2** | Çalma akışı (uygulama **açıkken**): giden arama, gelen arama, reddet/iptal/zaman aşımı, zil sesleri | Telefondan arama başlatmak ve telefonda çalan aramayı cevaplamak |
| **M4a-3** | Uygulama **kapalıyken** gelen arama: yüksek öncelikli push + bildirim üzerinden cevaplama | Uygulama tamamen kapalıyken gelen aramayı görmek |

Her durak sonunda **dur, sahibe bildir, cihaz turu bekle.** Bir sonraki durağa sahip onayıyla geçilir.

> M4a-1 tek başına da anlamlı bir ürün: web'deki kanka aramayı başlatır, telefondaki kişi DM ekranındaki
> **"Sesli aramaya katıl"** satırıyla girer. Web'de bu zaten böyle çalışıyor (`DmConversation.vue:313`
> `hasOngoingCall` → Katıl düğmesi). Yani M4a-1 **web davranışının mobil eşi**, yarım özellik değil.

---

## §1 Paketler ve derleme — 🔴 TEK DERLEME KURALI

WebRTC native koddur: **yeni dev build şart** (`mobile/CLAUDE.md` 2026-08-04 dersi).

**Onaylı paketler (PM onayı verildi, başkasını ekleme):**

| Paket | Ne için | Durak |
|---|---|---|
| `@livekit/react-native` | LiveKit istemcisi (sunucu zaten LiveKit; başka SFU seçeneği yok) | M4a-1 |
| `@livekit/react-native-webrtc` | WebRTC native katmanı (yukarıdakinin peer'ı) | M4a-1 |
| `@livekit/react-native-expo-plugin` | Expo config plugin (izinler + native yapılandırma) | M4a-1 |
| `@config-plugins/react-native-webrtc` | WebRTC için Expo config plugin | M4a-1 |
| `expo-audio` | Zil / geri-zil / bağlanma blibi (SDK 54'ün ses paketi) | **M4a-2'de kullanılır, M4a-1'de KURULUR** |
| `expo-web-browser` | **D38** — PDF/dosya eki uygulama içi tarayıcıda | bu derlemeye biner |

🔴 **Tek derleme kuralı:** yukarıdaki native paketlerin **hepsi M4a-1 başında kurulur ve tek dev build
alınır.** `expo-audio` M4a-2'ye kadar kullanılmasa bile şimdi kurulur; yoksa M4a-2'de ikinci derleme
gerekir. D38 de aynı sebeple bu derlemeye bindirildi (PLAN.md borç tablosu kararı).

**Sürüm riski (dev bunu ilk iş doğrular):** LiveKit RN SDK'nın Expo SDK 54 / RN 0.81 / React 19.1
ile uyumlu sürümü seçilmeli. `AGENTS.md` kuralı geçerli: **sürümlü dokümana bak, hatırdan yazma.**
Uyumlu sürüm yoksa → **DUR, bildir** (SDK yükseltmek yasak, mağaza Expo Go bağımlılığı M2'de kalktı
ama sürüm kilidi sözleşmeyle değişir, kod içinde değil).

**Derleme komutu** (`mobile/CLAUDE.md`):
```
cd mobile && npx eas-cli build --profile development --platform android
```

**`app.json` eklemeleri:** yeni plugin girdileri + mikrofon izin metni Türkçe olacak
(`expo-media-library` girdisindeki ton: "Kankaverse, sesli aramada konuşabilmen için mikrofonuna
erişmek istiyor."). `registerGlobals()` uygulama girişinde bir kez çağrılır.

---

## §2 Sunucu sözleşmesi — birebir, değiştirilemez

**HTTP** (envelope: `{ success, statusCode, data }` — gerçek veri `response.data.data`):

```
POST /channels/:channelId/voice/token   → { token, url, canPublish, bitrate?, canPublishCamera?, canPublishScreen? }
GET  /channels/:channelId/voice/participants → { startedAt: number|null, participants: [{ userId, username, avatarUrl }] }
POST /channels/:channelId/voice/leave   → null
```

**WS (Socket.IO, mevcut `src/realtime/socket.ts` bağlantısı üzerinden):**

| Yön | Olay | Payload |
|---|---|---|
| gönder | `voice:subscribe` / `voice:unsubscribe` | `{ channelId }` → ack `{ ok }` |
| gönder | `voice:call_invite` | `{ channelId }` → ack `{ ok, error? }` |
| gönder | `voice:call_accept` / `voice:call_reject` / `voice:call_cancel` | `{ channelId }` |
| al | `voice.incoming_call` | `{ channelId, caller: { id, username, avatarUrl } }` |
| al | `voice.call_accepted` / `voice.call_rejected` / `voice.call_canceled` | `{ channelId }` |
| al | `voice.participant_joined` / `voice.participant_left` | `{ channelId, userId, username, avatarUrl }` |

**Kurallar:**
- `voice:call_invite` ack'i `{ ok: false }` dönerse kullanıcıya **nötr** mesaj: "Şu anda ulaşılamıyor."
  🔴 Sunucu bilerek jenerik `DM_NOT_ALLOWED` dönüyor (engellenme/ilişki/minör bilgisi sızmasın diye).
  İstemci bu kodu **açımlamaz**, ayrıştırmaz, farklı metin göstermez. R7 kuralı.
- `canPublish=false` (karantina) → mikrofon açılmaz, kullanıcı **dinleyici** olarak bağlanır;
  mikrofon düğmesi görünür ama pasif + Türkçe açıklama.
- `CHANNEL_FULL` (403) → Türkçe toast, ekran açılmaz.
- **Yaş/medya kapıları sunucuda.** İstemci kapı KURMAZ, sunucunun verdiği kararı gevşetmez.

---

## §3 M4a-1 — Var olan aramaya katıl

### §3.1 DM ekranındaki giriş noktası

`(app)/dm/[id].tsx` açıldığında (yalnız `type === 'DM'`):
1. `voice:subscribe` gönderilir, ekrandan çıkılınca `voice:unsubscribe`.
2. `GET voice/participants` bir kez çağrılır → katılımcı listesi + `startedAt`.
3. `voice.participant_joined/left` ile liste canlı güncellenir.

**Aramada kimse yoksa:** hiçbir şey gösterilmez (boş yüzey açma kuralı). Arama **başlatma** düğmesi
M4a-2'ye ait; M4a-1'de kutuya tıklayınca hiçbir şey yapmayan telefon ikonu **konmaz**.

**Arama sürüyorsa** (`participants.length > 0` ve biz bağlı değilsek): sohbetin üstünde şerit —
katılımcı avatarları + "Sesli arama sürüyor" + **"Katıl"** düğmesi (Kor aksan, ≥44dp).

### §3.2 Katılma akışı

1. **Mikrofon izni** istenir (`RECORD_AUDIO`).
   🔴 **Reddedilirse arama ekranı AÇILMAZ.** Türkçe açıklama + **"Ayarları aç"** (`Linking.openSettings`).
   Web'deki "izin yoksa dinleyici kal" davranışı buraya taşınmaz: 1-1 aramada konuşamayan taraf
   bozuk bir deneyimdir, sessizce yarım açmak yerine sebebi söylenir.
   *(Karantina ≠ izin reddi: `canPublish=false` sunucu kararıdır, orada dinleyici modu geçerlidir.)*
2. `POST voice/token` → LiveKit `Room` bağlantısı, `bitrate` publish varsayılanına uygulanır (web ile aynı).
3. `AudioSession` iletişim (communication) kipinde başlatılır, foreground service ayağa kalkar (§6).
4. Bağlantı kurulunca arama ekranına geçilir.
5. Hata → ekran açılmaz, envelope `message` gösterilir, `AudioSession` ve servis geri kapatılır.

### §3.3 Ayrılma

`room.disconnect()` → `POST voice/leave` (best-effort, hata yutulur) → `AudioSession` durur →
foreground service düşer → ekran kapanır.

🔴 **`voice/leave` çağrısı atlanamaz.** LiveKit webhook'u gecikirse/ulaşamazsa karşı tarafın
katılımcı listesinde **hayalet kullanıcı** kalır (web'de bu dev-fix olarak eklendi, `voice.ts:44`).

🔴 **Beklenmedik kopmada da aynı temizlik:** LiveKit `Disconnected` olayında (ağ, sunucu, A4 acil
çıkarma, R11B `disconnect`) yerel durum sıfırlanır, ekran kapanır, kullanıcıya Türkçe bilgi verilir.
Sessizce sonsuza kadar "bağlı" görünen bir ekran kalmaz.

**Tek kişi kalınca (REV-12 pariteti):** DM aramasında yalnız kendimiz kaldıysak **60 sn** sonra arama
otomatik biter. Biri katılırsa sayaç iptal.

---

## §4 Arama ekranı (`design-refs/m4-ses/`)

Rota: `(app)/call.tsx`, tam ekran modal (parametre: `channelId`). Referans görseller **10** ve **11**
(Discord DM araması). Renk/ölçü **bizim token'larımızdan** gelir, Discord'un mavi-mor gradyanı
kopyalanmaz: arka plan `bgContent` üzerine ince Kor tonlu gradyan (`expo-linear-gradient` zaten kurulu).

**Üst bar:** sola **chevron-down** (küçült → §7 mini pencere) · ortada karşı tarafın adı, dokununca
DM detayına gider · sağda **ses çıkışı** düğmesi (§5).
🔴 Discord'daki **"kişi ekle"** düğmesi YOK — 1-1 DM'e üçüncü kişi eklenemez, grup M4b'nin işi.

**Orta alan:** iki kutucuk alt alta (görsel 10/11 düzeni), her biri avatar + ad etiketi.
- **Konuşan** kutucuk: `colors.online` (#3DB46E) kenarlık. Konuşma algısı per-participant
  `IsSpeakingChanged` ile (web'deki ders: aggregate `ActiveSpeakersChanged` mute/unmute döngüsünde kaçıyor).
- **Mikrofonu kapalı** katılımcı: avatar üstünde çizili mikrofon rozeti.
- **Tek başınayken:** "Bu aramada tek başınasın." + "<ad> istediği zaman katılabilir." (görsel 10 metni,
  bizim tonumuza uyarlanmış). Bu metin 60 sn otomatik bitirmeyi de anlamlı kılar.

**Alt kontrol çubuğu:** yalnız **üç** düğme — **mikrofon** (aç/kapa) · **sohbet** (DM'e dön, küçültme ile
aynı sonuç değil: sohbeti açar) · **kapat** (kırmızı `danger`, ≥56dp).
🔴 **Kamera düğmesi YOK, ekran paylaşımı YOK, "roket"/etkinlik YOK.** Görüntülü M4d'de gelecek;
şimdi kapalı düğme koymak boş yüzeydir. Sağırlaştırma (deafen) M4a kapsamı dışı — web'de var, mobilde
tek kişilik aramada değeri düşük, grup/ortam fazında değerlendirilecek.

**Kontrollerin otomatik gizlenmesi (görsel 04):** 5 sn dokunulmazsa üst bar + alt çubuk kaybolur,
ekrana dokununca geri gelir. Kutucuklar hep görünür kalır.

**Süre sayacı:** üst barın altında `mm:ss` (bağlantı anından itibaren; web `connectedAt` pariteti).

---

## §5 Ses çıkışı seçimi (görsel 06)

Sağ üstteki hoparlör düğmesi alttan bir sayfa açar: **"Ses çıkışını seç"** — Telefon (kulaklık deliği) ·
Hoparlör · bağlıysa **Bluetooth cihaz adı** · kablolu kulaklık. Seçili olan işaretli.

- Cihaz listesi ve geçiş LiveKit `AudioSession` API'sinden gelir; dev **sürümlü dokümandan** doğrular.
- **Varsayılan: Hoparlör** (Discord pariteti, görsel 06). ⚠️ Sahip cihazda "telefonu kulağıma
  götürünce hoparlörden çalıyor" derse varsayılan **Telefon**'a çevrilir; tek satırlık revizyon,
  şimdi tahmin edilmiyor.
- 🔴 **Gelen telefon araması kesintisi:** GSM çağrısı gelirse ses oturumu odağı kaybeder. Mikrofon
  otomatik susar, GSM çağrısı bitince geri döner. Bu **isteğe bağlı değil**; olmadan kullanıcı
  telefonda konuşurken Kankaverse'e de yayın yapmış olur. Cihaz DoD'unda ayrı madde.
- Bluetooth kulaklık bağlanır/kopar → liste canlı güncellenir, ses o cihaza geçer.

---

## §6 Foreground service + bildirim (görsel 12)

🔴 **Foreground service olmadan bu sprint bitmez.** Android arka plandaki uygulamanın mikrofonunu ve
ağ bağlantısını keser; servis yoksa kullanıcı uygulamadan çıkınca arama sessizce ölür.

- Servis türü **mikrofon** (`FOREGROUND_SERVICE_MICROPHONE`, Android 14+ zorunlu tür beyanı).
- Bildirim kalıcı, silinemez: başlık "Sesli arama sürüyor", gövde karşı tarafın adı.
- Eylemler: **Bağlantıyı Kes** · **Sustur** (görsel 12'deki üçüncü eylem "Sağırlaştır" bizde yok, §4).
- Bildirime dokunmak arama ekranını açar.
- Arama biter → bildirim + servis **kaybolur** (uygulama kapansa/çökse bile artık kalmaz).
- Play beyanı: mikrofon foreground service kullanımı Play Console'da gerekçelendirilir. **Sahip işi**,
  dev yalnız hangi izinlerin girdiğini rapor eder.

---

## §7 Mini pencere (görsel 07)

Küçültünce arama **kapanmaz**: uygulamanın üstünde küçük bir kutucuk kalır.

- **Sistem seviyesi bir pencere DEĞİL** (overlay izni/PiP yok). Uygulama kökünde mutlak konumlu
  bir bileşen; Discord'un yaptığı da bu. Uygulamadan çıkınca yerini §6 bildirimi alır.
- Sağ üstte durur, üstünde katılımcı avatarı + konuşma göstergesi; **dokununca arama ekranına döner**.
- Uygulamanın her ekranında görünür (gezinme değişse de kaybolmaz).
- **Sürüklenebilirlik M4a-1'de YOK.** Gerekirse revizyon turunda eklenir (`react-native-gesture-handler`
  zaten kurulu). Sabit köşe ile başlanıyor ki ilk turda kusur yüzeyi küçük olsun.
- DM listesinde/sohbette aramada olduğumuz kanal ayrıca işaretlenir (görsel 07'deki yeşil rozet mantığı).

---

## §8 M4a-2 — Çalma akışı (uygulama açıkken)

> **Bu durak M4a-1 sahip onayından sonra başlar.**

**Giden:** DM başlığına telefon ikonu (M4a-1'de yoktu, burada gelir) → `voice:call_invite` →
ack `ok:false` ise nötr "Şu anda ulaşılamıyor" → ack `ok` ise **"Aranıyor…"** ekranı + geri-zil sesi +
**30 sn** zaman aşımı (web `CALL_TIMEOUT_MS` pariteti) → `voice.call_accepted` gelince odaya katıl.
İptal → `voice:call_cancel`.

**Gelen (uygulama açıkken):** `voice.incoming_call` → tam ekran gelen arama görünümü: arayanın avatarı +
adı, **Reddet** (kırmızı) / **Kabul et** (yeşil değil, Kor aksan) + zil sesi + titreşim.
Kabul → `voice:call_accept` + odaya katıl. Reddet → `voice:call_reject`.
Arayan iptal ederse (`voice.call_canceled`) ekran kendiliğinden kapanır.

🔴 **Görsel yok:** sahip çalma/gelen arama ekranlarının ekran görüntüsünü almamış. Bu iki ekran
web'deki `IncomingCallModal` + `OutgoingCallBar` davranışından ve Android alışkanlığından türetilecek.
**İlk revizyon turunun buraya gelmesi bekleniyor** — sahip cihazda görüp söyleyecek.

**Sesler:** web sesleri Web Audio ile **sentezliyor** (`useCallSounds.ts`), React Native'de Web Audio yok.
Aynı ton reçetesinden (çift-zil / tek ton geri-zil / bağlan-ayrıl blipleri) **kısa ses dosyaları üretilip**
`assets/sounds/` altına konur, `expo-audio` ile çalınır. Hazır zil sesi indirilmez (lisans + ton tutarlılığı).
Zil sesi cihaz sessizdeyken çalmaz, titreşim kalır.

---

## §9 M4a-3 — Uygulama kapalıyken gelen arama

> **Bu durak M4a-2 sahip onayından sonra başlar. En riskli parça bilerek sona bırakıldı.**

- `voice:call_invite` alındığında sunucu callee'ye **yüksek öncelikli push** göndermeli.
  🔴 Bu **`api/` değişikliğidir** (`PushService` bugün yalnız mesaj bildirimi gönderiyor, `priority`
  alanı yok). M4a-3'e gelindiğinde **PM sözleşmeyi revize eder**; dev kendi başına `api/`ye dokunmaz.
  M4a-1 ve M4a-2 boyunca `api/` diffi **sıfır** olmalı.
- Android'de ayrı **bildirim kanalı** (yüksek önem, zil sesi, titreşim deseni).
- Bildirim eylemleri: **Kabul et** / **Reddet**. Kabul → uygulama açılır ve doğrudan aramaya girer.
- ⚠️ **PM'in dürüst beklentisi:** GSM aramaları gibi **tam ekran çalan** bir arayüz Android 14+'ta
  `USE_FULL_SCREEN_INTENT` iznine bağlı ve Play bunu "arama uygulaması" beyanıyla veriyor. Bu izin
  alınamazsa sonuç **yüksek öncelikli, sesli, eylemli bildirim** olur (tam ekran değil). Bu bir
  başarısızlık değil, platformun kuralı. Dev buraya geldiğinde neyin mümkün olduğunu ölçüp raporlar,
  karar sahibin.
- Zaman aşımı geçmiş çağrının bildirimi **temizlenir** (30 sn sonra "cevapsız arama"ya döner veya düşer).

---

## §10 T&S (R7 yüzeyi — dikkat)

- **Kapıların hepsi sunucuda.** `canDm` daveti ring yayılmadan önce süzüyor; istemci hiçbir kapı kurmaz,
  hiçbir kapıyı gevşetmez, sunucunun kararını **açımlamaz**.
- Nötr hata metni zorunlu: engellenme, minör olma, yeni hesap, bekleyen mesaj isteği ayrımı
  **kullanıcıya sızmaz**. Tek metin: "Şu anda ulaşılamıyor."
- **Video bu sprintte YOK.** `canPublishCamera` token'dan gelse bile kullanılmaz, kamera açılmaz,
  kamera düğmesi çizilmez.
- Bekleyen mesaj isteği kanalında (`dmRequestStatus=PENDING`) arama yok — sunucu zaten reddediyor,
  istemci de o DM'de arama düğmesi göstermez (M4a-2).
- Minör kullanıcı: sesli arama **yasak değil** (kapı sunucuda, `canDm` sonucu belirler). İstemci
  kendi başına yaş kararı vermez.

---

## §11 i18n

Kullanıcıya görünen **hiçbir string koda gömülmez**. Kaynak `web/src/i18n/tr.json` (import edilir,
kopyalanmaz). Web'de karşılığı olan anahtarlar **yeniden kullanılır** (`voice.*`); mobil-özel metinler
`mobile.call.*` altına eklenir. Süre `mm:ss`, saat/tarih TR formatı.

🔴 **`tr.json` uyarısı (2026-08-04 PM operasyon hatası):** bu dosyaya iki oturum aynı anda yazabilir.
Commit edilmemiş çalışma varken `git checkout -- web/src/i18n/tr.json` **çalıştırılmaz**; 19 anahtar
bir kez böyle kayboldu. Önce commit, sonra düzenleme.

---

## §12 Kapsam dışı (bilerek)

Aşağıdakiler **bu sprintte yapılmaz**; istenirse PM sözleşmeyi revize eder:

- **Grup DM sesli** (M4b) · **ortam sesli kanalı** + kanal listesi süzgeci + sesli kanal ekleme (M4c)
- **Görüntülü arama** (M4d-M4f) · **ekran paylaşımı** (mobilde hiç yok, PLAN kararı)
- Görsel **02** (ses kanalı önizleme sayfası) ve **05** (kanal detay sayfası) → ortam kanalı işidir, M4c
- Görsel **08** (davet sayfası) → ortam daveti, ses sprintinin işi değil
- "Sadece videoları göster", ses ayarları alt sayfası, gürültü bastırma, giriş cihazı seçimi
- Sağırlaştırma (deafen), bas-konuş (push-to-talk), ses seviyesi kaydırıcısı
- R11 moderasyon eylemlerinin mobil arayüzü (sunucu tarafı canlı, mobil mod paneli ayrı iş)
- **D34** (grup silme sonrası geri tuşu) — gezinme yığını borcu; bu sprint DM yığınına dokunmuyor,
  borç tetikleyicisi oluşmadı, ertelenmiş kalıyor

---

## §13 DoD

**Her durakta (dev'de):**
- [ ] `npm run typecheck` temiz · `npm run lint` temiz
- [ ] `api/` ve `web/` diffi **sıfır** (M4a-3 hariç; orada PM sözleşme revize eder)
- [ ] Kod içinde gömülü kullanıcı metni yok, gömülü renk/ölçü yok (`src/theme`'den)

**M4a-1 (cihazda — SAHİPTE):**
- [ ] Web'den başlatılan DM aramasına telefondan katılınıyor, **iki taraf birbirini duyuyor**
- [ ] Mikrofon aç/kapa çalışıyor; karşı tarafta mikrofon-kapalı rozeti görünüyor
- [ ] Konuşan kişinin kutucuğu yeşil kenarlıkla işaretleniyor
- [ ] Ses çıkışı seçici: hoparlör ↔ telefon geçişi çalışıyor; **Bluetooth kulaklık bağlıysa listede**
- [ ] 🔴 Uygulama arka plana atılınca **ses kesilmiyor**, bildirim görünüyor, "Bağlantıyı Kes" çalışıyor
- [ ] 🔴 **GSM araması gelince** Kankaverse mikrofonu susuyor, GSM bitince geri dönüyor
- [ ] Küçültünce mini kutucuk kalıyor, dokununca arama ekranına dönüyor, uygulamanın her ekranında görünüyor
- [ ] Aramadan çıkınca karşı tarafta **hayalet katılımcı kalmıyor** (`voice/leave`)
- [ ] Mikrofon izni reddedilince açıklama + "Ayarları aç" çıkıyor, uygulama **kilitlenmiyor**
- [ ] Uçak moduna alıp geri açınca ekran sonsuza kadar "bağlı" kalmıyor
- [ ] Tek başına kalınca 60 sn sonra arama kendiliğinden bitiyor
- [ ] **Mevcut özelliklerde regresyon yok:** mesaj gönderme, ek gönderme, klavye payı, bildirimler
      (yeni dev build alındı, M3c'deki klavye regresyonu **native kabuk değişince** olmuştu)

**M4a-2 (cihazda):**
- [ ] Telefondan arama başlatılıyor, web'de çalıyor, kabul edilince ses açılıyor
- [ ] Web'den arandığında telefonda (uygulama açıkken) çalıyor; kabul/reddet çalışıyor
- [ ] 30 sn cevapsızda arama kendiliğinden düşüyor, iki tarafta da ekran kapanıyor
- [ ] Ulaşılamayan kişide **nötr** mesaj çıkıyor (sebep sızmıyor)
- [ ] Cihaz sessizdeyken zil çalmıyor, titreşim var

**M4a-3 (cihazda):**
- [ ] Uygulama **tamamen kapalıyken** gelen arama bildirimi geliyor, kabul edince aramaya giriliyor
- [ ] Cevapsız aramanın bildirimi ekranda asılı kalmıyor

---

## §14 Dev'e notlar (M3c derslerinin devamı)

1. **Cihazın davranışını varsayma, ölç.** M3c'de klavye payı dört denemede çözüldü; dördüncüde
   ekrana ölçüm şeridi konup sayılar yazıldı ve tek turda oturdu. Ses yönlendirme/foreground service
   aynı sınıf: "bende çalıştı" doğrulama değil ([[cihaz-farkliliklari-hesaba-kat]]).
2. **Dokunma hedefi ≥44dp** ve bu sefer **ölçülerek** (D37: göz kararı iki düğmeyi 38/40dp geçirmişti).
   Kapatma düğmesi ≥56dp.
3. **Sözleşmede olmayan bir şey gerekiyorsa DUR.** M3c'de dev iki kez durdu ve iki kez haklıydı
   (video izin listesi, "Dosyalar" satırının UI yalanı). Aynı davranış bekleniyor.
4. **Sunucu otoritedir.** Token, katılımcı listesi ve izin bayrakları sunucudan gelir; istemcide
   kopya kapı, kopya süzgeç, kopya sabit tutulmaz.
