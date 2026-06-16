# SPRINT V3 — Etkinlik Motoru (Track B, Faz 2)

> Durum: **TASARIM KİLİTLİ (2026-06-16).** PM compose; /kurul budaması + sahip 2 kararı ile.
> Önceki faz: `contracts/SPRINT_V3_EVENTS_CONTRACT.md` (MVP — değişmez temel). Bu faz **additive**.
> **Kurul verdikti (2026-06-16):** "3-job motor" reddedildi → **sıfır-job** tasarım. Vault YAGNI/basitlik-önce.

---

## §0 — Kapsam ve Kararlar

**SIFIR yeni zamanlanmış job.** Bu fazın tamamı **türetme** (read-time computed) ile çözülür.

**Bu sprint (IN):**
- **Tekrarlama (sanal/computed occurrence):** `recurrence` (NONE/DAILY/WEEKLY/MONTHLY) artık kabul edilir. Seri **tek satır** kalır; örnekler okurken hesaplanır (yeni satır ÜRETİLMEZ). **İlgi seri üzerinde** (sahip kararı 2026-06-16) → `GuildEventInterest` modeli **değişmez**.
- **Durum türetme genişletmesi:** `status` artık **ACTIVE**'i de türetir (ilgili örnek penceresi içindeyse). Job YOK.
- **Deep-link:** `?event=<id>` URL'i → etkinlik modalını açar + (varsa) karta kaydırır.

