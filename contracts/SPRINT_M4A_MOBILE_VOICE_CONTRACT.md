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

## §0.1 🔴 Arama modeli — "oda önce", klasik telefon değil

**Sahip gözlemi 2026-08-06 (Discord'da doğruladı):** DM'de telefon düğmesine basınca **doğrudan sese
katılıyorsun**. Karşı tarafın kartı pasif duruyor ve üstünde "arkadaşın katılacaktır" yazıyor.
Yani modern Discord'da arama = **girilen bir oda**; karşı tarafa ayrıca çalma bildirimi gidiyor ama
arayan beklemiyor, zaten içeride.

**Bizim webimiz bugün KLASİK modeli uyguluyor** (`useCall.ts:17` `startCall`): arayan `call_invite`
gönderir, "Aranıyor…" barında **bekler**, ancak `voice.call_accepted` gelince odaya girer
(`useSocket.ts:390`). Yani iki model arasında gerçek bir fark var ve seçim yapılmalı.

✅ **KARAR: mobil "oda önce" modelini uygular.** Gerekçeler:
- **Bedava geliyor.** M4a-1 zaten "odaya katıl" inşa ediyor; arayan tarafı bu modelde **aynı ekran**.
  Ayrı bir "Aranıyor…" ekranı, geri-zil durumu, iptal-vs-kapat ayrımı, 30 sn arayan-tarafı zaman
  aşımı — bunların **hepsi düşüyor**.
- **Sunucu değişmiyor.** İki model de aynı uçları kullanıyor; sunucu yalnız röle. `voice:call_invite`
  ack alır, `voice/token` odaya sokar. Sıralama istemci kararı.
- **İki model birbiriyle çalışıyor.** Web'den (klasik) arayan → mobil çalar → kabul → ses açılır.
  Mobilden (oda önce) arayan → web'de çalar → kabul → ses açılır. Cevaplanmazsa web kullanıcısı DM'i
  açınca **"Sese Katıl"** görür; web'de bu zaten var (`DmConversation.vue:313` `hasOngoingCall`).
- **T&S açığı yok.** `voice/token` DM dalında `requireDmCallGate` çalışıyor (`voice.service.ts:160`):
  blok, bekleyen mesaj isteği ve ilişki kapısı **mint anında** yeniden bakılıyor. Yani izinsiz kişi
  DM odasında tek başına oturup karşı tarafa "arama sürüyor" şeridi bile gösteremez.

⚠️ **Bedeli — web ile davranış ayrışması.** Web klasik kalıyor: web kullanıcısı arayınca hâlâ
bekleme barı görecek. Uçlar uyumlu olduğu için bozulma yok, ama **iki istemci aynı özelliği farklı
gösteriyor**. Web'i oda-önce modeline taşımak ayrı ve küçük bir web işi → **D39** olarak borç
tablosuna yazıldı. M4a kapsamına alınmadı (mobil sprintinde web'e dokunmak sapma olurdu).

---

## §0.2 🔴 İç sıralama — üç durak, üçü de cihazda doğrulanabilir

Faz sırası değişmiyor; M4a **içeriden** üçe bölünüyor. Gerekçe M1d dersi: tek hamlede inen büyük
native iş patladığında hangi katmanın patladığı anlaşılmıyor.

| Durak | Kapsam | Cihazda doğrulanan |
|---|---|---|
| **M4a-1** | Odaya girme (**arama başlatma = katılma**, aynı eylem) + arama ekranı + ses yönlendirme + foreground service + mini pencere | Telefondan aramayı **başlatmak**, web'de çalması, karşılıklı konuşmak |
| **M4a-2** | Mobilde **gelen** arama, uygulama **açıkken**: çalma ekranı, kabul/reddet, zil sesleri | Web'den arandığında telefonun çalması ve cevaplanması |
| **M4a-3** | Mobilde gelen arama, uygulama **kapalıyken**: yüksek öncelikli push + bildirimden cevaplama | Uygulama tamamen kapalıyken gelen aramayı görmek |

Her durak sonunda **dur, sahibe bildir, cihaz turu bekle.** Bir sonraki durağa sahip onayıyla geçilir.

> Oda-önce modelinin yan kazancı: **M4a-1 tek başına tam bir özellik.** Telefondan arama başlatılıyor,
> web'deki kanka çalıyor ve cevaplıyor. Eski bölmede M4a-1 yalnız "katıl" olurdu.

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
| al | `voice.participant_joined` | `{ channelId, participant: { userId, username, avatarUrl } }` |
| al | `voice.participant_left` | `{ channelId, userId }` |

> ⚠️ **PM hatası (düzeltildi 2026-08-06):** bu iki satır ilk yazımda **yanlıştı** — `participant_joined`
> düz alanlarla (`{ channelId, userId, username, avatarUrl }`) yazılmıştı. Sunucunun gerçek yayını
> `voice.service.ts:214` `joinedPayload` ve web tüketicisi (`useSocket.ts:341`) iç içe şekli kullanıyor.
> Dev doğru şekli kodladı ama **raporlamadı**; sözleşme ile kod ayrılınca sözleşme düzeltilir, sessiz
> geçilmez (bir sonraki okuyan yanlış tabloya güvenir).

**Kurallar:**
- `voice:call_invite` ack'i `{ ok: false }` dönerse kullanıcıya **nötr** mesaj: "Şu anda ulaşılamıyor."
  🔴 Sunucu bilerek jenerik `DM_NOT_ALLOWED` dönüyor (engellenme/ilişki/minör bilgisi sızmasın diye).
  İstemci bu kodu **açımlamaz**, ayrıştırmaz, farklı metin göstermez. R7 kuralı.
- `canPublish=false` (karantina) → mikrofon açılmaz, kullanıcı **dinleyici** olarak bağlanır;
  mikrofon düğmesi görünür ama pasif + Türkçe açıklama.
- `CHANNEL_FULL` (403) → Türkçe toast, ekran açılmaz.
- **Yaş/medya kapıları sunucuda.** İstemci kapı KURMAZ, sunucunun verdiği kararı gevşetmez.

---

## §3 M4a-1 — Odaya girme (başlatma = katılma)

### §3.1 DM ekranındaki giriş noktası

`(app)/dm/[id].tsx` açıldığında (yalnız `type === 'DM'`):
1. `voice:subscribe` gönderilir, ekrandan çıkılınca `voice:unsubscribe`.
2. `GET voice/participants` bir kez çağrılır → katılımcı listesi + `startedAt`.
3. `voice.participant_joined/left` ile liste canlı güncellenir.

**Başlıkta telefon düğmesi** (≥44dp). Oda-önce modelinde (§0.1) **başlatmak ile katılmak aynı eylem**:

- **Aramada kimse yoksa** → düğme *aramayı başlatır*: önce `voice:call_invite` (karşı taraf çalar),
  ack `ok` ise odaya girilir. Ack `ok:false` ise **odaya girilmez**, nötr mesaj: "Şu anda ulaşılamıyor."
  🔴 Sıra önemli: davet ÖNCE. Ters sırada, izin yokken kullanıcı bir saniyeliğine odaya girip
  atılmış gibi görünürdü (`voice/token` aynı kapıyı zaten uyguluyor, ama görünen davranış çirkin olurdu).
- **Arama sürüyorsa** (`participants.length > 0`, biz bağlı değiliz) → düğme *katılır*: `call_invite`
  **gönderilmez** (karşı taraf zaten içeride, tekrar çaldırmak spam olur; web'deki `REV-11` kararının
  aynısı). Ek olarak sohbetin üstünde şerit: katılımcı avatarları + "Sesli arama sürüyor" + **"Katıl"**.
- **Biz bağlıysak** → düğme arama ekranına geri döndürür (mini pencere ile aynı iş).

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

**Tek kişi kalınca — 🔴 süre oda-önce modeli için yeniden ayarlandı.** Web'de bu süre **60 sn**
(REV-12) ve o model için doğru: orada tek başına kalmak "karşı taraf aramadan çıktı" demek. Oda-önce
modelinde ise arayan **kabul edilmeden önce de** tek başına oturuyor; 60 sn cevap vermek için kısa.
- **Hiç kimse katılmadıysa** (arayan bekliyor): **3 dk** sonra otomatik biter.
- **Biri katılıp sonra çıktıysa**: **60 sn** (web pariteti).
İki eşik tek yerde sabit olarak durur, ekrana gömülmez.

**Reddedilme:** `voice.call_rejected` gelirse arayan odada bekletilmez → odadan çıkarılır + nötr
bilgi ("Şu anda ulaşılamıyor"). Gerekçe: açıkça reddeden birini "istediğin zaman katılabilirsin"
diye bekleyen bir oda ile karşılamak dürtme yüzeyidir. *(Cevapsızlık farklı: orada oda 3 dk durur.)*

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
- **Tek başınayken:** karşı tarafın kutucuğu **soluk** durur (görsel 10) + "Bu aramada tek başınasın."
  ve "<ad> istediği zaman katılabilir." Bu, oda-önce modelinin kullanıcıya görünen yüzü: arayan
  "bekleme ekranı" değil, boş bir oda görür. Metin 3 dk otomatik bitirmeyi de anlaşılır kılar.
- **Çaldığını göster:** davet gönderildiyse ve karşı taraf henüz katılmadıysa soluk kutucukta
  "Çalıyor…" göstergesi durur. Kullanıcı bildirimin gittiğini bilmeli; yoksa "acaba haberi oldu mu"
  sorusu kalır (sahibin Discord'da tam olarak takıldığı nokta).

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

## §8 M4a-2 — Mobilde gelen arama (uygulama açıkken)

> **Bu durak M4a-1 sahip onayından sonra başlar.**
>
> 🔴 **Giden arama burada DEĞİL, M4a-1'de.** Oda-önce modelinde (§0.1) arama başlatmak odaya
> girmektir; ayrı "Aranıyor…" ekranı, geri-zil durumu, iptal-vs-kapat ayrımı ve arayan tarafı
> 30 sn zaman aşımı **hiç yazılmıyor**. Bu durakta yalnız **karşılama** tarafı var.

### §8.1 🔴 Sunum: TAM EKRAN DEĞİL, BİLDİRİM (sahip görselleri 2026-08-06)

Sözleşmenin ilk hâli "tam ekran gelen arama görünümü" diyordu. Sahip Discord'da gelen aramayı
çekti (`design-refs/m4-ses/13-gelen-arama-kilit-ekrani.jpg` · `14-gelen-arama-uygulama-uzeri.jpg`)
ve **Discord tam ekran arayüz göstermiyor**: hem kilit ekranında hem *uygulama açıkken üstte* **aynı
bildirim** çıkıyor — başlık "Gelen Arama", gövde "<ad> seni arıyor!", iki eylem: **Reddet** ·
**Aramaya Katıl**. Tasarım kaynağı görsellerdir; tam ekran ekran **yazılmıyor**.

**Bu bir sadeleşme, üç kazancı var:**
1. Ayrı bir React ekranı, gezinme dalı ve onun sökülme kusurları (M4a-1'de beyaz ekranın kaynağı tam
   olarak buydu) **hiç doğmuyor**.
2. M4a-2 ile M4a-3 **aynı sunumu** paylaşıyor: fark yalnız tetikleyicide (WS mi, push mi).
   M4a-3'e geçince yeni arayüz yazılmayacak.
3. 🔴 **`USE_FULL_SCREEN_INTENT` ihtiyacı düşüyor.** §9'da "Play 'arama uygulaması' beyanı
   alınamazsa tam ekran çalan arayüz olmaz" diye bir risk yazmıştım; Discord'un kendisi de tam ekran
   kullanmadığına göre bu risk **konusuz kaldı**.

### §8.2 Davranış

`voice.incoming_call` (WS, uygulama açık) → yerel bildirim:
- Kanal: **ayrı ve yüksek önemli** (`IMPORTANCE_HIGH`) — M4a-1'in "arama sürüyor" kanalı
  `IMPORTANCE_LOW`, ikisi karışmaz. Uygulama önplandayken de **üstte (heads-up)** görünmeli
  (`expo-notifications` handler'ı bu bildirim için banner göstermeli).
- Eylemler: **Reddet** → `voice:call_reject` · **Aramaya Katıl** → `voice:call_accept` + M4a-1'in
  katılma akışı (`startOrJoin`, davet göndermeden) + arama ekranını aç.
- Bildirime (gövdeye) dokunmak: uygulamayı açar ve **o DM'e** götürür; arama ekranı yalnız kabul
  edilince açılır.
- **30 sn** cevapsız → bildirim kaldırılır. ⚠️ Arayan tarafta oda **3 dk** yaşar (§3.3): kullanıcı
  çalma bittikten sonra DM'deki "Katıl" şeridinden hâlâ girebilir. İki süre bilerek farklı.
- Arayan vazgeçerse (`voice.call_canceled`) bildirim **kendiliğinden kaybolur**.
  🔴 Oda-önce modelinde arayan "iptal" değil "odadan çıkma" yapıyor; mobil arayan odadan çıkarken
  `voice:call_cancel` **da** gönderiyor (M4a-1'de yazıldı) → `api/` değişmeden telefon susuyor.
- Kabul/reddet sonrası bildirim her hâlde kaldırılır (asılı kalan "Gelen Arama" olmaz).

**Kapsam dışı (şimdilik):** görsel 14'teki DM listesinde **"Devam Eden Arama" / "Arama Sona Erdi"**
satır durumu. Hoş ve ucuz görünüyor ama listeye yeni bir durum kaynağı bağlamak ayrı iş; M4a-2
bitince değerlendirilir.

### §8.3 Sesler

Web sesleri Web Audio ile **sentezliyor** (`useCallSounds.ts`), React Native'de Web Audio yok. Aynı
ton reçetesinden (çift-zil) **kısa bir ses dosyası üretilip** `assets/sounds/` altına konur.

🔴 **Zil `expo-audio` ile ÇALINIR, bildirim kanalının sesiyle değil.** Kanal sesi tek atış çalar;
arama zili **çalma boyunca döngüde** olmalı. Kanal `setSound(null)` ile sessiz kurulur, döngüyü biz
yönetiriz: kabul/reddet/zaman aşımı/iptal → durur. Bu, bildirimin kendi sesiyle zilin üst üste
binmesini de önler.
- Cihaz sessiz/rahatsız-etmeyin kipindeyse **zil çalmaz, titreşim kalır**.
- Geri-zil (ringback) **üretilmez**: oda-önce modelinde arayan zaten odada, bekleme tonu yok.
- Bağlanma/ayrılma blipleri M4a-1'de yoktu, M4a-2'de de **eklenmiyor** (kapsam sabit kalsın).

---

## §9 M4a-3 — Uygulama kapalıyken gelen arama

> **Bu durak M4a-2 sahip onayından sonra başlar. En riskli parça bilerek sona bırakıldı.**

- `voice:call_invite` alındığında sunucu callee'ye **yüksek öncelikli push** göndermeli.
  🔴 Bu **`api/` değişikliğidir** (`PushService` bugün yalnız mesaj bildirimi gönderiyor, `priority`
  alanı yok). M4a-3'e gelindiğinde **PM sözleşmeyi revize eder**; dev kendi başına `api/`ye dokunmaz.
  M4a-1 ve M4a-2 boyunca `api/` diffi **sıfır** olmalı.
- 🟢 **Arayüz zaten M4a-2'de yazıldı** (§8.1): bildirim, kanal, eylemler ve zil aynen kullanılır.
  Bu durakta **yeni ekran yok**; tek fark tetikleyici — WS yerine push.
- ✅ **`USE_FULL_SCREEN_INTENT` riski KAPANDI (2026-08-06):** sözleşmenin ilk hâli tam ekran çalan
  arayüz varsayıyor ve "Play 'arama uygulaması' beyanı alınamazsa olmaz" diyordu. Sahibin görselleri
  Discord'un da tam ekran kullanmadığını gösterdi → o izin hiç istenmeyecek, risk konusuz kaldı.
- Kabul → uygulama açılır ve doğrudan aramaya girer (uygulama kapalıysa açılış + katılma zinciri).
- Zaman aşımı geçmiş çağrının bildirimi **temizlenir**; asılı "Gelen Arama" kalmaz.

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
- [ ] 🔴 **Telefondan arama başlatılıyor:** telefon düğmesine basınca odaya giriliyor ve **web'de zil
      çalıyor**; web kabul edince iki taraf birbirini duyuyor
- [ ] Cevap gelmezken telefonda karşı tarafın kutucuğu **soluk** + "Çalıyor…" duruyor
- [ ] Web'den başlatılan aramaya telefondan **katılınıyor** (DM'deki "Katıl" şeridi), zil tekrar çalmıyor
- [ ] Web'den reddedilince telefon odadan çıkıyor + nötr mesaj; hiç cevaplanmazsa 3 dk sonra düşüyor
- [ ] Mikrofon aç/kapa çalışıyor; karşı tarafta mikrofon-kapalı rozeti görünüyor
- [ ] Konuşan kişinin kutucuğu yeşil kenarlıkla işaretleniyor
- [ ] Ses çıkışı seçici: hoparlör ↔ telefon geçişi çalışıyor; **Bluetooth kulaklık bağlıysa listede**
- [ ] 🔴 Uygulama arka plana atılınca **ses kesilmiyor**, bildirim görünüyor, "Bağlantıyı Kes" çalışıyor
- [ ] 🔴 **GSM araması gelince** Kankaverse mikrofonu susuyor, GSM bitince geri dönüyor
- [ ] Küçültünce mini kutucuk kalıyor, dokununca arama ekranına dönüyor, uygulamanın her ekranında görünüyor
- [ ] Aramadan çıkınca karşı tarafta **hayalet katılımcı kalmıyor** (`voice/leave`)
- [ ] Mikrofon izni reddedilince açıklama + "Ayarları aç" çıkıyor, uygulama **kilitlenmiyor**
- [ ] Uçak moduna alıp geri açınca ekran sonsuza kadar "bağlı" kalmıyor
- [ ] Karşı taraf katılıp sonra çıkınca 60 sn sonra arama kendiliğinden bitiyor
- [ ] **Mevcut özelliklerde regresyon yok:** mesaj gönderme, ek gönderme, klavye payı, bildirimler
      (yeni dev build alındı, M3c'deki klavye regresyonu **native kabuk değişince** olmuştu)

**M4a-2 (cihazda):**
- [ ] Web'den arandığında telefonda (uygulama açıkken) çalıyor; kabul/reddet çalışıyor
- [ ] 30 sn cevapsızda çalma ekranı kapanıyor; DM'de "Katıl" şeridi hâlâ duruyor (oda 3 dk yaşıyor)
- [ ] Web arayan odadan çıkınca telefon **susuyor** (M4a-1'in `call_cancel` gönderimi doğrulanır)
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
