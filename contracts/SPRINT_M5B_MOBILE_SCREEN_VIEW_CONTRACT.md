# Sprint M5b — Mobilde Ekran Paylaşımını İZLEME

> **Tier:** yalnız `mobile/`. `api/` sıfır · `web/` sıfır (i18n metin eklemesi hariç).
> **🔴 Native diff VAR** (§3.3, `expo-screen-orientation`) → **yeni dev build gerekir.**
> Kural (2026-08-04 dersi): EAS'a göndermeden önce `npx expo prebuild` + `gradlew` ile **yerelde derle**.
> **Kaynak:** sahip kararı 2026-08-10 — "arkadaşlarımla anime izliyorum, ekranımı paylaşarak yapıyorum".
> **🔴 R7 yüzeyi:** yeni kapı YOK. Kim yayınlayabilir kararı sunucuda (`voice.service.ts`
> `resolveVideoSources`); bu sprint yalnız **izleme** tarafını yazar.

## §0 Bugünkü durum — sessiz delik

Mobil store **yalnız** `Track.Source.Camera` aboneliğini işliyor: `stores/voice.ts:1036`, `1049`,
`1071`, `1130`, `1134`. Yani biri masaüstünden ekran paylaştığında telefondaki kullanıcının
ekranında **hiçbir şey görünmüyor**, hata da yok, uyarı da yok. Kimse şikayet etmedi çünkü kimse
denemedi. Sunucu tarafı hazır: `canPublishScreen` token'da dönüyor (`api/voice.ts` `VoiceTokenDto`),
`SCREEN_SHARE` + `SCREEN_SHARE_AUDIO` grant'leri C4/C7'den beri veriliyor, web hem yayınlıyor hem
izliyor.

Senaryonun ağırlık merkezi burada: paylaşan taraf masaüstünde, **izleyen taraf telefonda**.

## §1 Kapsam

**İÇERİDE:** uzak ekran paylaşımını görmek + ekran sesini duymak + paylaşılan ekrana odaklanmış
(spotlight) düzen + tam ekran/yatay izleme.

**DIŞARIDA — telefondan ekran YAYINLAMA.** Gerekçe kayda geçsin: Android `MediaProjection` +
ön plan servisi + izin akışı + yeni native modül demek, üstüne telefon ekranı bildirim/galeri/
mesaj sızdırdığı için ayrı bir T&S turu gerektirir. Sahibin senaryosunda paylaşan taraf zaten
masaüstünde. Gerçek bir talep çıkarsa ayrı sprint.

**DIŞARIDA:** ekran paylaşımının PiP penceresinde gösterimi (`modules/picture-in-picture`) ·
kalite/çözünürlük seçici · yayın kaydı (mimaride yasak) · aynı anda birden çok ekranın yan yana
gösterimi (§3.2 tek odak kuralı).

## §2 Store — `remoteScreenPublications` (kameradan AYRI map)

`remoteCameraPublications` deseni **birebir** kopyalanır, ayrı bir map olarak:

```ts
remoteScreenPublications: Record<string /* userId */, RemoteTrackPublication>
```

🔴 **Kamera map'ine karıştırılmaz.** Aynı kullanıcı hem kamerasını hem ekranını açabilir; tek map
biri diğerini ezerdi. `wireRoom` içinde bugün `Track.Source.Camera` filtresi olan **beş** noktanın
(`TrackSubscribed`, `TrackUnsubscribed`, `TrackMuted`, `TrackUnmuted`, ilk tarama) her birine
`ScreenShare` dalı eklenir; kamera dalları **satır satır değişmeden** kalır (M4e/M4f regresyon yasağı).

Ekran **sesi** (`SCREEN_SHARE_AUDIO`) için kod yazılmaz: uzak ses track'leri zaten otomatik
çalıyor. DoD'da cihazda **duyulduğu** doğrulanır (§5) — duyulmuyorsa sebep aranır, sessiz geçilmez.

`leave()` bu map'i de sıfırlar; `call.tsx`teki `frozenRef` (ayrılış anı dondurması) alanına da
eklenir — atlanırsa kapanış sırasında native video view sökülüp M4d'de kapatılan Fabric çökme
sınıfı geri gelir.

## §3 Düzen

### §3.1 Spotlight (sahne)
Odada **en az bir** ekran paylaşımı varken düzen değişir:

