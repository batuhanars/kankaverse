# SPRINT C78: Mobilde ortam üyesine dokununca profil kartı

> Durum: **AÇIK (2026-11-26).** PM compose (Opus). Yalnız mobile. api/web değişmez. Native yok.

## §0 Sahip bulgusu (2026-11-26)
Mobilde ortam üye listesinden (kanal detayları > Üyeler, ortam araması) bir üyeye dokununca açılan ekranda yalnız avatar,
ad ve roller görünüyor; mesaj gönderme, mesaj isteği, kanka ekleme gibi işlemler yok. Aynı kişiye sohbette avatarından
dokunulunca açılan profil panelinde (`ProfileSheet`) bu işlemler VAR. Masaüstünde üye kartı (`UserCardPopover`) hepsini sunuyor.
Kök: üye satırı doğrudan yönetim ekranına (`/guild-member`: rol, at, yasakla, sahiplik devri) gidiyor; o ekran yöneticiler
için tasarlanmış, normal kullanıcıya işlem sunmuyor.

## §1 Karar
- Üye satırına dokunma (`ChannelMembersTab`, `SearchResults` ve üyeyi açan diğer giriş noktaları; dev grep ile listeler)
  **sohbetteki avatarla aynı `ProfileSheet`'i** açar. Yeni kart/ekran yazılmaz; işlemler (mesaj / mesaj isteği ipucu,
  kanka ekle, tam profil, şikâyet, kendi profilim) tek yerden gelir. Masaüstü üye kartıyla aynı kapsam.
- Ortam bağlamı: sheet ortam içinden açıldığında kişinin o ortamdaki **rolleri** gösterilir (web kartındaki "Roller"
  bölümü). `ProfileSheet` bunu taşımıyorsa isteğe bağlı `guildId` prop'u ile eklenir; veri mevcut mobil ucundan
  (`/guild-member` ekranının kullandığı) alınır, yeni uç yazılmaz.
- Yönetici işlemleri: görüntüleyenin üyeyi yönetme yetkisi varsa (bugün `/guild-member`'ın kullandığı yetki koşulu,
  istemcide yeni kural kurulmaz) sheet'te "Üyeyi yönet" satırı çıkar ve mevcut `/guild-member` ekranını açar. Yetki yoksa
  satır YOK (boş yüzey açılmaz). Yetki kapısı sunucudadır; bu yalnız görünürlük.
- Kendine dokununca mevcut "kendi profilim" davranışı.
- i18n: yeni metin gerekiyorsa web `tr.json`'a (mobil kaynak) `mobile.*` altında; mümkünse web'deki mevcut anahtarlar
  (`member.actions.*`, `userCard.*`) kullanılır.

## §2 Kapsam dışı
Mobilde rozet/ses durumu gibi web kartının diğer zenginleştirmeleri (C10) sheet'te yoksa bu sprintte eklenmez.
Grup DM üye listesi (zaten ProfileSheet açıyorsa dokunulmaz).

## §3 Doğrulama
- `npm run typecheck`, dokunulan dosyalarda eslint.
- Sahip cihaz turu: (1) ortam üye listesinden kanka olmayan üyeye dokun: sheet açılır, "Mesaj gönder" mesaj isteği akışına
  gider. (2) Kanka olan üye: doğrudan DM. (3) Yöneticiyken başka üye: "Üyeyi yönet" görünür, yönetim ekranı açılır.
  (4) Yönetici değilken: satır yok. (5) Ortam aramasından üye: aynı sheet.
