# Sabah İnceleme Notu — 2026-06-13 (gece otonom çalışma)

> Opus/PM gece boyu otonom çalıştı. Bu dosya: **park edilenler + senin kararına bırakılanlar + ne yapıldı.**
> Kural: R7/auth/çocuk-güvenliği kodu senin onayın olmadan MERGE EDİLMEDİ. Şüpheli her şey burada.

## ⏳ Senin kararını bekleyen (KİLİTLEMEDİM)
- **Minör presence görünürlüğü (Sprint 6 T&S alt-kararı):** Bir çocuğun çevrimiçi/aktif durumu kime görünmeli?
  Kurul uyarısı: ortaktaki yabancılara yayınlamak = zamanlamaya dayalı hedefleme yüzeyi. **Karar sabaha.**
  Önerilen muhafazakâr varsayılan (henüz uygulanMADI): presence yalnız arkadaş + (yetişkinse) ortak-ortam üyelerine.
- **4B (Report/moderasyon):** legal görüş + R7 kapılı. Contract taslağı yazıldıysa park'ta, merge yok.
- **Sprint 5 (dosya + CSAM tarama):** R5 araç-seçimi (senin araştırman) bekliyor. Yapılmadı.

## ✅ Gece yapılanlar (hepsi push'lu, non-R7, çekirdeğe bahis YOK)
Hepsi `origin/main`'de. Tüm api test suite **69/69 yeşil** (4 suite), `nest build` + `vue-tsc/vite build` temiz, ağaç temiz.
**+ B1 regresyon testi** (`9d80464`) — `findMessages` clearedAt+cursor birleşimi 7 test (düzelttiğim bug'ın geri gelmesi kilitlendi). Yan-gözlem: silinmiş-mesaj cursor'ı → PLAN D10 borcu.

1. **`canDm` birim testleri** (`d07651f`) — 27 test, T&S çekirdek matrisinin TÜM dalları (self/fail-closed/blok-çift-yön/arkadaş-bypass/minör/yeni-hesap-sınır/dmPolicy-fail-closed). Önceden `canDm` çıplaktı.
2. **`MembershipService` testleri** (`1dcab58`) — 17 test; yaş-kapılı guard (`ageGated&&isMinor→AGE_RESTRICTED`), DM erişim açığı kapanışı, **G3: `requireNoDmBlock` `DM_NOT_ALLOWED` döndürür, `BLOCKED` DEĞİL** (ayrı assert ile sızıntı kilidi).
3. **Sprint 6.1 yazıyor göstergesi** — backend (`a82b944`) WS `typing:start/stop`, `requireChannelAccess` kapılı, ephemeral, sıfır DB; frontend (`c5ac63c`) `useTyping` composable, DM+guild, 3sn debounce/5sn timeout. **T&S-nötr** (yalnız kanal erişimi olana gider, public username taşır).
4. **Doküman** (`838e655`): Sprint 6 contract, 4B taslak, Sprint 1 DoD reconcile.

**Davranış değiştiren tek şey:** Sprint 6.1 typing (yeni özellik, T&S-nötr). Testler davranış değiştirmedi.

## 🐞 Gece bulunan + düzeltilen (dikkatini isteyen)
- **Sprint 4A frontend `d6ed6ab` TS hatasıyla gitmiş:** `HomeView` → `DmConversation`'a `canMessage`/`selfBlocked`/`@cleared` bağlanmamıştı → **G3 blok-UX bandı + G4 inbox-temizle aslında wire DEĞİLDİ.** Typing frontend'i yan-etki olarak düzeltti (`c5ac63c`). **Kök neden:** Sprint 4A frontend incelememde `vue-tsc`/web build ÇALIŞTIRMAMIŞIM — backend build+test koştum, frontend build'i atladım. **Ders:** frontend teslimlerinde `npm run build` zorunlu. Şimdi build temiz, G3/G4 UX gerçekten bağlı.

## 📋 Hazır taslaklar (park — kapı açılınca hızlı girilir)
- **`contracts/SPRINT_6_CONTRACT.md`** — 6.1 ship edildi; 6.2/6.3 senin kararın (yukarı).
- **`contracts/SPRINT_4B_CONTRACT_DRAFT.md`** — moderasyon iskeleti; §3 hukuki kararlar **bilinçle boş** (KVKK/CSAM/5651/retention). CSAM ayrı-akış: otonom TASARLAMADIM, uzman+hukuk şart. **MERGE EDİLMEZ.**

## ⚠️ Senin kararını bekleyen (öncelik sırası)
1. **6.2 minör presence görünürlüğü** (A: arkadaş+yetişkin-ortak / B: Discord / C: yalnız-arkadaş) — çocuk güvenliği kararı, kilitlemedim.
2. **4B için hukuki görüş** (KVKK/minör/CSAM) — bunsuz 4B başlamaz. Ne zaman alabilirsin?
3. **6.3 bildirim** kapsam + kalıcılık (Notification modeli mi, anlık mı).
4. **Sprint 5** R5 hash-tarama aracı seçimi (senin araştırman).
5. **Kozmetik:** ölü `auth.errors.BLOCKED` i18n anahtarı — kaldırılsın mı? (Tek taraflı dokunmadım; tetiklenmiyor ama dururken latent G3-sızıntı-mesajı.)

## Sıradaki mantıklı adım (önerim)
Kapıların hepsi sende: presence-görünürlük kararını ver → 6.2/6.3'ü bitirelim; paralelde hukuk görüşünü başlat → 4B açılır. Gece T&S çekirdeğini test ettiğim için artık o tarafa güvenle dokunabiliriz.
