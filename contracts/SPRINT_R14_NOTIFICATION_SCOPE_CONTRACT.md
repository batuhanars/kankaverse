# SPRINT R14 — Bildirim Kapsamı: Etkinlik Bildirimi + @everyone Bastırma

> **Tek doğruluk kaynağı.** Endpoint imzası, DTO şekli, enum değeri buradan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
>
> PM compose: 2026-08-03. Kaynak: sahip kararı 2026-08-02 (`TASK.md` "M2 sonrası kalem").
> Numaralandırma: M2d = **push** olarak rezerve; bu sprint üç tier'a birden dokunduğu için
> cross-tier R-serisine (R11/R12/R13) katıldı.

---

## §0 Bağlam

Sahip Discord'un ortam bildirim ayarları ekranına bakıp üç kalem istedi. Üçü de aynı backend
dokunuşunu paylaştığı için tek pakete kondu. PM kodu okuyunca **biri karşılıksız çıktı**:

| İstenen | Bizdeki karşılık | Karar |
|---|---|---|
| **Etkinlik bildirimi** | `guild.event_created` WS eventi var, **kalıcı bildirim yok** → "Yeni Etkinlikleri Sustur" susturacak bir şey bulamaz | ✅ IN — önce bildirimi üret, sonra sustur |
| **@everyone bastırma** | `mentionsEveryone` bayrağı var, bastırma yok; @everyone hem kalıcı bildirim hem rail/kanal rozeti üretiyor | ✅ IN |
| **@here bastırma** | `@here` **hiç yok** (presence-tabanlı bahsetme yazılmadı) | ❌ OUT — bastırma değil, yeni özellik olurdu |
| **Tüm @Rol bahsetmelerini sustur** | 🔴 **Rol bahsetmesi bizde yalnız @everyone.** `resolveMentions` (`messages.service.ts:143-151`) `<@&roleId>` token'ını **sadece** `isEveryone` rolüyle eşleştiriyor; normal rol token'ı sessizce düşüyor, bildirim de rozet de üretmiyor | ❌ OUT → **R15'e taşındı** (sahip kararı 2026-08-03: rol bahsetmesi ürün olarak önemli, "on kişiyi tek tek etiketlemek yerine gruba hitap"). Bu sprintte susturacak trafik yok; anahtar özelliğin geldiği sprintte gelir |

**Rol bahsetmesi → R15 (sahip kararı 2026-08-03).** Toggle değil özellik: mention çözücü +
`Message.mentionRoles` alanı + alıcı kümesi + rozet kesişim sorgusu + iki istemcide otomatik
tamamlama ve rol çipi render'ı. Kapı modeli **iki katmanlı** seçildi: `mentionable` açık roller
herkese açık; kapalı roller ve @everyone yalnız **`MENTION_EVERYONE` izni** olan rollere.
🔴 Bu, bugünkü @everyone davranışını **daraltır** (izin bugün hiçbir yerde okunmuyor, yalnız
iki istemcinin rol ayarları ekranında gösteriliyor) — R15 sözleşmesinde göç notu olarak yazılır.
R14 bunlardan **hiçbirine** dokunmaz.

---

## §1 Kapsam

### IN

1. `api/`: yeni bildirim tipi **`EVENT_CREATED`** + üretimi (`events.service.create`)
2. `api/`: `NotificationPref` üzerinde iki yeni **ortam-düzeyi** bayrak: `suppressEveryone`, `suppressEvents`
3. `api/`: @everyone bastırmanın **üç yüzeyde birden** uygulanması (kalıcı bildirim + `mention` WS eventi + rozet sayımları)
4. `mobile/`: ortam bildirim ayarları ekranına iki anahtar + bildirim listesinde `EVENT_CREATED` satırı
5. `web/`: aynı iki anahtar + aynı satır (tek kaynak; M2b R1 dersi — düzeltme iki istemcide de yapılır)

### OUT (bilinçli)

