# Sprint M5g — Arayan kapatınca zil hemen sussun (+ D70)

> **Kaynak:** sahip bulgusu 2026-09-21. Arayan aramayı kapatınca karşı tarafın zili (web, masaüstü,
> telefon) hemen susmuyor, bir süre çalmaya devam ediyor. Telefonda uygulama hem AÇIKKEN hem ARKA
> PLANDAYKEN görüldü.
> **Tier:** yalnız `mobile/`. `api/` ve `web/` diffi SIFIR.
> **Kapsam:** iki commit'lik iş (§1 ve §2+§3). Yeni ekran, yeni metin, yeni bağımlılık, native diff YOK.
> **R7:** dokunulmuyor. Arama davet kapısı (`canDm`, susturma) sunucuda, bu işin dışında.

---

## §0 Kök nedenler (PM tarafından koddan doğrulandı)

**A. Mobilde arayan iptali EN SON gönderiyor.** `mobile/src/stores/voice.ts` `leave()`:
`callCancel`/`groupCallCancel` (`:819-822`), `await leavingRoom.disconnect()` (`:798`) ve
`await AudioSession.stopAudioSession()` (`:805`) BİTTİKTEN sonra gidiyor. LiveKit vedalaşması
saniyeler sürebiliyor, karşı taraf bu süre boyunca çalıyor. Web'de sıra doğru:
`web/src/stores/voice.ts:414` iptal, `:426` disconnect. Etkisi: mobilden arayınca HER alıcıda gecikme.

**B. Ön planda iki bildirim yarışıyor.** Arama hem WS'ten (`presentIncomingCall` → yerel bildirim)
hem FCM push'tan geliyor. `push.ts:167` push kopyasını yalnız `isChannelRinging(channelId)` doğruysa
bastırıyor. `current` ise `presentIncomingCall` içinde birkaç `await`ten SONRA yazılıyor. Push önce
gelirse bastırılmıyor, kendi sesiyle ayrı bir bildirim olarak kuruluyor. `dismissIncomingCall`
yalnız `current.notificationId`yi kapatıyor → push kopyası çalmaya devam ediyor.

**C. Arka planda (JS canlı) `current` boş.** Bildirimi FCM kurduysa `current` hiç dolmadı.
`voice.call_canceled` gelip `dismissIncomingCall` çağrılsa bile `:404` erken dönüşü hiçbir şey
yapmadan çıkıyor.

**Neden M5f'ten sonra fark edildi:** `incoming_call_channel.wav` 30 sn'ye döngülendi (M5f §0).
Önceden asılı kalan bildirim kısa bir ses verip susuyordu. Aynı açık artık 30 sn zil olarak duyuluyor.

**Kapsam dışı (bilinçli):** uygulama TAMAMEN KAPALIYKEN iptal hiçbir koda ulaşmıyor. Tek gerçek
çözüm veri-yalnız push (D62). PM, D62'ye üçüncü gerekçe olarak yazar. Bu sprintte ele ALINMAZ.

---

## §1 D70: modül gövdesindeki abonelik init'e taşınır (AYRI COMMIT, ÖNCE)

Tetikleyici oluştu (`incomingCall.ts`e dokunan ilk iş). Sahip kararı 2026-09-21: bu sprintte, ayrı adım.

- `incomingCall.ts` sonundaki modül seviyesi `useVoiceStore.subscribe(...)` (`:560`) modül
  gövdesinden ÇIKAR. Dosyada modül yüklenirken çalışan başka bir iş kalmamalı (yalnız
  tanımlar/sabitler). Kontrol et, başka varsa PM'e raporla, kendin taşıma.
- Aboneliği uygulama açılışında bir kez kur. Tercih edilen yer: aynı dosyadaki
  `useIncomingCallResponder`'ın (kök layout'ta bir kez mount ediliyor) `useEffect`i, dönüşte
  `unsubscribe`. Başka bir yer daha doğruysa gerekçesiyle raporla.
- Davranış BİREBİR aynı: çalan kanala bağlanınca zil susar. Üstteki uzun yorum bloğu korunur,
  yalnız "Abonelik modul seviyesinde" paragrafı yeni yere göre güncellenir.
