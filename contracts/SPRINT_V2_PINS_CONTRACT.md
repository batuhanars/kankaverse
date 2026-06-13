# Sprint V2 — Sabitlenen Mesajlar (Pins) Sözleşmesi

> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. **Tek doğruluk kaynağı bu dosya.** Endpoint/DTO/event/şema
> buradan sapamaz; sapma → dev DURUR, PM'e döner. Response envelope `{ success, statusCode, data }`. İlgili:
> `messages.service.ts`, `messages.controller.ts`, `messages.gateway.ts`, frontend `MessageActionsMenu`/`TopBar`.

Amaç: bir mesajı kanalda **sabitlemek** → kanal başlığından erişilen "sabitlenen mesajlar" listesi. Guild,
grup DM ve 1-1 DM'de çalışır. Reaksiyon/yanıt endpoint desenini (`/channels/:id/messages/:messageId/...`) izler.

---

## 1. Veri modeli (Prisma)

`Message` modeline:
```prisma
pinnedAt   DateTime?   // null = sabit değil; dolu = sabitlenme zamanı
pinnedById String?     // sabitleyen userId (scalar — FK/relation YOK, audit/görünüm için)
```
Migration: `add_message_pins`. İndeks: `@@index([channelId, pinnedAt])` (sabit liste sorgusu).
T&S: yeni içerik yüzeyi YOK — sabitlenen mesaj zaten kanalda görünür; liste `requireChannelAccess` ile
gated (yaş kapısı dahil). Auth-karar fonksiyonu değil → R7 zorunlu değil.

---

## 2. Yetki — KARAR

- **Guild kanalı:** yalnız **OWNER/ADMIN** sabitler/kaldırır (`requireGuildMembership` + `requireAdminRole`).
- **DM / grup DM:** **herhangi bir kanal üyesi** (`requireChannelAccess` yeterli — katılımcı).
- **Liste (`GET pins`):** kanala erişebilen herkes (`requireChannelAccess`; yaş-kapılı kanal minöre kapalı).

---

## 3. Üst sınır

Kanal başına **en fazla 50** sabit mesaj. Aşılırsa `409 { error: 'PIN_LIMIT' }` ("Bu kanalda en fazla 50
mesaj sabitlenebilir."). (Discord paritesi + anti-şişme.)

---

## 4. Endpoint'ler

Tümü `JwtAuthGuard`. Mevcut mesaj-controller'ına eklenir.

| Metot | Yol | Yetki | Davranış |
|---|---|---|---|
| `POST 200` | `/channels/:id/messages/:messageId/pin` | §2 | Mesaj var+silinmemiş+bu kanalda olmalı. Zaten sabitse no-op (idempotent). `pinnedAt=now`, `pinnedById=userId`. 50 sınırı kontrol. WS `message.pinned`. `null` döner. |
| `DELETE 200` | `/channels/:id/messages/:messageId/pin` | §2 | Sabit değilse no-op. `pinnedAt=null`, `pinnedById=null`. WS `message.unpinned`. `null` döner. |
| `GET 200` | `/channels/:id/pins` | erişen | `pinnedAt not null` + `deletedAt null`, **`pinnedAt desc`**. `MessageDto[]` (tam mesaj DTO, §6 şekliyle). |

`pin`/`unpin` yetki: guild ise `requireGuildMembership`+`requireAdminRole`; DM/grup ise `requireChannelAccess` üyeliği yeterli. Mesaj-kanal eşleşmesi doğrulanır (başka kanalın mesajı → `400 INVALID_MESSAGE` veya 404).

---

## 5. WS olayları

Room `room:<channelId>`'a (mevcut `broadcastReaction` deseni):
- **`message.pinned`** payload: `{ messageId, channelId, pinnedAt }`
- **`message.unpinned`** payload: `{ messageId, channelId }`

Frontend bunları dinleyip ilgili mesajın `pinnedAt`'ini günceller (pin rozeti) + açık pins listesi tazelenir.

---

## 6. MessageDto deltası

`toMessageDto` çıktısına **`pinnedAt: msg.pinnedAt ? ISO : null`** ekle (3 sorgu yolu + pins listesi). Frontend
bununla mesaj satırında 📌 rozeti gösterir ve ⋯ menüsünde "Sabitle/Kaldır" durumunu belirler. (`pinnedById`
DTO'ya eklenmez — şimdilik dahili.)

---

## 7. Frontend (web/) — davranış sözleşmesi

- **⋯ aksiyon menüsü:** yeni öğe **📌 Sabitle** / **Sabitlemeyi kaldır** (mesajın `pinnedAt`'ine göre toggle).
  Görünürlük yetkiye göre: guild → yalnız OWNER/ADMIN; DM/grup → tüm katılımcılar. (Yetki guilds store rolünden;
  DM'de herkes.)
- **Kanal başlığı (TopBar / DM başlığı):** 📌 ikon butonu → **"Sabitlenen Mesajlar" popover/panel** (`GET pins`).
  Liste: yazar avatarı + ad + içerik özeti + saat. Boş durum metni. `--kv-bg-elevated`+ince kenarlık, gölge yok.
- **Pin rozeti:** `pinnedAt` dolu mesaj satırında küçük 📌 göstergesi (ince, token renkli).
- **WS:** `message.pinned`/`unpinned` → mesaj store'da `pinnedAt` güncelle; popover açıksa tazele.
- **i18n:** tüm yeni string `i18n/tr.json` (Sabitle, Sabitlemeyi kaldır, Sabitlenen Mesajlar, boş durum, 50-limit hatası).

---

## 8. Kapsam dışı (bu dalga — ERTELENDİ)

- **Sabit listesinden mesaja "zıpla"** (scroll-to-message + gerekirse geçmiş yükleme) → sonraki dalga.
  Bu sprint: popover sabit mesajların **içeriğini** gösterir (zıplama yok).
- "Sabitleyen kişi" görünümü (pinnedById dahili tutulur, UI'da gösterilmez).
- Sabitleme bildirimi/sistem-mesajı yok.

---

## 9. Kabul kriterleri

- [ ] `Message.pinnedAt`/`pinnedById` + migration + indeks; `toMessageDto.pinnedAt`.
- [ ] 3 endpoint (pin/unpin idempotent + pins list); yetki §2 (guild=admin, DM=üye); 50 sınırı `PIN_LIMIT`.
- [ ] Mesaj-kanal eşleşme + silinmiş-mesaj koruması; WS `message.pinned`/`unpinned`.
- [ ] Frontend: ⋯ Sabitle/Kaldır (yetki gizleme) + başlık pins popover + pin rozeti + WS güncelleme.
- [ ] `api` + `web` build TEMİZ; backend testleri (pin/unpin/idempotent/limit/yetki/liste-sıra) yeşil.
