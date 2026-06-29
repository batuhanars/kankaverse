# Sprint A4 — Acil Yardım / Çıkış Butonu (Panik) Sözleşmesi

> Kök + tier `CLAUDE.md`. **Tek doğruluk kaynağı bu dosya.** Sapma → DUR, PM'e dön. Envelope `{ success, statusCode, data }`.
> Genişlettiği yer: mevcut `modules/reports/` + `modules/moderation/` (Report/AuditLog) + `modules/voice/` (LiveKit removeParticipant, R11B deseni).
> Türetildiği yer: PLAN.md **Track A — A4** (sahip onaylı 2026-06-19: "platform eskalasyonu + anında-çek onaylandı; build sırası gelince contract+decision-log'a dökülür"). Brief T&S çekirdek ilkesinin 4. ayağı: "mağdura çıkış yolu göster".
>
> **R7 ZORUNLU:** Acil-buton bir T&S karar fonksiyonudur — **yerel mod baypas + platform eskalasyon** mantığı ve
> "neyi açar/neyi açmaz" satır satır insan incelemesinden geçmeden merge EDİLMEZ.

---

## 0. Kararlar (PLAN A4, sahip onaylı) — değişmez sınırlar

1. **Her kullanıcı için** (minöre özel değil). UI minörü işaretlemez; ama presser minörse snapshot `isMinor: true` taşır → triyajda yüksek öncelik. Buton görünürlüğü yaşa göre değişmez.
2. **Anında-çek (maruziyeti kes = asıl "çıkış"):** basan kişinin aktif `VoiceSession`'ı varsa LiveKit'ten **kendisi çekilir** (removeParticipant). Canlı AV'ye maruziyet biter. Best-effort (LiveKit erişilemezse sessiz geç, rapor yine oluşur).
3. **Platform eskalasyonu — yerel mod BAYPAS (en kritik):** acil rapor **yalnız platform güvenliğine** (`ModeratorGuard` / `isModerator`) görünür. Yerel sunucu operatörü/mod'u **göremez/aksiyon alamaz.** Gerekçe: istismarcı çoğu zaman sunucunun kendi "güvenilen yetişkin" operatörüdür; rapor faile gitmemeli. **Bu mimaride zaten sağlanıyor** (moderasyon kuyruğu platform-isModerator-gated; guild-local rapor görünümü YOK) — sözleşme bu invariantı KORUR, guild'e sızdıracak hiçbir yüzey eklemez.
4. **Snapshot = METADATA, içerik DEĞİL:** kanal, kim yayında/ekran paylaşıyor, katılımcılar, zaman. Canlı AV kaydedilmez, mesaj içeriği yakalanmaz. → A2 hukuk-gating'i (içerik-kanıt) **bu sprinti bloke ETMEZ**; A4 metadata-only.
5. **Tiyatro olmaması şartı — STAFFED yanıt:** kapalı testte yanıt = sahip (tek `isModerator`). Ölçekte nöbetçi/güvenlik süreci + CSAM/yasal eskalasyon **A1/A2 ile** gelir. Bu sprint **mekanizmayı** kurar; 7/24 insan SLA'i kapsam dışı (PLAN R1).
6. **Mevcut sistemi genişletir, paralel sistem kurmaz:** yeni `EMERGENCY` reason + en yüksek priority. Yeni rapor/moderasyon hattı icat edilmez.

---

## A. Şema (migration VAR)

`ReportReason` enum'a **`EMERGENCY`** eklenir. Başka model değişikliği YOK (`Report.contextSnapshot Json` + `priority Int` + `AuditLog` mevcut).

```prisma
enum ReportReason {
  SPAM
  HARASSMENT
  MINOR_SAFETY
  VIOLENCE
  CSAM
  SELF_HARM
  OTHER
  EMERGENCY   // ← A4: kullanıcı-başlatımlı acil yardım
}
```

> Migration üretilir + **DB'ye uygulanır** (`prisma migrate deploy` / dev `migrate dev`). Mock-Prisma testleri enum eklemeyi yakalamaz → `migrate status` temiz olmalı ([[migration-uygulanmali]]). Prod: api container başlangıcı `migrate deploy` çalıştırır.

---

## B. Backend — `modules/emergency/` (yeni modül) veya `reports` genişlemesi

> Tercih: küçük **`modules/emergency/`** (tek endpoint, tek service metodu) — `reports` (kullanıcı raporu) ile semantik ayrık. Module `voice` (LiveKit client) + `prisma` inject eder.

