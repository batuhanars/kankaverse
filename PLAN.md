# Kankaverse — V1 PLAN.md

> Genel mimari yol haritası ve V1 kapsam kilidi. Aktif sprint sözleşmesi `contracts/SPRINT_X_CONTRACT.md`'de;
> canlı ilerleme `TASK.md`'de. Brief: `knowledge/projects/kankaverse/kankaverse-proje-brief.md`.
> Ortam ayarları vizyon/kademe haritası: `ORTAM_AYARLARI_ROADMAP.md` (V1→V3, sözleşme değil — referans).

---

## Vizyon (özet)

Türkiye pazarı için sıfırdan, topluluk odaklı gerçek zamanlı iletişim platformu. Değer önerisi "yasaklının
yerlisi" değil; **kalıcı avantajlar:** Türkçe moderasyon/güvenlik, yerel ödeme (kur avantajı), KVKK + yerel
barındırma, ve **çocuk güvenliğinin mimariye gömülü olması** (Discord'un en eleştirilen alanı).
Beachhead kitle: Türk oyuncu toplulukları.

---

## V1 Kapsam Kilidi

V1 = "Discord'un iskeleti, sadece metin" + T&S çekirdeği + opsiyonel e-Devlet doğrulama. **Kapsam kilitlidir;
kapsam kayması walking skeleton'ın en büyük riskidir** (brief §11.2 tetikleyici: 8 haftada canlı değilse
kapsam yeniden tartışılır).

**V1'e DAHİL:** sunucu(guild)/kanal/üyelik, kanal mesajlaşma + DM/grup DM, dosya paylaşımı, auth+2FA,
T&S temel katmanı, presence/yazıyor göstergesi/bildirimler, opsiyonel e-Devlet doğrulama. Göç aracı V1 adayı.

**Bilinçli ertelemeler (brief §9):** mesaj arama → V2. Ses/video/ekran paylaşımı → V2 (LiveKit). Bot API'si,
gelişmiş izin matrisi, sunucu keşfet → V3. Electron masaüstü → V2 ile. Flutter mobil → V4. Türkçe toksisite
filtresi V1'de kelime-listesi tabanlı başlar (özel model yap/al kararı V2 açık sorusu).

**Veri modeli kaynağı:** brief §7. Prisma şeması sprint sprint bu haritadan büyür; T&S alanları (yaş durumu,
görünürlük ayarları, şikâyet/audit) çekirdeğin birinci sınıf parçasıdır — sonradan eklenen yama değil.

---

## Sprint Haritası

> Yalnızca **Sprint 1 detayda kilitli** (`contracts/SPRINT_1_CONTRACT.md`). Sonraki sprintler yönseldir; her biri
> başlamadan önce kendi contract'ıyla kilitlenir.

