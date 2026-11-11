# SPRINT E3: Şifreli DM'de bildirim önizlemesi, liste önizlemesi, sabitlenenler

> Durum: **TASARIM KİLİTLİ (2026-11-11, sahip onayı). Rev.5 (aynı gün: dm.message şifreli yük, masaüstü bildirimi + liste, mobil ön plan liste, §12). Rev.4 (push penceresini biz tutarız, tek bildirim; soğuk çözme < 1 sn, §11; cihazda GEÇTİ: soğuk 1,76 sn, arka plan 1,0 sn, "2" yok). Rev.3 (zamanlayıcı kuralı, paralel çözme, hafif hızlı cevap, §10). Rev.2 (önce göster, sonra çevrimdışı çöz ve güncelle, §9; Rev.1 GEÇERSİZ). Rev.1 (çözme kısa servise taşındı, §8; §1.1 kaldırıldı).** PM compose (Opus). **e2ee-client + api + mobil + web.**
> Yol haritası (revize, sahip 2026-11-11): E0 ✅ → E1 ✅ (canlı, izin listesi) → **E3 bu sprint** → E4 şikâyet → E5 yedek → **herkese açılış** → E2 grup DM → E6-E8.
> 🔴 **R7 bölgesi.** Şifre çözme yolu ve push yüküne giren her alan sahibin satır satır incelemesinden geçer.
> Dayanak: `SPRINT_E1_DM_E2EE_CONTRACT.md` (ilkeler §1 aynen geçerli), `SPRINT_C50_CONVERSATION_PUSH_CONTRACT.md` (v2 veri biçimi), `SPRINT_C52_QUICK_REPLY_CONTRACT.md` (hızlı cevap görevi).

## §0 Karar ve kapsam

**Herkese açma kapısı (sahip, 2026-11-11, aynı gün revize):** E1 + E3 + E4 + E5 + E2 tamamlanmadan bayrak izin listesi dışına açılmaz. Sıra E4 → E5 → E2 → yayın. Yeni cihazda şifreli geçmiş yayında yedekle gelir; grup DM de yayında şifreli, ara dönem açıklaması gerekmez.

**Bugünkü durum (E1):** şifreli 1-1 DM'de push gövdesi ve DM listesi önizlemesi sabit `"🔒 Yeni mesaj"` / `"🔒 Şifreli mesaj"`. Bildirimden hızlı cevap **zaten şifreli gidiyor** (`quickReply.ts` → `stores/e2ee.sendMessage`, E1'de yapıldı). Sabitlenen mesajlar listesi şifreli mesajı çözmüyor (D92).

**E3 kapsamı:**
1. **Bildirim önizlemesi:** şifreli DM push'u şifreli yükü taşır, telefondaki bildirim görevi çözer, bildirimde gerçek metin görünür (§2, §3).
2. **DM listesi önizlemesi:** son mesaj şifreliyse ve cihaz onu çözdüyse listede gerçek metin (§4).
3. **Sabitlenenler (D92):** şifreli sabitlenen mesajlar yerel depodan doldurulur (§4).
4. **Hızlı cevap:** yeni kod yok; cihaz turunda şifreli gittiği teyit edilir (§6).

**Kapsam DIŞI:** grup DM (E2), web/masaüstü işletim sistemi bildirimi (bugün DM için yok, açılmıyor), kilit ekranında içerik gizleme ayarı (bugünkü davranış korunur, §7), push'taki gönderen adı/avatarının gizlenmesi (§7), iOS.

## §1 İlkeler (E1 §1'e ek)

1. **Kotlin değişmez** (C50 kararı): çözme JS görevinde, Kotlin yalnız çizer. Native değişiklik YOK, yeni derleme yalnız JS içindir.
2. **Tek çözme, tek kuyruk:** bildirim görevi mesajı motorun mevcut kuyruğundan (`withLock`) çözer ve sonucu yerel depoya yazar. Sohbet sonra açılınca aynı mesaj depodan okunur, **ikinci kez çözülmez** (MLS anahtarı kullanınca siliniyor; ikinci çözme zaten başarısız olur). Ayrı bir çözme yolu yazılmaz, mevcut `Hydrator` kullanılır.
3. **Bildirim asla kaybolmaz:** çözme herhangi bir nedenle olmazsa (motor yok, ağ yok, zaman aşımı, bilinmeyen sürüm, çözülemedi) bildirim bugünkü genel metinle (`text` alanı) çıkar. Tek istisna: gönderen cihaz iptal edilmişse (`hidden`) bildirim **gösterilmez** (E1 §3.3: o mesaj ekranda da gösterilmiyor).
4. **İçerik loglanmaz:** çözülen metin, şifreli yük, anahtar hiçbir logda yok (release ve `__DEV__` dahil). Yalnız süre ve sonuç türü.
5. **Sunucu yine içerik görmez:** push yüküne giren tek yeni veri, mesaj kaydında zaten duran şifreli yük ve gönderen cihaz kimliği.

