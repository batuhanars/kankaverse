# SPRINT R15 — Rol Bahsetmesi (@Rol) + Rol Bahsetmelerini Sustur

> **Tek doğruluk kaynağı.** Endpoint imzası, DTO şekli, enum değeri, kapı modeli buradan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
>
> PM compose: 2026-08-03. Sahip kararı: rol bahsetmesi ürün olarak önemli ("on kişiyi tek tek
> etiketlemek yerine gruba hitap etmek"). Kapı modeli sahip tarafından seçildi (§2.2).
>
> 🔴 **Sıra kilidi: R14 merge edilmeden başlamaz.** Aynı fonksiyonlara dokunuyor
> (`notifyMentions`, `findMyGuilds`, `findByGuild` rozet sayımı). Paralel çalışılırsa çakışır.

---

## §0 Bağlam ve bugünkü durum

`<@&roleId>` token'ı bugün **ayrıştırılıyor ama yalnız `isEveryone` rolüyle eşleştiriliyor**
(`messages.service.ts:143-151`). Normal bir rolü etiketlersen token sessizce düşer: bildirim yok,
rozet yok, WS eventi yok.

İki istemci de bunun üstüne kurulmuş: `web/src/utils/mentions.ts:20`, `web/src/utils/markdown.ts:164`
ve `mobile/src/utils/mentions.ts:13` **her** `<@&...>` token'ını sabit `"@everyone"` metnine çeviriyor.
Yani sunucu düzeltilip istemci düzeltilmezse "@Moderatörler" ekranda **"@everyone"** yazar.

**Ölü izin:** `MENTION_EVERYONE` bayrağı `PERMISSION_FLAGS` içinde tanımlı, web
(`RolesSettingsSection.vue:80`) ve mobil (`roles.ts:96`) rol ayarları ekranlarında kullanıcıya
gösteriliyor, işaretlenip kaydediliyor — ve backend **hiçbir yerde okumuyor**. Bugün @everyone'ın tek
kapısı everyone rolünün `mentionable` anahtarı. R15 bu izni gerçek yapar.

**Mobilde bahsetme yazma — REVİZE (PM, 2026-08-03, M2d sonrası):** bu sözleşme yazıldığında mobil
composer'da otomatik tamamlama **hiç yoktu** ve §4 "yalnız okuma/gösterim" diye kurulmuştu. **M2d o
boşluğu kapattı**: mobilde artık üye ve `@everyone` etiketlenebiliyor (`useMentionCompose` +
`MentionSuggestionList`). Sözleşme olduğu gibi uygulanırsa mobilde kişi ve herkes etiketlenip **rol
etiketlenemez** — liste zaten ortada dururken savunulamayacak bir asimetri. §4 buna göre genişletildi:
**roller mobil öneri listesine de girer** (aynı kapı kuralıyla).

---

## §1 Kapsam

### IN

1. `api/`: normal rol bahsetmesinin çözülmesi, saklanması, alıcı kümesi, bildirim ve rozet etkisi (§2)
2. `api/`: `MENTION_EVERYONE` izninin **gerçekten uygulanması** (§2.2) + göç notu (§2.3)
3. `api/`: `NotificationPref.suppressRoleMentions` — sahibin özgün "tüm rol bahsetmelerini sustur" talebi
4. `web/`: otomatik tamamlamada roller + `<@&roleId>` token'ı + **rol adı/rengiyle** çip render
5. `mobile/`: rol token'ının doğru adla gösterilmesi (sabit "@everyone" düzeltmesi) + susturma anahtarı
   + **öneri listesine roller** (M2d sonrası revizyon, §0)

### OUT (bilinçli)

| Çıkarılan | Gerekçe |
|---|---|
| `@here` | Presence-tabanlı bahsetme özelliği hiç yok. Ayrı karar, ayrı iş |
| ~~Mobilde bahsetme **yazma**~~ | **KAPSAMA GİRDİ** — M2d listeyi getirdi, roller de o listeye eklenir (§4) |
| Rol bahsetmesine özel hız sınırı / anti-spam sayacı | Kapı `mentionable` + izin. Gerçek kötüye kullanım görülmeden sayaç eklemek erken |
| Kanal düzeyinde rol-bahsetme izni (Discord'un kanal override'ları) | Bizde kanal-bazlı izin override sistemi yok. Ayrı ve büyük iş |

---

## §2 `api/`

### 2.1 Şema (additive, tek migration)

```prisma
model Message {
  // ... mevcut
  mentions         String[] @default([])   // değişmedi (kullanıcı id'leri, ≤10)
  mentionsEveryone Boolean  @default(false) // değişmedi
  mentionRoles     String[] @default([])   // YENİ — bahsedilen rol id'leri (≤3, isEveryone HARİÇ)
}

model NotificationPref {
  // ... mevcut + R14 alanları
  suppressRoleMentions Boolean @default(false)  // YENİ — yalnız targetType=GUILD
}
```

🔴 **Üye id'lerine AÇMA.** `mentionRoles` rol id'si saklar; alıcı kümesi **okuma anında** çözülür.
Sebep: rol üyeliği sonradan değişir; mesaja gömülü üye listesi yanlış tarihe donar. @everyone'da da
aynı karar verilmişti (`messages.service.ts:134-135`).

`suppressRoleMentions` de R14'ün iki bayrağıyla aynı kuralı izler: yalnız `targetType=GUILD`,
aksi hâlde `400 INVALID_PREF_TARGET`.

### 2.2 Kapı modeli (sahip seçti — dev bunu değiştirmesin)

**İki katman:**

| Token | Kapı |
|---|---|
| `<@&rol>` · rol `mentionable: true` | Kanalda mesaj yazabilen **herkes** |
| `<@&rol>` · rol `mentionable: false` | **HİÇ KİMSE** (sahip/yönetici dahil) — bkz. R2 revizyonu |
| `<@&everyoneRolü>` | **İki kapı birden:** everyone rolü `mentionable: true` **VE** gönderende `MENTION_EVERYONE` |

### 🔴 R2 revizyonu (sahip kararı 2026-08-03, canlı kullanım sonrası)

İlk hâlde `mentionable: false` rolü **`MENTION_EVERYONE` izni olan** etiketleyebiliyordu (Discord
modeli: tek izin hem @everyone'ı hem kısıtlı rolleri yönetir). **Bu pratikte çöktü:** §2.3 göç
telafisi o izni `@everyone` rolüne eklediği için, o ortamlardaki **her üye** baypası kazandı ve
"bahsetme" anahtarını kapatmak hiçbir şey değiştirmedi. Sahip tam olarak bunu bildirdi: *"Hey
rolünün bahsedilme ayarını kapattım ama gene de listede görünüyor ve normal kullanıcı da
etiketleyebiliyor."*

Kök sorun: **tek izin iki farklı yetkiyi yönetiyordu** ve sahibin istediği durum ("@everyone herkese
açık kalsın, kapalı roller kapansın") bu modelde **ifade edilemiyordu**.

**Yeni kural:** `mentionable: false` → o rol **hiç kimseye önerilmez ve hiç kimse etiketleyemez.**
İzin baypası yok. Anahtar adının hakkını verir, öngörülebilir. Yönetici o rolü pinglemek isterse
anahtarı açar, atar, kapatır — toplu ping'de sürtünme istenen şeydir.

`MENTION_EVERYONE` böylece **yalnız @everyone'ı** yönetir (adıyla tutarlı); rollerle ilgisi kalmaz.
Göç telafisi migration'ı **olduğu gibi kalır** — amacı @everyone'ı korumaktı, o hâlâ geçerli.

@everyone'da iki kapının birlikte aranmasının sebebi: `mentionable` ortam çapında **kill-switch**
olarak anlamını korusun ("burada kimse herkesi etiketleyemez"), izin ise **kimin** yapabileceğini
belirlesin. Tek kapıya indirilirse ikisinden biri yeniden ölü bayrak olur — bu sprintin varlık
sebeplerinden biri ölü bayrağı temizlemekti.

Kontrol: `PermissionsService.hasGuildPermission(userId, guildId, 'MENTION_EVERYONE')` (fail-closed,
üye değil → false). Kapıya takılan token **sessizce düşer** (mesaj gider, ping olmaz) — bugünkü
@everyone davranışıyla aynı, yeni hata kodu **yok**.

### 2.3 🔴 Göç notu (davranış değişikliği)

`MENTION_EVERYONE`, `DEFAULT_EVERYONE_PERMISSIONS` içinde **yok**. İzin uygulanmaya başlayınca,
everyone rolü `mentionable: true` olan ortamlarda bugün @everyone yazabilen sıradan üyeler
**yazamaz hâle gelir**.

**Migration bunu telafi eder:** everyone rolü `mentionable: true` olan ortamlarda, o ortamın everyone
rolünün `permissions` dizisine `MENTION_EVERYONE` eklenir (idempotent; zaten varsa dokunma).
Böylece **hiçbir ortamın bugünkü davranışı sessizce değişmez**; sahibi kısmak isterse izni elle alır.
`mentionable: false` olan ortamlara **dokunulmaz** (orada zaten kimse @everyone yazamıyordu).

Migration'ın etkilediği satır sayısı rapora yazılır (bugün büyük ihtimalle 0-1 ortam).

### 2.4 `resolveMentions` genişlemesi (`messages.service.ts`)

Mevcut Adım 0 yeniden yazılır. Sıra bağlayıcı:

1. `<@&id>` token'ları toplanır (mevcut regex, değişmiyor)
2. Kanal **guild kanalı değilse** (DM/grup DM) → rol çözümü **yok**, bugünkü gibi
3. Token id'leriyle **tek sorgu**: `role.findMany({ where: { guildId, id: { in: tokenIds } }, select: { id, mentionable, isEveryone } })` (başka ortamın rol id'si otomatik elenir)
4. Gönderenin `MENTION_EVERYONE` izni **en fazla bir kez** çözülür (yalnız gerekliyse: izin arayan token varsa)
5. everyone rolü → §2.2'deki iki kapı → `mentionsEveryone`
6. Diğer roller → kapıdan geçenler `mentionRoles`'e, **≤3 farklı rol** (fazlası sessizce düşer;
   kullanıcı bahsetmesindeki ≤10 kuralının kardeşi)
7. Kullanıcı token'ları (Adım 1-3) **değişmiyor**

### 2.5 Alıcı kümesi (`messages.gateway.ts` `notifyMentions`)

Mevcut everyone genişlemesinin **yanına** rol genişlemesi eklenir. T&S süzgeçleri **birebir aynı**:

- Rol üyeleri: `guildMemberRole.findMany({ where: { roleId: { in: mentionRoles }, member: { guildId } }, select: { member: { select: { userId: true } } } })` — **tek sorgu**
- **Özel kanal** (`isPrivate`): sonuç `ChannelMember` ∪ (OWNER/ADMIN) kümesiyle **kesiştirilir**
  (kanalı görmeyen üye rolü yüzünden ping almaz ve kanalın varlığını öğrenmez)
- **Yaş kapısı** (`ageGated || guild.adultsOnly`): minörler elenir
- Yazar her zaman elenir; kullanıcı/everyone/rol kümeleri tekilleştirilir
- `preview`: `<@&id>` artık sabit `"@everyone"` değil, **rol adına** çözülür (everyone rolü için
  yine `@everyone`; çözülemeyen id için `@rol`). Preview sunucuda üretildiği için bildirim listesinde
  doğru ad görünür
- Kalıcı bildirim tipi **`MENTION`** (yeni tip yok); mevcut `mention` WS eventi de gider

**Susturma zinciri (sıra bağlayıcı):** alıcı yalnız rol genişlemesinden geliyorsa (doğrudan
bahsedilmiş değilse) → ortam tercihinde `suppressRoleMentions` ise **ne emit ne persist**.
Doğrudan `<@kullanıcı>` bahsetmesi her zaman geçer. R14'ün `suppressEveryone` deseniyle birebir aynı
mantık; tercih sorgusu alıcı listesi için **tek sorguda** yapılır (alıcı başına sorgu yasak).

### 2.6 Rozet sayımı

`mentions` sayacı bugün `mentions has userId` OR `mentionsEveryone` bakıyor. Üçüncü dal eklenir:
`mentionRoles hasSome <kullanıcının o ortamdaki rol id'leri>`.

- `guilds.service.ts` `findMyGuilds`: kullanıcının **tüm** ortamlardaki rol bağları **tek sorguda**
  çekilir, ortam bazında gruplanır (N+1 yasak; D18 zaten borç, büyütme)
- `channels.service.ts` `findByGuild`: o ortamdaki rolleri **tek sorguda**
- Rol id kümesi boşsa dal **hiç eklenmez** (boş `hasSome` sorgusu üretme)
- `suppressRoleMentions` açıksa dal eklenmez (R14'ün `suppressEveryone` deseni)
- Özel kanal kuralı korunur: `findMyGuilds` özel kanalda toplu-bahsetme dallarını (everyone **ve** rol)
  saymaz — sızıntı kapısı R14/D18 notundaki gerekçeyle aynı

### 2.7 Testler (birim)

- Kapı matrisi: mentionable rol → herkes · mentionable olmayan rol → yalnız izinli · @everyone → iki kapı
- Başka ortamın rol id'si token olarak verilirse **düşer**
- Özel kanalda rol bahsetmesi: kanal üyesi olmayan rol sahibi **ping almaz**
- Yaş-kapılı kanalda minör rol sahibi **ping almaz**
- ≤3 rol sınırı; rol üyeliği mesajdan **sonra** değişince alıcı kümesi güncel rolden çözülür
- `suppressRoleMentions` açıkken rol pingi düşmez, **aynı mesajdaki doğrudan bahsetme düşer** (regresyon kilidi)
- Rozet: rol bahsetmesi mention sayacına katkı verir; susturulunca vermez
- Mevcut @everyone ve kullanıcı bahsetme testleri **yeşil kalır**

### 2.8 R7 durumu

**R7-hafif → PM incelemesi zorunlu.** Yeni bir erişim kapısı açılmıyor ama **yeni bir toplu-erişim
yüzeyi** açılıyor: tek mesajla çok kişiye bildirim. İnceleme noktaları: (a) özel kanal kesişimi
gerçekten uygulanıyor mu, (b) yaş kapısı elemesi rol yolunda da var mı, (c) kapıya takılan token
sessizce düşüyor mu (hata mesajıyla rol varlığını sızdırmıyor mu), (d) alıcı kümesi okuma anında
çözülüyor mu. Sahip isterse satır-satır inceler.

---

## §3 `web/`

- **Otomatik tamamlama** (`useMentionAutocomplete.ts`): bugün yalnız `@everyone` özel önerisi + üyeler.
  Rol önerileri eklenir: `mentionable` roller **herkese**; `mentionable` olmayanlar yalnız
  `MENTION_EVERYONE` izni olan kullanıcıya (izin bilgisi mevcut yetki hattından okunur, yeni uç yok).
  Seçim → `<@&roleId>` token'ı (mevcut everyone dönüşümünün genelleşmiş hâli)
- **Render** (`utils/mentions.ts` + `utils/markdown.ts`): sabit `"@everyone"` yerine **rol adı**
  (roller store'undan; bulunamazsa `@rol` yedeği). Çip rengi rolün `color` değerinden; everyone
  bugünkü görünümünü korur. XSS: rol adı **kaçırılır** (mevcut `escapeHtml` hattı)
- **Bahsetme bandı** (REV-4 vurgusu) rol bahsetmesinde de çalışır
- Ortam bildirim yüzeyine üçüncü anahtar: **Rol Bahsetmelerini Sustur**
- Metinler `tr.json`; renk/ölçü `--kv-*`

## §4 `mobile/`

- `utils/mentions.ts`: sabit `"@everyone"` düzeltilir → rol adı çözümü (roller yüklü değilse `@rol`).
  M2d R1'de eklenen `splitMentions` parça üretiyor; rol parçası da **Kor aksanıyla** çizilmeye devam eder
- **Öneri listesine roller** (M2d sonrası revizyon): `mentionable` roller herkese, `mentionable`
  olmayanlar yalnız `MENTION_EVERYONE` izni olana. Kanal ekranı rolleri zaten çekiyor
  (`rolesApi.listByGuild`, M2d §3.1) — **yeni istek yok**, aynı yanıt süzülür.
  Rol satırı üye satırından ayırt edilebilir olmalı (rol rengi + ikon), yoksa aynı adlı üye/rol karışır
- Seçim → `<@&roleId>` token'ı (`useMentionCompose` `select` yolu genelleştirilir; `@everyone`
  için bugün kullanılan yol rol id'siyle aynı biçimi üretiyor)
- `guild-notifications.tsx`: üçüncü anahtar **Rol Bahsetmelerini Sustur** (R14'teki iki anahtarın deseni)
- Rozet/bildirim tarafı sunucudan geldiği gibi çalışır, istemcide ek mantık yok

---

## §5 DoD

**Kod:**
- [ ] `nest build` + tüm testler yeşil + `prisma migrate status` temiz (migration UYGULANMIŞ)
- [ ] Migration'ın kaç ortamı etkilediği raporda yazılı (§2.3 telafisi)
- [ ] `web`: `vue-tsc --noEmit` temiz · `mobile`: `typecheck` + `lint` temiz
- [ ] Yeni bağımlılık yok; metinler `tr.json`

**Uçtan uca (sahip):**
- [ ] `mentionable` bir rolü etiketle → o roldeki üyeler bildirim + rozet alıyor, **almayanlar almıyor**
- [ ] `mentionable` olmayan rolü sıradan üye etiketleyince **hiçbir şey olmuyor** (mesaj gidiyor, ping yok)
- [ ] İzinli kullanıcı aynı rolü etiketleyince ping düşüyor
- [ ] Etiketlenen rol ekranda **kendi adıyla** görünüyor (web ve mobil), "@everyone" yazmıyor
- [ ] **Mobilde** `@` yazınca roller de listede; `mentionable` olmayan rol sıradan üyeye görünmüyor
- [ ] Özel kanalda rol etiketi kanal üyesi olmayanlara **gitmiyor**
- [ ] "Rol Bahsetmelerini Sustur" açıkken rol pingi gelmiyor, adınla etiketlenince geliyor
- [ ] @everyone bugünkü gibi çalışmaya devam ediyor (göç telafisi tuttu)
