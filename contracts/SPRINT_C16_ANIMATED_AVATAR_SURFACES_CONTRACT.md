# SPRINT C16: Hareketli avatarın DM paneli ve mesaj listelerinde gösterimi

> Durum: **TASARIM KİLİTLİ (2026-10-26).** PM compose (Opus). Sahip isteği: DM sağ profil panelinde afiş ve avatar
> hareketli olsun; mesaj üstündeki avatar fare üstüne gelince canlansın (1-1 DM, grup DM, kanal).
> C13 §2.5'te bilinçli ertelenen "liste avatarlarında hover animasyonu" kalemi. Sıra: **api → web** (paralel yazılabilir).
> **Mobil kapsam DIŞI** (hover yok). R7 değil: hareketli adres zaten profil kartında herkese açık, yeni ifşa yok.

---

## §0 Kararlar
- **Hover'da canlanma, varsayılan statik.** Mesaj listesinde hareketli dosya yalnız fare avatarın ya da mesaj
  satırının üstündeyken yüklenir (Discord modeli). Bant genişliği ve dikkat dağınıklığı için.
- **`prefers-reduced-motion: reduce`** → hiçbir yerde canlanmaz (C13 kuralı).
- **DM profil paneli her zaman hareketli** (kullanıcı kartı ve tam profil ile aynı davranış).

## §1 Backend
- `messages.service.ts`, `dm.service.ts` ve gateway'deki **mesaj yazarı select'leri** (bugün ~12 kopya
  `{ id, username, avatarUrl }`) tek paylaşılan sabite çıkar (Rule of Three, gecikmiş). Sabit `avatarAnimatedUrl`'i içerir.
- Mesaj DTO'sunun `author` alanına opsiyonel `avatarAnimatedUrl: string | null`. Gateway'in yayınladığı
  `message.created` / güncelleme olaylarında da aynı alan.
- Başka alan, başka select **değişmez** (üye listesi, ses, bildirim C13 kararıyla statik kalır).
- Test: mevcut mesaj testleri geçer; yazar şeklinde yeni alanın bulunduğunu doğrulayan birim test.

## §2 Web
1. `DmProfilePanel.vue`: afiş ve avatar C13'ün `animatedOrStatic` yardımcısını kullanır.
2. Mesaj satırındaki yazar avatarı: satır ya da avatar hover'dayken `author.avatarAnimatedUrl`, değilse `avatarUrl`.
   Alan yoksa (eski olay/önbellek) statik. Aynı bileşen 1-1 DM, grup DM ve kanalda kullanılıyorsa tek değişiklik;
   değilse üç yerde aynı yardımcı.
3. Ardışık mesajlarda avatar gizliyse (gruplama) hiçbir şey değişmez.
4. `vue-tsc -b` (bilinen 6) + `vite build`.

## §3 DoD
- [ ] api: yazar select'i tek sabit + `avatarAnimatedUrl` (REST + WS) + test; build + jest
- [ ] web: DM paneli hareketli; mesaj avatarı hover'da canlanıyor (DM, grup DM, kanal); reduced-motion statik
- [ ] Sahip turu (web + masaüstü)

## §3b Ek (sahip 2026-10-26): sağdaki üye listeleri
Sahip kararıyla **üye listeleri kapsama girdi** (§4'teki ilk yasak bu iki yüzey için kalktı):
- Kanal/ortam üye paneli (`GET` ortam üyeleri, `guilds.service.ts getMembers` → `GuildMemberDto`) ve grup DM'nin
  sağdaki katılımcı listesi (`dm.service.ts` DM kanal üyeleri select'i → ilgili DTO) opsiyonel
  `avatarAnimatedUrl: string | null` taşır.
- Web: bu iki listede satır hover'dayken hareketli, değilse statik; reduced-motion statik (mesaj satırıyla aynı kural).
- Ses ve bildirim yüzeyleri yine statik.

## §4 Sapma kuralı
Şunlar → DUR: ses/bildirim DTO'larına yayma · mobil değişiklik · şema değişikliği.
