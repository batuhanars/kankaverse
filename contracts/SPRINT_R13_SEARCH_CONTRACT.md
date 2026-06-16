# SPRINT R13 — Arama Elden Geçirme Sözleşmesi

> **Tek doğruluk kaynağı.** Kaynak: Revizeler-3 (Görsel #11, #12). Sahip: iki arama çubuğu fazla →
> kanal-içi aramayı kaldır, ortam-geneli aramayı zenginleştir + sonuçları sağ sidebar'da göster.

## Kararlar
- **Kanal-içi arama KALDIRILIR** (`SearchPopover`, TopBar'da). Ortam-geneli arama her işi görür.
- **Ortam-geneli arama** = sağ sidebar paneli (popover değil): metin highlight + Gönderen filtresi + @Bahsedilen filtresi.
- Enter → sonuçlar sağ sidebar'da kanal-gruplu, eşleşen kelimeler highlight, mesaja zıpla, kapatılabilir.

## Backend — `searchGuildMessages` genişlet
**Endpoint:** `GET /guilds/:id/messages/search?q=&from=&mentions=`
- `q` (opsiyonel): içerik metin araması (mevcut — contains, case-insensitive).
- `from` (opsiyonel): `authorId` → yalnız o kullanıcının mesajları (`where author.id`).
- `mentions` (opsiyonel): `userId` → o kullanıcıyı @bahseden mesajlar (`where: { mentions: { has: userId } }` — Message.mentions String[] mevcut).
- **En az biri** (`q`|`from`|`mentions`) dolu olmalı; hepsi boş → boş sonuç (400 değil, boş dön).
- Mevcut erişim kontrolü (yalnız erişilebilir kanallar) + kanal-gruplu dönüş şekli KORUNUR. Mesaj DTO `content` taşır (frontend highlight için). Yetki/sızıntı deseni mevcut `searchGuildMessages` ile aynı.
- DTO/şekil mevcut dönüşle uyumlu; yeni alan gerekmez (filtreler yalnız query).

## Frontend
### Kaldır
- `TopBar.vue`'den `SearchPopover` (kanal-içi arama ikonu + kullanım) tamamen kaldır. `SearchPopover.vue` artıksa silme zorunlu değil ama referansı kaldır. Pin + Üyeler toggle KALIR.

### Sağ sidebar arama paneli (yeni — `GuildSearchPanel.vue`)
- **Tetikleme:** `GuildTopBar` arama ikonu → sağ sidebar'ı aç (üye panelinin sağ-sütun toggle desenini izle; arama paneli açıkken üye paneli yerini alır ya da onunla dönüşümlü — mevcut sağ-sütun yönetimini bul ve uy). Kapatma butonu (✕) paneli kapatır.
- **İçerik:**
  - Üstte arama input'u (q) — Enter ile ara. "Filtreler" toggle → Gönderen (ortam üyesi seçici) + Bahsedilen (ortam üyesi seçici) — `membersStore` guild üyelerinden basit dropdown/arama. Seçilince `from`/`mentions` query'e eklenir.
  - "{n} Sonuç" sayacı.
  - Sonuçlar kanal-gruplu (mevcut `searchGuildMessages` dönüş şekli); her sonuç: yazar avatar+ad, tarih (TR), içerik snippet — **eşleşen `q` kelimeleri highlight** (`<mark>`/accent arka plan). Tıkla → mesaja zıpla (mevcut `onResult`/jump deseni — kanal+messageId).
  - Boş/yükleniyor/hata durumları.
- **Highlight güvenliği:** içerik kullanıcı-kontrollü → **v-html YOK**. q terimini snippet içinde bul, parça parça render et (eşleşen parçayı `<mark>`/span ile sar). Büyük/küçük duyarsız.

### @ ile bahsetme
- Input'a `@` yazıp üye seçilince (veya Bahsedilen filtresi) `mentions` filtresi kurulur → o kullanıcının @bahsedildiği mesajlar. (Basit: Bahsedilen dropdown'ı yeterli; `@`-inline-autocomplete opsiyonel, zaman varsa.)

## DoD
- api: build + tsc + test temiz; searchGuildMessages from/mentions filtreleri test edilir.
- web: vue-tsc + vite build temiz; kanal-içi arama kaldırıldı; sağ sidebar arama + highlight + filtreler çalışır.
