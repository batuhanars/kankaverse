# Sprint M4p — Mobil PiP (Resim İçinde Resim) + Birikmiş Native Kalemler

> **Tier:** yalnız `mobile/`. `api/` sıfır · `web/` sıfır.
> **🔴 Bu sprint NATIVE DİFF İÇERİR → yeni dev build gerekir.** M4 fazının son sprinti; bittiğinde
> mobil ses/görüntü hikâyesi kapanır.
> **Kaynak:** sahip Discord'u cihazda test etti (2026-08-08) — arka plana alınca kamera küçük yüzen
> pencerede devam ediyor; PLAN'daki "yüzen mini pencere" kalemi de bu.
> **Sıra kararı:** PiP bilerek **en sona** bırakıldı ki sarmalayacağı ekran (1-1 DM · grup DM · ortam
> kanalı, sesli + görüntülü) bitmiş olsun ve "PiP'te N kişi nasıl görünür" bir kez cevaplansın.

---

## §1 Kapsam

| Ne | Not |
|---|---|
| **PiP modu** | Uygulama arka plana alınınca çağrı ekranı sistem PiP penceresine geçer |
| **PiP içeriği** | Kompakt görünüm (§3) |
| **D44 zil sesi** | Bu derlemeye biner (§5) |
| **Kamera arka planda sürer** | PiP'te aktivite görünür sayıldığı için (§4) |

**Kapsam dışı:** iOS (Android-first, Apple ertelendi) · ekran paylaşımı · PiP içinden kontrol
(mikrofon/kapat düğmeleri) · sürüklenebilir/yeniden boyutlandırılabilir özel overlay ·
`SYSTEM_ALERT_WINDOW` tabanlı kendi pencere çizimimiz (Play beyanı + izin sürtünmesi; PiP zaten
sistemin desteklediği yol).

---

## §2 Native taraf

- `app.json` → Android aktivitesi `supportsPictureInPicture` bildirir.
- PiP'e geçiş: kullanıcı uygulamadan çıkarken (`onUserLeaveHint`) çağrı **aktifken** PiP'e girilir.
  Çağrı yokken davranış değişmez (uygulama normal arka plana alınır).
- PiP mod değişimi (`onPictureInPictureModeChanged`) RN tarafına köprülenir; JS bu bilgiyle kompakt
  düzene geçer.
- Yerel modül deseni **zaten var**: `modules/call-foreground-service` (Kotlin). Yeni modül açmak
  yerine oraya eklemek ya da aynı desende ikinci bir modül açmak — **dev seçer, gerekçesini raporlar**.
- 🔴 **Foreground service tipi `microphone` KALIYOR.** Kamera FGS tipi eklenmeyecek (PM kararı
  2026-08-08): PiP'te aktivite görünür sayıldığı için kameranın sürmesi zaten mümkün; `camera` FGS
  tipi Play beyanı getirir ve Discord da bu yola girmiyor.

### 🔴 Yerelde derle, EAS'a körlemesine gönderme
Native diff olduğu için: `npx expo prebuild` + `gradlew` ile **yerelde derle**, sonra EAS'a gönder.
Bulut "unknown error" der, yerel derleyici gerçek satırı verir (M4a-1 dersi: tek satırlık Kotlin
hatası buluta bir başarısız derleme mal oldu). `JAVA_HOME` = Android Studio jbr.

---

## §3 PiP içeriği

PiP penceresi küçük (~150dp genişlik). İçine bugünkü çağrı ekranı sığmaz, **kompakt bir görünüm**
çizilir:

- **1-1 DM:** karşı tarafın videosu; kamerası kapalıysa avatarı.
- **Grup DM / ortam kanalı:** **konuşan** kişinin videosu/avatarı (`speakingUserIds` zaten var).
  Kimse konuşmuyorsa ilk uzak katılımcı. 🔴 Izgarayı PiP'e sığdırmaya çalışma — okunmaz.
- Kendi görüntün PiP'te **yok** (yer yok, değeri düşük).
- Kontrol yok, metin yok (ad/süre dahil). PiP'e dokunmak uygulamayı geri açar — sistem davranışı,
  ek kod gerekmez.
