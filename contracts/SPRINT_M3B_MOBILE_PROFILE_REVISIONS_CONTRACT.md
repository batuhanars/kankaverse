# SPRINT M3b — Mobil Profil Ekranı + Küçük Revizeler

> **Tek doğruluk kaynağı.** Davranış buradan **sapamaz**; sapma ihtiyacı → **DUR**, sahibe bildir.
> PM compose: 2026-08-03 gecesi (sahip turu). **Kod dev oturumlarına delege edilir.**
>
> 🔴 **§4 (profil ekranı) HENÜZ KİLİTLİ DEĞİL** — sahip Discord mobil ekran görüntülerini
> gönderecek, tasarım onun üzerinden kararlaşacak. §1-§3 kilitli, hemen başlanabilir.
>
> **Sıra:** bu sprint biter → tüm dikkat **M4 (ses)**. Sahip: "acelemiz yok, önümüzdeki günler
> sadece M4."

---

## §1 Kankalar listesi — aksiyon düğmeleri ikon-only

`mobile/src/app/(app)/friends-list.tsx` satırlarındaki aksiyon düğmeleri metin etiketiyle geliyor ve
yer kaplıyor (sahip gözlemi).

- Etiketler kalkar, **yalnız ikon** kalır. Dokunma hedefi ≥44dp korunur (`hitSlop` ile küçültme yok).
- `accessibilityLabel` **zorunlu** — etiket ekrandan kalkınca ekran okuyucu için tek kaynak o.
- İkon seçimi mevcut `Ionicons` setinden; aynı aksiyonun web'deki ikonu varsa onunla tutarlı olsun.

## §2 Grup DM uzun-basma paneli — "Profil" değil "Ayarlar"

Bugün grup DM'e uzun basınca açılan panel **1-1 DM'in aynısı**: en üstte "Profil" yazıyor. Grup DM'de
"profil" diye bir şey yok (sahip ekran görüntüsüyle bildirdi).

- İlk satır **"Ayarlar"** olur → grup ayarları ekranını açar.
- Grup üye listesi ekranının (`group/[id].tsx`) **dibindeki aksiyonlar oradan kalkar** ve bu
  ayarlar yüzeyine taşınır: **Üye Ekle · Yeniden Adlandır · Gruptan Ayrıl · Grubu Sil**.
- Yetki: bugünkü kural korunur (silme/yeniden adlandırma grup sahibinde, ayrılma herkeste).
  🔴 Yetki kararını **istemcide yeniden hesaplama**; bugün ne yapıyorsa aynısı.
- Yıkıcı aksiyonların onayı **korunur** (tek dokunuşla gruptan çıkma / grup silme YOK).
- Üye listesi ekranda **kalır** (kimin olduğunu görmek için), yalnız dip aksiyonlar taşınır.
- Web'de aynı taşıma 2026-08-03'te yapıldı (DM satırı menüsüne); mobil onun ikizi olsun,
  ama mobilde hedef **ayarlar ekranı**, web'deki gibi menü içi satır değil — sahip böyle istedi.

## §3 1-1 DM panelinde "Kanka Ekle" zaten kankada görünüyor (KUSUR)

`mobile/src/components/home/DmMenuHost.tsx`: `canAddFriend={channel?.type === 'DM'}` — yalnız
"1-1 DM mi" diye bakıyor, **arkadaş olup olmadığına bakmıyor**. Zaten kanka olan kullanıcıda da
"Kanka Ekle" çıkıyor (sahip ekran görüntüsü).

