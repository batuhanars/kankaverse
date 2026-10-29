# SPRINT C31d: Mobil kanka şeridinde oyun kartı + profil paneli

> Durum: **SÖZLEŞME YAZILDI + SAHİP ONAYI (2026-10-29).** PM compose (Opus). **Yalnız mobil.** R7-nötr (görünürlük sunucuda,
> istemci yalnız gelen veriyi gösterir). Referans: Discord mobil "Mesajlar" ekranı ekran görüntüsü (bilgi düzeni, kendi token'larımız).
> C33 ile aynı sürüme (vc39) girer; versionCode'a bu sprint dokunmaz.

---

## §1 DM ekranı başlığı
- `mobile/src/app/(app)/dm/[id].tsx` başlığındaki oyun satırı KALDIRILIR (sahip: orası sohbet alanı). Profil kartındaki (ProfileSheetBody)
  oyun bilgisi ve üye satırları kalır.

## §2 Kanka şeridi oyun kartı (DM listesinin üstündeki şerit; dev render eden bileşeni doğrular, ad muhtemelen `FriendsStrip`)
1. Oyun oynayan kanka için **geniş kart**: solda kare oyun logosu kutusu (`iconUrl` varsa görsel, yoksa aynı kutuda oyun kolu simgesi),
   sağında avatar, avatarın altında kullanıcı adı ve oyun adı (tek satır, kırpma). Kartın **sağ üst köşesinde** küçük oyun kolu simgesi,
   **yeşil değil** (ikincil yazı rengi). Kart yüksekliği şeritteki diğer kartlarla aynı.
2. Oynamayan kanka bugünkü gibi yalnız avatar.
3. Sıralama: oynayanlar şeridin başında (kendi aralarında bugünkü sıra), sonra diğerleri.
4. Logo için mobil activity store'a `iconUrl` eklenir (`activity:update` `game.iconUrl`, snapshot `gameIconUrl`; C31c sunucuda gönderiyor).
   Görsel `expo-image` ya da depoda kullanılan mevcut görsel bileşeniyle; yeni bağımlılık yok.

## §3 Şeritte dokunma
- Avatar/karta dokununca **profil paneli** (mevcut alttan açılan profil, `ProfileSheetBody` kullanan sheet) açılır; doğrudan DM'e GİTMEZ.
  Panelin mevcut "Mesaj" eylemi DM'e götürür. Uzun basma davranışı varsa değişmez.

## §4 DoD
- `npm run typecheck` + `npm run lint` temiz. Metinler `web/src/i18n/tr.json`'dan, em dash yok. Tema token'ları `src/theme`.
- Sahip turu (fiziksel cihaz): kanka bir Steam oyunu açınca şeritte logolu geniş kart, logosuz oyunda kol simgesi; köşede gri simge;
  karta dokununca profil paneli; DM başlığında oyun yok.

**OUT:** web değişikliği · şeritte sesli kanal kartı · kartta yayın/katıl düğmesi.
