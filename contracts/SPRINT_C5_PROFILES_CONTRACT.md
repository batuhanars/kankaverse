# SPRINT C5 — Kullanıcı Profilleri + Birleşik Ayarlar Modalı

> Durum: **TASARIM KİLİTLİ (2026-06-16).** PM compose. V3+ yol haritası Track C5 (masaüstü-öncesi sıra).
> Sahip: Discord-tarzı birleşik ayarlar + profil; **var olan veri/özellikle** (Discord boş sekmeleri taklit YOK — anti-placeholder).
> **R7-hafif:** profil kartı erişim kuralı + minör-statü sızıntısı koruması korunur; dmPolicy değişimi minör korumasını ZAYIFLATAMAZ. PM inceler.

---

## §0 — Kapsam ve Kararlar

**IN:**
- **Birleşik Ayarlar Modalı** (GuildSettingsView deseni: sol nav + scroll içerik). Sekmeler:
  - **Hesap** — mevcut `SecurityView` bölümlerini (2FA · oturumlar · şifre · e-posta · hesap sil) modal-tab'ına TAŞI (Section component'leri tekrar kullan; reauth/akış değişmez). Username/e-posta **read-only gösterim** (değiştirme: e-posta mevcut akış; **username değişimi DIŞTA**).
  - **Profil** — `bio` düzenleme (yeni alan).
  - **Gizlilik** — `dmPolicy` (EVERYONE/FRIENDS/NONE) — gerçek/enforced alan.
- **Bio** alanı (`User.bio`, ≤512, link içerebilir → güvenli markdown render).
- **Profil görüntüleme** (başkasının): `GET /users/:id/card` genişlet (bio + üyelik tarihi + ortak arkadaş + ortak sunucu). `DmProfilePanel` genişlet + **tam-profil modalı**.

**OUT / ertelendi (boş-placeholder olur / future / karar):**
- **Avatar yükleme** → sahip kararı 2026-06-16: ERTELENDİ. Her yerde göründüğü için ortam-ikonu deseni (public URL, **D14 taranmamış-public borç sınıfı**) gerekir → ikon/upload-CSAM paketiyle birlikte gelir. Avatarlar şimdilik varsayılan.
- **Bildirim tercih toggle'ları** → kontrol edeceği davranış yok (native/masaüstü = Electron/Track F). Boş sekme olur.
- **Bağlantılar (Steam/Spotify OAuth)** → ileri vizyon; bio'ya link koymak şimdilik karşılıyor.
- **Banner görseli** (gated upload), **Faturalandırma/Nitro**, **Aktivite sekmesi** (veri yok), **e-Devlet doğrulama akışı** (Sprint 8), **username değişimi** (kimlik ripple), **kişisel not**, **`profileDiscoverable`/`mediaPolicy` toggle** (enforcement yok → şu an hiçbir şeyi gatelemiyor) → hepsi DIŞTA.

---

## §1 — Veri Modeli

```prisma
model User {
  // ...mevcut...
  bio String?  // profil metni, ≤512 (servis doğrular); markdown/link güvenli render
}
```
Tek alan. **Migration additive, UYGULANIR** (`migrate status` temiz — DoD; prod Railway start-command otomatik). Başka şema değişikliği yok (dmPolicy/createdAt mevcut).

---

## §2 — Backend Endpoint'leri

| Method | Path | Açıklama |
|---|---|---|
| PATCH | `/users/me` | Kendi profil/gizlilik güncelle. Body `UpdateProfileDto` (`bio?` ≤512, `dmPolicy?` enum). → `UserDto` |
| GET | `/users/:id/card` | **GENİŞLETİLDİ** (mevcut erişim kuralı + minör koruması KORUNUR). → genişletilmiş `UserProfileCardDto` |

- `PATCH /users/me`: JwtAuthGuard + @CurrentUser. `bio` trim, ≤512 (`@MaxLength`); `dmPolicy` `@IsEnum`. Yalnız verilen alanlar güncellenir (undefined→değişmez).
- `GET /users/:id/card` genişletme: mevcut erişim kapısı (ortak ortam VEYA ilişki, yoksa **404**; "o beni engelledi" ASLA dönmez) **DEĞİŞMEZ**. Eklenen veri: `bio`, `memberSince`(createdAt), `mutualFriends` (ortak ACCEPTED arkadaşlar — id/username/avatarUrl liste + count), `mutualGuilds` (ortak GuildMember — id/name/iconUrl liste + count). Bunlar viewer'ın KENDİ arkadaş/sunucularıyla kesişim (yeni sızıntı yok).

---

## §3 — DTO'lar

