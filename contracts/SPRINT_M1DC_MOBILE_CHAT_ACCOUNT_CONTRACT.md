# Sprint M1d-C — Mobil Sohbet Aksiyonları + Hesap Merkezi (Track F2, PM compose 2026-08-01)

> **Tek doğruluk kaynağı.** Uç imzası, DTO şekli, hata kodu ve ekran sayısı bu dosyadan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin. `TASK.md`'ye item ekleme, yalnız kutu işaretle.
>
> **Varlık sebebi:** M1d ortam sistemini kurdu ama mobilde sohbetin kendisi hâlâ yalın: mesaja tepki
> verilemiyor, yanıtlanamıyor, düzenlenemiyor, silinemiyor. Web'de bunların hepsi var (hover şeridi).
> Hesap merkezi de bir liste ekranı olarak duruyor; profilin kendisi (afiş, biyografi, üyelik tarihi)
> mobilde hiç görünmüyor. **Sahip kararı: ortam sistemine devam etmeden önce burası sağlam otursun.**
>
> **Bu sprint R7-NÖTR olmalı.** Tepki/düzenle/sil/sabitle yetkileri ve `canDm` kapıları sunucuda
> yazılı ve R7'den geçti; mobil yalnız sonucu gösterir. `api/`'ye dokunma ihtiyacı → **DUR**.

---

## 0. Kaynaktan doğrulanmış gerçekler (2026-08-01, koddan okundu)

> **M1b dersi tekrar:** DTO alan adları **dosyadan okunur**, hatırdan yazılmaz. Aşağısı bugün
> doğrulandı; yine de dev kendi dokunduğu DTO'yu açıp bakar.

**Sunucuda VAR (dokunulmayacak):**

| Uç | Not |
|---|---|
| `PATCH /channels/:channelId/messages/:messageId` | mesaj düzenle |
| `DELETE /channels/:channelId/messages/:messageId` | mesaj sil |
| `POST /channels/:channelId/messages/:messageId/reactions` | tepki ekle (`AddReactionDto`) |
| `DELETE /channels/:channelId/messages/:messageId/reactions/:emoji` | tepki kaldır |
| `POST /…/:messageId/pin` · `DELETE /…/:messageId/pin` | sabitle / kaldır |
| `POST /channels/:id/messages` `{ content, replyToId? }` | **yanıt zaten destekleniyor** |
| `PATCH /users/me` | `bio`, `dmPolicy` |
| `POST /users/me/avatar/presign` → `PATCH /users/me/avatar` | **e-posta doğrulanmış şart** |
| `POST /users/me/banner/presign` → `PATCH /users/me/banner` | aynı akış |
| `GET /users/:id/card` | **kendi id'siyle çağrılırsa** `friendStatus: 'self'` + `bio` + `bannerUrl` + `bannerColor` + `memberSince` |

**Mobilde bugün ne var:**
- `messagesApi` yalnız `list` · `send` · `search`. Düzenle/sil/tepki/sabitle **yok**.
- Mobil `MessageDto` `replyToId` · `replyTo` · `editedAt` · `pinnedAt` **taşıyor**; `reactions` **taşımıyor** → eklenecek.
- `usersApi` yalnız `getCard`. Profil güncelleme/yükleme **yok**.
- `MessageScreen.tsx` **561 satır** (300 eşiği aşıldı) → bu sprintte yeni kod eklenmeden **önce** bölünür (§6).

---

## 1. DoD — **fiziksel cihazda** kapanır, hem jest hem ÜÇ TUŞLU gezinmeli cihazda

> Sprint iki yarıya bölünmüştür; **A kapanmadan B'ye geçilmez.**

