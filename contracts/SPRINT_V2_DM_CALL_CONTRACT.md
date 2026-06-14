# Sprint V2 — DM Sesli Arama (1-1 + grup, audio-only) Sözleşmesi

> Kök + tier `CLAUDE.md`. **Tek doğruluk kaynağı bu dosya.** Sapma → DUR, PM'e dön. Envelope `{ success, statusCode, data }`.
> İlgili: `modules/voice/` (mevcut LiveKit), `shared/dm-permission`, `shared/membership`, `messages/gateway` (WS), DM frontend.
> **R7 ZORUNLU:** davet sinyali gate'i + `/voice/token` DM kapısı = **T&S karar fonksiyonları**, satır satır insan incelemesi.
> Devam eden sınırlar (önceki LiveKit verdikti): **ses kaydı YOK · video YOK**. Kurul verdikti: `kurul/verdicts/2026-06-14-dm-sesli-arama.md`.

## Kurul + sahip kararı (2026-06-14) — değişmez sınırlar

1. **Davet gate'i sunucuda, RING'den ÖNCE** — yabancı/block/yeni-hesap/minör-yabancı, çağrı **çalmadan** elenir.
2. **Minör DM sesi: kapatma YOK** — metin DM ile aynı kapı (`canDm`) + **VoiceSession audit zorunlu** + rapor.
3. **1-1 = ring** (invite/accept/reject/cancel/timeout). **Grup = "sese katıl"** (ring-all YOK).
4. **Token mint'te gate tekrar.** Busy v1 dışı. Kayıt/video yok.

---

## A. Mevcut gate'ler (YENİDEN KULLAN — yeni T&S fonksiyonu yazma)

- `dmPermission.canDm(senderId, targetId): Promise<{allowed, reason?}>` — arkadaş ∧ block-yok ∧ yeni-hesap-değil ∧ (minör-yabancı değil). Davet ve 1-1 mint gate'i bu.
- `membership.requireChannelAccess(userId, channelId)` — üyelik (DM: ChannelMember) + ageGated.
- `membership.requireNoDmBlock(userId, channelId)` — DM kanalında block (jenerik DM_NOT_ALLOWED).

---

## B. Token endpoint — DM/GROUP_DM'e açılır (mevcut `voice.service.mintToken` genişler)  **(R7)**

Mevcut: `POST /channels/:id/voice/token` yalnız `GUILD_VOICE` kabul ediyordu (`NOT_VOICE_CHANNEL`). Yeni davranış:

- **Kanal türü kapısı:**
  - `GUILD_VOICE` → mevcut yol (guild erişim + karantina) **değişmez**.
  - `DM` → 1-1 sesli arama: `requireChannelAccess` (üyelik) + `requireNoDmBlock` + **1-1 için `canDm(userId, otherMember)` re-check**. Başarısız → `403 DM_NOT_ALLOWED` (jenerik).
  - `GROUP_DM` → grup sesi: `requireChannelAccess` (üyelik) + `requireNoDmBlock`. (Grup zaten arkadaş-tabanlı yetişkin-only; per-pair `canDm` gerekmez.)
  - Başka tür → `400 NOT_VOICE_CHANNEL`.
- **Grant:** `canPublish=true` (DM'de guild-karantinası yok; yeni-hesap kilidi zaten `canDm`'de). `canPublishSources:[microphone]`, `canPublishData:false`, video yok.
- **Audit:** webhook → `VoiceSession` (channelId = DM kanalı) aynen yazılır (zaten kanal-agnostik). Minör DM sesi için bu **zorunlu** — davranış örüntüsü sinyali.
- Dönüş değişmez: `{ token, url, canPublish }`.

> Helper: `otherMember(channelId, userId)` = DM kanalındaki diğer ChannelMember (1-1). Yardımcı `membership`'e eklenebilir.

---

## C. Sinyalizasyon — WS (mevcut `MessagesGateway`, Socket.IO + Redis)  **(R7 davet gate'i)**

Çağrı **durumsuz** sinyalle yürür; timeout client-side. Tüm davet gate'i **sunucuda**.

### 1-1 (ring modeli)
- **`voice:call_invite`** (client→server) `{ channelId }` (DM kanalı):
  - Sunucu: kanal `DM` mi? değilse ack `{ ok:false }`. Diğer üyeyi bul (callee).
  - **Gate: `canDm(callerId, calleeId)`** → `allowed` değilse ack `{ ok:false, error:'DM_NOT_ALLOWED' }` ve **ring YAYMA** (nötr düşüş).
  - Geçerse: callee `user:<id>` odasına **`voice.incoming_call`** `{ channelId, caller:{ id, username, avatarUrl } }`. Ack `{ ok:true }`.
- **`voice:call_accept`** (callee→server) `{ channelId }` → caller `user:<id>`'ye **`voice.call_accepted`** `{ channelId }`. (İki taraf da C/B'deki token'ı alıp room=channelId'ye katılır.)
- **`voice:call_reject`** (callee→server) `{ channelId }` → caller'a **`voice.call_rejected`** `{ channelId }`.
- **`voice:call_cancel`** (caller→server) `{ channelId }` → callee'ye **`voice.call_canceled`** `{ channelId }`.
- **Timeout:** client-side ~**30 sn** (arayan: cevapsız → `call_cancel`; callee: 30 sn sonra modal otomatik kapanır). Sunucu timeout state tutmaz.

