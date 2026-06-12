# Sprint 4A Contract — Minör Arkadaşlık/DM T&S Kapıları + Tıkla-Ekle + Engel/Inbox İyileştirmeleri

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. Türetildiği kararlar: `PLAN.md` "Sprint 4 Girdileri (G1-G4)".
>
> **R7 — bu sprint'in çekirdeği T&S karar fonksiyonudur; satır satır insan incelemesi zorunlu.** Kapsam:
> `FriendPermissionService.canSendFriendRequest` (yeni), minör erişim kapıları, blok-obfuscation. Hata bedeli
> **çocuk güvenliği** (brief §4, §5.1, §5.1.b). Diğer CRUD/UI kısımları standart inceleme.
>
> **Bağlam:** Sprint 4 ikiye bölündü. **4A = "ulaşımı zorlaştır"** (önleme/erişim kapıları). **4B = "tespit et +
> müdahale et"** (Report + `contextSnapshot` + moderasyon kuyruğu + ModerationAction + AuditLog) → ayrı contract,
> **hukuki görüş sonrası** (KVKK/minör verisi saklama; PLAN açık kalemi). 4A hukuki görüş gerektirmez (davranış kapıları).

---

## 1. Hedef

`canDm` R7'sinde tespit edilen kritik nokta (F1): **arkadaşlık DM bariyerini kırar — asıl koruma arkadaş-isteği anında olmalı.**
Sprint 4A bu kapıyı kurar + onaylı ürün kararlarını (G1-G4) uygular:

1. **🫀 `FriendPermissionService.canSendFriendRequest` (R7)** — arkadaş isteği tek T&S karar noktası. Minör söz konusuysa
   **cold/tıkla-ekle varsayılan kısıtlı**; friendCode (bilinçli paylaşım) yolu açık kalır.
2. **Tıkla-ekle (G2)** — kullanıcı detay kartından `+user` ile **kod istemeden** istek (yalnız ortak ortam + yetişkin↔yetişkin).
3. **Engel mesajı belirsiz (G3)** — engellenen kişi "engellendiğini" öğrenmez; jenerik "mesaj gönderemezsiniz".
4. **Inbox soft-delete (G4)** — kullanıcı DM'i kendi listesinden temizler; **altdaki kayıt moderasyon için durur** (hard delete YOK).
5. **Minör varsayılan kısıtları** — minör profili keşfe kapalı varsayılan; yaş-kapılı kanal erişim guard'ı (hafif, ileriye dönük).

