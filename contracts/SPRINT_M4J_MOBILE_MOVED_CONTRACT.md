# Sprint M4j — Mobilde "Taşındın" Akışı (D55)

> **Tier:** yalnız `mobile/`. `api/` sıfır · `web/` sıfır · native diff sıfır → **yeni build YOK.**
> **Kaynak:** sahip cihaz turu 2026-08-08 — moderatör mobil kullanıcıyı başka ses kanalına taşıdı;
> kullanıcı hedefte görünmedi, mobilde bağlantı hatası çıktı.

## §0 Kusur
Sunucu (`voice.service.ts` `moveParticipant`): kullanıcıyı kaynak LiveKit odasından **çıkarır** ve
`voice.moved { fromChannelId, toChannelId }` olayını **o kullanıcıya** gönderir. Hedefe katılmak
**istemcinin işidir** (yeni token mint → sustur/karantina yeniden uygulanır).

Web bunu yapıyor (`web/src/composables/useSocket.ts:445`). **Mobil bu olayı hiç dinlemiyor.**
Sonuç: kullanıcı odadan düşüyor, hedefe katılmıyor, moderatör onu hiçbir yerde göremiyor; mobilde
bu bir **bağlantı hatası** gibi görünüyor.

## §1 Kapsam
- `src/realtime/socket.ts` (veya olayların dinlendiği yer): `voice.moved` dinlenir
- `src/stores/voice.ts`: taşınma akışı — kaynaktan düşüş **hata sayılmaz**, hedefe katılınır
- Gerekirse `src/app/(app)/call.tsx`: ekran hedef kanalda kalır

## §2 Davranış
1. `voice.moved` gelince: **hedef kanala katıl** (`startOrJoin`, `kind:'guild'`, davet YOK).
2. 🔴 **Kopma hata gösterilmez.** Sunucu kicki taşımanın parçası; bugünkü `Disconnected` dalı
   "Bağlantı kesildi." diyor. Taşınma sürerken bu **bastırılır** — desen hazır: `emergencyPending`
   aynı işi acil akışı için yapıyor (`stores/voice.ts`), aynısı kurulur.
3. Kullanıcı **bilgilendirilir** (web'de `voice.movedToast` var; mobilde mevcut uyarı deseniyle).
4. Hedefe katılım **başarısız olursa** (yaş kapısı, dolu kanal, izin) kullanıcı sessiz bırakılmaz:
   sebebi sunucudan gelen Türkçe mesajla gösterilir. 🔴 Sessiz başarısızlık yasak.
5. Uygulama arka plandayken de taşınma çalışmalı (kullanıcı ekrana bakmıyor olabilir).

## §3 Kanal adı
Arama ekranı `callChannelName` gösteriyor. Mobilde kanal store'u yok; ad elde edilemiyorsa
**boş/jenerik** geçilir, ekran çökmez. Ad için yeni bir uç çağırma, yeni store kurma.

## §4 DoD
### Kod tarafı
- [ ] `npm run typecheck` · `npm run lint` temiz · `api/`+`web/` diffi sıfır · native diff yok
- [ ] Taşınma sırasında "Bağlantı kesildi." **gösterilmiyor**
### Cihazda (SAHİPTE)
- [ ] Webden mobil kullanıcıyı başka ses kanalına taşı → mobil **hedef kanalda** beliriyor
- [ ] Moderatör hedef kanalda kullanıcıyı **görüyor**
- [ ] Mobilde hata ekranı/"bağlantı kesildi" **çıkmıyor**, taşındığı bilgisi görünüyor
- [ ] Dolu/yaş-kapılı hedefe taşımada kullanıcı **sebebi görüyor**
- [ ] 1-1 DM · grup DM · ortam kanalı sesli+görüntülü **regresyonsuz**

## §5 Dev'e notlar
1. `emergencyPending` desenini oku, aynısını taşınma için kur — yeni mekanizma icat etme.
2. `api/`'ye dokunma; sunucu tarafı doğru ve R7'den geçti.
3. Cihaz testi yapma, commit atma.
