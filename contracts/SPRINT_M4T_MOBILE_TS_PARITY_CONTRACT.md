# Sprint M4t — Mobil T&S Pariteti: Kamera Uyarısı + Acil Buton

> **Tier:** yalnız `mobile/` (+ `web/src/i18n/tr.json` metin kullanımı — **metinler zaten var**, §2/§3).
> `api/` sıfır · `web/` kod sıfır · native diff sıfır → **yeni dev build YOK.**
> **Track:** F2 mobil. Sahip isteği 2026-08-08: webde olan iki T&S yüzeyi mobilde yok.
> **Kaynak sözleşmeler:** `SPRINT_C7_MEDIA_OPEN_CONTRACT.md` (§E2/§E3 nudge) ·
> `SPRINT_A4_EMERGENCY_CONTRACT.md` (acil buton). **Bu sprint yeni politika üretmez, var olan iki
> politikayı mobile taşır.**
> **🔴 R7 yüzeyi:** ikisi de T&S. Karar fonksiyonu yazılmıyor, sunucu davranışı değişmiyor.

---

## §0 Neden bu iki şey birlikte

İkisi de webde canlı, mobilde hiç yok, ikisi de saf istemci işi (sunucu tarafı hazır). Ayrı sprint
açmak iki tur cihaz doğrulaması demek olurdu; ikisi de aynı ekranda (arama ekranı) yaşıyor.

**Referans dosyalar (OKU, DOKUNMA):** `web/src/composables/useVoiceNudge.ts` ·
`web/src/components/shared/CameraNudgeModal.vue` · `web/src/components/shared/EmergencyButton.vue` ·
`web/src/stores/emergency.ts` · `web/src/api/emergency.ts`.

---

## §1 Kapsam

