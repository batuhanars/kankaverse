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
`ChannelDetailsTabBar` · `ChannelMembersTab` · `ChannelMediaTab` · `ChannelLinksTab` ·
`ChannelFilesTab` · sabitlemeler sekmesinin mevcut içeriği. Sekme içi mantık ikinci kez yazılmaz.
Bir bileşen DM'de farklı davranmak zorundaysa **prop'u genişlet**, fork etme.

`channel-details.tsx` **ayrı kalır** (başlığı, `canManage` kararı, Ayarlar/Davet Et düğmeleri
tamamen farklı). Ortak olan sekme gövdesi, ortak olmayan kabuk.

### 2.2 Başlık bölgesi

- Büyük daire avatar (grup DM'de grup avatarı/baş harf), altında ad.
- Discord'da adın altında ikinci satırda kullanıcı adı var; bizde `username` tek kimlik →
  **ikinci satır yok**, tekrar etme.
- Aksiyon düğmeleri: **Ara** (mevcut `MessageSearchModal`) · **Sustur** (mevcut bildirim tercihi akışı).
  🔴 **Sesli/Görüntülü Arama düğmesi YOK** → M4. Yer tutucu da koyma.
- Sağ üstte **⋯** → alt-panel (§2.4).

### 2.3 Sekmeler

| Sekme | 1-1 DM | Grup DM | Kaynak |
|---|---|---|---|
| Üyeler | **gösterme** (iki kişi, bilgi değeri yok) | ✅ mevcut grup üye listesi | `ChannelMembersTab` |
| Medya | ✅ | ✅ | `ChannelMediaTab` (§5.1 sonrası) |
| Sabitlemeler | ✅ | ✅ | `GET /channels/:id/pins` (zaten kanal kapsamlı) |
| Bağlantılar | ✅ | ✅ | `ChannelLinksTab` (§5.1 sonrası) |
| Dosyalar | ✅ | ✅ | `ChannelFilesTab` (§5.1 sonrası) |

- 1-1 DM'de Üyeler sekmesi **çizilmez** (Discord çiziyor, biz çizmiyoruz: iki kişilik listede
  gösterecek bir şey yok, boş yüzey açma kuralı). Sekme çubuğu 4 sekmeyle başlar.
- Grup DM Üyeler sekmesinde Discord'un "Yeni Grup" satırı **yok** → bizde karşılığı olan akış
  "Üye Ekle" ve o ⋯ menüsünde (§2.4).
- Üye satırına dokunma → **profil alt-paneli** (§3).

### 2.4 ⋯ alt-paneli

Mevcut `*Sheet.tsx` desenini kullan (`Modal transparent animationType="slide"`), yeni bağımlılık yok.

**1-1 DM:**
- **Sohbeti Temizle** → mevcut G4 akışı (`DELETE /dm/channels/:id`), `ConfirmDialog` korunur.
  Discord'daki "DM'yi Kapat" bu. **"Sil" dili kullanma**, mesaj DB'de duruyor.

**Grup DM** (dünkü §2'nin taşındığı yer):
- **Üye Ekle · Yeniden Adlandır · Gruptan Ayrıl · Grubu Sil** → `group/[id].tsx` ekranının
  **dibindeki aksiyonlar buraya taşınır**, oradan kalkar.
- Yetki: bugünkü kural **aynen** korunur (silme/yeniden adlandırma grup sahibinde, ayrılma herkeste).
  🔴 Yetki kararını istemcide **yeniden hesaplama**; bugün ne yapıyorsa o.
- Yıkıcı aksiyonların onayı korunur. Tek dokunuşla gruptan çıkma / grup silme **YOK**.

🔴 **"Kanal ID'sini Kopyala" YOK.** Discord'daki geliştirici özelliği, bizde karşılığı yok.

### 2.5 Kapsam dışı

`group/[id].tsx` ekranı **kalır mı kalkar mı** sorusu bu sprintte açılmaz: dip aksiyonları taşınır,
üye listesi yerinde kalır. Ekranın tamamen DM detayına katlanması ayrı bir iş, PM kararı.

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

- **Mesaj** (yeni ekleme değil: `canMessage` true ise DM'e götürür; false ise düğme çizilmez)
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

**Cihazda (sahip):**
- [ ] Kankalar listesinde aksiyonlar ikon-only, dokunma hedefi rahat
- [ ] DM başlığına dokununca **DM detay ekranı** açılıyor (profil kartı değil)
- [ ] DM detayında Medya / Sabitlemeler / Bağlantılar / Dosyalar **gerçekten doluyor**
- [ ] 1-1 DM'de Üyeler sekmesi yok, grup DM'de var
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
