# Sprint M4z — M4 Kapanış Temizliği (D47 · D48 · D49)

> **Üç bağımsız iş.** Sahibin cihaz turu #2'de çıkan altı kalemden üçü aynı gün yapıldı (M4b §14),
> bu üçü borca çevrilmişti; sahip kararı 2026-08-08: **kamera fazından önce temizlensin.**
>
> Üçü **farklı tier'lara** düşüyor ve **birbirinden bağımsız**: ayrı ayrı delege edilir, ayrı ayrı
> commit edilir. Biri diğerini beklemez.
>
> 🔴 **Hiçbiri native değişiklik gerektirmez** — sahip elindeki build'le test edebilir, yeni build
> gerekmez. Native diff çıkarsa **DUR ve bildir**.

---

## §A — D47: Web'de DM listesinde ses göstergesi

**Tier: `web/`.** `api/` ve `mobile/` diffi sıfır.

Mobilde M4b §13 ile eklendi: grup DM satırında o an seste kaç kişi olduğu görünüyor. Web'de yok.
Sahip bildirdi: *"web tarafında yok bu değişiklik."*

- Grup DM satırında, seste **biri varsa** küçük bir gösterge. Web'in kendi görsel dili kullanılır
  (`VoiceParticipantList` / kanal panelindeki ses göstergesi neyse ona **yakın**) — mobilin
  görünümünü web'e taşımaya çalışma, iki istemci kendi dilinde kalır.
- **Yalnız grup DM.** 1-1 DM'de "seste" zaten arama demek ve o akış çalma/bar ile karşılanıyor.
- Kimse yoksa **hiçbir şey** çizilmez.
- Gösterge tıklanabilir olmak zorunda değil; satıra tıklamak zaten DM'i açıyor.

⚠️ **Önce aboneliği kontrol et.** Mobilde bu özellik [[D45]]'i tetiklemişti: presence aboneliği
**tek kanal** tutuyordu ve liste çok kanalı aynı anda izleyince reconnect sonrası yalnız sonuncusu
tazeleniyordu. Web'de eşdeğer sınır var mı **başlamadan bak** (`useSocket.ts` presence aboneliği).
Varsa aynı sınıf düzeltme gerekir; yoksa sadece gösterge işi. **Bulgunu raporla.**

---

## §B — D48: Ses kanalına girmeden önce ara panel (mobil)

**Tier: `mobile/`.** `api/` ve `web/` diffi sıfır.

Bugün ses kanalına dokunmak **doğrudan** odaya sokuyor. Bu M4c §2'de **bilinçli** bir karardı
(web öyle çalışıyor, parite). Ama mobilde iki gerçek sorun var: **yanlışlıkla dokunup sese girmek**
kolay, ve kanala girmeden kimlerin içeride olduğunu görmek mümkün değil.

Discord mobilde alt panel açıyor (sahip ekran görüntüsü): kanal adı, içerdekiler (yoksa "Henüz kimse
yok"), ve **Katıl** düğmesi.

- Ses kanalı satırına dokunma → **alt panel** açılır, odaya **girilmez**.
- Panelde: kanal adı · içerideki kişiler (avatar + ad; kimse yoksa Türkçe bir satır) · **Katıl**
  düğmesi. Katıl'a basınca mevcut katılma akışı (`kind: 'guild'`) aynen çalışır.
- Panel kapatılabilir olmalı (aşağı kaydırma + geri tuşu).
- 🔴 **Yeni yetenek eklemiyoruz:** mikrofon aç/kapa, ses ayarı, davet gibi şeyler **yok**. Panel
  yalnız "gör ve gir" yapar. Discord'un panelinde fazlası var, biz onları kopyalamıyoruz.
- Ortam kanalı **dışında** hiçbir yere dokunma: DM/grup arama akışı, 1-1 arama, mini pencere aynı.

**Bileşen seçimi dev'de:** kod tabanında bir alt-panel/sheet deseni **zaten var** (`*Sheet.tsx`
dosyaları — `ChannelMenuSheet`, `CategoryMenuSheet`, `AddGuildSheet`). Onu yeniden kullan;
yeni bir sheet altyapısı yazma. Hangisini seçtiğini raporla.

---

## §C — D49: İki kişilik grup DM oluşturulamaz, DM'e yönlendirilir

**Tier: `api/` + `web/` + `mobile/`.** 🔴 Bu üçünün tek sunucuya dokunanı.

