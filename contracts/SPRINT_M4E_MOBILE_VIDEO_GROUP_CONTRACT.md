# Sprint M4e — Mobil Görüntülü Arama: Grup DM

> **Tier:** yalnız `mobile/` (+ gerekirse `web/src/i18n/tr.json` metin ekleme).
> `api/` sıfır · `web/` kod sıfır · **native diff sıfır → yeni dev build YOK.**
> **Track:** F2 mobil · sahip faz bölmesinin görüntülü yarısının ikinci parçası
> ((4) 1-1 DM ✅ M4d → **(5) grup DM** → (6) ortam kanalı kamera).
> **Önceki sprint:** `SPRINT_M4D_MOBILE_VIDEO_DM_CONTRACT.md` — kamera altyapısının tamamı orada
> yazıldı ve cihazda doğrulandı. Bu sprint **var olanı çoğullaştırıyor**, yeni sistem kurmuyor.
> **R7:** kapı sunucuda (`resolveVideoSources` GROUP_DM dalı), mobil yalnız sonucu gösterir.

---

## §0 Bu sprint ne kadar küçük

M4d'de şunlar bitti ve grup dalında **aynen** çalışır: kamera izni, `toggleCamera`, kamera çevirme,
null-publication tuzağı, arka plan/ön plan davranışı (`cameraIntent`), `ParticipantTile`ın video dalı.

Geriye **üç** iş kalıyor:
1. Uzak kamera state'i **tek slottan çoğul**a çıkarılacak (grupta N kişi yayın yapabilir).
2. Kamera düğmesinin kapısı grup DM'i de kapsayacak.
3. Kamera açıkken **ızgara düzeni** (bugünkü tek sütun kart listesi sesli arama için doğru, video için değil).

🔴 **Yeni bağımlılık ve native diff yasak.** M4d bunu kanıtladı; bu sprint aynı yerde duruyor.

---

## §1 Kapsam

**Kapsam: `callKind === 'group'` (grup DM) görüntülü arama.** Ortam sesli kanalı (`'guild'`) **kapsam
dışı** — M4f. 1-1 DM davranışı **değişmemeli** (regresyon yasak).

| Dosya | Ne değişiyor |
|---|---|
| `src/stores/voice.ts` | `remoteCameraPublication` (tek slot) → **userId anahtarlı çoğul yapı**; `toggleCamera` kapısına `'group'` eklenir |
| `src/app/(app)/call.tsx` | grid dalında video düzeni (§3); kamera düğmesi kapısına grup eklenir |
| `src/components/call/ParticipantTile.tsx` | gerekirse `'card'` varyantının video oranı (§3.2) — yeni varyant eklemeden |
| `web/src/i18n/tr.json` | yalnız gerekirse yeni metin |

---

## §2 🔴 Tek slot → çoğul (bu sprintin en sinsi parçası)

Bugün store'da uzak kamera **tek bir alan**: `remoteCameraPublication`. 1-1 DM'de doğruydu ("karşı
taraf" tek kişi). Grupta yanlış: ikinci kişi kamerasını açtığında birincininkini **ezer**.

- `remoteCameraPublications: Record<userId, publication>` (ya da `Map`) olur. `wireRoom`'daki dört
  yol (`TrackSubscribed` · `TrackUnsubscribed` · `TrackMuted` · `TrackUnmuted`) ve
  `ParticipantDisconnected` **kimin** track'i olduğunu artık yazmak zorunda (`p.identity` = userId).
- 🔴 **1-1 DM tek kaynaktan okur.** İki paralel state TUTULMAZ (biri tek slot, biri map). DM dalı
  map'ten karşı tarafın kaydını türetir. Aksi halde iki gerçek kaynağı senkron tutma borcu doğar
  (D37/M3c dersi: gereksiz state = senkron kalma riski).
- `leave()` bu yapıyı da sıfırlar.

**DoD'da 1-1 DM regresyon maddesi bu yüzden var** — M4d cihazda doğrulanmış bir davranıştı, bu
refactor onu bozabilecek tek iş.

---

## §3 Düzen

### §3.1 Kural M4d §3-R ile aynı: düzen kamera durumundan TÜRETİLİR

- **Hiç kimsenin kamerası açık değilse:** bugünkü **tek sütun, tam genişlik, alt alta** kart listesi
  **AYNEN** kalır. Bu düzen sahibin M4c cihaz turunda bilinçli kararıydı (ızgara denendi, geri alındı:
  dar ekranda sesli aramada bakılan tek şeyi zorlaştırıyor). **Sesli grup araması hiç değişmemeli.**
- **En az bir kamera açıldığında:** **iki sütunlu ızgara**. Video aramasında bakılan şey yüz; alt alta
  tam genişlik kartlar ekranda iki kişi gösterir, geri kalanı kaydırmaya iter.

`call.tsx`'in mevcut `§14.2` yorumu bunu zaten öngörüyordu ("video sprintinde yeniden yazılacak").

### §3.2 Izgara kutucuğu

- Mevcut `'card'` varyantı kullanılır; **yeni varyant eklenmez** (M4d'de üç varyant oldu, dördüncüsü
  gerekmiyor). Kamera açık kutucukta video, kapalıda bugünkü avatar.
- Kutucuk oranı ızgarada dikey dikdörtgene yakın olsun (yüz görünsün); ad + mikrofon rozeti + konuşma
  kenarlığı korunur.
- **Kendi kutucuğun ızgaranın bir elemanıdır** — 1-1'deki köşe önizlemesi grupta YOK (köşe kutusu
  "karşı taraf tek kişi" düzeninin parçasıydı).

