# SPRINT C24: Düzenlenebilir hızlı tepkiler + seçicide sık kullanılanlar

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Sahip isteği. Sıra: **api → web + mobil (paralel).**
> Mobil yalnız JS, C23 ile aynı mağaza sürümü (vc31). **R7:** oturum kullanıcısı DTO'suna (`toUserDto`, auth katmanı)
> tek alan eklenir → diff sahip onayına sunulur. Yetki/oturum mantığı değişmez.

---

## §0 Neden ve kararlar

**Sorun:** hızlı tepki şeridi (👍 ❤️ 😂 😮 😢) iki istemcide sabit; emoji seçicide kalıcı "sık kullanılanlar" yok
(mobilde kapalı, web'de yalnız bellekte, yenileyince sıfırlanıyor).

**Kilitli kararlar:**
1. **Hızlı tepkiler hesaba bağlı, düzenlenebilir** (WhatsApp deseni). Varsayılan bugünkü beşli. Kullanıcı 5 yuvadan
   herhangi birine dokunur → emoji seçici → o yuva değişir. "Varsayılana dön" var. Web ve mobil aynı listeyi görür.
2. **Varsayılanın tek kaynağı sunucu.** Sunucu her zaman **etkin** listeyi döner (kayıt yoksa varsayılan beşli). İstemcilerdeki
   iki `QUICK_EMOJIS` sabiti kalkar (bugünkü "iki liste birlikte değişir" kopyası biter).
3. **Düzenleme girişi:**
   - Web: Kullanıcı Ayarları'nda "Hızlı tepkiler" bölümü (uygun mevcut sekme; yeni sekme açma).
   - Mobil: mesaj eylem sayfasındaki hızlı tepki satırının sonunda küçük kalem düğmesi → düzenleme ekranı/sayfası.
     Ayrıca mobil ayarlar akışında uygun bir yerden aynı ekrana giriş (yeni ekran açılacaksa tek ekran, iki giriş).
4. **Seçicide "Sık kullanılanlar"** en üstte, web + mobil. **Cihazda** tutulur (web `localStorage`, mobil AsyncStorage;
   backend yok). Sayım: mesaja eklenen emoji + verilen tepki. Sıralama sıklık × yakınlık (eski kullanımlar zamanla
   ağırlık kaybeder; ör. her kullanımda puan +1, okurken yaş çarpanı). En fazla bir satır/iki satır (~16). Boşsa bölüm görünmez.
   Mobilde `rn-emoji-keyboard`ın kendi recent mekanizması bu sıralamayı veriyorsa onu kullan; vermiyorsa küçük yardımcı yaz.
   Web'de kütüphanenin bellek-içi "recent" grubu yerine bu liste gösterilir (iki ayrı "son kullanılan" olmasın).
   Tepki seçici ve mesaj kutusu seçicisi **aynı** listeyi okur/yazar (istemci başına tek yardımcı).
5. Hızlı tepki şeridi sık kullanılanlardan **otomatik dolmaz** (sahip kararı: varsayılan + elle düzenleme).

**OUT:** sık kullanılanların cihazlar arası senkronu · özel/ortam emojisi · şerit uzunluğunu değiştirme (5 sabit).

## §1 Backend
- Prisma `User.quickReactions String[] @default([])`. Migration oluştur **ve uygula**; `prisma migrate status` temiz.
- `PATCH /users/me` (`UpdateProfileDto`): `quickReactions?: string[]`. Doğrulama: **ya boş dizi (= varsayılana dön)
  ya tam 5 eleman**; her eleman tek emoji (grafem), boş değil, en fazla 32 karakter (ZWJ/ten rengi dizileri), harf/rakam
  içermez; tekrar yok. Hata → 400 Türkçe mesaj.
- Varsayılan sabit tek yerde (`DEFAULT_QUICK_REACTIONS = ['👍','❤️','😂','😮','😢']`). Oturum kullanıcısı DTO'su
  (`toUserDto`) `quickReactions: string[]` döner = kayıtlıysa o, değilse varsayılan. PATCH yanıtı da güncel DTO.
- OpenAPI. Test: varsayılan dönüşü, kayıt, boş diziyle sıfırlama, 4/6 eleman reddi, tekrar reddi, emoji-olmayan reddi.

## §2 Web
- Tip: `User.quickReactions: string[]`. `MessageActionsMenu.vue` sabit yerine oturum kullanıcısından okur.
- Ayarlar bölümü (§0.3): 5 yuva, yuvaya tık → mevcut `EmojiPicker` → `PATCH /users/me`; "Varsayılana dön" (boş dizi).
  Kaydedince store güncellenir, şerit anında değişir.
- Sık kullanılanlar (§0.4): `web/src/utils/` altında tek yardımcı; mesaj kutusu seçicisi + tepki seçicisi yazar/okur.
- i18n; `vue-tsc -b` (bilinen 6 hata dışında yeni yok), lint, build; 390/320px'te taşma yok.

## §3 Mobil
- Tip + `MessageActionSheet` sabiti kalkar, oturum kullanıcısından okur.
- Düzenleme ekranı/sayfası (§0.3), aynı `PATCH`; kaydedince oturum kullanıcısı güncellenir.
- Sık kullanılanlar (§0.4): C23'ün `EmojiGifSheet` emoji sekmesi + `MessageActionHost` tam tepki seçicisi aynı listeyi kullanır.
- i18n; `tsc --noEmit`, lint. versionCode 31 kalır (C23 ile aynı sürüm).

## §4 DoD
- api: build, test, `migrate status` temiz; R7 diff (`toUserDto`) sahip onayı.
- Sahip turu: web'de düzenle → mobilde aynı şerit; sık kullanılanlar iki seçicide de en üstte.
