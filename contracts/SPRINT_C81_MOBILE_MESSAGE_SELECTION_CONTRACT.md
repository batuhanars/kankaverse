# Sprint C81 — Mobilde mesaj seçimi (uzun basınca seçim çubuğu, çoklu seçim)

> 2026-11-26 · yalnız mobile · api değişmez (silme/iletme mevcut uçlarla, mesaj başına). R7 değil: yetki kapıları
> sunucuda, istemci yalnız yetkisi olmayan eylemi çizmez. Web/masaüstü hover menüsü DEĞİŞMEZ.

## 0. Karar (sahip, 2026-11-26)

Kullanıcı isteği: uzun basınca alttan panel yerine WhatsApp gibi üst başlık seçim çubuğuna dönsün. Sahip kararları:
- **Tamamen seçim modu:** alt panel (`MessageActionSheet`) kalkar.
- **Toplu eylemler:** Sil, İlet, Kopyala. Yanıtla, Düzenle, Sabitle, Tepkileri gör, Şikâyet et yalnız tek mesaj seçiliyken.
- **Kapsam:** DM, grup DM ve ortam kanalları (aynı `MessageScreen`).

## 1. Davranış

- Mesaja uzun bas → seçim modu, o mesaj seçili. Gönderilmemiş/başarısız (yerel) mesaj seçilemez.
- Seçim modunda mesaja dokunmak seçimi açar/kapar (uzun basış da). Mesajın kendi dokunuşları (görsel, bağlantı,
  yazar adı, çift dokunma tepkisi, kaydırarak yanıt) seçim modunda çalışmaz; satır tam genişlikte vurgulanır.
- Seçim 0'a düşünce, çubuktaki ✕ ya da Android geri tuşuyla mod kapanır.
- En çok 50 mesaj seçilir; aşılırsa bildirim.

## 2. Seçim çubuğu

Native başlık gizlenir, aynı yükseklikte seçim çubuğu çizilir (sol: ✕ + seçili sayı; sağ: eylemler). Ekranın
kendi başlığını ayarlayan dosyalarla (`dm/[id].tsx`, `channel/[id].tsx`) seçenek çakışması olmasın diye başlık
seçenekleri birleştirilmez, başlık kapatılır.

| Eylem | Görünme koşulu |
|---|---|
| Yanıtla | tam 1 seçili, mesaj kutusu açık |
| Kopyala | her zaman (salt okunur geçmiş dahil). Tek mesajda yalnız metin; çokta kronolojik "ad: metin" satırları |
| İlet | salt okunur değil; en çok 20 mesaj (5 hedef sınırı aynı) |
| Sil | salt okunur değil ve seçilenlerin HEPSİNİ silme yetkim var (kendi mesajım ya da mevcut `canDeleteOthers`) |
| ⋮ menü | tam 1 seçili: Düzenle (kendi mesajım), Sabitle/Kaldır (`canPin`), Tepkileri gör (tepki varsa), Şikâyet et (`canReportMessage`) |

Tam 1 seçiliyken çubuğun altında hızlı tepki şeridi (hesabın hızlı tepkileri + tam liste + düzenle kalemi).
Tepki verilince mod kapanır.

## 3. Toplu eylemler

- **Sil:** tek onay ("{n} mesaj silinsin mi?"). Mesajlar sırayla mevcut `DELETE` ucuyla silinir (sunucu her biri için
  yetkiyi yeniden denetler), her biri için `forgetE2eeMessage`. Kısmi hata: başarılılar düşer, bildirim
  "{ok}/{n} mesaj silindi". İyimser güncelleme yok (`message.deleted` olayı listeden düşürür).
- **İlet:** `ForwardMessageModal` mesaj dizisi alır; her hedefe mesajlar kronolojik sırayla tek tek gönderilir
  (ekler sunucuda kopyalanır, bugünkü yol). Önizleme çokta "{n} mesaj iletilecek".
- **Kopyala:** panoya yazılır, "Kopyalandı" bildirimi.
- **Şikâyet** bilerek toplu DEĞİL: her şikâyet kendi mesajının kanıtını taşır.

## 4. Kaldırılan

`MessageActionSheet` (dosya silinir). Emoji tam listesi, Tepkileri gör paneli, İlet ve silme onayı `MessageActionHost`'ta kalır.

## 5. i18n (`mobile.select.*`)

`count`, `close`, `more`, `limit`, `deleteConfirm`, `deletedPartial`, `copied`, `forwardCount`, `forwardLimit`.

## 6. Doğrulama

typecheck + eslint. Cihaz turu: DM, grup DM, ortam kanalı; tek seçimde tüm eylemler; çoklu seçimde Sil/İlet/Kopyala;
başkasının mesajı seçiliyken Sil görünmez (yetkisizse); geri tuşu modu kapatır; salt okunur geçmişte yalnız Kopyala
ve Şikâyet.

## Rev.1 (2026-11-26, sahip turu)

- Hızlı tepki şeridi seçim çubuğunun altında değil, **seçili mesajın üstünde süzülür** (WhatsApp). Konum: uzun basılan
  noktanın `pageY`'si (liste `inverted`, satır ölçüsü güvenilmez); yer yoksa parmağın altına. Kaydırınca gizlenir.
- Çubukta **Kopyala yerine Düzenle** (kalem, tek mesaj + kendi mesajım); **Kopyala ⋮ menüsüne** geçer (çoklu seçimde de menüde).
- Şeritteki hızlı tepki düzenleme kalemi kaldırıldı. Tam emoji listesinin üstünde **"Varsayılan tepkiler"** bölümü:
  dokununca tepki verir; "Düzenle" ile yuvaya dokun → listeden emoji seç → yerinde değişir (`PATCH /users/me`, aynı uç).

## Rev.2 (2026-11-26, sahip turu)

- Seçim modunda native başlık GİZLENMEZ; aynı başlığın içeriği değişir (✕ · sayı · eylemler). Başlığın kalkıp gelmesi
  ekranı yeniden yerleştiriyordu ("yeniden yükleniyor gibi"). Bunun için `dm/[id].tsx` ve `channel/[id].tsx` başlığın
  solunu/ortasını `MessageScreen`e prop olarak verir, `Stack.Screen`de vermez.
- Şerit baloncuğun ölçüsüyle konumlanır (2 dp üstü); dokunma noktası düzeltmesi kaldırıldı (farklı koordinat sistemi,
  şeridi bir boy yukarı itiyordu). Şerit kısa büyüyerek açılır. Vurgu yalnız mesaj satırını kaplar.
- Seçim başlarken 10 ms titreşim (`SwipeToReply` ile aynı).
- Emoji seçici WhatsApp düzeni: solda arama ikonu, kategori şeridi altta; arama ikonla açılır, boşken tüm emojiler,
  yazdıkça süzülür (`EmojiSearchPanel`; kütüphanenin arama kutusu odaklanamıyor). Ad/anahtar kelimeler İngilizce.
