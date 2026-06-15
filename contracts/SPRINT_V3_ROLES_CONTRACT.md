# SPRINT V3 — Rol / İzin Sistemi (Sözleşme)

> PM compose 2026-06-15. Sahip görselleri (Discord rol yönetimi) + önceki oturum anlatımları kaynak.
> **Discord DÜZENİ alınır, TASARIMI değil** — tüm renk/şekil `--kv-*` token; terminoloji "Ortam/Rol" (brief §12).
> Dev session bu sözleşmeyi **tek doğruluk kaynağı** kabul eder; sapma → DUR, PM'e dön.

---

## Mimari (kilitli)

- Guild'in çok sayıda **Role**'ü olur. Her rol: `name`, `color`, `position` (hiyerarşi), `hoist` (üye listesinde ayrı göster), `mentionable`, `permissions` (bayrak listesi), opsiyonel `iconUrl`.
- Üye ↔ Rol **çoklu ilişki** (`GuildMemberRole`); bir üyenin birden çok rolü olabilir.
- Her guild'de bir **`@everyone`** taban rolü (silinemez, position 0, tüm üyelere örtük uygulanır).
- **Yetki çözümü (R7):** efektif izin = `OWNER (hepsi)` ∨ `@everyone izinleri` ∨ `üyenin rollerinin izin birleşimi`. **Mevcut `GuildRole` enum (OWNER/ADMIN/MEMBER) KORUNUR**; geçiş döneminde `ADMIN` → tüm yönetim izinlerine sahip kabul edilir (geriye-uyum). Yeni kontroller `hasGuildPermission(member, flag)` helper'ından geçer.
- **Hiyerarşi:** bir üye yalnız kendi en yüksek rolünden DÜŞÜK rolleri yönetebilir/atayabilir; OWNER hepsinin üstünde.
- **Kanal-bazlı izin override'ı V3 KAPSAM DIŞI** (Faz sonrası). Bu sprint guild-geneli izinler.

