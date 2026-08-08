# Sprint R17 — Ses İzinlerinin Sadakati (T&S deliği + kamera düğmesi geri gelmiyor)

> **Tier:** `api/` (asıl iş) + `web/` (D51 · D52 borçları).
> **`mobile/` DİFFİ SIFIR** — mobil ayağı M4p PiP turundan sonra ayrı yazılır (aynı dosyalar).
> **Kaynak:** sahip cihaz turu 2026-08-08 → susturmayı kaldırınca kamera düğmesi geri gelmiyor.
> **🔴 R7:** evet. Kusurun görünen yüzü UI, altındaki yüzü **yetki sızıntısı**.

---

## §0 🔴 Kusur — görünen yüz ve gerçek yüz

`muteParticipant` ve `unmuteParticipant`, LiveKit `updateParticipant` çağrısını şu izin nesnesiyle
yapıyor: `{ canPublish, canSubscribe, canPublishData }`. **`canPublishSources` gönderilmiyor.**

LiveKit'te `canPublishSources` **boş bırakılırsa anlamı "hiçbiri" değil, "HEPSİ SERBEST"tir.**
`mintToken` bunu doğru yapıyor (`[MICROPHONE, ...resolveVideoSources()]` gönderiyor); moderasyon
uçları yapmıyor. Sonuç iki katmanlı:

1. **Görünen yüz (sahibin bildirdiği):** susturma kaldırılınca istemci
   `permissions.canPublishSources.includes(CAMERA)` diye bakıyor, dizi **boş** olduğu için `false`
   çıkıyor → kamera düğmesi geri gelmiyor, kullanıcı kanaldan çıkıp girmek zorunda kalıyor.