- Yeni import yok. `stores/voice` ↔ `realtime/socket` ↔ `notifications/incomingCall` döngüsü
  bu sprintte çözülmez. Metro'nun `Require cycle` uyarılarının kaybolması şart DEĞİL.

## §2 Mobilde arayan iptali ilk iş olarak gönderir

`mobile/src/stores/voice.ts` `leave()`:

- İptal kararını (`channelId`, `didInvite`, `callKind`, `wasAlone`) ve gönderimi, ilk `await`ten
  ÖNCEYE taşı. Koşullar BİREBİR aynı kalır: grup → `groupCallCancel` (koşulsuz), 1-1 →
  `wasAlone` ise `callCancel`, guild → hiçbiri.
- `callKind`/`didInvite` sonradan `set()` ile sıfırlanıyor. Değerleri gönderim anında oku.
- Üstündeki yorum bloğu ("§8 istisnası", "M4z §F") gönderimle birlikte taşınır, sıra değişikliğinin
  sebebi bir satırla eklenir (web `voice.ts:414` ile aynı sıra).
- `startOrJoin`in `catch` yolundaki iptal (`:743-746`) DEĞİŞMEZ.

## §3 İptal, o kanalın BÜTÜN arama bildirimlerini kapatır

`mobile/src/notifications/incomingCall.ts` `dismissIncomingCall(channelId)`:

- Mevcut `current` temizliği aynen kalır.
- EK OLARAK: `getPresentedNotificationsAsync()` içinden `data.type === 'incoming_call'` VE
  `data.channelId === channelId` olanların hepsi `dismissNotificationAsync` ile kapatılır.
  `source` fark etmez (WS kopyası da FCM kopyası da). `clearStaleIncomingCallNotifications`'daki
  desen örnek alınır, hata yutulur.
- `:404` erken dönüşü bu taramayı ATLATMAMALI (C vakası: `current` boşken de tarama çalışır).
  Uygulama-içi şerit kapatma (`:401-403`) yerinde kalır.
- Tek temizlik noktası kuralı korunur: kabul, reddet, zaman aşımı, iptal, "çalan kanala bağlandı"
  hepsi buradan geçiyor, hepsi bu taramadan faydalanır. Yeni bir kapanış noktası açılmaz.
- ⚠️ Doğrulanmamış varsayım: FCM'in kurduğu bildirim `getPresentedNotificationsAsync`te
  `request.content.data.channelId` ile görünüyor mu? `clearStaleIncomingCallNotifications` bunu
  zaten varsayıyor. `expo-notifications` native kaynağından (FCM bildirimini okuyan kısım) kontrol
  et, sonucu raporla. Görünmüyorsa DUR ve PM'e bildir, tahminle çözüm yazma.

**Bilinen sınır (kapsam dışı, düzeltme yazma):** iptal, `presentIncomingCall` henüz `current`'ı
yazmadan gelirse ya da FCM push iptalden SONRA teslim edilirse zil yine çalabilir. Yalnız çok kısa
aramalarda olur. Cihaz turunda görülürse ayrı iş olur.

---

## §4 DoD

- [ ] `mobile/` içinde `npx tsc --noEmit`, lint ve mevcut testler temiz (önceden var olan hatalar ayrı raporlanır).
- [ ] Native diff yok (`app.json`, config plugin, `android/` değişmedi) → yeni build gerekmez, JS değişikliği.
- [ ] §3 varsayımının sonucu raporda.
- [ ] Commit ATILMAZ. PM iki commit'e böler (§1 ayrı, §2+§3 ayrı), Co-Authored-By trailer yok.
- [ ] **Cihaz turu (sahip):** her senaryoda arayan kapatınca alıcının zili ~1 sn içinde susmalı.

| Arayan | Alıcı | Beklenen |
|---|---|---|
| Mobil | Web / masaüstü | anında susar (§2) |
| Mobil | Mobil, uygulama açık | anında susar (§2 + §3/B) |
| Mobil | Mobil, arka planda | anında susar (§2 + §3/C) |
| Web | Mobil, uygulama açık | anında susar (§3/B) |
| Web | Mobil, arka planda | anında susar (§3/C) |
| Herhangi | Mobil, uygulama kapalı | 30 sn çalar, BİLİNEN SINIR (D62) |
| — | Regresyon | kabul, reddet, 30 sn zaman aşımı, DM'deki "Katıl" ile girince zil susar (§1) |
