# SPRINT M2b — Mobil Bildirim Tercihleri (Sustur + Seviye)

> **Tek doğruluk kaynağı.** Endpoint imzası, DTO şekli, enum değeri buradan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
>
> PM compose: 2026-08-02. Referans: sahibin Discord mobil ekran görüntüleri (DM uzun-basış paneli,
> kanal uzun-basış paneli, "Bu kanalı sustur" ekranı, sunucu Bildirim Ayarları ekranı).

---

## §0 Bağlam

R12 sprintinde **backend uçtan uca yazıldı**: `NotificationPref` modeli, süreli susturma, seviye,
GET/PUT uçları, testler. Web'de guild ve kanal menülerinde kullanılıyor. **Mobilde hiç bağlı değil**
(`mobile/src/api/notifications.ts` yorumunda da yazılı: "Tercih (prefs) uçları hâlâ bağlı DEĞİL").

Bu sprint o boşluğu kapatır. **`api/`'ye SIFIR dokunuş.**

M2 sırası: **M2a** okunmamış görsel dili ✅ · **M2b (bu)** tercih yüzeyi · **M2c** kanal detay ekranı ·
**M2d** push.

---

## §1 Kapsam

### IN

1. **DM uzun-basış paneli** (`DmMenuSheet`): Konuşmayı Sustur (süre seçenekli) + Bildirim Ayarları
2. **Kanal uzun-basış paneli** (`ChannelMenuSheet`): Kanalı Sustur + Bildirim Ayarları + **başlıkta ortam simgesi**
3. **Ortam paneli** (`GuildMenuSheet`): üçüncü aksiyon **Bildirimler** + **ortam açıklaması**
4. **Ortam bildirim ayarları ekranı** (yeni route): sustur (süre) + seviye
5. 🔴 **M2a rozetlerinin tercihe göre süzülmesi** — web'de bu katman var, mobilde yok
6. Susturulmuş kanalın listede **sönük** görünmesi

### OUT (bilinçli)

| Çıkarılan | Gerekçe |
|---|---|
| Kanal detay ekranı | **M2c.** "Sustur" düğmesi oraya M2b'den hazır gelecek. |
| Push + "Mobil Anlık Bildirimler" anahtarı | **M2d.** Arkasında özellik yokken anahtar konmaz. |
| Kategori hedefli tercih | Backend `NotifTargetType` yalnız `GUILD \| CHANNEL` tanıyor. Yeni enum değeri = migration = ayrı karar. |
| @everyone/@here bastır · @Rol bahsetmelerini sustur · Yeni Etkinlikleri Sustur | Backend'de karşılık **yok**. Sahip kararı: M2 bittikten sonra tek pakette (§7). |
| "Öne Çıkanlar" | Bizde böyle bir özellik yok. |

---

## §2 Endpoint'ler (mevcut — yeni uç YOK)

```
GET /notifications/prefs        → NotificationPrefDto[]
PUT /notifications/prefs        → NotificationPrefDto   (upsert; kısmi update)
```

```ts
interface NotificationPrefDto {
  targetType: 'GUILD' | 'CHANNEL'
  targetId: string        // GUILD → guildId · CHANNEL → channelId
  muted: boolean
  mutedUntil: string | null   // ISO. null + muted=true → süresiz. Geçmişse mute BİTMİŞ sayılır.
  level: 'ALL' | 'MENTIONS' | 'NONE'
}
```

PUT gövdesi: `{ targetType, targetId, muted?, mutedUntil?, level? }` — **verilmeyen alan korunur**.

🔴 **DM de `targetType: 'CHANNEL'`** — DM'ler `Channel` tablosunda yaşıyor (`guildId = null`),
backend `requireChannelAccess` ile DM üyeliğini doğruluyor. Ayrı bir tür yok.

🔴 **Süre seçimi `mutedUntil` ile gider:** `muted: true` + `mutedUntil: <ISO>`.
"Ben tekrar açana kadar" → `muted: true` + `mutedUntil: null`. Sesi aç → `muted: false`.

---

## §3 Çözümleme kuralı (istemci)

