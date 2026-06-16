# SPRINT V3 — Etkinlik Kapak Görseli (gated, scan-hattı tekrar kullanımı)

> Durum: **TASARIM KİLİTLİ (2026-06-16).** PM compose. Sahip stratejisi: kapalı/ekip-içi test için gated upload; gerçek CSAM = lansman paketi (şirket+hukuk).
> Temel fazlar: `SPRINT_V3_EVENTS_CONTRACT.md` (MVP), `SPRINT_V3_EVENTS_ENGINE_CONTRACT.md` (motor). Bu faz **additive**.
> **T&S kuralı (kilitli):** Kapak, ortam ikonundaki (D14) gibi taramayı baypas eden YENİ bir yol AÇMAZ. **Mevcut scan-gated Attachment boru hattını** (Sprint 5) birebir tekrar kullanır. Mesaj ekiyle **aynı seviye, aynı kural.**

---

## §0 — Kapsam ve Kararlar

**IN:** Etkinlik oluştur/düzenle sihirbazında kapak görseli yükleme (mevcut `POST /attachments/presign` + `uploadToS3` akışı) · `GuildEvent.coverImageId` doldurma · `EventDto.coverImageUrl` (kısa-ömürlü presigned GET, yalnız CLEAN) · kart/listede kapak gösterimi.

