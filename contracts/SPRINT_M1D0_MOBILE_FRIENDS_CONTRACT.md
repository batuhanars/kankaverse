# Sprint M1d-0 — Mobil Hesap Merkezi ("Sen" sekmesi) + Engellenenler

> **Tek doğruluk kaynağı.** Endpoint yolu, DTO alan adı, ekran yapısı bu dosyadan **sapamaz**.
> Sapma ihtiyacı → dev **DURUR**, bildirir, PM revize eder. `TASK.md`'ye item eklenmez.
>
> PM compose: 2026-07-30. Adı "M1d-0": **M1c ile M1d arasına giren küçük bir sprint**, hiçbir numarayı
> yeniden dizmez. **R7-nötr olmalı** — `api/`'ye dokunma ihtiyacı → **DUR**.

---

## 0. Neden bu sprint — ve neden ilk taslak REDDEDİLDİ

**İlk PM taslağı:** web'in kanka panelinin mobil karşılığı — sekmeli (Tümü/Bekleyen/Engellenmiş/Ekle)
üst seviye bir "Kankalar" ekranı.

**Sahip itirazı (2026-07-30, haklı):** Discord mobilde böyle bir ekran yok; mobil bilinçli olarak sade
tutulmuş, rail + sidebar + mesaj odaklı. Bazı web/masaüstü yüzeyleri mobile hiç taşınmamış (ör. ortam
ayarlarında afiş düzenleme mobilde yok, yalnız simge var). **Mobili web'in birebir kopyası yapmak yanlış.**

**PM'in hatası, kayda geçer:** PM ilk cevabında sahibin ekran görüntüsündeki Ayarlar > "Arkadaşlık
İstekleri" satırını *istek listesi* sanıp "Discord da bunları ayarlara koymuş" dedi. **Yanlış** — o satır
kimin istek gönderebileceğini belirleyen bir **ayardır**. Sahip düzeltti. Sahip ayrıca ayarlarda
(Gizlilik ve Güvenlik dahil) **engellenenler listesi bulamadı.**

**Düzeltmenin sonucu:** Discord mobilde engellenenler listesi **yok** → bu konuda kopyalanacak bir emsal
de yok. Karar Discord'a değil **kendi kuralımıza** dayandırılır (aşağı).

### Değişmeyen çekirdek — bu bir özellik değil, geri alınamaz bir işlem
Mobilde birini engellersen ve o kişiyle **hiç DM'leşmediysen**, engelleme arkadaşlığı da sildiği için
(`blocks.service.ts` `friendship.deleteMany`) o kişi mobilde **hiçbir yüzeyde görünmez** → engeli
kaldırmanın yolu yoktur. `DELETE /blocks/:userId` ucu ve mobil `blocksApi.unblock` **zaten mevcut**;
eksik olan tek şey o kişiye ulaşacak bir satır.

**Neden Discord'un atlaması bizim için gerekçe değil:** Discord'un mobil kullanıcısı için web her zaman
bir tık ötede ve davranış yıllardır yerleşik. Biz mobili **Android-first** çıkarıyoruz ve **bazı
kullanıcılarımız yalnızca mobil olacak** — mobili yayınlama gerekçemiz bu. Onlar için engelleme geri
alınamaz hâle gelir. Üstelik kendi kuralımız açık: **kullanıcıyı dilsiz bırakma.**

---

## 1. Karar — üst seviye ekran YOK, "Sen" sekmesi hesap merkezi olur

- **Alt tab çubuğu 3 eleman KALIR** (Ana Sayfa · Bildirimler · Sen). **Dördüncü sekme eklenmez** —
  M1a §2 sahip kararı korunur.
- **Üst seviye "Kankalar" varış noktası açılmaz.**
- **"Sen" sekmesi** bugün neredeyse boş (avatar + çıkış yap + M1c doğrulama bandı). Hesap merkezine
  dönüşür ve bu iki satırı taşır:
  - **Kankalar** → kanka listesi
  - **Engellenenler** → engel kaldırma *(tek yönlü kapıyı kapatan yer)*
- **Sidebar'daki geniş "Kanka Ekle" butonu KALIR** (M1b §13/2 sahip kararı): kanka eklemek yeni
  kullanıcının en kritik ilk adımı, ayarların/hesap merkezinin içine gömülmez. **Hızlı yol sidebar'da,
  yönetim "Sen"de.**

### 🔴 EKLENMEYECEK: "kankalık istekleri" satırı
İstekler bugün **iki yoldan** yönetiliyor: sidebar'daki rozetli satır (M1b §10) ve tıklanabilir
`FRIEND_REQUEST` bildirimi. Üçüncü bir kapı **gürültüdür** — kendi kuralımız: kanıt olmadan ikinci
(burada üçüncü) kapı açılmaz. Sahip de istekleri bildirimlerden yönettiğimizi teyit etti.

---

## 2. Endpoint tablosu (kaynaktan doğrulandı 2026-07-30)

| yol | dönüş / gövde | mobil durumu |
|---|---|---|
| `GET /friends` | `FriendDto[]` | ✅ `friendsApi.list` var |
| `DELETE /friends/:userId` | — (kankalıktan çıkar) | ✅ `friendsApi.remove` var |
| `GET /blocks` | `[{ user: { id, username, avatarUrl }, since }]` | 🔴 **YOK → `blocksApi.list` eklenecek** |
| `DELETE /blocks/:userId` | — (engeli kaldır) | ✅ `blocksApi.unblock` var |
| `POST /dm/channels` | `{ userId }` → kanal (varsa mevcut olanı döner) | ✅ `dm` store `createChannel` var |

**Tek yeni uç bağlaması `GET /blocks`.** Gerisi mevcut çağrıların yeni bir yerde toplanması.

