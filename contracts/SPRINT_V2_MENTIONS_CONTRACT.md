# Sprint V2 — @bahsetme (Mentions) Sözleşmesi

> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. **Tek doğruluk kaynağı bu dosya.** Endpoint imzası/DTO/enum/event
> şekli buradan sapamaz. Sapma ihtiyacı → dev DURUR, PM'e döner. Response envelope: `{ success, statusCode, data }`
> (controller sarmalamaz). İlgili: `messages.service.ts`, `messages.gateway.ts`, `messages.controller.ts`.

Amaç: bir mesaj içinde başka kullanıcıyı `@` ile anmak → mesajda vurgulu render + bahsedilene bildirim. DM,
grup DM ve ortam (guild) kanallarının **üçünde** çalışır.

---

## 1. Wire format (kanonik) — KARAR

Bahsetme, **`content` string'inin içine gömülü `<@{userId}>` token'ı** olarak taşınır (Discord-iç deseni).

- Örnek `content`: `"selam <@clx0abc123> buna bakar mısın <@clx0def456>"`
- İstemci gönderirken `@kullanıcıadı` metnini, seçtiği kişinin **userId**'si ile `<@userId>` token'ına çevirir.
- Sunucu yalnız **userId** ile çalışır (kullanıcı adı çözümlemesi istemcide). Token regex: `<@([a-zA-Z0-9_-]+)>`.
- **`@everyone` / `@here` / rol bahsetme YOK** (bu sprint dışı — minörlü alanda toplu-ping istismar vektörü;
  rol/izin matrisi geldiğinde V3'te değerlendirilir).

---

## 2. Veri modeli (Prisma)

`Message` modeline alan eklenir:

```prisma
mentions String[]  @default([])   // bahsedilen + doğrulanmış userId listesi (tekilleştirilmiş)
```

- Migration adı: `add_message_mentions`. T&S alanı değil ama erişim-doğrulamalı (bkz §4).
- Ayrı tablo/relation YOK (over-engineering kaçın — scalar array V2 için yeterli: render highlight + notify).

---

## 3. Davranış — `create()` ve `editMessage()`

`content` kaydedilmeden ÖNCE token'lar çıkarılır, **doğrulanır**, `mentions` alanına yazılır:

1. `content` içinden tüm `<@id>` token userId'lerini regex ile topla, **tekilleştir**.
2. Her userId için **kanal erişim doğrulaması** (§4) → yalnız geçerli olanlar `mentions`'a girer.
3. **Üst sınır:** en fazla **10 benzersiz** bahsetme saklanır; fazlası sessizce düşer (anti-spam, hata DEĞİL).
4. `content` **olduğu gibi** saklanır (token'lar metinde kalır; geçersiz token'lar da metinde kalır, sadece
   `mentions`'a yazılmaz → bildirim üretmez).
5. `editMessage` aynı mantığı uygular: düzenlemede `mentions` yeniden hesaplanır (eklenen yeni bahsetmeler
   bildirim üretir — bkz §5 not).

`mentions` boşsa `[]`. Token yoksa ekstra sorgu yapma (kısa devre: regex eşleşmesi yoksa atla).

---

## 4. Erişim doğrulama (T&S — R7 incelemesi) — KRİTİK

Bir userId yalnızca **o kanala meşru erişimi olan** biriyse geçerli bahsetmedir. Doğrulama,
`MembershipService.requireChannelAccess`'in kapılarını **birebir aynalamalı** (üyelik **+ yaş kapısı**):

- **Guild kanalı:** userId, kanalın guild'inin `GuildMember`'ı olmalı **VE** kanal yaş-kapılı değilse ya da
  bahsedilen reşitse. Yani: `needsAgeCheck = channel.ageGated || guild.adultsOnly` ise **minör bahsedilenler
  ELENİR** (`requireChannelAccess` satır 58-69 ile aynı kapı).
- **DM / grup DM:** userId, kanalın `ChannelMember`'ı olmalı; `channel.ageGated` ise minörler elenir (teorik
  ama tutarlılık için aynalanır).

Tek toplu sorgu ile (N+1 yok), üyelik + `isMinor` birlikte çekilir:
- Guild → `guildMember.findMany({ where:{ guildId, userId:{ in: tokenIds } }, select:{ userId:true, user:{ select:{ isMinor:true } } } })`; `needsAgeCheck` ise `isMinor` olanlar filtrelenir.
- DM/grup → `channelMember.findMany({ ..., select:{ userId:true, user:{ select:{ isMinor:true } } } })`; `channel.ageGated` ise `isMinor` olanlar filtrelenir.

`resolveMentions`, `requireChannelAccess`'in döndürdüğü **channel objesini** (guild include'lu — `ageGated`,
`guildId`, `guild.adultsOnly` taşır) parametre alır; bayrakları yeniden sorgulamaz.

**T&S ilkesi (KRİTİK):** paylaşılmayan **veya yaş-kapılı** alandaki kullanıcı ping'lenemez. Aksi halde
`mention` event'inin `preview`'ı yaş-kısıtlı kanal içeriğini erişimi olmayan (ör. minör) kullanıcıya **sızdırır**
ve onu o kanala çeker — bu R7 ihlalidir. Geçersiz/elenmiş token **sessizce** bildirim üretmez — ayrı hata
kodu/durum sızıntısı YOK (minör/varlık durumu sızdırılmaz). Yazarın kendisi `mentions`'ta kalabilir ama
**kendine bildirim gönderilmez** (§5).

---