### §3.3 Kapsam dışı

Konuşana odaklanma (spotlight) · kutucuğa dokununca tam ekran · sürükle-sırala · yatay mod · sayfalama.
Kalabalık grupta ızgara kaydırılır, bugünkü liste gibi.

---

## §4 Kamera düğmesi

- Kapı: `canPublishCamera && (callKind === 'dm' || callKind === 'group')`. Guild **hariç** (M4f).
- `stores/voice.ts` `toggleCamera` kendi içindeki `callKind !== 'dm'` kapısı da grup için açılır;
  guild kapalı kalır (M4d'de bilerek konmuştu, tamamen kaldırılmaz).
- Kamera çevirme, izin reddi, "Ayarları Aç" akışı M4d'deki gibi — **kopyalanmaz, aynı yol kullanılır.**

---

## §5 T&S (R7 yüzeyi)

Sunucu kararı (`resolveVideoSources`, GROUP_DM dalı): **TÜM üyeler (kendin dahil) yetişkinse video;
bir minör bile varsa video YOK.** Karar `canPublishCamera` olarak iner.

- İstemci kapıyı kurmaz, gevşetmez, üyeleri kendi taramaz.
- `canPublishCamera=false` → kamera düğmesi **çizilmez** (M4d §7'deki gerekçe grupta daha da güçlü:
  grupta "kamera kapalı" açıklaması, gruptaki **birinin** minör olduğunu tüm yetişkinlere söyler).
- Kayıt YOK.
- Yayın-durdur (R11) grupta da yok (ortam kanallarına özgü) — M4f'in işi.

---

## §6 DoD

### Kod tarafı (dev)
- [ ] `npm run typecheck` · `npm run lint` temiz
- [ ] `api/` + `web/` kod diffi sıfır (i18n hariç) · **native diff yok** · yeni bağımlılık yok
- [ ] Uzak kamera state'i **tek** kaynak (map); DM dalı ondan türetiyor, paralel state yok

### Cihazda (SAHİPTE — en az üç hesap; üçüncüsü web'den olabilir)
- [ ] 🔴 **1-1 DM görüntülü arama REGRESYONSUZ** (M4d turunda geçen her madde hâlâ geçiyor)
- [ ] Grup DM'de kamera açılıyor, diğerleri görüyor
- [ ] **İki kişi aynı anda** kamera açınca ikisi de görünüyor (tek slot kusuru gitti)
- [ ] Biri kamerasını kapatınca yalnız onun kutucuğu avatara dönüyor, diğerleri etkilenmiyor
- [ ] Kimse kamera açmadığında **sesli grup araması bugünkü gibi** (tek sütun, alt alta)
- [ ] Arka plana alma davranışı grupta da doğru (ses sürüyor, dönünce kendi kameran geri geliyor)
- [ ] Ortam sesli kanalı regresyonsuz (bu sprint ona dokunmadı)

---

## §7 Dev'e notlar

1. **Önce §2'yi yap, sonra düzeni.** State çoğullaşmadan ızgaraya dokunursan ikinci kişinin videosu
   birincininkini ezerken düzeni ayıklamaya çalışırsın.
2. M4d'nin `cameraIntent`/`isCameraOn` ayrımına **dokunma** — grupta da aynısı geçerli, çoğullaşan
   yalnız UZAK taraf.
3. 1-1 DM dalını (`§3-R` tam alan + köşe) **değiştirme**; yalnız veri kaynağı map'e taşınıyor.
4. Sözleşmede olmayan ihtiyaç (özellikle `api/` veya native) → **DUR ve bildir.**
5. Cihaz testi yapma, commit atma. PM inceleyip commit'ler.
