# Sprint C7 — Medya Genel Kanallara Açılım (Kamera + Ekran) Sözleşmesi

> Kök + tier `CLAUDE.md`. **Tek doğruluk kaynağı bu dosya.** Sapma → DUR, PM'e dön. Envelope `{ success, statusCode, data }`.
> Türetildiği yer: sahip kararı 2026-06-30 (brief §4 kritik-kuralı bilinçli gevşetme) + bu kararı çerçeveleyen muhalefet/kemer turu.
> Genişlettiği / **kısmen ters çevirdiği** yer: `SPRINT_C4_VIDEO_SCREEN_CONTRACT.md` (kapı 2 "minör mutlak ret" + kapı 5 "bağlam yetişkin-yalıtılmış").
> Bağlı karar-logları: PLAN Track A "A4-bağlantı minör yayın-İZLEME politikası" (2026-06-19) · A5 public link · A1/A2 (kanıt-hattı/hukuk).
>
> **🔴 EN YÜKSEK ÇOCUK-GÜVENLİĞİ RİSKİ.** Bu sprint, C4'ün "minör → ASLA video" mutlak kuralını **bilinçli** gevşetir:
> minör, **yalnız genel (mixed-age) kanalda ve yalnız admin o kanalda medyayı açtıysa** kamera/ekran kullanabilir.
> Gevşetme sahip kararıdır (brief §4), "AI gevşetti" DEĞİL. Karar, aşağıdaki kemerler **birlikte** gittiği için onaylandı;
> kemerlerden biri düşerse gevşetme geçersizdir.
>
> **R7 ZORUNLU (satır satır insan incelemesi):** `resolveVideoSources` + yeni `mediaEnabled` kapısı + yetki-baypas
> invariant'ı T&S karar fonksiyonlarıdır. İnsan incelemesinden geçmeden merge EDİLMEZ.

---

## 0. Değişmez sınırlar (sahip kararı 2026-06-30 + kemerler)

1. **Medya genel kanalda açık, ama admin-kapılı.** Kamera + ekran, `adultsOnly`/`ageGated` OLMAYAN GUILD_VOICE kanalında da kullanılabilir — **ancak** kanalın `mediaEnabled === true` olması şartıyla. Yeni kanalda **default OFF**; admin bilinçle açar.
2. **Minör artık genel kanalda medya kullanabilir.** C4 kapı 2 (minör mutlak ret) GUILD_VOICE için kalkar. Gerekçe (sahip): beyana-dayalı yaşla yalan-beyan zaten yapısal çözülemez; dürüst 16-18 kitlesini sıkmak yerine müdahale-anı + hesap-verebilirlik. **Kalan açık = yaş yalan-beyanı → e-Devlet (PLAN Track A / D2) kapatır.**
3. **18+ alan minöre KAPALI kalır + yetki-baypas YASAK.** Hiçbir rol, taşıma (R11 move), davet veya erişim yolu bir minörü `guild.adultsOnly` ortama veya `channel.ageGated` kanala **yerleştiremez** (§D, çekirdek invariant). Bu kemer koşulsuzdur.
4. **EKRAN = KAMERA, tek per-kanal toggle.** Risk profilleri farklı ama admin kontrolü tek `mediaEnabled` ile sade tutulur (Rule of Three: per-kanal kamera/ekran ayrımı gerçek ihtiyaç doğmadan ayrılmaz). Global `CAMERA_ENABLED`/`SCREEN_ENABLED` master kill-switch olarak **kalır**.
5. **Yaş-bandı İFŞA EDİLMEZ.** Katılımcının minör/yetişkin durumu odaya/UI'a gösterilmez (minörü ifşa = predatöre hedefleme aracı; sahip kararı, kurul teslim etti).
6. **Nudge'lar koruma katmanıdır, kapı değil.** Self-kamera uyarısı + ekran-paylaşımı gizlilik uyarısı (§E). Herkese, bağlama bağlı, **bir kez**, çıkış yoluyla eşli. Kapıyı değiştirmez; kullanıcıyı kendi kararında uyarır.
7. **Kanıt: metadata tabanı ŞİMDİ, içerik-tamponu LANSMANA.** Video oturumu metadata'sı (kim/kiminle/ne zaman/hangi kanal) her zaman loglanır. Rapor-anı içerik tamponu (son N sn) + yetkiliye-ihbar hattı **A1/A2 lansman kapısına bağlı** — o hat olmadan içerik yakalanmaz (CSAM saklama yükümlülüğü). Bugün de facto metadata-only.
8. **KAYIT/EGRESS YOK (carry-over).** Sunucu-taraf sürekli kayıt yok; `EgressClient` yok. Kanıt-tamponu (lansman) istemci-taraf rapor-anı, kitlesel kayıt değil.
9. **DM / GROUP_DM DEĞİŞMEZ.** Bu gevşetme yalnız GUILD_VOICE (topluluk + admin gözetimi + raporlanabilir). DM 1-1 minör↔yetişkin video **ASLA** kalır (gözetimsiz 1-1 = klasik grooming mecrası). GROUP_DM tüm-üye-yetişkin kuralı korunur. (Sahip isterse ayrı kararla revize; bu contract'ta DIŞ.)

### 0.1 İLERİ-KISIT — A5 public link kesişimi (eşik-borcu, bugün inert)

> Bugün canlı değil: A5 public davet linki build edilmedi + `REGISTRATION_MODE=invite`. Genel kanalda public keşif YOK → kararın bugünkü yüzeyi güvenli.
> **A5 canlıya gelince ZORUNLU:** "medya-açık genel kanal + public keşif" = keşfedilebilir yetişkin→minör kamera yüzeyi (kurulun en-riskli vektörü, 2026-06-19). O an bu kesişim, kurulun önceki kapısına tabi olur (**vetlenmiş / karşılıklı-arkadaş kapalı bağlam; açık/keşfedilebilir sunucuda medya minöre açık DEĞİL**). PLAN borç tablosu D23 + A5 maddesi bu kapıyı taşır. **A5 sprint'i bu kapıyı yazmadan public link açılmaz.**

---

## A. Şema (`api/prisma`)

**Yeni alan:** `Channel.mediaEnabled Boolean @default(false)`.

- Anlamı: bu GUILD_VOICE kanalında kamera/ekran yayını grant edilebilir mi (admin kontrolü). Default `false` (genel kanalda medya kapalı gelir).
- **Migration ZORUNLU + DB'ye uygulanır** (`prisma migrate dev` → prod `migrate deploy`; `migrate status` temiz). Mock-Prisma build/test bunu yakalamaz — DoD'da `migrate status` temiz şartı var.
- **C7.1 (sahip 2026-06-30):** medya **tek başına** `mediaEnabled` toggle'ına bağlı. `adultsOnly`/`ageGated` (18+) bir yaş-erişim ayarıdır, medya ayarı DEĞİL → tek başına medya **AÇMAZ**. 18+ kanalda da kamera/ekran için admin `mediaEnabled` açmalı. (Önceki C7 "yetişkin bağlamı bağımsız medya alır" auto-grant'ı kaldırıldı — daha az grant, T&S açısından güvenli/nötr.)

