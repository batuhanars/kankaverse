# Sprint M1j — Mobil Ortam Etkinlikleri (Track F2)

> **Tek doğruluk kaynağı.** Endpoint imzası, DTO şekli, enum değeri buradan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
>
> PM compose: 2026-08-02. Kapsam kararları sahip onaylı (aşağıda §1).
> Referans: sahip Discord mobil akışının 7 ekran görüntüsünü verdi (2026-08-02) + web `CreateEventWizard.vue`.

---

## §0 Bağlam — backend zaten hazır

Etkinlikler V3'te uçtan uca yapıldı: model + `MANAGE_EVENTS` izni + CRUD + ilgi + tekrarlama
(computed occurrence) + kapak görseli + görünürlük choke-point (`canViewEvent`). Web'de tam çalışıyor.

**Mobilde hiç yok.** Bu sprint saf istemci işi:

- `api/` → **SIFIR dokunuş.** Endpoint/DTO değişikliği gerekiyorsa bu sözleşme yanlıştır → DUR.
- `web/` → başlangıçta yalnız `src/i18n/tr.json`. **R1 ile genişledi** (§10): sahip bitiş
  tarihi/saatinin web'de de eksik olduğunu buldu → `CreateEventWizard.vue`, `EventsModal.vue`,
  `api/events.ts`, `useEventDateFormat.ts` de değişti.
- `mobile/` → asıl iş.

---

## §1 Kapsam (sahip onaylı, 2026-08-02)

### IN

1. Ortam aksiyon şeridine **takvim düğmesi** (M1g'de yeri ayrılmış, düğmesi bilinçli konmamıştı — özellik
   geldiği için artık konur).
2. **Etkinlikler sayfası** (bottom sheet): liste · boş durum · "Oluştur" (yalnız `MANAGE_EVENTS`).
3. **Etkinlik kartı:** occurrence tarihi · ad · konum · "şu an sürüyor" + tekrar rozetleri ·
   kapak görseli (varsa) · açıklama · "İlgileniyor" toggle + sayaç · ⋯ menü (Düzenle / Sil).
4. **Etkinlik formu** (tam ekran, 3 adım): oluştur **ve** düzenle.
5. **Silme** onay diyaloğu.

### OUT (bilinçli — boş yüzey açma)

| Çıkarılan | Gerekçe |
|---|---|
| **Kapak görseli yükleme** | Sahip kararı: mobilde yalnız **gösterim**. Yükleme yüzeyi web'de kalır. Borç tablosuna. |
| **Paylaş bağlantısı** | `EXPO_PUBLIC_WEB_URL` **var** (M1c'de eklenmiş), ama web'in `?event=` yakalayıcısı `ChannelPanel` mount'ında ve **aktif ortam bağlamına** muhtaç — linki açan kişi başka ortamdaysa yanlış liste açılır. Doğru link yolunun web'de doğrulanması gerekiyor; ilk tura girmedi. Borç. |
| **Markdown açıklama** | Mobilde markdown boru hattı **hiç yok** (mesajlar bile düz metin + mention). Etkinlik için tek başına markdown getirmek kapsam dışı — açıklama düz metin, satır sonları korunur. |
| **WS canlı güncelleme** | Sayfa her açılışta taze `fetch` eder; sheet kısa ömürlü. `guild.event_*` dinlemesi eklenmez. |
| **Takvim görünümü · hatırlatma · CANCELED aksiyonu** | Web'de de yok (V3'te ertelendi). |

---

## §2 Endpoint imzaları (backend'den kopya — değiştirme)

Tümü envelope'lu: `{ success, statusCode, data }`. Gerçek veri `response.data.data`.

```
GET    /guilds/:id/events        → EventDto[]     (occurrenceStartAt artan, görünürlük süzülü)
POST   /guilds/:id/events        → EventDto       (201, MANAGE_EVENTS)
PATCH  /events/:id               → EventDto       (200, MANAGE_EVENTS)
DELETE /events/:id               → null           (200, MANAGE_EVENTS, soft-delete)
POST   /events/:id/interest      → EventDto       (200, idempotent)
DELETE /events/:id/interest      → EventDto       (200, idempotent)
```

```
GET    /events/:id               → EventDto       (düzenleme formunu doldurmak için)
```

Derin link (`?event=`) mobilde yok; tekil uç yalnız düzenleme formunun veri kaynağıdır
(etkinliği liste ekranından parametreyle serileştirip taşımak yerine).

### EventDto

```ts
{
  id: string
  guildId: string
  creatorId: string
  name: string
  description: string | null
  locationType: 'VOICE_CHANNEL' | 'EXTERNAL'
  channelId: string | null
  channelName: string | null
  externalLocation: string | null
  startAt: string                 // ISO — ÇAPA (görüntülemede kullanılmaz)
  endAt: string | null
  occurrenceStartAt: string       // ISO — GÖRÜNTÜLENEN tarih (backend türetir)
  occurrenceEndAt: string | null
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELED'
  interestedCount: number
  interestedByMe: boolean
  createdAt: string
  coverImageUrl: string | null    // yalnız tarama-CLEAN'de dolu presigned GET URL
}
```

