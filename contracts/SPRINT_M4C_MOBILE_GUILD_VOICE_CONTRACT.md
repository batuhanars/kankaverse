# Sprint M4c — Mobil Ortam Sesli Kanalı

> **Tier: yalnız `mobile/`.** `api/` ve `web/` diffi **SIFIR**. Sunucu bu işi Sprint V2/C4/R11'den
> beri yapıyor ve R7'den geçti; bu sprint **mevcut sisteme mobil istemci** yazar.
>
> **Faz sırası takas edildi (sahip kararı 2026-08-07).** PLAN'daki sıra (1) 1-1 DM → (2) grup DM →
> (3) ortam kanalı idi. M4a bitince **(3) öne alındı**: mobilde ortam ses kanalları **hiç görünmüyor**,
> topluluk platformunun asıl kullanımı bu. Grup DM sesli (M4b) sıraya geri düşüyor.
>
> Aktif sözleşme budur; M4a (`SPRINT_M4A_MOBILE_VOICE_CONTRACT.md`) arşiv değeri taşır ama oradaki
> platform kararları (foreground service, ses yönlendirme, mini pencere) **hâlâ geçerlidir** —
> yeniden yazılmıyor, yeniden kullanılıyor.

---

## §0 Neden bu sprint küçük, ve nerede değil

**Ağır platform işi M4a'da bitti:** LiveKit bağlantısı, mikrofon izni, foreground service, ses
yönlendirme (hoparlör/kulaklık/Bluetooth), GSM kesintisi, mini pencere, arka planda ses. Hepsi
çalışıyor ve cihazda doğrulandı. Ortam ses kanalı bunların üstüne **kanal listesi + katılma akışı**
ekliyor.

**Bugün mobilde ne var:** hiçbir şey. Kanal listesi ses kanallarını **süzüyor**
(render süzgeci `components/home/ChannelSidebar.tsx`de),
kanal oluşturma ekranında tür seçici **bilinçli olarak yok** (`channel-new.tsx:23`), API katmanı
create'te `type` **göndermiyor** (`api/channels.ts:47`). Yani kullanıcı mobilden bir ortamın ses
kanalına ne girebiliyor, ne görebiliyor, ne de oluşturabiliyor.

🔴 **Kolay sanma:** M4a'nın ses altyapısı **1-1 DM varsayımlarıyla** yazıldı. Üç yerde kırılıyor
(§3, §4, §5) ve ikisi sessizce yanlış davranır, patlamaz.

---

## §1 Kapsam

| Dosya | İş |
|---|---|
| `src/app/(app)/(tabs)/home.tsx` | kanal listesi süzgeci: ses kanalları görünür (§2) |
| `src/stores/voice.ts` | guild katılma yolu + 🔴 yalnız-kalma ayrımı (§3, §4) |
| `src/app/(app)/call.tsx` | çok katılımcılı görünüm (§5) |
| kanal listesi satır bileşeni | ses kanalı ikonu + içindekiler (§6) |
| `src/app/(app)/channel-new.tsx` + `src/api/channels.ts` | kanal türü seçici (§7) |
| `web/src/i18n/tr.json` | yeni `mobile.voice.*` anahtarları (§9) |

Listede olmayan dosyaya ihtiyaç → **DUR ve bildir.**

> 🔴 **PM atıf hatası düzeltildi (dev bulgusu 2026-08-07):** §0 önce süzgeci `home.tsx:165/178`
> diye gösteriyordu — **yanlıştı**. O satırlar `markRead` süzgeçleridir ve `GUILD_TEXT`te kalmaları
> **doğrudur** (ses kanalının okunmamışı yok). Gerçek render süzgeci `ChannelSidebar.tsx`teydi. Dev
> yanlış satırı değiştirmedi, doğru yeri buldu ve bildirdi. Sözleşmedeki satır atıfları **kanıt değil
> işaret**: dev her zaman kendi okumasıyla doğrular.


---

## §2 Kanal listesinde ses kanalları