### İzin bayrakları (V3 seti — Discord alt kümesi)
`VIEW_CHANNELS`, `MANAGE_CHANNELS`, `MANAGE_ROLES`, `MANAGE_GUILD`, `KICK_MEMBERS`, `BAN_MEMBERS`,
`MANAGE_MESSAGES`, `MENTION_EVERYONE`, `MANAGE_EMOJIS` (ileride), `CREATE_INVITE`, `CHANGE_NICKNAME`,
`MANAGE_NICKNAMES`, `MUTE_MEMBERS`, `MOVE_MEMBERS`, `PRIORITY_SPEAKER` … (Görsel İzinler sekmesindeki Türkçe etiketler `tr.json`'da).
Depolama: `Role.permissions String[]` (bayrak adları). Bilinmeyen bayrak yok sayılır (forward-compat).

---

## Fazlar (her faz ayrı dev session + build/test + commit; PM R7 fazını inceler)

### Faz 1 — Ortam Ayarları TAM-SAYFA (web-only, R7 yok) ← İLK
Modal (`GuildSettingsModal.vue`) → Discord-tarzı **tam-ekran overlay** (`GuildSettingsView`), sol-nav'lı.
- **Sol nav bölümleri:** `Genel` (ad + ikon + kurallar + adultsOnly), `Roller` (bu faz: boş placeholder — "yakında" DEĞİL, Faz 2'de dolacak başlık+Rol Oluştur iskeleti yok; sadece nav girişi + boş panel), `Üyeler` (mevcut MemberPanel'deki rol/kick/ban/devir aksiyonları buraya da gelebilir — opsiyonel; en az liste), `Davetler` (mevcut davet yönetimi), `Yasaklar` (mevcut ban listesi/unban), ve en altta **danger**: `Ortamı Sil`.
- **Açılış:** ChannelPanel başlık menüsündeki "Ortam Ayarları" → modal yerine bu tam-ekran view'ı açar. ESC / ✕ ile kapanır. Sağ üstte "ESC" göstergesi (Discord deseni).
- **Mevcut `GuildSettingsModal` içeriği** (ikon yükleme, ad, adultsOnly toggle, kurallar, davet oluştur/listele/iptal, yasaklılar/unban, ortam sil) **bölümlere taşınır** — işlevsellik AYNEN korunur (aynı store/api çağrıları). Modal kaldırılır veya view'a sarılır.
- **Header 64px sistemi / panel genişlikleri** korunur; tam-ekran overlay `--kv-bg-content` + sol-nav `--kv-bg-sidebar`.
- **DoD:** tam-ekran ayarlar açılıyor; tüm mevcut ayar işlevleri çalışıyor (regresyon yok); `vue-tsc` + `vite build` temiz; gömülü string yok (`tr.json`); yalnız OWNER/ADMIN uygun bölümleri görür (mevcut isOwner/isAdmin korunur).

### Faz 2 — Roller: model + görünüm CRUD + atama + üye-listesi gruplama (backend + web, R7-orta)
- **Backend Prisma:** `Role` modeli + `GuildMemberRole` (M2M) + migration. Guild create'te `@everyone` seed; mevcut guild'lere backfill migration. `Guild.roles`, `GuildMember` ↔ roller.
- Endpoint'ler: `GET /guilds/:id/roles`, `POST /guilds/:id/roles` (ad+renk+hoist; MANAGE_ROLES/ADMIN), `PATCH /roles/:id` (görünüm), `DELETE /roles/:id` (@everyone hariç), `POST /roles/:id/members/:userId` + `DELETE` (ata/çıkar). Realtime: `guild.role_*` + üye rolleri değişince ilgili WS.
- **Üye listesi gruplama:** `getMembers` her üyeye `roles[]` döner; sağ panel **hoist'li en yüksek role göre gruplar** (renkli başlık + üyeler), sonra "Çevrimiçi"/"Çevrimdışı" (mevcut). Hoist kapalı rol grup açmaz.
- Rol Görünüm sekmesi (ad/renk/hoist toggle/mentionable) + Üyeleri Yönet sekmesi (ekle/çıkar) — Faz 1'in Roller bölümüne.
- **Bu fazda roller YETKİ vermez** (yalnız görünüm/gruplama); izin bayrakları kaydedilebilir ama enforce edilmez.
- **DoD:** rol oluştur/düzenle/sil/ata uçtan uca; üye listesi hoist'li role göre gruplanıyor + renk; @everyone korunuyor; migration uygulandı; build+test temiz.

### Faz 3 — İzinler + ENFORCEMENT (R7-AĞIR; PM satır-satır inceler)
- Rol İzinler sekmesi (bayrak toggle'ları, arama, "izinleri temizle"). `Role.permissions` set/güncelle.
- **`hasGuildPermission(userId, guildId, flag)` helper** (efektif izin çözümü; OWNER hep true, ADMIN geçiş-uyum true, yoksa rollerin birleşimi). 
- Tüm guild yetki kontrolleri buna geçer: kanal/kategori CRUD (`MANAGE_CHANNELS`), kick (`KICK_MEMBERS`), ban (`BAN_MEMBERS`), rol yönet (`MANAGE_ROLES`), ortam ayar (`MANAGE_GUILD`), davet (`CREATE_INVITE`), mesaj yönet (`MANAGE_MESSAGES`) …
- **Hiyerarşi:** rol yönet/üye-aksiyon yalnız aktörün en yüksek rolünden düşük hedefe; OWNER muaf. Minör/yaş kapıları + adultsOnly **DOKUNULMAZ** (izin sisteminin üstünde, ayrı katman).
- **DoD + R7:** fail-closed; izinsiz aksiyon 403; OWNER/ADMIN geriye-uyum bozulmadı; mevcut tüm T&S testleri yeşil; PM satır-satır inceler + sahip imzası.

#### Faz 3 — DETAYLI PLAN (kilitli; sahip 2026-06-15 onayı)
**1) İzin bayrağı seti'ne `ADMINISTRATOR` eklenir** (sahip onayı). Bir rolde ADMINISTRATOR → o rol TÜM izinlere sahip kabul edilir (Ortam Sil + Sahiplik Devri HARİÇ — onlar yalnız OWNER). Tek-toggle tam-yetkili özel rol kurma imkânı.

**2) `hasGuildPermission(userId, guildId, flag)` — efektif izin çözümü (shared servis):**
   1. Üye değil → `false`.
   2. `guild.ownerId === userId` veya `membership.role === OWNER` → `true` (her şey).
   3. `membership.role === ADMIN` (enum, geçiş-uyum) → `true` (her şey).
   4. Efektif izinler = `@everyone rolü izinleri` ∪ `üyenin atanmış rollerinin izinleri`. Eğer `ADMINISTRATOR` içeriyorsa → `true`. Aksi halde `flag ∈ efektif`.
   - Konum: `shared/permissions/permissions.service.ts` (SharedModule export; guilds/channels/roles/messages enjekte eder). `membership` ve `prisma` kullanır.

