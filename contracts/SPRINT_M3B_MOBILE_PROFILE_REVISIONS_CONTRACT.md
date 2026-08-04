# SPRINT M3b — DM Detay Ekranı + Profil Alt-Paneli + Küçük Revizeler

> **Tek doğruluk kaynağı.** Davranış buradan **sapamaz**; sapma ihtiyacı → **DUR**, sahibe bildir.
> PM compose: 2026-08-03 gecesi · **REVİZE 2026-08-04 sabahı** (sahip Discord mobil görselleri).
>
> **Sıra:** bu sprint biter → tüm dikkat **M4 (ses)**.

---

## §0 Revizyon notu — dünkü sözleşme neyi yanlış anlamıştı

Dün "profil ekranı" diye tek bir iş yazmıştık. Sahip görselleri gönderince **iki ayrı yüzey**
olduğu ortaya çıktı:

1. **DM detay ekranı** — DM başlığına dokununca açılır. Avatar + ad + aksiyonlar (Ara, Sustur) +
   sekmeler (Üyeler · Medya · Sabitlemeler · Bağlantılar · Dosyalar). Bu, M2c'de yaptığımız
   **kanal detay ekranının DM ikizi**. Sahip "profil ekranı" derken bunu kastetmiş.
2. **Profil alt-paneli** — mesaj yazarının avatarına/adına dokununca **alttan kayan panel**.
   Discord'da profil ayrı bir ekran değil, bu paneldir. Bizdeki `ProfileCardModal` bunun yerine geçer.

Dünkü §2 ("grup DM uzun-basma panelinde Ayarlar + grup aksiyonlarının taşınması") büyük ölçüde
**yerini §2'ye bıraktı**: grup aksiyonları ayrı bir "grup ayarları ekranı"na değil, DM detay
ekranının ⋯ menüsüne gider (Discord da böyle). Ayrı ekran kurulmayacak.

**Sahip kararları (2026-08-04):**
- Medya/Bağlantılar/Dosyalar sekmeleri DM'de **çalışacak** → küçük backend işi onaylandı (§5.1).
  Dünkü "`api/` diffi yok" maddesi **düştü**.
- `getUserCard` erişim kuralına **DM üyeliği** eklenecek (§5.2). R7 yüzeyi.

---

## §1 Kankalar listesi — aksiyon düğmeleri ikon-only

`mobile/src/app/(app)/friends-list.tsx` satırlarındaki aksiyon düğmeleri metin etiketiyle geliyor ve
yer kaplıyor (sahip gözlemi).

- Etiketler kalkar, **yalnız ikon** kalır. Dokunma hedefi ≥44dp korunur (`hitSlop` ile küçültme yok).
- `accessibilityLabel` **zorunlu** — etiket ekrandan kalkınca ekran okuyucu için tek kaynak o.
- İkon seçimi mevcut `Ionicons` setinden; aynı aksiyonun web'deki ikonu varsa onunla tutarlı olsun.

---

## §2 DM detay ekranı (YENİ)

### 2.1 Giriş ve kapsam

DM/grup DM sohbet ekranının **başlığına dokunma** bugün profil kartı açıyor. Artık **DM detay
ekranına** yönlendirir. Uzun-basma panelindeki (`DmMenuSheet`) ilk satır da buraya gider.

Yeni ekran: `mobile/src/app/(app)/dm-details.tsx`.

🔴 **Kopyalama yasak.** Ekran, M2c'de çıkarılmış bileşenleri **yeniden kullanır**:
`ChannelDetailsTabBar` · `ChannelMediaTab` · `ChannelLinksTab` · `ChannelFilesTab` ·
sabitlemeler sekmesinin mevcut içeriği. Sekme içi mantık ikinci kez yazılmaz.
Bir bileşen DM'de farklı davranmak zorundaysa **prop'u genişlet**, fork etme.

