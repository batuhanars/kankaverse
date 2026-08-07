# Sprint M4b — Mobil Grup DM Sesli + Zil Sesi Düzeltmesi (D44)

> **Tier: yalnız `mobile/`.** `api/` ve `web/` diffi **SIFIR** (i18n kaynağı hariç). Sunucu bu işi
> Sprint V2'den beri yapıyor: `voice:group_call_start` ve `voice.group_call_started` canlı.
>
> **M4 sesin son durağı.** M4a (1-1 DM) ve M4c (ortam kanalı) cihazda doğrulandı; grup DM ikisinin
> arasında duruyor. Bu sprint bitince M4 sesli tamamlanır, sıradaki faz görüntülü olur.
>
> 🔴 **İki iş tek sprintte, bilinçli:** grup DM sesli + [[D44]] zil sesi normalizasyonu. Gerekçe
> D44'ün **native build** gerektirmesi (ses dosyası native varlık) ve M4b'nin zaten bir cihaz turu
> gerektirmesi. Ayrı yapılsalar iki build, iki tur olurdu. Üçüncü bir iş **eklenmeyecek** — [[D43]]
> (push eylem düğmeleri) bilerek dışarıda, o çalışan bir yolu riske atıyor ve karışık bir turda
> teşhisi zorlaştırırdı.

---

## §0 Bugün ne var, ne yok

**Sunucu tarafı hazır ve M4a'dan farklı:**
- `voice:group_call_start` → ack `{ ok, error? }`; kanal `GROUP_DM` değilse `NOT_GROUP`
- Diğer üyelere `voice.group_call_started` yayılır: `{ channelId, by: { id, username } }`
- 🔴 **Çalma YOK.** Grup DM'de kimsenin telefonu çalmaz; olay yalnız **bilgilendirmedir**.
  Web bunu böyle uyguluyor (`useSocket.ts:468` → `callStore.setNotice`), mobil aynısını yapar.

**Mobilde bugün:** telefon düğmesi ve "sesli arama sürüyor" şeridi `dm/[id].tsx`'te
`isDm ? … : undefined` ile **yalnız 1-1 DM'de** çiziliyor (M4a §12 kapsam dışı bırakmıştı).
Grup DM'de sesli aramaya hiçbir giriş yok.

🔴 **Tuzak:** `handleCallPress` bugün ayrım yapmadan `startOrJoin(channelId, title)` çağırıyor.
Düğme grup DM'de açılır da bu yol kullanılırsa, `startOrJoin`in DM dalı `voice:call_invite`
gönderir ve **sunucu `NOT_DM` döner** (`handleCallInvite` ilk kontrolü) → kullanıcı sebepsiz yere
"Şu anda ulaşılamıyor" görür. Grup DM **kendi sinyalini** kullanmak zorunda.

---

## §1 Kapsam

| Dosya | İş |
|---|---|
| `src/stores/voice.ts` | `kind: 'group'` dalı — grup sinyali + yalnız-kalma davranışı (§2, §3) |
| `src/app/(app)/dm/[id].tsx` | grup DM'de telefon düğmesi + "sese katıl" şeridi (§4) |
| `src/realtime/socket.ts` | `voice:group_call_start` gönderimi + `voice.group_call_started` alımı (§2, §5) |
| `mobile/assets/sounds/incoming_call_channel.wav` | D44 — ses normalizasyonu (§6) |
| `web/src/i18n/tr.json` | yeni `mobile.call.*` anahtarları (§7) |

Listede olmayan dosyaya ihtiyaç → **DUR ve bildir.**

---

## §2 Katılma — grup kendi sinyalini kullanır

M4c `startOrJoin`e `kind: 'dm' | 'guild'` ekledi. Grup DM **üçüncü** bir dal: `kind: 'group'`.

| | 1-1 DM (`dm`) | Grup DM (`group`) | Ortam kanalı (`guild`) |
|---|---|---|---|
| Sinyal | `voice:call_invite` | **`voice:group_call_start`** | yok |
| Karşı taraf çalar mı | **evet** | **hayır** (yalnız bilgilendirme) | hayır |
| "Çalıyor…" göstergesi | evet | **hayır** | hayır |
| Yalnız kalınca düşer mi | evet | **evet** (§3) | hayır |

- Ack `{ ok: false }` → nötr mesaj, odaya **girilmez** (DM ile aynı kural). `NOT_GROUP`/`FORBIDDEN`
  ayrımı **kullanıcıya açımlanmaz**, tek metin.
