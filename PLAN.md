# Kankaverse — V1 PLAN.md

> Genel mimari yol haritası ve V1 kapsam kilidi. Aktif sprint sözleşmesi `contracts/SPRINT_X_CONTRACT.md`'de;
> canlı ilerleme `TASK.md`'de. Brief: `knowledge/projects/kankaverse/kankaverse-proje-brief.md`.

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
| 3 | DM + grup DM + arkadaşlık (Friendship) + UserBlock + **"X, Y'ye DM atabilir mi?" merkezi karar fonksiyonu** | brief §13 #2 — dmPolicy+isMinor+arkadaşlık+blok+ortak sunucu+karantina tek noktada. R7 |
| 4 | T&S çekirdeği: minor varsayılan kısıtları (DM/medya/keşif/profil), yaş-kapılı kanal, Report + `contextSnapshot` + öncelikli moderasyon kuyruğu, ModerationAction, AuditLog | brief §5. R7. Hukuki görüş önü |
| 5 | Dosya paylaşımı: S3-uyumlu depolama + presigned URL + Attachment `scanStatus` + **hash tarama** entegrasyonu | R5 açık soru: hangi araçla başlanacak (Cloudflare CSAM vb.) — sprint öncesi netleşmeli |
| 6 | Presence/çevrimiçi durumu + yazıyor göstergesi + bildirimler | brief V1 kapsamı ("Discord hissinin asgarisi") |
| 7 | Türkçe automod (kelime-listesi), davet sistemi (Invite), yeni üye karantinası, sunucu ayarları ekranı (adultsOnly) | Tasarım: `design/kankaverse_sunucu_ayarlari` |
| 8 | e-Devlet opsiyonel doğrulama + doğrulanmış rozeti | brief §4. Doğrulama erişim ayrıcalığı TANIMAZ (kritik kural) |
| 9 | Göç aracı (Discord sunucu yapısı içe aktarma) | brief §10.2 — GTM'in en değerli teknik yatırımı, V1 adayı |
| 10 | Beta sertleştirme, gizlilik politikası (R4 şeffaflık), config-tabanlı limitler + entitlement/plan dikişleri | brief §12 gelir modeli dikişleri (refactor değil config) |

---

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
| R5: V1 hash tarama aracı seçimi | Kurucu araştırma | Sprint 5 önü |
| Aylık bütçe tavanı rakamı | Kurucu | Sürekli (gider tavanı ilkesi) |
| Çapa topluluk listesi (3-5) | Kurucu (kendi çevresi) | Walking skeleton sonrası |
| Beta hedef metrikleri (N aktif topluluk, tutundurma) | Kurucu | Beta önü |
| Şirketleşme zamanlaması/türü | Mali müşavir görüşü | Lansman önü (R6) |
| KVKK / reşit olmayan verisi hukuki görüş | Hukuk danışmanlığı | Sprint 4 + lansman önü (R6) |
| Stack kilidi ADR'ı → `knowledge/decisions-log/` | PM (vault işi) | Ayrı adım |
| 5651 / KVKK yükümlülükleri iş planına işleme | Kurucu | Büyüme eşiği |

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
| J1 | join-by-ID UI bağlama (modal var, düğme yok) — Sprint 7 davet işine birleştirilecek | web | Sprint 1 | düşük | ertelendi (Sprint 7) |
| D5 | Bayat `before` cursor en son 50'yi döndürür; `?limit=` controller'da ölü; WS CORS `*` | api | denetim #5/#6/#8 | düşük | ertelendi (fırsatta) |

---

## Riskler (brief §9 — özet)

- **R1 moderasyon kapasitesi (en kritik):** "dakikalar içinde insan moderatör" SLA'i tek kişiyle tutulamaz →
  AI ön-triyaj servisi (Sprint 4+ ayrı tier), davetli/kontrollü büyüme, **büyüme moderasyon kapasitesine endeksli**.
- **R2 cold start:** pazar riski, planla değil gerçek topluluklarla azaltılır (GTM brief §10).
- **R4 E2EE yok (bilinçli):** T&S sunucu-tarafı erişim gerektirir; gizlilik politikasında şeffafça yazılır.
- **R7 AI-ekip sınırı:** auth/oturum + T&S karar fonksiyonları satır satır insan incelemesi (CLAUDE.md zorunluluğu).
