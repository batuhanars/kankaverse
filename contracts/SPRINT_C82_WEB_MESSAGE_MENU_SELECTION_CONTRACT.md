# Sprint C82: Web/masaüstü mesaj menüsü (WhatsApp düzeni) + çoklu seçim

> 2026-11-27 · yalnız web (masaüstü load-remote olduğu için otomatik gelir) · api DEĞİŞMEZ (silme/iletme/indirme
> mevcut uçlarla, mesaj başına). R7 değil: yetki kapıları sunucuda, istemci yalnız yetkisi olmayan eylemi çizmez.
> Mobil karşılığı C81. Dev commit ETMEZ; diff PM'e, PM sahibe.

## 0. Kaynak (sahip, 2026-11-26/27)

Sahip WhatsApp masaüstünün ekran görüntülerini verdi: sağ tık menüsü, görselde ek olarak "Farklı kaydet", seçim
modunda solda onay kutuları ve altta seçim çubuğu. Kararlar:
- Sağ tık menüsü ve hover çubuğundaki **⋯ menüsü AYNI menü** olur (tek bileşen, aynı sıra, aynı kurallar).
- **Çoklu seçim** gelir (menüde "Seç").
- **Ekli mesajda "Farklı kaydet"** menüde görünür; metin mesajında görünmez. Bugün indirmek için görseli büyütmek
  gerekiyor, bu sprintten sonra menüden de indirilir.
- WhatsApp'taki Mesaj bilgisi, Yıldız ekle, yapay zekaya sor, Paylaş, Şununla aç **alınmaz** (bizde karşılığı yok;
  boş iskele koyulmaz).

## 1. Menü (sağ tık = ⋯)

`MessageContextMenu` genişler ve tek menü olur; `MessageActionsMenu` içindeki ⋯ açılır listesi kaldırılır, ⋯ düğmesi
aynı `MessageContextMenu`'yu düğmenin altına konumlayarak açar. Hover çubuğunun geri kalanı (emoji, Yanıtla, İlet, ⋯)
DEĞİŞMEZ.

Sıra ve görünme koşulları (bugünkü koşullar korunur):

| Grup | Öğe | Koşul |
|---|---|---|
| 1 | Yanıtla | `canReply` ve salt okunur değil |
| 1 | Kopyala | mesajda metin var. Sağ tıkta metin seçiliyse seçimi kopyalar (bugünkü davranış) |
| 1 | İlet | salt okunur değil |
| 1 | Sabitle / Sabitlemeyi kaldır | `canPin` |
| 1 | Düzenle | kendi mesajım, metin var, salt okunur değil |
| 1 | Tepkileri gör | mesajda tepki var, salt okunur değil |
| — | ayraç | |
| 2 | Seç | her zaman (yerel/gönderilmemiş mesaj hariç) |
| — | ayraç (yalnız 3. grupta öğe varsa) | |
| 3 | Farklı kaydet | mesajda ek var. Sağ tık bir ekin ÜSTÜNDEYSE o ek; değilse ve tek ek varsa o ek; birden çok ek varsa "Tümünü kaydet" (sırayla `downloadAttachment`) |
| — | ayraç | |
| 4 | Şikâyet et | kendi mesajım değil |
| 4 | Sil | kendi mesajım ya da `canManageMessages`, salt okunur değil |

- Şikâyet et ve Sil `--kv-danger` rengi (bugünkü gibi).
- İkonlar bugünkü 15 px çizgi ikonlar; yeni ikonlar (Seç = onay kutusu, Farklı kaydet = aşağı ok) aynı stilde.
- Menü ekran kenarına taşmaz (`ContextMenuShell` bugün ne yapıyorsa).
- Masaüstünde "Farklı kaydet": Electron'da indirme kayıt penceresini açar (kabuk `will-download` tanımlamıyor,
  Electron varsayılanı). Bu sprintte kabuğa dokunulmaz; turda doğrulanır.

## 2. Seçim modu

Durum: `useMessageSelection(channelId)` composable (görünüm başına, kanal değişince sıfırlanır). Hem ortam kanalı
listesi (`MessageItem` kullanan liste) hem `DmConversation` aynı composable'ı kullanır.

- "Seç" ile mod açılır, o mesaj seçili gelir.
- Modda her seçilebilir satırın **solunda onay kutusu** belirir; satır tam genişlikte vurgulanır (seçiliyse
  `--kv-bg-elevated` tonu). Satıra tıklamak seçimi açar/kapar; mesajın kendi tıklamaları (görsel büyütme, bağlantı,
  yazar adı, tepki) modda çalışmaz. Hover çubuğu ve sağ tık menüsü modda gizlenir.
- Kapanış: çubuktaki ✕, `Esc`, seçim 0'a düşünce, kanal değişince.
- En çok 50 mesaj; aşılırsa bildirim (`select.limit`).
- Yerel/gönderilmemiş mesaj seçilemez (kutu çizilmez).

## 3. Seçim çubuğu

Mesaj yazma kutusunun YERİNE aynı yükseklikte çizilir (kutu taslağı korunur, mod kapanınca geri gelir).
Sol: ✕ + "{n} mesaj seçildi". Sağ, ikon düğmeleri (araç ipucu ile):

