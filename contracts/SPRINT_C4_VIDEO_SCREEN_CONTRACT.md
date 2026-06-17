# Sprint C4 — Video + Ekran Paylaşımı (BUILD-DARK) Sözleşmesi

> Kök + tier `CLAUDE.md`. **Tek doğruluk kaynağı bu dosya.** Sapma → DUR, PM'e dön. Envelope `{ success, statusCode, data }`.
> Türetildiği yer: PLAN Track C4 + kurul verdiktleri [[2026-06-16-video-ekran-paylasimi]] (gating blueprint) + 2026-06-17 build-dark disposition.
> Genişlettiği yer: mevcut `modules/voice/` (`mintToken` grant'i), `SPRINT_V2_LIVEKIT_CONTRACT.md` (audio) + `SPRINT_V2_DM_CALL_CONTRACT.md` (DM çağrı).
>
> **🔴 EN YÜKSEK ÇOCUK-GÜVENLİĞİ RİSKİ (PLAN).** Bu sprint özelliği **KARANLIK** build eder: kamera/ekran grant'i
> bayraklar `false` iken **hiçbir yolda** üretilmez. Gating blueprint gün-bir gömülüdür — sonradan eklenmez.
>
> **R7 ZORUNLU (satır satır insan incelemesi):** video grant kararı (`resolveVideoSources`) bir T&S karar fonksiyonudur.
> Bu fonksiyon + `mintToken` entegrasyonu insan incelemesinden geçmeden merge EDİLMEZ.

---

## 0. Kurul çerçevesi (2026-06-17) — değişmez sınırlar

Build, kurul ⚠ŞARTLI onayıyla şu çerçeveyle açıldı (kilitli C4 verdict'inin build-erteleme kararının yeniden ele alınması):

1. **BUILD-DARK.** Kamera/ekran bayrakları default `false`. Bayraklar `false` iken `mintToken` video TrackSource'u grant etmez (audio-only davranış birebir korunur). Özellik kodda var, ulaşılamaz.
2. **BLUEPRINT GÖMÜLÜ (gün bir).** Video grant yalnız **yetişkin-yalıtılmış bağlamda** üretilir (§3). "Ham video aç, kapıyı sonra ekle" YASAK (Sprint 4 G1 deseni reddi). Gating, bayraktan bağımsız olarak ilk commit'te tam çalışır.
3. **EKRAN ≠ KAMERA AYRI BAYRAK.** `CAMERA_ENABLED` + `SCREEN_ENABLED` bağımsız. Risk profilleri farklı (kamera=canlı kişi en ağır; ekran=uygulama penceresi). Biri açık biri kapalı olabilir.
4. **KAYIT/EGRESS YOK.** Audio verdict carry-over. Kod `EgressClient` içermez, hiçbir track kaydedilmez.
5. **Minör → ASLA video** (yayınlamaz VE alt-çekmez); karantina → video kapalı.

### 0.1 AÇMA ÖNKOŞULU — bayraklar bu tamam olmadan `true` YAPILMAZ (operasyonel, kod değil)

> Bu bölüm dev'i değil **operasyonu/PM'i** bağlar. Dev build-dark teslim eder; aşağısı bayrak-çevirme kapısıdır.
> **Sahip sadeleştirmesi (2026-06-17):** kapalı demo ölçeği için aşırı-kontrol (kimlik-bağlı tek-kullanım kod, her
> katılımcıyı gözle-tarama, purge seremonisi) **gereksiz** — teknik garanti edilemez, analiz felci. Yapısal güvenlik
> (§3 gating + build-dark) zaten yeterli. Aşağısı sadeleşmiş hali.

- **(a) Temiz sunucu + davet-kodlu kapalı kayıt + açık self-servis kayıt KAPALI.** Mevcut Railway/Vercel deployment **iptal edilecek** (sahip) → gerçek sunucu henüz alınmadı. **Yeni temiz ortam eski açık-kayıt hesabını taşımaz** → ayrı "purge" işi YOK, fresh-deploy halleder. Davet-kodu sistemi ayrı sprint (yakında).
- **(b)** §3 bağlam-gating + R7 incelemesi **tamam** (bu sprint'in DoD'u).
- **(c) Yazılı borç (yalnız kayıt, kovalanmaz):** Davet-kodu yaş-doğrulama DEĞİL (vetted yetişkin hesabını minöre verebilir — teknik kilit yok, kabul). §3 gating bu artığı yapısal karşılar (minör sızsa bile `isMinor → video []`). Kalan tek açık = **yaş yalan-beyanı** → **lansmanda e-Devlet (PLAN D2) kapatır.** Kapalı demo için kabul; lansmanda şart. Bkz. PLAN Track A / D2.

---

## A. Env / Config (`api/.env` + `configuration.ts`)

```
CAMERA_ENABLED=false      # kamera (görüntülü) yayını grant'i — default false (build-dark)
SCREEN_ENABLED=false      # ekran paylaşımı grant'i — default false (build-dark)
```

- `configuration.ts`: `cameraEnabled: process.env.CAMERA_ENABLED === 'true'`, `screenEnabled: process.env.SCREEN_ENABLED === 'true'`.
- **Prod fail-fast YOK** (default false güvenli; LiveKit env'i zaten audio için fail-fast).
- "Video karanlık" = ikisi de `false`. Audio (`MICROPHONE`) bu bayraklardan **bağımsız**, mevcut davranış değişmez.

---

## B. Şema

**Şema değişikliği YOK.** Video, mevcut `User.isMinor` + `Channel.ageGated` + `Guild.adultsOnly` + `ChannelMember` + `quarantineHours` + `VoiceMute` üzerine oturur. Yeni tablo/kolon gerekmez. (Audit: video oturumu zaten mevcut `VoiceSession` ile kapsanır — ayrı video-session tablosu YAGNI, eklenmez.)

---

## C. Backend — `modules/voice/` genişlemesi

### C1. Yeni T&S karar fonksiyonu — `resolveVideoSources(user, channel, otherDmUser?)` **(R7 — çekirdek)**

> Tek choke-point. Fail-closed: kuşkuda **boş dizi** (video yok). `mintToken` bunu çağırıp sonucu `canPublishSources`'a ekler.

İmza (kavramsal): `(userId, channel) → TrackSource[]` — `[]` | `[CAMERA]` | `[SCREEN_SHARE]` | `[CAMERA, SCREEN_SHARE]` (+ ekran sesi için `SCREEN_SHARE_AUDIO` yalnız `SCREEN_SHARE` izinliyse).

**Sıralı kapılar (herhangi biri düşerse → o kaynak grant edilmez):**

1. **Bayrak:** `CAMERA_ENABLED` değilse `CAMERA` aday-dışı; `SCREEN_ENABLED` değilse `SCREEN_SHARE` aday-dışı. İkisi de kapalıysa → erken `[]` (build-dark yol; audio-only davranış birebir).
2. **Minör mutlak ret:** `user.isMinor === true` → `[]`. (Redundant fail-closed — `requireChannelAccess` zaten ageGated minörü eler, ama burada da açıkça reddet; tek-katmana güvenme.)
3. **Karantina:** guild voice'ta `resolveCanPublish(userId, guildId) === false` (yeni MEMBER) → `[]` (video, audio'dan ağır; karantina video'yu da keser). OWNER/ADMIN muafiyeti audio ile aynı.
4. **Server-mute:** `isVoiceMuted` → `[]` (mute her yayını keser).
5. **BAĞLAM kapısı (çekirdek invariant) — bağlam yetişkin-yalıtılmış DEĞİLSE `[]`:**
   - **`GUILD_VOICE`:** video yalnız `channel.ageGated === true` **VEYA** `guild.adultsOnly === true` ise. **Normal kanal (ikisi de false) → video YOK** (normal kanalda minör bulunabilir — ageGated değil → erişim kapısı minörü elemez → adult video minöre maruz kalır). Bu kapı, minörün *erişebildiği* bağlamda video'yu yapısal olarak kapatır.
   - **`DM` (1-1):** video yalnız **iki taraf da yetişkinse** (`!user.isMinor && !otherDmUser.isMinor`). **Minör↔arkadaş DM = audio VAR, video ASLA** (DM-call verdict'i "minör sesi" içindi; video ayrı sınıf). `otherDmMember` zaten mevcut.
   - **`GROUP_DM`:** video yalnız **gruptaki TÜM üyeler yetişkinse** (fail-closed; "Sprint 12 yetişkin-only" varsayımına güvenme, üyeleri fiilen kontrol et). Bir üye bile minör → `[]`.

**Çıktı `mintToken`'da:** `canPublishSources = [TrackSource.MICROPHONE, ...resolveVideoSources(...)]`. Audio her zaman önce; video koşullu ek. Mevcut `canPublish` (audio yayın izni) mantığı **değişmez**.

### C2. `mintToken` dönüşü genişler — UI yetenek bayrakları

Mevcut dönüş `{ token, url, canPublish, bitrate }` → **eklenir:** `canPublishCamera: boolean`, `canPublishScreen: boolean` (= `resolveVideoSources` çıktısında ilgili kaynak var mı). İstemci bu bayraklarla kamera/ekran **butonlarını gösterir/gizler**. Build-dark'ta ikisi de `false` → UI'da video kontrolü görünmez → özellik inert ama kodda hazır.

### C3. Kısa TTL + bağlam-değişiminde re-mint (verdict §5 küçük-açık kapanışı)

- Token TTL mevcut **10 dk** korunur. Grant mint-anında sabittir; kanal `ageGated`/guild `adultsOnly`/DM karşı-taraf değişirse bayatlar.
- **İstemci kanal/oda değiştirince veya 10 dk dolunca yeniden token ister** (mevcut audio re-mint deseni). Sunucu her mint'te `resolveVideoSources`'u taze çalıştırır → bayat-yetki penceresi ≤ TTL. (Kalıcı bağlam değişimi nadirdir; TTL kabul edilebilir pencere.)

### C4. Force-disable hook (mevcut mute yoluyla — yeni endpoint YOK)

Server-mute (R11 `muteParticipant`) zaten `canPublish=false` veriyor; video kaynakları da `canPublishSources`'tan düşer (mute → `resolveVideoSources` kapı 4 → `[]`). **Ek video-özel moderasyon endpoint'i bu sprint YOK** — mevcut mute video'yu da keser, yeterli.

---

## D. Frontend (`web/`) — BUILD-DARK UI

> UI inşa edilir ama **token yetenek bayraklarına bağlı** (C2). `canPublishCamera/Screen=false` → kontrol render edilmez. Böylece build-dark = bayrak kapalı = UI görünmez = inert; bayrak açılınca UI otomatik belirir (frontend yeniden-deploy gerekmez).

### D1. Yayın kontrolleri (yetenek-kapılı)
- Aktif ses/çağrı barında: **kamera aç/kapa** butonu (`canPublishCamera` ise) + **ekran paylaş** butonu (`canPublishScreen` ise). `livekit-client` mevcut `Room`'a `setCameraEnabled`/`setScreenShareEnabled`.
- Yayın izni yokken (bayrak kapalı / bağlam uygun değil) buton **yok** — disabled placeholder bile değil (memory: boş placeholder şişirme yok).

### D2. Video render (verdict UX — sahip spec 2026-06-16)
- **Paylaşan-öncelikli yarı-ekran:** aktif yayın (kamera/ekran) büyük alanda; diğer katılımcılar **alt avatar/küçük-video şeridi**. Tam-ekran toggle.
- Kamera yokken katılımcı = mevcut daire avatar (audio-only davranış). Video track gelince tile'a yükselir.
- **Subscribe:** minör hiçbir bağlamda buraya gelemez (bağlam kapısı); ama istemci yine de yalnız sunucunun izin verdiği track'leri alır (LiveKit subscribe).

### D3. i18n
- Yeni metin `tr.json` (`voice.camera*`, `voice.screen*`, izin/hata). Gömülü string yok; `--kv-*` token.

### D4. Yeni bağımlılık YOK
- `livekit-client` zaten kurulu (audio). Video aynı SDK; ek paket gerekmez.

---

## E. T&S / R7 özeti (incelemede aranacaklar)

- [ ] `resolveVideoSources` fail-closed: her belirsiz dalda `[]`; minör mutlak ret (bağımsız katman, sadece access-gate'e güvenmiyor).
- [ ] **Normal (ageGated/adultsOnly olmayan) GUILD_VOICE → video grant'i HİÇBİR yolda yok.** (En kritik test.)
- [ ] DM video yalnız iki-taraf-yetişkin; minör↔yetişkin DM → audio var, video `[]`. GROUP_DM tüm-üye-yetişkin kontrolü fiili (varsayım değil).
- [ ] Karantina + server-mute → video kaynakları düşer.
- [ ] Bayraklar `false` iken `canPublishSources` yalnız `[MICROPHONE]` (audio-only davranış birebir; regresyon yok).
- [ ] Hiçbir yerde egress/kayıt; `EgressClient` yok.
- [ ] `canPublishCamera/Screen` yalnız grant'ı yansıtır; istemci kendine yetki veremez (sunucu-taraflı).

---

## F. DoD (Sprint C4)

- [ ] `CAMERA_ENABLED`/`SCREEN_ENABLED` config (default false); audio davranışı bayraklardan bağımsız değişmez.
- [ ] `resolveVideoSources` T&S fonksiyonu (§3 tüm kapılar) + `mintToken` entegrasyonu; dönüşe `canPublishCamera/Screen`. **R7 geçti.**
- [ ] Kısa TTL + bağlam-değişiminde re-mint korunur/uygulanır.
- [ ] Frontend: yetenek-kapılı kamera/ekran kontrolleri + paylaşan-öncelikli video render + tam-ekran; bayrak kapalıyken UI görünmez.
- [ ] Backend testleri yeşil — **özellikle:** normal kanal→video yok · ageGated/adultsOnly→adult video var/minör yok · DM iki-taraf-yetişkin · karantina/mute→video düşer · bayrak kapalı→audio-only birebir.
- [ ] `nest build` + `vue-tsc`/`vite build` temiz; migration YOK (şema değişmedi).
- [ ] Tüm metin i18n; envelope tutarlı; Swagger güncel.
- [ ] **Açma önkoşulu (§0.1) PLAN'a işlendi** — bayraklar davet-gate + açık-kayıt-kapatma/purge + R7 olmadan `true` yapılmaz; e-Devlet borcu yazılı.

---

## G. Kapsam DIŞI (bu sprint yapma)

Davet-kodlu kayıt sistemi (ayrı sprint, açma önkoşulu) · açık-kayıt kapatma/purge (operasyon) · e-Devlet yaş-doğrulama · video-özel moderasyon endpoint'i (mevcut mute yeterli) · ayrı video-session audit tablosu (VoiceSession yeterli) · kayıt/egress · bayrakları prod'da açma (operasyonel karar, kod değil) · forum.