- Üstte **paylaşılan ekran**, ekranın büyük bölümünü kaplar. `objectFit="contain"` (kamera
  kutucukları `cover` kullanıyor; ekran görüntüsünde kırpma metni/altyazıyı keser).
- Altta katılımcı **şeridi** (yatay kaydırmalı, mevcut `ParticipantTile` `card` varyantı).
- Kimse ekran paylaşmıyorsa bugünkü düzen (tek sütun liste / kamera ızgarası) **aynen** kalır.

Yeni tile varyantı gerekiyorsa `ParticipantTile` içine eklenir (`variant="screen"`); ikinci bir
video bileşeni yazılmaz.

### §3.2 Birden çok paylaşım
Odak **tek**tir: varsayılan olarak ilk başlayan paylaşım. Şeritteki paylaşan kişiye dokununca odak
ona geçer ve kullanıcı seçimi korunur (yeni bir paylaşım başlarsa odak **zıplamaz**). Paylaşım
biterse odak kalan ilk paylaşıma düşer, hiç kalmadıysa §3.1'deki eski düzene dönülür.

### §3.3 🔴 Tam ekran + yatay (native diff burada)
Paylaşılan ekrana dokunmak **tam ekran izleme**ye geçirir: üst bar/alt kontroller gizlenir, video
uçtan uca. Bu görünümde **yatay yön açılır**; geri dönünce uygulama yine dikey kilide döner.

Uygulama bugün `app.json`da `"orientation": "portrait"` ile kilitli. Ekran başına yön kontrolü için
`expo-screen-orientation` eklenir (Expo SDK 54 sürümü, `npx expo install` ile). **`app.json`daki
global `orientation` değeri `portrait` KALIR** — tek bir görünüm dışında hiçbir ekran dönmemeli
(dikey varsayımıyla yazılmış onlarca ekranın yatay düzeni bu sprintin işi değil).

> Gerekçe: 16:9 bir ekran paylaşımını dikey telefonda izlemek görüntüyü ekranın altıda birine
> sıkıştırır. Yatay olmadan bu özellik "çalışıyor ama işe yaramıyor" olur.
> Bedeli dürüstçe: bir dev build turu. Yerelde derlenip doğrulanmadan EAS'a gönderilmez.

## §3.4 ADDENDUM (PM, 2026-08-10 — sahip cihaz turundan SONRA, sahip kararı)

Cihaz turu geçti: masaüstünden paylaşılan ekran telefonda görünüyor, tam ekran yatay çalışıyor.
Sahip iki şey raporladı ve tasarımı revize etti:

1. **Tam ekrana geçiş/çıkış artık videoya dokunmakla DEĞİL, açık bir düğmeyle.** Videoya dokunmak
   ekranın geri kalanıyla aynı işi yapar: kontrolleri gösterir/gizler.
2. **Tam ekranda alt kontrol çubuğu görünür** (mikrofon, sohbet, kapat, kamera — mevcut
   `CallControls`, yeni bileşen yazılmaz) ve mevcut otomatik gizlenme kuralına tabidir
   (`controlsVisible` + `CONTROLS_HIDE_MS`; **yeni zamanlayıcı yazılmaz**).
3. **Acil buton tam ekranda kendi sabit satırında DEĞİL, kontrol çubuğunun içinde.** Böylece
   video uçtan uca olur ve izlerken sürekli görünen bir kırmızı düğme kalmaz.
4. **Tam ekran ÇIKIŞ düğmesi kontrol çubuğunda.** Ayrıca **Android donanım geri tuşu tam ekrandan
   çıkarır** (aramadan ÇIKARMAZ — geri tuşunun aramayı kapatması kabul edilemez).
5. 🔴 **Normal (tam ekran olmayan) görünüm DEĞİŞMEZ:** acil buton bugünkü yerinde, kendi satırında,
   otomatik gizlenmeye tabi olmadan durur. M4t §3.3 orada aynen geçerli.

🔴 **R7 gerekçe kaydı (bu bir T&S gevşetmesidir, sessizce yapılmaz):** M4t §3.3 acil butonu bilinçli
olarak otomatik gizlenmenin DIŞINDA tutuyordu — "panikleyen kullanıcı önce ekrana dokunup kontrolleri
çağırmak zorunda kalmasın". Tam ekranda bu gevşetiliyor. Kabul gerekçesi: (a) yeni tasarımda dokunma
hedefi **tüm ekran** ve tek dokunuş kontrolleri anında geri getiriyor, yani çıkış yolu kaybolmuyor
bir dokunuş geriye gidiyor; (b) alternatifi (sürekli görünen sabit kırmızı düğme) sahibin cihaz
turunda somut rahatsızlık olarak raporlandı ve video izlemeyi bozuyor. Bu gevşetme **yalnız tam ekran
görünümüne** aittir; başka hiçbir yüzeye genişletilmez.

