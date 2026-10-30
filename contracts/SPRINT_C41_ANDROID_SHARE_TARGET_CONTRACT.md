# SPRINT C41: Android paylaş menüsünde Kankaverse (paylaşım hedefi)

> Durum: **SÖZLEŞME YAZILDI + SAHİP ONAYI (2026-10-31).** PM compose (Opus). **Yalnız mobil (Android).** api değişikliği YOK.
> R7 yok: yükleme ve gönderme mevcut uçlardan, kapılar sunucuda aynen. **Native değişiklik var** → vc42.

---

## §0 Kararlar (sahip, 2026-10-31)
1. Başka uygulamadan (galeri, dosya yöneticisi, tarayıcı) "Paylaş" denince Android paylaşım panelinde **Kankaverse** görünür.
   Başvuru/onay süreci yok; manifest beyanıdır.
2. Kabul edilen türler: **görsel, video, ses, genel dosya** (tek ya da çoklu) ve **düz metin / bağlantı**.
3. Paylaşılan içerik bir **"Nereye gönderilsin?"** ekranında hedef seçilerek gönderilir: DM, grup DM ya da ortam metin kanalı.
4. **Kurallar değişmez:** yükleme bayrağı, e-posta doğrulama şartı, minör kuralları, boyut/tür sınırı, tarama, kanal yazma izni,
   yavaş mod, DM engeli ve mesaj isteği kapısı mevcut gönderme yolundan aynen geçer. Yeni bir baypas yolu açılmaz.
5. **Aşama 1 bu sprint.** Paylaşım panelinde kişi/sohbet kısayolları (Direct Share / sharing shortcuts) Aşama 2, ayrı sprint.
6. iOS paylaşım uzantısı kapsam dışı.

## §1 Native kurulum
1. Tercih: `expo-share-intent` (yeni bağımlılık, **PM onaylı, koşullu**): Expo SDK 54 / RN 0.81 / Expo Router 6 ile uyumlu sürümü
   dev doğrular (sürüm eşleme tablosu, paket README'si). Uyumsuzsa ya da Expo Router'la çakışıyorsa dev DURUR, PM'e gelir
   (alternatif: kendi config plugin'imizle `intent-filter` + küçük native modül).
2. Android `intent-filter`: `ACTION_SEND` + `ACTION_SEND_MULTIPLE`; MIME: `image/*`, `video/*`, `audio/*`, `text/plain`,
   `application/*` (genel dosya). Çoklu paylaşımda en çok **10** öğe (fazlası için uyarı, ilk 10 alınır).
3. `app.json` plugin kaydı, `versionCode` **41 → 42**.
4. **Yerel derleme kuralı:** native değişiklik olduğu için önce `npx expo prebuild` + `gradlew assembleDebug` ile yerelde derlenir
   (hafıza: "native değişince önce yerel derle"); hata satırı raporlanır. EAS kullanılmaz.

## §2 Akış (mobil)
1. Paylaşım geldiğinde uygulama soğuk ya da sıcak açılış fark etmeksizin **`/share`** ekranına gider. Kimliksizse önce giriş;
   girişten sonra paylaşım içeriği korunur ve `/share` açılır (içerik bellekte, diske yazılmaz).
2. **C38 ile ilişki:** paylaşımla açılışta "kaldığın yerden aç" uygulanmaz (açık hedefli açılış, C38 §0.7). Bayat bildirim kapısı gibi
   paylaşım bilgisinin de bir sonraki normal açılışta tekrar tetiklenmediği doğrulanır (paylaşım tüketilince sıfırlanır).
3. `/share` ekranı:
   - Üstte önizleme: görsel küçük resimleri / video karesi / dosya adı+boyut / metin.
   - **Son sohbetler** (DM, grup DM ve son kullanılan ortam kanalları; mevcut listelerden, yeni API çağrısı gerekmez ya da mevcut
     uçlarla) + arama kutusu (ad ile süzme).
   - Ortam kanalları için yalnız yazılabilir metin kanalları; kilitli/yazma izni yok olanlar listelenmez.
   - İsteğe bağlı not alanı (metin paylaşımında not alanı paylaşılan metinle dolu gelir).
   - "Gönder" → mevcut ek yükleme (presign + upload) ve mesaj gönderme yolu; ilerleme göstergesi; başarıda o sohbet açılır.
4. Hata durumları mevcut Türkçe hata mesajlarıyla: yükleme kapalı, e-posta doğrulanmamış, boyut aşımı, desteklenmeyen tür,
   yazma izni yok, engellenmiş DM. Bir öğe başarısızsa diğerleri gönderilir, başarısızlar listelenir.
5. Minör kullanıcı: mevcut kurallar ne izin veriyorsa o (ör. minör DM sınırları sunucuda); ek kısıt yok, ek izin yok.
6. Metinler `web/src/i18n/tr.json` (mobil `i18n:sync`), uzun çizgi yok.

## §3 DoD
- mobil: `npx tsc --noEmit`, eslint (değişen dosyalar), yerel prebuild + gradle derlemesi geçer.
- Release APK canlı sunucuya karşı derlenir (hafıza: release yapılandırması sınanmalı), cihazda sahip turu:
  - Galeriden fotoğraf paylaş → Kankaverse listede → bir DM seç → gönderildi, sohbet açıldı.
  - Çoklu fotoğraf (3) → ortam kanalı.
  - Video ve PDF dosyası.
  - Tarayıcıdan bağlantı paylaş → metin olarak gider.
  - Uygulama tamamen kapalıyken paylaş (soğuk açılış) ve açıkken paylaş (sıcak).
  - Sonraki normal açılışta paylaşım ekranı tekrar açılmıyor.
  - Yükleme izni olmayan durumda anlaşılır hata.

**OUT:** Direct Share kısayolları (Aşama 2) · iOS · web/masaüstü "paylaş" · paylaşımda düzenleme/kırpma · çoklu hedefe aynı anda gönderme.

## §4 Ek (PM, 2026-10-31, dev raporu sonrası)
1. **`audio/*` filtreden çıkarıldı.** Ses dosyaları (mp3 vb.) sunucu ek allowlist'inde yok; panelde görünüp sonra "desteklenmiyor"
   demek kötü deneyim. Sesli mesaj uygulama içi kayıtla kalır. Kabul edilenler: görsel, video, metin/bağlantı, genel dosya (`application/*`).
2. `expo-share-intent` **5.1.1** (SDK 54 eşlemesi, peer `expo ^54`), tam sürümle sabit. Prebuild `--clean` ile yapılır (temizsiz çalışırsa
   filtreler çoğalıyor).
3. Cihazda ayrıca bakılacak: tek dosya yolunda paketin ek `Pair` girdisi elendi mi · `content://` URI ile yükleme.