| Dosya | Ne |
|---|---|
| `src/api/emergency.ts` (**yeni**) | `POST /emergency` · `PATCH /emergency/:id` istemcisi (web'in aynısı) |
| `src/components/call/CameraNudgeModal.tsx` (**yeni**) | tek-seferlik kamera uyarısı |
| `src/components/call/EmergencyButton.tsx` (**yeni**) | acil buton + onay + geri bildirim akışı |
| `src/app/(app)/call.tsx` | ikisinin bağlanması (§2.3, §3.3) |
| `src/stores/voice.ts` | yalnız gerekirse nudge tetiği için küçük kanca |

**Kapsam dışı:** ekran paylaşımı nudge'ı (mobilde ekran paylaşımı YOK) · moderatör tarafındaki acil
uyarı bandı (`EmergencyAlertBanner` — platform moderatörü yüzeyi, M4h'ın işi) · yeni T&S politikası.

---

## §2 Kamera uyarısı (nudge)

### §2.1 Ne zaman çıkar
Web'in kuralı **birebir** taşınır (`useVoiceNudge.ts`): **yalnız genel/açık ortam ses kanalında**
(kanal `ageGated` DEĞİL **ve** ortam `adultsOnly` DEĞİL) kamera ilk açılışta.

🔴 **Neden yalnız orada:** C7 kararıyla genel kanalda medya minöre de açık olabiliyor
(`mediaEnabled`). Uyarı tam bu bağlam için var. Yaş-kapılı/yetişkin ortamda zaten herkes yetişkin,
uyarı gereksiz gürültü olur. **Bu kapıyı gevşetme, sıkılaştırma.**

DM ve grup DM'de nudge **YOK** (webde de yok).

### §2.2 Hatırlama
Web `sessionStorage`da kanal başına tutuyor: sekme kapanınca sıfırlanır, tekrar açılınca gösterilir.
**Mobil karşılığı: bellekte modül değişkeni** (`Set<channelId>`), uygulama tamamen kapanınca sıfırlanır.
🔴 **Kalıcı saklama (AsyncStorage/SecureStore) YOK** — web'de bilinçli olarak "her oturumda bir kez"
seçildi (C7 §E4: sunucu-taraf tercih saklama YAGNI). Mobilde de aynı.

### §2.3 Davranış
- Kamera düğmesine basıldığında, kamera **açılmadan ÖNCE** modal çıkar: onaylarsa kamera açılır,
  vazgeçerse **hiçbir şey olmaz** (kamera kapalı kalır, arama sürer).
- Metin `tr.json`da **zaten var** (C7'de yazıldı, web kullanıyor) — **yeni metin uydurma**, mevcut
  anahtarları kullan. Yoksa `mobile.*` altına eklenir.
- Modal deseni mevcut sheet/modal bileşenlerinden gelir; yeni bir modal altyapısı yazılmaz.

---

## §3 Acil buton (A4)

### §3.1 Sunucu ne yapıyor (istemci bunları TEKRAR ETMEZ)
`POST /emergency` → **(a)** basanı aktif ses oturumundan **LiveKit `removeParticipant` ile anında
çeker**, **(b)** platform güvenliğine (yerel sunucu moderatörünü **baypas ederek**) bildirir,
**(c)** bağlam snapshot'ı alır. Yanıt: `{ acknowledged, reportId }`.

🔴 **İstemci "çekilme"yi kendisi yapmaz.** Sunucu odadan attığı için mobil zaten `Disconnected`
alacak ve mevcut ayrılış akışı çalışacak. **Ama:** kullanıcıya bunun bir hata gibi görünmemesi
gerekiyor — bugünkü `disconnectReason` akışı "Bağlantı kesildi." diyor. Acil butona basıldıysa o
mesaj **gösterilmez**; yerine §3.2'deki geri bildirim akışı gelir.

### §3.2 Akış
1. Basınca **onay** istenir (yanlışlıkla basma gerçek bir risk). Onay metni kısa ve net.
2. Onaylanınca istek gider. Başarılıysa: kullanıcı aramadan çıkmış olur ve **geri bildirim ekranı**
   gösterilir — isteğe bağlı metin beyanı (`PATCH /emergency/:reportId`, B1b). Boş bırakıp
   kapatabilir; **zorunlu değil.**
3. İstek başarısız olursa kullanıcı **sessiz bırakılmaz**: ne olduğunu söyleyen bir mesaj gösterilir.
   🔴 Acil akışta sessiz başarısızlık kabul edilemez — mağdur yardım istediğini sanıp beklemesin.

### §3.3 Yerleşim (PM kararı — sahip "mobile göre ayarla" dedi)
- **Arama ekranının ÜST BARINDA**, ayrı bir ikon. Alt kontrol çubuğu zaten beş düğmeye çıkabiliyor
  (mikrofon · kamera · çevir · sohbet · kapat); altıncısını oraya sıkıştırmak dokunma hedeflerini
  bozar ve acil bir kontrolün yanlış düğmeye komşu olmasını istemeyiz.
- 🔴 **Otomatik gizlenmeye TABİ DEĞİL.** Üst bar 5 saniye sonra soluklaşıyor; acil buton
  **her zaman görünür ve basılabilir** kalır. Panik anındaki kullanıcı "ekrana dokun, buton gelsin"
  adımını yapamaz.
- Görsel olarak dikkat çeker ama alarm estetiği yok; yanlışlıkla basmayı davet etmemeli.
- **Yalnız arama ekranında** (webdeki gibi — orada da ses kontrol çubuğunda). Uygulama genelinde
  panik butonu bu sprintte YOK.

---

## §4 T&S notları

- Sunucu davranışı değişmiyor; mobil yalnız tetikleyip sonucu gösteriyor.
- Acil rapor **yerel ortam moderatörünü baypas eder** (istismarcı çoğu zaman ortamın operatörüdür) —
  istemci bu akışa hiçbir yerel filtre koymaz.
- Kayıt YOK: canlı ses/video kaydedilmiyor, snapshot metadata-only (sunucu işi).
- Nudge kapısı C7'nin kapısıdır; istemci yaş bandı okumaz, kanal/ortam bayraklarına bakar.

---

## §5 DoD

### Kod tarafı (dev)
- [ ] `npm run typecheck` · `npm run lint` temiz
- [ ] `api/` + `web/` kod diffi sıfır · native diff yok · yeni bağımlılık yok
- [ ] Nudge yalnız genel/açık ortam ses kanalında; DM/grup DM'de hiç çıkmıyor
- [ ] Acil buton otomatik gizlenmeye tabi değil

### Cihazda (SAHİPTE)
- [ ] Genel ses kanalında (mediaEnabled açık) kamerayı ilk kez açınca uyarı çıkıyor; vazgeçince
      kamera açılmıyor, onaylayınca açılıyor
- [ ] Aynı kanalda ikinci kez açarken uyarı **çıkmıyor**; uygulama tamamen kapatılıp açılınca
      **tekrar çıkıyor**
- [ ] Yaş-kapılı/yetişkin ortamda ve DM'de uyarı **hiç çıkmıyor**
- [ ] Acil butona basınca onay çıkıyor; onaylayınca aramadan çıkılıyor ve geri bildirim ekranı
      geliyor (metin yazmadan da kapatılabiliyor)
- [ ] Acil basıldığında "Bağlantı kesildi." hata mesajı **görünmüyor**
- [ ] Kontroller solduktan sonra da acil buton **görünür ve basılabilir**

---

## §6 Dev'e notlar

1. Web'i **referans al, kopyalama** (Vue → RN birebir taşınmaz). Kuralları taşı, kodu değil.
2. Nudge'ın kapı koşulunu kendi kafana göre sadeleştirme — C7'nin kapısı bu, R7'den geçti.
3. Acil akışta hata yutma. `catch {}` ile sessiz geçilen tek bir yol bile bırakma.
4. Sözleşmede olmayan ihtiyaç (özellikle `api/`) → **DUR ve bildir.**
5. Cihaz testi yapma, commit atma.