**`toUserDto` (kendi `/auth/me`):** + `bio: string | null`, `dmPolicy` (zaten modelde; DTO'ya ekle ki Gizlilik sekmesi okusun).

**`UserProfileCardDto` (genişletilmiş):**
```jsonc
{
  "id", "username", "avatarUrl",
  "friendStatus", "selfBlocked",        // MEVCUT (değişmez)
  "bio",                                // YENİ (null olabilir)
  "memberSince",                        // YENİ (createdAt ISO)
  "mutualFriends": [{ "id","username","avatarUrl" }],   // YENİ (ortak arkadaşlar)
  "mutualGuilds":  [{ "id","name","iconUrl" }]          // YENİ (ortak sunucular)
}
```
**Minör-statü ASLA dönmez** (mevcut disiplin). `UpdateProfileDto`: `{ bio?, dmPolicy? }`.

---

## §4 — Frontend: Birleşik Ayarlar Modalı

`UserSettingsView.vue` (YENİ; `GuildSettingsView` modal+sol-nav desenini tekrar kullan, Teleport, ESC kapat). UserCard popover'daki **ayarlar** girişi bunu açar (U1 borcu yönünde — popover→ayarlar modalı).

Sekmeler (yalnız gerçek):
- **Hesap:** mevcut `SecurityView` Section component'lerini (`TwoFactorSection`/`SessionsSection`/`ChangePasswordSection`/`ChangeEmailSection`/`DeleteAccountSection`) bu tab içinde render et — **kodları taşı/yeniden-kullan, akış/reauth değişmez**. Username read-only satır.
- **Profil:** bio textarea (≤512, sayaç) → `PATCH /users/me`; kaydet/dirty. (Avatar alanı YOK — ertelendi.)
- **Gizlilik:** `dmPolicy` select (Herkes/Arkadaşlar/Kimse) → `PATCH /users/me`.

*(Mevcut `/settings` route: modal ana giriş olur; route kalabilir ya da modale yönlenir — dev minimal tutar. Sapma değil.)*

---

## §5 — Frontend: Profil Görüntüleme

**`DmProfilePanel.vue` (genişlet):** mevcut avatar/username/aksiyonlar (Mesaj/Engelle/Arkadaşlıktan çıkar) + **bio** + **üyelik tarihi** + **ortak arkadaş/sunucu** (sayı + satır) + **"Profilin Tamamını Gör"** butonu → tam-profil modalı.

**`FullProfileModal.vue` (YENİ):** büyük modal — avatar (varsayılan), username, **bio** (güvenli markdown render → linkler tıklanabilir, `renderMessageHtml` deseni; yayıncı/geliştirici link senaryosu), üyelik tarihi, sekmeler: **Ortak Arkadaşlar** (liste) · **Ortak Sunucular** (liste). Aksiyonlar = **yalnız mevcut akışlar:** Mesaj (canDm), Kanka Ekle (Sprint 4A `by-user`, ortak-ortam + jenerik ret), Engelle/Çıkar (`ConfirmDialog`). Mesaj yazarı/üye tıkla → kart popover (mevcut G2) → "tam profil" buraya bağlanır.

**i18n** (`tr.json`): `profile.bio`, `profile.memberSince`, `profile.mutualFriends`, `profile.mutualGuilds`, `profile.viewFull`, `settings.tabAccount/Profile/Privacy`, `settings.bioPlaceholder`, `settings.dmPolicy.*` vb. Tarih TR yereli; `--kv-*` token.

---

## §6 — Trust & Safety (R7-hafif)

- **Profil kartı erişim kuralı DEĞİŞMEZ** (ortak ortam/ilişki, yoksa 404; "o beni engelledi" sızmaz). Genişletilen alanlar (bio/ortaklar/tarih) yalnız bu kapıdan geçen viewer'a.
- **Minör-statü ASLA görünmez** (kartta/profilde yaş/minör alanı yok — mevcut disiplin). Ortak arkadaş/sunucu listesi kullanıcı kimliği (username/avatar) gösterir, minör statüsü değil.
- **dmPolicy değişimi minör korumasını ZAYIFLATAMAZ:** `DmPermissionService.canDm` minör↔yabancı kapısı dmPolicy'den BAĞIMSIZ ve önce gelir → minör dmPolicy=EVERYONE yapsa bile canDm minör-gate korur. **PM bunu doğrular.**
- **Bio = yeni kullanıcı-içerik yüzeyi** (metin): güvenli render (markdown-it `html:false` + DOMPurify, XSS-yok, link `noopener`). Görsel değil → CSAM-dışı; moderasyon yüzeyi (ileride bio-report eklenebilir, bu sprint dışı).
- **PM inceleme noktası:** card genişletmesinin erişim kapısını koruduğu + minör sızıntısı olmadığı + dmPolicy-minör bağımsızlığı.

---

## §7 — DoD

- [ ] `User.bio` + migration (additive, uygulandı, `migrate status` temiz)
- [ ] `PATCH /users/me` (bio/dmPolicy doğrulama) · `GET /users/:id/card` genişletildi (bio/memberSince/mutualFriends/mutualGuilds) erişim kuralı + minör koruması KORUNDU · `toUserDto` bio/dmPolicy
- [ ] Birleşik ayarlar modalı (Hesap=mevcut Section'lar taşındı · Profil=bio · Gizlilik=dmPolicy); UserCard popover'dan açılır; **boş/future sekme YOK**
- [ ] Profil görüntüleme: DmProfilePanel genişletme + tam-profil modalı (bio güvenli render + linkler · ortak arkadaş/sunucu · mevcut aksiyonlar)
- [ ] `nest build`+`vue-tsc`+`vite build` temiz; birim test (PATCH doğrulama; card genişletme erişim/minör koruma; mutual hesap; dmPolicy-minör bağımsızlık)
- [ ] **R7-hafif:** PM inceler (erişim kapısı korundu, minör sızmaz, dmPolicy minör korumayı delmez)
- [ ] Sahip canlı test: profil düzenle (bio+link) → başka hesaptan tam-profil gör (bio render, ortak sunucu/arkadaş); dmPolicy değiştir; minör profili statü sızdırmaz

---

## §8 — Sapma Kuralı

Endpoint/DTO/şema sapması → dev DURUR, PM'e döner. **Avatar/banner upload yüzeyi açma, yeni bildirim-tercih tablosu, OAuth bağlantı, username değişimi → bu sözleşme DIŞI** (PM+sahip kararı). C5 = bio + dmPolicy-gizlilik + profil-görüntüleme + ayarlar-modalı ile sınırlı; erişim/minör koruması mevcut haliyle korunur.
