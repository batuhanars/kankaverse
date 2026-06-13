# Sprint 4B Contract — TASLAK — Moderasyon Çekirdeği (Report + Kuyruk + Action + Audit)

> ⚠️⚠️ **BU BİR TASLAKTIR — KİLİTLİ DEĞİL. MERGE EDİLMEZ.** Gece otonom yazıldı (2026-06-13).
> **İKİ KAPI:** (1) **Hukuki görüş** (KVKK/minör verisi/CSAM/5651 — PLAN açık kalemi) · (2) **R7** (moderasyon =
> T&S karar yüzeyi, satır-satır insan incelemesi). Bu taslak yapıyı hazırlar ki kapılar açılınca hızlı kilitlensin.
> **Hukuki specifikler bilinçle BOŞ/işaretli** — proje sahibi + hukuk danışmanı doldurur.

---

## 1. Hedef

T&S çekirdeğinin "tespit et → hızlı müdahale et → mağdura çıkış" ayağı (brief §5; 4A "ulaşımı zorlaştır"ı tamamlar).
`canDm`/`canSendFriendRequest`'teki **report/karantina no-op hook'ları burada gerçeğe bağlanır.**

1. **Report** — kullanıcı mesaj/kullanıcı/kanal şikâyet eder + `contextSnapshot` (kanıt anı).
2. **Öncelikli moderasyon kuyruğu** — minör güvenliği/CSAM en yüksek öncelik (R1 SLA: "dakikalar içinde insan").
3. **ModerationAction** — uyar/sustur/at/yasakla/içerik-kaldır; erişim kontrolüne bağlanır.
4. **AuditLog** — değişmez moderasyon eylem kaydı.

---

> **7B'den devreden yükseltme (kutsal-değer hakareti):** Sprint 7B automod kutsal değerlere hakareti (Allah/Peygamber/
> Kitap) yalnız **block-on-send** ediyor. Sahip talebi: bu kategori kullanıcı uzaklaştırma sebebi. 4B'de **en yüksek
> öncelikli, İNSAN-ONAYLI ban**'a yükseltilir (otomatik geri-dönülmez ban YOK — yanlış-pozitif/alıntı bağlamı/KVKK/itiraz).
> Bkz. memory `tr-automod-lokalizasyon`.

## 2. Prisma Modelleri (TASLAK — retention alanları LEGAL-FLAGGED)

```prisma
model Report {
  id              String       @id @default(cuid())
  reporterId      String
  reporter        User         @relation("Reporter", fields: [reporterId], references: [id])
  targetType      ReportTarget // MESSAGE | USER | CHANNEL | GUILD
  targetId        String
  reason          ReportReason
  description     String?
  status          ReportStatus @default(OPEN)
  priority        Int          @default(0)   // hesaplanır: minör/CSAM → en yüksek
  contextSnapshot Json         // 🔴 LEGAL: ne yakalanır + ne kadar saklanır (KVKK veri minimizasyonu)
  resolvedById    String?
  resolvedAt      DateTime?
  createdAt       DateTime     @default(now())
  @@index([status, priority])
  @@index([targetType, targetId])
}

enum ReportReason { SPAM HARASSMENT MINOR_SAFETY VIOLENCE CSAM SELF_HARM OTHER }
enum ReportTarget { MESSAGE USER CHANNEL GUILD }
enum ReportStatus { OPEN TRIAGED RESOLVED DISMISSED ESCALATED }

model ModerationAction {
  id            String       @id @default(cuid())
  moderatorId   String
  targetUserId  String
  type          ModActionType // WARN | MUTE | KICK | BAN | CONTENT_REMOVE | SHADOW_LIMIT
  scope         String?      // guild-içi mi global mi (guildId | null=global)
  reason        String
  relatedReportId String?
  expiresAt     DateTime?    // geçici aksiyonlar
  createdAt     DateTime     @default(now())
  @@index([targetUserId])
}

enum ModActionType { WARN MUTE KICK BAN CONTENT_REMOVE SHADOW_LIMIT }

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String
  action     String   // "report.resolve", "moderation.ban", ...
  entityType String
  entityId   String
  metadata   Json?
  createdAt  DateTime @default(now())
  @@index([entityType, entityId])
  @@index([actorId])
}
```

> **Moderatör rolü:** mevcut `GuildRole` (OWNER/ADMIN/MEMBER) guild-içi yeterli mi, yoksa **platform-seviyesi
> moderatör** (yeni alan/rol) mi gerekir? Global T&S kuyruğu platform-mod gerektirir → **açık karar.**