---

## 3. Ekranlar

### 3.1 "Sen" sekmesi → hesap merkezi
Mevcut içerik **korunur** (profil bilgisi, M1c doğrulama bandı, çıkış yap). Altına iki satır eklenir
(ikon + etiket + chevron), her biri kendi tam ekranını açar. Satırlar **her zaman görünür** — sayı sıfır
olsa bile, çünkü bunlar gezinme (boş yüzey değil; boşluk hedef ekranın boş durumunda gösterilir).

### 3.2 Kankalar (YENİ tam ekran)
- `GET /friends` listesi; boş durum `friends.noFriends`.
- Satır aksiyonları: **Mesaj Gönder** (`friends.dm` → `POST /dm/channels` → dönen kanala git) ·
  **Kankalıktan Çıkar** (`friends.remove`, **onaylı** — mevcut `ConfirmDialog`).
- `FRIEND_ACCEPT` bildirimi **artık tıklanabilir olur** → bu ekrana gider (M1b §10'da hedefi olmadığı
  için bilinçle bırakılmıştı; hedef artık var).

### 3.3 Engellenenler (YENİ tam ekran)
- `GET /blocks` listesi; boş durum `friends.noBlocked`.
- Satır aksiyonu: **Engeli Kaldır** (`friends.unblock`, **onaylı**).
- 🔴 **Yalnız BENİM engellediklerim listelenir.** `GET /blocks` zaten `where: { blockerId: userId }` —
  "beni kim engelledi" bilgisi sunucudan hiç dönmez, istemci de **tahmin etmeye çalışmaz** (G3 blok
  belirsizliği, Sprint 4A'dan beri süren kural).

---

## 4. Kapsam DIŞI — bilinçli sadelik (sahip gözlemleri dahil)

- **Profil zenginleştirme:** biyografi, profil afişi, hareketli (GIF) afiş, "üye olma tarihi", durum
  metni. Sahip gözlemi: **Discord mobil hareketli afişi göstermiyor**, mobil profili sade tutuyor.
  Bizde web'de profil afişi var (C8), mobilde hiç yok → bu bir **eksik değil, bilinçli sadelik**.
  Mobilde afiş göstermek ekranın yarısını dekorasyona vermektir. İstenirse ayrı sprint.
- **Ayarlar ekranı:** hâlâ yok ve bu sprintte de gelmiyor. Sahip kuralı: **"Ayarlar sekmesi sadece
  ayarlara özel olur, hesap merkezinden erişiriz."** Yani ileride ayarlar gelirse hesap merkezinden
  açılan ayrı bir yüzey olur; hesap merkezinin kendisi ayar ekranı DEĞİLDİR.
- **Presence** (çevrimiçi noktası): mobilde altyapı hiç yok (`presence:*` dinlenmiyor). **Sahte/statik
  "çevrimdışı" gösterilmez** — yanlış bilgi verir.
- **Kanka arama / karşılıklı kankalar / profil kartı zenginleştirme:** yeni uç veya büyük yüzey ister.
- **`GUILD_INVITE` bildirimi** hedefsiz kalmaya devam eder → hedefi M1d'de gelir.

---

## 5. i18n + tema

**Yeni anahtar beklenmiyor** — `friends.*` altındaki mevcut küme (`title/noFriends/noBlocked/dm/remove/
unblock/confirmRemove`) bu ekranları karşılıyor (web paneli aynı metinleri kullanıyor). Gerçekten
mobil-özel bir şey gerekirse `mobile.*`. Renk/ölçü `src/theme`; **gölge yok**.

---

## 6. Uyulacak yerleşik desenler

- **Oturum kapsamlı state:** engellenenler listesi mevcut `stores/friends.ts`'e girer ve
  `(app)/_layout.tsx`'teki `reset()`'e tabi olur — çıkışta sıradaki kullanıcı öncekinin engellediklerini
  görmesin (M1b §8.3'te bir kez yaşanan sızıntı sınıfı).
- **Yıkıcı/T&S sonuçlu işlem onay ister:** engel kaldırma ve kankalıktan çıkarma `ConfirmDialog` ile.
- **Hatalar** `extractErrorMessage` ile sunucunun Türkçe `message`'ından; hata koduna göre dallanma yok.
- **Boş yüzey açma:** liste boşsa boş durum metni; sahte satır konmaz.
- **Dosya boyu:** "Sen" sekmesi + iki liste ekranı ayrı dosyalar; hiçbiri 300 satırı geçmemeli
  (D29 sınıfı yeni borç üretilmesin).

---

## 7. DoD — fiziksel cihazda görülerek kapanır

1. "Sen" sekmesinde **Kankalar** ve **Engellenenler** satırları görünüyor.
2. **Hiç DM'leşmediğim birini engelleyip, Engellenenler'den engeli kaldırabiliyorum** *(bu sprintin
   varlık sebebi — tek yönlü kapı kapandı)*.
3. Kankalar listesinden DM başlatabiliyorum ve kankalıktan çıkarabiliyorum (çıkarma onay soruyor).
4. `FRIEND_ACCEPT` bildirimine dokununca Kankalar ekranına geliyorum.
5. Boş durumlar doğru (kankası/engellediği olmayan kullanıcıda).
6. Metin `tr.json`'dan, renk/ölçü token'dan, gömülü string yok.
7. `typecheck` + `lint` temiz; **`api/`'ye dokunulmadı**.

---

## 8. Sapma kuralı

Yerleşim kararı (üst seviye ekran yok, hesap merkezi), kapsam-dışı listesi ve "istekler satırı
eklenmez" kuralı bu dosyadan **sapamaz**. Yeni bağımlılık = **PM onayı**. `api/`'ye dokunma → **DUR**.