| # | Kapsam | Notlar |
|---|---|---|
| **1** | **Walking skeleton:** kayıt→giriş→sunucu→kanal→gerçek zamanlı metin mesajı, uçtan uca | İlk çapa topluluk denemesi burada. Kapsam: `contracts/SPRINT_1_CONTRACT.md` |
| **2A** | **Auth sertleştirme I:** e-posta doğrulama + "doğrulanmamış=kısıtlı" kapısı, şifre sıfırlama (forgot), `EmailService` (Resend) soyutlaması | brief §8. R7 (tamamı). Kapsam: `contracts/SPRINT_2A_CONTRACT.md` |
| 2B | Auth sertleştirme II: 2FA TOTP + kurtarma kodları, oturumlarım ekranı, hassas işlem reauth + e-posta değişimi, hesap silme (gated: 30 gün + legal-hold hook), zamanlanmış job (`@nestjs/schedule`) | brief §8. R7. Kapsam: `contracts/SPRINT_2B_CONTRACT.md`. Kalıcı purge R6 KVKK + Report (Sprint 4) sonrası |
| 3 | **1-1 DM** + arkadaşlık (kod ile) + UserBlock + **`DmPermissionService.canDm` merkezi karar fonksiyonu** (grup DM sonraya) | brief §13 #2 — dmPolicy+isMinor+arkadaşlık+blok+ortak sunucu+karantina(hook) tek noktada. R7. Kapsam: `contracts/SPRINT_3_CONTRACT.md` |
| 4 | T&S çekirdeği: minor varsayılan kısıtları (DM/medya/keşif/profil), yaş-kapılı kanal, Report + `contextSnapshot` + öncelikli moderasyon kuyruğu, ModerationAction, AuditLog. **+ Sprint 4 Girdileri G1-G4** (minör cold-ekle kapısı, tıkla-ekle [G1-kapılı], engel-mesaj belirsiz, inbox soft-delete) | brief §5. R7. Hukuki görüş önü. **Kapsam büyük → bölünebilir (4A/4B)** |
| **5** | Dosya paylaşımı: S3-uyumlu depolama (MinIO dev) + presigned URL + Attachment `scanStatus` + iliştirme | Kapsam: `contracts/SPRINT_5_CONTRACT.md`. **CSAM tarama GATED hook** (R5+hukuk; gerçek tarayıcı lansman-öncesi zorunlu) |
| 6 | Presence/çevrimiçi durumu + yazıyor göstergesi + bildirimler | brief V1 kapsamı ("Discord hissinin asgarisi") |
| **7A** | **Davet sistemi (Invite) + adultsOnly kapısı (join+erişim) + ortam ayarları ekranı.** Ham-ID join kaldırılır (**T1 kapanır**), 2-hesap e2e açılır | brief §4/§10. R7. Kapsam: `contracts/SPRINT_7A_CONTRACT.md` (PM+sahip 7A/7B böldü 2026-06-13) |
| 7B | Türkçe automod (kelime-listesi, **block-on-send kayıtsız** — hukuk-nötr, sahip kararı) + yeni üye karantinası (`canDm`/`canSendFriendRequest` karantina hook'larını bağlar) | R7. Tasarım: `design/kankaverse_sunucu_ayarlari`. 7A sonrası |
| 8 | e-Devlet opsiyonel doğrulama + doğrulanmış rozeti | brief §4. Doğrulama erişim ayrıcalığı TANIMAZ (kritik kural) |
| 9 | Göç aracı (Discord sunucu yapısı içe aktarma) | brief §10.2 — GTM'in en değerli teknik yatırımı, V1 adayı |
| 10 | Beta sertleştirme, gizlilik politikası (R4 şeffaflık), config-tabanlı limitler + entitlement/plan dikişleri | brief §12 gelir modeli dikişleri (refactor değil config) |
| **11** | **Ortam derinleştirme:** kanal CRUD (ekle/adlandır/sil + UI; backend POST var) + ortam ikonu yükleme (`Guild.iconUrl` var + Sprint 5 upload) + ortam kuralları metni | V1 boşluğu (kurul 2026-06-13). Granular roller→V3, ses→V2, kategoriler→V2 |

> **Sıralama revizyonu (kurul + sahip 2026-06-13, güncel):** **4B iskelet ✓ → 11 (ortam derinleştirme ✓) → sistem
> cilası (yavaş mod vb.) → 10 (önizleme-hazırlık: gizlilik/aydınlatma metni + config-tabanlı limitler) → kapalı
> yetişkin-davetli önizleme.**
> **ERTELENDİ → V2:** **8 (e-Devlet)** opsiyonel doğrulama · **9 (göç aracı)** — sahip onayı 2026-06-13: göç büyük
> dış-entegrasyon işi, kapalı önizleme için kritik değil, **Discord-OAuth hesap/rol içe aktarma** vizyonuyla aynı V2
> paketine girer (doğal eşleşme).
> Sahip işleyişi PM'e (Opus) devretti — proaktif compose, kritik kararda kurul/Fable, V2-eşiğinde özet→ortak inceleme.
> **4B disposition:** hukukçu sessiz/deneyimi belirsiz → CRUD iskeleti (Report/kuyruk/ModerationAction/AuditLog + temel
> şikâyet CANLI + ban-erişim bağlama) **şimdi kurulur**; **CSAM akışı + `contextSnapshot` içerik-yakalama STUB kalır**
> (kurul: yanlış CSAM/kanıt-saklama = cezai/KVKK sorumluluk, "bedava revize" değil). Deneyimli hukuk görüşü gelince §3 doldurulup revize edilir. **Açık beta DEĞİL** — kapalı, yetişkin-davetli, dosya-kapalı, gizlilik-bildirimli önizleme (kurul muhalefeti).

---

> **Cross-cutting — UI Redesign (2026-06-12):** Discord-yakın UI'dan **özgün tasarım diline** geçiş (hukuki trade-dress
> riski + marka farklılaşması). **Frontend-only, sıfır backend, V1 kapsam kilidi korunur** — mockup'taki gelecek özellikler
> (göç/oyun mağazası/sesli/keşfet/etkinlik) ROADMAP'te kalır. Sözleşme: `contracts/UI_REDESIGN_CONTRACT.md`. Sprint'lere
> paralel ilerler; R7 kapsamı yok (saf görsel). Fable: token/dil + altıgen + "Alan/Topluluk" terminolojisi (brief §12).