### B1. Tetikle — `POST /emergency` **(R7 — çekirdek)**
- Yetki: `JwtAuthGuard` (her giriş-yapmış kullanıcı). **Throttle:** kullanıcı başına makul limit (ör. 3/dk) — kötüye kullanım/yanlış-tetik seli engellenir ama gerçek acil bloke olmaz (`@nestjs/throttler`).
- Body DTO `TriggerEmergencyDto` (class-validator): `{ channelId?: string }` — istemci aktif ses kanalındaysa gönderir; yoksa boş (global tetik).
- Akış (sıra önemli — **rapor oluşturma ASLA pull'a bağlı değil**):
  1. **Bağlam topla:** `channelId` varsa → kanal + aktif `VoiceSession`'lar (katılımcılar), video/ekran yayınlayanlar, guild. Presser'ın `isMinor`'u.
  2. **Rapor oluştur (her zaman):** `Report` { reporterId: presser, reason: `EMERGENCY`, targetType: `CHANNEL` (channelId varsa) / `USER` (yoksa, targetId=self), targetId, priority: **100** (kuyruk en üstü), status: `OPEN`, contextSnapshot: `{ channelId, channelName, guildId, triggeredAt, presserId, isMinor, participants: [userId], broadcasters: [{ userId, sources: ['camera'|'screen'] }] }` }. **İçerik yok — yalnız metadata.** Zengin yayıncı metadata'sı (kim hangi track'i açmıştı) inceleyene "kime bak" der; hâlâ metadata, A2'ye girmez.
  3. **Anında-çek (best-effort):** presser'ın aktif `VoiceSession`'ı varsa LiveKit `removeParticipant(channelId, presserId)`. Hata yutulur (rapor yine durur). WS: presser istemcisine `emergency.pulled` (UI'yı görüşmeden düşür).
  4. **AuditLog:** `action: 'emergency.triggered'`, `entityType: 'channel'|'user'`, `entityId`, `metadata: { guildId, isMinor }`.
  5. **Platform alarmı:** platform-güvenlik room'una WS `emergency.alert { reportId, channelId, guildId, isMinor, triggeredAt }` (anlık). (Kapalı testte tek `isModerator` = sahip.) Opsiyonel `Notification` kaydı → **kapsam dışı bu sprint** (WS alarm + kuyruk yeterli; kalıcı bildirim C1 deseniyle sonra).
- Dönüş: `{ data: { acknowledged: true, reportId } }` — `reportId` mağdurun kendi raporu (B1b gönüllü beyan için). Başka hassas bağlam echo EDİLMEZ.

### B1b. Gönüllü beyan — `PATCH /emergency/:id` `{ description }` **(R7)**
- Yetki: `JwtAuthGuard` + throttle. **Yalnız mağdurun kendi EMERGENCY raporu:** rapor `reporterId === user.id && reason === 'EMERGENCY'` değilse jenerik `403 FORBIDDEN` (varlık sızdırma yok).
- Etki: `Report.description` güncellenir (trim, ≤2000). **Mağdurun kendi rızasıyla yazdığı beyan** = gönüllü; A2 sessiz-içerik-yakalama gating'ine girmez (veri sahibi kendi koruması için beyan veriyor).
- AuditLog: `action: 'emergency.statement_added'`, `entityType: 'report'`, `entityId: reportId`.
- **Yalnız metin, mağdurun temposunda.** Canlı ses "ifade alma" REDDEDİLDİ (sahip + PM 2026-06-29): yetişkin-mod + (çoğu zaman minör) mağdur özel ses = grooming vektörünün aynısı + kayıtsız/denetimsiz + amatör adli görüşme delili kirletir. Beyan metin olmalı.

### B2. Yerel-mod baypas invariantı (kod-seviyesi koruma)
- Acil rapor `moderation/queue` (platform `ModeratorGuard`) üzerinden görünür — **mevcut davranış, ek iş yok.**
- **Guild'e sızdıran yüzey EKLENMEZ:** hiçbir guild-scoped endpoint EMERGENCY raporları döndürmez. (`reports` controller'da zaten yalnız `@Post()` var; guild rapor-listesi yok.) Bu invariant R7'de doğrulanır.

---

## C. Frontend (`web/`)