## §3.5 ADDENDUM (PM, 2026-08-10 — `web/` yayıncı tarafı, sahip onaylı)

🔴 **Bu addendum sözleşme başlığındaki "`web/` sıfır" kısıtını AÇIKÇA gevşetir.** Gerekçe: cihaz
turunda görüntü geldi ama **ses gelmedi**, ve kök neden mobilde değil web'de çıktı.

**Kök neden:** `web/src/stores/voice.ts` `toggleScreen` ekranı `setScreenShareEnabled(next)` ile
açıyor, ikinci parametre YOK. LiveKit'te ekran sesi ayrı bir yakalama seçeneğidir
(`{ audio: true }`) — verilmediği için `getDisplayMedia` sesi hiç istemiyor ve
**bugüne kadar hiç ekran sesi yayınlanmadı**. Web↔web testinde duyulan ses akıştan değil, aynı
makinenin hoparlöründen geliyordu (yanlış pozitif).

Alıcı taraf ZATEN hazır: web gelen ses track'lerini `kind === Audio` ile bağlıyor
(`voice.ts:665`, kaynağa bakmıyor), mobilde uzak ses track'leri otomatik çalıyor. Sunucu da hazır:
`SCREEN_SHARE_AUDIO` grant'i C4'ten beri veriliyor (`resolveVideoSources`).

**Yapılacak (yalnız `web/`):**
- `toggleScreen` ekran paylaşımını ses talebiyle başlatır (`{ audio: true }`).
- Durdurmada ekran **sesi** track'i de düşer (yalnız video unpublish edilip ses açıkta kalmamalı).
- Kullanıcı Chrome'un paylaşım penceresinde ses kutusunu işaretlemezse ses track'i **gelmez**;
  bu bir hata değildir, akış sessiz sürer ve paylaşım BOZULMAZ (fail-soft).
- 🔴 Mikrofon ile ekran sesi AYRI track'lerdir ve öyle kalır: mikrofonu susturmak ekran sesini
  kesmez (sahip senaryosu: kimse konuşmadan birlikte izlemek). Mevcut sustur yolu
  (`setMicrophoneEnabled`) yalnız mikrofona dokunur, ona DOKUNULMAZ.

**Kapsam dışı:** track bazında ses ayarı (bir kişinin mikrofonunu kısıp ekran sesini duymak) —
mevcut "Sağırlaştır" kişi bazındadır ve o kişiden gelen HER ŞEYİ susturur; bu bilinçli, ayrı ihtiyaç.

**Tarayıcı davranışı (kullanıcıya kod anlatamaz, bilinsin):** Chrome'da üç paylaşım türünde de
(sekme · pencere · tüm ekran) ses seçeneği **var** — sahip 2026-08-10'da cihazda doğruladı.
⚠️ PM'in ilk yazdığı "pencerede ses yok" bilgisi ESKİYDİ, Chrome sonradan ekledi; düzeltildi.
🔴 Asıl tuzak: kutu **varsayılan olarak İŞARETSİZ** gelir ve seçicinin alt köşesinde durur —
sahip ilk denemede tam da bu yüzden sessiz paylaştı. Firefox ekran sesini hâlâ desteklemiyor.

## §3.6 ADDENDUM (PM, 2026-08-10 — PiP ekran paylaşımını göstermiyor, sahip bulgusu)

**Belirti:** uygulama arka plana alınınca PiP açılıyor ama paylaşılan ekran yerine karşı tarafın
**avatarı** görünüyor.

**Kök neden:** `CallPipOverlay.tsx` konusunu seçerken YALNIZ `remoteCameraPublications`e bakıyor
(satır 32/57/67). M5b ekran paylaşımını ayrı bir map'e (`remoteScreenPublications`) koydu, PiP o
map'i hiç sorgulamıyor → "video yok" sanıp avatara düşüyor. M4p yazıldığında ekran paylaşımı
diye bir şey yoktu; eksik, regresyon değil.

