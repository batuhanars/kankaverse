# Sprint M1a Contract — Mobil Gezinme Kabuğu + Mesajlaşma (Track F2)

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + `mobile/CLAUDE.md` geçerli. Önceki faz: `SPRINT_M0_MOBILE_CONTRACT.md` (tamamlandı).
>
> **R7 durumu:** Bu sprint **R7-nötr olmalıdır.** Tüm erişim/yaş/DM kapıları backend'de zaten kurulu;
> mobil yalnız sonucu gösterir. `api/` tier'ına dokunma ihtiyacı doğarsa **DUR** — o an sprint R7'ye girer.

---

## 0. Bu sözleşmeyle kapanan kararlar

| Konu | Karar |
|---|---|
| Faz bölünmesi | M1 ikiye bölündü (sahip onayı 2026-07-29). **M1a = kabuk + mesajlaşma** (bu dosya). **M1b = hesap yüzeyleri** (kayıt, şifre sıfırlama, profil, bildirimler ekranı) |
| Gezinme mimarisi | PLAN Track F2'deki sahip kararı bağlayıcı: rail + sidebar kalıcı, içerik ayrı tam ekran, sağ üye paneli **yok**, alt tab çubuğu 3 eleman |
| M0'ın "Ortamların" ekranı | **Kaldırılır.** Geçici iskeleydi; yerini rail + sidebar alır |
| Ses/görüntü | **Kapsam dışı** (M3). Ses kanalı satırları listede görünür ama girilemez — dokunulunca hiçbir şey olmaz **denmez**, kanal listesi yalnız metin kanallarını gösterir |
| Mesaj düzenleme / silme / tepki / pin / arama | **Kapsam dışı.** M1a okuma + gönderme + gerçek zamanlı alma ile sınırlı |
| Mention **yazma** (autocomplete) | Kapsam dışı. Ama **mention gösterimi zorunlu** (§5.4) |
| DM istekleri | **Dahil.** Backend uçları hazır (`/dm/requests` + accept/reject). Mobilde görünmezse kullanıcı kendisine gelen isteği hiç göremez — bu "dilsizlik" T&S açısından kabul edilemez |
| Grup DM | Liste + okuma + gönderme dahil; **grup kurma/üye ekleme kapsam dışı** |
| Mesaj ekleri | **Gösterim dahil, yükleme kapsam dışı** (sahip onayı). Görsel → küçük önizleme, diğer dosyalar → dosya adı rozeti. Ayrıntı ve **T&S kapısı** §5.5 |

---

## 1. Hedef

Mobil uygulamanın **kullanılabilir** hâle geldiği faz: kullanıcı ortamlarını ve DM'lerini geziyor,
mesajları okuyor, mesaj gönderiyor, karşı taraf yazınca anında görüyor.

### DoD (emülatörde **ve** en az bir kez fiziksel cihazda doğrulanır)

> M0'ın dersi: kod incelemesi ve birim testler yeterli değil. Her madde **görülerek** kapatılır.

1. Giriş sonrası **rail + sidebar** ekranı açılır; ortamlar rail'de, seçili ortamın kanalları sidebar'da.
2. Sidebar'da **DM listesi** görünür (son mesaj önizlemesi + okunmamış göstergesi).
3. Kanala dokununca **mesaj ekranı ayrı tam ekran** açılır; geçmiş yüklenir, yukarı kaydırınca eskisi gelir.
4. Mesaj yazılıp gönderilir; kendi ekranında **anında** belirir.
5. **İkinci bir istemciden** (web) gönderilen mesaj, mobil ekranda **yenileme yapmadan** belirir.
6. Karşı taraf yazarken **"yazıyor" göstergesi** görünür.
7. Uygulama arka plana alınıp geri dönülünce bağlantı **kendini toparlar** ve **kaçırılan mesajlar gelir**
   (ekranda boşluk kalmaz).
8. Alt tab çubuğu çalışır; **Bildirimler** sekmesi okunmamış bildirimleri listeler.
9. DM isteği gelen kullanıcı bunu mobilde görür, kabul/ret edebilir.
10. Mention içeren mesaj `<@cms...>` gibi ham token göstermez, `@kullanıcıadı` olarak render olur.
11. Görsel ekli mesaj önizleme gösterir; **taranmamış (`PENDING`) ek görsel olarak yüklenmez** (§5.5).

