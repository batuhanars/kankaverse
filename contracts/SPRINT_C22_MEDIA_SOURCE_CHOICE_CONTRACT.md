# SPRINT C22: Görsel mi, GIF/video mu? Seçim penceresi

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Sahip isteği. Sıra: **api (küçük) → web + mobil.**
> Mobil yalnız JS, mağaza sürümü vc29 (vc28 yayına çıktıktan sonra). **R7-nötr:** yükleme hattı, yetki ve takedown
> değişmez; yalnız giriş noktası ve bir okuma alanı.

---

## §0 Neden ve kararlar

**Sorun:** hareketli yükleme (C13/C19) durağan yüklemeyle aynı dosya seçicinin içinde, hiçbir yerde "GIF/video da
olur" yazmıyor. Sahibin arkadaşı özelliği bulamadı. Ayrıca ileride hareketli yükleme ücretli olacak (`canCreateAnimated`
tek kapı) ve bunu gösterecek ayrı bir yer yok.

**Kilitli kararlar:**
1. **Dört yerde aynı akış:** profil fotoğrafı, profil afişi, ortam simgesi, ortam afişi. Web + mobil.
2. **"Değiştir" düğmesi önce seçim penceresi açar** (web: küçük modal; mobil: alttan açılan sayfa). Seçenekler:
   - **Görsel yükle**: alt metin "PNG, JPEG veya WebP". Seçici YALNIZ statik türleri kabul eder → mevcut
     konumlandırma (`MediaPositioner`).
   - **GIF / video yükle**: alt metin "Hareketli, en fazla 6 saniye". Seçici YALNIZ GIF + video kabul eder → mevcut
     kesit akışı (`AnimatedClipModal` / `AnimatedClipSheet`).
   - **Kaldır**: yalnız mevcut bir görsel varsa, tehlike rengiyle.
   Seçenek başında simge (görsel / film), Discord deseni. Pencere başlığı hedefe göre: "Profil fotoğrafını değiştir",
   "Ortam afişini değiştir" vb.
3. **Kapı istemciye görünür:** sunucu `animatedAllowed: boolean` döner (oturum kullanıcısının DTO'sunda,
   `canCreateAnimated` ile hesaplanır, kullanıcı başına). İstemci bugünkü "hata gelince kapat" (`animatedDisabled`)
   tahminini bu alanla değiştirir. `false` iken "GIF / video yükle" **görünür ama kapalı**, alt metin "Şu an kullanılamıyor"
   (ileride abonelik sprintinde metin/kilit simgesi değişir; bugün kilit/premium ibaresi YOK, boş iskele koyma).
   Sunucu yine otoritedir, istemci kapısı yalnız arayüz.
4. **Bulunabilirlik:** seçim penceresinin kendisi çözüm. Ek olarak hareketli seçeneğin yanında küçük "Yeni" etiketi,
   **14 gün** sonra kendiliğinden kalkar (sabit tarih `2026-11-10`, kod içinde tek sabit). Duyuru/bildirim yok.
5. Mevcut akışlar (konumlandırma, kesit, kaldırma, hata metinleri) **değişmez**; yalnız girişleri bu pencereye taşınır.

**OUT:** abonelik/kilit · GIF kütüphanesi (Tenor/Giphy arama) · yeni yükleme türü · hat değişikliği.

## §1 Backend
- Oturum kullanıcısı DTO'suna (`toUserDto` yolu; `/auth/me` ve oturum açılış yanıtı) `animatedAllowed: boolean`.
  `AnimatedMediaService.canCreateAnimated` tek kaynak; DTO yardımcısı servisi çağıramıyorsa çağıran katmanda doldur.
  OpenAPI.
- Test: bayrak açık/kapalıyken alan doğru.

## §2 Web
- Ortak bileşen `components/shared/MediaSourceDialog.vue` (başlık, iki seçenek, isteğe bağlı kaldır, `animatedAllowed`).
- `UserSettingsView.vue` (avatar + afiş) ve `GuildMediaSection.vue` (simge + afiş) bu bileşeni kullanır; iki ayrı gizli
  `<input type=file>` (statik / hareketli accept). `UserSettingsView.vue` 973 satır: yeni mantık oraya eklenmez,
  bileşene ya da composable'a gider.
- `animatedDisabled` tahmini kalkar, `authStore.user.animatedAllowed` okunur.
- i18n `media.source.*`. Uzun çizgi yok. 390/320.

## §3 Mobil (yalnız JS)
- Ortak alttan sayfa bileşeni (mevcut sheet desenleri: `AddGuildSheet` gibi).
- `pickProfileMedia(allowAnimated)` ikiye ayrılır ya da tür parametresi alır (yalnız statik / yalnız hareketli).
  `profile-edit.tsx` ve `useGuildMediaEdit.tsx` sayfayı açar.
- `animatedOff` tahmini yerine `animatedAllowed`.
- Simgeler Ionicons (`image-outline`, `film-outline`, `trash-outline`).

## §4 DoD
- [ ] §1 api alanı + test
- [ ] §2 web: dört giriş noktası pencereden, statik/hareketli seçiciler ayrı
- [ ] §3 mobil: dört giriş noktası sayfadan
- [ ] build/test: api `tsc --noEmit` (bilinen 2) + jest; web `vue-tsc -b` (bilinen 6) + eslint dokunulan + `vite build`;
      mobil typecheck + lint
- [ ] Sahip turu: dört yer × (görsel, GIF, video, kaldır), web + mobil; `ANIMATED_PROFILE_ENABLED=false` iken seçenek kapalı
- [ ] Mağaza sürümü vc29

## §5 Sapma kuralı
**DUR:** yükleme hattı/yetki/takedown değişikliği · yeni paket · kilit/premium arayüzü · mevcut konumlandırma veya
kesit davranışında değişiklik.
