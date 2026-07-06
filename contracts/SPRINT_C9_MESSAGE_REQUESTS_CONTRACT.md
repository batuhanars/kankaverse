# SPRINT C9 — Mesaj İstekleri (arkadaş-olmayan DM onay süzgeci) + dmPolicy yeniden tanımı

> Durum: **TASARIM KİLİTLİ (2026-07-06).** PM compose (Opus). Sahip kararı: arkadaş olmayan DM'ler direkt
> inbox yerine "Mesaj İstekleri" kutusundan geçer; alıcı kabul/reddet eder.
> Precedent: `dm-permission.service.ts` `canDm` (R7 DM karar fonksiyonu) + `friends` istek/kabul deseni +
> `blocks` modülü + ana ekran DM listesi (`HomeDashboard`/`DmProfilePanel`).
> **🔴 R7 kapsamı:** `canDm` (tek DM T&S otoritesi) DEĞİŞİYOR → satır satır insan incelemesi. Dev diff'i sahibe onaya sunar.

---

## §0 — Kapsam ve KRİTİK Karar (T&S)

**IN:** Arkadaş olmayan iki **yetişkin** arasında (alıcının `dmPolicy=EVERYONE`) başlatılan 1-1 DM, alıcının
DM listesine **direkt düşmez**; alıcının "Mesaj İstekleri" kutusuna **PENDING** olarak girer. Alıcı ilk mesajı
görür, **kabul** (mesajlaşma başlar) veya **reddet** (opsiyonel engelle) eder. Ana ekranda DM listesinin üstünde
**"Mesaj İstekleri"** sekmesi (sessiz rozet). Ayrıca `dmPolicy` üç seçeneğinin anlamı netleştirilir (§2).

**🔴 KİLİTLİ KARAR — T&S (neden bu özellik çocuk-güvenliğini ZAYIFLATMAZ):**
- `canDm` kural 4a bugün **arkadaş değil + taraflardan biri minör → kesin red**. Yani yabancı bir minöre zaten
  bugün cold-DM atamıyor; **hiç kanal/istek oluşmaz**. Mesaj isteği yalnızca **şu an zaten `allowed:true` dönen**
  yetişkin↔yetişkin (EVERYONE) yoluna **sürtünme ekler** — yeni erişim sınıfı açmaz, açık olanı daraltır.
- Sonuç: bugün EVERYONE = yabancı direkt DM'ine düşüyor → istekle = yabancı alıcının kontrol ettiği kutuya düşüyor.
  **Saf iyileşme.** İstek yolu **yalnız yetişkin↔yetişkin**tir (minör hiçbir zaman istek gönderemez/alamaz).
- Telafi kontrolleri (bu sprintin bedeli, es geçilemez): (1) **kabule kadar tek mesaj** (önizleme = saldırı
  yüzeyi, sınırla); (2) **sessiz bildirim** (istek push atmaz); (3) reddet → opsiyonel `UserBlock`; (4) gönderene
  **yok-sayıldı/reddedildi sızmaz** (yalnız "gönderildi").