### DoD-A — sohbet aksiyonları
1. DM başlığının sağ üstü **tamamen boş** (sahip kararı: orası sesli/görüntülü aramaya ayrıldı).
2. DM satırına **uzun basınca alt panel** açılıyor; içindeki aksiyonlar çalışıyor.
3. 1-1 DM'de **başlıktaki ada/avatara dokununca karşı tarafın profil ekranı** açılıyor; mesaj arama
   oradan erişilebiliyor (sahip kararı 2026-08-01 — panel değil profil).
4. **Mesaja uzun basınca alt panel** açılıyor: hızlı emoji şeridi + aksiyonlar.
5. Mesaja **tepki verebiliyorum**, tepkiler baloncukta görünüyor, tekrar dokununca kalkıyor.
6. **Yanıtlayabiliyorum**; yanıt alıntısı hem yazarken hem gönderilen mesajda görünüyor.
7. **Kendi mesajımı düzenleyebiliyor / silebiliyorum**; başkasınınkinde bu satırlar **render edilmiyor**.
8. **Okunmuş işaretle**: okunmamış yoksa satır **soluk ve pasif** (yetki değil DURUM kuralı, M1d-B'de kayda geçti).

### DoD-B — hesap merkezi + profil
9. "Sen" sekmesi profil görünümü: **afiş · avatar · ad · biyografi · üyelik tarihi**.
10. **Kankalar satırı**: avatar dizisi + sağ ok → Kankalar ekranına gider.
11. Sağ üstte **dişli** → Ayarlar ekranı (gruplu liste).
12. **Profili Düzenle** → biyografi + **avatar ve afiş yükleme** (sahip istisnası, §4.2).
13. Yükleme e-postası doğrulanmamış hesapta sunucunun sebebini gösteriyor.

### Her iki yarı için
14. Metin `tr.json`'dan, renk/ölçü `src/theme`'den; **gömülü string yok**.
15. `typecheck` + `lint` temiz; **`api/`'ye dokunulmadı**; hiçbir dosya 300 satırı aşmıyor.

---

## 2. A yarısı — kilitli sıra

### 2.1 `MessageScreen` bölünmesi (ÖNCE bu)
561 satır. Yeni panel + tepki + yanıt kodu buraya eklenirse 700'ü aşar. Önce ayrıştır (öneri:
mesaj listesi · giriş kutusu · başlık aksiyonları). **Davranış değişmez**, saf taşıma; sonra özellik.

### 2.2 DM başlığı boşaltma + başlığa dokunuş (sahip kararı 2026-08-01)
Sağ üstteki **çöp kutusu + arama** kalkar; köşe **tamamen boş** kalır.
🔴 Sesli/görüntülü için **yer tutucu ikon KONMAZ** (boş yüzey açma).

**Ada/avatara dokunuş → alt panel DEĞİL, profil:**
- **1-1 DM** → karşı tarafın profil ekranı (`GET /users/:id/card`; mevcut `ProfileCardModal`
  yetmiyorsa tam ekran profil). Sahip referansı: Discord DM başlığı → kullanıcı profili.
- **Grup DM** → mevcut grup ekranı (`group/[id]`, üyeler + yeniden adlandırma) korunur.
- **Mesaj arama** bu profil/grup ekranından açılır (referanstaki "Ara" dairesi). Böylece başlık
  boşalırken arama sohbetin içinden erişilebilir kalır — DM paneli **yalnız listeden** açılır.
- 🔴 Referanstaki **Sustur** dairesi KONMAZ (bildirim tercihleri kendi sözleşmesinde, §7).

### 2.3 DM alt paneli (**yalnız listede uzun basış**)
Referans düzen sahip ekran görüntüsü (Discord DM paneli): grup grup bloklar, iri satırlar, ikon + metin.
**Düzen alınır, içerik alınmaz.** Panelde **yalnız sahip olduğumuz** aksiyonlar:

