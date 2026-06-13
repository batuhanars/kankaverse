# Sprint 11 Contract — Ortam Derinleştirme (V1: kanal yönetimi + ikon + kurallar)

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, PM revize eder.
> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. Türetildiği yer: PLAN Sprint 11 + kurul 2026-06-13 (kapsam ŞARTLI).
>
> **Kapsam kilidi (kurul):** V1-uygun derinlik. **DEFER (yapma):** özel kanal + rol/izin sistemi (V3), ses kanalı (V2),
> forum (gereksiz), etkinlik (V2/V3), kategoriler (V2), kanal sürükle-sırala (sonra). Bunlara dokunma → sapma → PM.

---

## 1. Hedef
Ortam sahibinin ortamı şekillendirebilmesi: **metin kanalları ekle/adlandır/sil**, **yaş-kapılı (18+) kanal işaretle**
(differentiator — `Channel.ageGated` zaten var + enforce edilir), **ortam kuralları** metni, **ortam ikonu** (altıgen).

Üye listesi + presence **zaten bitti** (önceki tur).

## 2. Prisma (additive)
- `Guild.rules String?` ekle + migration. (`Channel.ageGated Boolean @default(false)` **zaten var** — yeni alan değil.)

## 3. Backend — Kanal yönetimi (OWNER/ADMIN)
> Yetki: `MembershipService.requireGuildMembership` → `role ∈ {OWNER,ADMIN}` değilse `403 FORBIDDEN`. Mevcut `POST channel` (Sprint 1) genişler.

- **`POST /guilds/:id/channels`** (OWNER/ADMIN) — `{ name (2-50), ageGated? (default false) }` → `GUILD_TEXT` kanal oluştur (position sona). → ChannelDto. *(Mevcut create varsa ageGated + yetki ekle.)*
- **`PATCH /channels/:id`** (kanalın guild'inde OWNER/ADMIN) — `{ name?, ageGated? }` → güncelle → ChannelDto.
- **`DELETE /channels/:id`** (OWNER/ADMIN) — soft-delete (`deletedAt=now`). **Son kanal silinemez** (`409 LAST_CHANNEL` — ortam en az 1 kanal). → `200 null`.
- ChannelDto'ya `ageGated` alanı dahil (zaten varsa doğrula). Swagger güncel.

## 4. Backend — Ortam kuralları
- **`PATCH /guilds/:id`** (yalnız OWNER) — mevcut DTO'ya `rules? (≤2000)` ekle. GuildDto'ya `rules` dahil.

## 5. Frontend (`web/`)
- **Kanal oluştur (`ChannelPanel` "+" → modal):** ad input + **"18+ yaş-kapılı kanal" toggle** (açıklama: yalnız yetişkinler erişir) → `POST /guilds/:id/channels`. Yalnız OWNER/ADMIN'e "+" göster.
- **Kanal yönet (sağ-tık/çark, OWNER/ADMIN):** yeniden adlandır (inline veya mini-modal) → `PATCH`; sil → `ConfirmDialog` → `DELETE` (son kanal hatası `LAST_CHANNEL` jenerik uyarı). Yaş-kapılı kanal satırında **kilit/18+ rozeti**.
- **Ortam kuralları:** `GuildSettingsModal`'a "Kurallar" alanı (textarea, OWNER kaydeder → `PATCH rules`). Üyeye gösterim: ortam başlığı/bilgi veya basit bir "Kurallar" görünümü (minimal — placeholder şişirme yok).
- i18n tüm metin (`channel.*`, `guildSettings.rules*`); `--kv-*` token.
- **Realtime opsiyonel:** kanal ekle/sil sonrası oluşturanın UI'ı `channelsStore.fetchChannels` ile tazelenir; diğer üyeler sonraki yüklemede görür (anlık WS yayını V1 şart değil — over-engineering yapma).

## 6. R7 / Güvenlik
- Kanal CRUD OWNER/ADMIN gated (yetki kontrolü). **Yaş-kapılı kanal:** `ageGated` set edilince mevcut `requireChannelAccess` enforcement (minör → 403) zaten devrede — yeni enforcement yazma, yalnız işaretleme yüzeyi. (R7-hafif: yetki kontrolü + ageGated doğru set ediliyor mu.)

## 7. DoD
- [ ] Kanal ekle/adlandır/sil (OWNER/ADMIN); son kanal silinemez; UI bağlam menüsü.
- [ ] Yaş-kapılı kanal işaretle + rozet; minör erişemez (mevcut enforcement).
- [ ] Ortam kuralları kaydet + üyeye göster.
- [ ] `nest build` + `vue-tsc` temiz; testler (kanal CRUD yetki + ageGated + son-kanal).
- [ ] **Round 2 (ayrı):** ortam ikonu altıgen yükleme (serving yaklaşımı PM kararı).

## 8. Notlar
- **Round 2 — Ortam ikonu:** `Guild.iconUrl` var + Sprint 5 upload var. Serving: PM round 2'de netleştirir (attachment presigned-GET reuse vs public path). Altıgen `clip-path` (rail deseni).
- Özel kanal / roller / kategoriler / ses / etkinlik → kademeli roadmap (`ORTAM_AYARLARI_ROADMAP.md` + PLAN V2/V3).
