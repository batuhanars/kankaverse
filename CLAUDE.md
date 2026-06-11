# Kankaverse — Kök CLAUDE.md (Cross-Cutting Kurallar)

> Bu dosya tüm tier'larda geçerli kuralları tanımlar. `api/` veya `web/` altında açılan her Claude Code
> session'ı **bu dosya + ilgili tier CLAUDE.md'sini** cascade ile yükler. Cross-cutting kuralları tier
> dosyalarına KOPYALAMA — cascade zaten birleştirir.
>
> **Koordinasyon dosyaları:** `PLAN.md` + `TASK.md` kökte; sprint sözleşmeleri `contracts/SPRINT_X_CONTRACT.md`
> (biten sprintler `contracts/archive/`). CLAUDE.md cascade gereği bu üç CLAUDE.md kökte/tier'larda sabit kalır.

---

## Proje Nedir

Türkiye pazarı için sıfırdan tasarlanmış, topluluk odaklı gerçek zamanlı iletişim platformu (Discord
alternatifi). Farklılaştırıcılar: Türkçe moderasyon, yerel ödeme, KVKK uyumu ve **çocuk güvenliğinin
mimariye gömülü olması**. Detaylı brief: `knowledge/projects/kankaverse/kankaverse-proje-brief.md`.

**Repo yapısı (monorepo, düz):**
- `api/` — NestJS + Prisma + PostgreSQL backend
- `web/` — Vue 3 + Vite SPA (V1 birincil istemci)
- AI moderasyon ön-triyaj/automod servisi (R1) → gerektiğinde (Sprint 4+) ayrı bir tier olarak eklenecek; şimdi yok
- Landing page / Electron masaüstü / Flutter mobil → en sona ertelendi

---

## Çalışma Modeli — Fable / Opus / Sonnet (üç katman)

Vault pattern: `knowledge/stack/claude-code/multi-session-pm-dev-contract.md`. Ekip modeli brief §11.1.

- **Fable (vault / mimari danışma):** **vault-seviyesi dosyalardan** sorumlu (brief, `principles/`, `decisions-log/`).
  En kritik kararlar Fable ile alınır — örn. brief'e eklenen §5.1.b yaş güvencesi gibi mimari/T&S yön kararları.
- **Opus (software manager / proje yönetimi):** **proje-seviyesi dosyalar** — `PLAN.md`, `TASK.md`,
  `contracts/SPRINT_X_CONTRACT.md` — ve bunlar üzerindeki kararlar. Plan→görev ayrıştırma, contract yazımı/revizyonu,
  R7 incelemesi. Genelde kod yazmaz (kararı verir, dev'e delege eder).
- **Sonnet (developer):** `cd api/` veya `cd web/` ile açılır, sadece o tier'a dokunur. `SPRINT_X_CONTRACT.md`'i
  **tek doğruluk kaynağı** kabul eder; endpoint imzası, DTO şekli, enum değeri contract'tan **sapamaz**.
- **Sapma ihtiyacı doğarsa:** dev DURUR, kullanıcıya bildirir, Opus contract'ı revize eder, sonra devam.
- **`TASK.md`:** dev checkbox işaretler, **item EKLEMEZ** (yeni item = scope creep = Opus onayı).

---

## Response Envelope (tüm HTTP endpoint'leri)

Yeniden kullanım: `knowledge/decisions-log/2026-05-11-v1-response-envelope.md`.

**Başarılı:**
```jsonc
{ "success": true, "statusCode": 200, "data": { } }   // data: obje | dizi | null
```
**Hata:**
```jsonc
{ "success": false, "statusCode": 400, "message": "kullanıcıya-türkçe", "error": "MACHINE_CODE",
  "timestamp": "2026-...", "path": "/auth/login" }
```

- Backend `TransformInterceptor` + `GlobalExceptionFilter` üretir — **controller sarmalamaz**, doğrudan veri döner.
- `throw new BadRequestException('mesaj')` yeterli; filter envelope'ler. Prisma `P2002` → `409`.
- Frontend gerçek payload'ı `response.data.data` ile çıkarır; hata mesajını `response.data.message` (Türkçe)
  gösterir, `error` kodunu loglar.
- Her contract'ta endpoint imzasının ilk satırı envelope'tır.

## API Sözleşmesi = Tek Doğruluk Kaynağı

OpenAPI spec (`@nestjs/swagger` ile üretilir) backend ↔ istemci sözleşmesidir. Web'in tip/clientları bundan
türetilir (sonraki istemciler — Flutter — aynı spec'ten Dart üretir). Sözleşme paylaşılır, dil paylaşılmaz.

---

## i18n — Gün 1 Zorunluluğu

- UI Türkçe açılır; ama **hiçbir kullanıcıya görünen string koda gömülmez** — `vue-i18n` tek kaynak dosyada (brief §12).
- Tarih/saat TR formatı: "25 Ekim 2023", saat "18.42". Para birimi TR yereli.
- Yan fayda: tüm sistem metinleri tek dosyada → ton/terminoloji denetlenebilir, ileride dil eklemek çeviri işidir.

## Trust & Safety İnceleme Zorunluluğu (R7)

**Auth/oturum katmanı ve T&S karar fonksiyonları satır satır insan incelemesinden geçmeden merge edilmez.**
Bu iki bölgede hata bedeli hesap güvenliği ve çocuk güvenliğidir. Dev session bu dosyalara dokunduğunda
PR/diff'i kullanıcı onayına sunar; "AI yazdı, geçti" yoktur.

**T&S çekirdek ilkesi:** ulaşımı zorlaştır → tespit et → hızlı müdahale et → mağdura çıkış yolu göster.
Doğrulanmış statü reşit olmayana erişim ayrıcalığı TANIMAZ (brief §4 kritik kural).

## Tasarım Sistemi = Tek Kaynak

`knowledge/projects/kankaverse/kankaverse-design-tokens.md`. Renk/tipografi/şekil/ölçü oradan türetilir
(Tailwind config + CSS değişkenleri). Ekran tasarımları: `knowledge/projects/kankaverse/design/*`.

---

## Kod İlkeleri

`knowledge/principles/code-style.md` — Clean Code + DRY + **Rule of Three** (3. tekrarda util'e çıkar, 2'de bekle).
AI'dan beklenti iki katmanlı: (1) prensiplere uy + drift'i söyle, (2) refactor yaptığında nedenini öğret.
Dağılma sinyalleri: dosya 300+ satır, fonksiyon 30+ satır, aynı string/number 3+ yer → düzelt.

## Veri Modeli & Mimari Kaynak

- Veri modeli haritası: brief §7 (Prisma şeması sprint'lerde bu haritadan büyür; T&S alanları birinci sınıf).
- Auth mimarisi: brief §8 (argon2id, JWT access ~15dk + rotasyonlu refresh, Session, 2FA TOTP).
- Gerçek zamanlı: WebSocket (Socket.IO) + **Redis pub/sub adapter ilk günden** (tek instance yeterken bile).

## Açık Kararlar / Bayraklar

- **`api/.git` yuva sorunu:** `api/` kendi git deposunda, kök depo yok. Monorepo için kökte tek git deposu
  doğru — kullanıcı onayıyla düzeltilecek (bakınız `PLAN.md` "Açık Kalemler").