🔴 **Kart tarihi `occurrenceStartAt`'tan okunur, `startAt`'tan DEĞİL.** Occurrence'ı istemci **yeniden
hesaplamaz** — tekrarlayan etkinliğin "bir sonraki" tarihi backend'in kararıdır.

### CreateEventPayload

```ts
{
  name: string
  description?: string
  locationType: 'VOICE_CHANNEL' | 'EXTERNAL'
  channelId?: string          // yalnız VOICE_CHANNEL'da gönderilir
  externalLocation?: string   // yalnız EXTERNAL'da gönderilir
  startAt: string             // ISO
  recurrence?: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
  coverImageId?: string | null
}
```

`UpdatePayload = Partial<CreatePayload>`.

🔴 **Düzenlemede `coverImageId` ALANI HİÇ GÖNDERİLMEZ.** Semantik: `undefined` → değişmez ·
`null` → **kapağı siler** · string → yeni kapak. Mobilde yükleme yok, dolayısıyla `null` göndermek
web'den yüklenmiş kapağı sessizce yok eder. Alanı payload'a hiç koyma.

### Hata kodları (kullanıcıya `message`, log'a `error`)

`EVENT_NOT_FOUND` · `INVALID_EVENT_CHANNEL` · `EVENT_LOCATION_REQUIRED` · `EVENT_START_IN_PAST` ·
`AGE_RESTRICTED` · `FORBIDDEN`. i18n karşılıkları `event.errors.*` altında **zaten var**.

---

## §3 Ekranlar ve akış

### 3.1 Giriş — aksiyon şeridi (mevcut, M1g)