| Eylem | Görünme koşulu (koşul yoksa düğme GİZLENİR; Rev.1) |
|---|---|
| Kopyala | seçilenlerin en az birinde metin var. Tek mesajda yalnız metin; çokta kronolojik `ad: metin` satırları |
| Sil | seçilenlerin HEPSİNİ silme yetkim var (kendi mesajım ya da `canManageMessages`) ve salt okunur değil |
| İlet | salt okunur değil ve en çok 20 mesaj |
| İndir | seçilenlerde en az bir ek var; tüm ekler kronolojik sırayla `downloadAttachment` |

Tek mesaj seçiliyken ek eylem yok (Yanıtla/Düzenle/Sabitle/Şikâyet menüden yapılır, modu açmadan).

## 4. Toplu eylemler (C81 §3 ile aynı kurallar)

- **Sil:** tek onay ("{n} mesaj silinsin mi?"). Sırayla mevcut `DELETE` ucu; şifreli mesajda bugünkü tekil silme
  yolunun yaptığı yerel temizlik her biri için yapılır. Kısmi hata: "{ok}/{n} mesaj silindi". İyimser güncelleme yok
  (`message.deleted` olayı düşürür). Başarıdan sonra mod kapanır.
- **İlet:** `ForwardMessageModal` `messages: MessageDto[]` alır (tek mesaj çağrıları dizi ile). Her hedefe mesajlar
  kronolojik sırayla tek tek gönderilir, ekler bugünkü `forward` ucuyla kopyalanır. Önizleme çokta
  "{n} mesaj iletilecek". 5 hedef sınırı aynı.
- **Kopyala:** panoya yazılır, "Kopyalandı" bildirimi, mod kapanır.
- **İndir:** her ek ayrı indirme; tarayıcı birden çok indirme için izin isteyebilir (beklenen).
- **Şikâyet bilerek toplu DEĞİL** (her şikâyet kendi kanıtını taşır).

## 5. i18n

Yeni anahtarlar `select.*`: `start` (Seç), `count`, `close`, `limit`, `deleteConfirm`, `deletedPartial`, `copied`,
`download`; `message.saveAs` (Farklı kaydet), `message.saveAll` (Tümünü kaydet), `message.forwardCount`.
Mevcut anahtar varsa yeniden kullanılır, kopyası açılmaz.

## 6. Sınırlar

- Dosya boyutu: `MessageRow.vue` 537 satır. Seçim kutusu ve vurgu eklenirken satır 600'ü geçecekse seçim görünümü
  ayrı küçük bir bileşene çıkarılır. `MessageActionsMenu.vue`'dan ⋯ listesi çıkınca dosya küçülmeli.
- Yeni bağımlılık yok.

## 7. Doğrulama

`npx vue-tsc -b` (yalnız bilinen 6 hata), dokunulan dosyalarda `npx eslint`, `npx vite build`.

Sahip turu (tarayıcı + masaüstü):
1. Metin mesajına sağ tık: Farklı kaydet YOK; sıra tablodaki gibi; ⋯ aynı menüyü açar.
2. Görselli mesajda sağ tık görselin üstünde: Farklı kaydet var, o görsel iner (masaüstünde kayıt penceresi açılır).
3. Çok ekli mesajda görsel dışında sağ tık: Tümünü kaydet.
4. Metin seçip sağ tık → Kopyala yalnız seçimi kopyalar.
5. Seç → onay kutuları, satıra tıklayınca seçim değişiyor, görsel büyümüyor; Esc kapatıyor; taslak korunuyor.
6. Çoklu: Kopyala (ad: metin), İlet (2 hedefe 3 mesaj, sıra doğru), Sil (kendi mesajlarım), başkasının mesajı
   seçiliyken Sil soluk (yetkisizse), İndir yalnız ek varken etkin.
7. DM, grup DM, ortam kanalı; salt okunur geçmişte menüde yalnız Kopyala, Seç, Farklı kaydet, Şikâyet et.
8. Dar pencere (masaüstünü küçült, 390 px tarayıcı): menü ve çubuk taşmıyor.

## Rev.1 (2026-11-27, sahip turu)

- Seçim çubuğunda koşulu sağlamayan düğme soluk durmaz, **gizlenir** (WhatsApp: işleve göre görünür/gizlenir).
  Menüdeki öğelerde de aynı ilke (zaten böyleydi).
- Tur bulgusu: `MessageRow.vue` `ctxMenu` izleyiciden sonra tanımlanıyordu (TDZ), satırlar ve gönderme çöküyordu; düzeltildi.
- Seçim çubuğundan **İndir kaldırıldı** (sahip: gereksiz). Ek indirme yalnız menüden (Farklı kaydet / Tümünü kaydet).
- **Rev.2 (sahip, WhatsApp'ta denedi):** İndir geri geldi. Her zaman görünür; yalnız seçilenlerin HEPSİ indirilebilir ek taşıyorsa etkin, araya düz metin mesajı karışırsa pasif (soluk). Ek altı açıklama metni etkinliği bozmaz. Diğer düğmeler Rev.1 gibi gizlenir.
- **Rev.3 → C83'e devredildi (sahip, WhatsApp masaüstü):** masaüstünde çoklu indirme tek seferde klasör seçtirir
  (dosya gezgini), tüm ekler o klasöre kaydedilir, ardından "{n} dosya kaydedildi" bildirimi. Kabuk işi
  (klasör seçme penceresi + `will-download` ile kayıt yolu + preload köprüsü), C83 kapsamında. Tarayıcıda bugünkü
  davranış kalır (site başına bir kez çoklu indirme izni, sonra sırayla iner).
