# Sprint V2 — Mesaj Arama Sözleşmesi

> Kök + tier `CLAUDE.md`. **Tek doğruluk kaynağı bu dosya.** Sapma → DUR, PM'e dön. Envelope `{ success, statusCode, data }`.
> İlgili: `messages.service.ts`, `messages.controller.ts`, frontend kanal/DM başlığı + arama paneli.

Amaç: bir **kanal veya DM içinde** metin araması. Erişim/güvenlik mevcut `requireChannelAccess` ile gated
(yaş kapısı, özel kanal, DM clearedAt). Sonuçlar liste olarak gösterilir (mesaja zıpla — ertelendi, pins ile aynı).

---

## 1. Endpoint

`GET /channels/:id/messages/search?q=<metin>&before=<cursor?>`
- `JwtAuthGuard`. `requireChannelAccess(userId, channelId)` ile gated (mevcut erişim + yaş + özel kanal + DM clearedAt mantığı **aynen** uygulanır).
- **q:** trim'li, **min 2 karakter** (kısa → `400 { error: 'QUERY_TOO_SHORT' }`). Maks 100 karakter (kes).
- Arama: `content` üzerinde **case-insensitive** eşleşme (`contains`, `mode: 'insensitive'`), `deletedAt: null`,
  DM ise `clearedAt`'ten sonrası (mevcut `findMessages` G4 mantığı birebir).
- Sıra `createdAt desc`, cursor `before` (mevcut `findMessages` cursor deseni), `take` 30 (max 30).
- Dönüş: `MessageDto[]` (mevcut `toMessageDto` şekli — author/attachments/reactions/replyTo/mentions/pinnedAt).

---

## 2. Servis

`messages.service.ts` → `searchMessages(userId, channelId, q, before?)`:
- `requireChannelAccess` → kanal (yaş/özel/DM erişim throw'ları propagate).
- q doğrulama (min 2, trim) → kısa ise `BadRequestException QUERY_TOO_SHORT`.
- `findMessages` ile aynı `createdAt` filtre birleşimi (DM clearedAt gt + before lt) + `content: { contains: q, mode: 'insensitive' }`.
- Mevcut include şekli → `toMessageDto[]`.
- (Perf notu: bu ölçekte `ILIKE`/`contains` yeterli; FTS/pg_trgm gerekirse sonraki dalga — bu sprintte YOK.)

---

## 3. Frontend

- **Arama girişi:** kanal başlığı (`TopBar`) + DM başlığında bir **arama ikonu** → tıklayınca arama input'u + sonuç paneli (pins popover deseni: `--kv-bg-elevated` + ince kenarlık, gölge yok). Alternatif: başlıkta açılır arama kutusu.
- **Davranış:** input'a yazınca (debounce ~300ms, ≥2 karakter) `GET .../search?q=` çağrılır; sonuçlar listelenir: yazar avatarı + ad + **eşleşen içerik** (istenirse eşleşen terim vurgulu) + saat (TR). Boş/az-karakter/sonuç-yok durumları ayrı metin.
- **Mesaja zıpla YOK** (ertelendi — pins ile aynı); sonuç yalnız içeriği gösterir. `<@id>` token'ları `formatMentionsPlain` ile çözülür (ham görünmesin).
- Yükleniyor + hata durumları. Daha-fazla (cursor) opsiyonel; en azından ilk 30 sonuç.
- **i18n:** tüm string `tr.json` ("Ara", "Mesajlarda ara", "En az 2 karakter", "Sonuç bulunamadı" vb.).

---

## 4. Kabul kriterleri

- [ ] `GET /channels/:id/messages/search` + `searchMessages`; `requireChannelAccess` gated; `QUERY_TOO_SHORT`; case-insensitive; DM clearedAt; cursor.
- [ ] Backend testleri: erişim propagate · kısa q → 400 · eşleşme (insensitive) · silinmiş hariç · DM clearedAt sınırı · sıra/cursor.
- [ ] Frontend: başlık arama ikonu + panel (guild+DM) + debounce + sonuç listesi + boş/az/hata durumları + token çözümü.
- [ ] `api`+`web` build TEMİZ; testler yeşil.

## 5. Kapsam dışı
- Sunucu-geneli (çok-kanal) arama · mesaja zıpla/bağlam · FTS/relevance sıralama · filtre (yazar/tarih). Sonraki dalgalar.
