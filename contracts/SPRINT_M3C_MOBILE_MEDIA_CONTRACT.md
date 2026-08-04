# SPRINT M3c — Mobil Medya: Ek Gönderme + Emoji Düğmesi

> **Tek doğruluk kaynağı.** Davranış buradan **sapamaz**; sapma ihtiyacı → **DUR**, sahibe bildir.
> PM compose: 2026-08-04 (sahip Discord mobil görselleri + faz sırası revizyonu).
>
> **Adlandırma:** bu sprint **M3c**, M4 değil. PLAN/TASK'ta "M4 = ses" onlarca yerde geçiyor;
> medyayı M4 yapmak sesi M5'e kaydırıp o referansları yanlışa düşürürdü.
>
> **Sıra:** bu biter → **M4 (ses + görüntülü)**. Sahip: "M4 ağır ve uzun; ondan önceki
> uğraştırmayacak işleri bitirelim ki sadece M4'e odaklanabilelim."

---

## §0 Neden bu sprint var

Mobilde **ek gönderme hiç yok**: `MessageComposer` 230 satır, içinde tek satır ek kodu yok, ataç
düğmesi bile. `AttachmentView` yalnız **gelen** eki çiziyor. M3b'de DM detay ekranına
Medya/Bağlantılar/Dosyalar sekmeleri kondu ve mobil kullanıcı onları **dolduramıyor**.

Ayrıca tepkiler (reaction) eklendi ama **mesaj kutusunda emoji düğmesi yok** (sahip fark etti).

**Ucuz olmasının sebebi (PM taraması 2026-08-04):**
- Backend Sprint 5'ten beri canlı: `POST /attachments/presign` + doğrudan PUT + mesaja `attachmentIds`
- `expo-image-picker` **zaten kurulu**; `utils/imageUpload.ts` **çalışan** presign→PUT akışını taşıyor
  (avatar/afiş onu kullanıyor) — desen kanıtlı, ama o kod profil-özel
- Emoji seçici **zaten kurulu**: `rn-emoji-keyboard` (MIT, sıfır bağımlılık), tepkilerde kullanılıyor
  (`MessageActionHost.tsx`) → düğme yeni seçici inşası değil, **var olanı yeniden bağlamak**

---

## §1 `+` düğmesi ve ek paneli

`MessageComposer`'ın soluna **`+`** düğmesi. Dokununca alttan panel açılır.

