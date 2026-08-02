# SPRINT M2c — Mobil Kanal Detay Ekranı

> **Tek doğruluk kaynağı.** Endpoint imzası, DTO şekli, sekme listesi buradan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
>
> PM compose: 2026-08-02. Referans: sahibin Discord mobil ekran görüntüsü (kanal adına dokununca
> açılan detay ekranı: başlık + dört yuvarlak aksiyon + beş sekme).

---

## §0 Bağlam

Sahip Discord'da kanal adının tıklanabilir olduğunu fark etti ve aynısını istedi. Bizde bugün kanal
başlığı **düz metin** — hiçbir yere götürmüyor.

M2 sırası: **M2a** okunmamış görsel dili ✅ · **M2b** bildirim tercihleri ✅ · **M2c (bu)** kanal
detay ekranı · **M2d** push.

Bu sprint **iki tier'a** dokunur: küçük bir `api/` eklentisi (§2) + asıl iş `mobile/`.

---

## §1 Kapsam

### IN

1. Sohbet ekranı başlığında **kanal adı tıklanabilir** + sağında chevron (tıklanabilirlik işareti)
2. **Kanal detay ekranı**: başlık + aksiyon şeridi + beş sekme
3. Aksiyonlar: **Ara** · **Sustur** · **Ayarlar** (yetkiliye)
4. Sekmeler: **Üyeler** · **Medya** · **Sabitlemeler** · **Bağlantılar** · **Dosyalar**
5. `api/`: arama `has` filtresine **`image`** değeri (§2)

### OUT (bilinçli)

| Çıkarılan | Gerekçe |
|---|---|
| **Alt Başlıklar (threads)** | Bizde thread özelliği **hiç yok**. Discord'un dördüncü aksiyonu bu; boş yüzey açılmaz. |
| DM/grup DM detay ekranı | DM başlığı bugün zaten profil/grup ekranına gidiyor; çalışıyor, dokunulmuyor. |
| Sekmelerde sonsuz kaydırma / sayfalama | Arama ucu sabit 50 kayıt dönüyor; ilk turda o yeterli. Daha fazlası ayrı karar. |

---

## §2 `api/` — arama `has` filtresine `image` (küçük, R7-nötr)

Bugün `GET /guilds/:id/messages/search` `has` parametresi yalnız **`link | file`** kabul ediyor
(`messages.controller.ts:210`, `messages.service.ts:776`). Medya ile Dosya ayrımı **yok**, bu yüzden
iki sekme aynı sonucu gösterirdi.

**Değişiklik:**

| `has` değeri | Anlamı |
|---|---|
| `link` | değişmedi |
| `image` | **YENİ** — eki `image/*` **veya** `video/*` olan mesajlar |
| `file` | 🔴 **daraltıldı** — eki olan **ama medya olmayan** mesajlar (`image/*` ve `video/*` hariç) |

Gerekçe: iki sekme çakışmasın. "Dosyalar" sekmesinde görsellerin de listelenmesi kullanıcıya tekrar
gösterir. `Attachment.contentType` zaten mevcut (`schema.prisma:410`), yeni alan gerekmiyor.

- `@ApiQuery` açıklaması güncellenir: `link | image | file`
- **Migration YOK, yeni uç YOK, yeni alan YOK**
- Görünürlük/T&S süzgeçleri (özel kanal, yaş kapısı, minör) **değişmez** — yalnız `where` içindeki
  ek koşulu genişletiyoruz
- Birim test: üç değerin üçü de (`link`, `image`, `file`) + medya-dışı ekli mesajın `image`'e
  düşmediği durum
- **Yan etki:** web'in M1g "Dosya" filtresi artık medya-dışı ekleri döner. Etiket zaten "Dosya",
  semantik **düzeliyor**; ayrıca not düşülür.

---

## §3 Giriş noktası — sohbet ekranı başlığı

`components/MessageScreen.tsx` başlığı (kanal ekranında `# kanal-adı`):

- Başlık **dokunulabilir** olur, sağına chevron (`chevron-forward`) konur
- Dokunuş → `channel-details` route'una gider (`params: { channelId, guildId }`)
- **Yalnız ortam kanallarında** — DM/grup DM başlığının bugünkü davranışı (profil/grup ekranı)
  **değişmez**

---

## §4 Kanal detay ekranı — `app/(app)/channel-details.tsx`

### 4.1 Başlık bölümü

Ortalanmış `# kanal-adı` (büyük). Kanal `ageGated` ise mevcut yaş rozeti burada da gösterilir.

### 4.2 Aksiyon şeridi — üç yuvarlak düğme