- Odada zaten biri varsa (`useVoicePresenceStore`) sinyal **gönderilmez**, doğrudan katılınır —
  M4a'nın "tekrar çaldırmak spam olur" kuralının grup karşılığı: her katılan yeniden bildirim
  yollamaz.
- `didInvite` grup dalında **her zaman false**.

🔴 **DM ve guild dallarının davranışı DEĞİŞMEYECEK.** İkisi de cihazda doğrulandı ve bugün sahibin
elinde çalışıyor. DoD'da ayrı regresyon maddeleri var.

---

## §3 Yalnız kalma — grup DM, guild DEĞİL

Grup DM'de yalnız-kalma zaman aşımı **AÇIK** (DM gibi), ortam kanalındaki gibi kapalı **değil**.

Gerekçe: grup DM bir çağrıdır, bir mekân değil. Kimse katılmazsa sonsuza kadar açık kalmamalı.
Web de böyle yapıyor (`useCall.ts:78` → `join(channelId, { autoEndWhenAlone: true })`).

M4c'nin `autoEndWhenAlone = !isGuild` hesabı bunu **zaten doğru veriyor** (grup → `true`). Dev bunu
doğrular ve **yeni bir koşul eklemez**; eklemesi gerekiyorsa bir şeyi yanlış anlamış demektir.

M4a'nın iki sabiti (3 dk hiç katılmadıysa · 60 sn katılıp çıktıysa) grup DM'de de geçerli.

---

## §4 Arayüz

**Telefon düğmesi** başlıkta, 1-1 DM'dekiyle aynı yerde ve aynı ölçüde (≥44dp dokunma hedefi,
D37 dersi). Grup DM'de de görünür.

**"Sese katıl" şeridi** (`OngoingCallBanner`): grup DM'de birileri odadayken görünür, kimlerin
olduğunu gösterir. 1-1 DM'de zaten var, aynı bileşen kullanılır — yeni bileşen yazılmaz.