**Panel, ilk hâl (kısa):**
- Üstte **iki satır düğme: "Galeriden Seç"** (sistem foto seçicisi) ve **"Dosyalar"** (sistem belge
  seçicisi, `expo-document-picker` — sahip onayı 2026-08-04, §2'ye ek)
  🔴 Discord'daki **"Anketler" YOK** — bizde anket/forum kavramı yok, boş yüzey açma kuralı
  ⚠️ **Düzeltme:** sözleşmenin ilk hâli tek "Dosyalar" satırı yazıp onu galeri seçicisine bağlıyordu.
  Dev bunu **UI yalanı** sayıp durdu ve haklıydı: onaylı paket (`expo-media-library`) belge vermiyor,
  "Dosyalar" deyip galeri açmak olurdu. İki ayrı satır, iki ayrı işlev.
- Altında **galeri ızgarası** (§2): ilk hücre **kamera**, sonrasında en yeni medya
- Seçim yapıldıkça seçili hücreler işaretlenir, gönder düğmesi seçim sayısını gösterir

**Panel yukarı sürüklenince (tam ekran):**
- **Dosyalar** satırı kaybolur, üstte **Geri** · başlık · **Tüm Albümler** çıkar (Discord düzeni)
- **Tüm Albümler** → sistem seçicisi (Dosyalar ile aynı yere çıkıyor, sahip de böyle tarif etti)

Dokunma hedefleri ≥44dp, `accessibilityLabel` zorunlu.

---

## §2 Uygulama içi galeri ızgarası

**Sahip kararı 2026-08-04.** PM sistem seçicisini önerdi (sıfır izin, sıfır bağımlılık); sahip
Discord birebir ızgarayı seçti: *"hoş bir tasarım varsın izin istesin, politikalara da yazarız."*
İtiraz kayda geçti, karar sahibin.

- Galeri okuma `expo-media-library` ile. **Yeni bağımlılık = bu sprintte onaylı** (yalnız bu paket).
- İzin akışı: reddedilirse ızgara yerine **açıklayıcı satır + "Dosyalar"a yönlendirme**. Uygulama
  kilitlenmez, ek gönderme sistem seçicisi üzerinden yine mümkün olur.

🔴 **Android 14+ kısmi erişim dalı ZORUNLU.** *(Düzeltme: sözleşme "13+" yazıyordu, YANLIŞ —
`READ_MEDIA_VISUAL_USER_SELECTED` ve `presentPermissionsPickerAsync` Android **14+**; 13'te izin ya
hep ya hiç. Cihaz testinde 13'lü telefonda bu dal görünmez, "eksik" sanılmasın.)* Kullanıcı "yalnız seçilen fotoğraflar" izni verebiliyor;
o hâlde ızgara kütüphanenin **tamamını göremez**. Bu ele alınmazsa kullanıcı "fotoğraflarım
kaybolmuş" sanır. Kısmi erişimde ızgaranın üstünde **"Daha fazla fotoğraf seç"** yolu olmalı.
Bu, ızgara kararının bir parçası; atlanamaz.

🔴 **Play beyanı:** `READ_MEDIA_IMAGES` Google Play'de **hassas izin**;
*(Daraldı: video açılmadığı için `granularPermissions: ["photo"]` yeterli oldu → `READ_MEDIA_VIDEO`
beyanı gerekmiyor. Dev'in yan kazancı, beyan yüzeyi yarıya indi.)* mağaza
gönderiminde beyan formu doldurulacak ve gizlilik politikasına yazılacak. Sahip bunu bilerek kabul
etti. **PLAN'a lansman kalemi olarak işlenir** — gönderim gününde sürpriz olmasın.

**Seçim sınırı:** en fazla **10** öğe (Discord ile aynı). Sınır aşılınca ek seçim engellenir ve
kullanıcıya söylenir.

---

## §3 Yükleme akışı

Sunucunun tanımladığı akış **değişmiyor**, mobil onu uygular:

1. `POST /attachments/presign` `{ filename, contentType, size }` → presigned PUT URL + `attachment.id`
2. Dosyayı **doğrudan depolamaya** PUT — 🔴 `http` instance'ı **kullanma**, token gitmemeli;
   presigned URL yetkiyi zaten taşıyor. `imageUpload.ts`'teki `uploadAsync` deseni referans
   (`expo-file-system/legacy` — SDK 54 notu o dosyada yazılı)
3. `POST /channels/:id/messages` `{ content?, attachmentIds }` — **içerik opsiyonel** (≥1 ek varsa
   boş metin geçerli, Sprint 5 §4)

**Sınırlar sunucudan:** boyut `maxUploadBytes` (config `MAX_UPLOAD_MB`), aşımda 400.
🔴 **İstemci aynı sınırı erken söylesin** (`imageUpload.ts`'teki desen) ama **sunucu otoritedir**;
istemci sınırını sunucununkinden gevşetme.

🔴 **Kısmi başarısızlık:** 5 dosyadan 3'ü yüklenip 2'si patlarsa **mesaj GÖNDERİLMEZ**. Hata gösterilir,
seçim korunur, kullanıcı tekrar deneyebilir. Yarısı giden mesaj göndermek sessiz veri kaybıdır.

**`UPLOADS_ENABLED=false` durumu:** istemciye bayrak **taşınmaz**; `presign` 403'ü otoritedir ve
sunucunun Türkçe mesajı gösterilir. Bu web'in bugünkü davranışıyla aynı (build-time bayrak yok,
bkz. [[sonraki-faz-medya]]) — mobilde ayrı bir bayrak mekanizması **icat etme**.

**`scanStatus`:** yeni ek `PENDING` doğar; indirme kapısı `CLEAN` ister (`SCAN=false` iken her şey
otomatik `CLEAN`). `AttachmentView` bu mantığı **zaten taşıyor**, ikinci kez yazma.
⚠️ **Kayda geçsin (dev bulgusu):** kapı **gönderenin kendi ekine de** uygulanıyor. `SCAN=false` iken
görünmez, ama tarama açıldığı gün kullanıcı kendi gönderdiği fotoğrafı bir süre "İşleniyor…" olarak
görecek. Bu sprintte iş yok; `SCAN` açılırken UX kararı verilecek.

---

## §4 Emoji düğmesi

`MessageComposer`'da metin alanının sağında **gri emoji ikonu**. Dokununca alttan emoji seçici;
yukarı sürüklenince geniş liste (sahip görseli).

- Seçici **`rn-emoji-keyboard`** — **zaten kurulu**, tepkilerde kullanılıyor. **Yeni paket kurma**,
  ikinci bir seçici yazma.
- Seçilen emoji **imlecin olduğu yere** yazılır (sona değil). `TextInput` seçim konumu takip edilir.
- Seçici kapanınca klavye/odak durumu bozulmasın.
- Discord'un **GIF'ler** ve **Çıkartmalar** sekmeleri **YOK** (bizde yok) → sekme çubuğu çizilmez.
- Tepki akışı (`MessageActionHost`) **değişmez**; iki kullanım aynı paketi paylaşır, kopya yazılmaz.

---

## §5 Web: "Forum" kanal türü seçeneği kaldırılıyor

`web/src/components/layout/ChannelPanel.vue:1631` kanal oluşturmada **"Forum — devre dışı"** seçeneği
gösteriyor. Backend'de forum yok (`ChannelType` = `GUILD_TEXT|GUILD_VOICE|DM|GROUP_DM`), mobil zaten
gizliyor (`channel-edit.tsx` yorumu: "forum/alt-başlık kavramı bizde yok").

- Seçenek **kaldırılır**; `channel.channelTypeForum` anahtarı `tr.json`'dan silinir.
- Gerekçe kural: [[ui-bos-placeholder-sismeme]] — olmayan özellik için boş iskele koymuyoruz. Devre
  dışı seçenek bir vaat; forum gelmezse kalıcı yalan, gelirse eklemek beş dakika.
- Ayrıca iki istemci ayrışmasını kapatır (mobil gizliyor, web gösteriyordu).

---

## §6 T&S

🔴 **Bu sprint çocuk güvenliği yüzeyini genişletiyor.** CSAM taraması hâlâ **kapalı** (`SCAN=false`,
bkz. [[csam-upload-strategi]]). Web'den yükleme masaüstü isterken mobil yükleme kamera rulosundan
**tek dokunuş** — aynı risk sınıfı ama **huni çok daha geniş**. Yeni bir karar değil, **ölçeği
değişen** bir karar; sahip bilerek ilerliyor.

Bu sprintte uygulanacak kemerler:
- Yükleme kapıları **sunucuda**: `uploadsEnabled`, boyut, `VerifiedEmailGuard` (presign doğrulanmış
  e-posta istiyor), `requireChannelAccess`. İstemci **hiçbirini yeniden hesaplamaz**, gevşetmez.
- Minör/yaş kapıları mevcut kanal erişim kurallarından gelir; mobil yeni bir kapı **kurmaz**.
- Yükleme hatalarında ham hata metni ekrana basılmaz; sunucunun Türkçe mesajı gösterilir.
- Rapor/takedown yüzeyi **değişmiyor** (mevcut akışlar).

---

## §7 Kapsam dışı (yapma)

- **Anket/forum** (Discord'daki "Anketler") · **GIF ve Çıkartma** sekmeleri
- **Ses kaydı** (Discord'un mikrofon düğmesi) → M4
- Ortam ikonu/afişi mobilden yükleme → M1d §10.3 kuralı duruyor, **değişmedi**
- Yükleme ilerleme yüzdesi başına ayrı ekran, düzenleme/kırpma, filtre
- CSAM tarayıcı entegrasyonu (Track A1, lansman kapısı)
- Web'de ek gönderme tarafına dokunma (`AttachmentComposeModal` referanstır, düzenlenmez)

---

## §8 DoD

**Kod:**
- [ ] `mobile`: `typecheck` + `lint` temiz
- [ ] `web`: `vue-tsc -b` (bilinen 6 hata, fazlası senin) + `vite build` temiz
- [ ] `api/` diffi **yok** (akış mevcut uçlarla; yeni uç gerekirse **DUR**)
- [ ] Yeni bağımlılık **yalnız** `expo-media-library` (izinli); emoji için paket **eklenmedi**
- [ ] Kullanıcıya görünen tüm yeni metin `tr.json` `mobile.*` altında

**Cihazda (sahip):**
- [ ] `+` → panel açılıyor; ızgarada son fotoğraflar geliyor, ilk hücre kamera
- [ ] Panel yukarı sürüklenince Dosyalar kaybolup Geri / Tüm Albümler çıkıyor
- [ ] Tüm Albümler ve Dosyalar sistem seçicisini açıyor
- [ ] Görsel gönderiliyor ve **karşı tarafta görünüyor** (web'de de)
- [ ] **PDF/belge** gönderiliyor (`expo-document-picker`, sahip onayı)
- [ ] ~~Video gönderiliyor~~ → 🔴 **DoD'dan ÇIKARILDI.** Sunucu izin listesi
      (`attachments.service ALLOWED_CONTENT_TYPES`) = `png/jpeg/gif/webp/pdf/txt`; **video YOK**.
      PM bunu DoD'a yazarken kontrol etmemişti, `api/` diffi olmadan imkânsızdı. Dev durdu ve bildirdi.
      **Sahip kararı 2026-08-04: video şimdi açılmıyor** (api değişikliği + `READ_MEDIA_VIDEO` Play
      beyanının geri gelmesi + 25 MB'ın telefon videolarını zaten reddetmesi + `SCAN=false` iken en
      ağır türü açmanın T&S riski). PLAN borcu olarak yazıldı
- [ ] Çoklu seçim (2-3 dosya) tek mesajda gidiyor; 10 sınırı uyarıyor
- [ ] Boyut sınırını aşan dosyada anlaşılır Türkçe uyarı
- [ ] 🔴 **Galeri izni reddedilince** uygulama kilitlenmiyor, Dosyalar yolu çalışıyor
- [ ] 🔴 **Kısmi erişimde** ("yalnız seçilen fotoğraflar") ızgara boş/eksik görünüp kullanıcıyı
      şaşırtmıyor, "daha fazla seç" yolu var
- [ ] Emoji düğmesi seçiciyi açıyor, emoji **imlecin olduğu yere** giriyor
- [ ] Tepki emoji akışı bozulmadı (aynı paket, iki kullanım)
- [ ] Ek gönderilen mesaj **DM detay ekranının Medya/Dosyalar sekmesinde** görünüyor (M3b ile kapanan halka)
- [ ] Web'de kanal oluştururken **Forum seçeneği yok**

**Lansman kalemi (PLAN'a):**
- [ ] Play gönderiminde `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO` beyan formu + gizlilik politikası metni
