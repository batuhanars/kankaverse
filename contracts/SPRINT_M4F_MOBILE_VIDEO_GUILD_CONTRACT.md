# Sprint M4f — Mobil Görüntülü: Ortam Sesli Kanalı (Kamera)

> **Tier:** yalnız `mobile/` (+ gerekirse `web/src/i18n/tr.json`).
> `api/` sıfır · `web/` kod sıfır · **native diff sıfır → yeni dev build YOK.**
> **Track:** F2 mobil · görüntülü yarının **son** parçası ((4) 1-1 DM ✅ → (5) grup DM ✅ → **(6) ortam kanalı**).
> Bundan sonra sırada **M4p (PiP)** var; M4 fazı orada kapanır.
> **Önceki sprintler:** `SPRINT_M4D_...` (kamera altyapısı + 1-1 düzen) · `SPRINT_M4E_...` (çoğul uzak
> kamera + ızgara). Bu sprint ikisinin üzerine **tek bir kapıyı** açıyor ve **bir T&S ayağını** ekliyor.
> **🔴 R7 yüzeyi:** M4d/M4e'de olmayan bir şey var — ortam kanalında **moderatör yayını durdurabiliyor**
> (R11). İstemcinin buna uyması bu sprintin asıl işi (§3).

---

## §1 Kapsam

**Kapsam: `callKind === 'guild'` (ortam sesli kanalı) kamerası.** 1-1 DM ve grup DM davranışı
**değişmeyecek** (ikisi de cihazda doğrulandı).

| Dosya | Ne değişiyor |
|---|---|
| `src/stores/voice.ts` | `toggleCamera` kapısına `'guild'`; **§3 — sunucunun yayını kesmesine uyma** |
| `src/app/(app)/call.tsx` | kamera düğmesi kapısına guild; ızgara düzeni guild'de de açılır |
| `web/src/i18n/tr.json` | yalnız gerekirse yeni metin |

**Kapsam dışı:** mobilde moderasyon eylemleri (sustur/taşı/yayını durdur/at) · ekran paylaşımı
(mobilde hiç yok, PLAN kararı) · spotlight/konuşana odaklanma · PiP (M4p).

---

## §2 Kapının açılması (küçük kısım)

- `stores/voice.ts` `toggleCamera` kapısındaki `kind !== 'dm' && kind !== 'group'` kısıtı kalkar;
  kamera üç arama türünde de açılabilir. Kapı artık yalnız `canPublishCamera` (sunucu kararı).
- `call.tsx`'te kamera düğmesi kapısı (`isDmCall || isGroupCall`) guild'i de kapsar.
- Izgara düzeni (M4e §3) guild'de de devreye girer: **kimsenin kamerası açık değilken bugünkü tek
  sütun alt alta liste AYNEN**, kamera açılınca iki sütunlu ızgara. `anyGroupCameraOn` hesabındaki
  `isGroupCall &&` kısıtı genişletilir (yeni bir hesap yazılmaz).

Sunucu kapısı zaten yazılı ve R7'den geçmiş (`resolveVideoSources`, GUILD_VOICE dalı):
`mediaEnabled || ageGated || adultsOnly` → video; değilse video yok. Karantina ve server-mute her
yayını keser. **İstemci bunların hiçbirini yeniden hesaplamaz.**

---

## §3 🔴 Bu sprintin asıl işi — sunucu yayını kestiğinde istemci uymalı

Ortam kanalında moderatörün `MUTE_MEMBERS` yetkisi varsa **yayını durdurabilir** (R11 `stop-broadcast`,
`api/src/modules/voice/voice.service.ts`). Sunucu LiveKit'e gider ve o kullanıcının izinlerini
`canPublishSources: [MICROPHONE]`e düşürür: **video track'i düşer, ses kalır.** Bu DM'de ve grup DM'de
**yoktu** (uçlar guild kanalına özgü), o yüzden istemci tarafı hiç yazılmadı.

Bugünkü kodla ne olur: yerel kamera yayını sunucu tarafından kesilir ama `isCameraOn` `true` kalır →
düğme "kamera açık" gösterir, karşı tarafta hiçbir şey yoktur. **Bu, D51'in mobil kopyası olur.**
Ayrıca daha kötüsü: `cameraIntent` `true` kaldığı için uygulama arka plandan döndüğünde kamera
**kendiliğinden yeniden açılmaya çalışır** — moderatörün kararıyla çekişir.