🔴 **Tek istisna `ChannelMembersTab` — onu YENİDEN KULLANMA.** Ortam üyesi `GuildMemberDto`
(`roles[]` taşır) ve sekme üyeleri **en yüksek pozisyonlu role göre bölümlere ayırıyor**. Grup DM
üyesi `DmParticipantDto`; **rol diye bir şey yok**, gruplama da yok. Bu bileşeni iki şekle
genelleştirmek çalışan bir bileşene tanımı gereği hiç kesişmeyen bir dal eklemek olur → grup DM
kendi düz üye sekmesini alır (§2.3). Ortak olan **satır görünümü**, sekme değil.

`channel-details.tsx` **ayrı kalır** (başlığı, `canManage` kararı, Ayarlar/Davet Et düğmeleri
tamamen farklı). Ortak olan sekme gövdesi, ortak olmayan kabuk.

### 2.2 Başlık bölgesi

- Büyük daire avatar (grup DM'de grup avatarı/baş harf), altında ad.
- Discord'da adın altında ikinci satırda kullanıcı adı var; bizde `username` tek kimlik →
  **ikinci satır yok**, tekrar etme.
- Aksiyon düğmeleri: **Sustur** (mevcut bildirim tercihi akışı) · **Ara** → 🔴 **YALNIZ GRUP DM'de**.
  *(PM düzeltmesi 2026-08-04, mobil dev'in bulgusu: sözleşmenin ilk hâli Ara'yı ayrım yapmadan
  koymuştu ve bu **sahibin 2026-08-01 kararını çiğniyordu** — `TASK.md` 1428: "1-1 DM'de mesaj arama
  KALDIRILDI, web + mobil. Grup DM'de ve ortam kanalında KALIYOR." Gerekçesi kayıtlı: 1-1'de karşında
  tek kişi var, konuşma doğrusal. Sohbet ekranındaki `searchable={!isDm}` zaten doğru, ona dokunma.)*
- 🔴 **Sesli/Görüntülü Arama düğmesi YOK** → M4. Yer tutucu da koyma.
- Sağ üstte **⋯** → alt-panel (§2.4).

🔴 **1-1 DM'de avatar/ad dokunulabilir → `ProfileSheet` açar** (PM düzeltmesi 2026-08-04, mobil
dev'in bulgusu). Gerekçe bir **T&S deliği**: §3.1 profilin tek yolunu "mesaj yazarı" yapmıştı, ama
karşı taraf hiç yazmadıysa **veya kullanıcı sohbeti temizlediyse** (G4) yazar satırı yok; kanka
değilse kankalar listesinde de yok; `DmMenuSheet`'te engelleme yok. Sonuç: o kişiyi **engellemenin
hiçbir yolu kalmıyordu** — §3.3'teki "engelleme kaybolmayacak" maddesini §2.1'in kendisi deliyordu.
M1d-0 sprintini açtıran hatanın aynı sınıfı. Grup DM'de başlık dokunulmaz kalır (Üyeler sekmesi
zaten var, ikinci yol gereksiz).

### 2.3 Sekmeler

| Sekme | 1-1 DM | Grup DM | Kaynak |
|---|---|---|---|
| Üyeler | **gösterme** (iki kişi, bilgi değeri yok) | ✅ | **yeni** `GroupMembersTab` (§2.3.1) |
| Medya | ✅ | ✅ | `ChannelMediaTab` (§5.1 sonrası) |
| Sabitlemeler | ✅ | ✅ | `GET /channels/:id/pins` (zaten kanal kapsamlı) |
| Bağlantılar | ✅ | ✅ | `ChannelLinksTab` (§5.1 sonrası) |
| Dosyalar | ✅ | ✅ | `ChannelFilesTab` (§5.1 sonrası) |

- 1-1 DM'de Üyeler sekmesi **çizilmez** (Discord çiziyor, biz çizmiyoruz: iki kişilik listede
  gösterecek bir şey yok, boş yüzey açma kuralı). Sekme çubuğu 4 sekmeyle başlar.
- Grup DM Üyeler sekmesinde Discord'un "Yeni Grup" satırı **yok** → bizde karşılığı olan akış
  "Üye Ekle" ve o ⋯ menüsünde (§2.4).

### 2.3.1 Grup DM Üyeler sekmesi — `group/[id].tsx` buraya katlanır