### C1. Buton — aktif ses/video oturumu UI'ı (birincil yer)
- Ses/görüşme kontrol çubuğuna belirgin **"Acil Yardım"** butonu (kırmızı/`--kv-danger`; ikon: kalkan/SOS). En yüksek maruziyet bağlamı burası (canlı AV).
- Tıkla → **tek onay** modalı: "Acil durum bildir? Seni mevcut görüşmeden hemen çıkaracağız ve güvenlik ekibimize ileteceğiz." [Vazgeç] [Acil durum bildir]. (Tek-tık değil → kaza önlenir; tek-onay → gerçek acilde hız korunur.)
- Onayda → `POST /emergency { channelId }`. Başarıda istemci görüşmeden düşer (`emergency.pulled` veya lokal leave).

### C2. Mağdura geri-bildirim (çıkış yolunu GÖSTER) — **GLOBAL katman (bug fix) + içerik KİLİTLİ**
- 🔴 **BUG (canlı test 2026-06-29):** modal `VoiceControlBar` içindeydi; `leave()` sonrası `VoiceRoomView:333 v-if="connectedHere"` çubuğu unmount edince modal hiç görünmüyordu. → Modal **ses çubuğundan çıkarılıp AppShell/global katmana** taşınır (store flag: `emergencyFeedback { open, reportId, failed }`). Pull/leave anında olur, modal bağımsız katmandan açılır; odadan çıkmak öldürmez.
- Başarı sonrası modal:
  - "Güvenliğin için görüşmeden çıkarıldın. Durum güvenlik ekibimize iletildi."
  - "Acil tehlikedeysen: **112**" · "Sosyal/çocuk destek: **ALO 183**" · "Bu olay incelenecek."
  - **Opsiyonel gönüllü beyan:** "İstersen ne olduğunu birkaç kelimeyle anlat" [textarea] → [Gönder] `PATCH /emergency/:id { description }` (B1b) · [Kapat] hiçbir şey yazmadan geçer. **Bloke etmez** (krizde sürtünme = düşman).
- Numaralar/metin `tr.json`'da; revize = içerik işi, akış değişmez.

### C3. i18n
- Tüm metin `tr.json` (`emergency.*`: buton, onay, başarı, destek). Gömülü string yok; `--kv-*` token.

---

## D. T&S / R7 özeti (incelemede aranacaklar)
- [ ] Acil rapor **yalnız platform `ModeratorGuard`** kuyruğunda; hiçbir guild-scoped yüzey EMERGENCY döndürmüyor (yerel-mod baypas korunuyor).
- [ ] Rapor oluşturma **pull'dan bağımsız** (LiveKit hata verse de rapor düşer).
- [ ] Snapshot **metadata-only** — mesaj içeriği / canlı AV YOK (A2 gating'ine girmez).
- [ ] `isMinor` snapshot'ta taşınıyor (triyaj önceliği) ama buton görünürlüğü yaşa göre değişmiyor.
- [ ] Throttle gerçek acili boğmuyor (limit makul) + spam tetik seli sınırlı.
- [ ] Priority=100 → kuyruğun en üstü (mevcut `orderBy priority desc`).

## E. DoD
- [ ] A. `ReportReason.EMERGENCY` + migration **DB'ye uygulandı** (`migrate status` temiz).
- [ ] B1 `POST /emergency` (bağlam+rapor+anında-çek+audit+WS alarm) — **R7 geçti.** B2 baypas invariantı doğrulandı.
- [ ] Frontend: ses/video UI'da Acil Yardım butonu + tek-onay + mağdur geri-bildirim modalı; i18n.
- [ ] `nest build` + testler (rapor pull'suz oluşur · platform-only görünür · metadata-only snapshot · throttle) + `vue-tsc`/`vite build` temiz.

## F. Borç / Kapsam DIŞI (sahip kararı bekleyen)
- ✅ **Destek kaynağı içeriği (C2):** KİLİTLENDİ (sahip 2026-06-29) — 112 + ALO 183 + platform süreci. Onay sürtünmesi: **tek onay diyalogu** (C1). Buton yeri: **yalnız ses/video oturumu**.
- **Buton global yeri (takip):** bu sprint yalnız ses/video oturumu (sahip seçimi). Genel/her-ekran erişimi → ileride gerekirse.
- **İçerik-kanıt snapshot'ı:** A4 metadata-only; mesaj/AV içerik yakalama **A2 hukuk-gated** (Report.contextSnapshot içerik = STUB kalır).
- **Kalıcı bildirim/Notification kaydı:** WS alarm yeterli; kalıcı teslim C1 deseniyle sonra.
- **7/24 nöbetçi yanıt SLA'i:** A1/A2 + büyüme; bu sprint mekanizma, süreç değil.
- **Snapshot retention politikası:** formal saklama/imha → A2 (Veri Saklama Politikası). İnterim: güvenlik delili metadata'sı auto-silinmez.
