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
- **Faz 3 — BEKLEMEDE:** izin enforcement R7-AĞIR; merge öncesi **sahip satır-satır inceleme + imza** zorunlu (kök CLAUDE.md). Başlamadan sahibe danışılacak.

## Çalışma modeli (bu sprint)
PM (Opus) bu sözleşmeyi + her faz görevini composer; **Sonnet dev session** tier'a iner (`web/` veya `api/`), kodu yazar, build/test çalıştırır, commit eder. PM Faz 3'ü (izin enforcement) R7 satır-satır inceler. Sapma → dev DURUR, PM contract'ı revize eder.
