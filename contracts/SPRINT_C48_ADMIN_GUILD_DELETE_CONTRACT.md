# SPRINT C48: Platform yöneticisi Keşfet'teki ortamı silebilir

> Durum: **TASARIM KİLİTLİ (2026-11-05).** PM compose (Opus). Sahip isteği. **api + web**. Mobil değişmez (mobilde admin yüzeyi yok).
> **R7:** platform-yönetici yetki yolu. Diff sahip onayına sunulur, onaysız merge yok.

## §0 Sorun ve karar
Play inceleme ekibi her AAB gönderiminde inceleme hesabıyla "test" ortamları açıp Keşfet'e açık bırakıyor. Sahip (platform yöneticisi)
bunları silemiyor; mevcut silme yalnız ortam sahibine (OWNER) açık.

**Karar:** platform yöneticisi (`isModerator`) herhangi bir ortamı silebilir. Silme mevcut soft-delete ile aynı (`deletedAt = now`), yani
DB'den geri alınabilir. Yeni şema yok, migration yok.

## §1 API
Envelope standart. Yeni controller `api/src/modules/guilds/admin-guilds.controller.ts` (ya da mevcut admin controller kalıbına uyan yer).
Kapı: `JwtAuthGuard` + `PlatformAdminGuard` (sınıf seviyesinde, mevcut admin controller'larla aynı).

`DELETE /admin/guilds/:id`
- Gövde yok. Dönüş `null` (200).
- Ortam yok ya da zaten silinmiş: 404 `GUILD_NOT_FOUND` ("Ortam bulunamadı.").
- Silme: `GuildsService` içinde yeni `adminDeleteGuild(actorId, guildId)`. `deleteGuild`'in OWNER denetimi YOK; geri kalan davranış
  (soft-delete + owner silmesinin yaptığı her yan etki, varsa soket yayını) birebir aynı olmalı. Ortak gövdeyi küçük özel bir
  fonksiyona çıkarmak serbest; owner yolunun davranışı DEĞİŞMEZ.
- AuditLog aynı işlemde: `action: 'admin.guild_delete'`, `entityType: 'guild'`, `entityId: guildId`,
  metadata `{ name, ownerId, discoverable }`.

Testler (`guilds.service.spec.ts` ya da yeni spec): siler + audit yazar; olmayan/silinmiş 404; owner yolu eskisi gibi OWNER ister.
Yetki: guard controller sınıfında; guard'ın kendisi mevcut ve test edilmiş.

## §2 Web (`views/discover/`)
1. `adminApi.deleteGuild(guildId)` (`web/src/api/admin.ts`).
2. `DiscoverGuildCard`: yalnız oturumdaki kullanıcı `isModerator` ise kartta bir sil düğmesi (çöp kutusu simgesi, mevcut ikon setinden).
   Tıklanınca kartın katıl/önizle davranışı tetiklenmez (`stop`).
3. Onay penceresi (`KvModal`, tarayıcı `confirm()` YASAK): ortam adı + "Bu ortam silinecek ve Keşfet'ten kalkacak." + İptal / Sil (danger).
4. Başarıda kart listeden düşer (yeniden çekmek ya da yerel çıkarmak serbest), toast ile bilgi. Hatada `response.data.message` gösterilir.
5. Tüm metinler `tr.json`'a (ör. `discover.adminDelete.*`). `@` karakteri kullanma.

## §1b API — Revize 1 (2026-11-05, sahip isteği): ortam listesi
Gerekçe: inceleme hesabının açtığı ortamlar Keşfet'e açık olmayabilir; Keşfet kartı tek giriş yolu olarak yetmez.

`GET /admin/guilds` aynı `AdminGuildsController` içinde (aynı guard'lar). Silinmemiş tüm ortamlar, `createdAt desc`, en çok 500 satır
(`platform-users.service` `MAX_ROWS` kalıbı). Dönüş `AdminGuildDto[]`:
```ts
{ id: string; name: string; iconUrl: string | null; ownerId: string; ownerUsername: string;
  memberCount: number; discoverable: boolean; createdAt: string /* ISO */ }
```
`iconUrl` şemadaki statik simge alanı (adı farklıysa şemadakini kullan, DTO adı `iconUrl` kalır). Swagger DTO sınıfı yaz.
Test: liste silinmişleri dışlar, sıralama createdAt desc, üye sayısı doğru eşlenir.

## §2b Web — Admin "Ortamlar" alt sekmesi
1. `adminApi.listGuilds()` + `AdminGuildDto` tipi (`web/src/api/admin.ts`).
2. `UserSettingsView.vue` admin alt-geçişine `'ortamlar'` (etiket i18n'den), yeni `PlatformGuildsSection.vue`
   (`views/settings/components/`, `PlatformUsersSection` görünümünü örnek al).
3. Satır: simge (yoksa baş harf), ad, sahip kullanıcı adı, üye sayısı, Keşfet'te mi rozeti, oluşturma tarihi (TR biçim, mevcut util).
   Üstte ada/sahibe göre istemci tarafı arama kutusu.
4. Satırda sil düğmesi → §2.3 ile aynı `KvModal` onayı (bileşen ya da metinler paylaşılabilir; Rule of Three, ikiye kopyalamak serbest)
   → `adminApi.deleteGuild` → satır yerelden düşer + toast. Hata `response.data.message`.
5. Metinler `tr.json` (`admin.guilds.*` ya da mevcut admin anahtar düzenine uyan yer). `@` yok.

## §1c / §2c — Revize 2 (2026-11-05, sahip isteği): yönetici ortama katılır
Amaç: sahip Keşfet'te olmayan bir ortama admin listesinden katılıp içine bakabilsin (gerçek topluluk mu test mi), sonra silsin ya da çıksın.

`POST /admin/guilds/:id/join` aynı controller. Gövde yok. Dönüş `GuildDto` (`joinDiscovery` ile aynı şekil, `toGuildDto`).
- Yok/silinmiş: 404 `GUILD_NOT_FOUND`.
- `discoverable` şartı YOK; geri kalan her şey `GuildJoinService.joinGuild` üzerinden (yaş/ban/zaten-üye kapıları + üye create +
  realtime, TEK kaynak). Kapılar baypas EDİLMEZ (R7: adultsOnly + minör kuralı yönetici için de aynı).
- Zaten üyeyse istemci 409'u "zaten üyesin" sayıp ortama yönlenir (servis davranışı değişmez).
- AuditLog: `action: 'admin.guild_join'`, `entityType: 'guild'`, `entityId`, metadata `{ name, ownerId, discoverable }`.
  Katılım başarıdan sonra yazılır (joinGuild kendi işlemini yönetiyor; atomiklik şartı yok).
- Yönetici sıradan üye (MEMBER) olarak girer, üye listesinde görünür. Gizli/görünmez giriş YOK.
Test: discoverable=false ortama katılır + audit yazar; 404; ban kapısı yönetici için de çalışır.

Web: `PlatformGuildsSection` satırında "Katıl" düğmesi → `adminApi.joinGuild(id)` → başarı ya da 409'da ortamın rotasına yönlen
(mevcut Keşfet katılımından sonra kullanılan yönlendirme ve guild store yenilemesiyle aynı). Metinler tr.json.

## §3 OUT
Mobil arayüz, silinmiş ortamı geri getirme arayüzü, inceleme hesabının Keşfet'e ortam açmasını engelleme, toplu silme, sayfalama.

## DoD
- [x] api: `tsc -p tsconfig.build.json` + ilgili testler + lint temiz
- [x] web: `vue-tsc -b` yalnız bilinen 6 hata, lint temiz, build temiz
- [x] R7: diff sahibe sunuldu, onaylandı (2026-11-05)
- [ ] Sahip turu: Keşfet'te test ortamı silindi, normal kullanıcıda düğme görünmüyor
- [ ] Sahip turu (Rev 1): Ayarlar > Admin > Ortamlar listesi açılıyor, Keşfet'te olmayan bir test ortamına buradan katılındı ve silindi