**Gating (KRİTİK):** Tüm yükleme **`UPLOADS_ENABLED`** bayrağına tabi (presign endpoint zaten `UPLOADS_DISABLED` 403 veriyor). Kapalıyken kapak yüklenemez; frontend kapak alanını **gizler/pasifler** (mesaj-eki butonunun gating'iyle aynı sinyal). Sahip: gerçek kullanıcı/yayıncı demosunda `UPLOADS_ENABLED=false` → kapak yüzeyi karanlık.

**Tarama:** Gerçek tarama YOK (stub). `attachmentScanEnabled=false` iken iliştirme **CLEAN** (mesaj-eki ile birebir, `messages.service` deseni). `true` (gelecek, R5 aracı) iken PENDING → tarama servisi. **Bu sprint scan motoru EKLEMEZ** — yalnız mevcut bayrak davranışını miras alır.

**OUT:** Gerçek CSAM tarayıcı (lansman/R5) · kapak için ayrı CDN/public yol · hatırlatma (C1) · attachment temizlik job (D13, mevcut durum korunur).

---

## §1 — Veri Modeli

**Şema değişikliği YOK.** `GuildEvent.coverImageId String?` zaten mevcut (plain string, FK değil — bilinçli: orphan-cascade karmaşıklığı yok). `coverImageId` = `Attachment.id` referansı (loose). Migration YOK → `migrate status` temiz kalır.

---

## §2 — Backend: Kapak iliştirme + scanStatus

**Tek doğruluk: `messages.service` attach deseni birebir kopyalanır.**

`events.service` `create`/`update` içinde, `coverImageId` verildiyse `attachCover(coverImageId, userId)` (private helper):
1. **Doğrula:** Attachment var mı (`ATTACHMENT_NOT_FOUND`/`INVALID_COVER_IMAGE` 400) · `uploaderId === userId` (başkasının ek'i değil) · `contentType.startsWith('image/')` (`INVALID_COVER_TYPE` 400) · `messageId === null` (başka mesaja bağlanmamış — mesaj-eki doğrulamasıyla aynı).
2. **scanStatus ata:** `const newStatus = scanEnabled ? PENDING : CLEAN` (config `attachmentScanEnabled`, messages.service:359 ile birebir). Attachment'ı güncelle (`scanStatus = newStatus`). (`messageId` null kalır — kapak mesaj değil; claim'i `event.coverImageId` sağlar.)
3. **event.coverImageId = attachmentId** yaz.

**Update semantiği:** `coverImageId` **undefined** → değişmez · **null** → kapağı kaldır (`event.coverImageId = null`; eski attachment'a dokunma — D13 temizliği ayrı) · **string** → yukarıdaki `attachCover` + ata. (Engine'deki `endAt` null/undefined deseniyle aynı.)

`scanEnabled` config'i `EventsService` constructor'ında okunur (messages.service deseni).

---

## §3 — Backend: EventDto.coverImageUrl

**`toEventDto`'yu async yapma** (occurrence sync kalsın, ripple olmasın). Yerine: servis metotları kapak URL'ini **önceden çözüp** parametre olarak geçirir.

- `toEventDto(event, interestedCount, interestedByMe, coverImageUrl = null)` — yeni opsiyonel param; DTO'ya `coverImageUrl` ekler.
- **Çözüm helper'ı** `resolveCoverUrl(coverImageId): Promise<string | null>`:
  - `coverImageId` yoksa → null.
  - Attachment lookup → **yalnız `scanStatus === 'CLEAN'`** ise `storage.presignGet(storageKey)` → URL; aksi (PENDING/FLAGGED/yok) → **null** (kapak gizli; mesaj-eki serve kapısıyla aynı: taranmamış görsel servis edilmez).
- `findByGuild` listesinde kapaklar **paralel** çözülür (`Promise.all`); `findOne`/`create`/`update`/interest tekil çözer. (presignGet lokal imzalama → ucuz.)

**Görünürlük/T&S:** `coverImageUrl` yalnız `EventDto` içinde döner; `EventDto` da `canViewEvent` kapısından geçen viewer'a gider → kapak, etkinliğin görünürlüğüyle **aynı kapıda** (etkinliği görüyorsan kapağı da görürsün). presignGet 300s ömürlü. Ayrı erişim kontrolü gerekmez.

---

## §4 — DTO

`CreateEventDto`: **+** `@IsOptional() @IsString() coverImageId?: string`.
`UpdateEventDto` = PartialType (otomatik; null/undefined semantiği §2).
`EventDto` (yanıt): **+** `coverImageUrl: string | null`.
Yeni hata kodları: `INVALID_COVER_IMAGE` (yok/sahip değil/messageId dolu), `INVALID_COVER_TYPE` (görsel değil). (`ATTACHMENT_NOT_FOUND` mevcut.)

Endpoint imzaları **değişmez** (mevcut 7 event endpoint); yalnız create/update body + EventDto zenginleşir. Yeni event endpoint YOK (kapak yükleme **mevcut `/attachments/presign`** ile).

---

## §5 — Frontend (`web/`)

1. **Tip:** `EventDto.coverImageUrl: string | null`; `CreateEventPayload`/`UpdateEventPayload` **+** `coverImageId?: string`.
2. **Sihirbaz (`CreateEventWizard`, Adım 2 "Etkinlik Bilgisi"):** MVP'de gizli olan **Kapak Görseli** alanı açılır:
   - Dosya seç (image/*) → `attachmentsApi.presign` → `uploadToS3` (mevcut `api/attachments.ts`) → dönen `attachmentId`'yi `coverImageId`'ye ata. Yükleme sırasında progress/önizleme (`URL.createObjectURL`, mevcut `AttachmentComposeModal` deseni).
   - Kaldır butonu → `coverImageId = ''`/null.
   - **Gating:** `UPLOADS_ENABLED` kapalıysa kapak alanı **gösterilmez** (mesaj composer'daki ek-butonu gating sinyaliyle aynı — dev mevcut sinyali bulup kullanır; yoksa presign `UPLOADS_DISABLED` 403'ünü yakalayıp alanı gizler/bilgi verir).
   - Edit modunda mevcut `coverImageUrl` önizlemede gösterilir.
3. **İncele adımı + Kart (`EventsModal`) + (varsa) liste:** `coverImageUrl` doluysa kapak görseli render (`<img>`, kart üstü banner; `object-cover`, `--kv-radius`). Yoksa kapaksız mevcut düzen. Kapak görseli **lightbox gerektirmez** (kart süsü).
4. **i18n:** `event.wizard.coverLabel`, `coverUpload`, `coverRemove`, `coverUploading`, hata kodları (`INVALID_COVER_IMAGE`/`INVALID_COVER_TYPE`) `tr.json`; `--kv-*` token.

---

## §6 — DoD

- [ ] `coverImageId` create/update'te işlenir; `attachCover` mesaj-eki desenini birebir izler (sahiplik + messageId-null + `scanEnabled?PENDING:CLEAN`); update null/undefined/string semantiği
- [ ] `EventDto.coverImageUrl` yalnız CLEAN'de presignGet; PENDING/FLAGGED/yok → null; liste paralel çöz
- [ ] Görünürlük: kapak yalnız etkinliği görene döner (mevcut choke-point değişmez); **scan-gated hat birebir, yeni baypas YOK** (ikon D14 deseni KOPYALANMAZ)
- [ ] Gating: `UPLOADS_ENABLED=false` → presign 403, frontend kapak alanı gizli; SIFIR migration · SIFIR scan-motoru
- [ ] Sihirbaz kapak yükleme + önizleme/kaldır; kart kapak render; i18n + token
- [ ] `nest build` + `vue-tsc` + `vite build` temiz; birim test (attachCover sahiplik/tip/messageId-dolu ret + scanStatus CLEAN/PENDING + coverImageUrl CLEAN-only + update null kaldırma)
- [ ] Sahip canlı test (UPLOADS_ENABLED=true, dev MinIO): kapak yükle → kartta görünür; UPLOADS_ENABLED=false → kapak alanı yok

---

## §7 — Sapma Kuralı

Scan-hattını baypas eden ayrı bir kapak yolu (public `covers/` prefix, ikon-tarzı) açma İHTİYACI → **DUR, PM'e dön.** Bu sözleşmenin temel kararı: kapak = mevcut Attachment scan-hattı, mesaj-eki ile aynı seviye. Gerçek tarayıcı/şirket/hukuk bu sprintin DIŞINDA (lansman paketi).
