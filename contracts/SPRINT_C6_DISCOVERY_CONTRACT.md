# SPRINT C6 — Keşfet (Sunucu Keşfi) + İlgi Etiketleri + Renk Afişi

> Durum: **TASARIM KİLİTLİ (2026-06-16).** PM compose. V3+ Track C6 (masaüstü-öncesi).
> Sahip kararları: minör → adultsOnly süzülür gerisi görünür · etiketler (max 5 "Özellikler") · afiş = **renk/gradient** (görsel afiş ertelendi, CSAM/ikon-scan bundle).
> **R7-hafif:** Keşfet temas-genişletme yüzeyi → adultsOnly minöre gizli + discoverable opt-in + join gate'leri (Sprint 7A) yeniden kullanılır. PM inceler.

---

## §0 — Kapsam ve Kararlar

**IN:**
- **`Guild.discoverable`** opt-in (default false, `MANAGE_GUILD`). Yalnız açık sunucular Keşfet'te listelenir.
- **`Guild.tags`** — max 5 ilgi etiketi ("Özellikler"; Discord deseni). Keşfet bunlara göre filtrelenir.
- **`Guild.bannerColor`** — hazır renk/gradient preset (görsel DEĞİL). Keşfet kartı + (ileride) sunucu başlığı görseli.
- **Keşfet ekranı:** arama + etiket-filtre + sunucu kartları (renk afişi + ikon + ad + açıklama + üye sayısı + etiketler + Katıl).
- **Keşfet'ten katıl:** davet kodu yerine `discoverable` kontrolü + **mevcut join gate'leri** (adultsOnly/ban/üyelik — Sprint 7A).
- **Ayarlar:** Afiş (renk seçici) · Özellikler (5 etiket) · "Keşfet'te Göster" (discoverable) — `MANAGE_GUILD`.
- **İkon yükleme:** dosya seçici `accept="image/*"` (PDF vs. çıkmasın).