- Sesli aramada (kimsenin kamerası yok) PiP yine açılır: konuşanın avatarı görünür.

---

## §4 Kamera ve arka plan davranışı — M4d §6'nın revizyonu

M4d'de şu yazılmıştı: arka plana alınca kamera yayını durur, öne dönünce `cameraIntent` okunup geri
açılır. **PiP bu davranışın istisnasıdır:**

- Uygulama **PiP'e geçtiyse** kamera **DURDURULMAZ** (aktivite görünür sayılıyor, Discord'un
  davranışı da bu).
- Uygulama PiP'siz gerçekten arka plana düştüyse (PiP desteklenmiyor / izin kapalı / kullanıcı PiP'i
  kapattı) **bugünkü davranış korunur**: kamera durur, öne dönünce niyet okunur.
- 🔴 `cameraIntent` mantığına dokunma — yalnız "arka plan" tanımına PiP istisnası eklenir.

---

## §5 D44 — zil sesi bu derlemeye biner

Gelen arama zili duyulmuyor (PLAN [[D44]]); düzeltmesi **yeni bir bildirim kanalı kimliği** gerektiriyor
(Android'de kanalın sesi kurulduktan sonra değiştirilemez → kanal v4). Bu sprint zaten derleme
alıyor, tek derleme kuralı gereği burada yapılır.

⚠️ Kanal kimliği değişimi eski kanalı bırakır; kullanıcıda iki kanal görünebilir. Bilinen bedel,
kabul edildi (D44 kaydındaki not).

---

## §6 🔴 MIUI / cihaz farklılığı

PiP, MIUI'de **uygulama başına ayrı bir izin** ve bazı cihazlarda varsayılan **kapalı** geliyor
(sahibin telefonu Xiaomi). Bu yüzden:

- İzin kapalıyken uygulama **çökmemeli**, sessizce bugünkü davranışa düşmeli (kamera durur, ses sürer).
- "PiP açılmadı" durumu bir hata gibi kullanıcıya gösterilmez.
- DoD'a bu dal **ayrı madde** olarak yazıldı (§7) — "benim cihazımda çalışıyor" doğrulama değildir.

---

## §7 DoD

### Kod tarafı (dev)
- [ ] `npm run typecheck` · `npm run lint` temiz
- [ ] `api/` + `web/` diffi sıfır (i18n hariç)
- [ ] 🔴 **Yerel derleme başarılı** (`expo prebuild` + `gradlew`) — EAS'a gönderilmeden önce
- [ ] `cameraIntent` / `localCameraStopping` mantığı bozulmadı (yalnız PiP istisnası eklendi)

### Cihazda (SAHİPTE — yeni dev build gerekir)
- [ ] Görüntülü aramada uygulamayı arka plana al → **PiP penceresi çıkıyor**, kamera devam ediyor
- [ ] PiP'e dokun → uygulama geri açılıyor, arama kaldığı yerden sürüyor
- [ ] PiP'i kapat → ses devam ediyor, kamera duruyor (bugünkü davranış)
- [ ] Sesli aramada (kamerasız) PiP açılıyor, konuşan kişi görünüyor
- [ ] Grup DM ve ortam kanalında PiP konuşanı gösteriyor
- [ ] 🔴 **MIUI PiP izni kapalıyken** uygulama çökmüyor, bugünkü davranışa düşüyor
- [ ] 🔴 **D44:** gelen arama zili **duyuluyor**; telefon sessizdeyken çalmıyor
- [ ] 1-1 DM · grup DM · ortam kanalı, sesli ve görüntülü: **regresyonsuz**

---

## §8 Dev'e notlar

1. Native diff var → **yerelde derlemeden EAS'a gönderme** (§2).
2. PiP düzenini basit tut (§3). Izgara/kontrol/metin yok.
3. M4d/M4e/M4f'in kamera mantığına dokunma; PiP yalnız "arka plan" tanımını değiştirir (§4).
4. Sözleşmede olmayan ihtiyaç (özellikle `api/` veya yeni bağımlılık) → **DUR ve bildir.**
5. Cihaz testi yapma (sahipte), commit atma.