**3) Enforcement noktaları (mevcut OWNER/ADMIN enum kontrolleri → `hasGuildPermission`):**
   - Kanal CRUD + reorder → `MANAGE_CHANNELS`. Kategori CRUD + reorder → `MANAGE_CHANNELS`.
   - Rol create/update/delete/assign/remove/reorder → `MANAGE_ROLES` (+ hiyerarşi).
   - Kick → `KICK_MEMBERS` (+ hiyerarşi). Ban/unban → `BAN_MEMBERS` (+ hiyerarşi). Ban listesi görüntüle → `BAN_MEMBERS`.
   - Ortam ayar (ad/ikon/kurallar) → `MANAGE_GUILD`. **`adultsOnly` (18+) toggle → YALNIZ OWNER** (sahip kararı; MANAGE_GUILD yetmez — guild update'te adultsOnly değişiyorsa ve aktör OWNER değilse 403).
   - Davet oluştur → `CREATE_INVITE`. Davet listele/iptal → `MANAGE_GUILD`.
   - Başkasının mesajını sil / pin → `MANAGE_MESSAGES` (kendi mesajını silme her zaman serbest).
   - **OWNER-only (bayrakla verilemez):** Ortam Sil (deleteGuild), Sahiplik Devri (transferOwnership), enum rol değiştir (updateMemberRole — ADMIN/MEMBER ataması geçiş-dönemi, OWNER-only kalır).

**4) Hiyerarşi (Discord modeli; OWNER muaf, ADMIN-enum geçiş-uyum muaf):**
   - "En yüksek rol position'ı" = üyenin atanmış rollerinin max position (yoksa 0/@everyone). OWNER = sonsuz.
   - **Rol yönet** (belirli bir rolü düzenle/sil/ata/sırala): hedef rolün position'ı < aktörün en yüksek position'ı olmalı. ADMINISTRATOR bayrağı hiyerarşiyi DELMEZ (izni verir ama üstündeki rolü yönetemezsin) — yalnız OWNER muaf.
   - **Üye aksiyonu** (kick/ban/rol-ata): hedef üyenin en yüksek position'ı < aktörünki olmalı. OWNER asla hedef alınamaz; OWNER muaf.
   - İhlal → 403 `ROLE_HIERARCHY` / `MEMBER_HIERARCHY`.

**5) Web — rol detayında "İzinler" sekmesi** (Görünüm | İzinler | Üyeleri Yönet): bayraklar gruplanmış (Genel/Üyelik/Mesaj/Ses) KvSwitch'lerle; ADMINISTRATOR en üstte, "tüm izinleri verir" uyarısıyla. `MANAGE_ROLES`/OWNER düzenler. Kaydet → `PATCH /roles/:id { permissions }`. @everyone izinleri düzenlenebilir. Türkçe etiketler `tr.json`.