## Sprint 4 Girdileri — PM+kullanıcı onaylı T&S/ürün kararları (2026-06-12, canDm R7 sonrası)

> Sprint 3 `canDm` R7 incelemesinden çıkan kararlar. **Sprint 4 contract'ı bunları kilitleyecek.** Tartışma kapandı, onaylı.

- **G1 — Minör koruması = görünmez varsayılan kısıt (F1, çekirdek T&S):** Arkadaşlık DM bariyerini kırar (by-design, `canDm` doğru). Asıl koruma **arkadaş-isteği/cold-ekle anında**: bir taraf minörse cold-istek/tıkla-ekle **varsayılan KISITLI**. "Çocuk ekliyorsa tanışmıştır" varsayımı REDDEDİLDİ (grooming vektörü; brief mimariye-gömülü çocuk güvenliği). **Minör statüsü UI'da ASLA gösterilmez** (sızıntı=risk); koruma sessiz çalışır. İlke: "ulaşımı zorlaştır".
- **G2 — Tıkla-ekle (kod istemeden, ortaktan):** detay kartı (`+user` ikonu) → `userId` ile istek. **Backend gerekir** (`POST /friends/request { userId }` veya benzeri, T&S kapılı). **G1 korumalarından ÖNCE canlıya ALINMAZ** (sıralama kritik — yoksa tam o delik açılır). → Sprint 4'e bağlı.
- **G3 — Engel mesajı belirsiz (F2):** engellenen kişiye "X sizi engelledi" DEĞİL, jenerik "bu kullanıcıya mesaj gönderemezsiniz" (textarea pasif). Tacizciye blok onayı vermez. Küçük FE+BE düzeltmesi.
- **G4 — Inbox soft-delete:** kullanıcı DM'i kendi listesinden temizleyip sıfırdan açabilir. **Soft-hide** — altdaki mesaj kaydı moderasyon/Report (`contextSnapshot`) için DURUR; hard delete YOK (kanıt imhası engellenir).
- **F3/F4/F5 (aksiyon yok):** engelleme öncesi eski mesaj okunabilir (Discord-benzeri, kabul) · `verificationStatus` hook'u Sprint 8'e dek ölü-select (kalsın) · `findUnique` extendedWhereUnique Prisma 5+ (çalışıyor).

## Mimari Kararlar (kilitli — `CLAUDE.md` cascade'de detay)