**dmPolicy yeniden tanımı (sahip kararı 2026-07-06 — §2'de enforce):**
- **EVERYONE** — yabancı **direkt atamaz**; onay süzgecinden (mesaj isteği) geçer.
- **FRIENDS** — yalnız kankalar. Yabancı **istek bile atamaz**. (Bugünkü "ortak sunucu yabancısı → direkt DM"
  sızıntısı KAPANIR — sıkılaştırma/güvenlik artısı.)
- **NONE** — kanka **dahil** kimse atamaz (geçici DM karartması / "her şeyi sessize alma"). Bugün kanka kontrolü
  (kural 3) dmPolicy'yi geçiyor; NONE artık **arkadaşlığı da ezer**.

**OUT (bilinçli ertelenen):** grup DM (`GROUP_DM`) istekleri — yalnız 1-1 · mesaj isteğinde ek/medya (ilk mesaj
yalnız **metin**) · sesli/görüntülü istek (PENDING kanalda arama YOK — `canDm`/voice zaten kapıda) · gönderene
okundu/görüldü bilgisi · istek için ayrı bildirim tercihi makinesi (yalnız sessiz rozet).

---

## §1 — Veri Modeli (Prisma)

Şema değişikliği (additive):
- `enum DmRequestStatus { PENDING ACCEPTED }`.
- `Channel` (yalnız `type=DM` için anlamlı) **+**:
  - `dmRequestStatus DmRequestStatus?` — `null` = normal/legacy kanal (**geriye uyum: mevcut tüm DM'ler kabul
    edilmiş sayılır**). `PENDING` = istek bekliyor. `ACCEPTED` = kabul edildi.
  - `dmRequesterId String?` — isteği başlatan (yalnız PENDING/ACCEPTED-via-request'te dolu). GROUP_DM/guild = null.

**Migration üretilir + DB'ye uygulanır** (`prisma migrate status` temiz — mock Prisma build/test yakalamaz).

---

## §2 — Backend: `canDm` değişikliği (R7 çekirdeği)

`CanDmResult` **+ `asRequest?: boolean`**. Yeni kural sırası (`dm-permission.service.ts`):

1. Kendi kendine → deny `CANNOT_DM_SELF`.
2. Sender aktif global ban → deny `DM_NOT_ALLOWED`.
3. Blok (her iki yön) → deny `DM_NOT_ALLOWED` (mevcut jenerik).
4. **YENİ — `target.dmPolicy === NONE` → deny `DM_NOT_ALLOWED`** (arkadaşlıktan ÖNCE; kanka dahil herkesi keser).
5. Arkadaş (ACCEPTED) → allow (direkt; `asRequest=false`). [minör + arkadaş = izinli, değişmedi]
6. Arkadaş değil:
   - 6a. sender VEYA target `isMinor` → deny `DM_NOT_ALLOWED` (değişmedi — istek yolu minöre KAPALI).
   - 6b. yeni hesap kilidi (`NEW_ACCOUNT_DM_LOCK`) → deny (değişmedi).
   - 6c. İkisi de yetişkin + yerleşik → `target.dmPolicy`:
     - `EVERYONE` → **allow + `asRequest=true`** (direkt değil, istek).
     - `FRIENDS` → **deny `DM_NOT_ALLOWED`** (ortak-sunucu yolu KALDIRILDI; yalnız kanka).
     - `NONE` → (kural 4'te zaten kesildi).

**`dm.service` `openDmChannel` (mevcut `canDm` çağrısı, ~171):**
- `allowed=false` → mevcut davranış (403 + reason).
- `allowed && !asRequest` → mevcut davranış (normal DM kanalı; `dmRequestStatus=null`).
- `allowed && asRequest`:
  - Mevcut **ACCEPTED/legacy** 1-1 kanal varsa → onu döndür (istek değil; zaten rızalı).
  - Mevcut **PENDING** kanal varsa (aynı requester) → onu döndür; requester **ilk mesaj hariç yeni mesaj YAZAMAZ**
    (`MESSAGE_REQUEST_PENDING` — kabule dek tek mesaj).
  - Yoksa → kanal **PENDING** oluştur, `dmRequesterId=sender`. İlk mesaj gönderilir; sonrası kabule dek kilitli.

**Kabul/Reddet:**
- Kabul → `dmRequestStatus=ACCEPTED`; her iki tarafın normal DM listesine girer; requester artık serbest yazar.
  (Alıcının PENDING kanala **cevap yazması = örtük kabul** — aynı yola bağlanır.)
- Reddet → kanal **silinir** (soft/hard — mevcut DM silme deseni); `block=true` ise `UserBlock` oluşturulur
  (bloklu tekrar istek atamaz, kural 3). Gönderene özel bildirim GİTMEZ (sızıntı yok).

**🔴 R7 — friend-permission etkileşimi (es geçilemez):** `friend-permission.service.ts:117` `hasExistingDmChannel`
"mevcut 1-1 DM = önceki rızalı temas" sayıp kanka-ekleme kapısını açıyor. **PENDING kanal rıza DEĞİLDİR** →
`hasExistingDmChannel` (ve "önceki temas" sayan her yer) **PENDING kanalı HARİÇ tutar** (yalnız `dmRequestStatus`
`null` veya `ACCEPTED` sayılır). Minör tarafı zaten güvenli (istek minöre açılmaz), bu madde yetişkin
cold-friend-add vektörünü kapatır.

**Diğer `canDm` çağıranları:** `messages.gateway.ts:326` + `voice.service.ts:766` (sesli/görüntülü arama) —
`asRequest=true` → **arama reddedilir** (PENDING kanalda çağrı yok; kabul sonrası açılır). Blok/ban davranışı değişmez.

**Bildirim:** PENDING istek → normal DM push/okunmamış üretmez; yalnız "Mesaj İstekleri" sekmesinde sessiz sayaç.

---

## §3 — Backend: endpoint'ler (envelope her yerde)

- `GET /dm/requests` → PENDING istek listesi: `{ channelId, requester: {id, username, avatarUrl}, preview: ilk
  mesaj (metin, kırpılmış), createdAt }[]`. Yalnız `dmRequesterId != me` olanlar (bana gelen istekler).
- `POST /dm/requests/:channelId/accept` → `ACCEPTED`; güncel DM kanalı DTO'su. (Alıcı değilse/PENDING değilse 403/404.)
- `POST /dm/requests/:channelId/reject` `{ block?: boolean }` → kanal silinir (+opsiyonel `UserBlock`); `null` data.
- Mevcut **DM aç** endpoint'i (`POST /dm` veya eşdeğeri): `asRequest` yolunda 200 döner ama kanal PENDING
  (gönderen perspektifi: "istek gönderildi"). Yeni hata kodları: `MESSAGE_REQUEST_PENDING` (kabule dek 2. mesaj).
- Guard'lar: hepsi `JwtAuthGuard`; istek listesi/kabul/reddet yalnız **alıcı** (requester değil).

---

## §4 — Frontend (`web/`)

1. **Ana ekran DM listesi üstünde "Mesaj İstekleri" satırı/sekmesi** (`HomeDashboard`/DM sidebar, "DİREKT
   MESAJLAR" başlığının ÜSTÜNDE) — sessiz rozet (PENDING sayısı; kırmızı-ping DEĞİL, nötr sayaç). 0 ise satır
   gizli/pasif (placeholder şişirme yok). Tıklayınca **orta panelde** istek gönderen kişilerin listesi açılır.
   **🔴 Kanka isteğinden AYRIDIR** — sağ sidebar'daki kankalar panelinin "Bekleyen" sekmesiyle KARIŞTIRILMAZ,
   oraya KONMAZ (farklı olay: DM isteği ≠ arkadaşlık isteği).
2. **İstek listesi görünümü:** gönderen kartı (avatar + kullanıcı adı) + ilk mesaj önizleme + zaman.
3. **İstek detayı:** ilk mesajı gör → **Kabul Et** / **Reddet** / **Reddet + Engelle**. Kabul → normal DM'e geçer
   (route DM'e). Reddet → listeden düşer.
4. **Gönderen tarafı:** arkadaş olmayana DM açınca "İstek gönderildi" durumu; okundu/yok-sayıldı GÖSTERİLMEZ.
   `MESSAGE_REQUEST_PENDING` → "kabul bekleniyor, tek mesaj" bilgisi.
5. **Gizlilik sekmesi (`UserSettingsView`):** üç `dmPolicy` seçeneğinin **yeni anlamı** i18n metinlerinde net
   yazılır (EVERYONE=istekle, FRIENDS=sadece kanka, NONE=kanka dahil kapalı/DM karartma).
6. **i18n + token:** tüm string `tr.json` (`messageRequests.*`, hata kodları); ölçü/renk `--kv-*`.

---

## §5 — DoD

- [ ] Şema: `DmRequestStatus` enum + `Channel.dmRequestStatus?` + `Channel.dmRequesterId?`; migration üretildi **ve
      DB'ye uygulandı** (`prisma migrate status` temiz)
- [ ] **R7 — `canDm`:** NONE friendship'ten önce (kanka dahil red) · non-friend EVERYONE → `asRequest` · FRIENDS
      non-friend → deny (ortak-sunucu yolu kaldırıldı) · minör 4a değişmedi · `asRequest` dönüşü
- [ ] `dm.service` routing: `asRequest` → PENDING kanal + `dmRequesterId`; kabule dek requester tek mesaj
      (`MESSAGE_REQUEST_PENDING`); ACCEPTED/legacy kanal etkilenmez
- [ ] **R7 — friend-permission:** PENDING kanal "rızalı temas" SAYILMAZ (`hasExistingDmChannel` hariç tutar)
- [ ] Kabul/Reddet endpoint'leri (alıcı-gated) + reddet-opsiyonel-blok; alıcı cevabı = örtük kabul
- [ ] voice/gateway `canDm` çağıranları: `asRequest` → arama reddedilir (PENDING'de çağrı yok)
- [ ] Bildirim: PENDING istek push/okunmamış üretmez; sessiz sekme sayacı
- [ ] Web: "Mesaj İstekleri" sekmesi + liste + detay (kabul/reddet/engelle); gönderen "gönderildi" (sızıntı yok);
      gizlilik metinleri güncellendi; i18n + token; placeholder şişirme yok
- [ ] Migration/geriye uyum: mevcut DM kanalları `dmRequestStatus=null` → kabul edilmiş davranır
- [ ] `nest build` + `vue-tsc`(mevcut auth.ts hariç) + `vite build` temiz; birim test (canDm: NONE-kanka-red +
      EVERYONE-asRequest + FRIENDS-non-friend-red + minör-4a; dm.service PENDING + tek-mesaj; friend-permission
      PENDING-hariç; kabul/reddet)
- [ ] **R7 insan incelemesi:** `canDm` + friend-permission + PENDING routing diff'i sahibe sunuldu
- [ ] Sahip canlı test: EVERYONE yabancı DM → istek kutusu; kabul → mesajlaşma; reddet+engelle; FRIENDS yabancı →
      atamaz; NONE → kanka dahil atamaz; minör → istek yok (regresyon)

---

## §6 — Sapma Kuralı

Şu ihtiyaçlar → **DUR, PM'e dön:** (a) grup DM (`GROUP_DM`) isteğe açma; (b) mesaj isteğinde ek/medya/çağrı;
(c) minör tarafını istek yoluna dahil etme (KİLİTLİ karara aykırı — istek yalnız yetişkin↔yetişkin); (d) gönderene
okundu/yok-sayıldı sinyali sızdırma; (e) `canDm`'i bu sözleşmedeki sıradan farklı kurgulama. `canDm` = tek DM T&S
otoritesi; her değişiklik R7.
