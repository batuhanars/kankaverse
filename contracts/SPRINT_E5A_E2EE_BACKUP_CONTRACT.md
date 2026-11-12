# SPRINT E5a: Şifreli DM geçmişinin sunucu yedeği (yedek şifresi)

> Durum: **TASARIM KİLİTLİ (2026-11-11, sahip onayı; §5 uyarı ve §6 gizlilik metni onaylı, §9 açık sorular PM önerisiyle kabul). Rev.1 (aynı gün, adım 0 sonucu, sahip onayı: mobilde native Argon2, §2.4). Rev.2 (aynı gün, adım 3 PM incelemesi: varlık kontrolü + KDF üst sınırı, §4.7).** PM compose (Opus). **e2ee-core + e2ee-client + api + web + mobil.**
> Yol haritası: E0 ✅ → E1 ✅ → E3 ✅ → E4 (cihaz turu bekliyor) → **E5a yedek bu sprint** → E5b cihazdan cihaza aktarım → E2 grup DM → **herkese açılış** → E7 → E8.
> 🔴 **R7 bölgesi, tamamı:** anahtar türetme ve yedek şifrelemesi (e2ee-core), yedek sahipliği ve silme (api), geri yükleme birleştirmesi (e2ee-client).
> Dayanak: sahip kararı 2026-11-11 (iki yol, yedek şifresi, kurtarma anahtarı yok); kurul verdikti `knowledge/kurul/verdicts/2026-11-11-e5-yedek-ve-cihaz-aktarimi.md` (⚠ ŞARTLI, 6 koşul, sahip kabul etti); `SPRINT_E1_DM_E2EE_CONTRACT.md` §1 (ilkeler, yerel depo), `SPRINT_E4_E2EE_REPORT_CONTRACT.md` §2 (fk/sentAt).

## §0 Karar ve kapsam

**Sorun:** yeni cihaz, şifreli DM grubuna katıldığı andan önceki mesajları göremez (`undecryptable`). Kayıp/bozuk telefonda geçmiş tamamen gider.

**Çözüm:** her cihaz kendi yerel çözülmüş mesaj deposunun şifreli anlık görüntüsünü (snapshot) sunucuya yükler. Anahtarı kullanıcının **yedek şifresi** korur; şifre sunucuya hiç gitmez. Yeni cihazda şifre girilir, tüm görüntüler indirilip birleştirilir.

**Kapsam:** yalnız metin (DM medyası zaten şifresiz, E6 ertelendi). 1-1 şifreli DM; grup DM E2 ile aynı yoldan gelir (kanal türünden bağımsız tasarlanır).

**Kapsam DIŞI:** cihazdan cihaza aktarım (E5b) · kurtarma anahtarı (kurul tetiği gelirse; §2.2 iki katman buna hazır) · medya yedeği · sunucunun deneme sınırladığı kurtarma (donanım kasası yok) · otomatik geri yükleme (şifresiz geri yükleme olamaz, bilinçli).

## §1 İlkeler

1. **Şifre cihazdan çıkmaz.** Sunucu yalnız tuz, parametreler, sarılmış anahtar ve şifreli görüntüleri görür. Log'a, hata mesajına, analitiğe şifre ya da türetilmiş anahtar yazılmaz.
2. **İki katman (kurul k.3).** Rastgele yedek anahtarı (BMK, 32 bayt) görüntüleri şifreler; şifreden türetilen anahtar (KEK) yalnız BMK'yı sarar. Şifre değişimi = yeniden sarma, görüntüler yeniden şifrelenmez.
3. **Zayıf şifre kabul edilmez, atlama yok (kurul k.2).** §2.3.
4. **Geri yükleme yereli bozmaz.** Birleştirme yalnız eksik ya da çözülememiş kayıtları doldurur; mevcut `ok` kaydın üzerine yazmaz.
5. **Silinen içerik yedekte yaşamaz (kurul k.4).** Silinen mesajın yerel kaydı silinir; bir sonraki görüntü onu içermez.
6. **Fail-closed değil, fail-quiet:** yedek yükleme hatası kullanıcının sohbetini engellemez; sessizce tekrar dener, ayarlar ekranında son başarılı yedek zamanı görünür.

