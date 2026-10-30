# SPRINT C38: Kaldığın yerden aç (son sohbet + ortam başına son kanal)

> Durum: **SÖZLEŞME YAZILDI + SAHİP ONAYI (2026-10-30).** PM compose (Opus). **web (masaüstü dahil) + mobil.** api değişikliği YOK.
> R7 yok (yalnız istemci gezinmesi; erişim kararları sunucuda aynen).

---

## §0 Kararlar (sahip, 2026-10-30)
1. Uygulama soğuk açılışta **en son bakılan sohbeti** açar: ortam metin kanalı ya da DM / grup DM. Ayarlar, pencereler, arama,
   formlar geri getirilmez.
2. **Ortam başına son kanal:** bir ortama tıklayınca o ortamda en son bakılan metin kanalı açılır (bugünkü "ilk kanal" yerine).
3. **Sesli kanala asla otomatik girilmez.** Kayıtta sesli kanal hiç tutulmaz; kullanıcı sesli kanal ekranındaysa o ortamın son
   metin kanalı kaydedilir. Mikrofonun istemeden açılması gizlilik kazasıdır.
4. Kaydedilen yalnız kimlikler (ortam id, kanal id, DM kanal id). Mesaj içeriği, kanal adı saklanmaz.
5. Kayıt **cihaz yerel** (web `localStorage`, mobil mevcut kalıcı depolama), kullanıcı kimliğine bağlı anahtar
   (`kv.resume.<userId>`): aynı cihazda başka hesapla girilirse öbürünün son sohbeti açılmaz. Çıkış yapınca o kullanıcının kaydı silinir.
6. Hedef açılamıyorsa (silinmiş, ortamdan atılmış/banlanmış, özel kanal erişimi yok, yaş kapısı, DM engeli, kanal artık metin değil)
   **sessizce** varsayılana düşülür ve o kayıt silinir. Hata mesajı ya da "erişim yok" ekranı gösterilmez.
7. Açık bir hedef varsa kayıt yok sayılır: bildirime tıklayarak açılış, davet bağlantısı, adres çubuğuna yazılmış/yer imli adres,
   masaüstü uygulamasının derin bağlantısı. Kayıt yalnız "hiçbir yere gitmeden açılış" için kullanılır.

## §1 Web (masaüstü aynı kod)
1. Kaydetme: router `afterEach`'te `channel` (yalnız kanal tipi `GUILD_TEXT` ise) ve `dm` rotaları kaydedilir: `last` (son sohbet) +
   `guilds[guildId] = channelId`. Ortam haritası en çok 100 girdi (en eski düşer).
2. Açılış: kimlikli kullanıcı uygulamaya **`/channels/@me` ile ve açık hedefsiz** girdiyse (dev "açık hedefsiz" ayrımını nasıl
   yaptığını raporlar: örn. ilk navigasyon + yönlendirme kaynağı; masaüstü uygulaması hangi adresi yüklüyor teyit edilir,
   `desktop/src/main.js`) `last` hedefe `replace` ile gidilir. Kullanıcı açılıştan sonra ana ekrana kendisi dönerse yönlendirme yapılmaz.
3. Ortam tıklaması: sunucu rayındaki ortam tıklaması (ve ortamı açan diğer yerler: dev listeler) `guilds[guildId]` varsa ona, yoksa
   bugünkü davranışa gider.
