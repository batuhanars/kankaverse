# Sprint R20 — enum-ADMIN Katmanının Kaldırılması

> **Kaynak:** sahip sorusu 2026-08-11: "yetkileri rol üzerinden yönetiyoruz, rol dışında neden
> yönetici yetkisi var". Kod sahibi doğruluyor — `permissions.service.ts:11` bu katmanı zaten
> **"enum geçiş-uyum"** diye etiketlemiş, yani baştan geçici olması düşünülmüş.
> **Tier'lar:** §1 `api/` · §2 `web/` · §3 `mobile/`. Ayrık, paralel yapılabilir.
> 🔴 **Baştan sona R7 yüzeyi.** Sekiz yetki kararına dokunuluyor. Diff sahibin satır satır
> onayından geçmeden merge edilmez.

## §0 Neden

Bugün canlıda **sessiz bir yetki yükselmesi** yaşandı: sahiplik A→B→A gidip gelince B kalıcı
ADMIN kaldı, verilen özel rolün geri alınması ona dokunmadı. Kök neden tekil bir hata değil,
**iki paralel yetki sisteminin** var olması: rol sistemi doğru çalışıyordu, yetki kalıntısı enum'dan
geldi.

Kaldırma tutarlı, çünkü rol sistemi karşılığını zaten sunuyor: `common/permissions.ts`'teki
`ADMINISTRATOR` bayrağı, taşıyan rolü tüm izinlere sahip sayıyor. "Birini tam yetkili yap" ihtiyacı
rolle karşılanır; enum'a gerek yok.

**Kalan tek ayrıcalıklı katman `OWNER` olacak** — ortam silme, sahiplik devri, rol yönetimi gibi
devredilemez işler ona bağlı kalır.

## §0.1 🔴 Kaldırma sırasında BOZULMAMASI gereken şey

`role === 'OWNER' || role === 'ADMIN'` kontrollerini `role === 'OWNER'`'a indirgemek **YETMEZ ve
YANLIŞTIR**. Böyle yaparsan **rolüyle yönetici olan** kullanıcılar yetkisiz kalır — bugün çalışan
meşru bir yolu kırarsın.

Doğrusu: enum kısa devresi kalkar, karar **izin sistemine** devredilir (sahiplik + `ADMINISTRATOR`
bayrağı + rollerin izin birleşimi). Her dokunduğun yerde kendine şunu sor: *bu kontrol "ADMIN mi"
diye mi soruyor, yoksa "şu işi yapabilir mi" diye mi?* İkincisine çevir.

---

## §1 `api/` — 🔴 R7

### 1.1 Yetki kontrolleri

| Dosya | Satır (yaklaşık) | Bugün |
|---|---|---|
| `shared/permissions/permissions.service.ts` | 11 (yorum), 56, 117 | ADMIN → tüm izinler / sınırsız hiyerarşi |
| `modules/channels/channels.service.ts` | 87, 156, 566 | `role === 'OWNER' \|\| role === 'ADMIN'` |
| `modules/messages/messages.service.ts` | 344, 915 | aynı kalıp |
| `shared/membership/membership.service.ts` | 94 | aynı kalıp |

Her biri §0.1'e göre ele alınacak. `permissions.service.ts` bu hesabın **tek doğruluk kaynağı**;
diğer dosyalar mümkün olduğunca oradan beslensin, kendi kopyasını üretmesin (bugünkü kopyala-yapıştır
kalıbı zaten bu kusurun zeminiydi).

### 1.2 Uç ve DTO

- `PATCH /guilds/:id/members/:userId/role` **kaldırılır** (controller + service + Swagger).
- `modules/guilds/dto/update-member-role.dto.ts` ve `AssignableGuildRole` **silinir**.
- Sebep: geriye atanabilir tek değer kalmıyor. Rol vermek artık rol sisteminin işi.

### 1.3 Sıralama

`guilds.service.ts:94` `ROLE_ORDER` iki değere iner (OWNER, MEMBER). Üye listesi sıralaması
bozulmamalı.

### 1.4 Şema ve migration

`schema.prisma` → `enum GuildRole { OWNER MEMBER }`.

