# Sprint M4d — Mobil Görüntülü Arama: 1-1 DM

> **Tier:** yalnız `mobile/` (+ `web/src/i18n/tr.json` metin ekleme, tier kuralının bilinen istisnası).
> `api/` sıfır · `web/` kod sıfır.
> **Track:** F2 mobil · M4 ses fazının **görüntülü** yarısının ilk parçası (sahip faz bölmesi 2026-08-04:
> 1-1 DM → grup DM → ortam kanalı, sesin sırasıyla aynı).
> **Referans:** web `src/stores/voice.ts` + `src/views/home/components/DmConversation.vue` (kamera düğmeleri
> ve `startWithCamera` akışı orada canlı) · mobil `SPRINT_M4A_MOBILE_VOICE_CONTRACT.md` (arama ekranının kendisi).
> **R7:** yüzey R7'ye **temas ediyor** ama karar fonksiyonu yazılmıyor (bkz. §7). Kapı sunucuda, mobil sonucu gösterir.

---

## §0 Bu sprint neden sanılandan küçük, ve nerede değil

**Küçük olan taraf.** Video için yeni bir sistem kurulmuyor:

- **Sunucu hazır.** `POST /channels/:id/voice/token` yanıtı `canPublishCamera` / `canPublishScreen`
  döndürüyor (`api/src/modules/voice/voice.service.ts` → `resolveVideoSources`, C4/C7'de yazıldı,
  R7'den geçti). Canlıda `CAMERA_ENABLED=true`. **Bu sprintte `api/` hiç açılmayacak.**
- **İstemci kütüphanesi kurulu.** `@livekit/react-native` 2.12.0 zaten bağımlılıkta ve `VideoTrack`
  bileşenini veriyor. `livekit-client` 2.21.0 da öyle.
- **İzin manifest'te.** `android.permission.CAMERA` `@config-plugins/react-native-webrtc` tarafından
  zaten bildirilmiş (`android/app/src/main/AndroidManifest.xml` satır 5). Çalışma-anı izni istemek
  gerekir, manifest değişikliği gerekmez.
- **Oda zaten kurulu.** DM araması M4a'da bitti; bu sprint var olan `Room` üzerine bir track ekliyor.

**🔴 Sonuç: yeni native paket YOK → yeni dev build YOK.** Mevcut APK ile geliştirilir ve doğrulanır.
Bir noktada "şunu da kuralım" diyorsan **DUR ve bildir**; bu sprintin ucuz olmasının tek sebebi bu.

**Küçük OLMAYAN taraf — arka plan davranışı (§6).** Kamera, sesin aksine görünür arayüze bağlıdır.
Bu sprintin gerçek işi orada; kutucuğa video çizmek değil.

---

## §1 Kapsam

**Kapsam: 1-1 DM'de görüntülü arama.** Grup DM ve ortam sesli kanalı **kapsam dışı** (M4e / M4f).

| Dosya | Ne değişiyor |
|---|---|
| `src/stores/voice.ts` | `canPublishCamera` + `isCameraOn` + uzak video track state'i; `toggleCamera`, `switchCamera`; AppState dalı (§6) |
| `src/api/voice.ts` | değişiklik YOK (`canPublishCamera` alanı DTO'da zaten var) |
| `src/app/(app)/call.tsx` | video kutucukları + kamera düğmelerinin bağlanması |
| `src/components/call/ParticipantTile.tsx` | video dalı (kamera açıksa `VideoTrack`, değilse bugünkü avatar) |
| `src/components/call/CallControls.tsx` | kamera aç/kapat + kamera çevir düğmeleri (koşullu) |
| `src/app/(app)/dm/[id].tsx` | başlıkta **görüntülü ara** düğmesi (`startWithCamera`) |
| `web/src/i18n/tr.json` | yeni `mobile.call.*` anahtarları (§8) |

---

## §2 Kameranın açılması

1. Token yanıtındaki **`canPublishCamera` store'a alınır** (bugün okunmuyor, atılıyor). `false` ise
   kamera yüzeyi hiç çizilmez (§7).
2. Kullanıcı kamera düğmesine bastığında **çalışma-anı CAMERA izni** istenir. Desen mikrofonunkiyle
   birebir aynı olacak (`PermissionsAndroid.request`, `stores/voice.ts` içindeki mevcut mikrofon dalı):
   reddedilirse arama **düşmez**, yalnız kamera açılmaz ve çağıran ekran "Ayarları Aç" seçenekli uyarıyı
   gösterir (`reason: 'camera_denied'`, mikrofondaki `mic_denied` ayrık-kod deseni).
3. İzin varsa `room.localParticipant.setCameraEnabled(true)`.
4. 🔴 **Dönen publication `null` ise state geri alınır.** Web'de bu tuzak yaşandı ve orada yorumla
   duruyor (`web/src/stores/voice.ts` ~322): sunucu grant'ı vermediğinde SDK sessizce `null` publication
   döndürür, istemci "kameram açık" sanır, karşı tarafta hiçbir şey yoktur. `isCameraOn` yalnız gerçek
   publication geldiğinde `true` olur.
5. Kapatma: `setCameraEnabled(false)` + yerel video track'i state'ten düşür.
6. `leave()` her durumda `isCameraOn`'u sıfırlar (mevcut sıfırlama bloğuna eklenir).

**DM başlığındaki görüntülü ara düğmesi:** telefon ikonunun yanına kamera ikonu. Bastığında mevcut
`startOrJoin` akışının aynısı çalışır, tek fark bağlantı kurulduktan sonra kameranın otomatik açılması
(`startWithCamera`). Web'deki `pendingCameraStart` deseni: bayrak bağlanmadan önce yazılır, bağlantı
kurulunca **`canPublishCamera` kontrolüyle birlikte** uygulanır ve her yolda temizlenir.

---

## §3 Video kutucuğu

- `ParticipantTile` bugünkü sözleşmesini korur; **yeni bir kutucuk bileşeni yazılmaz.** Video track'i
  olan katılımcıda avatar yerine `VideoTrack` çizilir, kalan her şey (ad, mikrofon rozeti, konuşma
  halkası, `dimmed`, `ringing`) aynı yerinde kalır.
- Konuşma halkası video kutucuğunda da görünür. Kimin konuştuğu, kamerası açıkken de gereken bilgidir.
- **Yerel önizleme aynalanır** (ön kamera). Kullanıcı kendini aynada gördüğü gibi görür; arka kameraya
  geçildiğinde aynalama kalkar.
- Uzak taraf kamerasını kapattığında kutucuk **avatara geri döner**, boş siyah kare kalmaz
  (`TrackUnsubscribed` / `TrackMuted`).

---

## §3-R Video düzeni — REVİZYON (sahip kararı 2026-08-08, ilk turdan sonra)

🔴 **§3'ün "video avatarın yerine çizilir" cümlesi YETERSİZDİ ve PM hatasıdır.** Uygulandığında karşı
taraf 88 piksellik yuvarlak bir daire içinde görünüyor; görüntülü arama bu değil. Referans uygulamaya
İLK turda bakılmalıydı ("revize turu eşiği" dersi). Sahip Discord düzenini seçti.

**Yeni kural — düzen kamera durumundan türetilir, ayrı bir state tutulmaz:**

- **Hiç kimsenin kamerası açık değilse:** bugünkü iki kutucuk düzeni **AYNEN** kalır. Sesli arama
  görünümü değişmez (regresyon yasak).
- **En az bir taraf kamera açtığında** düzen değişir:
  - **Tam alan = karşı taraf.** Videosu varsa video, yoksa bugünkü avatar + ad (ortalanmış, büyük).
    Mikrofon-kapalı rozeti ve "Çalıyor…" / "tek başınasın" göstergeleri bu alanda korunur.
  - **Sağ üst köşede küçük kare = sen.** Yalnız **senin kameran açıkken** çizilir; kapalıyken köşe
    kutusu **hiç yok** (boş yüzey açma kuralı). Ön kamerada aynalı.
  - Kontrol çubuğu bugünkü yerinde, otomatik gizlenme davranışı **değişmez**.
- **Konuşma halkası** tam alanda çizilmez (tek kişilik alanda anlamsız); köşe kutusunda ve iki-kutucuk
  düzeninde bugünkü gibi kalır.
- **Grup/guild dalına (`isGridCall`) DOKUNULMAZ.** Bu revizyon yalnız DM dalıdır (M4e/M4f kendi işleri).

**Kapsam dışı (bilerek):** köşe kutusunun sürüklenebilir olması · köşeye dokununca tam alanla yer
değiştirmesi · tam ekran/yatay mod. Discord'da var, bizde yok; istenirse ayrı kalem.

---

## §4 Ön/arka kamera çevirme

Kamera açıkken kontrol çubuğunda ikinci bir düğme: kamerayı çevir. LiveKit'in mevcut track'i yeniden
başlatma yolu kullanılır; **kamera kapatılıp açılmaz** (karşı tarafta kutucuk yanıp sönerdi).
Kamera kapalıyken bu düğme **çizilmez** (boş yüzey açma kuralı).

---

## §5 Kontrol çubuğu

Bugün üç düğme var (mikrofon · sohbet · kapat). Görüntülü aramada **beşe** çıkıyor:
mikrofon · kamera · kamera çevir (yalnız kamera açıkken) · sohbet · kapat.

- Kamera düğmesi yalnız `canPublishCamera === true` iken çizilir.
- 🔴 **Dokunma hedefi D37 dersi:** yeni düğmeler de ölçülerek yerleşecek (mevcut 56dp daireler).
  Beş düğme dar ekranda sığmıyorsa **düğme küçültme değil**, aralık daraltma tercih edilir; sığmazsa
  DUR ve bildir (tasarım kararı PM'e ait, sessizce 44dp altına inme).

---

## §6 🔴 Arka plan davranışı — bu sprintin asıl işi

**Model: kamera görünür arayüze bağlı, ses servise bağlı.** (Sahip 2026-08-08'de Discord'u cihazda
test etti; Discord'un davranışı da bu.)

- Uygulama arka plana alındığında (`AppState` → `background`) **kamera yayını durdurulur**, ses devam
  eder (mevcut mikrofon tipi foreground service).
- Kullanıcının **niyeti korunur**: `cameraIntent` (kullanıcı kamerayı açık bırakmıştı mı) ile `isCameraOn`
  (şu an gerçekten yayında mıyız) **ayrı iki bilgidir**. Öne dönünce niyet açıksa kamera **kendiliğinden
  geri açılır**, kullanıcı düğmeye tekrar basmak zorunda kalmaz.
- Öne dönüşte `canPublishCamera` hâlâ `true` olmalı; değilse kamera açılmaz (kapı sunucuda).

**Neden böyle:** foreground service tipimiz `microphone`
(`modules/call-foreground-service/android/src/main/AndroidManifest.xml`). Android 14+ ile kameranın
görünür arayüz olmadan çalışması `FOREGROUND_SERVICE_CAMERA` tipini ve Play beyanını gerektirir.
**PM kararı 2026-08-08: o yola girilmiyor** — Discord da girmiyor; onun arka planda kamerayı sürdürmesi
PiP sayesindedir (PiP'te aktivite hâlâ görünür sayılır), FGS kamera tipi sayesinde değil.

🔴 **PiP bu sprintte YAPILMIYOR** (§9). Yani bu sprint bittiğinde davranış şu olacak: uygulamayı arka
plana alınca karşı taraf senin görüntünü kaybeder, sesin devam eder, geri dönünce görüntü geri gelir.
**Bu bilinen ve kabul edilmiş ara durumdur, kusur olarak raporlanmaz.** PiP ayrı sprintte gelip bu
farkı kapatacak.

---

## §7 T&S (R7 yüzeyi)

**Kapı sunucuda, istemcide değil.** `resolveVideoSources` DM dalında şunu diyor: **iki taraf da yetişkinse
video, taraflardan biri minörse video YOK.** Karar `canPublishCamera` olarak istemciye iniyor.

- İstemci bu kapıyı **kurmaz** (yaşı kendi hesaplamaz) ve **gevşetmez** (`canPublishCamera=false` iken
  kamerayı açmayı denemez).
- `canPublishCamera === false` → kamera düğmesi **hiç çizilmez.** 🔴 Bu, "görünür-kilitli yap" genel
  ilkesinin **bilinçli istisnasıdır**: 1-1 DM'de "kamera bu sohbette kapalı" açıklaması, yetişkin
  kullanıcıya karşı tarafın minör olduğunu söyler. Brief §5 / G1: **minör statüsü UI'da asla gösterilmez.**
  Web de aynısını yapıyor; mobil sapmayacak. (Genel görünür-kilitli borcu için bkz. `PLAN.md` T&S şeffaflık kalemi.)
- **Kayıt YOK.** Ne yerel ne uzak video hiçbir yere yazılmaz, ekran görüntüsü alınmaz, dosyaya dökülmez.
- Yayın-durdur (`stopBroadcast`, R11) **yalnız ortam kanallarında** çalışır (`requireGuildVoiceChannel`),
  DM'de yoktur. Bu sprintte o dal **yazılmaz**; M4f'in (ortam kanalı kamera) işidir.

**Sunucu tarafında değişiklik gerekiyor gibi göründüğü an DUR.** Bu sprintte `api/` diffi sıfır olmalı.

---

## §8 i18n

- **Var olanı kullan, yenisini uydurma:** `voice.cameraOn` ("Kamerayı aç") ve `voice.cameraOff`
  ("Kamerayı kapat") `tr.json`'da zaten var, web kullanıyor.
- Yeni eklenecekler (`mobile.call.*` altına): kamera çevirme etiketi · kamera izni reddedildi metni ·
  DM başlığındaki görüntülü ara düğmesinin erişilebilirlik etiketi.
- Kaynak `web/src/i18n/tr.json`, **kopyalanmaz, oraya eklenir.**

---

## §9 Kapsam dışı (bilerek)

- **PiP (resim içinde resim)** — ayrı sprint (M4p). Native diff + Kotlin modül işi; bekleyen **D44 zil
  sesi düzeltmesi** o derlemeye binecek. Bu sprintte hiç dokunulmaz.
- **Grup DM görüntülü (M4e) ve ortam kanalı kamera (M4f)** — sıradaki iki sprint.
- **Ekran paylaşımı** — mobilde hiç yok, PLAN kararı (MediaProjection + ayrı FGS tipi + Play beyanı).
- **Gelen arama bildiriminde "görüntülü arama" ayrımı** — bugün çağrı daveti WS payload'ında video
  bilgisi taşımıyor; eklemek `api/` işidir. Aranan kişi bildirimde "seni arıyor" görüp odaya girer ve
  karşı tarafın videosunu görür. Web'de de böyle. **Sahip cihaz turunda rahatsız ederse borç açılır.**
- Video kalitesi/çözünürlük seçimi, sanal arka plan, kamera efektleri, hoparlör-video düzeni seçenekleri.
- `canPublishScreen` bayrağı okunmaz bile (ekran paylaşımı yok).

---

## §10 DoD

### Kod tarafı (dev)
- [ ] `npm run typecheck` ve `npm run lint` temiz
- [ ] `api/` ve `web/` kod diffi **sıfır** (`web/src/i18n/tr.json` metin eklemesi hariç)
- [ ] **Native diff yok** — `app.json`, `android/`, `modules/` değişmedi; yeni bağımlılık eklenmedi
- [ ] `canPublishCamera=false` yolunun testi: düğme çizilmiyor ve `toggleCamera` erken dönüyor

### Cihazda (SAHİPTE — iki cihaz/hesap gerekiyor)
- [ ] DM başlığındaki görüntülü ara düğmesi: arama **kamera açık** başlıyor
- [ ] Arama sırasında kamera aç/kapat: karşı tarafta kutucuk video ↔ avatar arasında geçiyor
- [ ] Kamera çevir: ön/arka geçiyor, karşı tarafta yanıp sönme yok, ön kamerada kendi görüntün aynalı
- [ ] Kamera izni **reddedildiğinde** arama düşmüyor, "Ayarları Aç" çıkıyor
- [ ] 🔴 Uygulamayı arka plana al: **sesin devam ediyor**, karşı taraf görüntünü kaybediyor; geri dön:
      görüntü **kendiliğinden** geri geliyor (düğmeye basmadan)
- [ ] Uygulamayı görevlerden tamamen kapat: ses devam ediyor (mevcut davranış **regresyonsuz**)
- [ ] Mini pencere (uygulama içi) kamera açıkken de doğru çalışıyor, `/call`a dönüş sağlam
- [ ] **Sesli arama regresyonsuz:** kamera hiç açılmadan yapılan 1-1 DM araması M4a/M4z'deki gibi
- [ ] Grup DM araması ve ortam sesli kanalı **regresyonsuz** (bu sprint onlara dokunmadı)

---

## §11 Dev'e notlar

1. **Emülatörde doğrulama yeterli değil**, ama emülatör kamerası (webcam/animasyonlu sahne) geliştirme
   sırasında iş görür. Cihaz turu sahipte; sen emülatörde bitir.
2. **İki state ayrımını atlama** (§6): `cameraIntent` ≠ `isCameraOn`. Tek bayrakla yazarsan öne dönüşte
   kamera geri gelmez ya da izinsiz geri gelir.
3. `stores/voice.ts` bugün 615 satır. Video ile 300+ satır büyürse **bölme kararını kendin alma**, bildir
   (`over-engineering yapma` kuralı ile `dosya 300+ satır` sinyali burada çarpışıyor, kararı PM verir).
4. Web `stores/voice.ts`'i **referans al, kopyalama.** Orada deafen/cihaz-seçimi/ekran-paylaşımı da var;
   hiçbiri bu sprintin kapsamında değil (M4a'nın aynı uyarısı).
5. Sözleşmede olmayan bir ihtiyaç doğarsa (özellikle `api/` veya native tarafında) **DUR ve bildir.**