### Kapsam DIŞI

Ses/görüntü, medya yükleme, mesaj düzenleme/silme/tepki/pin/arama, mention yazma, kayıt/şifre sıfırlama,
profil düzenleme, ortam/kanal yönetimi (oluşturma, ayar, üye yönetimi), keşfet, etkinlikler, tablet düzeni, iOS.

---

## 2. Gezinme mimarisi (bağlayıcı)

```
Alt tab çubuğu (3):  [Ana Sayfa]      [Bildirimler]      [Sen]
                          │
                    rail + sidebar (tek ekran, kalıcı)
                    ├── rail:    ortam ikonları (altıgen) + DM/ana sayfa girişi
                    └── sidebar: seçili ortamın kanal listesi  VEYA  DM listesi
                          │
                    dokunuş → içerik AYRI TAM EKRAN (üstte geri oku)
                    ├── kanal mesaj ekranı
                    └── DM mesaj ekranı
```

- **Sağ üye/profil paneli YOK.** Profil, DM başlığında karşı tarafın adına/avatarına dokununca açılır
  (M1a'da **salt okunur** profil kartı; düzenleme M1b).
- "Sen" sekmesi M1a'da kendi profilini **salt okunur** gösterir (avatar, kullanıcı adı, çıkış yap).
  Ayarlar yüzeyi M1b'de gelir — **boş iskele koyma.**
- Web'in responsive deseni (tek drawer + sabit orta panel) **taşınmaz**; mobil bu dosyadaki desendir.

---

## 3. Endpoint'ler (imza = dosya, bu tablo yalnız yol listesidir)

> **M0'ın en pahalı dersi:** sözleşme `login` gövdesini `emailOrUsername` yazmıştı, gerçek alan `identifier`'dı.
> **DTO alan adları, sorgu parametreleri ve dönen şekiller ilgili `*.controller.ts` / `dto/*.ts` dosyasından
> BİREBİR okunur.** Aşağıdaki tablo "hangi uç var" sorusunu cevaplar, "alan adı ne" sorusunu **cevaplamaz.**

| Amaç | Uç |
|---|---|
| Ortam listesi | `GET /guilds` |
| Kanal listesi | `GET /guilds/:id/channels` |
| Mesaj geçmişi (cursor, 50) | `GET /channels/:id/messages?before=` |
| Mesaj gönder | `POST /channels/:id/messages` |
| Kanal okundu | `POST /channels/:id/read` |
| DM listesi | `GET /dm/channels` |
| DM aç | `POST /dm/channels` |
| DM okundu | `POST /dm/channels/:id/read` |
| DM istekleri | `GET /dm/requests` · `POST /dm/requests/:id/accept` · `POST /dm/requests/:id/reject` |
| Bildirimler | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/read` |
| Kullanıcı | `GET /auth/me` |
| Ek indirme adresi (tarama kapılı) | `GET /attachments/:id` |

Bu tabloda olmayan bir uca ihtiyaç doğarsa → **DUR, PM'e dön.**

---

## 4. WebSocket (`socket.io-client`)

Bağımlılık eklenir: **`socket.io-client`** (PM onaylı, bu sözleşme kapsamında).

**4.1 Bağlantı — web'deki `useSocket` deseni birebir taşınır** (`web/src/composables/useSocket.ts`):

- Token **sabit verilmez, callback ile verilir:** `auth: (cb) => cb({ token: getAccessToken() })`.
  **Neden kritik:** sabit token verilirse yeniden bağlanma ~15 dk sonra **bayat** token'la el sıkışır ve
  auth'ta düşer. Web'de bu bir denetim bulgusuydu, aynı hatayı tekrarlama.
- Access token yenilendiğinde bağlantı taze token'ı kullanır; `auth_error` gelirse bir kez refresh dene,
  yine olmuyorsa oturumu düşür (M0'daki `setSessionExpiredHandler` yoluna bağlan).

**4.2 Olaylar**

| Yön | Olay |
|---|---|
| istemci → sunucu | `channel:join` · `channel:leave` · `typing:start` · `typing:stop` · `presence:set` |
| sunucu → istemci | `message.created` · `message.updated` · `message.deleted` · `typing:update` · `typing:clear` · `presence:snapshot` · `notification:snapshot` |

`message.updated` / `message.deleted` **gelirse işlenir** (mesaj güncellenir/kaldırılır) — düzenleme/silme
arayüzü yok ama web'den yapılan değişiklik mobilde yansımalı, yoksa iki istemci ayrışır.

**4.3 Arka plan / ön plan politikası (mobilin en sinsi kısmı)**

- Uygulama arka plana düşünce (`AppState` → `background`) **soket kapatılır.** Gerekçe: pil ve veri; kapalıyken
  haber verme işi **push'un** işidir (M2).
- Ön plana dönünce: **(1)** soket yeniden bağlanır, **(2)** açık olan kanalın mesajları **yeniden çekilir**
  (kaçırılan mesaj boşluğu kapanır), **(3)** `channel:join` tekrar gönderilir.
- **Boşluk bırakma yasağı:** yeniden bağlanma sonrası ekrandaki liste ile sunucudaki gerçek arasında fark
  kalmamalı. "Sadece yeni gelenleri dinle" yetmez, arada kaçanlar gelmez.

**4.4 Mention gösterimi (zorunlu)**


Mesaj içeriği `<@userId>` ve `<@&roleId>` token'ları içerir. Ham gösterilirse kullanıcı `<@cms67...>` görür.
Mobil bunları `@kullanıcıadı` / `@everyone` olarak render eder (web'deki çözüm okunur, kopyalanmaz —
aynı kurallar). **Tıklanabilir değil** (profil açma M1b).

**5.5 Mesaj ekleri — gösterim + T&S kapısı (🔴 dikkat)**

Mesaj nesnesindeki ek kaydı **URL içermez**; yalnız `id`, dosya adı, `contentType`, boyut ve `scanStatus`
taşır (`messages.service.ts` DTO eşlemesi — alan adları dosyadan okunur). Gerçek indirme adresi ayrı uçtan
alınır: **`GET /attachments/:id`** (erişim kontrolü + tarama kapısı sunucuda, presigned URL gövdede döner).

**Kural — web'deki `AttachmentView` ile birebir aynı olmak zorunda:**

| `scanStatus` | Mobil davranışı |
|---|---|
| `CLEAN` | Görselse (`contentType` `image/` ile başlıyor) küçük önizleme yüklenir; değilse dosya adı rozeti |
| `PENDING` | **Görsel YÜKLENMEZ.** "Taranıyor" durumu gösterilir |
| `FLAGGED` | **Engellendi** durumu gösterilir; indirme adresi istenmez |

> **Bu bir T&S kapısıdır, kozmetik değil.** Taranmamış veya işaretlenmiş bir görseli ekrana basmak, web'de
> kapalı olan bir yüzeyi mobilde açmak demektir (brief §4 — çocuk güvenliği). Kapıyı istemcide gevşetme;
> `scanStatus` sunucudan ne geldiyse odur. Emin olmadığın durumda **gösterme**, PM'e sor.

Yükleme (ek gönderme) **kapsam dışı** — mesaj kutusuna ataş/kamera düğmesi konmaz.

---

## 5. Ekranlar

1. **Ana Sayfa (rail + sidebar)** — ortam rail'i, kanal listesi / DM listesi, DM istekleri girişi (sayaçlı).
2. **Kanal mesaj ekranı** — geçmiş (cursor'lu sonsuz kaydırma), mesaj kutusu, yazıyor göstergesi, boş/hata durumu.
3. **DM mesaj ekranı** — aynısı + başlıkta karşı tarafın adı/avatarı (dokunuş → salt okunur profil kartı).
4. **DM istekleri** — liste + kabul/ret.
5. **Bildirimler sekmesi** — liste, okunmamış vurgusu, dokunuşta ilgili kanala git.
6. **Sen sekmesi** — salt okunur profil + çıkış yap.

Her listede **boş durum** ve **hata + tekrar dene** durumu zorunlu (M0'daki desen).

---

## 6. Kurallar (M0'dan devam)

- Kullanıcıya görünen tek bir string koda gömülmez; kaynak `web/src/i18n/tr.json`, mobil-özel metinler `mobile.*`.
- Renk/ölçü bileşene gömülmez, `src/theme`'den gelir. Marka görselleri `assets/brand` (kopya; kaynak web).
- Envelope: gerçek veri `response.data.data`; hata mesajı `message` (Türkçe) gösterilir, `error` loglanır.
- **Olmayan özelliğe kapı açma:** ses kanalı, mesaj düzenleme, ortam kurma gibi M1a dışı şeyler için
  buton/menü/iskele konmaz.
- **T&S:** kapılar backend'de. Bir kullanıcıya DM atılamıyorsa sunucu 403 döner; mobil bunu **sessizce
  gizlemez**, sunucunun Türkçe mesajını gösterir.

---

## 7. Kabul kriterleri

- [ ] DoD'deki 10 madde emülatörde **ve** bir fiziksel cihazda görülerek doğrulandı (ekran görüntüsü/kayıt)
- [ ] İki istemci (web + mobil) aynı kanalda: her iki yönde anlık mesaj akışı çalışıyor
- [ ] Arka plan → ön plan dönüşünde mesaj boşluğu **oluşmuyor** (kasıtlı test: arka plandayken web'den 3 mesaj at)
- [ ] Reconnect bayat token'la düşmüyor (access ömrü dolduktan sonra da bağlantı toparlanıyor)
- [ ] `mobile/` içinde gömülü string yok; `tr.json` kopyası yok
- [ ] `npm run typecheck` + `npm run lint` temiz
- [ ] `api/` tier'ına dokunulmadı (dokunulduysa sprint R7'ye girer, sahip imzası şart)

---

## 8.1 Sahip geri bildirimi 2026-07-29 akşamı — görsel iyileştirmeler + yeni yüzeyler

Sahip emülatör görüntülerini kendi telefonundaki Discord ile karşılaştırdı. Talepler ikiye ayrılıyor:

### A) M1a fast-follow (mevcut ekranlarda görsel iş — küçük, yarın yapılır)

1. **Kanal listesi belirginleşecek.** Şu an fazla soluk: metin kontrastı düşük, satırlar birbirinden ayrışmıyor,
   seçili kanal vurgusu yok. Discord'daki karşılığı: `#` ön eki net, seçili satır dolgulu vurgu, satır yüksekliği
   daha rahat. Renkler tema token'larından gelecek (`textPrimary`/`textSecondary` ayrımı), yeni renk uydurulmaz.
2. **DM rail girişinde "M" harfi kalkacak, yerine konuşma baloncuğu ikonu** gelecek (`@expo/vector-icons` kurulu).
   Discord'da rail'in en üstündeki baloncuk bu işi görüyor. Rail'deki **ortam** ikonları altıgen kalır.
3. **"MESAJLAR" başlığı belirginleşecek:** küçük soluk büyük-harf yerine büyük ve kalın "Mesajlar" (Discord deseni).
4. **Başlığın altına tek satırda iki buton:** solda **dar/ikon** arama butonu, sağında **geniş** "Arkadaş Ekle"
   butonu (Discord'daki oran birebir bu).

### B) M1b'ye giren yeni ekranlar (buton koymak = ekranı da yapmak)

> **Kural hatırlatması:** "olmayan özelliğe kapı açma". §8.1-A'daki iki buton, açtıkları ekranlarla **aynı
> sprint'te** gelir. Butonları önce koyup ekranları sonraya bırakmak yasak — dokununca hiçbir şey yapmayan
> buton bu sözleşmenin açıkça reddettiği şey.

5. **Arama ekranı.** Sahip "web'te arama için ne kullanıyorsak onu arayüze yediririz" dedi. Backend'de mevcut olan
   **mesaj aramasıdır** (`messages.controller.ts` iki ayrı `@Get('search')` — imzalar dosyadan okunacak).
   **Açık karar (yarın):** DM listesindeki arama butonu neyi arayacak? Öneri: (a) DM/ortam listesinde **yerel
   süzme** (ucuz, dürüst, ek uç istemez) + (b) bir sohbetin içinde **mesaj arama** (mevcut uç). Discord'un
   sekmeli arama ekranı (Kişiler/Medya/Sabitlemeler) bizde karşılığı olmayan yüzeylerdir, kopyalanmaz.
6. **"Arkadaş Ekle" ekranı — 🔴 Discord'dan birebir kopyalanamaz.** Doğrulandı:
   `POST /friends/requests` gövdesi **`friendCode`** (tam 6 karakter, `send-friend-request.dto.ts`).
   `POST /friends/requests/by-user` ise `userId` ister (tıkla-ekle; kart üzerinden). **Kullanıcı adıyla arama
   veya ekleme ucu YOK** (`users.controller.ts`'te yalnız `:id/card`).
   Yani mobil ekran **Kanka kodu** üzerine kurulur: kodu gir → istek gönder, ve **kendi kodunu göster/paylaş**.
   **Discord'daki "Kullanıcı adıyla ekle" eklenmez:** yeni bir uç gerektirir **ve** brief §4'ün "ulaşımı
   zorlaştır" ilkesini gevşetir (herkesin kullanıcı adıyla bulunabilir olması, yabancıya erişimi kolaylaştırır).
   Bu bir T&S duruşudur, UI eksikliği değil. Değişmesi gerekiyorsa **kurul + sahip kararı** ister.
   Rehber senkronizasyonu (Discord'un "Find friends") **kapsam dışı** — kişi listesi okumak KVKK yüzeyi açar.

### C) Kapsam dışı bırakılan (bilinçli)

Discord'un kanal listesinde kategori başlıkları (`Metin Kanalları` / `Ses Kanalları`, katlanabilir) var; bizde
`ChannelCategory` tablosu mevcut ama M1a **yalnız metin kanallarını düz liste** olarak gösteriyor. Kategoriler
ayrı bir iştir, sahip "belirginleşsin" dedi, "kategori ekle" demedi → şimdilik girmiyor.

---

## 8.2 Fiziksel cihaz turu 2026-07-30 — sahip geri bildirimi (SDK 54 sonrası ilk gerçek cihaz açılışı)

SDK 54'e inildikten sonra uygulama sahip telefonunda açıldı. Dört kusur çıktı, tamamı **M1a fast-follow**
(yeni yüzey açmıyor, mevcut ekranların doğru çalışması). Ayrıca ikisi **emülatörün gizlediği** sınıftan —
M0'daki "en güncel kararlı SDK" dersinin aynısı: emülatör gerçeği temsil etmiyor.

1. **Klavye giriş kutusunu kapatıyor (🔴 en ağır — mesajlaşma kullanılamaz).** Kök neden: `KeyboardAvoidingView`
   `behavior` Android'de `undefined` bırakılmış, yani hiçbir şey yapmıyordu. Dev, Android'in pencereyi kendi
   küçültmesine (`adjustResize`) güvenmiş; **SDK 54'te edge-to-edge varsayılan açık olduğu için pencere
   küçülmüyor**, uygulama klavyenin altına çiziyor. → Android'de de `behavior="padding"`.
   **✅ SAHİP CİHAZDA DOĞRULADI 2026-07-30:** giriş kutusu klavyenin üstünde kalıyor, yazarken görünüyor;
   önceden gönder tuşuna basmak için boşluğa dokunup klavyeyi kapatmak gerekiyordu, o da bitti.
   Düzeltme kanıtlandığı için **aynı kusurun olduğu diğer ekranlara da uygulandı:** `login.tsx` (aynı
   `undefined` behavior; belirti: şifre alanı klavyenin altında kalıyor — PM emülatörde gördü) ve
   `two-factor.tsx` (hiç sarmalayıcı yoktu; içerik dikeyde ortalı, küçük ekranda kod alanı kapanabilir —
   sahip hesabı 2FA'lı olduğu için bu ekran her girişte kritik yolda). Başka `KeyboardAvoidingView`
   kullanımı kalmadı (tarandı).
2. **Ortam ikonu görünmez.** Görseli olan ortam rail'de yer kaplıyor ama çizilmiyor → dokunulabilir görünmez
   öğe. İki ayrı mesele: **(a) yerel veri**, `Guild.iconUrl` = `http://localhost:9000/...` (MinIO); telefon
   `localhost`'u kendisi sanır, tarayıcı aynı makinede olduğu için web'de çalışıyor. Üretimde adres
   `cdn.kankaverse.com`, sorun yok → **kod kusuru değil**. **(b) gerçek kod kusuru:** resim yüklenemediğinde
   yedek yoktu. Yedek katman (altıgen + baş harf) artık HER ZAMAN resmin altına çizilir → en kötü durumda
   harfe düşer. SVG `<Text>` kullanıldı; RN `<Text>` katmanı Svg'nin üstünde kalıp yüklenen resmi kapatırdı.
3. **Giriş ekranında gezinme çubuğu açık renkli şerit.** Yalnız giriş ekranında; tab çubuğu olan ekranlarda
   yok, çünkü tab çubuğunun kendi koyu yüzeyi alt inset'i kapatıyor. **Emülatörde üretilemedi** (aynı koşullar:
   gesture modu + sistem teması açık) → cihaz/OEM kabuğuna özgü. Düzeltme: `app.json` `userInterfaceStyle`
   **`automatic` → `dark`**. O beyan zaten yanlıştı: bizde tek tema var, sisteme "açık temaya da uyarım"
   demek OEM'in gezinme çubuğunu açık dekorasyonla boyamasına izin veriyor. **`navigationBarColor` KULLANILMADI:**
   react-navigation tipinde deprecated, Android 15+/edge-to-edge'de etkisiz.

   **→ M2'YE ERTELENDİ (sahip kararı 2026-07-30, PM şartlı katılım).** Sahip cihazda şu deseni ölçtü: sorun
   **yalnız ilk açılışta** çıkıyor (o anda TÜM ekranlarda, giriş dahil), bir kez gezinildikten sonra kayboluyor
   ve kaybolmuş kalıyor. Mekanizma bunu açıklıyor: **Expo Go'da `app.json`'ın Android native ayarları hiç
   uygulanmaz** — uygulama Expo Go'nun kendi Activity/teması içinde açılır, pencere oluşturulduğu anda sistem
   teması (açık) geçerlidir; bizim `dark` beyanımız JS/manifest yüklendikten sonra devreye girer → ilk kare
   yanlış temayla çizilir. Gerçek derlemede bu katman yoktur (`styles.xml` app config'den üretilir, pencere
   koyu doğar) → sorunun kalkması **beklenir**.
   **🔴 Ama VARSAYILARAK KAPATILMADI:** "gerçek derlemede düzelir" cümlesi, SDK 57'de bir gün kaybettiren
   "emülatörde çalışıyor" cümlesinin akrabası. **M2'de ilk dev build alındığında bakılacak ilk maddelerden
   biri.** Hâlâ varsa çözüm hazır: `androidNavigationBar` (gerçek derlemede geçerli, Expo Go'da geçersiz)
   veya `expo-navigation-bar` ile çalışma-anı ayarı. Şimdi eklenmedi, çünkü Expo Go'da **test edilemeyecek**
   bir düzeltme eklemek olurdu.
4. **Yeni mesaj davranışı web ile eşitlendi** (sahip talebi): yukarıda geçmiş okurken gelen mesaj sayılır ve
   "aşağı in" düğmesinde gösterilir; dipteysem veya mesaj benimse otomatik dibe kayar. `MessageArea.vue`
   REV-1/REV-9 semantiğinin birebir karşılığı (120px eşiği dahil); fark yalnız liste `inverted` olduğu için
   dip = offset 0. Metin mevcut `message.newMessages` anahtarından.

**Yan kusur (aynı turda çıktı):** axios'ta `timeout` yoktu → ulaşılamaz adreste giriş butonu sonsuza kadar
döndü, kullanıcı hiçbir geri bildirim almadı. 15sn timeout eklendi (instance + bootstrap'ın çıplak refresh
çağrısı). `.env.example` emülatör adresini varsayılan yapıp fiziksel cihazı "M2+" diye etiketliyordu, tuzağın
kaynağı orasıydı → LAN IP varsayılan oldu (ikisinde de çalışır).

---

## 8.3 DM yüzeyi web-eşitlik denetimi 2026-07-30 (sahip talebi: "DM'i kapatmadan önce web'te ne var mobilde ne yok")

**Kök neden tek cümle:** mobil soket katmanı yalnız **kanal-kapsamlı** olayları dinliyordu (`message.*`,
`typing:*`), **kullanıcı-kapsamlı** olayları dinlemiyordu (`dm.message`, `dm.request`, `notification`).
Sunucu mobili handshake'te `user:<id>` odasına zaten koyuyor — olaylar cihaza GELİYORDU, kimse kulak
vermiyordu. Web 50+ olay dinliyor, mobil 9.

### A) M1a kusuru — teslim edilmiş yüzeyler çalışmıyordu → BU TURDA KAPANDI

1. **DM listesi canlı değildi.** Liste yalnız mount'ta çekiliyordu; sekmeler mount'ta kaldığı için
   (expo-router Tabs) **yenilemenin hiçbir yolu yoktu**, pull-to-refresh de yok → kullanıcı bayat listeye
   süresiz bakabiliyordu. → `dm.message` dinleniyor; yeni `stores/dm.ts` (web `stores/dm.ts` `applyActivity`
   semantiği birebir: yerinde güncelle + başa taşı + okunmadı işaretle, kanal listede yoksa tam tazele).
   **Doğrulandı:** sunucu `dm.message`'ı göndericiye DE yayıyor (`messages.gateway.ts` üye döngüsü, hariç
   tutma yok) → "benim mesajım mı" kontrolü zorunlu, yoksa kendi gönderdiğim mesaj kendi listemi okunmadı yapar.
2. **Mesaj isteği rozeti canlı değildi** → `dm.request` dinleniyor (web gibi sessiz: yalnız rozet tazelenir).
3. **Bildirim sekmesi/rozeti canlı değildi** → `notification` dinleniyor.
   **`mention` BİLİNÇLİ dinlenmiyor:** sunucu bahsetmede hem anlık `mention` hem kalıcı `notification` yayar,
   ama kalıcı olan alıcının bildirim tercihinden SÜZÜLÜR (`shouldNotifyChannel`, R12). `mention`'ı rozete
   bağlamak kullanıcının **susturduğu** bildirimi geri açardı. Rozetin tek kaynağı `notification`.
4. **DM listesinde "yazıyor…"** yoktu (web Sprint 6 R1-b/R1-c: "DM'e bakmasan da kutucukta görünsün")
   → eklendi, 1-1 DM'de sade metin.

**Yeni sızıntı kapatıldı:** DM listesi bileşen yerel state'inden store'a taşındı; store çıkıştan sonra da
yaşar → temizlenmezse **sıradaki kullanıcı öncekinin DM listesini görürdü**. `setSessionUser(null)`
`(app)/_layout.tsx` unmount'unda tüm DM durumunu siler (oturum kapsamlı tek nokta, `useBackgroundSocket`
ile aynı gerekçe). Store auth'u import ETMEZ — `auth.ts → socket.ts → store` yönü var, ters yön döngü kurar.

### B) M1b'ye — hiç iddia edilmemiş özellikler (sahip kararı 2026-07-30)

- **Yeni DM başlatma** (`POST /dm/channels`) — mobil şu an var olan sohbete cevap verebiliyor, **başlatamıyor**
- **Grup DM yönetimi** — kur / adlandır / üye ekle-çıkar / ayrıl / sil (web'de hepsi var)
- **"Sohbeti temizle"** (G4 soft-delete, `DELETE /dm/channels/:id`)
- **Profil kartından engelle / arkadaşlıktan çıkar** (M1a'da kart bilinçli salt-okunurdu)

Kapsam dışı (sayılmadı): sesli/görüntülü DM paneli (V2), tepkiler, sabitleme, kategori/rol/ortam olayları,
`presence:*`, `channel.activity` (guild kanal okunmamışı — aynı sınıf boşluk, DM değil, M1b'de ele alınır).

### C) Doğrulama durumu — dürüst kayıt

Bu turun kodu `typecheck` + `lint` temiz ama **cihazda görülmedi.** PM emülatörde kapalı bir döngü kurmayı
denedi (yerel `kv_devloop` hesabı + ortam + kanal): giriş, rail ikon yedeği, "Mesajlar" başlığı, kanal
listesi `#` + ses kanalının süzülmesi, boş durumlar **görüldü ve doğru**. Ama **klavye davranışı
emülatörde doğrulanamadı** — AVD'de donanım klavyesi açık olduğu için yazılım klavyesi hiç açılmıyor;
ayar kapatılınca Expo Go açılmadı, döngü orada bırakıldı (AVD ayarı geri alındı). **Klavye + canlı DM
güncellemesi sahip cihazında doğrulanacak.**

---

## 8. Sapma kuralı

Endpoint yolu, ekran sayısı, gezinme deseni bu dosyadan **sapamaz**. İhtiyaç doğarsa dev **durur**,
kullanıcıya bildirir, PM revize eder. `TASK.md`'ye item eklemek dev'in işi değildir.
