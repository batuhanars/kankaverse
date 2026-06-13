# Sprint 5 Contract — Dosya Paylaşımı (S3-uyumlu upload + presigned + Attachment)

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. Türetildiği yer: PLAN Sprint 5.
>
> **🔴 ÇOCUK GÜVENLİĞİ KAPISI (R5 + hukuk):** Gerçek **CSAM hash-tarama** bu sprint'te YOK (R5 araç seçimi + hukuk
> açık kalem). Bu sprint **upload altyapısını** kurar; tarama **gated hook** (config kapalı → dev'de auto-CLEAN).
> **LANSMAN ÖNCESİ gerçek tarayıcı bağlanmadan dosya paylaşımı CANLIYA ALINMAZ** (brief: çocuk güvenliği mimaride).
> `ATTACHMENT_SCAN_ENABLED` prod'da true + gerçek tarayıcı zorunlu — bu sprint'te no-op iskelet.
>
> **R7:** dosya servis erişimi `requireChannelAccess` (mevcut minör/adultsOnly kapıları) üstünden — yeniden kullanım.

---

## 1. Hedef & Kapsam

Kullanıcılar guild kanalında + DM'de **görsel ve dosya** paylaşır: istemci presigned URL ile **doğrudan S3'e** yükler
(backend dosya byte'ı taşımaz), mesaja iliştirir, alıcılar erişim-kontrollü presigned indirme ile görür.

**DAHİL:** S3-uyumlu storage soyutlaması + presigned upload/download · `Attachment` modeli + `scanStatus` (gated hook) ·
mesaja iliştirme (guild + DM) · görsel inline önizleme + dosya indirme · boyut/tip doğrulama · erişim kontrolü.

**DIŞI (sonraki):** gerçek CSAM/hash tarama (R5+hukuk) · video transcode · sunucu ikonu/emoji upload (V2 — bu altyapı
üstüne oturur) · avatar upload (ayrı, opsiyonel) · çoklu-dosya galeri zenginleştirmesi.

---

## 2. Storage — S3-uyumlu soyutlama (yeni bağımlılık — PM onaylı)

- **`StorageService`** (SharedModule) — S3-uyumlu soyut katman (EmailService deseni gibi). Sağlayıcı-agnostik:
  presigned PUT (upload) + presigned GET (download) + delete üretir.
- **Bağımlılık (PM onayı):** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. S3-uyumlu her sağlayıcıyla çalışır.
- **Dev:** **MinIO** (S3-uyumlu, self-host — KVKK/yerel barındırma ilkesine uygun) → kök `docker-compose.yml`'a servis +
  `.env.example` (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_URL`).
- **Prod:** S3-uyumlu sağlayıcı (env ile); kod değişmez. Anahtarsız/yapılandırmasız dev'de fail-fast (config doğrula).

---

## 3. Prisma (additive)

```prisma
model Attachment {
  id          String        @id @default(cuid())
  uploaderId  String
  uploader    User          @relation(fields: [uploaderId], references: [id])
  messageId   String?       // mesaja iliştirilince set (önce PENDING, presign anında null olabilir)
  message     Message?      @relation(fields: [messageId], references: [id])
  storageKey  String        @unique   // S3 objesi anahtarı
  filename    String
  contentType String
  size        Int
  scanStatus  ScanStatus    @default(PENDING)
  createdAt   DateTime      @default(now())
  @@index([messageId])
}

enum ScanStatus { PENDING CLEAN FLAGGED }
```
- `Message.attachments Attachment[]` ilişki. Migration additive.

---

## 4. Endpoints (envelope; `JwtAuthGuard`)

- **`POST /attachments/presign`** — `{ filename, contentType, size }` → **doğrula** (boyut ≤ `MAX_UPLOAD_MB` [25],
  contentType allowlist), `storageKey` üret, `Attachment` (PENDING) oluştur → `{ attachmentId, uploadUrl (presigned PUT), storageKey }`. Doğrulanmamış e-posta → kısıtlanabilir (mevcut `VerifiedEmailGuard` deseni — opsiyonel, PM kararı: **uygula**).
- İstemci → presigned PUT ile **doğrudan S3'e** yükler.
- **Mesaj oluşturma genişler:** `POST /channels/:id/messages` (+ DM `POST /dm/channels/:id/messages`) `{ content?, attachmentIds?: string[] }`. Boş içerik + ≥1 attachment geçerli. attachmentId'ler çağıranın + PENDING/CLEAN + henüz mesajsız olmalı → `messageId` bağla + **scan tetikle** (§5).
- **`GET /attachments/:id`** — **erişim kontrolü:** attachment'ın mesajının kanalına `requireChannelAccess` (minör/adultsOnly/üyelik kapıları). `scanStatus` CLEAN değilse → `403 ATTACHMENT_NOT_READY` (FLAGGED → `403 ATTACHMENT_BLOCKED`). CLEAN → kısa-ömürlü presigned GET URL döndür (veya 302). **[R7-erişim]**

---

## 5. Tarama Kapısı (gated hook — R5 iskelet)

- **Config `ATTACHMENT_SCAN_ENABLED`** (default **false**). 
- **false (dev):** mesaja bağlanınca attachment `scanStatus=CLEAN` (auto-pass, no-op) — feature test edilebilir. **Loud yorum:** "LANSMAN: gerçek tarayıcı + true zorunlu (R5)".
- **true (prod, gelecek):** `scanStatus=PENDING` → tarama servisi (R5 aracı; **bu sprint stub/no-op**) → CLEAN/FLAGGED. PENDING iken servis edilmez.
- Tarama hook noktası kurulur (gerçek hash-eşleme R5 + hukuk sonrası bağlanır). Bu sprint **gerçek tarama YAZILMAZ.**

---

## 6. Doğrulama & Limitler (config)
- `MAX_UPLOAD_MB` (25). contentType **allowlist:** görseller (`image/png|jpeg|gif|webp`) + yaygın dosya (`application/pdf`, `text/plain`, vb. — makul başla, config genişletir). Allowlist dışı → `400 UNSUPPORTED_TYPE`.
- Boyut server-tarafı presign'de doğrulanır (istemci size beyanı) — gerçek byte doğrulama S3 policy/sonradan (V1 kabul: beyan + allowlist).

## 7. Frontend (`web/`)
- **Mesaj input'unda ek (📎) butonu** (Sprint 4A redesign'da gizlenmişti — şimdi açılır): dosya seç → `presign` → S3'e PUT (ilerleme göstergesi) → mesaj gönderiminde `attachmentIds`.
- **Görsel inline önizleme** mesajda (`MessageItem` + DM baloncuğu); **dosya** → ikon + ad + indir (`GET /attachments/:id`).
- Boyut/tip hatası UX; `ATTACHMENT_NOT_READY`/`ATTACHMENT_BLOCKED` jenerik mesaj. i18n + `--kv-*` token.
- Yükleme presigned PUT doğrudan S3'e (axios, envelope yok — ham PUT).

## 8. R7 / Güvenlik Kapsamı
- `GET /attachments/:id` erişim kontrolü `requireChannelAccess` (minör/adultsOnly/üyelik) — yeniden kullanım, doğrula.
- scanStatus servis kapısı (CLEAN değilse servis yok) — gated hook doğru bağlandı mı.
- presigned URL kısa ömür; storageKey tahmin-edilemez (cuid/random).

## 9. DoD
- [ ] StorageService (S3-uyumlu) + MinIO dev (docker-compose + env); presign PUT/GET çalışır.
- [ ] Attachment modeli + migration; mesaja iliştirme (guild + DM); görsel inline + dosya indirme.
- [ ] Erişim kontrollü indirme (`requireChannelAccess`); minör/adultsOnly kanal kapıları dosyaya da uygulanır.
- [ ] `scanStatus` gated hook: dev auto-CLEAN; CLEAN değilse servis edilmez; **gerçek tarama R5 (yazılmadı, hook hazır)**.
- [ ] Boyut/tip doğrulama; `nest build` + `vue-tsc` temiz; testler (presign doğrulama + erişim kapısı + scan-gate).
- [ ] **Lansman notu PLAN'a:** dosya paylaşımı `ATTACHMENT_SCAN_ENABLED=true` + gerçek CSAM tarayıcı olmadan canlıya alınmaz.

## 10. Açık Kalem
- **R5 — CSAM hash-tarama aracı** (Cloudflare CSAM Scanning Tool / PhotoDNA / NCMEC vb.) + **hukuk** (bildirim yükümlülüğü, TR 5651/KVKK). Bu sprint'i bloke etmez (gated), **lansmanı bloke eder.** 4B CSAM akışıyla hizalı olgunlaşır.