### Grup ("sese katıl" modeli — ring YOK)
- **`voice:group_call_start`** (client→server) `{ channelId }` (GROUP_DM): sunucu üyelik+block doğrular → **tüm grup üyelerinin** `user:<id>` odalarına **`voice.group_call_started`** `{ channelId, by:{ id, username } }` (DM açık olmasa da "katıl" görsünler). Başlatan zaten katılır.
- Üyeler `/voice/token` (GROUP_DM) alıp room=channelId'ye katılır; presence mevcut webhook→`voice.participant_joined/left` ile (room:channelId yayını) güncellenir.
- Grup çağrısı "biter" diye ayrı sinyal yok; son kişi ayrılınca `room_finished` webhook'u VoiceSession'ları kapatır.

> **Davet gate'i client→client DEĞİL, sunucudan.** Engellenme bilgisi sızdırılmaz (jenerik kod).

---

## D. Frontend (web/)

### D1. Call store / composable (`useCall` veya voice store genişlemesi)
- Giden çağrı durumu: `outgoing { channelId, status:'ringing' } | null`; gelen çağrı: `incoming { channelId, caller } | null`.
- WS dinleyiciler (`useSocket`): `voice.incoming_call` → incoming set + (varsa) zil sesi/titreşim; `voice.call_accepted` → giden çağrıyı `voiceStore.join(channelId)`'ye çevir, outgoing temizle; `voice.call_rejected`/`voice.call_canceled` → durumu temizle + kullanıcıya nötr bilgi; `voice.group_call_started` → ilgili grup DM'de "sese katıl" rozeti.
- Emitter'lar: `callInvite/accept/reject/cancel(channelId)`, `groupCallStart(channelId)`.

### D2. DM başlığı — arama butonu (telefon ikonu)
- 1-1 DM (`DmConversation` başlığı): **telefon ikonu** → `callInvite(channelId)` → giden çağrı barı ("Aranıyor… / İptal"). 30sn timeout.
- Grup DM başlığı: **"Sese Katıl/Başlat"** → `groupCallStart` (kimse yoksa) veya doğrudan `voiceStore.join` (zaten aktifse).

### D3. Gelen çağrı modalı (`IncomingCallModal`, AppShell — global)
- `voice.incoming_call` gelince ekranın üstünde modal: arayan avatar+ad + **Kabul / Reddet**. Kabul → `callAccept` + `voiceStore.join(channelId)`. Reddet → `callReject`. 30sn cevapsız → otomatik reddet/kapat.

### D4. Çağrı sırasında UI
- Bağlanınca mevcut **VoiceConnectedBar** (UserCard'da) "SESE BAĞLISIN + kanal adı" gösterir (1-1'de karşı taraf adı). Mute/sağırlaştır UserCard'da; ayrıl barda.
- DM sohbet alanında kompakt katılımcı şeridi (avatar + konuşma halkası) — `voiceStore.roomParticipants` ile (mevcut). Grup DM'de çoklu.

### D5. i18n
- Tüm yeni metin `tr.json` `call.*` (Aranıyor, Gelen arama, Kabul, Reddet, İptal, Sese Katıl, "ulaşılamadı"). Gömülü string yok.

---

## E. T&S / R7 özeti (incelemede aranacaklar)

- [ ] `voice:call_invite` → ring YAYILMADAN ÖNCE `canDm(caller, callee)`; başarısız davet **nötr** düşer (BLOCKED sızmaz).
- [ ] Token mint DM: `requireChannelAccess` + `requireNoDmBlock` + 1-1'de `canDm` re-check.
- [ ] GROUP_DM token: üyelik + block (per-pair canDm yok — grup arkadaş-tabanlı).
- [ ] Minör DM sesi kapalı DEĞİL ama `canDm` minör-yabancıyı zaten eler; `VoiceSession` audit DM sesine yazılıyor.
- [ ] Hiçbir yerde kayıt/egress/video grant açılmıyor.
- [ ] Engellenme/ilişki durumu istemciye sızmıyor (jenerik DM_NOT_ALLOWED).

---

## F. DoD

- [ ] Token endpoint DM/GROUP_DM'e açıldı (gate'lerle); **R7 geçti**.
- [ ] WS davet sinyalleri (1-1 ring + grup start); davet gate'i sunucuda; **R7 geçti**.
- [ ] Frontend: telefon butonu, giden/gelen çağrı UI, kabul→katıl, grup "sese katıl".
- [ ] İki arkadaş 1-1 sesli görüşür; yabancı/engelli arayamaz (ring çalmaz); grup DM'de çoklu ses.
- [ ] `VoiceSession` audit DM sesinde yazıyor; kayıt/video yok.
- [ ] Tüm metin i18n; envelope tutarlı; backend testleri yeşil (davet gate + DM token gate + grup).

---

## G. Kapsam DIŞI

Video/ekran (DM'de de) · ses kaydı · busy/meşgul durumu · çağrı geçmişi UI · grup ring-all · çağrı bildirimi push (uygulama kapalıyken) · arama sırasında ekran kilidi/PiP.