**OUT / ertelendi:**
- **Görsel afiş** → CSAM/ikon-scan bundle (Keşfet'te geniş-görünür taranmamış görsel olur; ileride takviye/paid perk).
- **Sabit taksonomi/kategori sekmeleri** (Oyun/Müzik...) → etiketler serbest-metin (kullanıcı tanımlı); kürasyon sonra.
- **Online sayısı** (presence-agregasyon çapraz-guild) → şimdilik yalnız `memberCount`.
- **Öneri/featured algoritması** → şimdilik `memberCount` azalan sıralama.
- Discovery hard-flag YOK (taranmamış-yükleme yüzeyi eklemiyor; afiş renk, ikon mevcut D14). Gerçek-kullanıcı/minör Keşfet politikası lansman+moderasyonda gözden geçirilir (not).

---

## §1 — Veri Modeli

```prisma
model Guild {
  // ...mevcut...
  discoverable Boolean  @default(false)
  tags         String[] @default([])   // max 5 (servis doğrular)
  bannerColor  String?                 // preset KEY (allowlist; görsel değil)
  // index: keşfet sorgusu
  @@index([discoverable])
}
```
**Migration additive, UYGULANIR** (`migrate status` temiz — DoD; prod Railway otomatik). `bannerColor` = sabit preset anahtarı (örn. `cream|pink|red|orange|yellow|purple|blue|teal|green|dark`) — frontend gradient'e eşler; backend allowlist doğrular (arbitrary CSS değil).

---

## §2 — Backend Endpoint'leri

| Method | Path | Açıklama |
|---|---|---|
| PATCH | `/guilds/:id` | **GENİŞLET** (UpdateGuildDto + `discoverable?`, `tags?`, `bannerColor?`). `MANAGE_GUILD` (mevcut). → GuildDto |
| GET | `/discovery/guilds?search=&tag=&cursor=` | Discoverable guild'ler (üye+değil herkes erişir). **adultsOnly minöre süzülür.** `memberCount` azalan. → `DiscoveryGuildDto[]` (+nextCursor) |
| GET | `/discovery/tags` | Popüler etiketler (discoverable guild'lerden agregat, top N) — kategori çipleri. → `{ tag, count }[]` |
| POST | `/guilds/:id/join-discovery` | Keşfet'ten katıl: `guild.discoverable===true` ZORUNLU + **mevcut join gate'leri** (Sprint 7A `joinByInvite` mantığı: adultsOnly&&minör→403 `AGE_RESTRICTED`, ban→`GUILD_BANNED`, zaten-üye, atomik member create) davet-kodu olmadan. → GuildDto |

**DTO doğrulama:** `tags` `@ArrayMaxSize(5)` + her biri trim/≤30 char/normalize (lowercase); `bannerColor` `@IsIn(PRESET_KEYS)`; `discoverable` `@IsBoolean`.

**Sprint 7A join yeniden-kullanım:** `join-discovery`, mevcut davet-join servisindeki gate dizisini (yaş/ban/üyelik) **aynen** çağırır; tek fark giriş kapısı = `discoverable` (invite yerine). Yeni T&S fonksiyonu icat etme.

---

## §3 — T&S (R7-hafif)

- **adultsOnly süzme (KRİTİK):** `GET /discovery/guilds` — viewer `isMinor` ise sonuçtan `adultsOnly=true` guild'ler **çıkarılır** (`where: minorViewer ? { adultsOnly: false } : {}`). Yetişkin hepsini görür.
- **discoverable opt-in:** default false; yalnız owner `MANAGE_GUILD` ile açar → otomatik public listeleme yok.
- **Join gate reuse:** `join-discovery` adultsOnly&&minör→403 + ban→403 (Sprint 7A) — minör listede görmese de doğrudan id ile deneme yapsa bile kapı tutar (fail-closed).
- **Etiketler = kullanıcı-metni** (moderasyon yüzeyi): düz metin çip (XSS-yok), normalize, ≤30/max5. İleride etiket-report (kapsam dışı).
- **bannerColor** = preset anahtar (kullanıcı-içerik değil, güvenli). **Görsel afiş YOK** (taranmamış-public yüzey olur).
- **İkon Keşfet'te görünür** = mevcut D14 taranmamış-public borcu (yeni değil; lansman R5 scan ikonları kapsayacak).
- **PM inceleme noktası:** adultsOnly süzmenin viewer.isMinor'a bağlı olması + join-discovery'nin Sprint 7A gate'lerini aynen miras alması + discoverable opt-in.

---

## §4 — DTO'lar

**GuildDto** (kendi ortamların): + `discoverable: boolean`, `tags: string[]`, `bannerColor: string | null`.

**DiscoveryGuildDto:**
```jsonc
{ "id", "name", "iconUrl", "bannerColor", "description", "memberCount", "tags", "adultsOnly" }
```
`memberCount` = `_count.members` (Prisma). UpdateGuildDto + `discoverable?`/`tags?`/`bannerColor?`.

---

## §5 — Frontend (`web/`)

1. **Tipler:** `GuildDto` + discoverable/tags/bannerColor; `DiscoveryGuildDto`. `api/discovery.ts` (listGuilds, popularTags, joinDiscovery).
2. **Keşfet görünümü** (`DiscoverView.vue`, YENİ): ray altındaki **pusula/Keşfet** girişinden açılır (mevcut ray deseni). İçerik: başlık + arama input + **etiket çipleri** (`/discovery/tags`, tıkla→filtre) + **sunucu kart grid'i**. Kart: üstte **renk afişi** (bannerColor→gradient) + ikon (altıgen) + ad + açıklama + üye sayısı + etiket çipleri + **Katıl** butonu → `join-discovery` → başarıda o ortama git. Boş durum. adultsOnly süzme backend'de (minör).
3. **Ortam ayarları genişletme** (`GuildSettingsView`): yeni bölümler (`MANAGE_GUILD`): **Afiş** (preset renk/gradient swatch seçici — Discord deseni), **Özellikler** (max 5 etiket input/çip ekle-kaldır), **Keşfet'te Göster** (discoverable toggle). Kaydet mevcut PATCH ile.
4. **İkon yükleme:** mevcut ikon file input'a `accept="image/*"` ekle (görsel-only; kullanıcı dosya gezgininde kaybolmasın). *(Gelecekte görsel afiş gelince ona da aynı.)*
5. **bannerColor preset eşlemesi:** `styles` ya da util'de `PRESET_KEY → gradient` haritası (backend allowlist ile aynı anahtarlar); `--kv-*` token uyumlu.
6. **i18n** (`tr.json`): `discover.*` (başlık, ara, katıl, üye sayısı, boş), `guildSettings.bannerLabel/featuresLabel/featuresHint/discoverableLabel` vb. Görünen string yok-gömülü; renk/şekil token.

---

## §6 — DoD

- [ ] `Guild.discoverable/tags/bannerColor` + migration (additive, uygulandı, `migrate status` temiz)
- [ ] PATCH /guilds genişletme (discoverable/tags≤5/bannerColor-allowlist) · `GET /discovery/guilds` (adultsOnly minöre süzülü, memberCount, search/tag) · `GET /discovery/tags` · `POST /guilds/:id/join-discovery` (discoverable + Sprint 7A gate reuse)
- [ ] Keşfet görünümü (ray girişi, arama, etiket-filtre, renk-afişli kartlar, Katıl) · ayarlar Afiş/Özellikler/Keşfet-Göster · ikon `accept="image/*"`
- [ ] `nest build`+`vue-tsc`+`vite build` temiz; birim test (discovery adultsOnly-minör süzme · join-discovery gate reuse [minör adultsOnly→403, ban→403, discoverable-değil→403] · tags max5/normalize · bannerColor allowlist)
- [ ] **R7-hafif:** PM inceler (adultsOnly süzme viewer.isMinor'a bağlı, join Sprint 7A gate miras, opt-in)
- [ ] Sahip canlı test: ortamı discoverable yap + etiket + renk afişi → Keşfet'te görünür + etiket-filtre + Katıl çalışır; minör adultsOnly ortamı Keşfet'te GÖRMEZ

---

## §7 — Sapma Kuralı

Endpoint/DTO/şema sapması → dev DURUR, PM'e döner. **Görsel afiş / yeni image-upload yüzeyi açma, sabit-taksonomi, online-presence agregasyon → bu sözleşme DIŞI** (PM+sahip). C6 = discoverable + etiket + renk-afiş + Keşfet + güvenli-join ile sınırlı; adultsOnly süzme + Sprint 7A join gate'leri **delinmez**.