2. **🔴 Gerçek yüz (kimsenin görmediği):** susturulup açılan kullanıcıya LiveKit tarafında **tüm
   kaynaklar** veriliyor — kameranın kapalı olması gereken genel bir kanalda bile.
   `resolveVideoSources`ın kararı (C4/C7, R7'den geçmiş) o oturum için **devre dışı kalıyor**.
   Fark edilmemesinin sebebi (1): istemci düğmeyi zaten çizmiyor. Yani UI kusuru, yetki sızıntısını
   **gizliyordu**.

**Sızıntının kapsamı:** yalnız canlı LiveKit oturumu (kayıt DB'de değişmiyor); kullanıcı yeniden
bağlanınca `mintToken` doğru izinleri veriyor. Ama oturum boyunca geçerli ve tetikleyicisi sıradan
bir moderasyon işlemi: sustur → susturmayı kaldır.

---

## §1 Kapsam

| Tier | Ne |
|---|---|
| `api/` | Moderasyon uçları izin yazarken **kaynak listesini de** doğru yazar (§2) |
| `web/` | D51 — `setCameraEnabled` publication kontrolü (§3) |
| `web/` | D52 — kamera tarafı izin/unpublish dinleyicisi (§4) |

**Kapsam dışı:** `mobile/` (M4p sonrası) · kanal ayarı değişince canlı izin tazeleme (§5 — borç) ·
yeni moderasyon yetkisi.

---

## §2 api — izin yazarken kaynak listesi de yazılsın

`mintToken` zaten doğru hesabı yapıyor: `canPublishSources = [MICROPHONE, ...resolveVideoSources(...)]`.
Moderasyon uçları **aynı hesabı** kullanacak. Tek doğruluk kaynağı bir yerde olsun (yardımcı bir
metoda çıkarmak doğru; **Rule of Three'yi bekleme, bu üçüncü kullanım**).

- **`unmuteParticipant`** → `canPublish` + **`canPublishSources`** (yeniden hesaplanmış) gönderir.
  Yani susturma kalkınca kullanıcı **kanalın kuralının izin verdiği** kaynaklara döner; ne fazlası
  (bugünkü sızıntı) ne eksiği (bugünkü kayıp düğme).
- **`muteParticipant`** → `canPublish:false` zaten her yayını kesiyor; **yine de** `canPublishSources`
  açıkça `[]`… ⚠️ **DİKKAT:** boş dizi "hepsi serbest" demek. Bu yüzden mute dalında kaynak listesi
  **gönderilmez** ya da `[MICROPHONE]` gibi daraltılmış bir liste gönderilir — `canPublish:false`
  zaten kapıyı kapatıyor. **Buradaki semantiği kodda YORUMLA**, bir sonraki geliştirici aynı tuzağa
  düşmesin.
- **`stopBroadcast`** bugün `canPublishSources: [MICROPHONE]` gönderiyor — **doğru**, dokunulmaz
  (referans olarak da bu davranış kullanılabilir).

**Testler (zorunlu):**
- Susturulup açılan kullanıcı, video izni OLMAYAN kanalda kamera kaynağı **almıyor**
- Susturulup açılan kullanıcı, video izni OLAN kanalda kamera kaynağını **geri alıyor**
- `mintToken` davranışı değişmedi (regresyon)

---

## §3 web — D51: publication kontrolü

`stores/voice.ts` iki yerde (`toggleCamera` ve `startWithCamera` niyeti) `setCameraEnabled(true)`
sonucunu kontrol etmeden `isCameraOn = true` yazıyor. Sunucu grant vermediğinde SDK publication
döndürmez → düğme "kamera açık" der, karşı tarafta hiçbir şey yoktur.

**Mobil doğrusu yazılı** (`mobile/src/stores/voice.ts` `toggleCamera`: `if (!pub) return`). Web aynı
hatta çekilir.

---

## §4 web — D52: kamera tarafı izin dinleyicisi

R16 webe `ParticipantPermissionsChanged` ekledi ama yalnız **ses** (`canPublish`) için.
`canPublishCamera` hâlâ yalnız `join()`te bir kez okunuyor. Sonuç: moderatör yayını durdurunca
(R11 `stop-broadcast`) web kullanıcısının kamera düğmesi "açık" göstermeye devam ediyor.

Eklenecek (mobil M4f'in web karşılığı — **mantığı taşı, kodu kopyalama**):
- `ParticipantPermissionsChanged` (yerel) → `canPublishCamera` güncellensin.
  🔴 **`canPublishSources` boş gelirse anlamı "hepsi serbest"tir** (§0) — istemci bunu "kamera yok"
  diye okumamalı. §2 sunucuyu düzeltiyor ama istemci de bu semantiği doğru bilmeli (savunma derinliği).
- `LocalTrackUnpublished` (kaynak Camera) → yayın **bizim isteğimiz dışında** düştüyse `isCameraOn`
  kapanır ve kullanıcı bilgilendirilir (gerekçe söylemeden). Mobilde bunun için `localCameraStopping`
  bayrağı kullanıldı (kendi kapatmamızla sunucununkini ayırmak için) — webde de aynı ayrım gerekiyor.

---

## §5 Borç olarak açılacak (bu sprintte YAPILMAYACAK)

**Kanal ayarı değişince canlı izinler tazelenmiyor.** Sahip `ageGated`/`mediaEnabled` toggle'ını
değiştirdiğinde o an kanalda bağlı olanların LiveKit izinleri güncellenmiyor; değişiklik ancak
yeniden bağlanınca geçerli oluyor (sahip gözlemi 2026-08-08: "18+ toggle'ını açıp kapayınca da
oluyor"). Doğru çözüm: kanal güncelleme yolunda bağlı katılımcıların izinlerini yeniden hesaplayıp
`updateParticipant` ile yazmak. **PM bunu D54 olarak açacak** — kapsamı ve yan etkileri (N katılımcı
için N çağrı, hata toleransı) ayrı düşünülmeli.

---

## §6 DoD

### Kod tarafı
- [ ] `api`: build + test temiz; §2'deki üç test yazıldı
- [ ] `web`: `vue-tsc -b` bilinen 6 · `vite build` başarılı
- [ ] `mobile/` diffi **sıfır**

### Tarayıcıda / cihazda (SAHİPTE)
- [ ] Sustur → susturmayı kaldır → **kamera düğmesi geri geliyor** (kanaldan çıkıp girmeden)
- [ ] 🔴 Kameranın kapalı olduğu genel bir kanalda sustur → aç → kullanıcı **kamera açamıyor**
      (sızıntı kapandı)
- [ ] Webde yayını durdur → o kullanıcının kendi ekranında kamera düğmesi kapalıya dönüyor
- [ ] Webde kamera açmayı denerken sunucu izin vermiyorsa düğme "açık" demiyor

---

## §7 Dev'e notlar

1. §0'daki LiveKit semantiği bu sprintin kalbi: **boş `canPublishSources` = hepsi serbest.** Kodda
   yorumla; bu tuzağa ikinci kez düşülmesin.
2. `mintToken`daki hesabı kopyalama, **paylaş** (tek doğruluk kaynağı).
3. `mobile/`'a dokunma. Mobil ayağı ayrı turda.
4. Sözleşme dışına çıkma ihtiyacı → **DUR ve bildir.**
5. Tarayıcı/cihaz testi yapma, commit atma.