Backend'in kendi hesabı (`notifications.service.ts` `shouldNotifyChannel`) şu sırayı izler; **istemci
aynı sırayı uygular**, kendi kuralını uydurmaz:

1. **CHANNEL** tercihi varsa o kazanır
2. yoksa **GUILD** tercihi
3. yoksa varsayılan: `muted: false`, `level: 'ALL'`

**Mute aktif mi:** `muted && (mutedUntil == null || mutedUntil > şimdi)`.
Süresi geçmiş kayıt DB'de duruyor ama **yok sayılır** (backend de böyle yapıyor; temizleyen job yok).

---

## §4 Yüzeyler

### 4.1 DM paneli — `components/home/DmMenuSheet.tsx`

Mevcut maddelerin **altına**, ayrı bir grup olarak:

- **Konuşmayı Sustur** → süre seçici (§4.5). Zaten susturulmuşsa madde **"Susturmayı kaldır"**a döner
  ve tek dokunuşla açar (web `MuteDurationFlyout` deseni), alt satırda "{tarih} tarihine kadar".
- **Bildirim Ayarları** → seviye seçici (§4.6)

Hedef: `targetType: 'CHANNEL'`, `targetId: <dm channelId>`. Grup DM'de de aynı.

### 4.2 Kanal paneli — `components/home/ChannelMenuSheet.tsx`

- **Kanalı Sustur** + **Bildirim Ayarları** (aynı iki bileşen)
- 🔴 **Başlığa ortam simgesi:** panel bugün yalnız `# kanal-adı` gösteriyor; hangi ortama ait olduğu
  belli değil. Kanal adının **soluna** ortam ikonu eklenir (rail'deki altıgen bileşeni tekrar kullan;
  ikon yoksa baş harf). Sahip bunu ayrıca istedi.