## §2 Kripto (`shared/e2ee-core`)

### §2.1 Anahtar türetme
- `deriveBackupKek(password: string, salt: Uint8Array(16), params) → Uint8Array(32)`: **Argon2id** (`@noble/hashes/argon2`, zaten bağımlılık; native modül YOK).
- Şifre UTF-8, **NFC normalize** (Türkçe karakter: aynı şifre iki klavyede aynı bayt).
- `params = { m: KiB, t, p: 1 }`, blob başlığında saklanır (ileride artırılabilsin).
- **Taban:** `m ≥ 19456` (19 MiB), `t ≥ 2`, `p = 1` (OWASP asgari). **Hedef:** orta Android'de ~1 sn (kurul k.2). Kesin değer adım 0 ölçümüyle sabitlenir (§7). Tabanın altına inen parametreyle türetme reddedilir (indirilen başlık dahil: sunucu düşük parametre dayatamaz).

### §2.4 Rev.1 (2026-11-11): mobilde native Argon2
**Adım 0 sonucu:** `@noble/hashes/argon2` taban ayarı (`m=19456,t=2,p=1`) Node'da 116 ms, **Redmi 14C (MT6769, Android 16, Hermes, release) 19 893 ms**. Saf JS mobilde kullanılamaz; web'de sorun yok.
**Karar (sahip onayı):**
- `deriveBackupKek` Argon2id işlevini enjekte alır: `CryptoProvider`'a (ya da ayrı bir porta) `argon2id(password: Uint8Array, salt, { m, t, p, dkLen }) → Promise<Uint8Array>` eklenir. e2ee-core NFC + UTF-8 dönüşümünü ve parametre tabanını kendisi yapar, işlevi yalnız hesap için çağırır.
- **Web:** `@noble/hashes/argon2` (bugünkü yol).
- **Mobil:** `mobile/modules/argon2/` yeni Expo yerel modülü (mevcut dört modülün deseni), Android'de Argon2'nin resmi C uygulamasını taşıyan hazır bir kütüphane (öncelik `argon2kt`; yoksa/uyumsuzsa resmi C kaynağı CMake ile). Bağımlılık PM onaylı. iOS kapsam dışı (Android-first).
- **Uyum testi (zorunlu):** iki uygulama da RFC 9106 §5.3 Argon2id vektörünü birebir üretir, ayrıca sabit şifre/tuz/§2.1 tabanı için aynı çıktıyı verir (telefonda kurulan yedek web'de açılmalı). Mobil tarafı ölçüm ekranıyla cihazda doğrulanır.
- **Adım 0b:** native modülle Redmi 14C'de ölçüm; hedef ~1 sn. Ölçüme göre §2.1 "hedef" parametresi sabitlenir (taban değişmez).
- **Adım 0b sonucu (2026-11-11, Redmi 14C, release):** `argon2kt` 1.6.0 native: 19 MiB/t2 115 ms, 32 MiB/t2 197 ms, 64 MiB/t2 396 ms, 19 MiB/t4 202 ms. Uyum: C referans vektörü (password/somesalt, 64 MiB t2) ve p=4 vektörü EŞİT; kendi girdimizde native = noble (`7318c719…`). **Sabitlenen hedef parametre: `m=65536, t=4, p=1`** (telefonda ~0,8 sn, web ~0,8-1,5 sn). Taban (`m=19456, t=2`) yalnız indirilen başlık denetimi için alt sınır olarak kalır. Ölçüm dalları (`spike/e5a-*`) birleşmez; modül kodu R7-1/üretim işinde temiz olarak yeniden yazılır ya da taşınır.

### §2.2 Sarma ve görüntü şifreleme
- `BMK = random(32)`, kullanıcı başına, bir kez.
- `wrapped = AES-256-GCM(KEK, nonce12, BMK, aad = "kv-e5-bmk-v1|" + userId + "|" + keyVersion)`. GCM doğrulama hatası = yanlış şifre (ayrı hata türü `BackupPasswordError`).
- Görüntü: `AES-256-GCM(BMK, nonce12, plaintext, aad = "kv-e5-snap-v1|" + userId + "|" + deviceId + "|" + keyVersion)`. AAD, sunucunun görüntüleri kullanıcılar/cihazlar arasında takas etmesini engeller.
- `plaintext` = UTF-8 JSON `{ v: 1, deviceId, createdAt, messages: StoredMessage[] }`. Sıkıştırma YOK (metin, YAGNI; §3.3 boyut sınırı yeterli).
- Test vektörleri: sabit şifre/tuz/parametre → sabit KEK; sarma/açma; yanlış şifre; kurcalanmış AAD.
- **R7-1 notu (2026-11-11):** AAD'deki `userId`/`deviceId` cuid'dir ve `|` içermez (düz birleştirmenin belirsizlik koşulu). Web'de noble Argon2id ana iş parçacığını ~1 sn bloklar: adım 3/4'te web türetmesi Web Worker'da çalışır.

### §2.3 Şifre kuralı (istemcide, tek fonksiyon `checkBackupPassword`)
- **En az 12 karakter** (NFC sonrası, grafem değil kod noktası).
- **En az 6 farklı karakter** ("aaaaaaaaaaaa", "121212121212" reddedilir).
- Kullanıcı adını ya da e-postanın `@` öncesini (büyük/küçük harf duyarsız) içeremez.
- "Yine de devam et" YOK. Ret sebebi i18n metniyle gösterilir.
- Güç ölçer kütüphanesi (zxcvbn vb.) EKLENMEZ (paket ağırlığı; kural basit ve test edilebilir).

## §3 API

### §3.1 Şema
```prisma
model E2eeBackup {
  userId     String   @id
  salt       Bytes    // 16
  params     Json     // { m, t, p }
  wrappedKey Bytes    // nonce(12) + GCM çıktısı
  keyVersion Int      // sıfırlamada artar
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model E2eeBackupSnapshot {
  id         String   @id @default(cuid())
  userId     String
  deviceId   String   // E2eeDevice.id; cihaz iptal edilse de görüntü KALIR (kayıp telefonun geçmişi tam bu)
  keyVersion Int
  objectKey  String   // özel bucket, presigned erişim
  size       Int
  sha256     String
  updatedAt  DateTime @updatedAt
  @@unique([userId, deviceId])
  @@index([userId])
}
```

### §3.2 Uçlar (hepsi `JwtAuthGuard` + `E2eeEnabledGuard` + yedek bayrağı, kullanıcı başı throttle)
| Uç | Ne |
|---|---|
| `GET /e2ee/backup` | `{ configured, salt?, params?, wrappedKey?, keyVersion?, snapshots: [{ deviceId, size, updatedAt }] }` |
| `PUT /e2ee/backup/key` | İlk kurulum ya da şifre değişimi (yeniden sarma). Gövde `{ salt, params, wrappedKey, keyVersion }`. Kurulum: kayıt yoksa `keyVersion = 1`. Değişim: `keyVersion` mevcutla AYNI olmalı, aksi 409. Parametre tabanı sunucuda da doğrulanır (400). |
| `POST /e2ee/backup/reset` | **Reauth zorunlu** (mevcut hassas işlem akışı, Sprint 2B). "Şifremi unuttum": `keyVersion + 1`, yeni `salt/params/wrappedKey`, kullanıcının TÜM görüntüleri silinir (nesne + satır). |
| `DELETE /e2ee/backup` | **Reauth zorunlu.** Yedeği tamamen kapatır: anahtar kaydı + tüm görüntüler. |
| `POST /e2ee/backup/snapshot/presign` | Gövde `{ deviceId, size, sha256, keyVersion }`. `deviceId` çağıranın kendi aktif cihazı olmalı (403). `keyVersion` güncel olmalı (409). `size ≤ 25 MB` (413). Presigned PUT döner. |
| `POST /e2ee/backup/snapshot/commit` | Gövde `{ deviceId, size, sha256, keyVersion }`. Nesne var ve boyut tutuyor mu doğrulanır, satır upsert edilir, cihazın eski nesnesi silinir. |
| `GET /e2ee/backup/snapshot/:deviceId` | Yalnız kendi görüntüsü. Presigned GET (kısa ömür). |

- Envelope standart. Hata kodları: `E2EE_BACKUP_NOT_CONFIGURED`, `E2EE_BACKUP_KEY_VERSION`, `E2EE_BACKUP_TOO_LARGE`, `E2EE_BACKUP_WEAK_PARAMS`.
- **Kullanıcı başına en çok 5 görüntü:** 6.'sı commit edilince en eski `updatedAt` silinir.
- **Bucket:** mevcut özel bucket (`S3_BUCKET`), önek `e2ee-backup/{userId}/{deviceId}/{sha256}`. Public bucket ve CDN KULLANILMAZ.
- **Hesap silme:** `purge.job.ts` kullanıcı temizliğinde `E2eeBackup` + tüm görüntüler (nesneler dahil) silinir (kurul k.4, KVKK).
- `GET /e2ee/status` → `backup: boolean` alanı eklenir. Bayrak `E2EE_BACKUP` (varsayılan `false`), izin listesi E1 ile aynı.
- Audit log: `e2ee.backup.configure`, `.rekey`, `.reset`, `.delete` (içerik yok, yalnız eylem + keyVersion).

### §3.3 Testler (api)
Kurulum/değişim/sıfırlama/silme yolları; `keyVersion` uyuşmazlığı 409; başkasının cihazı 403; iptal edilmiş cihazla presign 403 ama görüntüsü listede kalır; 25 MB sınırı; 6. görüntüde en eskinin silinmesi; reset tüm görüntüleri siler; reauth olmadan reset/delete 401/403; hesap purge görüntüleri ve nesneleri siler; parametre tabanı altı 400; bayrak kapalıyken uçlar kapalı.

## §4 İstemci (`shared/e2ee-client` + web + mobil)

### §4.1 Depo
- `Vault` portuna `keys(store): Promise<string[]>` eklenir (web IndexedDB, mobil SQLite adaptörü). Görüntü bununla kurulur.
- **Silme boşluğu (kurul k.4):** şifreli DM mesajı silindiğinde (soket `message:delete` ve geçmiş yüklemesinde sunucunun silindi bildirdiği mesaj) yerel kayıt `messages` deposundan silinir. Bugün silinmiyor; bu sprintte kapatılır, iki istemcide de. Düzenleme aynı id'ye yazıldığı için ayrı iş gerektirmez.

### §4.2 Görüntü içeriği
- Durumu `ok` ve `unverified` olan kayıtlar (`unverified` ileride doğrulanıp terfi edebilir, E4 §2). `undecryptable` / `failed` / `unsupported` girmez (gövdesi yok).
- Alanlar: `id, channelId, status, body, digest, fk?, sentAt?` (kurul k.4: `fk` + `sentAt` olmadan geri yüklenen mesaj şikâyette doğrulanamaz; `digest` olmadan hidratör kaydı tanımaz).
- Cihaz/grup durumu, MLS anahtarları, bayraklar GİRMEZ.

### §4.3 Yedek zamanlaması
- Bu cihazda BMK açıksa (bkz. §4.4): uygulama açılışından 1 dk sonra, sonra en çok **6 saatte bir**, yalnız son başarılı yedekten beri yeni/silinen kayıt varsa. Mobilde uygulama arka plana geçerken de (aynı koşulla). Web'de sekme gizlenince.
- MIUI dondurma kuralı: arka planda uzun iş YASAK; mobilde yedek yalnız ön plandayken ya da arka plana geçiş anındaki kısa pencerede başlar, yarıda kalırsa bir sonrakinde baştan.
- Hata: sessiz yeniden deneme (üstel, en çok 6 saat). Kullanıcıya hata toast'ı YOK; ayarlarda "Son yedek: 25 Ekim 2026 18.42" ve 24 saati geçen başarısızlıkta uyarı satırı.

### §4.4 Akışlar (web + mobil, aynı motor fonksiyonları)
1. **Kurulum (yedek hiç yoksa):** şifreli DM ilk kez açıldığında (kanal `encrypted`, bu kullanıcı için ilk) **bir kez** sorulur; "Şimdi değil" denebilir, ayarlardan sonra kurulur. Ekran: şifre + tekrar + §5 uyarısı + "Bu şifreyi unutursam yedeğimi kimse açamaz, anladım" onay kutusu. Kural ihlalinde gönder pasif ve sebep görünür.
2. **Bu cihazda yedeği aç (yedek var, cihazda BMK yok):** ayarlarda satır; şifre bir kez girilir, BMK cihazın şifreli yerel deposuna (`device` bölümü) yazılır, sonrası otomatik.
3. **Geri yükleme:** yedek varsa ve bu cihazda en az bir `undecryptable` kayıt ya da hiç mesaj kaydı yoksa sohbet listesinde kapatılabilir bir bant: "Eski mesajlarını geri yüklemek için yedek şifreni gir". Şifre doğruysa: tüm görüntüler indirilir, çözülür, birleştirilir (§4.5), BMK cihaza yazılır (akış 2 dahil), açık kanallar yeniden hidrate edilir. Yanlış şifre: "Şifre yanlış" (deneme sayacı istemcide değil, KDF zaten yavaş).
4. **Şifre değiştir:** eski şifre (BMK açılır) → yeni şifre (§2.3) → yeni tuz ile yeniden sar → `PUT key` aynı `keyVersion`.
5. **Şifremi unuttum / yedeği sıfırla:** açık uyarı ("Eski yedeğin kalıcı olarak silinir, yerine bu cihazdaki mesajlarla yeni yedek başlar"), reauth, yeni şifre → `reset`. Diğer cihazlarda BMK artık geçersiz (keyVersion farkı → 409) → o cihazlarda akış 2 bandı çıkar.
6. **Yedeği kapat:** reauth → `DELETE`.

### §4.5 Birleştirme kuralı (R7)
- Her kayıt için: yerelde yoksa yaz; yerelde `undecryptable`/`failed`/`unsupported` ise yaz; yerelde `unverified`, gelen `ok` ise yaz; yerelde `ok` ise DOKUNMA.
- Aynı id birden çok görüntüde: `ok` > `unverified`; ikisi de `ok` ve `digest` farklıysa daha yeni görüntünün kaydı (düzenlenmiş sürüm).
- Kanal bu kullanıcının şu an erişebildiği bir şifreli DM değilse (listede yoksa) kayıt yazılmaz.
- Sunucunun silindi bildirdiği mesajlar ilk hidrasyonda yerelden düşer (§4.1), yani geri yükleme silinmiş içeriği ekrana getiremez.

### §4.6 Metinler
Tümü i18n (`e2ee.backup.*`), web `{'@'}` kaçışı. Em dash yok. Tarih/saat TR biçimi.

### §4.7 Rev.2 (2026-11-11, adım 3 PM incelemesi)
**Bulgu 1:** API silinmiş mesajı geçmişte döndürmüyor ve "silindi" işareti de vermiyor; çevrimdışıyken silinen mesajın yerel kaydı kalıyor ve görüntüye giriyordu (kurul k.4 ihlali).
- **Yeni uç** `POST /e2ee/messages/exists` (JwtAuthGuard + E2eeEnabledGuard + throttle): gövde `{ channelId, ids: string[] }` (1..500, cuid), yanıt `{ existing: string[] }` (yalnız `deletedAt: null` ve o kanala ait olanlar). Çağıran kanala erişemiyorsa 403 (mevcut kanal erişim kontrolü). Yanıt içerik taşımaz. Yedek bayrağına bağlı DEĞİL (silme hijyeni yedekten bağımsız da işe yarar), E2EE bayrağına bağlı.
- **Görüntü kurulurken:** yerel kayıtlar kanal başına 500'lük gruplarla sorulur; "yok" dönenler yerelden silinir (`deleteMessage`) ve görüntüye girmez. Ağ hatasında görüntü o tur alınmaz (fail-quiet, kirli kalır); eksik kontrolle görüntü YÜKLENMEZ.
- **Geri yüklemede:** adaylar aynı uçla süzülür; "yok" dönen yazılmaz.
**Bulgu 2:** istemci KDF parametresinde yalnız taban denetliyordu; kötü niyetli sunucu dev bellek dayatıp uygulamayı çökertebilir.
- **Üst sınır** `BACKUP_KDF_MAX = { m: 262144 (256 MiB), t: 16, p: 1 }` e2ee-core `assertParams`'ta (aşılırsa `BackupParamsError`); API'nin üst sınırı aynı değere iner (`m ≤ 262144`).

### §4.8 Rev.3 (2026-11-12, sahip kararı): geri yükleme bir kez sorulur, "hayır" kalıcıdır
**Gerekçe (sahip):** geçmişini yeni cihaza taşımak istemeyen kullanıcı vardır; ona ne kalıcı bant ne de "şifreli mesaj" satırları gösterilir.
- §4.4-3 bandı **soru** olur: "Eski mesajlarını bu cihaza geri yüklemek ister misin?" · [Geri yükle] [Hayır]. Bugünkü "Kapat" (yalnız oturumluk) kalkar.
- **Bant bir kez görünür (sahip, aynı gün):** [Geri yükle], [Hayır] ya da hiç dokunmadan geçmek; üçünde de o cihazda bir daha çıkmaz. "Soruldu" kaydı cihaz + kullanıcı başına kalıcı (cihaz deposu; çıkışta silinir), bant göründüğü oturum bitince yazılır (ilk anda kaybolmaz, sonraki açılışta çıkmaz). Sessiz kapı: Hesap güvenliği → Sohbet yedeği ekranı (E5a'da var); "Bu cihazda yedeği aç" satırı durur (akış 2).
- **Yedek ile geçmiş ayrılır:** yedek şifresini girmek (BMK) bu cihazın yeni mesajlarını yedeklemeyi açar; eski görüntüleri indirip birleştirmek ayrı bir seçimdir. Ayarlardaki açma ekranında "Eski mesajları da geri yükle" seçeneği (bant [Geri yükle] ile geldiyse işaretli, ayarlardan geldiyse işaretsiz). Böylece "geçmiş istemiyorum ama yedeğim sürsün" mümkün.
- **[Hayır] sonrası bu cihaz yedeklenmez** (BMK yok). Ayarlardaki durum satırı bunu açıkça söyler; bant tekrar çıkmaz (sahip kararı: ısrar yok).
- Key-dropped (başka cihazda şifre sıfırlandı): bant yeniden ÇIKMAZ (ısrar yok); Sohbet yedeği ekranındaki durum satırı "Bu cihaz yedeklenmiyor, şifre başka cihazda değişti" der ve açma satırı oradadır.
- E1 §Görünüm Rev. ile birlikte okunur: "bu cihazdan önce" mesajları sohbette hiç görünmez (aşağıda PLAN kararı); geri yüklenmedikçe sohbet boş başlar.
- **Sohbeti temizle boşluğu (PM bulgusu, aynı gün):** "Sohbeti temizle" yalnız çağıranın `clearedAt`'ini yazar; şifreli DM'de temizlenen mesajların yerel düz kayıtları kalır ve yedek görüntüsüne girer. Düzeltme: `POST /e2ee/messages/exists` "var" sayarken çağıranın `clearedAt`'inden önceki mesajları da dışlar (silinmiş gibi). Görüntü kurulumu ve geri yükleme bu ucu zaten kullanır → temizlenen mesaj sonraki yedekten düşer, geri yüklemede gelmez. api değişikliği → R7.
- **Uygulama:** E5b sözleşmesiyle aynı turda (istemci akışı + metin + yukarıdaki api süzgeci; kripto değişmez). Herkese açılıştan önce şart.

## §5 Kullanıcıya görünen uyarı (kurulum ekranı, sahip onayı)
"Yedeğin bu şifreyle kilitlenir. Şifre senin cihazından çıkmaz, biz de bilmeyiz. Unutursan yedeğini ne sen ne de biz açabiliriz. Kolay tahmin edilebilir bir şifre seçme."

## §6 Gizlilik metni eki (E4 §5.1 listesine, herkese açılışla birlikte, sahip onayı)
`s3Item5` (yeni): "Yedeği açarsan şifreli mesajlarının bir kopyası, yalnız senin belirlediğin yedek şifresiyle açılabilecek biçimde sunucumuzda saklanır. Bu şifreyi unutursan yedeğini biz de açamayız. Kolay tahmin edilebilir bir şifre, yedeğini korumasız bırakır. Hesabını silersen yedeğin de silinir." (Kurul k.5: mutlak iddia yok.)

## §7 Uygulama sırası
0. **Ölçüm (spike, kod birleşmez):** `@noble/hashes/argon2` ile `m=19456,t=2` ve 2-3 üst ayar; sahibin telefonunda (Hermes, release benzeri) ve web'de (orta dizüstü) süre. Hedef ~1 sn. Taban ayarı telefonda **3 sn'yi aşarsa DUR**, PM'e dön (native modül ya da WASM kararı native derleme gerektirir).
1. `e2ee-core`: §2 + test vektörleri → **R7-1**
2. api: §3 + migration + spec'ler → **R7-2**
3. `e2ee-client`: `Vault.keys`, silme boşluğu, görüntü kur/çöz, birleştirme, zamanlayıcı → testler (sahte sunucu) → **R7-3**
4. web + mobil: §4.4 ekranları + adaptörler → **R7-4** (yalnız akış ve metin; kripto 1-3'te)
5. Deploy (`E2EE_BACKUP=false`), bayrak izin listesinde açılır, cihaz turu.
6. Gizlilik metni ve §5 uyarısı herkese açılışla.

~~Native diff beklenmiyor (saf JS).~~ **Rev.1:** adım 0 sonucu native modül şart (§2.4). Mobil tarafı yeni dev build + yerel release derlemesi ister; E5a mobil vc69 ile çıkar.

## §8 DoD
- Testler yeşil: core vektörleri; api §3.3; client: görüntü içeriği (§4.2 alanları, durum süzgeci), birleştirme tablosu (§4.5 her satır), silme boşluğu, yanlış şifre, keyVersion değişiminde 409 yolu.
- `migrate status` canlıda temiz. `nest build`, web `vue-tsc -b` (yalnız bilinen 6 hata) + `vite build`, mobil `tsc` temiz.
- **Cihaz turu (sahip):** (1) telefonda şifreli DM'de 20+ mesaj, yedek kur, ayarlarda son yedek zamanı görünür. (2) Web'de çıkış + yerel veriyi sil + giriş: eski mesajlar "çözülemedi" görünür, bant çıkar, şifreyle geri yüklenir, mesajlar okunur. (3) Geri yüklenen bir mesajı şikâyet et: moderasyonda "doğrulandı". (4) Bir mesajı sil, yedek al, başka cihazda geri yükle: silinen mesaj gelmez. (5) Yanlış şifre "Şifre yanlış" der. (6) Şifre değiştir, diğer cihaz yeni şifreyle açar. (7) Sıfırla: eski görüntüler sunucudan silinmiş (veritabanı + bucket kontrolü PM'de).
- Sunucu log'larında şifre, KEK, BMK ya da düz mesaj yok (PM grep ile teyit).

## §9 Açık sorular (PM önerisiyle, sahip itiraz etmezse geçerli)
- **Görüntü cihaz başına mı, kullanıcı başına tek mi?** Cihaz başına. Tek görüntüde iki cihaz birbirinin yedeğini ezerdi; birleştirme geri yüklemede yapılır.
- **Web de yedek alsın mı?** Evet. Masaüstü kullanıcısının tek cihazı web olabilir.
- **İptal edilen (kayıp) cihazın görüntüsü:** silinmez, geri yüklemenin asıl kaynağı odur. 5 görüntü sınırı ve hesap silme temizler.
- **Kurulum sorusunun zamanı:** ilk şifreli DM açılışında bir kez. Kayıtta sormak, şifreleme izin listesindeyken anlamsız.