**Zorunlu davranış:**
1. Yerel kamera track'i **bizim isteğimiz dışında** düştüğünde (`RoomEvent.LocalTrackUnpublished`,
   kaynak `Camera`) → `isCameraOn=false`, `localCameraPublication=null` **ve `cameraIntent=false`**.
   🔴 Niyetin sıfırlanması şart: yoksa öne dönüşte moderasyon kararı sessizce delinir.
2. Yerel izinler değiştiğinde (`RoomEvent.ParticipantPermissionsChanged`, yerel katılımcı) →
   `canPublishCamera` **sunucunun yeni kararına** göre güncellenir (kamera artık izinli değilse düğme
   kaybolur, tekrar izinliyse geri gelir).
3. Kullanıcıya **sessiz kalınmaz**: yayın kesildiğinde kısa bir bilgi gösterilir (mevcut `Alert`/uyarı
   deseni; yeni bir bileşen yazılmaz). Metin **neden** söylemez ("moderatör" demez) — yalnız kameranın
   kapatıldığını bildirir. Gerekçe: kimin yaptığı bilgisi istemcide yok ve tahmin edilmez.

> Not: bu üç madde 1-1 DM ve grup DM'i de **iyileştirir** (aynı olaylar orada da gelebilir), ama
> tetikleyicisi yalnız ortam kanalında var. Ayrı bir dal yazılmaz, davranış her üç türde de aynıdır.

---

## §4 T&S (R7)

- Kapı sunucuda: `resolveVideoSources` GUILD_VOICE dalı. İstemci kurmaz, gevşetmez.
- 🔴 **C7 farkı — bu, minörün video GÖREBİLDİĞİ tek bağlam:** genel kanalda `mediaEnabled=true` ise
  minör dahil herkes video alabilir (sahip kararı 2026-06-30, brief §4'ün bilinçli gevşetmesi).
  Erişim kapısı `ageGated`/`adultsOnly` kanallara minörü zaten sokmuyor. **İstemci bu ayrımı bilmez,
  yalnız `canPublishCamera`ya bakar** — yaş bandı istemciye hiç inmez ve inmemeli.
- `canPublishCamera=false` → kamera düğmesi çizilmez (M4d §7 gerekçesi aynen).
- Kayıt YOK. Ekran paylaşımı YOK.

---

## §5 DoD

### Kod tarafı (dev)
- [ ] `npm run typecheck` · `npm run lint` temiz
- [ ] `api/` + `web/` kod diffi sıfır (i18n hariç) · native diff yok · yeni bağımlılık yok
- [ ] §3'ün üç maddesi yazıldı; `cameraIntent` sıfırlaması **atlanmadı**

### Cihazda (SAHİPTE)
- [ ] Ortam sesli kanalında kamera açılıyor, diğerleri görüyor (ızgara)
- [ ] Kimse kamera açmadığında ortam kanalı görünümü **bugünkü gibi** (tek sütun, alt alta)
- [ ] 🔴 **Web'den moderatör olarak "yayını durdur"** → mobilde kamera **düşüyor**, düğme kapalıya
      dönüyor, kullanıcı bilgilendiriliyor, **ses devam ediyor**
- [ ] Aynı senaryodan sonra uygulamayı arka plana alıp geri dön → kamera **kendiliğinden geri
      AÇILMIYOR** (moderasyon kararı korunuyor)
- [ ] 1-1 DM ve grup DM görüntülü arama **regresyonsuz**
- [ ] Genel kanalda (`mediaEnabled`) ve yaş-kapılı kanalda davranış sunucunun dediği gibi

---

## §6 Dev'e notlar

1. §3 §2'den **daha önemli**. Kapıyı açmak birkaç satır; moderasyona uyma kısmı bu sprintin sebebi.
2. `cameraIntent` sıfırlamasını unutma — sessiz bir T&S delinmesi üretir, testte de zor görünür
   (yalnız arka plana alıp dönünce ortaya çıkar).
3. Web bu üç maddeyi yapmıyor olabilir; **web'e dokunma**, gördüğünü raporla (D51 gibi borç açarım).
4. Sözleşmede olmayan ihtiyaç (özellikle `api/`) → **DUR ve bildir.**
5. Cihaz testi yapma, commit atma.