Şerit bugün: geniş **Ara** + dar **davet** ikonu. Üçüncü olarak **takvim** ikonu eklenir
(Discord'da da aynı yerde). Düğme **herkese görünür** — liste görüntüleme izne bağlı değil,
yalnız oluşturma `MANAGE_EVENTS` ister.

### 3.2 Etkinlikler sayfası — tam ekran route

> **PM revizesi (2026-08-02, uygulama sırasında):** ilk taslak Discord'u izleyip **bottom sheet**
> diyordu. Teknik engel: RN `Modal` Android'de her şeyin üstünde kalır, üstüne `router.push` ile
> form ekranı açılamaz — sheet'ten forma geçiş ya sheet'i kapatmayı ya da 3 adımlı formu tarih
> seçicisiyle birlikte Modal içine sıkıştırmayı gerektirirdi. İkisi de kötü. Liste **route** oldu
> (`guild-events.tsx`); proje deseni de bu yönde (`guild-search`, `guild-invite` tam ekran).
> Sheet deseni bu projede yalnız kısa aksiyon menülerinde kullanılıyor.

- Başlık: `event.modalTitle` (sayaçlı) · sağda **Oluştur** (yalnız `MANAGE_EVENTS`)
- Boş durum: takvim ikonu + `event.empty` + izin açıklaması (yeni `mobile.*` metni)
- Liste: dikey kaydırma, kartlar
- **Her açılışta `GET /guilds/:id/events`** (önbellek yok, store yok — tek ekran, `useState` yeter)

### 3.3 Kart

```
[kapak görseli — coverImageUrl varsa, 130px, object-cover]
02 AĞUSTOS 2026, 21.00        ← occurrenceStartAt, TR format
Salı Akşamı WoW                                     ⋯
🔊 test-ses  /  📍 <externalLocation>
[● şu an sürüyor] [🔁 Her hafta]                    ← koşullu rozetler
<açıklama — düz metin, satır sonları korunur>
[✓ İlgileniyor]  3 kişi ilgileniyor
```

- **İlgileniyor:** iyimser toggle (`interestedByMe` + `interestedCount` anında güncellenir), hata → geri al
- **⋯:** yalnız `MANAGE_EVENTS` → Düzenle · Sil (tehlike rengi)

### 3.4 Form — tam ekran, 3 adım (`event-form.tsx`)

Tek route, `params: { guildId, eventId? }`. `eventId` varsa düzenleme (alanlar dolu, submit `PATCH`).
Oluştur ve düzenle için **iki ayrı ekran yazma** — form gövdesi aynı.

**Adım 1 — "Etkinliğin nerede olacak?"**
- İki radyo kartı: **Ses Kanalı** / **Başka Bir Yer** (oluşturmada hiçbiri ön-seçili değil)
- Ses Kanalı seçilince: kanal seçici (alt sheet, `FilterValueSheet` deseni) + **ilk ses kanalı otomatik seçili**
- Ses kanalı yoksa: `event.wizard.noVoiceChannels` metni, ilerleme engellenir
- Başka Bir Yer seçilince: tek satır konum input'u
- Alt buton: **İleri**

**Adım 2 — "Etkinliğin neyle ilgili?"**
- Etkinlik adı (zorunlu)
- **Başlangıç Tarihi** + **Başlangıç Saati** yan yana → native seçici (§4 bağımlılık)
- Varsayılan: **şu an + 1 saat** (geçmiş-tarih hatasına düşmeyen makul varsayılan; web ile aynı)
- Etkinlik Sıklığı: Tekrarlanmaz / Her gün / Her hafta / Her ay
- Açıklama: çok satırlı, `maxLength=1000`, sayaç
- Alt butonlar: **Geri** · **İleri**

**Adım 3 — önizleme**
- Kartın birebir aynısı (aksiyonsuz) + "İşte etkinliğinin önizlemesi" başlığı
- Alt butonlar: **Geri** · **Etkinlik Oluştur** / **Kaydet**

**Adım gezinmesi:** Android donanım geri tuşu adım > 1 iken **adımı azaltır**, ekranı kapatmaz.
Adım 1'de geri → ekran kapanır.

**Doğrulama (istemci = yalnız UX, otorite backend):**
- Adım 1: konum türü seçilmiş · VOICE'ta kanal seçili · EXTERNAL'da konum boş değil
- Adım 2: ad boş değil · tarih+saat geçerli · başlangıç **gelecekte**
- Hata metni ilgili adımın altında, `event.wizard.err*` anahtarlarından

**Başarı:** oluşturma sonrası ekran kapanır, sheet listesi tazelenir. (Web'in "başarı + link kopyala"
4. adımı mobilde **yok** — paylaş kapsam dışı, bkz §1.)

---

## §4 Bağımlılık kararı (PM onaylı — tek yeni paket)

**`@react-native-community/datetimepicker`** — `npx expo install` ile (SDK 54 eşleşen sürümü kendi seçer).

- Gerekçe: tarih/saat girişi native seçici ister; elle "gün/ay/yıl" input'u mobilde kabul edilemez UX.
- Expo Go'da çalışır (dev build gerektirmez) — bu tier'ın test yolu Expo Go.
- **Başka paket ekleme.** İhtiyaç doğarsa DUR ve sor.

---

## §5 T&S / R7 durumu

**R7-nötr.** Bu sprint hiçbir yeni karar fonksiyonu, kapı veya görünürlük mantığı üretmez:

- Görünürlük tek choke-point'te (`canViewEvent`) — istemci **süzme yapmaz**, listeyi olduğu gibi gösterir
- `MANAGE_EVENTS` kontrolü istemcide **yalnız UX** (yapılamayacak işi ekranda göstermemek);
  otorite sunucudadır, 403 gelirse Türkçe mesaj gösterilir
- Yaş/erişim kapıları backend'de; istemci **gevşetmez de daraltmaz da** (`useGuildPermission` doktrini)
- Kapak görseli yalnız `coverImageUrl` **dolu** geldiğinde render edilir (dolu olması = tarama CLEAN);
  istemci scan durumu yorumlamaz

---

## §6 i18n

- Kaynak **`web/src/i18n/tr.json`**; mobil `tr.generated.json`'ı `npm run i18n:sync` ile alır.
  Üretilmiş dosyayı **elle düzenleme**.
- `event.*` ağacı zaten mevcut (kart, sihirbaz, hatalar, tekrar etiketleri) → **yeniden yazma, kullan**.
- Yalnız mobil-özel yeni metinler (`mobile.events.*`) `tr.json`'a eklenir. Web'de kullanılmayan
  anahtar sorun değil.
- Tarih formatı TR: "2 Ağustos 2026", saat "21.00". Web `useEventDateFormat` mantığı mobil karşılığına taşınır.

---

## §7 Dosya planı (öneri — dev sapabilir, ama sözleşme dışına çıkamaz)

```
mobile/src/api/events.ts                       # 6 uç + tipler
mobile/src/app/(app)/guild-events.tsx          # liste ekranı
mobile/src/app/(app)/event-form.tsx            # 3 adımlı form (oluştur + düzenle)
mobile/src/components/guild/EventCard.tsx      # kart
mobile/src/utils/eventDate.ts                  # TR tarih/saat formatı
```

Store **açma** (tek ekran, paylaşılan durum yok). Dosya 300+ satıra dayanırsa böl.

---

## §8 DoD

**Makine:**
- [ ] `npm run typecheck` temiz
- [ ] `npm run lint` temiz
- [ ] `api/` diff'i **boş**; `web/` diff'i yalnız `src/i18n/tr.json`

**Sahip — fiziksel cihazda (emülatör yeterli değil):**
- [ ] Ortam şeridinde takvim ikonu var, dokununca Etkinlikler açılıyor
- [ ] Etkinlik yokken boş durum görünüyor; yetkisiz hesapta "Oluştur" yok
- [ ] 3 adımdan geçip etkinlik oluşturuluyor; liste anında güncel
- [ ] Ses kanalı ve "Başka Bir Yer" iki yol da yürüyor
- [ ] Tekrarlayan etkinlik oluşuyor, kartta 🔁 rozeti ve **doğru sonraki tarih** görünüyor
- [ ] "İlgileniyor" iki yönde çalışıyor, sayaç doğru
- [ ] Düzenle → alanlar dolu geliyor, kaydedince değişiyor; **web'den yüklenen kapak silinmiyor**
- [ ] Sil → onay çıkıyor, silinince listeden düşüyor
- [ ] Geçmiş tarih / boş ad → Türkçe hata; sunucunun 403'ü Türkçe görünüyor

---

## §10 R1 — sahip cihaz turu revizesi (2026-08-02)

Sahip testi geçti ("etkinlik sistemi çalışıyor, etkinlik oluşturdum"). Üç düzeltme istendi:

1. **Sıklık açılır kutu olacak** (inline radyo listesi değil, Discord'daki gibi dokununca alttan
   panel) → `SelectSheet` bileşeni. Sahip yalnız sıklığı söyledi; **kanal seçimi de** aynı
   etkileşime çekildi — ikisi de Discord'da kapalı kutu, tek bileşen iki yeri de karşılıyor.
2. 🔴 **Bitiş tarihi + saati — hem mobil hem WEB.** Sahip bulgusu: alan web'de de yoktu, atlanmış.
   **Backend `endAt`'ı baştan destekliyordu** (opsiyonel · `endAt <= startAt` → 400 ·
   update'te `null` → kaldır · occurrence süreyi koruyor) → yine `api/` dokunuşu yok, eksik olan UI'dı.
   - Opsiyonel: boş bırakılabilir. Web'de iki alan birlikte dolar/boşalır (kısmi giriş reddedilir);
     mobilde tek `Date | null` durumu + "Bitişi kaldır".
   - Düzenlemede boşaltılan bitiş → `endAt: null` (kaldır).
   - Kartta ve önizlemede: "bugün saat 21.00 - 23.00" (aynı gün → yalnız saat, farklı gün → tam
     tarih). Ortak yardımcı: web `formatEventRange`, mobil `formatEventRange`.
3. **Sihirbaza sağ üst X** — vazgeçen kullanıcı geri okuna adım adım basmasın.

### R1-b — bitiş ZORUNLU (sahip kararı, aynı gün)

Bitiş opsiyonel yazılmıştı; sahip zorunlu olmasını istedi. **Uygulandı:**

- Varsayılan **başlangıç + 1 saat**; "Bitişi kaldır" kaldırıldı; eski bitişsiz etkinlik
  düzenlenirken de aynı kuralla dolar (web + mobil).
- **Süre korumalı kaydırma:** başlangıç değişince bitiş aynı kadar kayar.
- Backend DEĞİŞMEDİ — `endAt` orada hâlâ opsiyonel; zorunluluk istemci sözleşmesidir.

**PM notu (kayda geçsin):** Discord'da bitiş yalnız **dış konum** etkinliğinde zorunlu, ses
kanalında hiç sorulmuyor. Bizde her iki türde de zorunlu. Gerekçe kodda: `computeOccurrence`
bitişsiz etkinliğin süresini sıfır sayıyor (`endMs = event.endAt ? … : startMs`) → "şu an sürüyor"
(ACTIVE) rozeti hiç yanmıyordu. Zorunlu bitiş o rozeti çalışır hâle getirir.

**Kabul edilen sapma:** liste ekranının alttan panel yerine ayrı ekran olması sahip tarafından
onaylandı ("liste büyüdü mü ayrı ekrandan yönetmek mantıklı olabilir").

**Açık kalan:** mobilde ses kanalları hiç listelenmediği için kanal seçicisi gerçek veriyle
görülemedi — ses fazında (M4) bakılacak.

---

## §9 Borç (PLAN.md teknik borç tablosuna)

| Borç | Neden ertelendi |
|---|---|
| Kapak görseli **yükleme** (mobil) | Sahip kararı; kapsam ilk turda sığ tutuldu |
| Etkinlik **paylaş bağlantısı** | Env var; web tarafındaki `?event=` yakalayıcısı aktif-ortam bağlamına bağlı, link yolu doğrulanmadı |
| Açıklamada **markdown** | Mobilde markdown boru hattı hiç yok; mesajlarla birlikte çözülmeli |
| `guild.event_*` **WS** dinlemesi | Açılışta fetch yeterli görüldü |
