# Sprint 6 Contract — Presence + Yazıyor Göstergesi + Bildirimler

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + tier `CLAUDE.md` geçerli. Brief V1 kapsamı: "Discord hissinin asgarisi".
>
> **⚠️ GECE OTONOM DURUMU (2026-06-12/13):** Bu contract gece otonom yazıldı. **Üç parçadan yalnız 6.1 (yazıyor
> göstergesi) gece ship edilebilir** (T&S-nötr). **6.2 (presence görünürlük politikası) ve 6.3 (bildirim kapsamı)
> proje sahibinin sabah kararını bekler — minör görünürlüğü tek başına kilitlenmez (kurul kararı).**

---

## 1. Hedef & Parçalama

V1'in "canlılık" katmanı. **Üç bağımsız parça, farklı T&S profili:**

| Parça | Ne | T&S profili | Gece durumu |
|---|---|---|---|
| **6.1 Yazıyor göstergesi** | "X yazıyor…" kanal/DM içinde | **Nötr** — görünürlük zaten kanal erişimiyle sınırlı, yeni yüzey açmaz | ✅ **SHIP** |
| **6.2 Presence** | çevrimiçi/boşta/DnD/çevrimdışı | **T&S-hassas** — minör çevrimiçi durumu = zamanlamaya dayalı hedefleme yüzeyi | ⏳ **görünürlük politikası AÇIK (sabah)** |
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

## 3. 6.2 — Presence (⏳ GÖRÜNÜRLÜK POLİTİKASI AÇIK — SABAH KARARI)

> **KİLİTLEME. Proje sahibi kararı gerekiyor.** Kurul uyarısı: bir minörün çevrimiçi/aktif durumunu paylaştığı
> ortamdaki yabancılara yayınlamak = **zamanlamaya dayalı hedefleme yüzeyi** (brief mimariye-gömülü çocuk güvenliği).

**Teknik iskelet (politika-bağımsız, gece YAZILABİLİR ama BROADCAST gece BAĞLANMAZ):**
- **Ephemeral, Redis tabanlı** (mevcut `ioredis` + Socket.IO Redis adapter yeniden kullanılır) — **şema/migration YOK**
  (kurul: gece geri-alınması zor DB değişikliği yapma). Bağlantı = online; son heartbeat; disconnect → away→offline.
- Durumlar: `online` · `away` (idle) · `dnd` (kullanıcı seçer) · `offline`.

**AÇIK KARAR (sabah, sahip + gerekirse Fable):** Presence KİME görünür?
- **Seçenek A (muhafazakâr — PM önerisi):** yalnız **arkadaşlar** + (kullanıcı yetişkinse) **ortak-ortam üyeleri**. Minör presence'ı yalnız arkadaşlarına görünür. Yabancıya/ortaktaki yabancıya minör çevrimiçiliği SIZMAZ.
- **Seçenek B:** Discord-benzeri (ortak sunucu = görünür) — minör için risk; reddi öneriyorum.
- **Seçenek C:** presence'ı V1'de yalnız arkadaşlara aç (en basit + en güvenli), ortam görünürlüğünü ertele.

→ Karar verilene dek **broadcast kodu yazılmaz/merge edilmez.** İskelet (bağlantı izleme) policy gelince bağlanır.

### 6.2 İş Kalemleri → **sabah karar sonrası** (gece yapılmaz)

---

## 4. 6.3 — Bildirimler (⏳ KAPSAM + KALICILIK AÇIK — SABAH KARARI)

> **KİLİTLEME.** Redesign'da bell ikonu stub kondu (giriş noktası var). Tam sistem iki karar gerektirir:

**AÇIK KARARLAR (sabah):**
1. **Kapsam:** neler bildirim üretir? (arkadaş isteği/kabul = mevcut event'ler var · DM mesajı · mention [mention parse'ı yeni iş] · ortam olayları). V1 minimal mi?
2. **Kalıcılık:** Bildirim feed kalıcı mı (yeni `Notification` modeli = şema değişikliği) yoksa yalnız oturum-içi anlık mı (kalıcılık yok, şema yok)? Kalıcı = T&S açısından da düşünülmeli (minör bildirimleri).

**Gece YAPILABİLECEK güvenli alt-küme (opsiyonel, sahip onayıyla):** bell paneline **mevcut** `friend.request`/`friend.accept`
event'lerini anlık düşürmek (kalıcılık yok, yeni şema yok, yeni T&S yüzeyi yok) — yalnız zaten yayılan event'leri
göstermek. Mention/DM-bildirimi/persistence → sabah kapsam kararına bağlı.

### 6.3 İş Kalemleri → **sabah karar sonrası**

---

## 5. Bağımsızlık & Bağımlılık

- **6.1 bağımsız + şema-sız + R7-nötr** → gece ship.
- **6.2/6.3 sahip kararına bağlı** → gece yalnız iskelet/taslak, broadcast/persistence merge edilmez.
- Yeni runtime bağımlılığı YOK (Socket.IO + Redis mevcut). Presence ephemeral → DB temiz.

## 6. Açık Sorular (SABAH)
- [ ] **6.2 presence görünürlük politikası** (A/B/C) — minör çevrimiçiliği kime görünür? **(çocuk güvenliği kararı)**
- [ ] **6.3 bildirim kapsamı** (hangi olaylar) + **kalıcılık** (Notification modeli mi, anlık mı)?
- [ ] `dnd` (rahatsız etme) bildirimleri de susturur mu, yalnız görünürlük mü?
