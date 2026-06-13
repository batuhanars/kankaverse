# Sprint 6 Contract — Presence + Yazıyor Göstergesi + Bildirimler

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. Brief V1 kapsamı: "Discord hissinin asgarisi".
>
> **⚠️ GECE OTONOM DURUMU (2026-06-12/13):** Bu contract gece otonom yazıldı. **6.1 (yazıyor göstergesi) gece ship
> edildi** (T&S-nötr). **6.2 (presence görünürlük politikası) proje sahibi tarafından KİLİTLENDİ (2026-06-13, Seçenek A
> — minör presence yalnız arkadaşlara, yetişkin gizlemesiz; bkz. §3).** **6.3 (bildirim kapsamı + kalıcılık) hâlâ
> sahip kararını bekler (§4, §6).**

---

## 1. Hedef & Parçalama

V1'in "canlılık" katmanı. **Üç bağımsız parça, farklı T&S profili:**

| Parça | Ne | T&S profili | Gece durumu |
|---|---|---|---|
| **6.1 Yazıyor göstergesi** | "X yazıyor…" kanal/DM içinde | **Nötr** — görünürlük zaten kanal erişimiyle sınırlı, yeni yüzey açmaz | ✅ **SHIP** |
| **6.2 Presence** | çevrimiçi/boşta/DnD/çevrimdışı | **T&S-hassas** — minör çevrimiçi durumu = zamanlamaya dayalı hedefleme yüzeyi | ✅ **politika KİLİTLİ (Seçenek A, 2026-06-13)** — uygulama bekliyor |
| **6.3 Bildirimler** | bell → bildirim feed | Kapsam + kalıcılık modeli kararı gerekir | ⏳ **kapsam AÇIK (sabah)** |

---

## 2. 6.1 — Yazıyor Göstergesi (SHIP edilebilir, T&S-nötr)

