# Sprint D71 — Arayan tarafta 30 sn "Cevap vermedi"

> **Kaynak:** PLAN.md D71, sahip bulgusu 2026-09-21 (M5g cihaz turu). Sahip kararı aynı gün:
> **zil sussun, oda kalsın** (Discord modeli; D39'un "oda önce" kararı BOZULMAZ).
> **Tier:** `mobile/` + `web/` (iki ayrı geliştirici). `api/` diffi SIFIR.
> **Metin:** `call.noAnswer` = "Cevap vermedi." PM tarafından `web/src/i18n/tr.json`e EKLENDİ.
> Mobil aynı dosyadan (`i18n:sync`) alır. Başka yeni metin YOK.

---

## §0 Sorun

Aranan tarafta zil 30 sn'de kendiliğinden kapanıyor (mobil `incomingCall.ts` `RING_TIMEOUT_MS`,
web `IncomingCallModal.vue` 30 sn, `api/` push `ttlSeconds: 30`). Arayana hiçbir sinyal gitmiyor.
Arayan tarafta "Çalıyor…" ve geri-zil yalnız-kalma zaman aşımı (3 dk) dolana kadar sürüyor.
Kullanıcı 2,5 dk boyunca karşı tarafın telefonunun çaldığını sanıyor.

## §1 Davranış (iki istemcide aynı)

Yalnız **1-1 DM araması, arayan taraf** (`didInvite`/`callStore.outgoing.kind === 'dm'`).
Grup DM ve ortam ses kanalı KAPSAM DIŞI, dokunulmaz.

```
0 sn   davet ack.ok → odaya gir, "Çalıyor…" + geri-zil (bugünkü gibi)
30 sn  hâlâ çalıyorsa VE karşı taraf odaya katılmadıysa:
         1. iptal sinyali gönder (callCancel, bkz. §1.2)
         2. "çalıyor" durumunu bitir → geri-zil ve "Çalıyor…" kendiliğinden kalkar
         3. "Cevap vermedi." göster (t('call.noAnswer'))
       Arayan ODADA KALIR. Kapatabilir. Aranan DM'deki "Katıl" ile hâlâ girebilir.
3 dk   mevcut yalnız-kalma zaman aşımı odayı kapatır (DEĞİŞMEZ)
```

1. **Sabit:** `OUTGOING_RING_TIMEOUT_MS = 30_000`. Yorumda aranan taraftaki üç 30 sn'ye
   (mobil `RING_TIMEOUT_MS`, web modal, `api/` ttl) atıf yap: sayılar birlikte değişir.
