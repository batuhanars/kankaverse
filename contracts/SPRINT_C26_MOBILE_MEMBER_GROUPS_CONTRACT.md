# SPRINT C26: Mobil üye listesi gruplaması web ile eşit

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Sahip bulgusu. **Yalnız mobil (JS)**, vc31.
> **R7-nötr:** çevrimiçi görünürlüğü sunucuda (`PresenceService.canSeePresence`); istemci yalnız gelen durumu okur.
> M2c §4.3'ün gruplama kuralını **bu sözleşme değiştirir**.

## §0 Neden
M2c'de mobil üye listesi her özel role göre gruplanıp kalanlar "Rolsüz" başlığında toplanıyordu (o gün hoist ve mobil
presence yoktu). Web (`web/src/components/layout/MemberPanel.vue` `groups`) Discord kuralını kullanıyor; iki istemci
ayrıştı.

## §1 Kural (web ile birebir)
1. Üyeler çevrimiçi (durum `offline` değil) / çevrimdışı diye ayrılır (`usePresenceStore`; haritada yok = çevrimdışı).
2. Çevrimiçi üyeler, **yalnız `hoist: true`** rolleri arasında en yüksek `position`lı role göre gruplanır; başlık
   `member.hoistGroup` (rol adı + sayı), gruplar `position` DESC.
3. Hoist rolü olmayan çevrimiçiler: `member.online` ("Çevrimiçi — {n}").
4. Tüm çevrimdışılar (rolüne bakılmaksızın): `member.offline` ("Çevrimdışı — {n}").
5. Boş grup gösterilmez. Durum değişince liste canlı güncellenir (store aboneliği).
6. `mobile.channelDetails.noRoleGroup` anahtarı kullanılmıyorsa `tr.json`dan kaldırılır.

**OUT:** sunucu değişikliği · grup içi sıralama değişikliği (bugünkü sıra korunur).

## §2 DoD
`npm run typecheck`, `npm run lint`. Sahip turu: web ve telefonda aynı ortamın listesi aynı gruplarla görünür.