4. Doğrulama: hedefe gitmeden önce istemcideki mevcut veriyle (ortam/kanal listesi store'da var mı, kanal `locked` mı) kontrol;
   yoksa ya da sunucu 403/404 dönerse §0.6. Yeni API çağrısı eklenmez.
5. Yeni bağımlılık yok. `useStorage` (`@vueuse/core`) kullanılabilir.

## §2 Mobil
1. Kaydetme: `channel/[id]` ekranı (yalnız metin kanalı) ve `dm/[id]` ekranı odaklanınca aynı yapı kaydedilir. Ana sekmede seçili
   ortam değişince de `guilds` haritası bu ortamın son kanalıyla kullanılır.
2. Açılış: `app/index.tsx` kimlikli yönlendirmesinde, **bildirimle açılış değilse** (`expo-notifications` son yanıtı; dev mevcut
   bildirim yönlendirmesinin yerini bulur ve sıralamayı raporlar) önce `/home` (son ortam seçili), üstüne `last` sohbet ekranı itilir;
   geri tuşu ana ekrana döner, uygulamadan çıkmaz.
3. Ortam seçimi: ana ekranda ortam seçilince (mobilde ortam seçmek kanal listesini gösteriyorsa) son kanal **vurgulanır**, otomatik
   açılmaz; mobil gezinme mimarisi (PLAN 2026-07-29) değişmez. Dev mevcut davranışı inceler, otomatik açma gerekiyorsa PM'e gelir.
4. Arka plandan dönüş bugünkü gibi (zaten kaldığı yerde); bu sprint yalnız soğuk açılış.
5. Doğrulama §0.6 ile aynı.
6. `mobile/app.json` versionCode **41 kalır** (vc41 henüz gönderilmedi, C35/C36 ile birlikte gider).

## §3 DoD
- web: `vue-tsc -b` (bilinen 6), `vite build`, değişen dosyalarda eslint. mobil: typecheck + lint.
- **Sahip turu:**
  - Web/masaüstü: bir ortamın 3. kanalına geç, uygulamayı kapat, aç → o kanal açık · başka ortama geç, ilk ortama dön → 3. kanal ·
    DM'deyken kapat/aç → DM açık · sesli kanaldayken kapat/aç → sesli kanala bağlanmıyor · ortamdan çık/atıl, aç → ana ekran, hata yok ·
    davet bağlantısıyla açılış davete gidiyor · çıkış yap, başka hesapla gir → öbürünün sohbeti açılmıyor.
  - Mobil: uygulamayı tamamen kapat (son uygulamalardan kaydır), aç → son sohbet açık, geri tuşu ana ekran · bildirime dokunarak
    açılış bildirimin sohbetine gidiyor.

**OUT:** kaydırma konumu (mesaj listesinde nerede kalındığı) · cihazlar arası senkron (sunucuda saklama) · ayar/pencere geri getirme ·
taslak mesaj saklama.

---

## §4 Ek (2026-10-30, cihaz turu)

**Kök neden (mobil, "son kanal açılmıyor, ana ekran geliyor"):** iki ayrı kusur, ikisi de düzeltildi.
1. Her soğuk açılışta `Notifications.getLastNotificationResponse()` tarihsiz/`date=0` bayat bir bildirim yanıtı döndürüyordu; C38 kapısı bunu "bildirimle açılış" sanıp kaydı yok sayıyordu (`mayResume` hep false). Çözüm: `notification.date` süreç başlangıcından 60 sn'den eskiyse bayat say, kaydı engelleme (`app/index.tsx`, yalnız C38 kapısı).
2. `router.replace('/home')` ile `router.push(hedef)` aynı tikte verilince push yutuluyordu. Çözüm: Index yalnız `/home`'a replace eder, çözülen hedef tek seferlik değişkene (`setPendingTarget`) konur, `home.tsx` odaklanınca push eder.
Ek: doğrulama zaman aşımı 5 sn -> 10 sn. Teşhis için `[resume]` log satırları (kimlik yok) bırakıldı.

**Karar (sahip + PM, yalnız mobil; web/masaüstü değişmedi):** DM ve grup DM mobilde geri yüklenmez. Gerekçe gizlilik (Discord mobil davranışı): telefon başkasının elindeyken özel konuşma açılmasın. `dm/[id]` ekranı ve ana ekran DM görünümü son sohbeti temizler; ana ekranda ortam kanal listesi görünürken son sohbet o ortamın son kanalı olur. Sonuç tablosu: ortam kanalı -> o kanal · ortam kanal listesi -> ortamın son kanalı · DM / grup DM -> ana ekran · ana ekran DM listesi -> ana ekran. Bildirimle açılış değişmez.

**Borç:** `notifications/responseGate.ts` aynı bayat bildirim yanıtını okuyor ve tarih süzgeci yok. Şu an zararsız görünüyor (cihaz turunda eski bildirim hedefi açılmadı) ama bayat yanıt `data.type` süzgecinden geçerse eski hedefe gitme riski var. Ayrı iş olarak tarih süzgeci eklenmeli.