---

## 3. 🔴 HUKUKİ GÖRÜŞ GEREKTİREN KARARLAR (sahip + hukuk danışmanı — KİLİTLEME)

> Bu bölüm doldurulmadan 4B **başlamaz.** Otonom doldurmadım — bilinçli.

1. **`contextSnapshot` içeriği + saklama süresi:** Hangi veri yakalanır (şikâyet edilen mesaj + çevresi + kullanıcı durumu)?
   KVKK veri minimizasyonu vs kanıt ihtiyacı dengesi. Ne kadar tutulur? Çözülünce silinir mi, X gün mü?
2. **Minör verisi (KVKK özel nitelikli):** Minörle ilgili report'lar özel kategori — işleme/saklama/erişim ek koruma gerektirir.
3. **🚨 CSAM — TAMAMEN AYRI, UZMAN + HUKUK GEREKTİRİR:** CSAM içeriği moderasyon kuyruğunda **serbestçe görüntülenemez/saklanamaz**
   (hukuki + etik). Ayrı akış: hash-eşleme (Sprint 5 R5 aracı), **yetkililere bildirim yükümlülüğü** (TR karşılığı), kanıt
   koruma, **kısıtlı erişim**. **Bunu otonom TASARLAMADIM — uzman + hukuk şart.** 4B'de yalnız "CSAM report'u en yüksek
   öncelik + özel-akış-hook" yer tutar; gerçek akış ayrı.
4. **5651 / yetkililere ifşa:** Kolluk talebi akışı, log saklama yükümlülükleri.
5. **Silme hakkı vs legal-hold:** 2B'deki legal-hold hook (hesap silme grace) moderasyon kaydıyla nasıl etkileşir?
   Şikâyet edilen kullanıcı hesabını silerse `contextSnapshot`/AuditLog korunur mu?
6. **AuditLog saklama süresi** + değişmezlik garantisi.

---

## 4. Fonksiyonel İskelet (hukuk sonrası, R7 ile kilitlenir)

- **POST `/reports`** (auth, rate-limit) — `{ targetType, targetId, reason, description? }` → `contextSnapshot` SUNUCU
  tarafında yakalanır (istemci kanıt göndermez), priority hesaplanır. → `201`.
- **GET `/moderation/queue`** (mod-only) — öncelik sırası; minör/CSAM üstte. **CSAM içeriği queue'da render edilmez** (§3.3).
- **POST `/moderation/actions`** (mod-only) — ModerationAction oluştur → erişim kontrolüne bağla + AuditLog yaz.
- **GET `/audit`** (admin) — moderasyon eylem geçmişi.
- **Hook bağlama:** `canDm`/`canSendFriendRequest`'teki report/karantina hook'ları → aktif ModerationAction (MUTE/BAN) okur.
  Mesaj gönderme yolu MUTE kontrolü ekler (membership genişler — R7).

---

## 5. R7 Kapsamı (hepsi insan incelemesi)
- Priority/triyaj mantığı (minör/CSAM en yüksek), moderasyon erişim kontrolü (kim moderatör), ModerationAction'ın
  erişim kapısına bağlanması, minör/CSAM özel ele alma. **Çocuk güvenliği = hata bedeli.**

## 6. DoD (taslak — kapılar açılınca netleşir)
- [ ] Hukuki görüş alındı, §3 kararları dolduruldu.
- [ ] Report + contextSnapshot (KVKK-uyumlu retention); öncelikli kuyruk; ModerationAction → erişim; AuditLog değişmez.
- [ ] CSAM ayrı-akış (uzman+hukuk tasarımı) — bu sprint'e mi sonraki mi, karar.
- [ ] R7: tüm moderasyon karar yüzeyi satır-satır incelendi.

---

## 7. PM Notu (gece)
4B'nin gövdesi (Report/queue/Action/Audit CRUD) standart; **gerçek zorluk hukuki + CSAM.** Önerim: hukuk görüşü
gelince §3'ü doldur, **CSAM'i 4B'den ayır** (kendi mini-sprint'i, Sprint 5 hash-aracıyla hizalı), 4B'yi CSAM-dışı
moderasyona odakla. Böylece 4B hukuk görüşünün CSAM-dışı kısmıyla ilerleyebilir, CSAM uzman süreciyle paralel olgunlaşır.