Sahip kararı 2026-08-04: grup DM başlığına dokununca bugün **doğrudan üye listesi ekranı**
(`group/[id].tsx`) açılıyor. Artık açılmayacak; grup DM de sekmeli ekrana girecek, üye listesi o
ekranın **bir sekmesi** olacak. Kanal detayıyla aynı mantık, tek fark grup DM'de **rol yok**.

Yeni bileşen `GroupMembersTab`, `group/[id].tsx`'in liste gövdesini **davranışıyla birlikte** taşır:

- Üye satırı: avatar + kullanıcı adı
- Grup sahibi satırında **👑 rozeti**
- 🔴 **Üye çıkarma (✕) korunur** — yalnız grup sahibine görünür, `ConfirmDialog` onayı korunur.
  Bu satır aksiyonu ⋯ menüsündeki dört aksiyonun listesinde yoktu; taşıma sırasında **düşerse
  grup sahibi üye çıkaramaz hale gelir**. M1d-0'daki "engelleme kayboldu" hatasının aynısı.
- 🔴 Kendi satırın **dokunulabilir değil** (kendini engelleyemez/çıkaramazsın) — bugünkü davranış
- Üye satırına dokunma → **profil alt-paneli** (§3)
- Yetki kararı istemcide **yeniden hesaplanmaz**; bugünkü `isOwner` / `channel.ownerId` mantığı aynen

`group/[id].tsx` **rotası kaldırılır**; ona giden tüm yönlendirmeler DM detay ekranına döner.
Ölü ekran bırakılmaz.
🔴 Kaldırmadan önce **ona giden her yol taranır** (uzun-basma paneli, DM başlığı, grup oluşturma
sonrası yönlendirme, push yönlendirmesi `pushNavigation.ts`, bildirimler sekmesi). Biri atlanırsa
kullanıcı var olmayan rotaya düşer.

### 2.4 ⋯ alt-paneli

Mevcut `*Sheet.tsx` desenini kullan (`Modal transparent animationType="slide"`), yeni bağımlılık yok.

**1-1 DM:**
- **Sohbeti Temizle** → mevcut G4 akışı (`DELETE /dm/channels/:id`), `ConfirmDialog` korunur.
  Discord'daki "DM'yi Kapat" bu. **"Sil" dili kullanma**, mesaj DB'de duruyor.

