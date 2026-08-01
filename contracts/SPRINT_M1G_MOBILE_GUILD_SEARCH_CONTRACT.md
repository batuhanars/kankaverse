# Sprint M1g — Mobil Ortam İçi Arama + Aksiyon Şeridi (Track F2, PM compose 2026-08-01)

> **Tek doğruluk kaynağı.** Uç imzası ve sorgu parametreleri bu dosyadan **sapamaz**.
>
> **Zaman kutulu sprint:** sahip 20.20'de bırakmak istedi, etkinlikler **bilinçli olarak yarına
> bırakıldı** (PM tavsiyesi: 3 adımlı sihirbaz + liste + katılma + bildirim hedefi yarım saate
> sığmaz, sıkıştırılırsa yarın baştan revize edilir).

---

## 0. Kaynaktan doğrulanmış uç (2026-08-01)

`GET /guilds/:id/messages/search` — `GuildSearchController` (`messages.controller.ts`).
Sorgu: `q` (opsiyonel, doluysa **min 2** yoksa `QUERY_TOO_SHORT`) · `from` (authorId) ·
`mentions` (userId) · `in` (channelId) · `has` (`link` | `file`).
Dönüş: **kanal-gruplu** → `{ channelId, channelName, messages: MessageDto[] }[]`, max 50 mesaj.

🔴 **Erişim kapıları sunucuda:** yaş kapılı kanal minöre, özel kanal üye olmayana **hiç dönmüyor**;
erişilemeyen bir kanal `in` ile istenirse boş sonuç (sızıntı yok). İstemci bu mantığı **taklit
etmez**, ne gelirse onu listeler.

---

## 1. DoD — **fiziksel cihazda**
1. Ortam panelinde ad'ın altında **arama + davet** şeridi görünüyor.
2. Aramaya dokununca tam ekran arama açılıyor, klavye geliyor.
3. Yazınca sonuçlar **kanal başlıkları altında gruplu** geliyor.
4. Filtre paneli açılıyor; kanal ve tür (bağlantı/dosya) seçilebiliyor.
5. Etkin filtreler çip olarak görünüyor, dokununca kalkıyor.
6. Sonuca dokununca ilgili kanal açılıyor.
7. Metin `tr.json`'dan; `typecheck` + `lint` temiz; `api/`'ye dokunulmadı.

---

## 2. Kapsam

### 2.1 Aksiyon şeridi (`ChannelSidebar`)
Ortam adının **altında**: geniş **Ara** düğmesi + dar **davet** ikonu (Discord yerleşimi, sahip
ekran görüntüsü). Arama gerçek bir giriş alanı değil düğme — mobilde dar şeritte klavye ve sonuç
listesi birlikte sığmaz.

🔴 **Takvim (etkinlik) düğmesi KONMADI.** Etkinlik henüz yok; dokununca hiçbir şey yapmayan düğme
`mobile/CLAUDE.md`'nin "boş yüzey açma" yasağını çiğner. Etkinlik sprintinde bu şeride girer —
şeridin yeri şimdiden ayrıldı, düğme ayrılmadı.

Davet **mevcut** `guild-invite` ekranına gider; şerit yeni bir yol açmıyor, kısayol veriyor.

### 2.2 Ortamda Ara ekranı
Sorgu alanı + filtre düğmesi + etkin filtre çipleri + kanal-gruplu sonuç. Debounce 350ms.
`q` **boş bırakılıp yalnız filtreyle** arama yapılabilir (sunucu destekliyor): "bu kanaldaki tüm
dosyalar" gerçek bir ihtiyaç.

🔴 Discord'un **sekmeli** arama ekranı (Yeni/Üyeler/Kanallar/Medya/Sabitlemeler) **kopyalanmadı** —
o sekmelerin arkasında bizde özellik yok (sabitleme yüzeyi yok, medya galerisi yok). M1b §3.5
kararı sürüyor: yerleşim alınır, olmayan içerik uydurulmaz.

### 2.3 Filtre paneli
**Kanal** (`in`) ve **tür** (`has`). Seçim anında değil **Uygula** ile uygulanır — her dokunuşta
arama tetiklemek panel açıkken arkadaki sonucu değiştirir, kullanıcı ne olduğunu göremez.

---

## 3. Kapsam DIŞI (uç var, istemci yok — yarın)
- **`from` / `mentions` filtreleri:** uç destekliyor, üye seçici gerekiyor.
- **Mesaja atlama:** sonuç **kanalı** açar, mesaja kaydırmaz. Kanallar arası atlama kanal ekranında
  yeni bir yetenek istiyor (şu an yalnız kanal İÇİ arama kaydırabiliyor). Yarım çalışan bir atlama
  yerine kanalı açmak dürüst davranış; eksik istemcide, uçta değil.
- **Etkinlikler:** kendi sprintinde (sahip kararı, zaman kutusu).

## 4. Sapma kuralı
Sorgu parametre adları (`q`/`from`/`mentions`/`in`/`has`), min 2 karakter eşiği, kanal-gruplu sonuç
şekli ve §3 bu dosyadan **sapamaz**. `api/`'ye dokunma ihtiyacı → **DUR**.