2. **Neden iptal gönderiliyor:** aranan taraf zaten 30 sn'de susuyor ama iki saat aynı anda
   başlamıyor (arayanınki ack'ten, arananınki olaydan). İptal idempotent, kalan zili kesin kapatır.
   Ayrıca "çalıyor" durumu bittiği için sonradan odadan çıkarken ikinci bir iptal GİTMEZ, doğru olan bu.
3. **Kabul, ret, karşı tarafın katılması, arayanın çıkması** zamanlayıcıyı etkisiz kılar.
   Zamanlayıcı ateşlendiğinde durumu YENİDEN kontrol et (aynı kanal, hâlâ çalıyor, karşı taraf
   odada değil). Yeni bir `startCall`/`startOrJoin` ve `leave` önceki zamanlayıcıyı temizler. Aynı
   kanala 30 sn içinde yeniden aranırsa eski zamanlayıcı yeni aramayı kesmemeli.
4. **R7 nötrlük:** "Cevap vermedi." aranan kişi bakmadıysa, aramayı SUSTURDUYSA (sunucu sessizce
   `{ok:true}` dönüyor) ya da telefonu kapalıysa AYNI metin ve AYNI zamanlamayla gösterilir.
   Susturmayı ele veren farklı bir yol/metin/süre YAZMA. Ret ("Arama reddedildi.") ayrı kalır, değişmez.

## §2 Mobil (`mobile/`)

- Zamanlayıcı `stores/voice.ts` içinde, diğer modül zamanlayıcılarının (`aloneTimer`,
  `pendingCallScreenTimer`) deseninde. `startOrJoin` başarıyla odaya girdikten sonra, yalnız
  `didInvite && callKind === 'dm'` ise kurulur. `leave()` temizler.
- Ateşlenince: `callCancel(channelId)` + `didInvite: false` (`handleCallAccepted` ile aynı anlam:
  "artık çalmıyor") + "cevap vermedi" durumu. Geri-zil (`useOutgoingCallRing`) ve "Çalıyor…"
  `didInvite`e bağlı olduğu için kendiliğinden kalkar. Kontrol et, varsayma.
- "Cevap vermedi." nerede görünür: `call.tsx`te bugün "Çalıyor…"nun göründüğü yerde (karşı tarafın
  kutucuğu, `ParticipantTile` `ringing`). Yeni bir durum alanı gerekiyorsa `VoiceState`e eklenir,
  `leave()` sıfırlar. Mevcut "Bu aramada tek başınasın / {name} istediği zaman katılabilir" metinleriyle
  nasıl bir arada durduğunu raporla. Çakışıyorsa en sade çözümü seç ve gerekçesini yaz, yeni metin ekleme.
- Mini pencere / bildirim gövdesi değişmez.

## §3 Web (`web/`)

- Zamanlayıcı `composables/useCall.ts` `startCall`ta, `setOutgoing` + `join` sonrasında.
  Modül seviyesinde tek zamanlayıcı (dosyadaki `ringbackScope` deseni). Yeni `startCall` öncekini temizler.
- Ateşlenince: hâlâ `callStore.isRinging(channelId)` ise `callCancel(channelId)` +
  `callStore.clearOutgoing()` + `callStore.setNotice('noAnswer')`. Geri-zil (`ensureRingback` watch'ı)
  ve `DmCallPanel`deki bekleyen "çalıyor" kutucuğu `outgoing`e bağlı, kendiliğinden kalkar. Kontrol et.
- `notice`in bugün nasıl gösterildiğini kontrol et (`IncomingCallModal.vue` notice watch'ı,
  `'unreachable'` akışı). `'noAnswer'` aynı yoldan `t('call.noAnswer')` olarak görünmeli. Görünmüyorsa
  en küçük değişiklikle bağla.
- `useCall.ts` dosya başı yorumundaki "Arayan-tarafı sabit zaman aşımı YOK" cümlesi güncellenir:
  oda ömrü hâlâ yalnız-kalma sürecine bağlı, 30 sn yalnız ÇALMA süresini bitiriyor.

## §4 DoD

- [ ] Mobil: `npx tsc --noEmit` + `npm run lint` temiz.
- [ ] Web: tip denetimi YALNIZ `npx vue-tsc -b` (bilinen 6 önceden var olan hata dışında yeni hata yok;
      `--noEmit` KULLANMA, hiçbir şeyi denetlemiyor) + lint + build + varsa testler.
- [ ] `api/` diffi sıfır, `tr.json`e geliştirici dokunmaz (PM ekledi).
- [ ] Commit ATILMAZ.
- [ ] **Cihaz turu (sahip):**

| Senaryo | Beklenen |
|---|---|
| Mobilden ara, aranan bakmasın | 30 sn'de zil susar, "Cevap vermedi.", arayan odada kalır |
| Webden ara, aranan bakmasın | aynı |
| 30 sn sonra aranan DM'den "Katıl" | görüşme normal başlar |
| 30 sn sonra arayan kapatır | normal çıkış, ek sinyal/uyarı yok |
| 30 sn içinde kabul / ret / arayan kapatır | bugünkü gibi, "Cevap vermedi" ÇIKMAZ |
| Aranan aramayı susturmuş | normal "cevap yok" ile ayırt edilemez |
| Grup DM araması | değişiklik yok |
