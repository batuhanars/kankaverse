# SPRINT M2d — Mobil Bahsetme Yazma (@üye + @everyone)

> **Tek doğruluk kaynağı.** Endpoint imzası, DTO şekli, davranış bu dosyadan **sapamaz**.
> Sapma ihtiyacı → **DUR**, kullanıcıya bildir, PM revize etsin. `TASK.md`'ye item **ekleme**,
> yalnız kutu işaretle.
>
> Tier: **yalnız `mobile/`**. `api/` ve `web/` diffi **BOŞ** olacak (i18n istisnası §6'da).
> Sahip kararı 2026-08-03. R7 durumu: **nötr** (§5).

---

## §0 Bağlam — neden bu sprint var

Sahip mobilde bir ortamda `@everyone` yazmayı denedi, öneri listesi çıkmadı ve bahsetme
gerçekleşmedi. Kod okunduğunda sebep net: **mobilde bahsetme ÜRETME altyapısı hiç yok.**

- `mobile/src/components/message/MessageComposer.tsx` (210 satır) düz bir `TextInput`; içinde tek
  satır bahsetme kodu yok — ne `@` sorgusu yakalayan bir şey, ne öneri listesi, ne gönderim öncesi
  token dönüşümü.
- **Alma tarafı zaten çalışıyor:** `mobile/src/utils/mentions.ts` gelen `<@userId>` ve `<@&roleId>`
  token'larını okunur metne çeviriyor. Web'den atılan bahsetme mobilde doğru görünüyor.
- Yani eksik olan tek şey **yazma**. Bu sprint o boşluğu kapatır.

**Neden R15'ten önce ve ayrı sprint:** R15 (rol bahsetmeleri) mobil ayağında "rolleri öneri
listesine ekle" diyor — ama ortada eklenecek liste yok. Liste R15'in **ön şartı**. Ayrıca tek
başına cihazda doğrulanabilir bir parça; M1d dersi ("küçük parçanın yürüdüğünü görmeden büyüğe
geçme, büyük kusuru gizliyor") burada birebir geçerli.

**Referans uygulama:** `web/src/composables/useMentionAutocomplete.ts` + `MessageArea.vue`'daki
bağlanışı. Desen okunur, **kopyalanmaz** (Metro proje kökü dışını çözemiyor; i18n'deki aynı sınır).

---

## §1 Kapsam

### IN

- Mesaj kutusunda `@` yazınca **öneri listesi**: ortam kanalında ortam üyeleri, DM'de karşı taraf,
  grup DM'de grup üyeleri
- `@everyone` önerisi — **yalnız** o ortamın `@everyone` rolü `mentionable` ise
- Seçilen öneriyi gönderimde token'a çevirme: `@kullanıcıadı` → `<@userId>`,
  `@everyone` → `<@&everyoneRoleId>`
- Seçilmemiş bahsetmenin **sessizce düşmediğinin görülmesi** (§4.4 — bu sprintin kalite maddesi)

### OUT (bilinçli)

- **Rol bahsetmeleri** (`@Hey` gibi normal roller) → **R15**. Bugün sunucu da yalnız everyone
  rolüyle eşleşiyor (`messages.service.ts:143-151`), istemciye eklemek ölü yüzey olurdu
- **Rol çipi / zengin görsel işaretleme** → R15 (orada iki istemciye birden geliyor)
- `MENTION_EVERYONE` izin kapısı → R15 (bugün ölü izin, backend okumuyor)
- Kanal bahsetmesi (`#kanal`), emoji önerisi, komut önerisi → V1 dışı
- Bahsetmenin **tıklanabilir** olması (profil açma) → alma tarafı kararı, M1a'da bilinçle dışarıda
  bırakılmıştı, bu sprint onu değiştirmez

---

## §2 `api/` — DEĞİŞMEZ

Sunucuda yapılacak **hiçbir şey yok**. Gereken her uç mevcut:

| İhtiyaç | Mevcut uç | Not |
|---|---|---|
| Ortam üyeleri | `GET /guilds/:id/members` → `GuildMemberDto[]` | `mobile/src/api/guilds.ts:177`, `channel-details.tsx` zaten kullanıyor |
| Roller (everyone + mentionable) | `GET /guilds/:id/roles` → `RoleDto[]` | `rolesApi.listByGuild`; `isEveryone` + `mentionable` alanları DTO'da var |
| Mesaj gönderme | `POST /channels/:id/messages` | Token'lı içerik düz `content` olarak gider, sunucu `resolveMentions` ile çözer |

**Dev bunu ihlal edecek bir ihtiyaç görürse DUR ve bildir** — "küçük bir alan eklesek" cümlesi bu
sprintte sapmadır.

---

## §3 Veri kaynakları (mobil)

Öneri listesinin beslendiği yer, ekrana göre değişir. `MessageScreen` bugün `channelId` alıyor ama
**üye listesi tutmuyor**; bu sprint ona kaynak geçirir.

### 3.1 Ortam kanalı (`app/(app)/channel/[id].tsx`)

- Üyeler: `guildsApi.listMembers(guildId)` — ekranda `guildId` **zaten param olarak var** (`:17`)
- `@everyone` rol id'si: `rolesApi.listByGuild(guildId)` içinden `isEveryone && mentionable` olan
  rolün `id`'si; yoksa **null → @everyone önerisi hiç çıkmaz** (web `MessageArea.vue:153-158` ikizi)
- 🔴 **`guildId` yoksa** (bildirimler/arama/sabitlemeler yollarından açılan kanal ekranı — M2c'de
  belgelenen mevcut boşluk): üye ve rol çekilmez, **öneri listesi hiç açılmaz**. Yarım liste
  göstermek yanlış vaat olur. Kullanıcı yine düz metin yazabilir.

### 3.2 DM ve grup DM (`app/(app)/dm/[id].tsx`)

- 1-1 DM: tek kişilik liste — karşı kullanıcı (route zaten `otherUserId` + `title` taşıyor)
- Grup DM: `dm` store'undaki kanal kaydının `members` dizisi
- `@everyone` önerisi **yok** (guild yok)

### 3.3 Çekme zamanı ve önbellek

- Liste ekran açılışında **bir kez** çekilir (`useEffect`, ekranın mevcut fetch deseni), `@`
  yazıldığında **istek atılmaz** — süzme bellekte yapılır
- Hata → liste boş kalır, **öneri açılmaz**, kullanıcıya hata gösterilmez (mesaj yazmayı engelleyen
  bir kusur değil; ekranın kendi mesaj hatası zaten ayrı)
- Yeni store **açılmaz**; state ekran seviyesinde `useState` (mevcut `channel-details.tsx` deseni)

---

## §4 Davranış — `useMentionCompose` (yeni kanca)

Yeni dosya: `mobile/src/components/message/useMentionCompose.ts`.
`useMessageComposer` ile **ayrı** durur (o gönderim/yanıt/düzenleme sahibi; bu bahsetme sahibi).

### 4.1 Sorgu tespiti

Web'deki kuralın aynısı: imlecin **solundaki** `@kelime` bloğu.

```
/@([\w]*)$/   // cursorPos'a kadar olan metnin sonunda
```

- Eşleşme yoksa liste kapanır
- `query` küçük harfe indirilip `username.toLowerCase().includes(q)` ile süzülür
- En fazla **8 öneri** (web `MAX_SUGGESTIONS` ile aynı)
- `@everyone` önerisi, `everyoneRoleId` doluysa **ve** `'everyone'.startsWith(q)` ise listenin
  **en üstüne** eklenir

> 🔴 **RN'de imleç konumu web'deki gibi bedava değil.** `TextInput`'ta `onSelectionChange` ile
> `selection.start` takip edilir. Bunu ölçmeden liste yeri yanlış hesaplanır. `onChangeText` tek
> başına yetmez — kullanıcı metnin ortasına dokunup oradan yazabilir.

### 4.2 Liste görünümü

- Mesaj kutusunun **ÜSTÜNDE**, giriş şeridine yapışık, en fazla ~200dp yükseklik, kendi içinde
  kaydırılır
- Satır: avatar (yoksa baş harf dairesi, mevcut `MessageBubble` deseni) + kullanıcı adı
- `@everyone` satırı: kişi ikonu yerine `people-outline`, etiket `@everyone`
- Renk/ölçü/yarıçap **`theme`'den**; yeni token uydurulmaz
- **Yeni bağımlılık yok**, yeni `Modal` **yok** (klavye açıkken Modal Android'de kırılgan; mevcut
  dosyalardaki not aynen geçerli)
- Liste açıkken mod şeridi (yanıt/düzenle) ve "yazıyor" şeridi **yerinden oynamaz**

### 4.3 Seçim ve token'a çevirme

- Dokununca: `@sorgu` bloğu `@kullanıcıadı ` (sonda boşluk) ile değiştirilir, imleç sonuna gider
- Seçilen kayıt bellekte tutulur: `Map<username, userId>`; `@everyone` için ayrı bayrak
- Gönderim öncesi `applyMentionTokens(text)`:
  - `@everyone` → `<@&everyoneRoleId>` (rol **hâlâ** mentionable ise)
  - `@kullanıcıadı` → `<@userId>`, **tam kelime sınırıyla** (`(?=\s|$)`)
- Gönderim **başarılı** olunca bellek temizlenir; gönderim hata verirse **temizlenmez** (kullanıcı
  tekrar deneyecek, bahsetmeleri kaybetmesin)
- Düzenleme modunda da aynı dönüşüm uygulanır (`useMessageComposer` düzenlemeyi de gönderiyor)

### 4.4 🔴 Sessiz başarısızlık taşınmayacak (bu sprintin kalite maddesi)

Web'de bilinen bir tuzak var ve **mobil kopyası onu tekrar etmemeli**: kullanıcı öneriyi listeden
seçmeden elle `@everyone` yazarsa metin token'a çevrilmiyor, mesaj sıradan mesaj olarak gidiyor ve
**kullanıcıya hiçbir şey söylenmiyor**. Sahip tam olarak buna takıldı (2026-08-03).

Mobilde çözüm — **iki kural**:

1. **Elle yazılan `@everyone` de token'a çevrilir**, seçilmiş olması şart değil: rol `mentionable`
   ise `applyMentionTokens` metindeki `@everyone` geçişlerini çevirir. (Discord'da da yazmak
   yeter; sunucu zaten `mentionable` kapısını uyguluyor, yani bu kapıyı gevşetmez.)
2. **Kullanıcı adları için aynısı YAPILMAZ** — yalnız listeden seçilenler çevrilir. Sebep: rastgele
   bir `@kelime` metnini kullanıcıya eşlemek için isim araması gerekir, o da yeni bir uç demektir
   (kapsam dışı) ve yanlış kişiyi bahsetme riski taşır.

> Bu asimetri bilinçlidir ve sözleşmede yazılıdır: `@everyone` **tek ve sabit** bir hedef, kullanıcı
> adı değil. Dev "tutarlı olsun" diye ikisini eşitlemeye **kalkmaz** → sapma.

### 4.5 Klavye ve dokunma

- Liste açıkken klavye **kapanmaz** (`keyboardShouldPersistTaps="handled"`)
- Dokunma hedefi ≥44dp
- Geri tuşu: liste açıksa **önce listeyi kapatır**, ekrandan çıkmaz

---

## §5 T&S / R7

**R7-nötr.** Yeni erişim kararı yok, hiçbir kapı gevşemiyor:

- Öneri listesi yalnız **zaten görebildiğin** kişileri gösterir (ortam üyeleri / DM karşı tarafı) —
  yeni bir keşif yüzeyi değil
- `@everyone` kapısı sunucuda: `mentionable` false ise sunucu `mentionsEveryone` yazmaz, istemci ne
  gönderirse göndersin
- Bahsetme alıcı kümesi, yaş/özel-kanal süzgeçleri **tamamen sunucuda** (`resolveMentions` +
  `notifyMentions`); istemci yalnız metin üretir
- Minör statüsü hiçbir öneride/yanıtta sızmaz (liste zaten üyelik listesi, yaş bilgisi taşımıyor)

Dev bu satırları ihlal edecek bir şey görürse **DUR** ve bildir.

---

## §6 i18n

Yeni metinler `web/src/i18n/tr.json`'a **bir kez** yazılır (`mobile.*` altına), mobil
`npm run i18n:sync` ile alır. **Bu, `web/` diffinin tek meşru istisnasıdır** ve yalnız `tr.json`
dosyasını kapsar; `web/src` altında başka dosya değişmez.

Gereken anahtarlar (isimler dev'e bırakılmadı, contract sabiti):

| Anahtar | Metin |
|---|---|
| `mobile.mention.everyoneLabel` | `@everyone` |
| `mobile.mention.everyoneHint` | `Bu kanaldaki herkese bildirim gider` |
| `mobile.mention.empty` | `Eşleşen kimse yok` |

---

## §7 DoD

**Kod:**
- [ ] `mobile`: `npm run typecheck` + `npm run lint` temiz
- [ ] `api/` diffi **YOK**; `web/` diffi **yalnız** `src/i18n/tr.json`
- [ ] Yeni bağımlılık yok; yeni store yok; yeni `Modal` yok
- [ ] Gömülü string yok (tümü `tr.json`), renk/ölçü `theme`'den
- [ ] `MessageComposer.tsx` 300 satırı geçmiyor (geçiyorsa liste ayrı bileşene çıkar)

**Cihazda (sahip):**
- [ ] Ortam kanalında `@` yazınca üye listesi çıkıyor, yazdıkça süzülüyor
- [ ] Üye seçilince metne `@ad` giriyor, gönderilince **karşı hesapta kırmızı bahsetme rozeti** ve
      bildirim oluşuyor
- [ ] `@everyone` **bahsedilebilir olan** ortamda listede çıkıyor, seçilince herkese bildirim gidiyor
- [ ] `@everyone` **bahsedilebilir olmayan** ortamda listede **çıkmıyor**, elle yazılınca da bahsetme
      olmuyor (sunucu kapısı)
- [ ] Elle yazılan `@everyone` (listeden seçmeden) bahsedilebilir ortamda **çalışıyor** (§4.4)
- [ ] 1-1 DM'de karşı taraf, grup DM'de grup üyeleri listede; DM'de `@everyone` **yok**
- [ ] Liste açıkken klavye kapanmıyor, satıra parmakla basılabiliyor, geri tuşu önce listeyi kapatıyor
- [ ] Metnin ortasına dokunup oradan `@` yazınca liste doğru sorguyla açılıyor (imleç takibi)
- [ ] Bildirimler sekmesinden/aramadan açılan kanalda (guildId yok) liste **hiç açılmıyor**, ekran
      normal çalışıyor

---

## §8 Sonraki

**R15 — rol bahsetmeleri.** Bu sprintin listesi oraya taban olur: R15 aynı listeye **rolleri**
ekler, `mentionable` + `MENTION_EVERYONE` iki katmanlı kapıyı gerçek yapar, rol çipini iki
istemciye birden getirir ve `<@&roleId>` çiziminin bugün **her rolü "@everyone" göstermesini**
(`mobile/src/utils/mentions.ts`) düzeltir.
