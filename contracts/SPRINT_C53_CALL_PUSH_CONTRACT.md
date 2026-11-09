# SPRINT C53: Veri-yalnız arama push'u (kapalı uygulamada Reddet + arayan kapatınca zil sussun)

> Durum: **TASARIM KİLİTLİ (2026-11-09).** PM compose (Opus). Sahip isteği. **api + mobil.** Yol haritasında **1b**.
> R7: yeni HTTP reddetme ucu bir yetki kapısıdır. Kapı WS `voice:call_reject` ile **aynı** (`otherDmMember` üyeliği); yeni bir kapı icat edilmez, mevcut mantık ortak fonksiyona taşınır. Sahip incelemesine diff sunulur.
> Çözülen ertelenmiş kalemler: D43, D62 (arama reddi + iptal ayağı; hızlı cevap C52'de), D70 (modül gövdesi mayını, ön koşul olarak).

## §0 Sorun ve karar

Bugün gelen arama push'u `title`/`body` ile gidiyor. Uygulama kapalıyken bildirimi Firebase çiziyor: **Reddet/Katıl düğmeleri yok** (D43/D62). Arayan kapatınca iptal yalnız soketle gidiyor; kapalı uygulamada **zil 30 sn sonuna kadar çalıyor** (D62 üçüncü gerekçe).

**Karar:** C50'nin veri-yalnız yolu aramaya genişletilir. Arka plan görevi mevcut gelen arama bildirimini (`presentIncomingCall`: zil kanalı, Reddet/Katıl) uygulamanın kendi kodundan gösterir. Kaynak bulgusu (expo-notifications 0.32 `ExpoHandlingDelegate.handleNotificationResponse`): uygulama ön planda değilken bildirim düğmesi yanıtı **aynı TaskManager görevini** çalıştırır. Reddet buradan HTTP ile gider. İptal için sunucu "arama bitti" push'u atar, görev zili kapatır.

**Kapsam (Revize 1, sahip kararı 2026-11-09):** 1-1 DM ve **grup DM** aramaları. Ortam ses kanallarında arama yok (yalnız katılma), kapsam dışı. Grup aramaları bugün hiç push üretmiyordu (yalnız soket; uygulaması kapalı üyeye çağrı gitmiyor). Bu bir eksik ve bu sprintte kapanır (§2.5). D87 bu sprintle kapanır.

## §1 Veri biçimi (C50 §1'e ek)
```ts
{ v: 2, kind: 'call', callChannelId: string, callerId: string, callerName: string, callerAvatarUrl: string | null,
  isGroup: boolean, groupName: string | null }   // 1-1: isGroup false, groupName null
{ v: 2, kind: 'call_end', callChannelId: string }
```
- `callChannelId` = DM kanal kimliği. C50 kuralı gereği anahtar adı `channelId` OLMAZ (expo-notifications `data.channelId`'yi Android bildirim kanalı sanıyor).
- Gönderim kuralı C50 ile aynı: bayrak + `token.format === 2` + allowlist. Aksi halde bugünkü v1 arama push'u birebir.

## §2 API

### §2.1 Gelen arama
`handleCallInvite` push'unda `v2` verilir (`kind:'call'`). `ttlSeconds: 30` korunur (v2 mesajında da `ttl`).

### §2.2 Arama bitti
`call_end` push'u callee'nin v2 tokenlarına şu anlarda gider:
- Arayan iptal etti (`voice:call_cancel`).
- Callee başka cihazında kabul etti ya da reddetti (`voice:call_accept` / `voice:call_reject` / §2.3) → **callee'nin kendi** diğer cihazları susar.
Yalnız v2 tokenlarına gider (v1 cihazlar bugünkü davranışta kalır). Bildirim olmadan veri-yalnız; `ttl` 30.
- Yeni `PushService` yöntemi `sendCallEnd(userId, callChannelId)`; bayrak kapalıyken no-op.

### §2.3 HTTP reddetme ucu
`POST /voice/calls/:channelId/reject` (JWT). Gövde yok. Davranış `voice:call_reject` ile **aynı**: `otherDmMember(channelId, userId)` bulunursa ona `voice.call_rejected` yayılır; ayrıca §2.2 gereği callee'nin diğer cihazlarına `call_end`. Üye değilse ya da kanal yoksa WS ile tutarlı olarak **200 + `{ ok: false }`** döner (envelope içinde), olay yayılmaz. Rate limit: mevcut throttler varsayılanı.
- Mantık gateway'den bir servise (ör. `CallSignalService` ya da mevcut uygun servis) çıkarılır; WS ve HTTP aynı fonksiyonu çağırır. Kopya mantık yasak.
- Hangi modül/controller'a ekleneceği dev kararı (`voice` modülü varsa orası). Swagger dahil.

### §2.5 Grup araması (Revize 1)
- **Başlatma** (`voice:group_call_start`): `voice.group_call_started` soket olayını alan **aynı üye kümesine** (çağıran hariç) `kind:'call'`, `isGroup:true`, `groupName` = kanal adı (yoksa null) push'u gider. Ek süzgeç yalnız susturma: üye o kanalı susturmuşsa (`isMuteActive`) push gitmez (1-1 kuralıyla aynı ilke). Başka yeni süzgeç yok; mevcut kapılar (`NOT_GROUP`, `requireChannelAccess`, `requireNoDmBlock`) olduğu gibi.
- **Hedefli çaldırma** (`voice:group_call_ring`): mevcut tüm kontrollerden (hedef üyelik, engel, hız sınırı, zaten odada mı) geçtikten sonra soket olayıyla birlikte hedefe aynı `kind:'call'` push'u.
- **İptal** (`voice:group_call_cancel`): `voice.group_call_canceled` alan aynı kümeye `kind:'call_end'`.
- **v1 cihazlar için grup push'u YOK** (bugün de yoktu; eski sürüm grup çağrısını tanımadığı için regresyon riski almıyoruz).
- Grupta reddet/kabul sunucuya gitmiyor (istemciler bilinçli olarak yalnız yerel yapıyor). Bu yüzden bir üyenin diğer cihazları grup çağrısında yalnız iptal ya da 30 sn zaman aşımıyla susar. Kabul edilen sınır.
- 1-1 sinyal kapısı (`CallSignalService.otherDmMember`) kanal türü **`DM` değilse null** döner (R7 daraltması, sahip onayıyla: grup DM'de "karşı taraf" rastgele ilk üye olurdu). Grup sinyalleri bu kapıyı kullanmaz.

### §2.4 Testler
v2 arama gövdesi (üst düzey title/body yok, `callChannelId`), v1 davranış değişmedi, `call_end` üç tetikte doğru alıcıya, HTTP reddet: üye → olay + `call_end`, üye değil → `ok:false`, olay yok. WS reject aynı servis yolundan geçiyor.
DoD: spec'ler yeşil, `tsc -p tsconfig.build.json` temiz. Migration yok.

## §3 Mobil

### §3.1 Ön koşul: D70
`incomingCall.ts` dosya gövdesindeki `useVoiceStore.subscribe(...)` (ve varsa başka modül-gövdesi yan etkileri) açık bir `initIncomingCall()` fonksiyonuna taşınır; arayüz kök layout'unda bir kez çağrılır. Arka plan görevi bu dosyayı **dinamik** (`require` görev içinde) yükler; `index.js` kök importlarına `incomingCall` EKLENMEZ. Açılışta `Require cycle` uyarı sayısı artmamalı.

### §3.2 Arka plan görevi (`conversationPush.ts`)
- `kind:'call'` → `presentIncomingCall(callChannelId, { id: callerId, username: callerName, avatarUrl }, { kind: isGroup ? 'group' : 'dm' })` (mevcut `IncomingCallKind` değerleri kaynaktan doğrulanır; grup adı başlıkta mevcut grup sunumu neyse o). Mevcut `isChannelRinging` koruması çift zili önler (soket + push aynı anda geldiğinde).
- `kind:'call_end'` → `dismissIncomingCall(callChannelId)`.
- **Bildirim yanıtı** (görev yükünde `actionIdentifier` varsa, expo yanıt biçimi kaynaktan doğrulanır): grup çağrısında `reject` yalnız yerel (`dismissIncomingCall`, mevcut `rejectIncomingCall` kuralı). 1-1'de `reject` + `data.type === 'incoming_call'` → HTTP reddetme ucu (erişim anahtarı yoksa `refreshAccessToken()`), sonra `dismissIncomingCall`. Hata olursa yalnız zil kapatılır (kullanıcı reddetmek istedi). `accept` → bir şey yapma (uygulama açılıyor, mevcut `useIncomingCallResponder` bekleyen yanıtı işliyor).
- Uygulama ön plandayken görev yanıtları çalışmıyor (expo bilinçli olarak); ön plan yolu bugünkü soket akışı, değişmez.

### §3.3 Reddetme istemcisi
`rejectIncomingCall` bugün soketle gönderiyor. Soket bağlıysa öyle kalır; bağlı değilse HTTP ucuna düşer (tek fonksiyon, iki yol). API istemcisine `voiceApi.rejectCall(channelId)`.

### §3.4 Sürüm
C52 ile **aynı vc60**. PM derler (kısa yol, `cmp` doğrulamalı).

## §4 Açılış
Sunucu önce gider (bayrak zaten açık; v2 arama yalnız `format: 2` cihazlara, yani vc59+). vc59'da `kind:'call'`'u tanımayan görev hiçbir şey göstermez → **vc59 telefonlarda kapalı uygulamada arama sessiz kalır.** vc59 dağıtılmadı (yalnız sahip telefonu), dolayısıyla sunucu ile vc60 aynı gün çıkar; sahip telefonu vc60'a geçene kadar etkilenir. Play'e vc59 hiç gitmez, doğrudan vc60 gider.

## §5 Sahip cihaz turu
Web'den arama (Batuhan → Okan):
1. Uygulama kapalı: zil + Reddet/Katıl düğmeleri görünüyor. Reddet → arayanın ekranında reddedildi, zil susuyor, uygulama açılmıyor.
2. Uygulama kapalı: Katıl → uygulama açılıp aramaya giriyor.
3. Uygulama kapalı: arayan kapatıyor → zil birkaç saniye içinde susuyor.
4. Arka planda ve açıkken: bugünkü davranış bozulmadı, çift zil yok.
5. Uygulama hiç açılmadan arka arkaya iki arama: ikisi de doğru çalıyor ve susuyor.
6. Açılışta çökme yok (D70).
7. Grup DM: uygulaması kapalı üyeye çağrı gidiyor (zil + düğmeler), Reddet yalnız o telefonda susturuyor, arayan kapatınca zil susuyor, susturulmuş grupta çağrı gelmiyor.

## §6 Kapsam dışı
Tam ekran gelen arama arayüzü (`USE_FULL_SCREEN_INTENT`), iOS, CallKit/ConnectionService.
