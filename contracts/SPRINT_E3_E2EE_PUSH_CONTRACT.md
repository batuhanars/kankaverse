# SPRINT E3: Şifreli DM'de bildirim önizlemesi, liste önizlemesi, sabitlenenler

> Durum: **TASARIM KİLİTLİ (2026-11-11, sahip onayı). Rev.1 (aynı gün, cihaz turu: çözme kısa servise taşındı, §8; §1.1 kaldırıldı).** PM compose (Opus). **e2ee-client + api + mobil + web.**
> Yol haritası (revize, sahip 2026-11-11): E0 ✅ → E1 ✅ (canlı, izin listesi) → **E3 bu sprint** → E4 şikâyet → E5 yedek → **herkese açılış** → E2 grup DM → E6-E8.
> 🔴 **R7 bölgesi.** Şifre çözme yolu ve push yüküne giren her alan sahibin satır satır incelemesinden geçer.
> Dayanak: `SPRINT_E1_DM_E2EE_CONTRACT.md` (ilkeler §1 aynen geçerli), `SPRINT_C50_CONVERSATION_PUSH_CONTRACT.md` (v2 veri biçimi), `SPRINT_C52_QUICK_REPLY_CONTRACT.md` (hızlı cevap görevi).

## §0 Karar ve kapsam

**Herkese açma kapısı (sahip, 2026-11-11):** E1 + E3 + E4 + E5 tamamlanmadan bayrak izin listesi dışına açılmaz. Yayın E5'ten sonra; yeni cihazda şifreli geçmiş yayın anında yedekle gelir, ara dönem uyarısı gerekmez. Grup DM (E2) yayından sonra; yayında grup DM'leri şifresizdir ve arayüz/gizlilik metni bunu söyler (E4 gizlilik metni işi).

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
