# Sprint M4k — Kullanıcı Limiti ve Bit Hızı Kaydırmalı Olsun

> **Tier:** yalnız `mobile/`. `api/` sıfır · `web/` sıfır · **yeni bağımlılık YOK, native diff YOK.**
> **Kaynak:** sahip 2026-08-08 — "kullanıcı sayısı ile bit hızı normal input olmuş, web'deki gibi
> kaydırmalı olmalı."

## §1 Kapsam
`src/app/(app)/channel-edit.tsx`teki **Kullanıcı Limiti** ve **Bit Hızı** alanları sayı kutusundan
**kaydırıcıya** çevrilir. Diğer alanlar (ad · yavaş mod · medya · özel · 18+) **değişmez**.

## §2 🔴 Bağımlılık eklenmeyecek
`@react-native-community/slider` **kurulmayacak** — native paket, yeni derleme demek ve sahip yeni
derleme aldı. Bu kod tabanında emsal var: `src/components/home/VoiceChannelSheet.tsx` sürüklemeyi
`PanResponder` ile saf JS yapıyor ve yorumunda gerekçesini yazıyor. Aynı yol izlenecek.

Kaydırıcı **tekrar kullanılabilir küçük bir bileşen** olarak yazılır (iki yerde kullanılıyor: limit +
bit hızı). Üçüncü bir kullanım aramaya gerek yok, bu zaten iki kullanımlı ortak bir kontrol.

## §3 Davranış
- **Kullanıcı Limiti:** 0-99, tam sayı. `0 = sınırsız` (mevcut `channel.userLimitHint` metni korunur).
- **Bit Hızı:** 8-96 kbps (sunucudaki `@Min`/`@Max` ile birebir), mevcut `channel.bitrateHint` korunur.
- Seçili değer kaydırıcının yanında **sayı olarak** görünür (web de gösteriyor).
- Dokunma hedefi D37 dersine uygun olsun; ince bir çizgiyi tutturmaya çalıştırma.
- Değerler `onSave`de bugünkü gibi sunucu sınırlarına kırpılmaya devam eder (savunma derinliği).

## §4 DoD
- [ ] `npm run typecheck` · `npm run lint` temiz
- [ ] `api/`+`web/` diffi sıfır · `package.json` değişmedi · native diff yok
- [ ] Cihazda: iki alan da kaydırılabiliyor, değer okunabiliyor, kaydedince sunucuda kalıyor
- [ ] Metin kanalında bu alanlar hâlâ **görünmüyor** (M4g §3 fail-closed bozulmadı)

## §5 Dev'e notlar
1. `channel-edit.tsx` DIŞINDA yalnız yeni kaydırıcı bileşeni dosyasına dokun. Başka bir oturum aynı
   anda `mobile/` içinde çalışıyor — `call.tsx`, `stores/voice.ts`, `src/api/voice.ts` **senin değil**.
2. Cihaz testi yapma, commit atma.
