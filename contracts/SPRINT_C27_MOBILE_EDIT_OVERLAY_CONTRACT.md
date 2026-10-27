# SPRINT C27: Mobilde mesaj düzenleme ortada açılan ekranda (WhatsApp deseni)

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Sahip fikri. **Yalnız mobil (JS)**, vc31.
> **R7-nötr:** düzenleme ucu, yetki (yalnız yazar) ve doğrulama değişmez; yalnız arayüz.
> Yanıt (alıntı) **değişmez**, mesaj kutusunun üstündeki şerit olarak kalır (PM + sahip kararı: yanıt yazarken sohbet
> görünür kalmalı, arka arkaya yanıt hızlı olmalı).

## §0 Kararlar
1. **Giriş:** eylem sayfasındaki **Düzenle** ve **sola kaydırma** (C23 eki) aynı ekranı açar. Mesaj kutusunun
   düzenleme modu (`editing` + kutuya içerik doldurma) **kalkar**.
2. **Görünüm:** tam ekran kaplama, arka plan karartılmış (sohbet arkada bulanık değil, yalnız karartma; tema tokenı).
   Üst/orta bölgede düzenlenen mesajın **gerçek balonu** (`MessageBubble`, salt okunur: dokunuş/uzun basış/kaydırma
   kapalı), sohbetteki görünümüyle birebir (yazar, saat, ekler, alıntı). Altta klavyeye yapışık düzenleme alanı,
   mevcut içerikle dolu, imleç sonda, klavye otomatik açık. Başlık satırı: "Mesajı düzenle" + kapat (X).
   Uzun mesajda balon alanı kaydırılabilir; balon klavyenin arkasında kalmaz.
3. **Kaydet:** gönder düğmesi yerine onay (✓) düğmesi. İçerik değişmediyse ya da boşsa (ve mesajda ek yoksa) devre dışı.
   Bugünkü kurallar aynen: `messagesApi.edit`, bahsetme token dönüşümü (`applyMentionTokens`), `updateMessage`,
   hata metni alanın üstünde. Başarıda ekran kapanır.
4. **İptal:** X, Android geri tuşu/hareketi, karartılmış alana dokunma → değişiklik atılır, ekran kapanır. Onay sorulmaz.
5. **Taslak korunur:** düzenleme kendi state'inde tutulur; mesaj kutusunda yazılmakta olan metin, yanıt şeridi ve
   bekleyen ekler **dokunulmadan kalır** (bugün düzenlemeye geçmek kutudaki taslağı siliyordu, bu düzelir).
6. Emoji ekleme düğmesi düzenleme alanında olur (C23 `EmojiGifSheet`, GIF sekmesi kapalı). Bahsetme önerisi
   bugün düzenlemede çalışıyorsa korunur; çalışmıyorsa bu sprintte eklenmez.
7. i18n: yeni metinler `mobile.*` altında `web/src/i18n/tr.json`'a.

**OUT:** web (orada mesaj yerinde düzenleniyor) · yanıt akışı · düzenleme geçmişi · ek ekleme/çıkarma.

## §1 DoD
`npm run typecheck`, `npm run lint`. Sahip turu (telefon): Düzenle ve sola kaydırma ekranı açıyor; balon birebir;
klavye alanı örtmüyor (üç tuşlu gezinmede de); kaydet/iptal; kutudaki taslak korunuyor.