**Arama ekranı:** M4c'de ızgaraya açıldı, grup DM'de **aynen kullanılır**. Yeni ekran, yeni düzen,
yeni "tek başınasın" metni **yok** — grup DM için mevcut metinler yeterliyse yenisi eklenmez
(§7 kararı dev'de, gerekçesiyle raporlar).

**Sohbet düğmesi** grup DM'de **görünür** (1-1 DM gibi) — grup DM'in metin akışı var, ortam ses
kanalından farkı bu. M4c'de `onOpenChat` opsiyonel yapılmıştı; grup dalı onu **geçirir**.

---

## §5 Gelen bildirim — çalma yok

`voice.group_call_started` alınınca:
- **Zil çalmaz, bildirim gösterilmez, ekran açılmaz.** M4a-2'nin `presentIncomingCall` yolu bu
  olayda **kullanılmaz**.
- Kullanıcı o DM'i açtığında "sese katıl" şeridini görür (§4). Uygulama içindeyse hafif bir
  bilgilendirme (toast) kabul edilebilir; web'in `setNotice` karşılığı.

🔴 Bu bilinçli bir kısıtlama, eksiklik değil: grup DM'de her katılan herkesin telefonunu çaldırsaydı
üç kişilik bir grup üç kez çalardı. Sahip isterse ayrı bir sprintte ele alınır.

---

## §6 D44 — zil sesi normalizasyonu

`mobile/assets/sounds/incoming_call_channel.wav` **duyulmuyor**. Ölçüldü: dosya teknik olarak
sağlam (30.0 sn, 22050 Hz mono PCM s16, kaynakla birebir aynı içerik) ama **tepe -14.9 dB /
ortalama -28.4 dB** — tam ölçeğin ~%18'i. Bildirim sesleri sistem tarafından zaten kısılarak
çalınır; medya akışından duyulan bir dosya bildirim akışında duyulmayabilir.

- Tepe **~-1 dB**'ye normalize et (`ffmpeg` `loudnorm` veya basit tepe normalizasyonu). Süre,
  format, kanal sayısı ve örnekleme hızı **değişmeyecek** (30 sn / mono / 22050 / s16) — yalnız
  kazanç. Yeni boyutu ve yeni tepe/ortalama ölçümünü **raporla**.
- Kaynak yine `incoming-call.wav`; üretim komutunu `incomingCall.ts` dosya başı yorumunda
  **güncelle** (orada mevcut reçete yazılı).
- Kanal kimliği **DEĞİŞMEZ** (`incoming_call_v3`) — ses dosyasının içeriği değişiyor, kanal ayarı
  değil. Kimlik değişirse `api/`deki `androidChannelId` ile ayrışır (M4c'de kayıt altına alındı).

⚠️ Native varlık → **yeni dev build**. Yerelde `expo prebuild` + `gradlew` ile derle **ve
emülatörde aç**; EAS'a gönderme, sahip alacak.

---

## §7 i18n

Kullanıcıya görünen hiçbir string koda gömülmez. Kaynak `web/src/i18n/tr.json` (**import edilir,
kopyalanmaz**). Mevcut `call.*` / `mobile.call.*` anahtarları **yeniden kullanılır**; grup DM için
gerçekten yeni bir metin gerekiyorsa `mobile.call.*` altına eklenir ve **neden gerektiği raporlanır**.

🔴 Commit edilmemiş çalışma varken `git checkout -- web/src/i18n/tr.json` **çalıştırılmaz**.

---

## §8 T&S

- Kapılar sunucuda: `group_call_start` `requireChannelAccess` + `requireNoDmBlock` ile süzülüyor.
  İstemci kapı kurmaz, gevşetmez, sunucunun kararını **açımlamaz** (tek nötr metin).
- Engellenen bir üyenin bulunduğu grup DM'de sunucu ne diyorsa o geçerli; istemci kendi listesini
  süzmez.
- Video ve ekran paylaşımı mobilde **yok**, düğme çizilmez.

---

## §9 Kapsam dışı

- [[D43]] uygulama ölüyken push eylem düğmeleri — **bilerek dışarıda**, ayrı tur (§ giriş notu)
- Görüntülü her biçimiyle (M4d-M4f)
- Grup DM'de çalma/bildirim (§5 kararı)
- R11 moderasyon eylemlerinin mobil arayüzü
- [[D45]] presence aboneliğinin tek-değerli izleyicisi — `realtime/socket.ts`'e dokunuluyor ama
  **yalnız grup sinyali için**; D45'in `Set` düzeltmesi bu sprintte yapılmaz

---

## §10 DoD

**Dev'de:**
- [ ] `npm run typecheck` · `npm run lint` · `npx expo-doctor` temiz
- [ ] `api/` ve `web/` diffi sıfır (`tr.json` hariç)
- [ ] Yerelde `expo prebuild` + `gradlew` derlendi **ve emülatörde açıldı** (D44 native)
- [ ] Yeni ses dosyasının tepe/ortalama seviyesi ölçüldü ve raporlandı

**Cihazda (SAHİPTE):**
- [ ] 🔴 **Zil sesi DUYULUYOR** (D44). Web'den 1-1 ara, telefon çalsın
- [ ] 🔴 Telefonu **sessize al**, tekrar ara: zil **çalmıyor**, titreşim var → [[D40]] kapanır
- [ ] Grup DM'de telefon düğmesi görünüyor, basınca odaya giriliyor
- [ ] Diğer üyelerin telefonu **ÇALMIYOR** (§5 — bilinçli); o DM'i açınca "sese katıl" şeridi var
- [ ] İkinci kişi katılınca ızgarada iki kutucuk, konuşan işaretleniyor
- [ ] Grup DM'de kimse katılmazsa arama **3 dakikada** düşüyor (§3 — ortam kanalından farkı bu)
- [ ] Sohbet düğmesi grup DM'de **var** (ortam kanalında yoktu)
- [ ] 🔴 **REGRESYON:** 1-1 DM araması eskisi gibi (çalma, kabul/reddet, cevapsız düşme)
- [ ] 🔴 **REGRESYON:** ortam ses kanalı eskisi gibi (tek başına 5 dk atılmama dahil)

---

## §11 Dev'e notlar

1. **Üç dal artık var** (`dm` · `group` · `guild`) ve ikisi cihazda doğrulanmış durumda. Yeni dalı
   eklerken diğer ikisinin kod yolunu değiştirme; M4c'de `alreadyOngoing`i guild'de zorlayarak bunu
   tek noktadan yapmıştın, aynı disiplin.
2. **Cihazın davranışını varsayma, ölç.** Bu fazda üç kez ders alındı: `expo-notifications` kanalı
   trigger'dan okuyor (native kaynakta yazıyordu), ses dosyasının duyulmaması kulakla değil ölçümle
   anlaşıldı, prettier Vue şablonlarını bozdu ve tip denetimi yeşil döndü.
3. **Sözleşmede olmayan bir şey gerekiyorsa DUR** ve bildir. §1'de dosya listesi var.
4. **Sunucu otoritedir.** Token, katılımcı listesi ve izin bayrakları sunucudan gelir.