| Satır | Koşul | Bağlanan |
|---|---|---|
| Profil | her zaman | §2.2'deki profil yolu (aynı hedef, iki giriş) |
| Kanka Ekle | arkadaş değilse **ve** `canMessage`/kart izin veriyorsa | mevcut tıkla-ekle akışı |
| Mesajlarda Ara | her zaman | mevcut `MessageSearchModal` |
| Okunmuş Olarak İşaretle | **okunmamış yoksa soluk + pasif** | mevcut `markRead` |
| Sohbeti Temizle | her zaman | mevcut `DELETE /dm/channels/:id` + `ConfirmDialog` |

🔴 **KONMAZ:** Favori (yok) · Konuşmayı Sustur + Bildirim Ayarları (**kendi sözleşmesi var**, bkz. §7) ·
Kanal ID'sini Kopyala (geliştirici modu yok) · DM'yi Kapat (bizde karşılığı "Sohbeti Temizle", iki ad konmaz).

### 2.4 Mesaj alt paneli (mesaja uzun basış)
Üstte **hızlı emoji şeridi** (web'in hızlı tepki kümesiyle **aynı emojiler** — web'den oku, uydurma),
altında gruplu satırlar:

| Satır | Koşul |
|---|---|
| Yanıtla | her zaman |
| Mesajı Düzenle | **yalnız kendi mesajım** |
| Metni Kopyala | her zaman (`expo-clipboard`, kurulu) |
| Mesajı Sabitle / Sabitlemeyi Kaldır | yalnız yetkiliyse (web `canPin` karşılığı) |
| Mesajı Sil | kendi mesajım ya da yetkiliysem · **`ConfirmDialog`** |

🔴 **KONMAZ:** Okunmadı Olarak İşaretle (mesaj-başına okunmamış yok) · Uygulamalar · Mesaj Bağlantısını
Kopyala (mobilde derin bağlantı yok) · Mesaj ID (geliştirici modu yok).

### 2.5 Tepki gösterimi + yanıt kutusu
- `MessageDto.reactions` tiplenir; baloncuğun altında tepki pill'leri (kendi tepkim vurgulu, dokun → kaldır).
- Yanıt yazarken giriş kutusunun üstünde **alıntı şeridi** + iptal (×). Gönderimde `replyToId` gider.
- Gelen mesajda alıntı gösterimi **zaten tiplenmiş** `replyTo` alanından.

---

## 3. B yarısı — hesap merkezi

### 3.1 "Sen" sekmesi → profil görünümü
Referans sahip ekran görüntüsü. **Bizde karşılığı olan** öğeler: afiş (`bannerUrl`, yoksa `bannerColor`) ·
avatar · kullanıcı adı · biyografi · üyelik tarihi (`memberSince`, TR formatı "25 Ekim 2023") ·
**Kankaların** satırı (ilk N avatar + sağ ok → Kankalar) · sağ üstte dişli → Ayarlar · **Profili Düzenle**.

🔴 **KONMAZ:** Durum Ekle (sistem desteklemiyor) · Sunucu Profilleri sekmesi (yok) · rozetler/Nitro.
Veri kaynağı **`GET /users/:id/card` kendi id'mle** — yeni uç yazılmaz.

### 3.2 Ayarlar ekranı
Mevcut hesap ekranları (M1c/M1d-0) **gruplu listeye** toplanır; yeni ekran yazılmaz, var olanlara giriş verilir.
Gruplama referansı sahip ekran görüntüsü; **satırlar bizim sahip olduklarımız.**

### 3.3 Profili Düzenle
- **Biyografi** → `PATCH /users/me { bio }`.
- 🔴 **Avatar + afiş yükleme — SAHİP İSTİSNASI (2026-08-01).** M1d §10.3'te "görsel yükleme yüzeyleri
  web/masaüstüne mahsus, mobil yalnız gösterir" kuralı konmuştu. Sahip **profil için istisna** kararı
  verdi. **Kural daraltıldı, silinmedi:** ortam görselleri (ikon/afiş) mobilde hâlâ **yalnız gösterilir**;
  istisna **yalnız kullanıcının kendi profili** içindir.