## §2 API

### §2.1 v2 veri biçimine ek (C50 §1)
`kind: 'message'` nesnesine isteğe bağlı alan:
```ts
e2ee?: {
  ciphertext: string,      // mesajın base64 şifreli yükü (Message.ciphertext, aynen)
  senderDeviceId: string,
  createdAt: string,       // ISO; Hydrator'ın iptal kuralı bunu kullanır
}
```
- Yalnız şifreli DM mesajında VE `ciphertext` base64 uzunluğu `E2EE_PUSH_MAX_CIPHERTEXT` (sabit **2800**, `e2ee.constants.ts`) ve altındaysa eklenir. Üstündeyse alan yok, bildirim genel metinle çıkar (FCM 4 KB sınırı; C50'deki diğer alanlar ~800 bayt). Sınır tek sabitte, testte de o sabit kullanılır.
- `text` alanı şifreli mesajda bugünkü gibi `E2EE_PUSH_GENERIC_TEXT` kalır: istemcinin çözemediği durumdaki yedek metin.
- `messageId` şifreli mesajda zorunlu dolu (bugün de dolu; testle sabitlenir).
- v1 biçimi (eski uygulama) değişmez: genel metin.

### §2.2 Bayrak
- Config `E2EE_PUSH_CIPHERTEXT` (boolean, varsayılan **false**). Kapalıyken `e2ee` alanı hiç eklenmez, her şey bugünkü gibi. Sorun olursa tek env ile geri dönülür, mobil sürüm gerekmez.
- `E2EE_ENABLED` / izin listesi kuralları değişmez (şifreli mesaj zaten yalnız uygun kullanıcılar arasında var).

### §2.3 DM listesi `lastMessage`
- `GET` DM listesi (`dm.service.ts`, `lastMessage` üreten tüm yerler) ve `dm.message` soket yükü `lastMessage`'a `id` ekler (her mesajda, şifresizde de; istemci yalnız şifrelide kullanır). İçerik kuralı değişmez (şifrelide sabit metin + `encrypted: true`).

### §2.4 Sabitlenenler
- `GET .../pins` şifreli mesajı mevcut DTO kuralıyla döndürüyor (`content: ''`, `encrypted`, `ciphertext`, `senderDeviceId`). Değişiklik yok; dev bunu testle teyit eder. Değilse DURUR, bildirir.

### §2.5 Testler (api)
`e2ee` alanı: bayrak açık + şifreli + sınır altı → var ve `ciphertext` mesajdakiyle aynı; sınır üstü → yok; bayrak kapalı → yok; şifresiz mesaj → yok; v1 token → v1 gövdesi değişmedi; `text` şifrelide genel metin. `lastMessage.id` listede ve soket yükünde. Mevcut push/gateway spec'leri değişmeden geçer.
DoD: spec'ler yeşil, `tsc -p tsconfig.build.json` temiz. Şema değişikliği YOK.

## §3 Çekirdek istemci (`shared/e2ee-client`)

### §3.1 Yeni motor ucu
`engine.decryptForNotification(msg: WireMessage): Promise<NotificationPreview>`
```ts
type NotificationPreview =
  | { kind: 'text'; body: string }   // çözüldü (ya da daha önce çözülmüştü, depodan)
  | { kind: 'hidden' }               // iptal edilmiş cihazdan: bildirim gösterilmez
  | { kind: 'unavailable' }          // diğer her durum: genel metin gösterilir
```
- İçeride mevcut `hydrate(channelId, [msg])` yolunu kullanır (kuyruk, depo, iptal kuralı, eksik commit senkronu, bayat grup kuralı aynen). Yeni kripto mantığı yazılmaz.
- `status !== 'ok'` olan kayıt (bilinmeyen sürüm, çözülemedi) → `unavailable`.
- 🔴 **Kalıcı başarısızlık yazımı:** bildirim bağlamında geçici bir hata (ağ, zaman aşımı) mesajı depoya kalıcı `failed` olarak YAZMAMALI; yoksa sohbet açılınca da çözülemez görünür. Mevcut davranışta ağ hatası `resolveAll`'dan istisna olarak çıkıyor ve yazılmıyor; dev bunu testle sabitler. Yalnız gerçek `DecryptError` (commit senkronundan sonra) kalıcı yazılır, bu E1 davranışıdır.

### §3.2 Testler (çekirdek)
1. Bildirimden çözülen mesaj, sonraki `hydrate` (sohbet açılışı) çağrısında depodan gelir; grup `decrypt` ikinci kez çağrılmaz.
2. Aynı mesaj için bildirim çözmesi ve `hydrate` eşzamanlı başlatılır → tek çözme, ikisi de aynı metni görür.
3. Sırasız varış: aynı göndericinin 2. mesajı bildirimle önce çözülür, 1. mesaj sonra sohbette çözülür.
4. İptal edilmiş cihazın iptal sonrası mesajı → `hidden`.
5. Ağ hatası (sahte `channelState` reddi) → `unavailable`, depoya kayıt yazılmadı; ağ gelince `hydrate` çözer.
6. Bilinmeyen yük sürümü → `unavailable`.

## §4 İstemciler: liste önizlemesi ve sabitlenenler

### §4.1 Ortak kural
- `lastMessage.encrypted` ve yerel depoda o `id` için `status: 'ok'` kayıt varsa önizleme = kayıttaki metin (mevcut önizleme kısaltma kuralıyla). Yoksa bugünkü "🔒 Şifreli mesaj".
- Önizleme için **çözme yapılmaz**, yalnız depodan okunur (`engine.quoteText(id)` aynı işi görüyor; ad uygunsa genel bir `plainText(id)` olarak yeniden adlandırılabilir, dev karar verir, iki ayrı fonksiyon yazılmaz).
- Liste açılışında N satır için N depo okuması; kuyruk üzerinden sırayla. Liste ilk boyamayı beklemez: önce "🔒 Şifreli mesaj", okununca metin.
- Kendi gönderdiğim son mesaj: `rememberSent` zaten depoya yazıyor, aynı kural.

### §4.2 Sabitlenenler (D92)
- Web `PinsPopover.vue` ve mobil sabitlenenler ekranı: şifreli satırlar `hydrateMessages` ile değil, **depodan** doldurulur (sabitlenen mesaj çok eski olabilir; geriye doğru çözme yürüyüşü tetiklenmez). Depoda yoksa "Şifreli mesaj" (mevcut `encryptedQuote` metni).

### §4.3 Metinler
Yeni kullanıcı metni beklenmiyor (mevcut `preview` / `encryptedQuote` / genel push metni yeterli). Gerekirse `vue-i18n` ve mobil i18n'e, `{'@'}` kaçışıyla.

## §5 Mobil bildirim görevi (`src/notifications/conversationPush.ts`)

### §5.1 Akış
`kind: 'message'` ve `e2ee` alanı varsa, `showConversationNotification`'dan önce:
1. `isConversationInView` ise hiçbir şey yapma (bugünkü gibi; ekran soketten çözer).
2. Motoru hazırla: ön planda/arka planda motor zaten varsa o kullanılır. Yoksa (başsız açılış) erişim anahtarı yenilenir ve `initE2ee(userId)` çağrılır.
   - `userId` kaynağı: C52 §2.1 avatar desenindeki gibi oturum açıkken AsyncStorage'a yazılır, görev oradan okur (ağ çağrısı yok); yoksa `authApi.me()`. Yalnız kullanıcı kimliği, token YOK. Çıkışta silinir.
3. `decryptForNotification({ id: messageId, channelId: conversationId, createdAt, encrypted: true, ciphertext, senderDeviceId })`.
4. `text` → bildirim metni = `body` (C50 `MAX_TEXT` ile kısaltılır). `hidden` → bildirim gösterilmez. `unavailable` / istisna / zaman aşımı → bildirim payload'daki `text` ile çıkar.
- **Zaman sınırı:** 2-4 arası adımlar toplam **8 sn**. Aşılırsa genel metinle göster; arka plandaki çözme sürebilir ve depoya yazabilir (zararsız, sohbet açılınca hazır olur).
- Şifreli yükü olan ama motoru bu kullanıcı için kapalı cihaz (bayrak/izin listesi): genel metin.

### §5.2 Hızlı cevap
Kod değişikliği beklenmiyor. Bildirime eklenen "Ben: ..." satırı zaten düz metin (kullanıcının yazdığı). Cevap bildirimi yeniden kurduğunda önceki çözülmüş mesaj satırları korunur (C52 `appendOwnReply` stili koruyor); cihaz turunda teyit.

### §5.3 Süre ölçümü
`metric` ile yalnız `push-decrypt <ms> sonuç=<text|hidden|unavailable|timeout>` ve soğuk/sıcak ayrımı. İçerik yok.

### §5.4 Sürüm
versionCode **67**. Native değişiklik yok; yine de release paketi kısa yol kopyasında, kaynakla `cmp` eşitlenerek derlenir ([[kisa-yol-derleme-kopyasi]]) ve canlıya karşı cihazda denenir. `npm run typecheck`, `npm run lint` temiz.

## §6 Uygulama sırası ve teslim

1. `shared/e2ee-client` §3 + testler → **R7 incelemesi 1**
2. api §2 + spec'ler → **R7 incelemesi 2**. Prod'a `E2EE_PUSH_CIPHERTEXT=false` ile gider.
3. mobil §4 + §5, web §4 → web ve mobil birim testleri yeşil, web `vue-tsc -b` yalnız bilinen 6 hata.
4. Yerelde sahip cihaz turu (§6.1) → **R7 incelemesi 3** → merge → prod deploy → sahip hesaplarında `E2EE_PUSH_CIPHERTEXT=true` → canlıda kısa tur → vc67 Play.

### §6.1 Cihaz turu DoD (sahip)
İki hesap, A telefonda, B web + telefonda, şifreli 1-1 DM:
- B yazar; A'nın uygulaması **ön planda başka ekranda / arka planda / kaydırılıp kapatılmış / telefon yeniden başlatılmış**: bildirimde gerçek metin görünür.
- A bildirime dokunur, sohbet açılır: mesaj "çözülemedi" DEĞİL, gerçek metin (depodan geldi, ikinci çözme yok).
- Arka arkaya 5 mesaj, uygulama kapalı: hepsi bildirimde alt alta, sohbette hepsi okunur.
- A bildirimden cevaplar: B'de cevap görünür, A'nın sohbetinde cevap düz metin görünür.
- A'nın interneti kapalıyken gelen mesaj sonradan push'la gelir; push geldiğinde ağ yoksa genel metin, sohbet açılınca mesaj çözülür.
- DM listesinde son mesaj önizlemesi gerçek metin (web + telefon); sabitlenen şifreli mesaj listede okunur (web + telefon).
- `E2EE_PUSH_CIPHERTEXT=false` yapılınca bir sonraki bildirim genel metinle gelir, başka hiçbir şey bozulmaz.
- İzin listesi dışı kullanıcıyla DM: bildirim bugünkü gibi düz.

## §7 Bilinen sınırlar ve açık sorular (PM önerisiyle, sahip itiraz etmezse geçerli)

- **Push üst verisi:** gönderen adı, avatar adresi ve sohbet kimliği Expo ve Google sunucularından düz geçer (bugün de öyle). İçerik geçmez. Bu, gizlilik metnine (E4) dürüstçe yazılır. Gönderen adını da şifreli yüke taşımak ayrı iş, şimdilik gerek görmüyorum.
- **Kilit ekranı:** mesaj bildirim kanalında kilit ekranı görünürlüğü ayarlanmamış (`lockscreenVisibility` yok), yani kullanıcının Android ayarı geçerli. Varsayılan "tüm içeriği göster" ise E3 sonrası şifreli DM metni de kilit ekranında görünür (bugünkü şifresiz DM'ler ve yaygın mesajlaşma uygulamalarıyla aynı). Kullanıcı "hassas içeriği gizle" seçtiyse yalnız bildirim var bilgisi görünür. Bu sprintte değişiklik YOK. Uygulama içi "bildirimde mesaj içeriğini gösterme" ayarı sonraya (borç olarak PLAN'a).
- **Bildirim çekmecesi:** çözülmüş metin sistem bildiriminde durur, okununca/silinince gider. Bu, her mesajlaşma uygulamasındaki durum; kabul.
- **2800 bayt üstü mesaj:** genel metinle bildirilir. Uzun mesajların yüzdesi E1 verisinde düşük görünüyorsa ek iş yok; gerekirse sonra `messageId` ile çekme.
- **Web/masaüstü:** DM için işletim sistemi bildirimi yok, bu sprintte açılmıyor.

## §8 Rev.1: çözme kısa arka plan servisinde (2026-11-11, cihaz turu bulgusu, sahip onayı)

**Bulgu (M2101K7BG, MIUI, logcat):** push 10:57:14.5 → JS soğuk açılış 17.4 → `ExpoFirebaseMessagingService` biter 17.8 → MIUI süreci dondurur ("hibernation") 19.8. Çözme yarıda kalır; ne metin ne genel bildirim çıkar. Süreç sonradan çözülünce bildirim gecikmeli düşer (ilk telefonda ~15 dk). E3 öncesi bildirim JS yüklenir yüklenmez çizildiği için pencereye sığıyordu. Dondurulan süreçte JS zamanlayıcısı da durduğu için §5.1'deki 8 sn sınırı korumaz.

**Karar:** §1.1 ("Kotlin değişmez") bu sprint için KALDIRILIR. Şifreli yükü olan mesaj push'unda çözme + çizim, hızlı cevaptaki (C52) `QuickReplyService` deseniyle bir `HeadlessJsTaskService` içinde koşar; servis açıkken sistem süreci dondurmaz.
- **Kotlin:** `PushDecryptService` (`HeadlessJsTaskService`, görev adı `KvPushDecrypt`, üst süre **20 sn**, ön planda da çalışabilir, manifestte `exported=false`). Modüle `startPushDecrypt(dataJson: String): Boolean` fonksiyonu: servisi başlatır, başlatılamazsa (arka plan kısıtı vb.) `false`. Kotlin iş mantığı içermez: veriyi JS'e aynen geçirir.
- **JS:** `conversationPush.ts` görevi, `e2ee` alanı olan mesajda (ve sohbet ekranda değilse) `startPushDecrypt(JSON)` çağırır ve döner. `true` ise işi servis görevi yapar; `false` ise hemen genel metinle bildirim gösterir (bugünkü yedek). `index.js` kökünde `AppRegistry.registerHeadlessTask('KvPushDecrypt', ...)`: mevcut `previewForPush` + `showConversationNotification` akışı (§5.1 kuralları aynen: `hidden` → gösterme, diğer her durum genel metin, 8 sn iç sınır). Çözme ve çizim kodu iki yerde kopyalanmaz; tek fonksiyon.
- Şifreli yükü OLMAYAN mesaj push'u ve `read` / arama olayları bugünkü yoldan, değişmeden.
- **Native değişiklik:** yeni derleme. versionCode **68**. Release paketi PM tarafından kısa yol kopyasında derlenir; modül `android/` klasörü kaynakla `cmp` eşitlenir, APK'da `PushDecryptService` sınıfı aranır ([[kisa-yol-derleme-kopyasi]]).
- **DoD (sahip, M2101K7BG ve Redmi 14C):** uygulama kaydırılıp kapatılmışken gelen şifreli mesaj birkaç saniye içinde gerçek metinle bildirimde; logda `push-decrypt ... soğuk` satırı; telefon yeniden başlatıldıktan sonra da aynı. §6.1 turu bu derlemeyle tamamlanır.

## §9 Rev.2: önce göster, sonra çevrimdışı çöz (2026-11-11, sahip onayı)

**Rev.1 sonucu (M2101K7BG, vc68 sideload):** `PushDecryptService` başladı ama MIUI süreci yine dondurdu (11:12:14 "hibernation"), sistem servisi ~17 sn sonra "Waited long enough" ile kapattı; çözme hiç bitmedi. Arka plan servisi MIUI dondurmasını ENGELLEMİYOR. Ayrıca dondurulmuş süreçte ağ kesik olduğundan oturum yenileme zaman aşımına düştü ve istemci bunu "oturum bitti" sayıp çıkış yaptırdı (D97, ayrı düzeltme). **Rev.1 geçersiz;** dal `feat/e2ee-e3-push-service` merge EDİLMEZ, vc68 yalnız sahip cihazında denendi, Play'e gitmez.

**İlkeler (Rev.2):**
1. **Bildirim önce, hemen:** şifreli yükü olan mesajda bildirim, E3 öncesindeki gibi JS yüklenir yüklenmez `text` (genel metin) ile çizilir. Bu yol dondurma penceresine sığıyor (E1/C50 davranışı).
2. **Arka planda AĞ YOK, OTURUM YENİLEME YOK.** Bildirim yolunda hiçbir HTTP çağrısı, `refreshAccessToken`, `authApi.me`, cihaz kaydı, KeyPackage, Welcome, commit senkronu yapılmaz. Bu kural testle sabitlenir (motor bu yolda API portu olmadan kurulur; çağrı = test hatası).
3. **Sonra çevrimdışı çöz:** yalnız yerel depo (cihaz, yerel MLS grubu, önbellekteki cihaz görünümü) ile çözülür. Başarılıysa düz metin depoya yazılır (E1 §1.6, sohbet açılınca tekrar çözülmez) ve aynı bildirimdeki o mesajın metni gerçek metinle değiştirilir, sessizce (`setOnlyAlertOnce`). Başarısızsa hiçbir şey yapılmaz; bildirim genel metinle kalır, mesaj sohbet açılınca normal yoldan çözülür.
4. **Kalıcı başarısızlık yazılmaz:** çevrimdışı yolda hiçbir mesaj `failed`/`undecryptable` olarak kaydedilmez (eksik commit olabilir; karar çevrimiçi yolun).
5. Süreç dondurulursa iş yarıda kalır ve zararsızdır: bildirim zaten görünüyor.

### §9.1 e2ee-client
- `E2eeEngine.openLocal(userId, deps)` (ya da eşdeğeri): yalnız yerel depoyu açar, cihazı yükler; ağ portu ALMAZ. Cihaz yoksa `null`.
- **Cihaz görünümü önbelleği:** çevrimiçi yolda her `channelState` sonrası kanalın cihaz görünümü (kayıtlı cihazlar + imza anahtarları + `revokedAt`) depoya yazılır (`saveView`/`loadView`). Çevrimdışı çözme bunu kullanır; önbellek yoksa `unavailable`.
- `decryptOffline(msg): NotificationPreview`: yerel kayıtta varsa onu döner; yoksa yerel grup + önbellek görünümü ile tek deneme. İptal kuralı önbellek görünümüyle uygulanır (`hidden`). `DecryptError` ya da grup/görünüm yok → `unavailable`, depoya YAZILMAZ. Başarıda kayıt + grup durumu yazılır (mevcut kuyruk `withLock` içinde).
- Testler: ağ portu olmadan uçtan uca çözme; çözülen mesaj sonra çevrimiçi `hydrate`'te depodan gelir (tek çözme); eksik commit gerektiren mesaj → `unavailable`, kayıt yok, sonra çevrimiçi yol çözer; önbellek yok → `unavailable`; iptal cihaz → `hidden`.
- Rev.1'deki `decryptForNotification` (ağlı) bildirim yolundan kaldırılır; başka kullanıcısı yoksa silinir (dev raporlar).

### §9.2 Kotlin (native değişiklik)
- Mesaj kimliği: `showConversationNotification` her `MessagingStyle.Message`'a `messageId`'yi extras olarak koyar.
- Yeni `updateMessageText(conversationId, messageId, text): Boolean`: görünen bildirimin stilini çıkarır, o `messageId`'li mesajın metnini değiştirir, dokunma intent'i ve eylemler (Cevapla, Okundu, Sessize al) korunarak yeniden kurar, `setOnlyAlertOnce(true)`. Bildirim ya da mesaj yoksa `false`. Kotlin iş mantığı içermez.
- `hidden` sonucu: bu sürümde mesaj satırı genel metinle KALIR (içerik sızmaz; nadir durum). Kaldırma sonraya.
- Rev.1'in `PushDecryptService` ve `startPushDecrypt`'i bu dala alınmaz.

### §9.3 Mobil JS
- `conversationPush.ts`: `e2ee` varsa önce `presentMessage` genel metinle (bugünkü E3 öncesi yol), ardından `decryptOffline` → `text` ise `updateMessageText`. Tüm adımlar hata yutar.
- `headlessEngine.ts`'in bildirim yolu kullanımı kalkar (ağ yok). Hızlı cevap kendi yolunu korur (kullanıcı eylemi; D97 ile oturum düşürmez).
- Metrik: `push-decrypt-offline <ms> sonuç=<text|hidden|unavailable> soğuk|sıcak`.
- versionCode **69** (68 yalnız sideload). D97 mobil düzeltmesi aynı sürümde.

### §9.4 DoD (sahip, M2101K7BG MIUI + Redmi 14C)
- Uygulama kaydırılıp kapatılmışken şifreli mesaj: bildirim **hemen** (genel metinle ya da doğrudan gerçek metinle) düşer; gecikme yok.
- Uygulama arka plandayken (dondurulmamış): bildirim kısa süre içinde gerçek metne döner.
- Bildirime dokununca sohbette mesaj okunur (çözülmüş ya da normal yoldan çözülür), "çözülemedi" değil.
- Telefon yeniden başlatıldıktan sonra da bildirim gelir; **oturum hiçbir senaryoda düşmez.**
- `E2EE_PUSH_CIPHERTEXT=false` iken davranış E1 ile aynı.

## §10 Rev.3: arka plan yolunun sağlamlaştırılması (2026-11-11, deneme `spike/e3-timers` d01ef1b, sahip onayı)

**Deneme bulguları (M2101K7BG, MIUI varsayılan kısıtlamalar):**
1. **JS zamanlayıcıları arka planda DURUR.** React Native, uygulama ön planda değilken ve aktif HeadlessJs görevi yokken `setTimeout`'u çalıştırmaz; expo-task-manager push görevi HeadlessJs sayılmaz. `Hydrator.resolveAll` her çözmeden sonra `yieldToUi` (mobilde `setTimeout(0)`) bekliyordu: mesaj çözülüp depoya yazılıyor, sonra iş takılıyordu; ancak başka bir HeadlessJs görevi (hızlı cevap) başlayınca devam ediyordu. Rev.0'ın 8 sn sınırı ve Rev.2'nin "5-14 sn" gecikmeleri bunun sonucuydu.
2. **Çizim avatar indirmesini bekliyor.** `showConversationNotification` avatarı ağdan indirir (3+3 sn zaman aşımı); dondurulmuş süreç uyandırılınca ağ geç geldiği için çözme pencere kapanmadan başlayamıyordu.
3. Düzeltmelerle ölçüm: soğuk açılış çizim 578 ms / toplam 3,6 sn; arka plan 453 ms / 0,49 sn. Bildirim önce genel metin, sonra gerçek metin.
4. **Hızlı cevap** şifreli DM'de `initE2ee` (oturum + cihaz kaydı + KeyPackage + Welcome) yüzünden MIUI penceresine sığmıyor; `QuickReplyService` 30 sn'de kapanıyor, cevap ancak uygulama açılınca gidiyor. (Kısıtlama kaldırılınca gidiyor: teşhis teyitli.)
5. **"2" rozeti:** bildirimde tek mesaj var (`number=0`); MIUI çiz + güncelle'yi iki gönderim sayıyor. Kozmetik.

**Kurallar (Rev.3):**
1. **Arka plan bildirim ve hızlı cevap yolunda zamanlayıcı YOK.** `setTimeout`/`setInterval`/zamanlayıcıya dayalı mola, bekleme, zaman aşımı kullanılmaz. Çevrimdışı `Hydrator` mola vermez (deneme satırı). Bu kural birim testiyle sabitlenir (çevrimdışı çözmede `yieldToUi` çağrılmaz).
2. **Çözme çizimle paralel başlar**, çizim bitince çözülmüşse metin güncellenir (deneme `presentWithUpgrade`).
3. **Hafif hızlı cevap:** şifreli DM'de cevap `initE2ee` ile DEĞİL, yerel motorla (`openLocal`) yerel grup üzerinden şifrelenir; ağa yalnız oturum yenileme (gerekirse) ve `POST` mesaj için çıkılır. Sunucu epoch çakışması (409) ya da yerel grup yok → bildirime "Gönderilemedi: …" (mevcut metin), sessiz kayıp yok. Gönderilen düz metin depoya yazılır (`rememberSent` karşılığı, sohbet açılınca kendi mesajı okunur). Şifresiz sohbette akış değişmez.
4. **Cevap alıcısı işi bitene kadar süreci tutar:** `QuickReplyReceiver` `goAsync()` ile, JS görevi bitince (ya da en çok ~9 sn) `finish()`; böylece MIUI dondurma penceresi açık kalır. JS tarafına "bitti" sinyali modül fonksiyonuyla verilir. Sınırlar ve Android sürüm kuralları dev raporunda.
5. **Soğuk açılış ölçümü:** `openLocal` + çözme adımlarının süresi ayrı ayrı ölçülür (yalnız süre), en pahalı adım raporlanır; kolay kazanç varsa (ör. tekrar açılmayan depo, önbelleğe alınan yerel motor — çıkışta temizlenecek şekilde) uygulanır, yoksa yalnız rapor.
6. **"2" rozeti:** güncelleme yeniden kurulumunda `setNumber(<stildeki mesaj sayısı>)` denenir; MIUI'de etkisi cihazda gözlenir. Etkisizse kabul (kozmetik), borç olarak PLAN'a.

**Kapsam:** `shared/e2ee-client` (yalnız kural 1 testi + gerekirse hafif şifreleme yardımcısı), `mobile` (JS + Kotlin). Sunucu değişmez. versionCode **70** (69 yalnız sideload).
**DoD (sahip, MIUI varsayılan ayarlar):** kapalı ve arka plan uygulamada şifreli mesaj bildirimi önce genel metin, birkaç saniye içinde gerçek metin; bildirimden cevap 5 sn içinde karşıya ulaşır (kapalı uygulamada dahil); oturum hiçbir senaryoda düşmez; sohbet açılınca kendi cevabım okunur.

## §11 Rev.4 (DENEME → sonra kilit): tek bildirim, doğrudan gerçek metin (2026-11-11, sahip onayı)

**Hedef (sahip karşılaştırması):** yaygın E2EE mesajlaşma uygulaması bildirimi tek seferde, doğrudan gerçek metinle gösteriyor; geçici "🔒 Yeni mesaj" ve MIUI "2" yok. Yöntemleri (genel bilgi + çıkarım): push uyandırır, mesaj native kodda push işlem süresi içinde çözülür, bildirim bir kez çizilir.

**Bizdeki engeller (vc70 ölçümü):** headless JS soğuk açılış ~3 sn; saf JS kriptonun ilk kullanımı (`push-step decrypt` soğuk 2,7 sn, sıcak 0,22 sn); Expo'nun push servisi işi JS'e devredip hemen biter, MIUI ~2 sn sonra dondurur.

**Yaklaşım (kripto native'e TAŞINMAZ, E1 §1.1-1.2 korunur):**
1. **Push penceresini biz tutarız (Kotlin):** kendi `FirebaseMessagingService` sınıfımız (Expo'nunkini genişletir; modül manifestinde Expo servisi `tools:node="remove"`, bizimki `com.google.firebase.MESSAGING_EVENT` ile). `onMessageReceived`: üst sınıfı çağırır (JS görevine teslim aynen), şifreli yükü olan v2 mesajında JS'ten "bitti" sinyali gelene ya da **8 sn** (native zaman aşımı) dolana dek bekler (`CountDownLatch`). Süre dolarsa native taraf bildirimi payload'daki genel metinle çizer (yalnız çizim, karar yok). Diğer push'lar beklemez.
2. **JS tek çizim:** tutulan modda JS önce çözer (ağsız, zamanlayıcısız), sonra **bir kez** çizer: çözüldüyse gerçek metin, değilse genel metin; ardından "bitti" sinyali. Eski native (tutma yok) → Rev.3 akışı (göster + güncelle) aynen.
3. **Soğuk çözme < 1 sn:** `decrypt` adımının içi ölçülür (imza doğrulama / anahtar türetme / AEAD). Sebep `@noble/curves` önhesaplamasıysa yalnız kütüphanenin belgelenmiş ayarıyla (ör. `precompute` pencere boyutu) küçültülür; sıcak yol > %50 gerilemez; RFC 9180 vektörleri ve tüm çekirdek testleri yeşil. Belgelenmiş ayar yoksa DUR, rapor.

**Deneme DoD (sahip, MIUI varsayılan):** kapalı uygulamada şifreli mesaj bildirimi **tek seferde gerçek metinle** düşer (geçici metin yok, "2" yok); 8 sn'yi aşan durumda genel metin düşer (bildirim kaybolmaz); arka planda aynı; oturum düşmez. Tutarsa §11 kilitlenir ve yayına bu sürümle çıkılır.

## §12 Rev.5: masaüstü bildirimi ve DM listesi (2026-11-11, sahip bulgusu)

**Bulgu:** masaüstü (Electron) DM bildirimi ve DM listesi `dm.message` soket olayıyla beslenir; şifreli DM'de bu olay yalnız `encrypted: true` taşır, şifreli yük yalnız açık sohbetin odasına (`message.created`) gider. Sohbet açık değilken masaüstü çözecek veri bulamaz: bildirim ve liste "🔒 Şifreli mesaj" kalır. Mobilde ön planda (ana ekran) aynı sebeple liste genel metin gösterir.

**Kurallar:**
1. **api:** şifreli DM mesajında `dm.message` yükünün `lastMessage`'ına `e2ee: { ciphertext, senderDeviceId, createdAt }` eklenir (push'taki `e2ee` alanının aynısı, boyut sınırı YOK; soket). Bayrak: `E2EE_PUSH_CIPHERTEXT` ile aynı bayrak (ayrı bayrak açılmaz). Şifresiz mesaj ve `content`/genel metin kuralı değişmez.
2. **Web/masaüstü:** `dm.message` gelince `e2ee` varsa motorla (çevrimiçi motor; web'de zamanlayıcı kısıtı yok) mesaj **önce** çözülüp depoya yazılır (tek çözme kuralı: depoda varsa okunur), sonra liste önizlemesi ve masaüstü bildirimi gerçek metinle. Çözülemezse/`hidden` → bugünkü genel metin (`hidden` ise bildirim de atılmaz). Çözme sırası korunur (motor kuyruğu). Bildirim gecikmesi: çözme beklenir ama en çok makul süre (motor hazır değilse genel metin, beklemeden).
3. **Mobil (ön plan):** `dm.message` gelince `e2ee` varsa UI motoruyla çözülür, liste önizlemesi anında güncellenir (ör. çözüm sonrası önizleme haritasına yazma ya da motor/depo "çözüldü" sayacı). Arka plan bildirim yolu (Rev.4) değişmez; ikisi aynı kuyruktan geçer, mesaj iki kez çözülmez.
4. Testler: api (alan var/yok/bayrak), e2ee-client gerekirse, web/mobil önizleme seçimi.

**DoD (sahip):** masaüstü uygulaması açık, DM sohbeti açık DEĞİL: şifreli mesajda masaüstü bildirimi ve DM listesi gerçek metin. Mobil ana ekran açıkken: DM listesi gerçek metin. Sohbet açıkken mesajlar normal görünür (çift çözme/“çözülemedi” yok).
