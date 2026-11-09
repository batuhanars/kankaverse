# SPRINT C54: Etiketli mesajı düzenlerken ham token görünmesin (D88)

> Durum: **TASARIM KİLİTLİ (2026-11-09).** PM compose (Opus). Sahip bulgusu. **web + mobil.** API değişikliği YOK.
> R7 dışı. Mobil kısmı vc60'a girer (Play'e henüz yüklenmedi).

## §0 Sorun
Mesaj içeriği etiketleri kimlikle saklar: kullanıcı `<@userId>`, rol `<@&roleId>` (kullanıcı adı değişse de etiket doğru kişiyi gösterir). Görüntülemede `@ad`'a çözülüyor. **Düzenleme kutusu ham metni açıyor**, kullanıcı `<@cmq...>` görüyor. Web (masaüstü dahil) ve mobilde aynı.

## §1 Kural (iki istemcide aynı)
1. **Düzenlemeye girerken:** içerikteki `<@userId>` → `@kullanıcıAdı`, `<@&roleId>` → `@rolAdı`. Ad, görüntülemede zaten kullanılan çözümleme kaynağından alınır (mesajın `mentions`/üye/rol verisi; o istemcide görüntüleme neyi kullanıyorsa o, ikinci bir çözümleme yazılmaz). Çözülemeyen token (silinmiş kullanıcı/rol) **olduğu gibi kalır** (kaydederken kaybolmasın).
2. **Kaydederken:** metin, **yeni mesaj gönderirken kullanılan aynı yoldan** token'a geri çevrilir. Composer'da `@ad` → `<@id>` çevirisi nasıl yapılıyorsa düzenlemede de o fonksiyon çağrılır (kopya yok). Composer'ın çevirisi bir öneri listesinden seçime dayanıyorsa (seçilen etiketlerin haritası), düzenleme başlarken §1.1'de çözülen etiketler o haritaya **önceden doldurulur**, böylece kullanıcının dokunmadığı etiketler geri token olur.
3. Kullanıcı düzenlerken yeni etiket ekleyebiliyorsa (composer'daki öneri listesi düzenlemede de çalışıyorsa) davranış composer'la aynı; çalışmıyorsa bu sprintte EKLENMEZ, yalnız mevcut etiketler korunur.
4. `@everyone` / `@here` metin olarak kalır (bugünkü gibi).
5. Değişiklik yapılmadan kaydedilirse içerik birebir aynı token'larla gider (gereksiz "düzenlendi" yok; mevcut "içerik aynıysa gönderme" kuralı varsa korunur).

## §2 Web
Düzenleme bileşeni + composer'ın etiket çevirisi. Değiştirmeden önce render eden bileşenin kullanıldığı teyit edilir (ölü eş bileşen tuzağı). DoD: `npx vue-tsc -b` (6 bilinen hata dışında yok), dokunulan dosyalarda eslint, `npx vite build`. Sahip turu: kullanıcı ve rol etiketli mesajı düzenle → `@ad` görünür; bir kelime değiştirip kaydet → etiketler hâlâ tıklanabilir/vurgulu, bildirimi bozmaz.

## §3 Mobil
Aynı kural, mobil düzenleme akışında. vc60 (versionCode değişmez). DoD: `npm run typecheck`, `npm run lint`.

## §4 Kapsam dışı
Sunucu değişikliği, zengin metin düzenleyici, düzenlemede yeni etiket önerisi (composer'da varsa ve düzenleme aynı bileşeni kullanıyorsa kendiliğinden gelir; yoksa eklenmez).
