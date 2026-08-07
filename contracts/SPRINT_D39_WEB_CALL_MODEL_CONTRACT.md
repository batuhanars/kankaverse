# Sprint D39 — Web DM Arama Modeli: "oda önce"

> **Tier:** yalnız `web/`. **`api/` ve `mobile/` diffi SIFIR.** Sunucu sözleşmesi hiç değişmiyor:
> aynı endpoint, aynı WS olayları, aynı payload'lar. Değişen tek şey web'in bu olayları **ne zaman**
> kullandığı.
>
> **Kaynak:** PLAN.md D39 (2026-08-06 kaydı). Sahip kararı 2026-08-07 ile tetikleyici öne alındı
> (kayıtta "M4 kapanışı" yazıyordu). Risk büyük ölçüde düşmüştü: oda-önce modeli M4a-1'de cihazda
> zaten doğrulandı, yani "mobil klasiğe döner, bu borç düşer" ihtimali fiilen kalmadı.

---

## §0 Neden

Aynı özellik iki istemcide farklı davranıyor. Discord DM aramasını klasik telefon modelinden
çıkarmış; M4a mobili bunu uyguladı, web eski modelde kaldı.

**Bugün web (klasik telefon):** telefon düğmesi `voice:call_invite` gönderir, arayan "Aranıyor…"
barında **bekler**, odaya ancak `voice.call_accepted` gelince girer.

**Olacak (oda önce):** telefon düğmesi arayanı **doğrudan odaya sokar**, karşı taraf çalar, arayan
odada bekler. `voice.call_accepted` yalnız "çalıyor" göstergesini düşürür.

Bozulma yok: uçlar ortak, sunucu değişmiyor ve iki model **bugün de birbiriyle çalışıyor**. Bu
sprint web'i mobile hizalıyor.

🔴 **Kazanç sadece tutarlılık değil:** klasik modelde web'den arayan odaya girmediği için mobilde
"arama sürüyor" şeridi hiç çıkmıyordu. Bu revizyon o halkayı da kapatıyor.

---

## §1 Kapsam

**Dokunulacak dosyalar** (bu liste sözleşmedir; dışına çıkmak sapmadır → DUR ve bildir):

| Dosya | İş |
|---|---|
| `web/src/composables/useCall.ts` | `startCall` davetten sonra beklemeden katılır; arayan-tarafı 30 sn zaman aşımı **kalkar** |
| `web/src/composables/useSocket.ts` | `call_accepted` artık `join` ETMEZ (zaten odadayız); `call_rejected` odadan çıkarır |
| `web/src/stores/voice.ts` | yalnız-kalma zaman aşımı ikiye ayrılır (§4) |
| `web/src/components/layout/OutgoingCallBar.vue` | kalkar; yerine oda içinde bekleyen-katılımcı gösterimi (§5) |
| `web/src/views/home/components/DmCallPanel.vue` + `components/shared/VoiceTile.vue` | bekleyen katılımcı kutucuğu (§5) |
| `web/src/stores/call.ts` | `pendingVideoCall` sadeleşir (§6) |
| `web/src/views/home/components/DmConversation.vue` | `setPendingVideoCall` çağrısı düşer; ring "İptal ✕" düğmesi kalkar (§5 gerekçesi) |
| `web/src/components/layout/UserCard.vue` | `OutgoingCallBar` import/kullanımı düşer |
| `web/src/i18n/tr.json` | yeni anahtar(lar), §8 |