**Kapsam DIŞI (ertelendi):**
- **Hatırlatma/bildirim** → C1 (kalıcı Notification sistemi) gelince. Bu sprintte reminder job YOK (kurul: C1'siz yarım).
- **Kapak görseli** → A1 (CSAM tarayıcı) kapısı.
- **CANCELED aksiyonu** → istenmedi; enum forward-compat kalır, bu sprintte cancel endpoint/UI YOK (soft-delete zaten var).
- **Örnek-başı ilgi / tek örnek iptali (exception dates)** → seri-ilgi seçildi; gerekirse ayrı tur.
- **Takvim / "Sırala & Görüntüle" görünümü** → sonraya.
- **`recurrenceEndAt` (seri bitiş tarihi)** → YAGNI; MVP açık-uçlu tekrar. Gerekirse additive kolon sonra.

> **Neden sanal occurrence (kurul):** materyalize-satır yaklaşımı job idempotency + çift-üretim + silme-semantiği + çoklu-replica yarışı getirir. Sanal occurrence bunların **hepsini** eler; seri-ilgi, satır-başı-ilgiden daha basit. requireChannelAccess örnekte de parent `channelId`'sinden miras → minör/yaş kapısı korunur.

---

## §1 — Veri Modeli

**Şema değişikliği YOK.** Mevcut `GuildEvent` alanları yeterli:
- `startAt` = **seri çapası** (ilk örnek; immutable anlam — örnek hesabının kökü).
- `endAt?` = **tek örnek süresini** tanımlar (occurrence süresi = `endAt - startAt`; null → noktasal).
- `recurrence` = NONE/DAILY/WEEKLY/MONTHLY.
- `status` kolonu DB'de kalır (default SCHEDULED) ama **okunmaz/yazılmaz** — status türetilir. (CANCELED forward-compat.)
- `coverImageId` = MVP'deki gibi dokunulmaz.

Migration YOK → `prisma migrate status` zaten temiz kalır.

---

## §2 — Occurrence Hesabı (saf fonksiyon, tek kaynak)

Backend'de saf util: `computeOccurrence(event, now) → { occurrenceStartAt, occurrenceEndAt, status }`.

**Aralık:** DAILY=+1 gün · WEEKLY=+7 gün · MONTHLY=+1 takvim ayı (aynı gün-of-month; ay kısa ise **ayın son gününe kıstır** — örn. 31 Ocak aylık → 28/29 Şubat). NONE → yalnız k=0.

**Süre:** `duration = endAt ? (endAt - startAt) : 0`. Örnek k için: `occStart(k) = startAt + k*interval`, `occEnd(k) = occStart(k) + duration`.

**İlgili örnek** = `occEnd(k) >= now` sağlayan **en küçük k≥0**. (Yani şu an süren örnek; yoksa bir sonraki gelecek örnek.) NONE'da k=0 sabit.

**Status türetme** (ilgili örneğe göre):
- `now < occStart` → **SCHEDULED**
- `occStart <= now <= occEnd` → **ACTIVE**
- NONE ve `now > occEnd` → **COMPLETED** (tek seferlik bitti)
- Tekrarlayan açık-uçlu seri → her zaman bir sonraki örnek var → **COMPLETED olmaz** (SCHEDULED/ACTIVE döngüsü).

**Fail-safe:** geçersiz/parse-edilemez tarih → occurrence = çapanın kendisi (mevcut MVP davranışı), status MVP türetmesi.

---

## §3 — DTO Değişiklikleri

`EventDto`'ya **eklenen** alanlar (mevcut alanlar korunur):
```jsonc
{
  // ...mevcut MVP alanları (startAt/endAt = ÇAPA olarak kalır)...
  "occurrenceStartAt",   // ilgili örneğin başlangıcı (NONE'da = startAt)
  "occurrenceEndAt",     // ilgili örneğin bitişi (null → noktasal, occurrenceStartAt'a eşit kabul)
  "recurrence",          // NONE | DAILY | WEEKLY | MONTHLY (mevcut)
  "status"               // SCHEDULED | ACTIVE | COMPLETED (artık ACTIVE de türetilir)
}
```
Frontend **görüntülemede `occurrenceStartAt`** kullanır (çapa `startAt` değil). Sıralama da buna göre.

**CreateEventDto:** `recurrence` artık `@IsEnum(EventRecurrence)` — `NONE|DAILY|WEEKLY|MONTHLY` kabul (MVP'deki `@IsIn(['NONE'])` kilidi KALDIRILIR). `UpdateEventDto` = PartialType (değişmez).

---

## §4 — Endpoint'ler

**Yeni endpoint YOK.** Mevcut 7 endpoint (MVP §4) aynen; yalnız EventDto §3 ile zenginleşir.

- `GET /guilds/:id/events` → görünür etkinlikler, **`occurrenceStartAt` artan** sırada (çapa değil). Geçmiş tek-seferlik COMPLETED'lar mevcut davranışla döner.
- Diğerleri (POST/GET-one/PATCH/DELETE/interest×2) imza-değişmez; yanıt yeni computed alanları taşır.

Görünürlük choke-point (`canViewEvent`/`findVisibleEvents`/`requireEventAccess`/`eventRecipients`) **değişmez** — occurrence hesabı görünürlüğü ETKİLEMEZ (channelId aynı). T&S mirası korunur.

---

## §5 — Gerçek Zamanlı (WS)

**Değişmez.** `guild.event_created/updated/deleted` aynen. Occurrence rollover (bir örnek geçip sonrakine geçme) **türetilmiş** olduğu için **WS gerektirmez** — istemci yeniden render'da/refetch'te yeni occurrence'ı hesaplar. (Açık etkinlik listesi açıkken istemci dakika başı yeniden-türetebilir; opsiyonel, zorunlu değil.)

---

## §6 — Frontend (`web/`)

1. **Sihirbaz (`CreateEventWizard`):** Etkinlik Sıklığı select'inde **DAILY/WEEKLY/MONTHLY artık ETKİN** (mevcut `disabled "yakında"` kaldırılır). İncele adımı + kart önizlemesi tekrar bilgisini gösterir ("Her hafta" vb.).
2. **Kart (`EventsModal`):** tarih = **`occurrenceStartAt`** (TR format). Tekrarlayan ise **tekrar rozeti** ("🔁 Her gün/hafta/ay"). **ACTIVE** ise belirgin "**Şu an sürüyor**" rozeti (Kor/yeşil aksan); VOICE + ACTIVE ise mevcut sese-katıl yolu doğal görünür (yeni iş değil, etkinlik kanalı zaten ses kanalı). COMPLETED tek-seferlik soluk/altta.
3. **Deep-link handler:** sayfa yükünde `?event=<id>` varsa → ilgili guild'in events modalını aç + kartı vurgula/kaydır (mevcut `useMessageJump` deseninden esinlen ya da basit query-tüket). Tüketince query temizlenir. (MVP'de link kopyalanıyordu ama açılmıyordu — bu açık kalemi kapatır.)
4. **i18n:** yeni metinler (`event.recurrence.*` etkin etiketler, `event.card.active`, `event.card.recurringBadge`) `tr.json`; renk/şekil `--kv-*`. Tarih TR yereli.
5. **Occurrence hesabı:** backend computed alanları döndüğü için **frontend yeniden hesaplamaz** (DRY; tek kaynak backend). Yalnız gösterir.

---

## §7 — DoD

- [ ] `computeOccurrence` saf util + birim testler (NONE/DAILY/WEEKLY/MONTHLY; ay-sonu kıstırma; ACTIVE penceresi; açık-uçlu COMPLETED-olmaz; fail-safe)
- [ ] CreateEventDto recurrence kilidi kaldırıldı (4 değer kabul); EventDto computed alanlar (occurrenceStartAt/EndAt + ACTIVE status)
- [ ] `GET /guilds/:id/events` occurrenceStartAt'a göre sıralı; görünürlük/WS/T&S choke-point DEĞİŞMEDİ (regresyon testi)
- [ ] İlgi **seri üzerinde** (model değişmedi); tekrarlayan seride tek interest tüm örneklere geçerli
- [ ] Sihirbaz sıklık seçenekleri etkin; kart occurrence tarihi + tekrar rozeti + ACTIVE rozeti; deep-link `?event=` modalı açar
- [ ] **SIFIR yeni job · SIFIR migration**; `nest build`+`vue-tsc`+`vite build` temiz
- [ ] Sahip canlı test: haftalık etkinlik kur → liste sonraki örneği gösterir → İlgileniyor bir kez → geçerli; minör 18+ ses-kanalı tekrarlayan etkinliğini görmez (T&S regresyon yok)

---

## §8 — Sapma Kuralı

Endpoint/DTO/enum/şema sapması → dev DURUR, PM'e döner. **Job ekleme ihtiyacı doğarsa DUR** — bu sözleşmenin temel kararı sıfır-job; job gerektiren her şey (reminder/status-transition/recurrence-materialization) kapsam dışıdır ve PM+kurul kararı gerektirir.
