# SPRINT M2a — Mobil Okunmamış Görsel Dili (Track F2)

> **Tek doğruluk kaynağı.** Endpoint imzası, DTO şekli, görsel semantik buradan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
>
> PM compose: 2026-08-02. Referans: sahibin Discord mobil ekran görüntüleri (rail rozetleri, kanal
> listesi, tab bar, sohbet ekranı geri oku).

---

## §0 Bağlam — M2 üçe bölündü

Sahip "bildirim sistemi" başlığı altında üç ayrı işi tarif etti. Tek sprint olarak ne test edilebilir
ne delege edilebilir, o yüzden bölündü:

| Sprint | İçerik | `api/` |
|---|---|---|
| **M2a (bu sözleşme)** | Okunmamış/bahsetme görsel dili + canlı güncelleme + okundu işaretleme | **SIFIR** |
| M2b | Sustur + bildirim seviyesi mobil yüzeyi (R12'yi bağlar) | Sıfır |
| M2c | Push (dev build + expo-notifications + PushToken + gönderim) | Büyük |

**Bu sprintte `api/`'ye DOKUNULMAZ.** İhtiyaç duyulan her alan sunucudan **zaten dönüyor**;
mobil istemci ya tiplemem iş ya hiç okumamış. Yeni uç/alan gerekiyorsa bu sözleşme yanlıştır → DUR.

---

## §1 Kapsam

### IN

1. **Rail (ortam listesi):** beyaz okunmamış pip + kırmızı bahsetme rozeti + aktif ortam göstergesi
2. **Kanal listesi:** okunmamış vurgusu (ad **ve ikon**) + kırmızı bahsetme sayacı
3. **Tab bar:** Ana Sayfa sekmesinde toplam ping rozeti
4. **Sohbet ekranlarının geri okunda** toplam ping rozeti (kanal · DM · grup DM)
5. **Canlı güncelleme:** soketten gelen mesaj/bahsetme rozetleri anında büyütür
6. **Okundu işaretleme boşlukları:** ortam paneli · kategori paneli · kanal panelinin yetki kapısı
7. **Merkezi unread store** (bugün dağınık: kanal sayacı ekran-yerel state, ortam sayacı hiç yok)

### OUT (bilinçli)

| Çıkarılan | Gerekçe |
|---|---|
| Sustur / bildirim seviyesi | **M2b.** R12 backend'i hazır ama mobilde hiç bağlı değil; ayrı yüzey işi. |
| Rozetleri bildirim tercihine göre süzme | M2b'ye bağımlı — pref mobilde okunmuyor. Web'de bu süzgeç var (`ServerRail.vue:41-53`); mobil M2b'de ona hizalanır. |
| Push | **M2c.** |
| DM okunmamış **sayısı** | Sunucu DM'de sayı değil **boolean** dönüyor (`dm.service.ts:112,143`). Nokta göstergesi kalır; sayıya çevirmek backend işi. |
| Kategori-geneli okundu | Kategorinin kanallarını dolaşmak gerekir; ortam-geneli okundu ile aynı desen kurulduktan sonra ucuz — **IN'e alındı**, bkz §4.5. |

---

## §2 🔴 Görsel semantik — tek doğruluk

Web'de kurulu ve doğru olan ayrım (`ServerRail.vue:328-329`):

- **BEYAZ pip / parlak metin** = okunmamış mesaj var (bahsetme **değil**)
- **KIRMIZI sayaç** = okunmamış **bahsetme** sayısı

🔴 **Mobilde bugün bu BOZUK:** `ChannelRow.tsx:33-39` genel `unreadCount`'u **kırmızı** (`danger`)
rozetle çiziyor, `unreadMentionCount` ise hiç kullanılmıyor (alan tiplenmiş, tek satırda geçiyor).
Yani iki istemci aynı renge farklı anlam yüklüyor. **Bu sprintte mobil web'e hizalanır.**

Rozet sayıları `>99` → `"99+"` (web `badgeLabel()` deseni).

---

## §3 Veri kaynakları (hepsi mevcut — yeni uç YOK)

| İhtiyaç | Kaynak | Not |
|---|---|---|
| Ortam okunmamış + bahsetme | `GET /guilds` → `GuildDto.unreadCount`, `unreadMentionCount` | Sunucu M0'dan beri dönüyor; **mobil `GuildSummaryDto`'da tiplenmemiş** → tipleme eklenir (yeni alan DEĞİL, `ownerId`/`bannerUrl` emsali) |
| Kanal okunmamış + bahsetme | `GET /guilds/:id/channels` → `ChannelSummaryDto` | İkisi de tipli; `unreadMentionCount` kullanılmıyor |
| DM okunmamış | `GET /dm` → `DmChannelDto.unread` (boolean) | |
| Kanalı okundu işaretle | `POST /channels/:id/read` | Mevcut |
| DM'i okundu işaretle | `POST /dm/:id/read` | Mevcut |
| Ortam/kategori-geneli okundu | **Yeni uç YOK** — kanalları dolaş, okunmamış olanlara `markRead` | Web deseni birebir: `useGuildMenuActions.ts:28-40` |

---

## §4 Ekran ekran davranış

### 4.1 Rail — `components/home/GuildRail.tsx`

Bugün: altıgen simge, aktifken **hex kenarına** accent stroke (`:69`). Rozet/pip **yok**.

Eklenecek (web `ServerRail.vue` pill deseninin mobil karşılığı):

- **Sol pip** — simgenin solunda, dikey ortalı, `textPrimary` (beyaz):
  - okunmamış var, ortam aktif **değil** → 8×8 yuvarlak nokta
  - ortam **aktif** → dikeyde uzayan çubuk (~24-40px, 4px genişlik, uçları yuvarlak)
  - okunmamış yok ve aktif değil → hiç çizilmez
  - Geçiş animasyonu isteğe bağlı; **animasyon uğruna yeni kütüphane ekleme.**
- **Bahsetme rozeti** — simgenin **sağ altında**, `danger` zeminli daire, beyaz rakam,
  yalnız `unreadMentionCount > 0` iken.
- **Aktif hex kenarlığı KALIR** — pill aktifliği, kenarlık seçili ortamı vurgular; ikisi çelişmiyor
  (Discord'da da şekil değişimi + pill birlikte).
- **DM girişi (en üstteki sohbet balonu):** okunmamış DM varsa aynı beyaz pip; bahsetme rozeti **yok**
  (DM'de bahsetme sayısı sunucudan gelmiyor).

### 4.2 Kanal listesi — `components/home/ChannelRow.tsx`

- Okunmamış (`unreadCount > 0`): kanal **adı** `textPrimary` + `700` (bugün var, kalır) **ve
  kanal ikonu** aynı parlaklığa çıkar (bugün ikon rengi sabit — sahip "ikonlar da beyaz oluyor" dedi).
- Bahsetme (`unreadMentionCount > 0`): satırın **en sağında** `danger` zeminli sayaç.
- 🔴 **Mevcut kırmızı `unreadCount` rozeti KALDIRILIR** (§2).
- Okunmamış yoksa bugünkü sönük görünüm aynen kalır.

### 4.3 Tab bar — `app/(app)/(tabs)/_layout.tsx`

- **Ana Sayfa** sekmesine `tabBarBadge` eklenir: **toplam ping**.
- **Toplam ping tanımı** (bu sprintte tek tanım, her yerde aynı):
  `Σ tüm ortamların unreadMentionCount` **+** `okunmamış DM/grup DM adedi`
- **Bildirimler sekmesi rozeti DEĞİŞMEZ** — o `GET /notifications/unread-count` ile besleniyor,
  farklı bir sayı (mention + kanka isteği + davet) ve öyle kalır.

### 4.4 Sohbet ekranlarının geri oku

`channel/[id].tsx` · `dm/[id].tsx` ekranlarında `headerLeft` override edilir:

> **PM düzeltmesi (dev bulgusu):** ilk taslak `group/[id].tsx`'i de sayıyordu — yanlış. O route grup
> **yönetim** ekranı (üyeler/ayrıl/sil); gerçek grup sohbeti `dm/[id].tsx`'in `kind=group` hâli.
> Yani iki ekran üç sohbet yüzeyinin hepsini kapsıyor.

geri oku + sağ altında **toplam ping** rozeti (§4.3 ile aynı sayı, aynı bileşen).

- Rozet 0 ise hiç çizilmez.
- Dokunuş davranışı **değişmez** — geri oku hâlâ geri gider.
- 🔴 **Etkinlik formu (`event-form.tsx`) HARİÇ** — oradaki geri oku adımlar arasında geziniyor,
  rozet taşımaz. Sahip bunu ayrıca belirtti.
- Bugün üç ekranda da `headerLeft` override'ı **yok** (native Stack varsayılanı), ilk kez eklenecek.
  Native geri oku gizlenip yerine özel bileşen konur (`headerBackVisible: false` + `headerLeft`).

### 4.5 Okundu işaretleme boşlukları

| Yüzey | Bugün | Olacak |
|---|---|---|
| DM paneli (`DmMenuSheet`) | Var, durum-duyarlı | Değişmez |
| Kanal paneli (`ChannelMenuSheet`) | Var **ama panel yalnız `canManage`'e açılıyor** | 🔴 Panel **her üyeye** açılır; yönetim maddeleri (Kanalı Düzenle) `canManage` ile koşullu kalır. Okundu işaretlemek yetki işi değil. |
| Kategori paneli (`CategoryMenuSheet`) | Yok | **Eklenir** — kategorinin kanallarını dolaş |
| Ortam paneli (`GuildMenuSheet`) | Yok | **Eklenir** — ortamın kanallarını dolaş (web menüsünün 1. maddesi) |

Dolaşma deseni: yalnız `unreadCount > 0 || unreadMentionCount > 0` olan kanallara `markRead`,
hata **sessiz** (biri düşse diğerleri denenir — web `useGuildMenuActions.ts:34-38`).
İşlem bitince **yerel sayaçlar da temizlenir** (bugünkü eksik: sunucuya gidiyor, ekranda rozet kalıyor).

---

## §5 Merkezi unread store (yeni)

`mobile/src/stores/unread.ts` (zustand, mevcut store deseni).

**Neden:** bugün kanal sayacı `ChannelSidebar`'ın yerel `useState`inde, ortam sayacı hiç yok,
DM sayacı ayrı store'da. Rail + kanal listesi + tab + üç header aynı sayıyı gösterecek — dört ayrı
yerde hesaplanamaz.

Taşıyacağı asgari yüzey:

- `guilds: Record<guildId, { unread: number; mentions: number }>`
- `channels: Record<channelId, { unread: number; mentions: number }>`
- `hydrateGuilds(list)` / `hydrateChannels(guildId, list)` — REST yanıtından doldurur
- `bumpChannel(channelId, guildId, { mention })` — soket olayında artırır (kanal **ve** ortam)
- `clearChannel(channelId, guildId)` — okundu işaretlemede yerel temizlik
- `totalPing` — §4.3 tanımı (DM adedi `dm` store'undan okunur; **iki store birleştirilmez**)

DM okunmamışı bugünkü `dm` store'unda kalır (çalışıyor, canlı, dokunma).

---

## §6 Canlı güncelleme — `realtime/socket.ts`

Bugün kanal/ortam sayaçları **hiç canlı değil**; yalnız ekran odaklanınca REST'ten geliyor.
Home bir sekme olduğu için oturum boyunca mount'lu kalır → kullanıcı ana ekranda otururken
rozetler hiç artmaz. Bu sprintte düzelir:

- `channel.activity` → `bumpChannel(channelId, guildId)` (okunmamış +1)
- `mention` → `bumpChannel(channelId, guildId, { mention: true })`
- **Kendi mesajım sayılmaz**; **o an açık olan kanal/DM sayılmaz** (`MessageScreen` zaten `markRead`
  ediyor — DM store'undaki `activeDmChannelId` deseni kanala da uygulanır).

🔴 **`mention` olayı Bildirimler sekmesi rozetine YAZILMAZ.** `socket.ts:166-171`'deki bilinçli karar
korunur: o rozet sunucuda susturma tercihinden süzülmüş `notification` olayıyla besleniyor;
`mention`'ı oraya bağlamak susturmayı baypas ederdi. Bu sprintte `mention` **yalnız rail/kanal
rozetlerini** besler (web'in yaptığı da budur).

---

## §7 T&S / R7

**R7-nötr.** Yeni karar fonksiyonu, kapı veya görünürlük mantığı yok:

- Özel kanal sızıntısı **backend'de** engelli — kilitli kanalda sayaçlar `0` dönüyor
  (`channels.service.ts:170`), özel kanalda `mentionsEveryone` guild toplamına katılmıyor
  (`guilds.service.ts:230-234`). İstemci **kendi hesabını yapmaz**, sunucunun sayısını gösterir.
- Soketten gelen artırım yalnız kullanıcının **zaten aldığı** olaylara dayanır (room üyeliği sunucuda).

---

## §8 DoD

**Makine:**
- [ ] `npm run typecheck` + `npm run lint` temiz
- [ ] `api/` diffi **boş**; `web/` diffi **boş** (yeni metin gerekirse yalnız `web/src/i18n/tr.json`)

**Sahip — fiziksel cihazda:**
- [ ] Okunmamış mesajı olan ortamda rail'de **beyaz pip**, aktif ortamda pip **dikey çubuğa** uzuyor
- [ ] Bahsetme olan ortamda simgenin sağ altında **kırmızı sayaç**, sayı doğru
- [ ] Kanal listesinde okunmamış kanal **parlak** (ad + ikon), bahsetme olan kanalda **sağda kırmızı sayaç**
- [ ] Genel okunmamış artık kırmızı rozetle gösterilmiyor (web ile aynı dil)
- [ ] Ana Sayfa sekmesinde ve sohbet ekranlarının geri okunda **aynı** toplam sayı görünüyor
- [ ] Etkinlik sihirbazının geri okunda rozet **yok**
- [ ] Uygulama ana ekranda açıkken başka biri mesaj yazınca rozet **anında** artıyor (ekranı yenilemeden)
- [ ] Kanalı açınca ilgili rozet düşüyor; ortam panelinden "Okundu işaretle" ortamın tümünü temizliyor
- [ ] Sıradan üye (yönetici olmayan) kanal panelinden okundu işaretleyebiliyor

---

## §9 M2 sonrası kalem (sahip kararı 2026-08-02)

M2a/b/c bittikten sonra tek pakette yapılacak (üçü de aynı backend dokunuşunu paylaşıyor):

- **Etkinlik bildirimi** (üretim yok bugün → "Yeni Etkinlikleri Sustur" anahtarı ancak bundan sonra anlamlı)
- **@everyone / @here bastırma**
- **Tüm @Rol bahsetmelerini sustur**

*Öne Çıkanlar* karşılığı bizde yok, alınmadı.