| Çıkarılan | Gerekçe |
|---|---|
| `@here` | Özellik yok; bastırma maddesi olarak gelemez |
| Rol bahsetmesi susturma | §0 tablosu: susturacak trafik yok |
| Etkinlik **hatırlatması** (başlamadan X dk önce) | B2 kalemi, sunucu-tarafı zamanlayıcı işi. Bu sprint yalnız **oluşturuldu** bildirimi |
| Etkinlik güncellendi/silindi bildirimi | Discord da yalnız yeni etkinliği bildiriyor; gürültü ekleme |
| Push teslimi | M2d. Bu sprint kalıcı bildirim + uygulama-içi rozet katmanı |
| Kanal düzeyinde `suppressEveryone` | Discord da ortam düzeyinde tutuyor; kanal düzeyi mevcut `muted`/`level` zincirine çakışır (§2.2 gerekçe) |

---

## §2 `api/` — şema + üretim + bastırma

### 2.1 Şema (additive migration, tek migration)

```prisma
enum NotificationType {
  MENTION
  FRIEND_REQUEST
  FRIEND_ACCEPT
  GUILD_INVITE
  EVENT_CREATED   // YENİ
}

model NotificationPref {
  // ... mevcut alanlar
  suppressEveryone Boolean @default(false)  // YENİ — yalnız targetType=GUILD satırında anlamlı
  suppressEvents   Boolean @default(false)  // YENİ — yalnız targetType=GUILD satırında anlamlı
}
```

- İkisi de `@default(false)` → **mevcut davranış değişmiyor**, kimse sessizce bildirim kaybetmiyor
- Migration DB'ye **uygulanacak**; `npx prisma migrate status` temiz olmadan sprint kapanmaz
  (hafıza: `migration-uygulanmali` — mock Prisma ile test bunu yakalamaz)

### 2.2 `setPref` doğrulaması

`SetNotificationPrefDto`'ya iki opsiyonel boolean eklenir. **Kural:** `suppressEveryone` veya
`suppressEvents` gönderildiğinde `targetType` `GUILD` değilse → `400` `INVALID_PREF_TARGET`
("Bu ayar yalnız ortam düzeyinde geçerlidir.").

Gerekçe (dev bunu değiştirmesin): mevcut çözüm zinciri `effective = channelPref ?? guildPref`
**kayıt-bazlı override**. Bayrağı kanal düzeyinde de kabul etseydik, kullanıcı ortamda @everyone'ı
bastırıp sonra tek bir kanalı susturunca o kanalın kaydı tüm ortam kaydını gölgeler ve @everyone
bastırma **sessizce geri gelirdi**. Kanal düzeyi istenirse ayrı karar + ayrı çözüm semantiği ister.

### 2.3 `EVENT_CREATED` üretimi (`events.service.create`)

`realtime.emitToUsers(recipients, 'guild.event_created', ...)` çağrısından **sonra**, aynı
`recipients` kümesiyle (yeni erişim kararı **YOK** — `eventRecipients` zaten T&S süzülü):

1. Oluşturanı çıkar (`userId`)
2. Kalan alıcıların **ortam düzeyi** tercihlerini **TEK sorguda** çek
   (`notificationPref.findMany({ where: { userId: { in: ids }, targetType: GUILD, targetId: guildId } })`)
3. Ele: `isMuteActive(...)` **veya** `level === NONE` **veya** `suppressEvents === true` → bildirim yok
4. Kalanlara tek `createManyAndReturn` + kullanıcı başına `emitToUser('notification', dto)`

**Alan eşlemesi:** `type: EVENT_CREATED` · `actorId: creatorId` · `guildId` · `channelId`:
etkinliğin kanalı varsa o, yoksa `null` · `messageId: null` · `preview: event.name` (≤120).

**N+1 yasağı:** alıcı başına sorgu **yazılmaz** (tercih sorgusu tek, insert tek). `NotificationsService`'e
`createMany(userIds, data)` metodu eklenir; `actor`/`guildName` çözümü **bir kez** yapılıp tüm DTO'larda
tekrar kullanılır (mevcut `toNotificationDtos` toplu-çözüm deseni). Mevcut tekil `create()` bozulmaz.

### 2.4 @everyone bastırma — üç yüzey

Bastırma **yalnız** `mentionsEveryone` üzerinden gelen alıcıyı etkiler. **Doğrudan** `<@kullanıcı>`
bahsetmesi her zaman geçer (kullanıcı adıyla çağrıldıysa susturulmaz).