---

## B. Backend — kanal ayarı (`modules/channels`)

### B1. `mediaEnabled` toggle endpoint'i
- Mevcut kanal güncelleme yolu (`PATCH /channels/:id` veya kanal-ayar endpoint'i — mevcut imzayı KULLAN, yeni yol açma) `mediaEnabled?: boolean` kabul eder.
- **Yetki:** OWNER/ADMIN (kanal yönetimi yetkisi olan; mevcut `MembershipService`/yetki kontrolünü reuse et, yeni RBAC katmanı ekleme).
- **Yalnız GUILD_VOICE'ta anlamlı.** Text kanalda `mediaEnabled` set edilse bile §C grant'i yalnız voice bağlamında bakar (no-op; ama API tutarlılığı için reddetmeye gerek yok — voice-only validasyonu opsiyonel, over-engineering yapma).
- `ChannelDto`'ya `mediaEnabled` eklenir (istemci admin UI için okur).

---

## C. Backend — `resolveVideoSources` revizyonu (`modules/voice`) **(R7 — çekirdek)**

> C4'ün sıralı kapı modeli KORUNUR. Değişen yalnız **kapı 2** ve **kapı 5 GUILD_VOICE dalı**. Diğer kapılar (bayrak, karantina, mute, DM/GROUP_DM) **birebir aynı**.

**Revize kapılar:**

1. **Bayrak:** (değişmez) `CAMERA_ENABLED`/`SCREEN_ENABLED` global master. İkisi de kapalı → erken `[]`.
2. ~~Minör mutlak ret~~ → **KALDIRILDI (GUILD_VOICE için).** Minör artık kapı 5'in izin verdiği genel kanalda yayınlayabilir. **DM dalında minör reti KORUNUR** (kapı 5 DM bölümü). Karantina/mute kapıları minörü de zaten kapsar.
3. **Karantina:** (değişmez) `resolveCanPublish === false` → `[]`. OWNER/ADMIN muafiyeti aynı.
4. **Server-mute:** (değişmez) `isVoiceMuted` → `[]`.
5. **BAĞLAM kapısı (revize):**
   - **`GUILD_VOICE` (C7.1):** video grant'i = **`channel.mediaEnabled === true`** ise verilir, değilse `[]`. `ageGated`/`adultsOnly` artık medya açmaz (tam ayrıştırma).
     - 18+ kanalda medya istiyorsa admin `mediaEnabled` açar; minör tarafı değişmez (minör 18+'a giremez; genel kanalda medya yine toggle'a bağlı).
     - Genel kanal (üçü de false) → **video YOK** (medya admin tarafından açılmamış). `mediaEnabled=true` genel kanal → **minör dahil herkese** medya açık.
     - **Minör yalnız burada medya alır:** genel + `mediaEnabled` kanal. `adultsOnly`/`ageGated`'a zaten giremez (§D + erişim kapısı).
   - **`DM` (1-1):** (değişmez) video yalnız iki taraf da yetişkinse. Minör↔yetişkin DM → audio var, video `[]`.
   - **`GROUP_DM`:** (değişmez) yalnız TÜM üyeler yetişkinse; bir minör → `[]`.

**Fail-closed korunur:** her belirsiz dalda `[]`. `mintToken` çıktıyı `canPublishSources`'a ekler; `canPublishCamera/Screen` (C4-C2) `resolveVideoSources` sonucunu yansıtır. C4-C3 kısa-TTL + bağlam-değişiminde re-mint **korunur** (artık `mediaEnabled` değişimi de bayatlatır → kanal-ayar değişince istemci re-mint; mevcut re-mint tetikleyicisine `mediaEnabled` eklenir).

---

## D. Yetki-baypas invariant'ı (çekirdek, koşulsuz kemer) **(R7)**

> Tek cümle: **hiçbir yol bir minörü 18+ bağlama yerleştiremez.** Aşağıdaki her giriş noktası bu invariant'ı uygular; tek-katmana güvenilmez (savunma derinliği).

- **Voice taşıma (R11 `moveParticipant`):** hedef kanal `ageGated` veya hedef guild `adultsOnly` ise ve taşınan üye `isMinor` → **reddet** (403/uygun envelope). D15 hiyerarşi borcundan bağımsız ek kapı.
- **Erişim/join:** mevcut C4/T1 kapısı (`guild.adultsOnly && isMinor → 403`) + `channel.ageGated && isMinor → erişim yok` **korunur**; bu sprint zayıflatmaz.
- **Rol/izin grant'i:** bir rol bir minöre `ageGated` kanal erişimi veremez — kanal erişim çözümü minör + ageGated → görünür-kilitli/erişimsiz kalır (mevcut [[ozel-kanal-gorunur-kilitli]] + ageGated kapısı). Rol yoluyla baypas testi DoD'da.
- **Test (R7 aranacak):** her giriş noktası için "minör + 18+ hedef → ret" testi yeşil.

---

## E. Frontend — nudge'lar + medya kontrolleri (`web/`)

### E1. Medya kontrolleri (yetenek-kapılı — C4-D1 deseni korunur)
- Kamera/ekran butonları `canPublishCamera/Screen` token bayraklarına bağlı (C4). `mediaEnabled=false` genel kanal → sunucu grant vermez → buton yok (disabled placeholder bile değil; [[ui-bos-placeholder-sismeme]]).
- Admin kanal-ayar UI'ına **medya aç/kapa** toggle'ı (`mediaEnabled`) eklenir (mevcut kanal ayar yüzeyi; yeni ekran açma).

### E2. Nudge: kamera açışta (herkese, bağlama bağlı, bir kez)
- **Tetik:** kullanıcı genel/açık GUILD_VOICE kanalda **ilk kez** kamerasını açarken. DM'de, kapalı küçük kanalda, minör-yok bağlamda **çıkmaz**. Seçim hatırlanır ("tekrar gösterme" / per-kanal-session hatırla) → her toggle'da değil.
- **Ton:** korku değil kontrol. Örn: *"Kameranı açıyorsun. Bu kanaldaki herkes seni görebilir. Rahatsız eden olursa ayrıl veya bildir."* **Çıkış yoluyla eşli** (ayrıl / bildir / acil buton görünür).
- **Yaş-nötr:** minöre özel metin/işaret YOK (§0.5). Herkes aynı uyarıyı görür.

### E3. Nudge: ekran paylaşımı açışta (herkese, bağlama bağlı, bir kez)
- **Tetik:** ilk ekran paylaşımı (per-session). **Ton:** tek satır, gizlilik-lehine. Örn: *"Ekranını paylaşıyorsun. Bildirimlerini ve özel sekmelerini kapatmayı unutma."*
- Detaylı ipuçları (konum/kimlik/kart sızıntısı, tatil-fotoğrafı örnekleri) **modal'da DEĞİL** → ayrı "Güvenlik ipuçları" sayfasına link. Modal vaaz olmaz.

### E4. Nudge altyapısı — sade tut
- Yalnız **iki yüzey** (kamera + ekran). Yapılandırılabilir "güvenlik-ipucu motoru" KURMA ([[overengineering-kacin]]). Hatırlama state'i istemci-taraf basit (localStorage / per-session) yeterli; sunucu-taraf tercih saklama YAGNI.
- Tüm metin i18n (`tr.json`, `voice.nudge.*`); gömülü string yok; `--kv-*` token.

---

## F. Kanıt / metadata (T&S)

- **Şimdi (bu sprint):** video oturumu metadata'sı sağlam loglanır — kim, kiminle, hangi kanal/guild, ne zaman başladı/bitti. Mevcut `VoiceSession` üzerine oturur (ayrı tablo YAGNI, C4 carry-over). Acil-buton snapshot'ı (A4) "o an kim yayında/ekran paylaşıyor" zaten metadata yakalıyor → reuse.
- **Lansmana bağlı (bu sprint DIŞ, PLAN'a borç):** rapor-anı istemci içerik-tamponu + yetkiliye-ihbar hattı. **A1 (CSAM tarayıcı) + A2 (hukuk/saklama) kapısına bağlı** — muhtemel-CSAM içeriği yakalayıp saklamak güvenli-karantina + ihbar-yolu olmadan yapılamaz. O hat kurulana kadar de facto metadata-only.

---

## G. DoD (Sprint C7)

- [ ] `Channel.mediaEnabled` (default false) + **migration uygulanmış** (`migrate status` temiz; [[migration-uygulanmali]]).
- [ ] `mediaEnabled` toggle endpoint'i (OWNER/ADMIN, GUILD_VOICE); `ChannelDto.mediaEnabled`.
- [x] `resolveVideoSources` revize: kapı 2 GUILD_VOICE'tan kalktı (DM minör reti korundu); kapı 5 GUILD_VOICE = **`mediaEnabled` (yalnız)** — C7.1 tam ayrıştırma, ageGated/adultsOnly medya açmaz. **R7 geçti (sahip imzası 2026-06-30).**
- [ ] Yetki-baypas invariant'ı (§D): move + erişim + rol yollarında "minör + 18+ hedef → ret"; testleri yeşil.
- [ ] Re-mint tetikleyicisine `mediaEnabled` değişimi eklendi (bağlam bayatlaması).
- [ ] Frontend: admin `mediaEnabled` toggle UI · yetenek-kapılı kamera/ekran kontrolleri (C4 deseni) · kamera nudge'ı (E2) · ekran nudge'ı (E3) · "Güvenlik ipuçları" sayfası/linki · hepsi bağlama-bağlı-bir-kez.
- [x] Backend testleri yeşil — **özellikle:** genel kanal `mediaEnabled=false` → video yok · genel `mediaEnabled=true` → **minör dahil** medya var · **C7.1: `adultsOnly`/`ageGated` + `mediaEnabled=false` → video YOK** (18+ tek başına medya açmaz) · 18+ + `mediaEnabled=true` → video var · minör → adultsOnly/ageGated move/erişim/rol = ret · DM minör↔yetişkin → video `[]` (değişmedi) · bayrak kapalı → audio-only birebir.
- [ ] `nest build` + `vue-tsc`/`vite build` temiz; envelope tutarlı; Swagger güncel.
- [ ] Tüm yeni metin i18n; yaş-bandı UI'da hiçbir yerde ifşa edilmiyor.

---

## H. Kapsam DIŞI (bu sprint yapma)

- Rapor-anı içerik-tamponu + ihbar hattı (→ A1/A2 lansman kapısı, §F).
- DM/GROUP_DM minör video gevşetmesi (§0.9 — ayrı sahip kararı gerekir).
- A5 public-link kesişim kapısı (§0.1 — A5 sprint'i, eşik-borcu D23).
- Per-kanal kamera/ekran AYRI toggle (tek `mediaEnabled` yeterli; gerçek ihtiyaç doğmadan ayırma).
- Sunucu-taraf kayıt/egress · video-özel moderasyon endpoint'i (mevcut mute yeterli — C4 carry-over) · yaş yalan-beyanı çözümü (→ e-Devlet, Track A/D2).