Bugün iki kişilik "grup" oluşabiliyor ve o aslında bir DM'in kötü kopyası: grup adı, üye yönetimi,
grup arama akışı — hepsi tek karşı taraf için. Discord buna izin vermiyor ve **hata da basmıyor**,
doğrudan 1-1 DM açıyor; zaten varsa oraya yönlendiriyor (sahip gözlemi).

### §C.1 Sunucu

`dm.service.ts` `createGroupDm`: bugün `uniqueIds.length === 0 || > 9` dışını kabul ediyor, yani
**1 üye (toplam 2 kişi) geçerli**.

→ `uniqueIds.length === 1` olduğunda **grup oluşturma, `getOrCreateDmChannel`'a yönlendir** ve onun
sonucunu döndür. Hata **fırlatma**; bu bir başarı yolu.

🔴 **R7 — kapı değişiyor, bilinçli:**
- Grup yolu `isMutualFriend` **şart** koşuyor (karşılıklı arkadaşlık) + minör kontrolü.
- DM yolu `canDm` kullanıyor; o kapı arkadaş olmayana da (dmPolicy'ye göre) **istek** olarak izin
  verebiliyor.
- Yani iki kişilik bir istek artık **DM kurallarına** tabi olacak, grup kurallarına değil.
  **Bu doğru:** sonuçta açılan şey bir DM ve DM'in kendi kapısı uygulanmalı. Kapı gevşemiyor,
  **doğru kapı** uygulanıyor.
- Nötrlük korunur: `canDm` reddederse mevcut jenerik `DM_NOT_ALLOWED` döner, "grup kurulamadı" gibi
  ayrı bir metin **üretilmez**.

Dönüş şekli: `getOrCreateDmChannel`'ın DTO'su (`type: 'DM'`). Sözleşme değişmiyor, yeni alan yok —
istemci `type`'a bakarak nereye gideceğini anlar (§C.2).

Test: iki kişilik istek → DM döner, grup **oluşmaz**; mevcut DM varsa **aynı kanal** döner; üç+
kişilik istek eskisi gibi grup oluşturur (regresyon).

### §C.2 İstemciler (web + mobil)

- Grup oluşturma akışında iki kişi seçilip onaylanınca: sunucu DM döndürür → **DM ekranına git**.
  "Grup oluşturuldu" mesajı **gösterilmez**, hata da gösterilmez; kullanıcı doğrudan sohbette bulur.
- Grup oluşturma ekranındaki metinler/uyarılar buna göre gözden geçirilir: "en az 2 kişi seç" gibi
  bir metin varsa yanıltıcı hâle gelir.
- 🔴 **Önden engelleme YOK.** Kullanıcı iki kişi seçebilmeye devam eder; düğme kilitlenmez, uyarı
  çıkmaz. Yönlendirme sessizce olur (Discord'un yaptığı da bu).

### §C.3 Mevcut iki kişilik gruplara DOKUNULMAZ

Bugün var olan iki kişilik gruplar **olduğu gibi kalır** — göç yok, silme yok, dönüştürme yok.
Yalnız **yeni oluşturma** yönlendirilir.

Gerekçe: göç veri kaybı riski taşır (grup adı, mesaj geçmişi hangi kanalda kalacak) ve kazancı yok.
Sistemde kısa süre iki davranış bulunması kabul edilebilir; o gruplar zaten çalışıyor.

---

## §D DoD

**Her iş için (dev'de):**
- [ ] Dokunulan tier'ın denetimleri temiz: `api/` → `jest` (1017) + `tsc` + `eslint` · `mobile/` →
      `typecheck`/`lint`/`expo-doctor` · `web/` → `vue-tsc -b` (bilinen **6**) + 🔴 **`vite build`**
- [ ] Dokunulmayan tier'ların diffi **sıfır**
- [ ] Native diff **yok** (çıkarsa DUR)
- [ ] Gömülü kullanıcı metni yok; i18n kaynağı `web/src/i18n/tr.json`

**Sahipte (cihaz/tarayıcı):**
- [ ] **D47:** web'de grup DM satırında ses göstergesi çıkıyor/kayboluyor; 1-1 satırlarında yok
- [ ] **D48:** ses kanalına dokununca **panel açılıyor**, odaya girilmiyor; Katıl çalışıyor; panel
      kapanıyor; **yanlışlıkla sese girme kalktı**
- [ ] **D49:** iki kişi seçip grup kurmaya çalış → **DM açılıyor**, grup oluşmuyor; aynı kişiyle
      tekrar dene → **aynı DM**; üç kişi seç → grup eskisi gibi oluşuyor
- [ ] Regresyon: 1-1 arama · grup DM araması · ortam ses kanalı · DM listesi göstergesi (mobil)