- Akış sunucununkinin aynısı: `presign` → dosyayı **PUT** ile yükle → `PATCH` `storageKey`.
  `403 EMAIL_NOT_VERIFIED` → M1c'nin doğrulama bandına yönlendir (yeni akış yazma).
- **Yeni bağımlılık (PM onaylı, sahip bilgilendirildi):** `expo-image-picker` (görsel seçici) +
  yükleme için `expo-file-system`. İkisi de Expo SDK 54 içinde, **Expo Go'da çalışır, dev build gerekmez**.
  Kurulum `npx expo install` ile (sürümü SDK belirler).

---

## 4. 🔴 T&S — istemcinin sınırı

- Düzenle/sil/sabitle **yetkisi sunucudadır**; istemci yalnız satırı render edip etmemeye karar verir.
  Yetkisiz kullanıcıya **disabled gösterilmez, hiç render edilmez**.
- **Durum ≠ yetki:** "Okunmuş işaretle" okunmamış yokken **soluk ve pasif** gösterilir (gizlenmez) —
  bu bilgi kullanıcıya lazım. Kural ayrımı M1d-B'de kayda geçti.
- Görsel yükleme **e-posta doğrulanmış** hesap ister (sunucu kapısı). İstemci kapıyı taklit etmez,
  sunucunun mesajını gösterir.
- Yüklenen görsel **public URL** üretir (C8'den beri böyle) — bu sprint yeni ifşa yüzeyi açmıyor,
  web'de zaten var olan yüzeyi mobile taşıyor.
- Tepki emojileri **sunucunun kabul ettiği kümeden**; mobil kendi listesini uydurmaz.

---

## 5. i18n + tema
Metinlerin çoğu web'de **zaten var** (`message.*`, `reaction.*`, `profile.*`). **Önce ara, bulamazsan ekle.**
Kaynak `web/src/i18n/tr.json` (mobil import eder, kopyalamaz). Mobil-özel metin `mobile.*` altına.
Renk/ölçü `src/theme`. **Gölge yok.**

## 6. Uyulacak yerleşik desenler
- **Alt paneller `sheetInsets` kullanır** (2026-08-01 gezinme çubuğu dersi) — sabit dolgu yazma.
- **Cihaz farkı:** ölçüyü cihazdan bağımsız kur; klavye/inset hesabında varsayım yerine ölçen yöntem.
- **Dosya boyu 300 satır.** `MessageScreen` bölünmeden yeni özellik eklenmez (§2.1).
- **Yıkıcı işlem `ConfirmDialog`** ister (mesaj sil, sohbeti temizle).
- **Hatalar** `extractErrorMessage` ile sunucunun Türkçe mesajından.

## 7. Kapsam DIŞI — bilinçli
- **Bildirim/susturma satırları** (kanal · kategori · DM) → **kendi sözleşmesi**, M1d-B'de karar verildi.
- **Emoji picker (tam liste)** — hızlı şerit yeter; tam picker ayrı iş.
- **Mesaj bağlantısı / ID kopyalama, Uygulamalar, Favori** — karşılığı yok.
- **Sunucu profilleri, durum (status), rozetler** — sistem desteklemiyor.
- **Ortam ikonu/afişi yükleme** — istisna yalnız kullanıcı profili (§3.3).
- **Sesli/görüntülü arama** — M4 ses fazı; sağ üst köşe o güne kadar boş durur.

## 8. Sapma kuralı
Uç imzaları, kilitli sıra (MessageScreen böl → DM paneli → mesaj paneli → tepki/yanıt → hesap merkezi),
"yetkisiz aksiyon render edilmez", §7 kapsam-dışı listesi ve §3.3'teki **daraltılmış** görsel-yükleme
kuralı bu dosyadan **sapamaz**. Yeni bağımlılık = PM onayı. `api/`'ye dokunma ihtiyacı → **DUR**.