| # | Yüzey | Dosya | Değişiklik |
|---|---|---|---|
| a | Kalıcı bildirim + `mention` WS eventi | `messages/gateway/messages.gateway.ts` `notifyMentions` | Alıcı **yalnız everyone genişlemesinden** geliyorsa (`!mentions.includes(uid)`) ve ortam tercihinde `suppressEveryone` ise: **ne emit ne persist** (`continue`). Doğrudan bahsedilen etkilenmez |
| b | Rail rozeti (ortam) | `guilds/guilds.service.ts` `findMyGuilds` | Mevcut kanal-tercihi sorgusunun yanına **ortam** tercihleri de çekilir (tek `findMany`); `suppressEveryone` olan ortamda `mentionOr`'a `{ mentionsEveryone: true }` **eklenmez** |
| c | Kanal listesi rozeti | `channels/channels.service.ts` `findByGuild` | Tek `notificationPref.findUnique` (userId + GUILD + guildId); aynı şekilde `mentionsEveryone` dalı düşer |

(a)'daki tercih okuması alıcı başına **ek sorgu açmaz**: everyone genişlemesi zaten bir alıcı listesi
üretiyor → o listenin ortam tercihleri **tek sorguda** çekilip bellekte süzülür.

**Tam sessizlik tutarlılığı:** M2b'de sahip "susturma tamamen susturur" dedi. Bastırılan @everyone
bu sprintte ne rozet ne toast üretir (emit de persist de kesilir).

🔴 **DÜZELTME (PM, 2026-08-03 — bu sözleşmenin ilk hâlinde olgu hatası vardı):** "susturulmuş kanalda
`mention` WS eventi zaten kesiliyor" cümlesi **yanlıştı**. Kodda `mention` emit'i
`shouldNotifyChannel` kontrolünden **önce** yapılıyor; sustur/`level=NONE` yalnız **kalıcı** bildirimi
süzüyor, anlık event gidiyor ve iki istemcide de **canlı bahsetme rozetini** besliyor
(`web/useSocket.ts:242`, `mobile/realtime/socket.ts:192`). Sonuç: susturulmuş kanalda rozet
**yenilemede temiz, canlıda yanıyor**. Bu R14'ün kapsamı değil, ayrı kalem olarak sahibe sunuldu
(bkz. `TASK.md` R14-b önerisi). R14 yalnız `suppressEveryone` yolunda tam sessizliği uygular.

### 2.5 Testler (birim, `api/`)

- `suppressEvents=true` → etkinlik bildirimi yok; `false`/kayıt yok → var; ortam susturulmuşsa yok
- `suppressEveryone=true` → everyone-alıcısına ne emit ne persist; **aynı mesajda doğrudan bahsedilen
  kullanıcı bildirimi ALIR** (regresyon kilidi)
- Rozet: `suppressEveryone=true` olan ortamda `mentionsEveryone` mesajı mention sayacına **katkı vermez**;
  doğrudan bahsetme verir
- `setPref` kanal hedefiyle bayrak → `400 INVALID_PREF_TARGET`
- Mevcut T&S regresyonları: özel kanalda everyone sızıntısı yok + yaş kapısı (bugünkü testler yeşil kalır)

### 2.6 R7 durumu

**R7-nötr.** Yeni erişim kararı yok, mevcut kapılar (özel kanal / yaş / üyelik) **değişmiyor**.
Bastırma yalnız kullanıcının kendi bildirim yüzeyini **kısıyor** (fail-closed yönde). Etkinlik alıcı
kümesi `eventRecipients`'tan aynen alınır, genişletilmez. Dev bu satırı ihlal edecek bir şey
görürse **DUR** ve bildir.

---

## §3 `mobile/` — ortam bildirim ayarları + yeni satır tipi

### 3.1 `guild-notifications.tsx` (mevcut ekran, üçüncü grup)

Mevcut iki grubun (Sustur · Bildirimler) altına **anahtarlı** iki satır:

| Satır | Anahtar | Açıklama alt metni |
|---|---|---|
| **@everyone Bastır** | `suppressEveryone` | "Bu ortamda herkese yapılan bahsetmeler seni bildirmez." |
| **Yeni Etkinlikleri Sustur** | `suppressEvents` | "Bu ortamda yeni etkinlik oluşturulduğunda bildirim alma." |

- Anahtar değişince **anında kaydedilir** (ekranın mevcut deseni; ayrı Kaydet yok)
- İyimser yaz, hata → geri al + görünür Türkçe hata (ekranın mevcut `errorMessage` deseni)
- Yeni bileşen **yazılmaz**: satır `styles.row`, anahtar RN `Switch` (yeni bağımlılık yok)
- Ortam susturulmuşken bu iki anahtar **gizlenmez** (sustur geçici olabilir, ayar kalıcıdır)

### 3.2 Bildirimler sekmesi (`(tabs)/notifications.tsx`)

- `EVENT_CREATED` → ikon `calendar-outline`, metin: **"{actor} yeni bir etkinlik oluşturdu: {preview}"**
- Dokunuş → o ortamın **etkinlikler ekranı** (M1j'de var). `guildId` yoksa satır tıklanmaz kalır
  (M2c'deki chevron kuralı: kırık navigasyon vaat etme)
- `mobile/src/api/notifications.ts` tip birliğine `EVENT_CREATED` eklenir

### 3.3 Store

`notificationPrefs` store'una iki alan taşınır (`suppressEveryone`/`suppressEvents` okuyucuları +
`setPref` geçişi). Mevcut `isMuted`/`effectiveLevel` deseni tekrar kullanılır, yeni store açılmaz.

---

## §4 `web/` — parite

Aynı iki anahtar ortam bağlam menüsü/bildirim ayarları yüzeyine (`useGuildMenuActions` +
kullandığı bileşen) eklenir; `NotificationBell` `EVENT_CREATED` satırını mobil ile **aynı metinle**
render eder ve etkinlikler yüzeyine götürür. `useNativeNotifications` yeni tipi tanır (masaüstü
toast'ta sessizce düşmesin).

**Tek kaynak kuralı:** metinler `web/src/i18n/tr.json`'a **bir kez** yazılır, mobil oradan import eder.

---

## §5 Sıra ve delegasyon

1. `api/` (§2) — tek dev oturumu, migration dahil, testler yeşil + `migrate status` temiz
2. `mobile/` (§3) ve `web/` (§4) — api merge edildikten sonra, paralel iki oturum
3. PM incelemesi → sahip cihaz turu

`web/` doğrulaması `vue-tsc --noEmit` ile yapılır (hafıza: `-b` önceden-var 6 hatayı gösterir,
bizim işimiz değil).

---

## §6 DoD

**Kod (ajanlar kapatır):**
- [x] `nest build` temiz · tüm testler yeşil (929) · `prisma migrate status` temiz
- [x] `mobile`: `typecheck` + `lint` temiz · `web`: `vue-tsc --noEmit` temiz
- [x] Gömülü string yok (tümü `tr.json`), tema/token dışında renk yok

**Fiziksel cihaz + tarayıcı (sahip kapatır):**
- [x] Bir ortamda etkinlik oluştur → **diğer hesabın** Bildirimler sekmesinde satır çıkıyor, dokununca etkinliğe gidiyor
- [x] "Yeni Etkinlikleri Sustur" açık hesapta aynı etkinlik **bildirim üretmiyor**
- [x] Ortam susturulmuşken de etkinlik bildirimi gelmiyor (tam sessizlik)
- [x] "@everyone Bastır" açıkken @everyone mesajı: rail rozeti yanmıyor, kanal rozeti yanmıyor, bildirim düşmüyor (beyaz okunmamış pill ÇIKIYOR — doğru). **Test şartı:** seviye "Tümü" olmalı; "Hiçbiri"yken iki süzgeç üst üste biner (bkz. TASK.md DoD turu notu)
- [~] **Aynı mesajda** doğrudan bahsedilen kullanıcı bildirimi **alıyor** — birim testiyle kilitli; elle tetiklenmedi (mobilde `@` girişi yok)
- [x] Web'den açılan anahtar mobilde görünüyor (tek kaynak)