- Sustur/Bildirim maddeleri **her üyeye** açık (M2a'da panel zaten her üyeye açıldı); yalnız
  "Kanalı Düzenle" `canManage` ile koşullu kalır.

### 4.3 Ortam paneli — `components/home/GuildMenuSheet.tsx`

- Aksiyon şeridi **ikiden üçe** çıkar: Davet Et · **Bildirimler** · Ortam Ayarları
  - **Bildirimler her üyeye açık** (bildirim tercihi yetki işi değil); Davet Et / Ortam Ayarları
    bugünkü `canManage` kapısında kalır.
- 🔴 **Ortam açıklaması:** başlığın altına `GuildSummaryDto.description` yazılır (varsa; yoksa satır
  hiç çizilmez). Alan **zaten tipli**, yeni backend alanı değil. Uzun metin 4 satırda kırpılır.

### 4.4 Ortam bildirim ayarları ekranı — yeni route `guild-notifications.tsx`

Params: `{ guildId, guildName }`. İçerik, yukarıdan aşağı:

1. **"<Ortam adı> ortamını sustur"** satırı → dokununca süre seçici (§4.5).
   Altında açıklama metni: susturulmuş ortamdan bahsedilmediği sürece okunmamış göstergesi ve
   bildirim gelmeyeceği (metin `tr.json`'a eklenir).
2. **Bildirim seviyesi** radyo listesi: Tümü · Yalnız bahsetmeler · Hiçbiri
   (i18n `guildMenu.notificationsAll/Mentions/None` **zaten var**)

Kaydetme **anında** (seçince PUT gider), ayrı "Kaydet" düğmesi yok. Hata → sunucunun Türkçe mesajı,
seçim eski hâline döner.

### 4.5 Süre seçici

`SelectSheet` (M2a'da yazıldı) ile alttan panel. Seçenekler ve i18n anahtarları **hazır**:
`guildMenu.mute15m` · `mute1h` · `mute3h` · `mute8h` · `mute24h` · `muteForever`.

`mutedUntil` istemcide hesaplanır: `new Date(Date.now() + dakika*60_000).toISOString()`.
"Ben tekrar açana kadar" → `mutedUntil: null`.

### 4.6 Seviye seçici

Yine `SelectSheet`: Tümü (`ALL`) · Yalnız bahsetmeler (`MENTIONS`) · Hiçbiri (`NONE`).
Seçili olan işaretli gelir (§3 çözümlemesiyle).

---

## §5 🔴 M2a rozetlerinin süzülmesi

Web'de bu katman var (`ServerRail.vue:41-53`), mobilde **yok**. M2b ile hizalanır:

| Durum | Beyaz pip (okunmamış) | Kırmızı bahsetme rozeti |
|---|---|---|
| `ALL`, susturulmamış | görünür | görünür |
| `MENTIONS` | **gizli** | görünür |
| `NONE` | gizli | **gizli** |
| Susturulmuş (aktif mute) | gizli | **gizli** |

> 🔴 **R1 düzeltmesi (sahip kararı 2026-08-02).** İlk tablo susturulmuş hedefte bahsetme rozetini
> **açık** bırakıyordu; gerekçe olarak web gösterilmişti, o gerekçe **yanlıştı** (web de gizliyor).
> Sahip kararı: **susturma tam sessizliktir.** "Sustur, zaten tamamen susturuyorsun; ince ayarı
> bildirim seviyesiyle yapıyorsun — kullanıcı ayarlara girmek istemeden 'şu ortam kafamı ağrıtıyor'
> diyebilmeli." Backend de bunu destekliyor: `shouldNotifyChannel` susturulmuş hedefte MENTION
> bildirimi bile üretmiyor. Web ile mobil bu tabloda birebir aynı.

Aynı kural **kanal satırına** da uygulanır (`ChannelRow`): susturulmuş kanal **sönük** görünür
(Discord: "Susturulmuş kanallar kanal listesinde gri görünür") ve pip'i gizlenir.

**Toplam ping** (`useTotalPing`) da bu süzgeci uygular — susturulmuş ortamın bahsetmesi rozete
girer (yukarıdaki tabloya göre), `NONE` olanınki girmez.

---

## §6 Store + i18n

- **Yeni store** `stores/notificationPrefs.ts` (zustand): `prefs` map (`${targetType}:${targetId}`),
  `load()` (uygulama açılışında bir kez — `(app)/_layout.tsx`), `setPref(...)` (iyimser yaz, hata → geri al),
  `resolve(guildId, channelId)` → `{ muted, level }` (§3 sırası), `reset()` (çıkışta).
- **i18n:** `guildMenu.mute*`, `guildMenu.notifications*`, `channelMenu.mute` **zaten var**, tekrar yazma.
  Eksik olanlar (DM susturma başlığı, ortam bildirim ekranı açıklaması) `web/src/i18n/tr.json`
  içine `mobile.*` altına eklenir. `tr.generated.json` **elle düzenlenmez**.

---

## §7 T&S / R7

**R7-nötr.** Bildirim tercihi bir T&S kararı değil; erişim, görünürlük veya yaş kapısı değişmiyor.
Susturma yalnız **kendi** bildirimini kapatır, başkasının mesajını engellemez.

---

## §8 DoD

**Makine:**
- [ ] `npm run typecheck` + `npm run lint` temiz
- [ ] `api/` diffi **boş**; `web/` diffi yalnız `src/i18n/tr.json`

**Sahip — fiziksel cihazda:**
- [ ] DM'e uzun bas → sustur (8 saat) çalışıyor; panel "Susturmayı kaldır" + bitiş zamanı gösteriyor
- [ ] Kanalı sustur → kanal listede **sönükleşiyor**, pip gizleniyor
- [ ] Kanal panelinde hangi ortama ait olduğu **ortam simgesinden** anlaşılıyor
- [ ] Ortam panelinde üçüncü düğme "Bildirimler" var, ortam açıklaması görünüyor
- [ ] Ortam bildirim ekranında sustur + seviye ayarlanıyor, ekrandan çıkıp dönünce **korunuyor**
- [ ] Seviye "Yalnız bahsetmeler" → rail'de beyaz pip kayboluyor, bahsetme rozeti kalıyor
- [ ] Seviye "Hiçbiri" → ikisi de kayboluyor
- [ ] Aynı hesapta web'den yapılan susturma mobilde de görünüyor (tek kaynak)

---

## §10 R1 — sahip cihaz turu (2026-08-02)

Sahip testi: DM/kanal/ortam susturma, seviye seçimi, ortam bildirim ekranı, panel yetki davranışı
**çalışıyor**. Üç düzeltme:

### R1-1 🔴 Ortam rozeti kanal tercihlerini bilmiyor (`api/` dokunuşu ZORUNLU)

**Bulgu:** bir kanalı susturunca o kanaldan gelen normal mesaj **ortam simgesinde pill yakıyor**.
Aynı kök neden "Hiçbiri" seçeneğinin kanal düzeyinde etkisiz görünmesine de yol açıyor.
Ortam geneli susturmada sorun yok (o katman istemcide uygulanıyor).

**Kök neden:** `guilds.service.ts` `findMyGuilds` ortam toplamını **tüm kanalları** sayarak üretiyor;
`NotificationPref` tablosuna hiç bakmıyor. İstemci bunu düzeltemez — rail'de **girilmemiş ortamların
kanal listesi yok**, dolayısıyla hangi kanalın susturulduğu bilinse bile o kanalın sayısı bilinmiyor.

**Çözüm (backend):** `findMyGuilds` toplamı hesaplarken kullanıcının kanal tercihlerini uygular:

| Kanal tercihi | `unreadCount`'a katkı | `unreadMentionCount`'a katkı |
|---|---|---|
| yok / `ALL`, susturulmamış | **var** | **var** |
| `MENTIONS` | yok | var |
| `NONE` | yok | yok |
| susturulmuş (aktif mute) | yok | yok |

- Pref'ler **tek sorguda** çekilir (`userId` + `targetType: CHANNEL`), kanal başına sorgu **eklenmez**.
- `GUILD` düzeyi tercih burada uygulanmaz — o istemcide (rail görünürlüğü) uygulanıyor, iki yerde
  uygulanırsa çift süzgeç olur.
- Kanal listesi ucu (`GET /guilds/:id/channels`) **değişmez** — kanal satırı kendi sayısını
  göstermeye devam eder, süzme gösterim katmanında (M2b §5) yapılır.
- Migration **YOK**, yeni alan **YOK**, yeni uç **YOK**. Mevcut testler yeşil kalmalı + yeni davranış
  için birim test eklenir.
- **Yan etki (istenen):** web de aynı düzeltmeyi alır; orada da susturulmuş kanal ortam rozetine
  katkı veriyordu.

### R1-2 Kanal panelindeki ortam simgesi çok küçük

`ChannelMenuSheet` başlığındaki altıgen ortam simgesi büyütülür (kanal adıyla optik dengeli olacak).

### R2 — ikinci cihaz turu (aynı gün)

**R2-1 🔴 Canlı soket artışı tercihi uygulamıyordu.** R1-1 backend'i düzeltti ama ortam sayacı
**iki yoldan** besleniyor: (1) `GET /guilds` sayısı — düzeltildi, (2) `channel.activity`/`mention`
soket olayıyla istemcinin kendi artırımı (`bumpChannel`) — **tercihe hiç bakmıyordu**. Sahibin
senaryosu (web'den mesaj at, mobilde bak) tam ikinci yolu tetiklediği için düzeltme görünmedi.
Çözüm: `bumpChannel` ortam toplamını artırırken backend'in `resolveChannelBadgeEffect` tablosunun
aynısını uygular. **Kanalın kendi sayacı ham kalır** (backend de ham dönüyor; süzme `ChannelRow`
gösterim katmanında) — böylece REST ve soket aynı sonucu üretir.

**R2-2 DM/grup DM susturması gösterime yansımıyordu.** §5 süzgeci yalnız ortam ve kanal rozetlerine
uygulanmıştı; `DmRow` noktası ve `useTotalPing`'in DM adedi pref'e bakmıyordu. Susturma kaydediliyor
ama rozet çıkmaya devam ediyordu.

### R1-3 Susturma tam sessizlik (§5 tablosu güncellendi)

Susturulmuş hedefte bahsetme rozeti de **gizlenir**. Mobil, web ile aynı davranışa gelir.

---

## §9 M2 sonrası kalem (değişmedi)

Etkinlik bildirimi · @everyone/@here bastırma · tüm @Rol bahsetmelerini sustur — üçü aynı backend
dokunuşunu paylaştığı için tek pakette, M2 bittikten sonra.