🔴 **Migration iki adımlı olmak ZORUNDA ve sırası önemli:**
1. Önce veri: `UPDATE "GuildMember" SET role='MEMBER' WHERE role='ADMIN'`
2. Sonra tip: enum değerinin kaldırılması.

Postgres enum'dan değer düşürmek tipin yeniden yaratılmasını gerektirir. Prisma'nın ürettiği SQL'i
**oku ve doğrula**; veri adımı tip adımından ÖNCE olmalı, yoksa migration üretimde patlar.

🔴 Migration **üretilip DB'ye uygulanacak** ve `npx prisma migrate status` temiz dönecek. Build ve
testler (mock Prisma) bunu yakalamaz.

### 1.5 Testler

ADMIN'i ayrıcalıklı sayan her test gözden geçirilecek. **Testi "geçsin diye" değiştirme;** beklentiyi
yeni ve doğru davranışa göre yaz. En az bir yeni test: *`ADMINISTRATOR` bayraklı role sahip üye,
enum'u MEMBER olmasına rağmen yetkili sayılır.* Bu §0.1'in regresyon kalkanı.

---

## §2 `web/`

- `composables/useGuildPermissions.ts:58` — `enumRole === 'ADMIN'` dalı kalkar. Sahiplik ve
  `ADMINISTRATOR` dalları **kalır**; §0.1 gereği rolüyle yönetici olan yetkisini kaybetmemeli.
- Üye listesinde/kartlarda enum'dan gelen "Yönetici" rozeti/etiketi varsa kaldırılır ya da rol
  rozetine devredilir. **Ara: `'ADMIN'` geçen her yeri tara**, tek satır bırakma.
- i18n: karşılıksız kalan anahtarlar temizlenir. 🔴 Kaçırılmamış `@` koyma.

## §3 `mobile/`

- `src/api/guilds.ts` — `setMemberRole` **silinir**.
- `src/app/(app)/guild-member.tsx` — rol değiştirme arayüzü **kaldırılır**.
- 🔴 `src/app/(app)/(tabs)/home.tsx` — `canManage` ve `menuGuildCanManage` bugün enum'a bakıyor
  (`myRoleByGuild`). §0.1 gereği **izin sistemine** çevrilecek. Depoda doğru yol zaten var:
  `useGuildPermission(guildId, ...)` (sahiplik + `ADMINISTRATOR` + rol birleşimi hesaplıyor,
  enum'a hiç bakmıyor).
  ⚠️ O kanca istek atıyor; iki ortam için (seçili + menü) çağrılacağını hesaba kat, gereksiz
  istek üretme. Mevcut `myRoleByGuild` altyapısı gereksizleşiyorsa **sadeleştir**, ama menü
  yetkisi yanlış hesaplanacaksa DUR ve PM'e bildir.
- `'ADMIN'` geçen kalan yerleri tara.

---

## §4 Doğrulama

| Tier | Komutlar |
|---|---|
| `api/` | `npm run build` · `npm test` · `npx prisma migrate status` (temiz) |
| `web/` | `npx vue-tsc -b` (bilinen 6) · dokunduğun dosyalarda `npx eslint` · `npx vite build` |
| `mobile/` | `npm run typecheck` · `npm run lint` |

🔴 `web/` depo geneli lint yeşil dönmez (D64, dondurulmuş borç). Toplu `--fix` çalıştırma.

Tarayıcı/cihaz doğrulaması **sahipte**. "Çalışıyor" beyanı üretme.

## §5 Dağıtım notu (PM → sahip, dev'in işi değil)

Üretime çıkmadan önce canlı veritabanında `GuildMember` içinde `role='ADMIN'` kaç kayıt var
bakılacak. Sahip 2026-08-11'de "kitle yok, bu durumu sadece ben yaşadım" dedi; migration bu varsayıma
dayanıyor. Sayı beklenenden büyük çıkarsa **dur**, göç planı yeniden konuşulur.

## §6 Sapma kuralı

Kendi tier'ının dışına dokunma. Sapma ihtiyacı doğarsa **DUR, PM'e bildir.** Özellikle: bir yetki
kontrolünü sadeleştirirken davranışın değiştiğini fark edersen sessizce karar verme, sor.
