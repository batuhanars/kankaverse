# Sprint C11 — Mesaj Listesinde Tarih Ayracı

> **Tier: `web/` + `mobile/`.** `api/` diffi **SIFIR** — mesajlarda `createdAt` zaten var, yeni uç
> yok, yeni alan yok.
>
> Sahip isteği 2026-08-08: *"mesajlara saat koyduk ya... hangi tarihte atılmış gruplama yapalım,
> her dm için: 1-1, grup, kanal. Yeni mi eski mi ayırt edelim."*

---

## §0 Sorun

Mesajlarda yalnız **saat** var (yazarın yanında, "18.42"). Üç gün önceki mesajla bugünkü mesaj
ekranda birbirinden ayırt edilemiyor. Uzun sohbetlerde yukarı kaydırıp eski bir konuya bakınca
zamanda nerede olunduğu bilinemiyor.

**Kapsam altı yüzey:** kanal · 1-1 DM · grup DM — **her biri iki istemcide**.

---

## §1 Davranış

Ardışık iki mesaj **farklı güne** aitse aralarına bir **ayraç** girer.

| Mesajın günü | Ayraç metni |
|---|---|
| bugün | **Bugün** |
| dün | **Dün** |
| daha eski | **25 Ekim 2026** (TR biçimi, kök `CLAUDE.md`) |

- Listenin **en üstündeki** mesajın da ayracı olur (o gün orada başlıyor).
- Ayraç **görsel**dir: seçilemez, tıklanamaz, menü açmaz, mesaj sayılmaz.
- Her iki istemci **kendi görsel dilinde** çizer (web'de ince çizgi + ortada metin deseni,
  mobilde tema tokenlarıyla). Birinin görünümü diğerine taşınmaz.

---

## §2 🔴 Üç tuzak — bu sprintin asıl işi bunlar

### §2.1 "Bugün"/"Dün" dinamiktir

Gece yarısını geçince kaymalı. Ayraç metni **render anında** hesaplanmalı, mesaj listeye
eklendiğinde bir kez hesaplanıp saklanmamalı. Aksi hâlde gece 03.00'te açan kullanıcı dünkü
mesajları "Bugün" başlığı altında görür.

Gün karşılaştırması **yerel saat dilimine** göre yapılır (kullanıcının cihazı), UTC'ye göre değil.
`createdAt` ISO/UTC gelir; karşılaştırma yerel yıl-ay-gün üçlüsü üzerinden olmalı — saat farkı
almak (`diff < 24h`) **yanlıştır**: 23.50'de atılan mesaj 00.10'da "bugün" sayılırdı.

### §2.2 Sonsuz kaydırma ayracı bozar

Yukarı kaydırınca eski mesajlar **başa ekleniyor**. Listenin o anki en üstündeki ayraç, yeni gelen
paketten sonra **yanlış yerde** kalır (o gün artık orada başlamıyor olabilir). Ayraçlar mesaj
listesinden **türetilmeli** (her render'da komşu karşılaştırması), bir kez hesaplanıp diziye
gömülmemeli.

### §2.3 🔴 Kaydırma konumu zıplamamalı

Araya satır eklemek listenin yüksekliğini değiştirir. Eski mesaj yüklerken kullanıcının baktığı
yer **kaymamalı**. Bu projede bu sınıf kusur daha önce yaşandı (mobil klavye payı, dört tur sürdü).

Mevcut kod eski mesaj yüklerken kaydırma konumunu koruyan bir mantık kullanıyorsa (yükseklik farkı
telafisi), ayraçların eklenmesi o hesabı bozmamalı. **Önce mevcut mantığı oku**, sonra ekle;
bozulursa raporla.

---

## §3 Mesaj gruplamayla etkileşim

Kod tabanında aynı yazarın ardışık mesajları için bir gruplama varsa (avatar/ad tekrar
çizilmiyorsa), tarih ayracı o grubu **böler**: ayraçtan sonraki ilk mesaj, aynı yazara ait olsa bile
**tam başlıkla** (avatar + ad) çizilir. Yoksa ayracın altında sahipsiz bir mesaj gövdesi kalır.

Gruplama yoksa bu madde düşer — **kontrol et ve raporla**.

---

## §4 i18n

"Bugün" ve "Dün" **koda gömülmez**, `web/src/i18n/tr.json`'a girer (mobil aynı dosyadan okur).
Tarih biçimi mevcut TR yardımcılarıyla üretilir; yeni bir biçimleme yardımcısı **icat edilmez** —
kod tabanında `toLocaleDateString('tr-TR', …)` deseni zaten var, **Rule of Three**: üçüncü kullanım
oluşuyorsa ortak bir yardımcıya çıkar, iki kullanımda bırak.

🔴 Commit edilmemiş çalışma varken `tr.json`'da `git checkout` **çalıştırılmaz**.

---

## §5 Kapsam dışı

- **"Buradan sonrası okunmamış" çizgisi** — akraba ama ayrı iş, sahip kararıyla dışarıda
- Mesaj arama sonuçları, sabitlenen mesajlar, bildirim listesi — yalnız **sohbet akışı**
- Tarihe tıklayınca o güne atlama, takvim, filtre
- Saat gösteriminde değişiklik (yazarın yanındaki "18.42" **aynen kalır**)

---

## §6 DoD

**Dev'de:**
- [ ] `web/`: `vue-tsc -b` (bilinen **6**) + 🔴 **`vite build`** · `mobile/`: `typecheck`/`lint`/`expo-doctor`
- [ ] `api/` diffi **sıfır** · native diff **yok**
- [ ] Gömülü kullanıcı metni yok

**Sahipte:**
- [ ] Kanal · 1-1 DM · grup DM — **üçünde de** ayraç görünüyor (web + mobil = altı yüzey)
- [ ] Bugünkü mesajlar **Bugün**, dünküler **Dün**, öncesi **tarih**
- [ ] 🔴 Yukarı kaydırıp eski mesaj yükle: ayraçlar **doğru yerde**, ekran **zıplamıyor**
- [ ] Uzun bir sohbette gün geçişleri doğru (birden çok ayraç)
- [ ] Ayraçtan sonraki ilk mesaj tam başlıkla çiziliyor (§3 — gruplama varsa)
- [ ] Saat gösterimi eskisi gibi