Süzgeç `GUILD_TEXT`ten çıkarılır; ses kanalları **kendi sırasında** (`position`) görünür, metin
kanallarıyla aynı listede — web'in yaptığı gibi ayrı bölüm **yok**.

- Ses kanalı satırında **hoparlör ikonu** (web `ChannelPanel.vue:1185` pariteti).
- Satıra dokunma → **doğrudan katılır** (web `ChannelPanel.vue:390`: `voiceStore.join(channel.id)`).
  Ara ekran, onay diyaloğu, "katılmak istiyor musun" **YOK**.
- Ses kanalının **okunmamış rozeti yok** (mesajı yok); okundu/okunmadı mantığı bu satırlara
  uygulanmaz, `markRead` çağrılmaz.
- Kanal uzun basma menüsünde metin kanalına özgü anlamsız eylemler (okundu işaretle vb.) gizlenir.
  Yeni eylem eklenmiyor.

---

## §3 Katılma ve ayrılma

Katılma **davetsizdir** — DM'deki `call_invite` akışı burada **YOK**, kimse çalmaz.

M4a'nın `startOrJoin(channelId, peerLabel, options)` imzası DM için yazıldı (`peerLabel` bildirim
gövdesi, `invite` daveti kontrol ediyor). Guild kanalı için:
- Davet **hiç gönderilmez** (`voice:call_invite` çağrılmaz, ack beklenmez).
- Bildirim gövdesindeki etiket **kanal adı** olur (§9'daki metin).
- `didInvite` guild yolunda **her zaman false**; "Çalıyor…" göstergesi hiç çıkmaz.

Dev imzayı nasıl ayıracağına karar verir (ayrı bir `joinGuildVoice` ya da `options.kind`).
🔴 **Ama DM yolunun davranışı DEĞİŞMEYECEK** — M4a cihazda doğrulandı, regresyon kabul edilmez.
Seçtiği yolu ve **neden** seçtiğini raporlar.

Ayrılma M4a'nın `leave()` yolunu aynen kullanır (foreground service durur, `voice/leave` gider).

---

## §4 🔴 Yalnız kalma zaman aşımı — bu sprintin en sinsi parçası

`voice.ts:407` `scheduleAloneCheckIfNeeded` bugün **koşulsuz** çalışıyor: odada tek kişi kalınca
3 dakika (hiç kimse katılmadıysa) veya 60 saniye (biri katılıp çıktıysa) sonra **otomatik ayrılıyor**.

DM'de bu doğru (cevapsız arama sonsuza kadar sürmesin). **Ortam ses kanalında felaket:** kanala ilk
giren kişi arkadaşlarını bekler, 3 dakika sonra sessizce atılır. Kullanıcı "bağlantı düşüyor"
sanır; gerçek sebep koda gömülü bir sayaçtır.

→ Guild ses kanalında **yalnız-kalma zaman aşımı TAMAMEN KAPALI**.

Web'de bu ayrım zaten var ve referanstır: `web/src/stores/voice.ts:231`
`autoEndWhenAlone = opts?.autoEndWhenAlone ?? false` — web'de **varsayılan kapalı**, DM çağrısı onu
açıkça `true` yapıyor. Mobilde bayrağın kendisi hiç yok. Aynı ayrım mobile getirilir.

⚠️ M4a'nın iki sabiti (`ALONE_TIMEOUT_NEVER_JOINED_MS` 3 dk · `ALONE_TIMEOUT_LEFT_MS` 60 sn) DM
yolunda **aynen kalır**, dokunulmaz.

---

## §5 Arama ekranı çok katılımcıya açılır

`call.tsx` bugün **iki kişi** varsayıyor:

```
const peerMember = shown.participants.find((p) => !p.isLocal);   // TEK karşı taraf
const alone = shown.participants.length <= 1;
```

Ortam kanalında N kişi olur. Ekran **ızgaraya** döner (M4a'nın kutucuk bileşeni yeniden kullanılır,
yeni tasarım dili icat edilmez):
- Katılımcı sayısı arttıkça kutucuklar küçülür; sıralama **kararlı** olmalı (katılım sırası veya ad),
  her yeniden çizimde yer değiştirmemeli.
- Konuşan kişi yeşil kenarlıkla işaretlenir (M4a'da var, korunur).
- Mikrofonu kapalı olanda rozet (M4a'da var, korunur).
- **"Tek başınasın" durumu ortam kanalında da gösterilir** ama metni farklıdır: DM'de "karşı taraf
  bekleniyor", burada "bu kanalda ilk sensin" tonunda (§9). Sayaç yok, kimse atılmıyor (§4).
- Başlık: kanal adı + ortam adı.

🔴 M4a-1'in **beyaz ekran** dersi geçerli: ekran durum boşalmadan önce yığından çıkar, çıkarken
görünüm dondurulur (`isLeaving`/`frozenRef` deseni `call.tsx`'te zaten var, **bozulmayacak**).

---

## §6 Kanal listesinde kimler var

Ses kanalı satırının **altında** o an içeride olanlar listelenir (web `ChannelPanel.vue:1293`
`VoiceParticipantList` pariteti): küçük avatar + ad, mikrofon kapalıysa rozet.

Kaynak M4a'da **zaten var**: `voice:subscribe` ile kanal presence aboneliği ve
`useVoicePresenceStore`. Yeni bir uç **çağrılmaz**, yeni bir store kurulmaz.

- Ortam açıkken o ortamın ses kanallarına abone olunur, ortamdan çıkınca **abonelik bırakılır**
  (`voice:unsubscribe`). Sızıntı bırakma.
- Kimse yoksa satır altında **hiçbir şey** görünmez (boş liste kutusu değil, hiçbir şey).

---

## §7 Ses kanalı oluşturma

`channel-new.tsx`'e **tür seçici** gelir (Metin / Ses), `api/channels.ts` create'e `type` alanı
eklenir. Uç bunu zaten destekliyor (`GUILD_TEXT` | `GUILD_VOICE`).

- Varsayılan **Metin** (bugünkü davranış korunur).
- Ses seçilince metin kanalına özgü alanlar (varsa) gizlenir.
- Yetki kontrolü **sunucuda**; istemci kendi kapısını kurmaz, sunucunun 403'ünü Türkçe gösterir.

---

## §8 T&S (R7 yüzeyi)

- **Tüm kapılar sunucuda.** `voice/token` guild dalında yaş/medya/erişim kapıları çalışıyor
  (beş kapılı model: minör · `mediaEnabled` · `ageGated` · `adultsOnly` · karantina). İstemci
  **kapı kurmaz, sunucunun kararını gevşetmez, açımlamaz**.
- `canPublish=false` (karantina) → mikrofon açılmaz, kullanıcı **dinleyici** olarak bağlanır;
  düğme görünür ama pasif + Türkçe açıklama (M4a davranışı kopyalanır).
- `CHANNEL_FULL` (403) → Türkçe toast, ekran açılmaz.
- **Video ve ekran paylaşımı mobilde YOK.** `canPublishCamera`/`canPublishScreen` token'dan gelse
  bile kullanılmaz, düğme çizilmez. (Ekran paylaşımı mobilde PLAN kararıyla hiç yok.)
- **Özel kanal görünür-kilitli:** erişimi olmayan kullanıcı kanalı **görür** ama giremez
  (`ChannelDto.locked`, bilinçli T&S kararı). Sessizce gizleme **yok**; kilit görünür olmalı.
- Ses kanalı moderasyonu (R11 sustur/taşı/yayını durdur) sunucuda canlı ama **mobil arayüzü yok** (§10).

---

## §9 i18n

Kullanıcıya görünen hiçbir string koda gömülmez. Kaynak `web/src/i18n/tr.json` (**import edilir,
kopyalanmaz**). Web'de karşılığı olan `voice.*` anahtarları **yeniden kullanılır**; mobil-özel
metinler `mobile.voice.*` altına eklenir.

🔴 `tr.json` uyarısı: bu dosyaya iki oturum aynı anda yazabilir. Commit edilmemiş çalışma varken
`git checkout -- web/src/i18n/tr.json` **çalıştırılmaz** (19 anahtar bir kez böyle kayboldu).

---

## §10 Kapsam dışı (bilerek)

- **Grup DM sesli (M4b)** — sıraya geri düştü, bu sprintte yok
- **Görüntülü** her biçimiyle (M4d-M4f) · **ekran paylaşımı** (mobilde hiç yok, PLAN kararı)
- **R11 moderasyon eylemlerinin mobil arayüzü** (sunucu canlı; mobil mod paneli ayrı iş)
- Ses ayarları alt sayfası, gürültü bastırma, giriş cihazı seçimi, sağırlaştırma, bas-konuş
- Ses kanalına özgü **düzenleme** ayarları (kullanıcı limiti, bit hızı, `mediaEnabled`) —
  **oluşturma** bu sprintte, **düzenleme** değil
- D44 zil sesi normalizasyonu — bu sprintte native diff çıkarsa **bindirilir**, çıkmazsa bekler

---

## §11 DoD

**Dev'de:**
- [ ] `npm run typecheck` · `npm run lint` · `npx expo-doctor` temiz
- [ ] `api/` ve `web/` diffi **sıfır**
- [ ] Gömülü kullanıcı metni yok; renk/ölçü `src/theme`'den
- [ ] Native diff **varsa** yerelde `expo prebuild` + `gradlew` ile derlendi **ve emülatörde açıldı**;
      yoksa bunu açıkça yaz

**Cihazda (SAHİPTE):**
- [ ] Ortamın kanal listesinde ses kanalları **görünüyor**, hoparlör ikonuyla
- [ ] Dokununca **doğrudan katılıyor**, ara ekran yok; web'de o kanalda görünüyorum
- [ ] 🔴 Kanalda **tek başıma 5 dakika** duruyorum ve **atılmıyorum** (§4 — bu maddeyi atlama)
- [ ] İkinci kişi katılınca ikisi birbirini duyuyor; kutucuklar ızgarada, konuşan işaretleniyor
- [ ] Kanal listesinde o kanalın altında **içeridekiler** görünüyor, çıkınca kayboluyor
- [ ] Ayrılınca web'de **hayalet katılımcı kalmıyor**
- [ ] Arka plana atınca **ses kesilmiyor**, bildirim duruyor (M4a regresyonu)
- [ ] Mini pencere ortam kanalında da çalışıyor
- [ ] Ses kanalı **oluşturulabiliyor** (tür seçici), oluşturunca listede görünüyor
- [ ] 🔴 **DM araması REGRESYONSUZ:** web'den arandığımda hâlâ çalıyor, kabul/reddet çalışıyor,
      cevapsız arama hâlâ düşüyor (§3/§4 ayrımı DM yolunu bozmadı)
- [ ] Erişimim olmayan özel ses kanalı **görünüyor ama kilitli** (sessizce gizlenmiyor)

---

## §12 Dev'e notlar

1. **DM yolunu bozma.** M4a cihazda doğrulandı ve bugün sahibin elinde çalışıyor. §3 ve §4'teki
   ayrımlar DM davranışını **birebir** korumalı; DoD'da ayrı bir regresyon maddesi var.
2. **Cihazın davranışını varsayma, ölç.** Bu sprintte iki kez ders alındı: `expo-notifications`
   kanalı **trigger'dan** okuyor (dokümanda değil, native kaynakta yazıyordu) ve ses dosyasının
   seviyesi kulakla değil ölçümle anlaşıldı. Bir şey "çalışmıyor" görünüyorsa **kütüphanenin
   kaynağına bak**, tahmin turu açma.
3. **Sözleşmede olmayan bir şey gerekiyorsa DUR** ve bildir. §1'de bir dosya listesi var.
4. **Sunucu otoritedir.** Token, katılımcı listesi ve izin bayrakları sunucudan gelir; istemcide
   kopya kapı, kopya süzgeç, kopya sabit tutulmaz.