**Grup DM** (dünkü §2'nin taşındığı yer):
- **Üye Ekle · Yeniden Adlandır · Gruptan Ayrıl · Grubu Sil** → `group/[id].tsx` ekranının
  **dibindeki aksiyonlar buraya taşınır**, oradan kalkar. (Satır içi **üye çıkarma** bu listede
  değil, Üyeler sekmesinde kalır → §2.3.1.)
- Yetki: bugünkü kural **aynen** korunur (silme/yeniden adlandırma grup sahibinde, ayrılma herkeste).
  🔴 Yetki kararını istemcide **yeniden hesaplama**; bugün ne yapıyorsa o.
- Yıkıcı aksiyonların onayı korunur. Tek dokunuşla gruptan çıkma / grup silme **YOK**.

🔴 **"Kanal ID'sini Kopyala" YOK.** Discord'daki geliştirici özelliği, bizde karşılığı yok.

### 2.5 Kapsam dışı

- Grup DM'e **rol/yetki sistemi** getirmek: yok, gelmiyor. Grup DM'de tek ayrım `ownerId`.
- Grup DM'e **davet linki**: yok (grup üyeliği yalnız kanka listesinden ekleme ile büyür).
- 1-1 DM'de Üyeler sekmesi.

---

## §3 Profil alt-paneli (`ProfileCardModal` → sheet)

### 3.1 Giriş noktaları

| Yer | Bugün | Karar |
|---|---|---|
| **Mesaj yazarı** (kanal ve DM) | **hiçbir şey** | 🔴 **YENİ: profil alt-paneli** |
| Kankalar listesi satırı | kart | → alt-panel |
| Grup üye listesi / DM detay Üyeler sekmesi satırı | kart | → alt-panel |
| DM başlığındaki isim | kart | → **DM detay ekranı** (§2), profil değil |
| Ortam üye listesi | `guild-member` (yönetim) | 🔒 **DEĞİŞMEZ** (sahip kararı, Discord da böyle) |

🔴 **Mesaj yazarı satırı zorunlu, opsiyonel değil.** Ortam üye listesi yönetimde kaldığı için,
mesaj yazarına dokunmak bir ortamda profile ulaşmanın **tek yolu**. Web'de bu yol zaten var
(`MessageItem` → `UserCardPopover`).

Sahip notu: "kimse sürekli profile bakmaz, dikkatini çeken biri olunca bakarsın" → tek yol yeterli,
her yüzeye giriş noktası serpmeye gerek yok.

### 3.2 İçerik

`GET /users/:id/card` **bugün zaten** şunları dönüyor ve panel bunları çizecek:

| Bölüm | Alan | Not |
|---|---|---|
| Afiş | `bannerUrl` / `bannerColor` | panelin üstünde, avatar afişin üstüne taşar (Discord düzeni) |
| Kimlik | `username`, `avatarUrl` | |
| Aksiyonlar | `friendStatus`, `selfBlocked`, `canMessage` | §3.3 |
| Hakkımda | `bio` | boşsa **bölüm hiç çizilmez** |
| Üyelik tarihi | `memberSince` | TR formatı ("26 Şubat 2019") |
| Ortak Ortamlar | `mutualGuilds` | boşsa çizilmez · 🔴 §5.2 kısıtı |
| Ortak Kankalar | `mutualFriends` | boşsa çizilmez · 🔴 §5.2 kısıtı |
| Roller | `roles` | yalnız ortam bağlamında dolu; boşsa çizilmez |

🔴 **Bizde karşılığı olmayan, KOYMA:** Bağlantılar (Steam/Kick hesap bağlama) · Not (kişisel not) ·
Uygulamalar · Sunuculara Davet Et. Boş bölüm bile çizilmez.

🔴 **M4 için yer bırak:** `voiceStatus` alanı DTO'da **zaten var** ve bugün doluyor. Bu sprintte
**çizme** (mobilde ses yok, tıklanınca gidecek yer yok). Ama panelin düzeni, aksiyonların altına
"şu an sesli kanalda" satırı sonradan girince bozulmayacak şekilde kurulsun.

### 3.3 Aksiyonlar

Mevcut `ProfileCardModal` aksiyonları **bire bir korunur**, kaybolan tek bir tane bile olmayacak:

- **Mesaj** (`canMessage` true ise DM'e götürür; false ise düğme çizilmez). ⚠️ **Düzeltme:** sözleşmenin
  ilk hâli bunu "mevcut aksiyonlar bire bir korunur" başlığı altında "yeni ekleme değil" diye
  yazmıştı; **yanlıştı** — `ProfileCardModal`'da Mesaj düğmesi hiç yoktu, `canMessage` mobilde
  tiplenmemişti bile. Bu bir **davranış eklemesi**, koruma değil. Kalıyor, ama kayıt doğru olsun.
- **Kanka Ekle** — yalnız `friendStatus === 'none'`; gönderim sonrası bilgi metnine döner
- **Arkadaşlıktan Çıkar** — yalnız `friends`; onaylı
- **Engelle** — onaylı
- **Engeli Kaldır** — `selfBlocked` ise

🔴 **Engelleme kaybolmayacak.** Mobilde engel kaldırmanın tek yolu bir dönem bu kart olduğu için
M1d-0 sprinti açılmıştı; aynı hataya düşülmeyecek.

🔴 **Sesli/Görüntülü Arama düğmeleri YOK** → M4.

### 3.4 T&S

- Minör statüsü hiçbir yerde sızmaz; ret mesajları **jenerik** kalır (Sprint 4A G2/G3).
- `selfBlocked` yalnız "ben onu engelledim"; "o beni engelledi" ASLA gösterilmez.
- Kart yüklenemezse (404) jenerik hata; "böyle bir kullanıcı yok" gibi varlık bilgisi verme.
- Mutasyonlar `useFriendsStore` üzerinden gider (M1d-0 dersi: doğrudan API çağrısı store'un
  DM bayrak tazeleme yan etkisini atlıyordu).

---

## §4 1-1 DM panelinde "Kanka Ekle" zaten kankada görünüyor (KUSUR)

`mobile/src/components/home/DmMenuHost.tsx`: `canAddFriend={channel?.type === 'DM'}` — yalnız
"1-1 DM mi" diye bakıyor, **arkadaş olup olmadığına bakmıyor**. Zaten kanka olan kullanıcıda da
"Kanka Ekle" çıkıyor (sahip ekran görüntüsü).

- Web'de bu kapı var: `DmConversation.showAddFriend` → `isFriendInDm` + `selfBlocked` + istek
  gönderilmiş mi. Mobil **aynı kapıyı** uygulasın (`friends` store'da veri zaten var).
- İstek gönderildikten sonra da gizlensin (web'deki `addFriendSent` deseni).
- 🔴 Engellilikte de gizlensin; T&S gereği ret **jenerik** kalır, sebep gösterilmez.

---

## §5 Backend (`api/`) — sahip onaylı, R7 kapsamında

### 5.1 Kanal kapsamlı aramaya `has=` süzgeci

**Sorun:** DM detayının Medya/Bağlantılar/Dosyalar sekmeleri bugün
`GET /guilds/:id/messages/search?in=<channelId>&has=<X>` ucuna gidiyor. DM'in `guildId`'si yok →
sekmeler DM'de çalışamaz.

**Çözüm:** `GET /channels/:id/messages/search` ucuna `has` query parametresi eklenir.

- `has` değerleri ortam ucuyla **aynı**: `link | image | file`. Yeni değer icat etme.
- `q` bugün zorunlu (min 2 → `QUERY_TOO_SHORT`). Yeni kural: **`has` doluysa `q` opsiyonel**.
  `has` yoksa bugünkü davranış **birebir korunur** (mevcut arama ekranı bozulmayacak).
- 🔴 **Süzgeç mantığı kopyalanmaz.** `searchGuildMessages` içindeki `contentWhere` (q + has=link
  AND'lemesi) ve `mediaAttachmentCond` (image/file ayrımı) blokları **ortak bir private helper'a
  çıkarılır**, iki uç da onu çağırır. Gerekçe M3 dersi: `resolveMentionPreview` kopyalansaydı aynı
  mesaj için iki farklı metin çıkacaktı; burada da kopya, aynı ekin DM'de "dosya" ortamda "medya"
  sayılmasına yol açar.
- `searchMessages`'daki **G4 `clearedAt` filtresi korunur** (ortam ucunda yok, DM'de şart:
  temizlenmiş sohbetin medyası geri gelmemeli). Cursor `lt` + clearedAt `gt` **tek `createdAt`
  objesinde** birleşik kalır (B1/D5 dersi).
- Erişim kapısı **değişmez**: `requireChannelAccess` zaten yaş kapısı + DM `ChannelMember`
  kontrolünü yapıyor. Yeni kapı yazılmaz.

**İstemci sadeleşmesi:** `useChannelSearchTab` artık **her zaman kanal kapsamlı uca** gitsin;
`guildId` prop'u üç sekme bileşeninden düşer. Böylece ortam kanalı ve DM tek yoldan akar, dallanma
kalmaz.
🔴 **Regresyon kilidi:** ortam kanal detayındaki üç sekme bu değişiklikten sonra **aynı sonucu
vermeli**. Dev bunu doğrulamadan kapatmaz (özel kanal dahil).

**İki uç arasındaki üç fark — PM revizyonu 2026-08-04, backend dev'in bulgusu.** Sözleşmenin ilk
hâli "aynı sonuç" derken bunları hesaba katmamıştı:

1. **Sayfa boyutu:** kanal ucu `take: 30`, ortam ucu `50` idi → sekmeler kanal ucuna geçince ortam
   kanalında gösterilen medya sayısı düşecekti. **Karar: kanal ucu 50'ye çıkarılır** (koşullu take
   yok). Güvenlik doğrulaması PM'de yapıldı: mobil `MessageSearchModal` ve web `SearchPopover`
   sayfalama yapmıyor ve `length === 30` gibi bir "daha var mı" sezgiseli kullanmıyor → D5 sınıfı
   sessiz kırılma riski yok.
2. **Dönüş şekli:** ortam ucu kanal-gruplu (`{channelId, channelName, messages}[]`), kanal ucu düz
   `MessageDto[]`. `useChannelSearchTab`'deki `flatMap` katmanı kalkar.
3. 🔴 **Erişilemeyen kanalda hata davranışı:** ortam ucu sessizce `[]` dönüyordu, kanal ucu
   `403 NOT_CHANNEL_MEMBER` **fırlatıyor**. "Görünür ama kilitli" özel kanalın detayını açan üye
   olmayan kullanıcıda sekmeler hata durumuna düşer. **Karar: backend'e dokunulmaz**
   (`requireChannelAccess` ortak T&S choke-point'i, arama için özelleştirilmez); istemci **403'ü
   boş/kilitli durum olarak** karşılar, kırmızı hata basmaz. Çözüm `useChannelSearchTab` içinde tek
   yerde, üç sekmeye kopyalanmaz.

### 5.2 `getUserCard` erişimine DM üyeliği eklenir (R7)

**Sorun:** bugünkü kural "aynı ortamda **VEYA** arkadaşlık/blok ilişkisi var". C9 mesaj isteğini
kabul etmiş, arkadaş olmayan, ortak ortamı da olmayan iki yetişkinde profil **404** döner. Profile
ulaşmanın tek yolu mesaj yazarı olunca bu delik her DM'de görünür hale gelir, ve o kişiyi
**engelleyemezsin**.

**Çözüm:** aralarında **açık bir DM kanalı** varsa (iki taraf da `ChannelMember`) kart açılır.

- Rastgele ID ile profil tarama yüzeyi **kapalı kalır**: DM kanalı kurmak zaten `canDm` kapısından
  geçiyor, yeni bir keşif yolu açılmıyor.
- 🔴 **PM kısıtı (fail-closed):** erişim **yalnız DM üyeliğinden** geliyorsa (arkadaşlık yok,
  ortak ortam yok) → `mutualFriends` ve `mutualGuilds` **boş dizi** döner. Gerekçe: engelleyebilmek
  için kimliği görmek yeterli, yabancıya sosyal graf açmak yeni bir ifşa olur. Arkadaşlık veya ortak
  ortam varsa bugünkü davranış aynen sürer.
- `selfBlocked` semantiği **değişmez** ("o beni engelledi" asla dönmez).
- Birim testi: (a) yalnız-DM erişimi kart döner, (b) o kartta iki mutual listesi de boş,
  (c) ilişkisiz üçüncü kişi hâlâ 404, (d) mevcut ortak-ortam/arkadaş yolları bozulmadı.

🔴 **PM revizyonu 2026-08-04 — kabul edilmemiş istek erişim SAYILMAZ (backend dev'in bulgusu).**
Sözleşmenin ilk hâli gerekçeyi "C9 mesaj isteğini **kabul etmiş**" üzerinden kuruyordu ama kuralı
"açık DM kanalı var" diye yazmıştı. İkisi aynı şey değil: `dm.service` kanalı ve iki `ChannelMember`
kaydını **istek gönderildiği anda** yaratıyor. Literal kural, yabancının tek taraflı istek atarak
karşı tarafın kartını açmasına izin verirdi → **istek atmak bir profil keşif yolu** olurdu.

Düzeltilmiş kural: **isteği başlatan taraf, istek kabul edilene kadar o kanaldan erişim kazanmaz.**
Alıcı taraf kazanır (§5.2'nin varlık sebebi zaten alıcının engelleyebilmesi). Başlatan için davranış
**bugünküyle aynı** kalır (404) → regresyon değil, açılmayacak kapının açılmaması.

Ek test: (e) alıcı PENDING istekte kartı açar, (f) başlatan açamaz (404), (g) istek kabul edilince
başlatan da açar.

**Ek düzeltme (PM yetkilendirmesi, aynı fonksiyon):** GROUP_DM erişim kapısında `deletedAt` kontrolü
yok → **silinmiş** bir grubun üyeleri süresiz birbirinin kartını açabiliyor (`ChannelMember` satırları
soft-delete'te kalıyor). Yeni DM kapısı `deletedAt: null` içerdiği için tutarsızlık görünür hâle
geldi. Tek satır, düzeltilir, testi eklenir.

**R7:** bu değişiklik erişim kapısı genişletmesidir → satır satır insan incelemesi. Sahip onayı
alınmadan merge edilmez.

### 5.3 Yapılmayacaklar

- Yeni endpoint **yok** (profil verisi mevcut `users/:id/card`, sabitlemeler mevcut `channels/:id/pins`).
- Şema değişikliği **yok** → migration yok.
- Yeni bağımlılık **yok** (ne `api/` ne `mobile/`).
- `web/` diffi yok. Metin gerekirse yalnız `tr.json`.

---

## §6 DoD

**Kod:**
- [ ] `mobile`: `typecheck` + `lint` temiz
- [ ] `api`: `nest build` temiz · tüm suite yeşil · `migrate status` temiz (şema değişmedi)
- [ ] `web/` diffi yok (yalnız `tr.json` metin eklemesi kabul)
- [ ] Yeni bağımlılık yok · yeni endpoint yok · migration yok
- [ ] Sekme içi mantık kopyalanmadı (§2.1) · `has` süzgeci ortak helper'a çıkarıldı (§5.1)
- [ ] Ortam kanal detayının üç sekmesi §5.1 değişikliğinden sonra aynı sonucu veriyor (özel kanal dahil)
- [ ] `ChannelMembersTab` grup DM için genelleştirilmedi, ortam tarafı dokunulmadı (§2.1)
- [ ] `group/[id].tsx` rotası kaldırıldı **ve** ona giden hiçbir yönlendirme kalmadı
      (uzun-basma paneli · DM başlığı · grup oluşturma sonrası · `pushNavigation.ts` · bildirimler)

**Cihazda (sahip):**
- [ ] Kankalar listesinde aksiyonlar ikon-only, dokunma hedefi rahat
- [ ] DM başlığına dokununca **DM detay ekranı** açılıyor (profil kartı değil)
- [ ] DM detayında Medya / Sabitlemeler / Bağlantılar / Dosyalar **gerçekten doluyor**
- [ ] **Grup DM başlığına dokununca üye listesine ATMIYOR**, sekmeli detay ekranı açılıyor
- [ ] 🔴 **Hiç yazmamış / sohbeti temizlediğin bir 1-1 DM'de karşı tarafı ENGELLEYEBİLİYORSUN**
      (detay başlığındaki avatara dokun → profil paneli → Engelle). T&S kilidi, atlanmaz
- [ ] 1-1 DM detayında **Ara düğmesi YOK**, grup DM detayında var (sahip kararı 2026-08-01)
- [ ] 1-1 DM'de Üyeler sekmesi yok, grup DM'de var
- [ ] Grup DM Üyeler sekmesinde 👑 rozeti duruyor · **grup sahibi üye çıkarabiliyor (✕ + onay)** ·
      kendi satırın dokunulmuyor · üyeye dokununca profil alt-paneli açılıyor
- [ ] Grup DM ⋯ menüsünde Üye Ekle · Yeniden Adlandır · Gruptan Ayrıl · Grubu Sil; onaylar duruyor
- [ ] 1-1 DM ⋯ menüsünde Sohbeti Temizle çalışıyor
- [ ] Mesaj yazarına dokununca **profil alt-paneli** açılıyor (kanal ve DM)
- [ ] Panelde afiş, Hakkımda, üyelik tarihi, ortak ortamlar/kankalar geliyor; boş olanlar çizilmiyor
- [ ] Profil panelinden **engelleme** hâlâ yapılabiliyor
- [ ] Zaten kanka olduğun kişinin DM panelinde "Kanka Ekle" **yok**
- [ ] Ortam üye listesi hâlâ yönetim ekranına gidiyor (değişmedi)
- [ ] Sesli/Görüntülü Arama düğmesi hiçbir yerde yok (M4)

**R7 (sahip onayı):**
- [ ] §5.2 `getUserCard` erişim genişletmesi satır satır incelendi
