# SPRINT C15: Sohbet medyasını indirme

> Durum: **TASARIM KİLİTLİ (2026-10-26).** PM compose (Opus). Sahip isteği: "chat'e atılan video, görsel ve
> gifler indirilebilsin". (C14 numarası yapay zeka videosuna ayrıldı.) Sıra: **api → web + mobil paralel.**
> Mobil yalnız JS: `expo-file-system` ve `expo-media-library` kurulu, yeni paket ve yeni derleme YOK.
> **R7:** ek erişim ucunun davranışı genişliyor (erişim kontrolü DEĞİŞMEZ, yeniden kullanılır).

---

## §0 Kapsam ve kararlar

**Bugünkü durum (PM incelemesi):**
- Web görsel büyütme (`ImageLightbox.vue`) ve dosya kartı (`AttachmentView.vue`) "İndir" butonu taşıyor ama
  `<a download>` **farklı alan adındaki** imzalı adreste tarayıcılarca yok sayılır: dosya indirilmez, sekmede açılır.
- Web video kartında (`VideoCard.vue`) indirme yok (yalnız tarayıcının gizli video menüsü).
- Mobilde görsel, GIF ve videoyu galeriye kaydetmenin yolu yok.

**IN:** sohbet eklerinden görsel, GIF ve video için gerçek indirme. Web: üç tür + mevcut dosya kartı.
Mobil: görsel ve video görüntüleyicide "Galeriye kaydet".

**Kilitli kararlar:**
- **İndirme sunucunun verdiği `Content-Disposition: attachment` başlığıyla olur.** İstemcide blob'a çekip
  kaydetme reddedildi: 25 MB videoyu belleğe almak gereksiz, imzalı adresin CORS'una bağımlı.
- **Erişim kontrolü ve tarama kapısı aynen yeniden kullanılır.** Yeni izin mantığı yazılmaz. Görüntüleyemediğin eki
  indiremezsin; "kaldırıldı" / "işleniyor" durumundaki ek indirilemez (mevcut davranış).
- **Mobilde yeni izin beyanı YOK.** Kaydetme yalnız yazma izniyle (`writeOnly`). Video kaydı Play'de
  `READ_MEDIA_VIDEO` beyanı gerektirirse **DUR** (D35'te bu beyan bilinçli olarak yarıya indirilmişti).

**OUT:** toplu indirme · profil avatarı/afişi indirme · mobilde PDF/belge kaydetme (mevcut "aç" davranışı kalır) ·
indirme sayacı/kaydı.

---

## §1 Backend

`GET /attachments/:id` **+ opsiyonel sorgu** `?download=1`.
- Yanıt şekli değişmez (envelope + mevcut alanlar). `download=1` iken dönen imzalı adres
  `ResponseContentDisposition` taşır: `attachment; filename="<ascii yedek>"; filename*=UTF-8''<RFC 5987 kodlu ad>`.
- Dosya adı: ekin kayıtlı `filename`'i. Kontrol karakterleri, `"`, `\`, `/` temizlenir; ASCII yedekte ASCII dışı
  karakterler `_` olur; boşsa `kankaverse-<id>` + uzantı.
- `StorageService.presignGet(key, { downloadFilename? })` opsiyonel parametresi. Mevcut çağrılar değişmez.
- Erişim kontrolü, tarama kapısı, hata kodları: **dokunulmaz**, aynı fonksiyon yolu.
- Test: başlık inşası (Türkçe karakter, tırnak, boş ad), `download` yokken eski davranış, erişimi olmayan
  kullanıcı `download=1` ile de reddediliyor.

---

## §2 Web

1. `attachmentsApi.getDownloadUrl(id, { download: true })`.
2. Ortak yardımcı: indir → URL'yi al → gizli `<a href>` ile tıkla (aynı sekmede; `Content-Disposition` sayfayı
   terk ettirmez). `download` özniteliğine güvenilmez.
3. `ImageLightbox.vue` ve `AttachmentView.vue` "İndir" bu yardımcıya bağlanır (GIF görsel yolundan geçer).
4. `VideoCard.vue`: oynatıcının dışında, kartın köşesinde küçük bir indirme simgesi (`title`/`aria-label` i18n).
   Kaldırılmış/işlenen video durumunda görünmez.
5. Masaüstü (Electron) aynı web kodu: indirmenin kaydetme penceresiyle çalıştığı sahip turunda kontrol edilir.
   Çalışmazsa DUR (masaüstü tier'ı bu sprintte yok).
6. i18n: mevcut `attachment.download` kullanılır, yeni metin gerekiyorsa `attachment.*` altına. Uzun çizgi yok.

---

## §3 Mobil (yalnız JS)

1. `ImageViewer.tsx` ve `message/VideoViewer.tsx`: "Galeriye kaydet" eylemi (mevcut başlık/çubuk desenine uygun simge).
2. Akış: `MediaLibrary.requestPermissionsAsync(true)` (yalnız yazma) → reddedilirse açıklayıcı mesaj →
   imzalı adres (gerekirse tazelenmiş; süresi dolmuş adres sorunu mobilde zaten çözülmüştü, aynı yolu kullan) →
   `FileSystem` ile önbelleğe indir (doğru uzantıyla) → `MediaLibrary.saveToLibraryAsync` → önbellek dosyasını sil →
   "Galeriye kaydedildi" bildirimi.
3. İndirme sürerken buton meşgul görünür, iki kez tetiklenmez.
4. GIF görsel olarak kaydedilir ve galeride hareketli kalmalı (sahip cihaz turunda bakar).
5. i18n `mobile.media.*` altına (`save`, `saved`, `saveFailed`, `permissionDenied`), `web/src/i18n/tr.json`'a eklenir.
6. `app.json` izin bloğu **değişmez**. Değiştirmek gerekirse DUR.

---

## §4 DoD
- [ ] api: `download=1` + güvenli dosya adı + testler; erişim yolu değişmedi
- [ ] web: üç indirme noktası ortak yardımcıdan; video kartında simge; gerçekten indiriyor (sekme açmıyor)
- [ ] mobil: görsel + video "Galeriye kaydet", izin reddi, meşgul durumu; yeni paket/izin yok
- [ ] build/test: api build + jest; web `vue-tsc -b` (bilinen 6) + `vite build`; mobil typecheck + lint
- [ ] **R7 insan incelemesi:** ek ucu diff'i sahibe sunuldu
- [ ] Sahip turu: web + masaüstü indirme (Türkçe adlı dosya dahil), mobilde görsel/GIF/video galeriye
- [ ] Mağaza sürümü (mobil JS değişikliği: versionCode 26 release paketi)

## §5 Sapma kuralı
Şunlar → **DUR, PM'e dön:** erişim/tarama kapısında değişiklik · yeni Play izin beyanı · yeni native paket ·
istemcide blob indirme · masaüstü tier değişikliği.