- Web'de bu kapı var: `DmConversation.showAddFriend` → `isFriendInDm` + `selfBlocked` + istek
  gönderilmiş mi. Mobil **aynı kapıyı** uygulasın (`friends` store'da veri zaten var).
- İstek gönderildikten sonra da gizlensin (web'deki `addFriendSent` deseni).
- 🔴 Engellilikte de gizlensin; T&S gereği ret **jenerik** kalır, sebep gösterilmez.

---

## §4 Profil ekranı — kart yerine sekmeli ekran (GÖRSEL BEKLİYOR)

Bugün profil bir **modal kart** (`ProfileCardModal`). Sahip bunu **ayrı, sekmeli bir ekrana**
dönüştürmek istiyor. Tasarım sahibin göndereceği Discord mobil görselleri üzerinden kararlaşacak.

### 4.1 Bugünkü giriş noktaları (PM taraması 2026-08-03)

| Yer | Bugün | Karar |
|---|---|---|
| DM başlığındaki isim | kart açılır | yeni **ekrana** yönlenir |
| Kankalar listesi satırı | kart açılır | yeni **ekrana** yönlenir |
| Grup yönetimi üye satırı | kart açılır | yeni **ekrana** yönlenir |
| **Ortam üye listesi** | `guild-member` (yönetim) ekranı | 🔒 **DEĞİŞMEZ** (sahip kararı; Discord da böyle) |
| **Mesaj yazarı (kanal/DM)** | **hiçbir şey** | 🔴 **YENİ: profile gider** |

🔴 **Son satır zorunlu, opsiyonel değil.** Üye listesi yönetimde kaldığı için, mesaj yazarına
dokunmak bir ortamda profile ulaşmanın **tek yolu** olacak. O yoksa ortamdaki bir kullanıcının
profiline bakmanın hiçbir yolu kalmaz. Web'de bu yol zaten var (`MessageItem` → `UserCardPopover`).

### 4.2 Açık soru (sahiple konuşulacak)

`guild-member` ekranı bugün zaten **ad + avatar + ortam rolü + roller** gösteriyor (yetkisiz
kullanıcıya bile). Yani profil ekranıyla içerik olarak yaklaşıyorlar. Karar gerekiyor: iki ekran
ayrı mı kalacak, yoksa profil ekranı ortam bağlamında **roller + yönetim aksiyonlarını** da taşıyıp
tek yüzey mi olacak? Görseller gelince netleşir.

### 4.3 Şimdiden bağlayıcı olanlar

- Ekran **sekmeli** olacak (sahip kararı); sekme içerikleri görsellerle belirlenecek.
- Mevcut kart aksiyonları **kaybolmayacak**: engelle / arkadaşlıktan çıkar / kanka ekle / mesaj at.
  🔴 Özellikle **engelleme** kaybolmamalı — mobilde engel kaldırmanın tek yolu bir dönem bu kart
  olduğu için M1d-0 sprinti açılmıştı, aynı hataya düşülmeyecek.
- T&S: minör statüsü hiçbir yerde sızmaz; ret mesajları jenerik kalır (Sprint 4A G2/G3 kuralları).
- 🔴 **M4 için yer bırak:** ses geldiğinde profile "şu an sesli kanalda" satırı eklenecek (web'de
  C10 ile var). Uygulaması **M4'e ait**, ama tasarım o satır sonradan eklenince bozulmasın.

---

## §5 DoD

**Kod:**
- [ ] `mobile`: `typecheck` + `lint` temiz
- [ ] `api/` diffi **yok** (profil verisi mevcut `users/:id/card` ucundan; yeni uç gerekirse DUR)
- [ ] `web/` diffi yok (metin gerekirse yalnız `tr.json`)
- [ ] Yeni bağımlılık yok

**Cihazda (sahip):**
- [ ] Kankalar listesinde aksiyonlar ikon-only, dokunma hedefi rahat
- [ ] Grup DM'e uzun basınca "Ayarlar" çıkıyor; üye ekle/yeniden adlandır/ayrıl/sil orada
- [ ] Zaten kanka olduğun kişinin DM panelinde "Kanka Ekle" **yok**
- [ ] Mesaj yazarına dokununca profil açılıyor (kanal ve DM)
- [ ] Ortam üye listesi hâlâ yönetim ekranına gidiyor (değişmedi)
- [ ] Profil ekranından engelleme hâlâ yapılabiliyor