## 5. WS olayı — `mention`

`create` (ve edit'te yeni eklenen bahsetmeler) sonrası, **bahsedilen her userId'nin `user:<id>` odasına**
(yazar hariç) yayılır. Controller'da `create`/`edit` sonrası `notifyMentions(channelId, message)` çağrılır
(mevcut `notifyDmActivity`/`notifyChannelActivity` deseniyle aynı, gateway metodu).

**Event adı:** `mention`
**Payload:**
```jsonc
{
  "messageId": "clx...",
  "channelId": "clx...",
  "guildId": "clx..." | null,        // guild kanalı ise guildId, DM ise null
  "author": { "id": "clx...", "username": "ali", "avatarUrl": "..." | null },
  "preview": "selam @ali buna bakar..."  // ≤100 karakter; token'lar @kullanıcıadı'na çözülmüş düz metin
}
```

- `preview`: `content`'ten türetilir, `<@id>` token'ları ilgili kullanıcının `@username`'ine çevrilir (gateway
  bahsedilenlerin username'lerini zaten sorgular), ≤100 karakter kesilir. Çözülemeyen token → `@bilinmeyen`.
- Yazara kendi bahsetmesi için event **gönderilmez** (`userId === authorId` atla).
- **edit notu:** edit'te yalnız **yeni eklenen** (önceki `mentions`'ta olmayan) userId'lere event gönderilir
  (aynı mesajı düzenleyince eski bahsedilenler tekrar ping'lenmez). Basitlik için edit'te mevcut `mentions`
  ile yeni `mentions` farkı alınır; fark kümesine event. (Bu sprint: edit-notify opsiyonel; create-notify zorunlu.)

---

## 6. MessageDto deltası

`toMessageDto` çıktısına eklenir:

```jsonc
"mentions": ["clx0abc123", "clx0def456"]   // string[] — doğrulanmış bahsedilen userId'ler (boşsa [])
```

- `findMessages`, `create`, `editMessage` üçü de `mentions`'ı döndürür (DB alanından doğrudan).
- İstemci bu diziyi: (a) hangi token'ın gerçek/geçerli bahsetme olduğunu bilmek, (b) **kendi-bahsedilme**
  (`mentions.includes(currentUserId)`) → mesaj vurgusu için kullanır.

---

## 7. Frontend (web/) — davranış sözleşmesi

> Mekanik (popover/parse) dev'in alanı; aşağıdakiler **sözleşme gereği** karşılanmalı.

- **Compose autocomplete:** textarea'da `@` + sorgu yazılınca, kanal üyeleri (guild) / DM katılımcıları
  arasından filtreli bir öneri popover'ı. Seçim → `@kullanıcıadı ` eklenir + seçilen `userId` istemci
  tarafında `{ username → userId }` haritasında tutulur. (Kullanıcı adları benzersiz varsayımı; yalnız
  picker'dan **seçilen** bahsetmeler token'a çevrilir.)
- **Gönderimde dönüşüm:** gönderilen `content`'te, picker'dan seçilen her `@kullanıcıadı` → `<@userId>`
  token'ına çevrilir (kelime-sınırı). Seçilmeyen serbest metin `@x` dokunulmaz kalır.
- **Render (MessageRow):** `content` içindeki `<@id>` token'ları **vurgulu bahsetme pill**'ine çevrilir
  (`@username`, `--kv-accent-*` tonları; çözülemeyen id → `@bilinmeyen`, düz). Parent, MessageRow'a userId→username
  çözücü/harita sağlar (guild üye listesi / DM katılımcıları).
- **Kendi-bahsedilme vurgusu:** `mentions.includes(authStore.user.id)` ise mesaj satırına ince sol-aksan
  vurgusu (`--kv-accent-500` sol kenar + hafif `--kv-accent-subtle` zemin; gölge yok).
- **Bildirim:** `mention` WS olayı → `notifications` store'a yeni tip `'mention'` push (`"@author seni bir
  mesajda andı"` — i18n `i18n/tr.json`). Toast + (varsa) bildirim listesi. Kanal okunmamış rozeti mevcut
  `channel.activity`/`dm.message` ile zaten artar — ek rozet bu sprintte ZORUNLU değil.
- **i18n:** tüm yeni görünen string `i18n/tr.json`'da; koda gömme.

---

## 8. Kapsam dışı (bu sprint)

- `@everyone`/`@here`/rol bahsetme · ayrı "bahsetmelerim" görünümü/sorgusu · ayrı mention-sayacı rozeti ·
  bahsetme bildirimi e-posta/push. (Gerekirse sonraki dalga.)

---

## 9. Kabul kriterleri

- [ ] `Message.mentions String[]` + migration; `toMessageDto` `mentions` döner (3 sorgu yolu).
- [ ] `create`: token parse + erişim-doğrulama (§4) + tekilleştir + ≤10 + sakla; `notifyMentions` event (yazar hariç).
- [ ] Geçersiz/erişimsiz token bildirim üretmez, hata da fırlatmaz (sessiz); durum sızıntısı yok.
- [ ] WS `mention` payload §5 şekli; `preview` token→@username çözülmüş ≤100.
- [ ] Frontend: autocomplete + gönderimde `<@id>` dönüşümü + pill render + kendi-bahsedilme vurgusu + `mention` bildirimi.
- [ ] `api` ve `web` build TEMİZ; backend birim testleri (parse/validate/cap/yazar-atla) yeşil.
- [ ] R7: §4 erişim-doğrulama PM (Opus) tarafından satır satır incelendi.