> 🔴 **PM düzeltmesi 2026-08-07 (dev bulgusu):** bu tablonun ilk hâli bekleyen katılımcı kutucuğu
> için **`VoiceRoomView.vue`** diyordu — **yanlıştı**. O bileşen yalnız guild ses kanalı yolu
> (`GUILD_VOICE`, `GuildChannelView`'dan mount ediliyor); DM aramaları tamamen `DmCallPanel.vue`
> üzerinden çiziliyor ve guild kanalları hiç çalmıyor. Dev doğru dosyayı bulup **bildirdi**, sessizce
> geçmedi. Son iki satır (`DmConversation`, `UserCard`) da ilk listede eksikti: biri `pendingVideoCall`
> kaldırılınca derlenmiyor, diğeri silinen bileşeni import ediyor — ikisi de kaçınılmazdı.

`api/`, `mobile/`, `desktop/`, `landing/` diffi **sıfır**.

---

## §2 Akışın yeni hâli

```
Arayan telefon düğmesine basar
  → callInvite(channelId)  (ack bekle — nötr hata yolu DEĞİŞMEZ)
  → ack.ok === false  → "Şu anda ulaşılamıyor." + DUR (odaya girilmez)
  → ack.ok === true   → callStore.setOutgoing(channelId)        // "çalıyor" göstergesi
                      → voiceStore.join(channelId, ...)          // 🔴 BEKLEMEDEN odaya gir
```

Sonra dört bitiş yolu:

| Olay | Bugün | Olacak |
|---|---|---|
| `voice.call_accepted` | `clearOutgoing` + **`join`** | `clearOutgoing` **yalnız**. İkinci `join` YOK, zaten odadayız |
| `voice.call_rejected` | `clearOutgoing` + nötr mesaj | `clearOutgoing` + nötr mesaj + **`leave()`** (odadan çık) |
| Arayan iptal eder | `callCancel` + `clearOutgoing` | `callCancel` + `clearOutgoing` + **`leave()`** |
| Hiç cevap gelmez | 30 sn sonra `cancelCall` | **arayan-tarafı zaman aşımı YOK** — oda ömrü belirler (§4) |

🔴 **`leave()` çağrılırken hâlâ "çalıyor" durumundaysak `voice:call_cancel` GÖNDERİLMELİ.** Yoksa
karşı tarafın zili asılı kalır. Bu, arayanın odadan hangi yolla çıktığından bağımsızdır: iptal
düğmesi, sekmeyi kapatma, "Bağlantıyı Kes" — hepsi aynı noktadan geçmeli. M4a-1'in dersi burada
birebir geçerli: **kapanış yollarını tek noktadan yönet**, dört ayrı yere `callCancel` serpme.

---

## §3 🔴 `call_accepted` çift-join tuzağı

Bugün `useSocket.ts`'teki `call_accepted` işleyicisi `voiceStore.join` çağırıyor. Bu satır
**kaldırılmazsa** arayan odaya ikinci kez katılmaya çalışır. Belirtisi tahmin edilebilir değildir
(LiveKit yeniden bağlanma, ses kesilmesi, hayalet katılımcı), dolayısıyla "zararsızdır, kalsın"
denmez.

Aynı şekilde `startCall`'daki `join` **ack'ten sonra** gelir: ack `{ ok: false }` ise odaya
girilmez. Sunucu daveti reddettiyse (engellenme/minör/bekleyen istek) arayanın boş odada oturması
bilgi sızıntısı olmasa da anlamsızdır.

---

## §4 🔴 Yalnız-kalma zaman aşımı ikiye ayrılır

**Bu, bu sprintin en kolay atlanan parçası.** Bugün `voice.ts`'te tek sabit var:

```
ALONE_TIMEOUT_MS = 60_000   // yalnız kalınca 60 sn sonra otomatik bitir
```

Klasik modelde arayan odaya ancak karşı taraf kabul edince girdiği için **hiç yalnız kalmıyordu**.
Oda-önce modelde arayan girer girmez yalnız kalır → bu sabit sessizce **"cevapsız arama süresi"**
hâline gelir ve arama 60 saniyede düşer. Mobil bunu çözmüş; web aynı ayrımı almalı:

```
ALONE_TIMEOUT_NEVER_JOINED_MS = 3 * 60_000   // hiç kimse katılmadı (arayan bekliyor)
ALONE_TIMEOUT_LEFT_MS         = 60_000       // biri katılıp sonra çıktı (bugünkü davranış)
```

Ayrım `peerEverJoined` bayrağıyla yapılır: odaya bizden başkası **bir kez bile** katıldıysa 60 sn,
katılmadıysa 3 dk. Referans uygulama `mobile/src/stores/voice.ts` (sabitler + `peerEverJoined`
kullanımı orada). **Kopyala-yapıştır değil**, aynı ayrımı web'in kendi store yapısında kur; iki
istemcinin sayıları aynı olmalı.

⚠️ `autoEndWhenAlone` bayrağı **korunur**: guild ses kanalında bu mekanizma hiç çalışmaz
(`autoEndWhenAlone=false`), yalnız DM/grup çağrısında geçerlidir. Bu ayrımı bozma.

---

## §5 Arayüz — "Aranıyor" barı yerine bekleyen katılımcı

**`OutgoingCallBar.vue` kalkar.** Arayan artık odada olduğu için `VoiceConnectedBar` zaten
görünüyor; ikisi üst üste binerdi.

Yerine, ses odası görünümünde **bekleyen katılımcı kutucuğu**: karşı tarafın avatarı ve adı
**soluk** çizilir, altında "Çalıyor…". Kabul gelince kutucuk normal katılımcıya döner (LiveKit
katılımcısı olarak zaten gelir), ret/iptal/zaman aşımında kaybolur.

Mobil pariteti: M4a-1 DoD "cevap gelmezken karşı tarafın kutucuğu soluk + 'Çalıyor…' duruyor"
maddesi cihazda doğrulandı; web aynısını yapıyor. Karşı tarafın adı/avatarı DM kanalından zaten
biliniyor (`dmStore`), yeni istek gerekmez.

**Geri-zil (ringback):** bugün `OutgoingCallBar`'ın `watch`'ında. Bar kalkınca bu sahipsiz kalır.
Ringback `callStore.outgoing` yaşam döngüsüne bağlı kalmaya devam eder; yeni sahibi çağrı yaşam
döngüsünün zaten sahibi olan yerdir (`useCall`). Dev başka bir yer daha uygun buluyorsa **gerekçesini
raporlar**; sessizce bir bileşene gömmez. Ses dosyaları ve `useCallSounds` API'si değişmez.

⚠️ Odaya girer girmez LiveKit sesi de açılıyor: geri-zil ile bağlanma sesi (`playConnect`) üst üste
binmemeli. Bugünkü sıralama korunur, yeni ses eklenmez.

---

## §6 Görüntülü arama sadeleşir

`pendingVideoCall` bugün "kabul gelince kamerayı aç" niyetini taşıyor ve `call_accepted`
işleyicisinde `consumePendingVideoCall()` ile tüketiliyor. Oda-önce modelde arayan **hemen** girdiği
için niyet doğrudan `join(..., { startWithCamera })`'a geçer; saklanacak bir şey kalmaz.

`pendingVideoCall` / `consumePendingVideoCall` **kaldırılır**. Ölü kalırlarsa bir sonraki okuyan
"kabul sonrası kamera" diye bir akış olduğunu sanar.

---

## §7 T&S (R7-hafif)

Bu sprint **yeni bir kapı kurmuyor, var olanı gevşetmiyor**. Tüm kapılar sunucuda (`canDm`), web
yalnız sonucu gösteriyor.

- **Nötr mesaj DEĞİŞMEZ.** `ack.ok === false` → "Şu anda ulaşılamıyor." Tek metin. `error` kodu
  açımlanmaz, ayrıştırılmaz, farklı metne çevrilmez. (`DM_NOT_ALLOWED` bilerek jeneriktir:
  engellenme, ilişki durumu, minör olma ve bekleyen istek ayrımı kullanıcıya **sızmaz**.)
- Reddedilme mesajı da bugünkü hâliyle kalır; "meşgul", "reddetti", "engelledi" ayrımı **üretilmez**.
- Yeni bir ifşa yüzeyi yok: bekleyen katılımcı kutucuğu, arayanın zaten bildiği (DM'de karşısında
  duran) kişinin adı ve avatarıdır.

---

## §8 i18n

Kullanıcıya görünen hiçbir string koda gömülmez, kaynak `web/src/i18n/tr.json`. "Çalıyor…" için
`voice.*`/`call.*` altında **mevcut bir anahtar varsa yeniden kullanılır** (mobil `mobile.call.*`
anahtarlarını web'e taşıma, o yön yanlış). Yeni anahtar gerekiyorsa `call.*` altına eklenir.

🔴 `tr.json` uyarısı: bu dosyaya iki oturum aynı anda yazabilir. Commit edilmemiş çalışma varken
`git checkout -- web/src/i18n/tr.json` **çalıştırılmaz** (19 anahtar bir kez böyle kayboldu).

---

## §9 Kapsam dışı (bilerek)

- **Grup DM çağrısı akışı** (`startGroupCall`) — zaten oda-önce çalışıyor, dokunulmaz
- **Guild ses kanalı** — bu modelin dışında, `autoEndWhenAlone=false` ile ayrık kalır
- Geri-zil sesinin kendisi, ses seçimi, yeni ses efekti
- Mobil tarafta herhangi bir değişiklik (mobil **referans**, hedef değil)
- Cevapsız arama kaydı / DM'de "cevapsız arama" satırı — ayrı iş

---

## §10 DoD

**Dev'de:**
- [ ] `npm run typecheck` — 🔴 **yalnız `vue-tsc -b`** (bilinen 6 önceden-var hata; fazlası senin).
      `--noEmit` yalancı yeşildir, hiçbir şeyi denetlemez
- [ ] ~~`npm run lint` temiz~~ — 🔴 **madde geçersiz (PM hatası, 2026-08-07):** `web/`'de ne `lint`
      script'i ne ESLint yapılandırması var (`api/eslint.config.mjs` ve `mobile/eslint.config.js`
      varken web tier'ında hiç kurulmamış). Çalıştırılacak bir şey yok; borç **D42** olarak kaydedildi
- [ ] `api/`, `mobile/`, `desktop/`, `landing/` diffi **sıfır**
- [ ] Gömülü kullanıcı metni yok; renk/ölçü `--kv-*` token'larından
- [ ] `pendingVideoCall` ve `consumePendingVideoCall` gerçekten **kaldırıldı** (ölü kod bırakılmadı)

**Tarayıcıda (iki hesap gerekir):**
- [ ] 🔴 Web'den ara → **arayan anında odaya giriyor**, karşı tarafın kutucuğu soluk + "Çalıyor…"
- [ ] Karşı taraf kabul edince kutucuk normale dönüyor, **ses kesilmiyor**, ikinci bağlanma yok
- [ ] Reddedilince arayan **odadan çıkıyor** + nötr mesaj görüyor
- [ ] Arayan iptal edince karşı tarafın zili **susuyor** (`call_cancel` gidiyor)
- [ ] Arayan sekmeyi kapatınca da zil susuyor (kapanış tek noktadan geçiyor)
- [ ] Hiç cevap gelmezse arama **60 saniyede DÜŞMÜYOR**; 3 dakika yaşıyor (§4 ayrımı çalışıyor)
- [ ] Karşı taraf katılıp sonra çıkarsa arama 60 saniyede bitiyor (eski davranış korunuyor)
- [ ] Görüntülü arama düğmesi: kamera **baştan** açık giriyor
- [ ] Ulaşılamayan kişiye arama: nötr mesaj, **odaya girilmiyor**
- [ ] 🔴 **Odaya katılma başarısız olursa arama kilitlenmiyor** (inceleme bulgusu 2026-08-07):
      davet gitti ama `join` patladı (token 403 / LiveKit hatası / ağ) → "çalıyor" durumu temizlenir,
      geri-zil susar, iptal düğmesi ölü kalmaz, karşı tarafa `call_cancel` gider.
      Tarayıcıda üretmesi zor; **kodda kapatıldığı doğrulanır** (`leave()` bağlanma aşamasındaki
      kanal kimliğini de görüyor mu)
- [ ] **Web ↔ mobil uçtan uca:** web'den arayınca mobilde "arama sürüyor" şeridi çıkıyor,
      mobilden katılınca iki taraf birbirini duyuyor
- [ ] Guild ses kanalında regresyon yok (yalnız kalınca kendiliğinden düşmüyor)

---

## §11 Dev'e notlar

1. **Kapanış yollarını tek noktadan yönet.** M4a-1'de aynı sınıf kusur iki kez çıktı: `leave()`
   yeniden girişe açıktı ve nötr mesajı eziyordu. Burada da `leave` + `call_cancel` ilişkisi tek
   yerde kurulmalı, çağrı noktalarına serpilmemeli.
2. **Referans mobilde duruyor.** `mobile/src/stores/voice.ts` bu modeli cihazda doğrulanmış hâlde
   uyguluyor. Bir davranış belirsiz kaldığında **önce oraya bak**, tahmin etme.
3. **Sözleşmede olmayan bir şey gerekiyorsa DUR** ve bildir. Bu sprintte bir dosya listesi var (§1);
   listede olmayan bir dosyaya ihtiyaç duyman, sözleşmenin eksik olduğunun işaretidir.