**Yapılacak:**
- PiP konusu seçimi: odada ekran paylaşımı VARSA PiP onu gösterir. Yoksa bugünkü davranış
  (1-1'de karşı tarafın kamerası, guild/grup'ta konuşan kişi) **satır satır aynı** kalır.
- Hangi paylaşım: **ilk** paylaşım yeter. `call.tsx`teki kullanıcı odak state'i (§3.2) PiP'e
  TAŞINMAZ — PiP küçük bir pencere, oradan odak seçilemez, iki state senkronlamak boşuna karmaşa.
- Ekran içeriği PiP'te de **kırpılmadan** gösterilir (`contain`). Kamera kutucukları `cover`
  kullanmaya devam eder — gerekçe §3.1 ile aynı: kırpma metni/altyazıyı keser.
- Kaynak kaybolursa (paylaşım biterse) PiP bugünkü seçimine geri döner, boş kalmaz.

**Kapsam dışı:** `MiniCallWindow` (uygulama içi küçük pencere) bugün hiç video göstermiyor, yalnız
avatar/ad; bu bilinçli bir M4 kararıydı ve bu addendum ona DOKUNMAZ.

## §4 T&S — yeni karar YOK, mevcut kapıların aynısı

- Kim ekran paylaşabilir: **sunucu** karar verir (`resolveVideoSources`). İstemci kapı kurmaz,
  gevşetmez. Bugünkü kural: `GUILD_VOICE` → yalnız `mediaEnabled` açıksa · `DM` → iki taraf da
  yetişkinse · `GROUP_DM` → **tüm** üyeler yetişkinse.
- İzleyen taraf için ek kapı **eklenmez**: odaya girebilen, odada yayınlananı görür. `mediaEnabled`
  açık genel kanalda minörün ekran paylaşımını görmesi C7 kararının zaten bugünkü hâli (web'de de
  böyle) — bu sprint bir şey değiştirmiyor, pariteyi kapatıyor.
- Acil buton (`EmergencyButton`, A4) tam ekran görünümde de **erişilebilir kalır**. Rahatsız edici
  bir yayını izlerken çıkış yolunun kaybolması kabul edilemez; gizlenen kontrollerin istisnası.
- Kayıt/ekran görüntüsü alma özelliği **eklenmez**.

## §5 Bilinçli değiştirilmeyenler (borç olarak kaydedilir)

- `adaptiveStream` / `dynacast` mobil `Room` seçeneklerinde **kapalı** (bkz. `stores/voice.ts:578`).
  Ekran paylaşımı izlemek mobil veride pahalıdır. Bu sprintte **dokunulmaz** (ses/kamera davranışını
  da etkiler, ayrı ölçüm işi); PLAN.md teknik borç tablosuna yazılır.
- Kalite seçici / "veri tasarrufu" yok.

## §6 DoD

### Kod tarafı
- [ ] `npm run typecheck` · `npm run lint` temiz · `api/` diffi sıfır
- [ ] Ekran map'i kameradan ayrı; kamera dalları değişmedi (§2)
- [ ] `frozenRef` ve `leave()` yeni map'i kapsıyor (§2)
- [ ] `app.json` global `orientation` hâlâ `portrait`; yatay yalnız tam ekran görünümünde (§3.3)
- [ ] 🔴 Yerel derleme (`expo prebuild` + `gradlew`) **EAS'tan önce** yapıldı ve geçti

### Cihazda (SAHİPTE)
- [ ] Masaüstünden ekran paylaş → **telefonda görünüyor** (bugün hiç görünmüyor)
- [ ] Ekranın **sesi** telefonda duyuluyor (anime senaryosunun yarısı bu)
- [ ] Paylaşan kişi kamerasını da açınca ikisi karışmıyor (ayrı kutu, ayrı akış)
- [ ] Paylaşıma dokun → tam ekran; telefonu yan çevir → **yatay** doluyor; geri dön → uygulama
      yine dikey kilitli
- [ ] İki kişi aynı anda paylaşırsa odak zıplamıyor; şeritten seçince değişiyor
- [ ] Paylaşım bitince ekran eski düzene **çökmeden** dönüyor
- [ ] Tam ekranda acil buton hâlâ erişilebilir
- [ ] Ortam ses kanalında `mediaEnabled` kapalıyken kimse paylaşamıyor (sunucu kapısı sağlam)
