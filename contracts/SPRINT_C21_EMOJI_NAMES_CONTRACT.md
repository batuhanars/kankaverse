# SPRINT C21: Kanal, kategori ve rol adlarında emoji

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Sahip isteği (Discord deseni). Sıra: **api → web + mobil.**
> Mobil yalnız JS, mağaza sürümü vc28. **R7-nötr:** izin/rol yetkisi mantığına dokunulmaz; rol emojisi yalnız görünüm.

---

## §0 Kararlar

1. **Kanal adı (metin ve ses):** Unicode emoji kabul edilir. Yazarken otomatik biçimlendirme (Discord deseni):
   boşluk → `-`, büyük harf → küçük (`toLocaleLowerCase('tr')`, I→ı, İ→i), art arda tireler teke iner. Emoji ile
   metin arasındaki boşluk da tire olur (`📢 duyurular` → `📢-duyurular`). Baştaki/sondaki tire kaydederken temizlenir.
   - Sunucu kuralı: izinli karakterler `a-z 0-9 ç ğ ı ö ş ü -` + emoji (Extended_Pictographic, ZWJ, VS16, ten rengi
     ve bayrak dizileri). **En az bir harf ya da rakam şart** (yalnız emoji/tire ad yok).
   - Uzunluk **görünen karaktere** (grapheme, `Intl.Segmenter`) göre: en az 2, en fazla 50.
   - Sunucu da aynı normalleştirmeyi uygular (istemciye güvenilmez), sonra doğrular.
2. **Kategori adı:** sunucu zaten serbest metin kabul ediyor (emoji dahil). **Boşluk korunur, tire dönüşümü YOK**
   (Discord'da da öyle). Yalnız istemciye emoji düğmesi. Uzunluk kuralı da grapheme'e çevrilir (50).
3. **Rol emojisi:** `Role.unicodeEmoji String?` (tek grapheme, yalnız emoji; boş = yok). Görsel rol simgesi (`iconUrl`,
   mevcut ama kullanılmıyor) **kapsam dışı**: yükleme yüzeyi, ileride premium + C2 ile.
   - Gösterim: üyenin **emojisi olan en yüksek pozisyonlu** rolünün emojisi, adın hemen sağında. Yüzeyler: mesaj
     yazar satırı, ortam üye listesi, profil kartındaki rol rozeti. Web + mobil.
   - DTO: `RoleDto.unicodeEmoji`; üye ve mesaj yazarı DTO'larında hazır hesaplanmış `roleEmoji: string | null`
     (istemci rol listesinden hesaplamasın; tek kaynak sunucu). Mesaj yazar DTO'sunda bunu ortam kanalı için hesapla,
     DM'de null.
4. **Ortak emoji düğmesi:** web'de bir `EmojiInsertButton` bileşeni (mevcut `vue3-emoji-picker`), mobilde bir
   bileşen (mevcut `rn-emoji-keyboard`). Seçilen emoji imleç konumuna eklenir (web), mobilde sona eklenir
   (RN'de imleç konumu güvenilir değilse). Kullanım: kanal adı (oluştur + düzenle), kategori adı (oluştur + düzenle),
   rol emojisi (rol düzenleme; seçili emoji + "kaldır").
5. **Kırılmaması gerekenler:** `#kanal` bahsetme ayrıştırma/otomatik tamamlama, kanal araması, bildirim/push başlıkları,
   Discord içe aktarma (`normalizeChannelName`) yeni kurala uyumlu kalmalı. Kategori başlığı web'de CSS `uppercase`
   ile çiziliyor: Türkçe büyük harf için kapsayıcıda `lang="tr"` olduğundan emin ol (i→İ).

**OUT:** görsel rol simgesi · özel (yüklenen) emoji (C2) · kategori adında tire dönüşümü · ses kanalında boşluk/büyük harf serbestliği.

## §1 Şema
`Role.unicodeEmoji String?` + migration, yerelde uygulanır, `migrate status` temiz.

## §2 Backend
- Ortak yardımcı: `normalizeChannelName(input)` + `isValidChannelName(name)` + `graphemeLength(s)` + `isSingleEmoji(s)`
  (tek dosya, testli). Kanal oluştur/güncelle DTO'ları `@Matches` yerine bu yardımcıyı kullanır (Transform + özel
  doğrulayıcı). Hata mesajları Türkçe, güncel kurala göre.
- Kategori DTO'larında uzunluk grapheme'e.
- Rol oluştur/güncelle: `unicodeEmoji` (null ile kaldırma). `isSingleEmoji` değilse 400.
- `roleEmoji` hesaplaması üye listesi ve mesaj yazar seçiminde tek yerde.
- Testler: normalleştirme tablosu (boşluk, büyük İ/I, emoji+boşluk, çoklu tire, baş/son tire), geçersizler (yalnız
  emoji, 1 grapheme, 51 grapheme, yasak karakter), ZWJ/ten rengi/bayrak emojileri 1 grapheme sayılıyor, rol emojisi
  doğrulaması, `roleEmoji` en yüksek pozisyonlu emojili rolden geliyor.

## §3 Web
- Kanal adı alanları: yazarken §0.1 normalleştirmesi (aynı kural, istemci kopyası `utils/channelName.ts`; sunucu
  otoritedir). Emoji düğmesi.
- Kategori alanları: emoji düğmesi.
- Rol düzenleme: emoji seçici + kaldır; rol listesinde emoji önizlemesi.
- Gösterim: mesaj yazar adı, üye listesi, profil kartı rol rozeti.
- i18n, uzun çizgi yok.

## §4 Mobil (yalnız JS)
- `channel-new.tsx`, `channel-edit.tsx`: normalleştirme + emoji düğmesi.
- Kategori oluştur/düzenle ekranı: emoji düğmesi.
- `role-edit.tsx` / `role-new.tsx`: emoji seçimi.
- Gösterim: mesaj yazar adı, üye listesi, profil kartı.
- Dar listede uzun emojili kanal adı tek satırda kesilir (taşma yok).

## §5 DoD
- [ ] §1 şema + migration
- [ ] §2 api + testler
- [ ] §3 web
- [ ] §4 mobil
- [ ] build/test: api `tsc --noEmit` (bilinen 2) + jest; web `vue-tsc -b` (bilinen 6) + eslint dokunulan + `vite build`;
      mobil typecheck + lint
- [ ] Sahip turu: web + mobil (dev build) kanal `Oyun Odası` yazınca `oyun-odası`; emojili kanal/kategori; rol emojisi
      mesajda ve üye listesinde; (`#kanal` bahsetme ayrıştırması projede yok, `#` yalnız görsel önek: madde düştü)
- [ ] Mağaza sürümü vc28

## §6 Sapma kuralı
**DUR:** izin/yetki mantığı değişikliği · görsel rol simgesi · yeni paket · mevcut kanal adlarını toplu değiştiren veri
göçü (mevcut adlar yeni kurala zaten uyuyor olmalı; uymayan çıkarsa raporla, dokunma).