| Düğme | Davranış | Görünürlük |
|---|---|---|
| **Ara** | Ortam araması, `in=<channelId>` ön-seçili (`guild-search` route'u zaten bu filtreyi taşıyor) | herkes |
| **Sustur** | M2b'nin süre seçicisi (`SelectSheet` + `notifPrefUi`), hedef `CHANNEL:<channelId>`. Susturulmuşsa etiket "Susturmayı Kaldır" | herkes |
| **Ayarlar** | `channel-edit` route'u | **yalnız `canManage`** |

Yetkisiz kullanıcıda Ayarlar **hiç render edilmez** (disabled gösterilmez — mevcut desen).
Şeritte boşluk kalmaz, kalan düğmeler ortalanır.

### 4.3 Sekmeler

Yatay **kaydırılabilir** sekme çubuğu (beş sekme dar ekrana sığmaz; Discord'da da kaydırmalı).
M1g'de yazılan `SearchTabs` deseni tekrar kullanılabilir — uygunsa **yeniden yaz, kopyalama**.

| Sekme | Veri kaynağı | Görünüm |
|---|---|---|
| **Üyeler** | `GET /guilds/:id/members` | En üstte **Üyeleri Davet Et** satırı (→ `guild-invite`), altında **rol gruplu** liste. Gruplama istemcide: üyenin en yüksek pozisyonlu rolüne göre başlık, rolsüzler en altta. `MemberRow` bileşeni tekrar kullanılır. |
| **Medya** | `GET /guilds/:id/messages/search?in=<channelId>&has=image` | Izgara (3 sütun) küçük önizleme; dokununca mevcut ek görüntüleyici (`AttachmentView`) |
| **Sabitlemeler** | `GET /channels/:id/pins` | Mesaj listesi (mevcut `pins.tsx` ekranının içeriği bileşene çıkarılıp burada tekrar kullanılır) |
| **Bağlantılar** | `...&has=link` | Mesaj listesi |
| **Dosyalar** | `...&has=file` | Ek listesi (dosya adı + boyut + tür ikonu) |

Her sekme: yükleniyor · boş durum · hata (sunucunun Türkçe mesajı + tekrar dene).
Sekme içeriği **ilk açılışta** çekilir (hepsi peşin çekilmez).

**Davet Et satırı yalnız davet üretebilenlere** gösterilir (mevcut `canManage` mantığı; sunucu da
403 döner).

---

## §5 T&S / R7

**R7-nötr.** Yeni görünürlük kararı üretilmiyor:

- Arama ucu erişilebilir kanalları **kendisi** süzüyor (özel kanal, yaş kapısı, minör kuralları
  `messages.service.ts` içinde); istemci `in=<channelId>` filtresi ekliyor, kapıyı gevşetmiyor
- `GET /channels/:id/pins` ve `GET /guilds/:id/members` mevcut erişim kontrollerini taşıyor
- Ek görüntüleme `AttachmentView` üzerinden — tarama durumu (`scanStatus`) mantığı **değişmez**

---

## §6 DoD

**Makine:**
- [ ] `api/`: `npm run build` + `npm test` temiz; migration **yok** (`migrate status` temiz)
- [ ] `mobile/`: `typecheck` + `lint` temiz
- [ ] `web/` diffi yalnız `src/i18n/tr.json`

**Sahip — fiziksel cihazda:**
- [ ] Kanal başlığında chevron var, dokununca detay ekranı açılıyor
- [ ] Ara → o kanalda arama açılıyor (filtre ön-seçili)
- [ ] Sustur → süre seçilebiliyor, susturulmuşken etiket "Susturmayı Kaldır"a dönüyor
- [ ] Yetkisiz hesapta **Ayarlar düğmesi yok**, şeritte boşluk kalmıyor
- [ ] Beş sekme de veri getiriyor; boş kanalda boş durum metinleri çıkıyor
- [ ] Medya sekmesinde yalnız görsel/video, Dosyalar sekmesinde yalnız **diğer** dosyalar
- [ ] Sabitlemeler sekmesi mevcut sabitleme ekranıyla aynı sonucu veriyor
- [ ] Üyeler sekmesinde roller gruplu; davet satırı yalnız yetkilide

---

## §7 Sonraki

**M2d — push:** dev build (EAS/yerel), `expo-notifications`, `PushToken` modeli + kayıt uçları,
gönderim servisi, susturulmuş hedeften push gitmemesi, bildirime dokununca doğru ekrana gitme.
Sahibin dile getirdiği tasarım kaygısı kayda geçti: *"ard arda bildirim düşüyor, yanlışlıkla
tıklayınca istemediğim yere gidiyorum"* → gruplama ve hedefleme M2d'nin kritik kararları.
