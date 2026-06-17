# Sprint R11B — Ses Moderasyonu II: Teftiş Girişi + Yayın-Durdur + Odadan-Çıkar Sözleşmesi

> Kök + tier `CLAUDE.md`. **Tek doğruluk kaynağı bu dosya.** Sapma → DUR, PM'e dön. Envelope `{ success, statusCode, data }`.
> Genişlettiği yer: mevcut `modules/voice/` (R11 `muteParticipant`/`moveParticipant` deseni) + C4 video grant + `AuditLog`.
> Türetildiği yer: sahip talebi 2026-06-17 (ses-kanalında-ekran-paylaşımı moderasyonu) + kurul "minör-ulaşılabilir video = canlı moderasyon önkoşulu".
>
> **R7 ZORUNLU:** Teftiş-girişi bir T&S karar fonksiyonudur — moderatörün **özel/kilitli kanala girmesine** izin verir.
> Bypass mantığı (neyi aşar, neyi ASLA aşmaz) + yetki kontrolü satır satır insan incelemesinden geçmeden merge EDİLMEZ.

---

## 0. Kararlar (sahip + PM, 2026-06-17) — değişmez sınırlar

1. **Görünür giriş + audit (sahip):** Moderatör teftiş için kanala girince **normal katılımcı gibi görünür** (LiveKit participant — gizli-gözetleme YOK). Her teftiş-girişi (mod, normal-üye olmadığı kanala girdiğinde) **`AuditLog`'a yazılır.** Gerekçe: caydırıcı + hesap-verebilir + KVKK-dostu; gizli gözetim mahremiyet/rogue-mod riski.
2. **Kademeli müdahale (sahip):** üç aksiyon — **yayın-durdur** (video/ekranı kes, ses kalsın) · **sustur** (R11 mevcut, hepsini kes) · **odadan-çıkar** (disconnect, ortamdan atmadan). Orantılı: küçük sorun→yayın-durdur, büyük→çıkar.
3. **İzin eşlemesi (PM, yeni flag YOK):** teftiş-girişi + yayın-durdur → **`MUTE_MEMBERS`**; odadan-çıkar → **`MOVE_MEMBERS`**. Mevcut `PERMISSION_FLAGS` kullanılır.
4. **Hedef koruması (R11 deseni):** `requireTargetNotOwner` — owner + self korunur. **D15 (tam rol-hiyerarşisi yok) bu güçlü aksiyonlarla BÜYÜR** ama bu sprintte kapatılmaz (ayrı iş; closed-test mod'ları güvenilir). Borç notu §6.
5. **Teftiş-girişi NEYİ AŞAR, NEYİ AŞMAZ:** özel/kilitli kanal üyeliği + kullanıcı-limiti → **AŞAR** (mod girer). **Yaş-kapısı (`AGE_RESTRICTED`) → ASLA AŞILMAZ** — minör hiçbir bypass ile ageGated/adultsOnly bağlama giremez (çocuk-güvenliği invariantı bozulmaz).

---

## A. Şema

**Değişiklik YOK.** `AuditLog` (actorId/action/entityType/entityId/metadata/createdAt) + `ModerationAction` mevcut. Migration yok.

---

## B. Backend — `modules/voice/` genişlemesi

### B1. Teftiş-girişi (mintToken bypass) **(R7 — çekirdek)**
`mintToken`'da, `requireChannelAccess` **`NOT_CHANNEL_MEMBER`** (özel kanal üyeliği) fırlattığında:
- Aktörün o guild'de **`MUTE_MEMBERS`** izni varsa → **teftiş-girişi** olarak devam et (kanalı doğrudan çek, normal akışa dön). Yoksa → hatayı aynen fırlat.
- **`AGE_RESTRICTED` fırlatıldıysa → ASLA bypass etme**, her zaman fırlat (yaş kapısı moda da kapalı; §0.5).
- Kullanıcı-limiti bypass'ı: mevcut `enforceUserLimit` `MANAGE_CHANNELS` muafiyetine **`MUTE_MEMBERS` eklenir** (mod dolu kanala da girer).
- **Audit:** mod normal-üye olmadığı bir kanala teftiş-girişi yaptığında `AuditLog` yaz: `action: 'voice.inspect'`, `entityType: 'channel'`, `entityId: channelId`, `metadata: { guildId, targetChannelPrivate: boolean }`. (Normal üyenin kendi kanalına girişi audit'lenmez — yalnız bypass-giriş.)
- Mod'un grant'ı: normal kurallar (audio; video yalnız resolveVideoSources izin verirse — normal kanalda video yok, bu giriş video AÇMAZ).
- **Görünürlük:** LiveKit participant olarak girer → odadakiler görür (karar §0.1; ekstra iş yok, doğal).

### B2. Yayın-durdur — `POST /channels/:id/voice/stop-broadcast` `{ targetUserId }` **(R7)**
- Yetki: `MUTE_MEMBERS`. GUILD_VOICE + `requireTargetNotOwner` (owner/self koruması).
- Etki: LiveKit `updateParticipant(channelId, targetUserId, undefined, { canPublishSources: ['microphone'], canSubscribe: true, canPublishData: false })` → **video/ekran kaynakları düşer, ses KALIR** (`canPublish` false YAPILMAZ — sustur'dan farkı bu).
- **Kalıcılık YOK (bilinçli — kademeli):** tek-seferlik. Hedef yeniden yayın açabilir; tekrar sorunsa mod **sustur'a** yükseltir. Re-mint davranışı: hedefin sonraki token mint'inde (TTL≤10dk / reconnect) `resolveVideoSources` yeniden değerlendirir → bağlam hâlâ izinliyse video geri gelebilir. Yani yayın-durdur **anlık + ≤TTL pencere**; kalıcı engel = sustur. Bunu loud yorumla yaz.
- Audit: `AuditLog action: 'voice.stop_broadcast'`. WS: `voice.broadcast_stopped { channelId, userId }` (room'a; istemci hedefin video tile'ını düşürür).
- LiveKit erişilemezse best-effort (R11 deseni — sessiz geç, hata yutulur).

### B3. Odadan-çıkar — `POST /channels/:id/voice/disconnect` `{ targetUserId }` **(R7)**
- Yetki: `MOVE_MEMBERS`. GUILD_VOICE + `requireTargetNotOwner`.
- Etki: LiveKit `removeParticipant(channelId, targetUserId)` → hedef ses oturumundan düşer; **ortam üyeliği DOKUNULMAZ** (rejoin edebilir; kalıcı=guild kick/ban ayrı). 
- Audit: `AuditLog action: 'voice.disconnect'`. WS: mevcut `voice.participant_left` webhook'la zaten yayılır; ek olarak `voice.kicked { channelId, userId }` (istemci "moderatör tarafından çıkarıldın" Türkçe bildirim).
- Best-effort; LiveKit erişilemezse `503`/sessiz (R11 deseni).

### B4. Controller
`voice.controller.ts`'e iki endpoint (R11 mute/move deseniyle birebir): `stop-broadcast`, `disconnect`. DTO: `{ targetUserId: string }` (class-validator). Envelope.

---

## C. Frontend (`web/`)

### C1. Katılımcı aksiyon menüsü (R11 mevcut mute/move menüsü genişler)
- Ses katılımcısı bağlam menüsüne: **"Yayını durdur"** (yalnız hedef video/ekran yayınlıyorsa göster — katılımcı video track'i varsa) · **"Odadan çıkar"**. Mevcut "Sustur"/"Taşı" yanına.
- Görünürlük: aktörün yetkisi varsa (mute→yayın-durdur, move→çıkar). Yetki yoksa madde yok (R11 deseni — buton gizlenir).
- Onay: yıkıcı aksiyonlar (`ConfirmDialog`) — "X'in yayınını durdur?" / "X'i odadan çıkar?".

### C2. Teftiş-girişi (kilitli/dolu ses kanalına mod girişi)
- Kilitli ses kanalı zaten **görünür-kilitli** (`ChannelDto.locked`, [[ozel-kanal-gorunur-kilitli]]). Mod (MUTE_MEMBERS) için: kilitli/dolu ses kanalına tıkla → **"Teftiş için katıl"** affordance → normal join akışı (`POST .../voice/token`; backend B1 mod-entry path'i yetkilendirir). Başarıda mod görünür katılımcı olarak girer.
- Yetkisiz kullanıcıda kilit davranışı değişmez (giremez).

### C3. i18n
- Yeni metin `tr.json` (`voice.stopBroadcast`/`voice.disconnect`/`voice.inspect`/"moderatör tarafından çıkarıldın"/onay metinleri). Gömülü string yok; `--kv-*`.

---

## D. T&S / R7 özeti (incelemede aranacaklar)
- [ ] Teftiş-girişi **yalnız `NOT_CHANNEL_MEMBER`** (özel üyelik) + limiti aşar; **`AGE_RESTRICTED` ASLA aşılmaz** (minör koruması bozulmaz).
- [ ] Bypass yalnız `MUTE_MEMBERS` sahibinde; `requireChannelAccess` shared helper **değiştirilmedi** (bypass voice-local).
- [ ] Teftiş-girişi görünür (LiveKit participant) + `AuditLog` yazılıyor (bypass-giriş).
- [ ] Yayın-durdur ses'i kesmiyor (`canPublish` korunur, yalnız video kaynakları düşer); owner/self korumalı.
- [ ] Odadan-çıkar ortam üyeliğine dokunmuyor; owner/self korumalı.
- [ ] Mod-entry video AÇMIYOR (normal kanalda resolveVideoSources hâlâ []).

## E. DoD
- [ ] B1 teftiş-girişi (özel+limit bypass, yaş-kapısı korunur, audit, görünür) — **R7 geçti.**
- [ ] B2 yayın-durdur (video düşer/ses kalır, tek-seferlik, audit, WS) + B3 odadan-çıkar (removeParticipant, üyelik korunur, audit, WS).
- [ ] Frontend: aksiyon menüsü (yayın-durdur/odadan-çıkar) + teftiş-için-katıl + onaylar; i18n.
- [ ] `nest build` + testler (bypass matrisi: yaş-kapısı aşılmıyor · özel+limit aşılıyor · yetkisiz giremiyor · owner/self korumalı · yayın-durdur ses bırakır) + `vue-tsc`/`vite build` temiz. Migration yok.

## F. Borç / Kapsam DIŞI
- **D15 amplifikasyonu:** bu aksiyonlar owner+self korur ama eşit/üst-rolü korumaz (bir MUTE_MEMBERS mod, admin'in yayınını durdurabilir / özel kanalına girebilir). Tam rol-hiyerarşisi (actor-en-yüksek-rol > hedef-en-yüksek-rol) **bu sprintte değil** — D15 ile birlikte V2. Closed-test mod'ları güvenilir → kabul.
- **Kapsam dışı:** kalıcı video-engeli (yayın-durdur tek-seferlik; kalıcı=sustur) · ses kaydı/egress · gizli mod-girişi (reddedildi §0.1) · guild-seviyesi ban (mevcut ayrı) · minör-ulaşılabilir ekran-yayını politikası (kurul: lansman-grade, ayrı karar — bu sprint moderasyon ARACI'nı kurar, minör-izleyici politikasını AÇMAZ).
