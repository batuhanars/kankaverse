# SPRINT C14d: Yapay zeka video, mobil

> Durum: **TASARIM KİLİTLİ (2026-10-28).** PM compose (Opus). Sahip kararı: mobile de gelsin (aynı gün önce "geçmeyelim"
> demişti, fikrini değiştirdi). Web C14 + C14b (§4b dahil) + C14c düzeni **referans**; api DEĞİŞMEZ (tüm uçlar hazır).
> Yalnız `mobile/`. **Native değişiklik YOK** (`expo-media-library`, `expo-file-system` C15'ten kurulu) → yalnız JS +
> mağaza sürümü **vc33**. **R7-nötr** (kapı sunucuda; rozet sunucu kaynaklı `aiGenerated`).

---

## §0 Kararlar
1. Kapı: oturum kullanıcısında `aiVideoAllowed === true` değilse hiçbir giriş görünmez (kilitli iskele yok).
2. Düzen web ile aynı mantık, mobil kalıpla: **alttan açılan sayfa** (sahibin taslağı, `EmojiGifSheet`/`AttachmentSheet`
   deseni). Form görünümü ↔ önizleme görünümü; ekranda aynı anda yalnız bir videonun düğmeleri (C14b §4b-5 değişmez kural).
3. Model seçimi web ile aynı kural: options'ta tek model (bugün Wan 3.0) → seçici yok, "Wan 3.0 · sesli" satırı.
4. Sonuç düğmeleri: mesaj kutusundan → **"Galeriye kaydet"** + **"Kaydet ve gönder"**; profil/ortam görseli sayfasından →
   **"Galeriye kaydet"** + **"Kullan"**.
5. Bildirim YOK (bekleme notu metni web ile aynı).

## §1 Girişler
1. **Mesaj kutusu** (`ComposerHost` / `MessageComposer`; kanal + DM ortak): emoji düğmesinin yanında ✨ simgesi (Ionicons
   `sparkles-outline`). Kaydet ve gönder → `POST /ai-video/:id/attachment` → **mevcut mesaj gönderme yolu** (eki
   attachmentIds ile gönderen mevcut fonksiyonu bul; açık yanıt varsa web gibi yanıt olarak gider).
2. **`MediaSourceSheet`** (C22, dört hedef): üçüncü seçenek "Yapay zeka ile üret". Kullan → videoyu `expo-file-system` ile
   önbelleğe indir (presigned `videoUrl`, CORS mobilde yok) → mevcut hareketli kesit akışı (`AnimatedClipSheet`), galeriden
   seçilmiş bir video gibi (o akışın beklediği yerel dosya şeklini bul ve aynısını ver).

## §2 Sayfa içeriği (web `AiVideoDialog` + `AiVideoPreviewModal` + `AiVideoRecentList` + `AiVideoOptions` + `AiVideoCostBar` eşdeğeri)
- Form: (model satırı) · çözünürlük parçalı seçici · süre parçalı seçici · istem (çok satırlı) · görsel ekle (galeriden
  PNG/JPEG/WebP ≤ 10 MB; mevcut galeri seçici hook'u; `POST /ai-video/input/presign` + mevcut S3 PUT yardımcısı) ·
  alt şerit "Tahmini maliyet (N sn) · X $" + "Bugün X / Y $" + **Oluştur** (400 ms gecikmeli `estimate`, son istek kazanır,
  tavan aşılacaksa kapalı + neden).
- Üretim sürerken: ilerleme ("Sırada" / "Üretiliyor... N sn" / "Kaydediliyor...") + bekleme notu. Yoklama 4 sn; sayfa
  kapanınca durur; uygulama arka plandan dönünce yoklama sürer.
- Önizleme: video oynatıcı (mevcut `VideoCard`/`VideoViewer` oynatıcısı neyse), istem 2 satır, model · süre · çözünürlük,
  bağlama göre iki düğme + "Sil" (tehlike rengi, onaysız) + "Yeni üretim".
- Son üretimler: satırda düğme yok; çöp simgesi (QUEUED/RUNNING'de yok); "Temizle" mevcut onay penceresiyle (mobilde
  kullanılan Alert/onay bileşeni neyse). Tamamlanan satıra dokununca `GET /ai-video/:id` ile tazele → önizleme; süren
  satır → ilerleme; başarısız satır hata metniyle, dokunulmaz.
- Galeriye kaydet: mevcut `useSaveToGallery` (C15) `downloadUrl` ile. İzin reddi mevcut davranış.
- Önizleme 10 dk'dan eski açıldıysa düğme öncesi satırı tazele (web ile aynı).
- Hata metinleri hata koduna göre (web `aiVideo.errors.*` anahtarlarıyla aynı kodlar).

## §3 Rozet
`VideoCard.tsx`: `attachment.aiGenerated` ise sol üstte "✨ Yapay zeka" etiketi; mobil ek tipine `aiGenerated?: boolean`.
Bu rozet **tüm mobil kullanıcılara** görünür (yalnız oluşturma kapılı); vc33 öncesi sürümler rozetsiz gösterir (bilinen).

## §4 Metin / tema
Tüm metinler mobil i18n dosyasında (web `tr.json` `aiVideo.*` metinleriyle aynı Türkçe, kopyala-uyarla; uzun çizgi yok).
Renkler tema token'larından; karartma için D79 bekleyen `rgba` gömmesini çoğaltma, mevcut tema sabiti varsa onu kullan.
Gerçek güvenli alan (inset) kullan, sabit dolgu yok (cihaz farkı dersi). Klavye açılınca istem alanı görünür kalmalı.

## §5 DoD
- [ ] typecheck + lint temiz
- [ ] `versionCode` 32 → 33 (`app.json`)
- [ ] Sahip cihaz turu (telefon): üret → önizleme → Galeriye kaydet → Kaydet ve gönder (rozetli) → Kullan (profil) ·
  sil / Temizle · klavye + üç tuşlu gezinme çubuğunda alt şerit görünür · aiVideoAllowed=false hesapta giriş yok
- [ ] Release AAB canlı sunucuya karşı cihazda denenir (release yapılandırması dersi), sonra Play

## §6 Sapma kuralı
api imzaları değişmez. Mobilde eşdeğer bileşen/hook bulunamazsa dev durur, raporlar.