**Tasarım — saf ephemeral WS, sıfır DB, sıfır kalıcılık:**
- İstemci yazarken `typing:start { channelId }` emit eder (debounce: ~3sn'de bir, yazdıkça yeniler).
- Gateway: **`requireChannelAccess` ile kanal erişimini doğrula** (DM'de ChannelMember, guild'de üyelik — mevcut R7 kapısı yeniden kullanılır; yeni T&S yüzeyi YOK), sonra `room:<channelId>`'ye `typing:update { userId, username }` yayar (emit eden hariç).
- İstemci tarafı: ~4-5sn timeout ile "X yazıyor…" gösterir; `typing:stop` veya mesaj gelince temizler.
- **Kalıcılık YOK, Redis kaydı YOK, şema değişikliği YOK** — tamamen anlık. Bağlantı koparsa timeout temizler.

**Sınır:** typing yalnız o kanala erişimi olanlara gider (erişim kontrolü zaten R7 ile çözülü). Minör görünürlüğü ek yüzey açmaz — yazıyor bilgisi yalnız mesajlaşabildiğin kanalda görünür (DM'de canDm zaten geçilmiş, guild'de zaten üyesin). **Bu yüzden 6.1 gece ship edilebilir.**

### 6.1 İş Kalemleri
**Backend (`api/`):**
- [ ] Gateway: `@SubscribeMessage('typing:start')` + `typing:stop` → `requireChannelAccess` doğrula → `room:<channelId>`'ye `typing:update`/`typing:clear` yay (emit eden hariç, `socket.to(room)`)
- [ ] Hata → WS ack `{ ok:false }`; erişim yoksa sessiz drop (yaymadan)
- [ ] Yeni DB/şema YOK; yeni bağımlılık YOK

**Frontend (`web/`):**
- [ ] `useSocket`/typing composable: input'ta debounce `typing:start`; durunca/gönderince `typing:stop`
- [ ] `typing:update` dinle → kanal başına "X yazıyor…" (çoklu kullanıcı: "X ve Y yazıyor…"); timeout temizleme
- [ ] DM (`DmConversation`) + guild (`MessageArea`) mesaj alanında göster; metin `tr.json`

### 6.1 DoD
- [ ] Yazınca karşı taraf "yazıyor" görür; durunca/gönderince kalkar; timeout güvenli
- [ ] Erişimsiz kanala typing yayılmaz (requireChannelAccess); sıfır DB/şema; regresyon yok

---

## 3. 6.2 — Presence (✅ POLİTİKA KİLİTLİ — Seçenek A, 2026-06-13)

> **KİLİTLİ KARAR (proje sahibi, 2026-06-13):** Minör kullanıcının çevrimiçi durumu **yalnızca ekli olduğu kişilere
> (arkadaşlarına)** gösterilir. Yetişkin birey için **hiçbir gizleme uygulanmaz** (arkadaş + ortak-ortam üyelerine
> görünür). Bu, contract'ın **Seçenek A**'sıdır. **R7 kapsamındadır** — minör görünürlük filtresi bir T&S karar
> yüzeyidir, satır-satır insan incelemesi gerekir (çocuk güvenliği = hata bedeli).

**Teknik iskelet:**
- **Ephemeral, bellek-içi (V1 tek-instance — PM kararı 2026-06-13):** presence durumu `PresenceService` içinde
  bellek-içi tutulur (kullanıcı başına bağlantı sayacı + durum). **Şema/migration YOK.** Socket.IO Redis adapter
  yayını (`emitToUser` → `user:<id>` odası) zaten instance'lar arası dağıtır; çok-instance'a geçilince yalnız
  bağlantı sayacı Redis'e taşınır (gelecek borç, bugün gerekmez — over-engineering yapma).
- Bağlantı = online; disconnect (son bağlantı) → offline; çok-sekme = sayaç>0 iken online kalır.
- Durumlar: `online` · `away` (istemci idle bildirir) · `dnd` (kullanıcı seçer) · `offline`.

**Görünürlük kuralı (KİLİTLİ — outbound, yani kimin presence'ı kime SIZAR):**
- **Minör (`isMinor=true`):** presence yalnız **karşılıklı arkadaşlara** yayılır (`user:<friendId>` odaları). Ortak
  ortam (paylaşılan guild) üyelerine **YAYILMAZ** — yabancıya/ortaktaki yabancıya minör çevrimiçiliği sızmaz.
- **Yetişkin (`isMinor=false`):** presence arkadaşlara **VE** ortak-ortam üyelerine yayılır (gizleme yok).
- **Çekirdek invariant:** bir minörün çevrimiçi/away/dnd durumu **arkadaş olmayan hiç kimseye** ulaşmaz — yayın
  hedef listesi sunucuda hesaplanır, istemci filtresine güvenilmez. Fail-closed: ilişki belirsizse yayma.

> **Uygulama yönlendirmesi (over-engineering yapma):** presence değişiminde alıcı kümesi = arkadaşların `user:<id>`
> odaları; yetişkinse ek olarak ortak guild üyeleri. Mevcut `RealtimeService.emitToUser` (Sprint 3 R2) yeniden
> kullanılır. Per-recipient pahalı fan-out tasarımına girme — arkadaş + guild-üye odaları yeter. Sapma hissi → dur, PM.

### 6.2 İş Kalemleri

**Backend (`api/`):**
- [ ] Gateway: handshake'te bağlantı → presence `online`; disconnect → `offline` (heartbeat/away idle eşiği)
- [ ] `PresenceService` (Redis): kullanıcı durumu set/get; `dnd` kullanıcı-seçimli (REST veya WS ile set)
- [ ] **Görünürlük filtresi (R7):** presence yayını — `isMinor` ise yalnız karşılıklı arkadaşlara; değilse arkadaş +
      ortak-ortam üyeleri. Hedef kümesi sunucuda hesaplanır (fail-closed). `RealtimeService.emitToUser` üzerinden
- [ ] İlk bağlanışta istemciye görünür kişilerin mevcut presence snapshot'ı (yalnız görme izni olanlar)

**Frontend (`web/`):**
- [ ] Arkadaş listesi / DM listesi / ortam üye panelinde durum noktası (yeşil/sarı/kırmızı/gri) — yalnız gelen veriden
- [ ] Kullanıcı `dnd`/online seçimi (UserCard popover veya ayar); durum metni `tr.json`
- [ ] Presence event dinleme (`useSocket`) → ilgili store'lar reaktif güncellenir

### 6.2 DoD
- [ ] Minör presence yalnız arkadaşa ulaşır; ortak-ortamdaki yabancıya **SIZMAZ** (sunucu-tarafı hedef listesi testi)
- [ ] Yetişkin presence arkadaş + ortak-ortam üyesine görünür; gizleme yok
- [ ] Ephemeral (sıfır şema/migration); disconnect → offline; regresyon yok
- [ ] **R7:** görünürlük filtresi (minör hedef-liste mantığı) satır-satır incelendi

---

## 4. 6.3 — Bildirimler (✅ KAPSAM KİLİTLİ — Minimal/anlık, 2026-06-13)

> **KİLİTLİ KARAR (proje sahibi, 2026-06-13):** Bell paneli yalnız **mevcut** `friend.request`/`friend.accept`/
> `friend.remove` event'lerini **anlık** gösterir. **Kalıcılık YOK · yeni `Notification` modeli YOK · şema değişikliği
> YOK · mention-parse YOK · DM-mesaj bildirimi YOK.** Yalnızca zaten yayılan event'leri bell'e düşürür — yeni T&S
> yüzeyi açmaz, R7-nötr. DM/mention/kalıcı feed → **V1 sonrası** (gerekince ayrı karar).

**Tasarım — saf ephemeral, oturum-içi:**
- `useSocket` zaten `friend.*` event'lerini dinliyor (Sprint 3 R2). Bunlar bir bildirim store'una düşer.
- Bell ikonu (redesign'da stub) → açılır panel: oturum boyunca biriken arkadaş-event listesi + okunmamış sayacı.
- Sayfa yenilenince liste sıfırlanır (kalıcılık yok — bilinçli, V1 minimal). Yeni şema/migration/endpoint YOK.

### 6.3 İş Kalemleri

**Frontend (`web/`) — backend DOKUNULMAZ (sıfır şema/endpoint):**
- [ ] `notifications` store (Pinia): oturum-içi `friend.request`/`accept`/`remove` event'lerini biriktir + okunmamış sayaç
- [ ] Bell stub'ını bağla: tıkla → panel (event listesi); açınca okunmuş işaretle; sayaç rozeti
- [ ] Tüm metin `tr.json`; renk/şekil `--kv-*` token

### 6.3 DoD
- [ ] Arkadaş isteği/kabul/kaldırma bell'e anlık düşer; okunmamış sayacı çalışır
- [ ] Sıfır backend (yeni şema/endpoint/migration yok); yenilemede sıfırlanır (kalıcılık yok); regresyon yok

---

## 4.5. Revizyon R1 — Proje sahibi feedback (2026-06-13, uygulama testi sonrası)

> Sahip 6.1/6.2'yi test etti, R7'yi imzaladı. Üç düzeltme talebi — **scope creep DEĞİL** (sahip talebi, PM onaylı).
> Frontend + küçük backend (DM typing yayını). Yeni T&S yüzeyi yok (typing zaten kanal erişimiyle sınırlı), R7-nötr.

1. **R1-a — Kankalar listesinde presence (6.2 tamamlama):** `FriendsRightPanel.vue` sabit "çevrimdışı" gösteriyordu
   (presence'a hiç bağlı değildi; dot yanlışlıkla yalnız eski `FriendsPanel.vue`'ye eklenmiş). Sağ Kanka listesinde
   her arkadaşın **gerçek durumu** (PresenceDot + durum metni) gösterilir; çevrimiçi/çevrimdışı grupla (Discord-benzeri başlık).
2. **R1-b — DM kutucuğunda "yazıyor" (6.1 yüzey genişletme, WhatsApp-benzeri):** Kullanıcı DM'in İÇİNDE olmasa bile,
   soldaki DM listesinde ilgili kutucukta "yazıyor…" görünür (son-mesaj önizlemesinin yerine, vurgu renkli).
   **Backend gereği:** DM kanalında (`guildId=null`) typing, karşı üyenin `user:<id>` odasına yayılır (kullanıcı her
   zaman kendi odasında) — yalnız `room:<channelId>` yayını bakmayan alıcıya ulaşmıyordu. Guild kanalında mevcut
   room-yayını korunur. requireChannelAccess kapısı aynı (erişim sınırı değişmez).
3. **R1-c — Typing ibare ayrımı:** **1-1 DM** → isimsiz sade **"yazıyor…"** (kutucukta + sohbet içinde; kutucukta zaten
   ad var, isim tekrarı gereksiz). **Guild kanalı (ve ileride grup DM)** → isimli **"X yazıyor…" / "X ve Y yazıyor…"**
   (çok kişi konuşurken kim yazdığı önemli). `useTypingLabel` mod parametresi alır (sade | isimli).

## 5. Bağımsızlık & Bağımlılık

- **6.1 bağımsız + şema-sız + R7-nötr** → ship edildi.
- **6.2 politika KİLİTLİ (Seçenek A)** → uygulanabilir; görünürlük filtresi R7 incelemesine tabi.
- **6.3 sahip kararına bağlı** → kapsam/kalıcılık kararı verilene dek bell stub kalır.
- Yeni runtime bağımlılığı YOK (Socket.IO + Redis mevcut). Presence ephemeral → DB temiz.

## 6. Açık Sorular
- [x] **6.2 presence görünürlük politikası** → **KİLİTLENDİ Seçenek A** (minör yalnız arkadaş; yetişkin gizlemesiz), 2026-06-13.
- [ ] **6.3 bildirim kapsamı** (hangi olaylar) + **kalıcılık** (Notification modeli mi, anlık mı)? → sahip kararı bekliyor.
- [ ] `dnd` (rahatsız etme) bildirimleri de susturur mu, yalnız görünürlük mü? → 6.3 ile birlikte.