**6) Dokunulmaz:** minör/yaş join kapıları + adultsOnly erişim enforcement'ı + CSAM kapıları izin sisteminin ÜSTÜNDE, ayrı katman — hiçbir bayrak (ADMINISTRATOR dahil) reşit-olmayan korumasını delemez.

**7) Geriye-uyum:** mevcut OWNER/ADMIN enum üyeler hep tam yetkili kalır (adım 2.2/2.3). Mevcut T&S testleri yeşil kalmalı. Fail-closed.

### Faz 4 — Cila
Rol sürükle-sırala (hiyerarşi/position), rol mention (`@rol`), rol simgesi yükleme (CSAM-kapısına bağlı → ikon scan gelince), kanal-bazlı izin override (opsiyonel, sonraya).

---

## Sahip netleştirmeleri (2026-06-15, Faz 1 sonrası)

- **Faz 1.1 hızlı-fix (web):** `GuildSettingsView` sol-nav + içerik **ekranın ortasına** hizalansın (Discord gibi — sabit max-genişlikli merkez kolon; şu an çok solda duruyor). Tam-ekran overlay zemini ortada bir konteyner sarar (örn. nav+içerik birlikte `max-w-[1100px] mx-auto` benzeri), iki yanda boşluk.
- **Rol özgürlüğü (Faz 3 mimari pekiştirme):** Discord'da admin "rolü" diye sabit bir şey YOK — sahip **kendi rolünü oluşturur, tüm izinleri verir, adını istediği gibi koyar** ("Yönetici" zorunlu değil). Bizde de gerçek yetki **rol izin bayraklarından** gelir, rol ADINDAN değil. Mevcut `ADMIN` enum **yalnız geçiş-uyumu** (ileride ADMIN üyeler için varsayılan tam-izinli bir role migrate edilebilir); kalıcı mekanizma rol-izinleridir. `hasGuildPermission` bayrak setine bakar, isme değil.
- **Üye listesi gruplama kuralları (Faz 2 kesinleştirme):**
  - Ortamda hiç (hoist'li) rol yoksa → sağ panelde **yalnız "Çevrimiçi"** (mevcut davranış) + "Çevrimdışı".
  - Hoist'li bir rol varsa → o rol **ayrı başlık** (rol rengi) + üyeleri; bu üyeler **"Çevrimiçi" grubundan ÇIKARILIR**.
  - "Çevrimiçi" grubu boşalırsa **başlık kaybolur** (Discord davranışı; sahip ekran görüntüsüyle doğruladı).
  - Bir üye birden çok hoist'li role sahipse → **en yüksek (position)** hoist'li rolün grubunda görünür.

## Durum (PM kaydı)

- **Faz 1.1 — TAMAM** (`48ef947`): ayarlar overlay'i `max-w-[1100px]` ortalanmış panel.
- **Faz 2 backend — TAMAM** (`3cbebed`, `05b5df4`): Role + GuildMemberRole modeli, migration `20260615102358_roles` (uygulandı, status temiz) + @everyone backfill, rol CRUD + üye atama (`roles` modülü, OWNER/ADMIN kapısı), `getMembers` `roles[]`, realtime `guild.role_*`/`member_updated`. 524 test ✓.
- **Faz 2 web — TAMAM** (`9ce6ac3`): üye listesi hoist-rol gruplama (sahip kuralları), RolesSettingsSection (görünüm+üye, izin sekmesi YOK), roles store/api/realtime, GuildMemberRow refactor (DRY). tsc+build ✓.
- **PM kararı (üye gruplama):** sahip "rol yoksa yalnız Çevrimiçi" kuralı gereği **enum-tabanlı otomatik "Yöneticiler" grubu KALDIRILDI**; gruplama tamamen hoist'li rollere dayanır. Sahip görünürlüğü için 👑 (OWNER) + ADMIN rozeti üye satırında **satır-içi** korundu. Sahip onayına sunuldu (geri bildirim beklenir).
- **Faz 2 web cila (sahip geri bildirimleriyle):** ayarlar tam-ekran nav-soldan-boşluklu düzen; rol editörü vue-i18n `@` escape (boş-ekran crash giderildi); checkbox→KvSwitch (paylaşılan ui component); **Roller ekranı Discord-tarzı**: liste-önce (açıklama + @everyone kartı + ara + Rol Oluştur + satırlar) + rol DETAY (sol GERİ+rol-listesi gezinme + Görünüm/Üyeleri Yönet sekmeleri); ayar nav'ı detayda da görünür; editör içeriği dar (max-w 720); liste kartlarında düzenle+sil butonları.
- **Faz 4'ten öne çekildi — rol drag-reorder:** `PATCH /guilds/:id/roles/reorder` (OWNER/ADMIN, @everyone hariç, üst=en yüksek position) + web native DnD (kanal listesi deseni). Sahip istedi (Faz 2 cilası sırasında).
- **Faz 3 — KOD YAZILDI, R7 İNCELEMESİ YAPILDI (2026-06-15), düzeltme turunda.** Backend enforcement (ADMINISTRATOR bayrağı, `PermissionsService.hasGuildPermission` + hiyerarşi, tüm enforcement noktaları) çalışma ağacında, commit edilmedi. PM (Opus) satır-satır inceledi — bulgular:
  - **F1 (YÜKSEK, sömürülebilir):** `createRole`/`updateRole` "sahip olmadığın izni veremezsin" kuralını uygulamıyordu → yalnız `MANAGE_ROLES` izni olan üye `@everyone`'a `ADMINISTRATOR` ekleyip tam yetkiye yükselebiliyordu. **Sahip kararı (2026-06-15): Discord kuralı uygulanır** — aktör yalnız kendi efektif izinlerini verebilir; OWNER + ADMINISTRATOR-sahibi muaf. Yeni hata kodu `CANNOT_GRANT_PERMISSION`. *(sözleşme genişlemesi — sahip onaylı)*
  - **F2 (YÜKSEK, geriye-uyum):** `actorHighestPosition` enum-ADMIN'e `0` dönüyordu → rolsüz enum-ADMIN kick/ban/rol-yönet yapamıyordu (§70/§80 ihlali). **Düzeltme:** enum-ADMIN → `Number.MAX_SAFE_INTEGER` (tüm MEMBER+rollerin üstü; ADMIN-vs-ADMIN beraberlik eski "yönetici yöneticiyi atamaz" davranışını korur; OWNER hâlâ ∞).
  - **F3 (küçük):** `guilds.update` adultsOnly kapısı `!== undefined` yerine `!== guild.adultsOnly` (gerçek değişim) ile tetiklenmeli — yoksa OWNER-olmayan MANAGE_GUILD yöneticisi ad/kural düzenleyemez.
  - **F4 (küçük):** kick audit log `actorRole: 'n/a'` → kaldırıldı/anlamlandırıldı.
  - **F6 (DoD bloklayıcı):** constructor imza değişiminden 12 test kırıldı (cross-cutting spec kablolaması) — düzeltilecek.
  - **Olumlu:** OWNER-only katmanı (sil/devir/enum-rol) + dokunulmaz yaş/adultsOnly/özel-kanal katmanı korunmuş; flag eşlemeleri sözleşmeyle uyumlu; şema değişikliği yok.
  - **Merge:** düzeltmeler + 554 test yeşil sonrası sahip imzası ile commit.

## Çalışma modeli (bu sprint)
PM (Opus) bu sözleşmeyi + her faz görevini composer; **Sonnet dev session** tier'a iner (`web/` veya `api/`), kodu yazar, build/test çalıştırır, commit eder. PM Faz 3'ü (izin enforcement) R7 satır-satır inceler. Sapma → dev DURUR, PM contract'ı revize eder.