**Kapsam DIŞI (4B / sonraki):** Report + moderasyon kuyruğu + AuditLog + `contextSnapshot` (**4B, hukuki görüş sonrası**);
`adultsOnly` guild join kapısı (**T1 borcu → Sprint 7**, server ayarları + davet ile); medya policy enforcement (**Sprint 5**,
upload yok); üye-listesi tıkla-ekle yüzeyi (**Sprint 6**, presence; 4A'da tıkla yüzeyi = mesaj yazarı kartı); zengin profil
modalı (**profil sprint'i**, kartta "tam profil" → şimdilik minimal/stub); grup DM.

---

## 2. Prisma Modelleri (Sprint 4A deltası — KÜÇÜK; T&S alanları zaten mevcut)

> Şemada `isMinor`, `dmPolicy(FRIENDS)`, `mediaPolicy(FRIENDS)`, `profileDiscoverable`, `Channel.ageGated`, `Guild.adultsOnly`
> **zaten birinci sınıf var.** 4A yalnız bir alan ekler + bir varsayılanı minöre göre ayarlar. Migration additive.

```prisma
model ChannelMember {
  // ... mevcut alanlar değişmez ...
  clearedAt DateTime?   // G4: kullanıcı DM'i "inbox'tan temizledi" → bu kullanıcının görünümü clearedAt SONRASINI gösterir.
                        // Mesaj kaydı SİLİNMEZ (moderasyon/Report). Karşı taraf etkilenmez. Yeni mesaj gelince liste geri döner.
}
```

**Şema dışı (logic + migration) — minör profil varsayılanı:**
- `User.profileDiscoverable` şema varsayılanı `true` kalır; **register `isMinor=true` ise `false` set eder.** Migration:
  mevcut `isMinor=true` kullanıcılarda `profileDiscoverable=false` backfill. (Enforcement yüzeyi = keşif/arama; o gelene
  dek değer doğru durur — "T&S alanı birinci sınıf, enforce yüzey gelince".)
- `dmPolicy`/`mediaPolicy` minör varsayılanı **zaten `FRIENDS`** (yeterince kısıtlayıcı) → değişiklik yok.

> **Yeni alan/enum EKLENMEZ** (arkadaş-istek kapısı `isMinor` + method + ortak-ortamdan türetilir; yeni "friendRequestPolicy"
> alanı **bilinçli yapılmadı** — over-engineering'den kaçın, gerçek ayar ihtiyacı doğunca eklenir). Yetişkin "beni
> ortamdan ekleyemesinler" opt-out'u → **açık soru (§11), ertelendi.**

---

## 3. 🫀 FriendPermissionService.canSendFriendRequest — KARAR MATRİSİ (R7, brief §5.1.b)

`canSendFriendRequest(senderId, targetId, method): { allowed: boolean; reason?: string }`
`method ∈ { CODE, USER_CLICK }` — **sırayla:**

1. `senderId === targetId` → **deny** (`CANNOT_FRIEND_SELF`).
2. sender/target çek (`deletedAt: null`); biri yok → **deny** (`USER_NOT_FOUND`).
3. **Blok** (her iki yönde) → **deny (`USER_NOT_FOUND` — JENERİK, blok sızdırma; G3 ruhu).**
4. Zaten `ACCEPTED` arkadaş → **deny** (`ALREADY_FRIENDS`).
5. Bekleyen istek: karşıdan PENDING varsa → **otomatik ACCEPTED** (karşılıklı, mevcut davranış); aynı yönde PENDING → **deny** (`REQUEST_EXISTS`).
6. **method == `USER_CLICK`** (kod istemeden, karttan):
   - **Ortak ortam yoksa → deny (`USER_NOT_FOUND` jenerik).** (Yalnız aynı ortamı paylaştığını click-add edebilirsin.)
   - **sender VEYA target `isMinor` → deny (`USER_NOT_FOUND` jenerik) [G1].** Minör tıkla-ekle ile eklenemez/ekleyemez;
     statü **sızdırılmaz** (jenerik kod + buton UI'da gizlenmez, §9). Minörün eklenme yolu yalnız bilinçli friendCode.
   - İkisi de yetişkin + ortak ortam → **allow** → `PENDING` oluştur.
7. **method == `CODE`** (bilinçli paylaşım — minör dahil herkes):
   - **allow** → `PENDING` oluştur. (Minör kendi kodunu paylaştıysa = kendi iradesi, brief §5.1.)

> **İlke (G1):** "Çocuk ekliyorsa tanışmıştır" varsayımı REDDEDİLDİ (grooming vektörü). Koruma **görünmez** çalışır —
> jenerik hata, minör statüsü hiçbir yerde açığa çıkmaz. Tıkla-ekle sürtünmeyi düşürür → minör için kapatılır; friendCode
> sürtünmesi (gizli kod) minör için korunur. **Kapı yeri:** istek GÖNDERME. Kabul anında ek kontrol yok (kabul = alıcının iradesi).
> Frontend yalnız UX; karar burada (canDm ile simetrik tek otorite).

---

## 4. Sabitler & Config

- Arkadaş istek rate limit: `POST /friends/requests` (kod) **20/saat** (mevcut) · `POST /friends/requests/by-user` (click) **20/saat**.
- `canSendFriendRequest` yeni hesap kilidi **YOK** (kabul gerektirir + rate limit yeterli; canDm'deki `NEW_ACCOUNT_DM_LOCK` yalnız DM'e özgü). Açık soru §11.
- Yeni runtime bağımlılığı **YOK**.

---

## 5. DTO Şekilleri (paylaşılan)

```typescript
// Kullanıcı detay kartı (mesaj yazarına/avatarına tıkla → popover). "Keşif" değil — zaten görünen kişi.
interface UserProfileCardDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  friendStatus: 'none' | 'friends' | 'pending_in' | 'pending_out' | 'self';
  selfBlocked: boolean;   // YALNIZ "ben onu engelledim" (güvenli; "o beni engelledi" ASLA dönmez — G3)
}

// DmChannelDto'ya EK (G3 + G4):
interface DmChannelDto {
  id: string; otherUser: FriendCodeUserDto; lastMessage: MessageDto | null; unread: boolean;
  canMessage: boolean;    // false → textarea pasif
  selfBlocked: boolean;   // true → "Engeli kaldır" CTA; false+!canMessage → JENERİK "mesaj gönderemezsiniz" (sebep sızmaz)
}
```

> **Sızıntı kuralı (G3):** "karşı taraf beni engelledi" bilgisi DTO'da, hata kodunda, event'te **hiçbir yerde** dönmez.
> `canMessage=false` + `selfBlocked=false` → frontend jenerik metin (blok mu, gizlilik mi, silinmiş mi — ayırt edilemez).
> `canSendRequest` gibi bir alan **bilinçle YOK** (minör/engel durumunu önceden hesaplayıp dönmek statü sızdırır — buton
> her zaman görünür, karar sunucuda, ret jenerik).

---

## 6. HTTP Endpoint İmzaları

> Envelope `{ success, statusCode, data }`. Tümü (auth).

### Arkadaşlık (`/friends`)
- **POST `/friends/requests`** — Body `{ friendCode }` → `canSendFriendRequest(me, target, CODE)`. Mevcut davranış korunur,
  ama **blok artık `USER_NOT_FOUND` jenerik döner** (eski `403 BLOCKED` → G3). → `201 { data: FriendRequestDto | FriendDto }`.
- **POST `/friends/requests/by-user`** *(YENİ — G2 tıkla-ekle)* — Body `{ userId }` → `canSendFriendRequest(me, target, USER_CLICK)`.
  Ret → `404 USER_NOT_FOUND` (jenerik: yok / blok / minör / ortak-ortam yok — **ayırt edilemez**) · `409 ALREADY_FRIENDS`/`REQUEST_EXISTS`
  · `400 CANNOT_FRIEND_SELF`. İzinli → `201 { data: FriendRequestDto | FriendDto }`. **Rate limit 20/saat.**
- **GET `/users/:id/card`** *(YENİ — kullanıcı detay kartı)* → `UserProfileCardDto`. **Erişim:** yalnız çağıranla **ortak ortam**
  paylaşan VEYA arkadaş/bekleyen/blok ilişkisi olan kullanıcı; yoksa `404 USER_NOT_FOUND` (rastgele ID ile profil tarama yüzeyi açma).
- (Mevcut `GET /friends`, `/friends/requests`, accept/decline, `DELETE /friends/:userId` değişmez.)

### Engelleme (`/blocks`)
- Mevcut endpoint'ler değişmez. (Blok yan etkisi: arkadaşlık sil + bekleyen iptal — Sprint 3, korunur.)

### DM (`/dm`)
- **GET `/dm/channels`** → `DmChannelDto[]`; **`clearedAt` olan + sonrasında yeni mesaj OLMAYAN kanallar listede GÖSTERİLMEZ** (G4).
  `canMessage`/`selfBlocked` hesaplanır.
- **POST `/dm/channels`** — `canDm` (mevcut); **blok reddi artık `DM_NOT_ALLOWED` jenerik** (eski `BLOCKED` → G3).
- **DELETE `/dm/channels/:id`** *(YENİ — G4 inbox soft-delete)* → çağıranın `ChannelMember.clearedAt = now`. Mesaj **silinmez**;
  karşı taraf etkilenmez; kanal çağıranın listesinden düşer. → `200 { data: null }`. Üye değilse `403 NOT_CHANNEL_MEMBER`.
- **POST `/dm/channels/:id/read`** (mevcut) değişmez.
- DM mesaj geçmişi: **`findMessages` çağıranın `clearedAt`'inden SONRASINI döndürür** (G4 — kendi temizlediği geçmiş kendine kapalı;
  kayıt durur). Karşı tarafın görünümü tam.

---

## 7. Erişim Kontrolü Değişiklikleri (R7 — MembershipService + mesaj yolu)

- **G3 blok-obfuscation:** `requireNoDmBlock` artık `BLOCKED` yerine **jenerik `DM_NOT_ALLOWED`** fırlatır (mesaj: "Bu kullanıcıya
  mesaj gönderemezsiniz."). `dm.service`/`friends.service` blok dalları da jenerikleştirilir. **`BLOCKED` kodu istemciye dönen
  hiçbir yolda kalmaz** (iç loglar serbest).
- **Yaş-kapılı kanal guard (hafif, ileriye dönük):** `requireChannelAccess` — `channel.ageGated === true && user.isMinor` →
  `403 AGE_RESTRICTED`. (Henüz ageGated kanal **oluşturma yüzeyi yok** — Sprint 7; bu guard savunma-derinliği, ölü değil:
  alan set edilirse minör giremez.) Guild `adultsOnly` join kapısı **bu sprint DEĞİL** → T1 borcu/Sprint 7.
- **`selfBlocked` türetme:** DM DTO'ları için çağıran→karşı `UserBlock` var mı (tek yön) — güvenli, expose edilir.

---

## 8. WebSocket

- Mevcut `friend.request`/`friend.accept`/`friend.remove` (Sprint 3 R2) korunur. **Tıkla-ekle isteği de** `friend.request`
  event'ini addressee'ye yayar (aynı yol; method farkı backend'de kalır).
- **G4:** inbox temizleme yalnız çağıranı etkiler → **event YOK** (lokal). Yeni mesaj gelince kanal mevcut `message.created` ile geri döner.
- Yeni event/oda **YOK**.

---

## 9. UI Yerleşim (web) — frontend-only kısım

- **Kullanıcı detay kartı (G2):** mesaj yazarının **adına/avatarına tıkla → popover kart** (`GET /users/:id/card`):
  avatar + rumuz + aksiyon butonları. **`+user` ikonu** (kanka ekle) → `POST /friends/requests/by-user`; ret olursa **jenerik
  toast** ("İstek gönderilemedi.") — **minör/blok sebebi gösterilmez.** Buton `friendStatus==='none'` iken görünür (minöre
  göre gizlenmez → statü sızmaz). Rumuza tıkla → "tam profil" = **şimdilik minimal/stub** (zengin profil ayrı sprint).
  Diğer aksiyonlar `friendStatus`/`selfBlocked`'a göre: Mesaj / Arkadaşlıktan çıkar / Engelle / Engeli kaldır.
- **Engel UX (G3):** DM ekranında `canMessage===false` → **textarea pasif** + ekranda uyarı:
  `selfBlocked` → "Bu kullanıcıyı engellediniz. [Engeli kaldır]"; değilse → **jenerik** "Bu kullanıcıya mesaj gönderemezsiniz."
- **Inbox temizle (G4):** DM listesi satırında / sohbet başlığında "Sohbeti temizle" → `ConfirmDialog` → `DELETE /dm/channels/:id`;
  kanal listeden düşer, sohbet sıfırdan açılabilir. ("Sil" değil "temizle" dili — kayıt durduğu için dürüst.)
- Tüm metin `i18n/tr.json`; renk/şekil `--kv-*` token.

---

## 10. Hata Kodları — Sprint 4A

Yeni: `AGE_RESTRICTED` (403). Korunan: `USER_NOT_FOUND` (404, **artık blok/minör/yok için jenerik kapsayıcı**),
`CANNOT_FRIEND_SELF` (400), `ALREADY_FRIENDS`/`REQUEST_EXISTS` (409), `DM_NOT_ALLOWED` (403, **artık blok dahil jenerik**),
`NOT_CHANNEL_MEMBER` (403). **Kaldırılan (istemciye):** `BLOCKED` — artık hiçbir kullanıcı-görünür yolda dönmez (G3).

---

## 11. DoD & Açık Sorular

**DoD (Sprint 4A):**
- [ ] **`FriendPermissionService.canSendFriendRequest` (§3) birebir:** self/blok/zaten-arkadaş/bekleyen doğru; **USER_CLICK'te
      minör (her iki taraf) → jenerik ret**; ortak-ortam zorunlu; CODE yolu minör dahil açık.
- [ ] **Minör statüsü hiçbir yanıtta/event'te/UI'da sızmıyor** (jenerik kodlar; +user butonu minöre göre gizlenmiyor).
- [ ] Tıkla-ekle (`/friends/requests/by-user`) çalışır; kart `+user` → istek; ret jenerik toast.
- [ ] **G3:** engellenen kişi "engellendiğini" öğrenmez (`BLOCKED` istemciye dönmez); textarea pasif + jenerik metin;
      engelleyen taraf `selfBlocked` ile "Engeli kaldır" görür.
- [ ] **G4:** inbox soft-delete — kanal listeden düşer, geçmiş çağırana kapanır, **mesaj kaydı DB'de durur**, karşı taraf etkilenmez,
      yeni mesajda kanal geri döner.
- [ ] Minör `profileDiscoverable=false` (register + backfill); yaş-kapılı kanal guard (`ageGated && isMinor → 403`).
- [ ] Tüm metin i18n; envelope/Swagger güncel; migration additive (`clearedAt` + backfill).
- [ ] **R7:** `canSendFriendRequest` + blok-obfuscation + yaş-kapılı guard satır satır kullanıcı incelemesinden geçti.

**Açık sorular:**
- [x] ~~Yetişkin "beni ortamdan ekleyemesinler" opt-out ayarı~~ → **ERTELENDİ** (PM+kullanıcı 2026-06-12; gerçek talep doğunca, yeni alan yok).
- [x] ~~`canSendFriendRequest` yeni-hesap kilidi~~ → **rate limit yeterli** (PM+kullanıcı 2026-06-12; kabul gerektiren akış, mass-add nüansı kozmetik).
- [ ] `GET /users/:id/card` "ortak ortam" erişim kuralı yeterince dar mı (rastgele ID profil tarama yüzeyi)? → **R7 inceleme noktası** (dev uygular, PM+kullanıcı incelemede teyit eder).

**⚠️ Ertelenen doğrulama (test edilebilirlik):** 4A'nın T&S kapıları (`canSendFriendRequest`, `canDm`, blok-obfuscation, minör
ret) **birim testle** kapsanır; ama **uçtan-uca runtime testi** (gerçek kullanıcının ortak ortamda diğerini görüp kart açıp
ekle/DM denemesi) **2 hesap + ortak ortam akışı** gerektirir — ortam join/davet UI'ı henüz tam değil (Sprint 7 davet). Bu e2e
doğrulama o altyapı gelince yapılır (canDm dahil). Kod incelemesi (R7) bağımsızca tamamlanır; runtime e2e **gated**.

---

## 12. Bağımsızlık & Bağımlılık

- **Yeni runtime bağımlılığı YOK.** Migration additive (`ChannelMember.clearedAt` + minör `profileDiscoverable` backfill).
- Backend (api/) + frontend (web/) §3/§5/§6/§9 sözleşmesinden **paralel** ilerler; `canSendFriendRequest` matrisi (§3) ikisinin
  de referansı (frontend UX, backend otorite).
- **4B bağımlılığı:** Report/moderasyon/`contextSnapshot` **hukuki görüş sonrası** ayrı contract. 4A onu beklemez.
- **Sıralama kilidi (G1):** tıkla-ekle (§6) minör kapısı (§3.6) ile **aynı PR'da** gider — kapısız canlıya ALINMAZ.