- Backend: NestJS + Prisma + PostgreSQL. Frontend: Vue 3 SPA (V1 birincil istemci).
- API sözleşmesi = OpenAPI tek doğruluk kaynağı. Response envelope `{ success, statusCode, data }`.
- Auth: argon2id + JWT access ~15dk + rotasyonlu refresh (Session'a bağlı, aile-iptal).
- Gerçek zamanlı: Socket.IO + **Redis adapter ilk günden**.
- i18n gün 1 (vue-i18n, UI Türkçe). Tasarım sistemi: design-tokens dosyası tek kaynak.
- **Stack KİLİTLİ:** Vue/Nuxt + Flutter + NestJS (brief §3 — React/RN değerlendirildi, reddedildi).
- Ölçek hazırlığı: Message tablosu `(channelId, createdAt)` indeksi; partitioning büyüme eşiğinde.

---

## Açık Kalemler (Sprint 1'i bloke etmez — ilgili sprint önü kapatılır)

| Kalem | Sahip | Ne zaman gerekli |
|---|---|---|
| `api/.git` yuva sorunu → kökte tek git deposu | Kullanıcı onayı (git işlemi) | Erken (kök contract dosyaları versiyonlanmadan) |
| R5: V1 CSAM hash-tarama aracı seçimi (Cloudflare CSAM / PhotoDNA / NCMEC) + hukuk | Kurucu araştırma + hukuk | **Sprint 5 altyapıyı GATED kurdu**; gerçek tarayıcı + `ATTACHMENT_SCAN_ENABLED=true` **lansman öncesi ZORUNLU** (dosya paylaşımı onsuz canlıya alınmaz) |
| Aylık bütçe tavanı rakamı | Kurucu | Sürekli (gider tavanı ilkesi) |
| Çapa topluluk listesi (3-5) | Kurucu (kendi çevresi) | Walking skeleton sonrası |
| Beta hedef metrikleri (N aktif topluluk, tutundurma) | Kurucu | Beta önü |
| Şirketleşme zamanlaması/türü | Mali müşavir görüşü | Lansman önü (R6) |
| KVKK / reşit olmayan verisi hukuki görüş | Hukuk danışmanlığı | **Brief: `contracts/SPRINT_4B_HUKUK_BRIEF.md`.** Kurul kararı 2026-06-13: 4B iskeleti hukuk beklemeden kurulur (CSAM/snapshot stub); deneyimli görüş gelince §3 doldurulup revize. **Açık beta hukuki metinler + temel moderasyon olmadan yapılmaz** |
| Stack kilidi ADR'ı → `knowledge/decisions-log/` | PM (vault işi) | Ayrı adım |
| 5651 / KVKK yükümlülükleri iş planına işleme | Kurucu | Büyüme eşiği |
| **T&S kapıları uçtan-uca runtime testi** (`canDm`/`canSendFriendRequest`/blok/minör ret) — 2 hesap + ortak ortamda gör→kart→ekle/DM | Kurucu (manuel) + dev | Ortam join/davet UI tam olunca (Sprint 7); birim test + R7 kod incelemesi bağımsız tamamlanır |

---

## Teknik Borç (ertelenmiş düzeltmeler)

> **Eşik-tarama kuralı:** Ertelenen her bulgu buraya yazılır (konuşmada bırakılmaz). Kritik eşik aşıldığında
> (sprint kapanışı / major feature / refactor turu) bu tablo taranır, "sırası gelen" borçlar ele alınır.
> Çözülen satır işaretlenir/çıkarılır.

| # | Borç | Tier | Kaynak | Risk | Durum |
|---|---|---|---|---|---|
| D2 | Üyelik yetki kontrolü 3 yerde tekrar (channels.service, messages.service, gateway) → `MembershipService` | api | denetim #2 | T&S ayrışma | ✅ çözüldü (2026-06-11) |
| D3 | Refresh rotasyon TOCTOU — eşzamanlı refresh yanlış reuse alarmı → tüm aile iptal | api (R7) | denetim #3 | orta | ✅ çözüldü (2026-06-11, grace+atomik claim, R7 onaylı) |
| D4 | WS access token bayatlaması (reconnect eski token) + reconnect rejoin ack yutuluyor | web | denetim #4 | orta | ✅ çözüldü (2026-06-11) |
| F2 | `consumeAuthToken` tek-kullanım atomik değil (TOCTOU, iyi huylu) | api (R7) | 2A R7 review | düşük | ✅ çözüldü (2026-06-11) |
| J1 | join-by-ID UI: `ServerModal` create+join girişini bağladı ("düğme yok" kapandı); ham ID join artık UI'dan erişilebilir | web | Sprint 1 / 2026-06-12 | düşük | kısmen — modal var; gerçek davet kodu/linki Sprint 7 |
| T1 | `guilds.join` `adultsOnly`/minor kapısı yok (minör, ID'yi bilirse adultsOnly sunucuya girebilir). **Pratikte risk düşük:** `adultsOnly` henüz UI'dan ayarlanamıyor (default false) + gerçek kullanıcı yok | api (R7) | 2026-06-12 UI revizesi | T&S (brief §4/§5) | **→ Sprint 7A kapatır** (`contracts/SPRINT_7A_CONTRACT.md`): ham-ID join kaldırılır, davet-join + erişim-zamanı `guild.adultsOnly && isMinor → 403` (iki katman). **Lansman öncesi zorunlu** |
| U1 | Çıkış Yap geçici home sağ-üstte; UserCard çark → SecurityView. **Hedef (profil/ayarlar sprint'i):** UserCard tıkla → popover (`usercard-click-menu.png`) → ayarlar modalı (`settings-modal-profile.png`) sol sidebar EN ALT = Çıkış Yap | web | 2026-06-12 contract-dışı UI | düşük | interim (kullanıcı onaylı); hedef referanslar vault'ta |
| U2 | UserCard ses ikonları (mic/kulaklık) işlevsiz placeholder (ses V2) | web | 2026-06-12 contract-dışı UI | kozmetik | **kabul edildi (kullanıcı)** — yeri belli olsun diye şimdiden konuldu; ses sprint'inde işlevsel olur |
| D5 | Bayat `before` cursor en son 50'yi döndürür; `?limit=` controller'da ölü; WS CORS `*` | api | denetim #5/#6/#8 | düşük | ertelendi (fırsatta) |
| D6 | Hesap silme `cancel` endpoint + `me()` 403 ulaşılamaz (delete tüm session'ları revoke eder; gerçek iptal = login) | api | 2B R7 review #1 | düşük | ertelendi (dokümante/kaldır) |
| D7 | `decryptSecret` `update().toString()+final()` — çok-byte UTF-8 sınır riski (TOTP ASCII olduğundan güvenli) | api | 2B R7 review #4 | kozmetik | ertelendi |
| D8 | `auth.service.ts` ~720 satır, çok sorumluluk → olası `TwoFactorService`/`AccountService`/`SessionService` ayrımı | api (R7) | 2B R7 gözlem | yapısal | ertelendi — **yalnız büyüme/bakım acısı hissedilince böl; temiz kod uğruna over-engineering YAPMA (kullanıcı uyarısı)** |
| D9 | UI Redesign Faz 0 primitive'leri (`Card`/`ContextPanel`/`QuickActionTile`/baloncuk) ayrı dosyaya çıkarılmadı → panel/kart stilleri home bileşenlerine inline (kopya-stil riski sonraki ekranlarda) | web | UI Redesign Faz 1 reconcile / 2026-06-12 | düşük (kozmetik/DRY) | **kasıtlı ertelendi** — Rule of Three henüz tetiklenmedi. **Faz 2 tetikleyici:** DM ekranı aynı panel/kart desenini 2.-3. kez kullanınca → o an `components/ui/Card`+`ContextPanel`'a promote et; yoksa inline kal. Over-engineering YAPMA (kullanıcı uyarısı) |
| D10 | `findMessages` `before` cursor'ı `deletedAt` kontrol etmiyor — silinmiş mesaj cursor olarak verilirse `lt` yanlış tarih alır (D5 cursor borcuyla akraba) | api | Sprint 4A B1 test gözlemi / 2026-06-13 | düşük (kötü-niyet sınırlı: kendi kanalın) | ertelendi (fırsatta D5 ile birlikte) |
| D11 | `joinByInvite` `maxUses` TOCTOU — eşzamanlı join'lerde kontrol atomik increment'le kapılı değil, limit 1-2 aşılabilir | api | Sprint 7A R7 incelemesi / 2026-06-13 | düşük (benign; **çocuk-güvenliği etkisi YOK** — adultsOnly kapısı kullanıcı-başına, yarıştan bağımsız) | ertelendi (gerekirse `updateMany where uses<maxUses` koşullu atomik update) |
| D12 | Davet linki `/invite/:code` rotası yok — kopyalanan link uygulamada 404; katılım kodla çalışıyor (link kozmetik) | web | Sprint 7A frontend / 2026-06-13 | düşük (UX) | ertelendi → derin-link rotası 7B veya sonrası |
| D13 | Öksüz attachment — presign edilip mesaja iliştirilmeyen Attachment kayıtları (S3 obje + DB satır) birikir; temizlik job'ı yok | api | Sprint 5 R7 incelemesi / 2026-06-13 | düşük (storage sızıntısı) | ertelendi → periyodik temizlik (messageId null + eski) job; Sprint 5 scan/upload olgunlaşınca |
| D14 | Ortam ikonu scan-gate'siz public (`icons/` prefix) — yüklenen ikon CSAM taramasından geçmiyor (mesaj eklerinden farklı yol) | api | Sprint 11 R2 / 2026-06-13 | **lansman-kritik** (çocuk güvenliği) | kapalı yetişkin-önizlemede kabul; **lansman öncesi R5 scan ikonlara da uygulanmalı** (attachment scan-gate ile birlikte) |

---

## Riskler (brief §9 — özet)

- **R1 moderasyon kapasitesi (en kritik):** "dakikalar içinde insan moderatör" SLA'i tek kişiyle tutulamaz →
  AI ön-triyaj servisi (Sprint 4+ ayrı tier), davetli/kontrollü büyüme, **büyüme moderasyon kapasitesine endeksli**.
- **R2 cold start:** pazar riski, planla değil gerçek topluluklarla azaltılır (GTM brief §10).
- **R4 E2EE yok (bilinçli):** T&S sunucu-tarafı erişim gerektirir; gizlilik politikasında şeffafça yazılır.
- **R7 AI-ekip sınırı:** auth/oturum + T&S karar fonksiyonları satır satır insan incelemesi (CLAUDE.md zorunluluğu).

---

## V3+ Yol Haritası (PM compose 2026-06-16, "ortam serüveni" kapanışı sonrası)

> **Nerede durduk:** V1 çekirdek + V2 özellikler + V3 (rol/izin enforcement Faz 3 ✓, Ortam Etkinlikleri ✓) bitti.
> Ses/video (LiveKit + DM arama) ✓, arama (kanal+ortam) ✓, moderasyon iskeleti (4B) ✓. **Ortamlar için planlı iş yok.**
> Kuzey yıldızı (brief): kapalı, yetişkin-davetli, dosya-kapalı önizleme → moderasyon kapasitesine endeksli kontrollü büyüme.
> **Sıralama sahip + /kurul kararı** (bu bölüm seçenekleri listeler, kilitlemez).

### Track A — Lansman Kapıları (KRİTİK; gerçek/açık kullanıcıya çıkmadan ZORUNLU)
- **A1 CSAM tarayıcı entegrasyonu** — gerçek araç (Cloudflare CSAM / PhotoDNA / NCMEC) + `ATTACHMENT_SCAN_ENABLED=true`. Açılacak yüzeyler: ekler (gated hazır) · ortam ikonu (D14) · özel emoji · etkinlik kapak görseli. **Kurucu araştırma + hukuk. Bu açılana dek yeni upload yüzeyi açılmaz.** (PLAN Açık Kalemler R5)
- **A2 Hukuki/uyum** — deneyimli görüş → 4B §3 doldur (CSAM akışı + contextSnapshot içerik = şu an STUB), 5651/kanıt-saklama/legal-hold, nihai KVKK + gizlilik metni. **Açık beta bunsuz olmaz** (kurul). (`SPRINT_4B_HUKUK_BRIEF.md`)
- **A3 Moderatör yetki UI** — şu an `isModerator` elle DB; davetli büyüme öncesi minimal mod-atama UI.

### Track B — Etkinlik Motoru (additive; şema ileri-uyumlu hazır)
- **B1 Tekrarlama motoru** — ✅ (sanal/computed occurrence, sıfır-job).
- **B2 Etkinlik hatırlatması** — **→ Track F'e ERTELENDİ (Electron eşiği).** Hatırlatma ancak kullanıcı uygulamaya bakmıyorken ulaşabilirse değerli; teslim katmanı (native OS bildirimi) Electron'la geliyor. Şimdi online-only hatırlatma = atılacak iş (kurul: erişim ~sıfır). Job tasarımı hazır (kurul: null-claim OR-null + tarama+ölü-tek-seferlik ön-süzme; indexli nextReminderAt YAPMA). *(Durum geçişi/ACTIVE = türetildi, job yok.)*
- **B3 Kapak görseli** — ✅ gated (scan-gated Attachment hattı); gerçek tarayıcı A1 ile, `UPLOADS_ENABLED` ile gerçek kitleye kapalı.
- **B4 Paylaş/derin link** — ✅ (`?event=` handler). Takvim/"Sırala & Görüntüle" görünümü → sonraya.

### Track C — Ürün Derinliği (V3 proper)
- **C1 Bildirim sistemi (kalıcı)** — ✅ uygulama-içi (Notification modeli + bell + mention/friend + WS/snapshot + zıplama). **Native teslim (push) → Track F.**
- **C2 Özel emoji** — ertelendi (CSAM A1 kapısı).
- **C3 Forum kanalları** — kanal türü "yakında" disabled → forum işlevi.
- **C5 Kullanıcı profilleri** — profil görünümü/düzenleme (avatar/durum/bio vb.). **Düşük risk** ama minör-statü sızıntısı kuralı korunur (profilde yaş/minör asla görünmez). Şimdi yapılabilir.
- **C4 Video + Ekran Paylaşımı (YAYIN)** — ⚠️ **EN YÜKSEK ÇOCUK-GÜVENLİĞİ RİSKİ.** LiveKit zaten destekler (altyapı var) ama **canlı görüntü hash-taranamaz** (upload gibi değil) → PhotoDNA çözmez; yalnız reaktif moderasyon (rapor + mod ekip) işe yarar. Kurul videoyu bilerek erteledi (2026-06-14). **Kurul T&S verdict ŞART** (minör tam dışlama / adultsOnly-only / feature-flag gated; rapor; kayıt-yok kararı korunur) → sonra **gated** inşa (LiveKit ses deseni). Gerçek-kullanıcı/minör maruziyeti = lansman + moderasyon kapasitesi (R1). UX (sahip 2026-06-16): paylaşanın görüntüsü öncelikli (ekranın yarısı), diğerlerinin avatarları küçülüp altta şeritte sıralanır, tam-ekran büyütme; ortam ses odası + 1-1 DM + grup DM.

> **Masaüstü-öncesi sıra (sahip 2026-06-16):** C5 profiller → C4 ekran paylaşımı/yayın → C4 video. **Ekran paylaşımı + video tek T&S ailesi** (canlı görüntü) → ikisi de kurul-gated. Profil düşük-risk, önce.

### Track F — İstemciler (sahip sırası: Electron masaüstü → Flutter mobil)
- **F1 Electron masaüstü** — mevcut Vue SPA'yı Electron ile sarmala. **Native OS bildirimi** (standard `Notification` API) → C1 akışını masaüstü toast'a bağla (Web Push'a gerek yok) + **B2 etkinlik hatırlatması burada** (job + native teslim tek seferde, tüm türler). Sahip: masaüstü önce.
- **F2 Flutter mobil** — en son (zahmetli); aynı OpenAPI sözleşmesinden Dart istemci. Native push (FCM/APNs) burada.

### Track D — Büyük Bahisler (V3/V4 — strateji/kurul kararı)
- **D1 Göç aracı + Discord-OAuth** (eski Sprint 9) — Discord sunucu yapısı + hesap/rol içe aktarma; GTM'in en değerli teknik yatırımı (brief §10.2). Büyük dış-entegrasyon.
- **D2 e-Devlet opsiyonel doğrulama** (eski Sprint 8) — doğrulanmış rozeti; **erişim ayrıcalığı TANIMAZ** (brief §4 kritik kural).
- **D3 AI moderasyon ön-triyaj tier'ı** (R1 — en kritik risk) — ayrı servis; büyüme buna endeksli.
- **D4 Gelir modeli dikişleri** (eski Sprint 10) — entitlement/plan (config, refactor değil).

### Track E — Teknik Borç Süpürme (fırsatta — Teknik Borç tablosu)
D5/D6/D7/D8 (auth.service böl — yalnız acı hissedilince) · D9 (UI primitive promote) · D10/D11/D12/D13 · REV-7 (ses düşme izlemede) · REV-9 (scroll "yeni mesaj" butonu).

### PM önerisi (sıralama) — güncel (2026-06-16)
**Yapıldı:** B1/B3/B4 (etkinlik motoru+kapak+deep-link) · C1 (uygulama-içi bildirim) · rename. Etkinlik özelliği **uygulama-içi olgun**; B2 hatırlatma bilinçle Track F'e (Electron) park edildi (teslim katmanı orada).
**Sıradaki adaylar:** (1) **Track A** lansman kapıları — sahip stratejik fazı (şirket/hukuk/CSAM araştırması; R2 kurulumu paralel). (2) **C3 forum** ya da diğer saf-yazılım ürün derinliği. (3) **Track F (Electron)** — istemci sarmalama + native bildirim + B2 hatırlatma birlikte. **Track D** = kurul/strateji turu. Not: C2 emoji CSAM-kapılı (A1 bekler).
