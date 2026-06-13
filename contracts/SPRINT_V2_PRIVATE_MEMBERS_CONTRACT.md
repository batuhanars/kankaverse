# Sprint V2 — Özel Kanal Üye Yönetimi Sözleşmesi

> Kök + tier `CLAUDE.md`. **Tek doğruluk kaynağı bu dosya.** Sapma → DUR, PM'e dön. Envelope `{ success, statusCode, data }`.
> İlgili: `channels.service.ts`/`channels.controller.ts`, `membership.service.ts` (`requireChannelAccess` özel dal
> zaten `ChannelMember` bakıyor), frontend kanal ayarları modal. **R7:** erişim-veren işlem (üye ekleme).

Amaç: OWNER/ADMIN, bir **özel guild kanalına** belirli guild üyelerini ekleyip çıkarabilsin. `requireChannelAccess`
özel dalı zaten `ChannelMember`'a bakıyor (Sprint V2 isPrivate) — bu sözleşme o member kayıtlarını **yönetir**.

---

## 1. Endpoint'ler (hepsi OWNER/ADMIN — `requireGuildMembership` + `requireAdminRole`)

| Metot | Yol | Davranış |
|---|---|---|
| `GET` | `/channels/:id/members` | Kanalın **açıkça eklenmiş** üyeleri (`ChannelMember`) + her birinin `{ id, username, avatarUrl }`. Yalnız guild **özel** kanalı için anlamlı; genel/guild-olmayan kanalda boş/`[]` veya `400 NOT_PRIVATE_CHANNEL` (tercihini raporla — öneri: özel değilse boş `[]` + not). OWNER/ADMIN'in rolle eriştiği not edilir (UI gösterir). |
| `POST` | `/channels/:id/members` | `{ userId }` → kanala üye ekle (`ChannelMember` create, idempotent upsert). Doğrulama: kanal **guild + isPrivate** (değilse `400 NOT_PRIVATE_CHANNEL`); `userId` **guild üyesi** (değilse `400 NOT_GUILD_MEMBER`); kanal `ageGated`∨guild `adultsOnly` ise hedef **minör OLAMAZ** (`400 AGE_RESTRICTED` — yaş kapısıyla tutarlı). Dönüş: eklenen üye DTO `{ id, username, avatarUrl }`. |
| `DELETE` | `/channels/:id/members/:userId` | Üyeyi çıkar (`ChannelMember` deleteMany; yoksa no-op). Dönüş `null`. (OWNER/ADMIN kendini çıkaramaz-zorunlu değil; rolle zaten erişir.) |

- Yetki: üçü de OWNER/ADMIN. `requireAdminRole` paylaşılan util.
- Idempotent: zaten üye → POST no-op (mevcut kaydı döndür); üye değil → DELETE no-op.

---

## 2. T&S / R7 + sızıntı önleme (KRİTİK)

- **Erişim mantığı `requireChannelAccess`'te değişmez** (zaten isPrivate + ChannelMember bakıyor). Bu sözleşme yalnız
  member kayıtlarını yönetir; access fonksiyonuna dokunma.
- **Yaş kapısı tutarlılığı:** age-restricted özel kanala minör eklenemez (POST guard). Eklense bile access yaş
  kapısından geçemezdi; yine de eklemeyi reddet (kafa karışıklığı + ilke).
- **ChannelMember ÇİFT-KULLANIM riski:** `ChannelMember` şu ana dek DM/grup üyeliği içindi. Guild özel kanalına
  `ChannelMember` eklemek **DM listelerine / dm akışlarına SIZMAMALI.** Dev: DM listesi/`dm` modülü ve
  `notifyDmActivity`/typing gibi `ChannelMember` kullanan sorguların **kanal türüne** (`DM`/`GROUP_DM`) göre
  filtrelendiğini DOĞRULA; guild kanalı (`guildId != null` / type `GUILD_TEXT`) bu sorgulara karışmamalı. Karışıyorsa
  ilgili sorgulara tür/`guildId` filtresi ekle (bunu raporla). **Bu, sözleşmenin en kritik maddesi.**

---

## 3. Frontend — kanal ayarları modal

- Mevcut **kanal ayarları** (gear) modalında, kanal **özel** ise (OWNER/ADMIN'e) bir **"Üyeler"** bölümü:
  - Mevcut üyeleri listele (`GET members`) — avatar (daire) + ad + **çıkar (×)** butonu. "OWNER/ADMIN zaten erişir" notu.
  - **Üye ekle:** guild üyeleri arasından (henüz ekli olmayan) seçici (arama/filtre); seç → `POST members`. Yaş-kapılı
    kanalda minör seçenekte gösterilmez/eklenemez (backend zaten reddeder; UX için filtrele).
- Genel (özel olmayan) kanalda bu bölüm GÖSTERİLMEZ.
- Üye ekleme/çıkarma sonrası liste tazelenir. `--kv-*` token, gölge yok.
- **i18n:** yeni string `tr.json` ("Üyeler", "Üye ekle", "Çıkar", "Bu kanala yalnızca eklenen kişiler erişir", hata kodları).

---

## 4. Kabul kriterleri

- [ ] 3 endpoint (GET/POST/DELETE members); OWNER/ADMIN; NOT_PRIVATE_CHANNEL / NOT_GUILD_MEMBER / AGE_RESTRICTED guard; idempotent.
- [ ] **ChannelMember çift-kullanım doğrulaması:** guild özel kanal üyesi DM listelerine sızmıyor (rapor + gerekirse filtre).
- [ ] Frontend: kanal ayarlarında özel-kanal Üyeler bölümü (listele/ekle/çıkar), minör yaş-kapılı filtre, genel kanalda gizli.
- [ ] Backend testleri: ekle/çıkar/idempotent · yetki (MEMBER 403) · NOT_PRIVATE · NOT_GUILD_MEMBER · minör+yaş-kapılı reddi · DM-sızıntı yok (tür filtre testi).
- [ ] `api`+`web` build TEMİZ; testler yeşil; **`migrate status` temiz** (şema değişmiyorsa migration yok).

## 5. Kapsam dışı
- Toplu ekleme/rol-bazlı erişim · özel kanal davet linki · üye ekleme bildirimi. Sonraki dalga.
