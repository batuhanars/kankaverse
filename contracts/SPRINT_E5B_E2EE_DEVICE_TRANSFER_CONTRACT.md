# SPRINT E5b: Cihazdan cihaza geçmiş aktarımı + geçmiş görünürlüğü (E5a Rev.3 uygulaması)

> Durum: **TASARIM KİLİTLİ (2026-11-12, sahip onayı; §9 PM önerileriyle kabul: yalnız 6 haneli kod, okunmamış sayısı hesap düzeyinde kalır).**
> PM compose (Opus). **e2ee-core + e2ee-client + api + web + mobil.**
> Yol haritası: E0 ✅ → E1 ✅ → E3 ✅ → E4 ✅ (tur 2026-11-12) → E5a ✅ (tur 2026-11-12) → **E5b bu sprint** → E2 grup DM → E8 aramalar → E7 → **herkese açılış**.
> 🔴 **R7 bölgesi:** aktarım el sıkışması ve anahtar türetme (e2ee-core), aktarım sahipliği/durum makinesi ve `exists` süzgeci (api), birleştirme ve gizleme kuralı (e2ee-client).
> Dayanak: kurul verdikti `knowledge/kurul/verdicts/2026-11-11-e5-yedek-ve-cihaz-aktarimi.md` (⚠ ŞARTLI, koşul 1: bant dışı doğrulama, cihaz bilgisi, 10 dk, tüm cihazlara bildirim); `SPRINT_E5A_E2EE_BACKUP_CONTRACT.md` §4.2 (görüntü içeriği), §4.5 (birleştirme), §4.7 (`exists`), §4.8 Rev.3 (bant ve geçmiş kararları); PLAN.md R4 "Geçmiş görünürlüğü" (sahip, 2026-11-12).

## §0 Karar ve kapsam

**Sorun:** yeni cihaz, katıldığı andan önceki şifreli mesajları göremez. E5a bunu yedek şifresiyle çözdü; yedeği kurmamış ya da şifresini hatırlamayan kullanıcının yolu yok. Ayrıca yeni cihazda eski mesajlar "bu cihaz eklenmeden önce gönderildi" satırlarıyla dolu görünüyor (sahip bu görünümü istemedi).

**Bu sprint dört parça:**
- **A. Aktarım:** eski cihaz (çevrimiçi, aynı hesap) yerel çözülmüş mesajlarını yeni cihaza şifreli olarak gönderir. Yedek şifresi gerekmez. Sunucu yalnız şifreli veriyi taşır, okuyamaz; iki ekranda **6 haneli kod** eşleşmesiyle doğrulanır.
- **B. Geri yükleme bandı Rev.3** (E5a §4.8): bant bir kez sorulur, üç seçenek: aktar / yedekten geri yükle / hayır. Yedek açma ile geçmişi geri yükleme ayrı seçim.
- **C. Cihaz öncesi mesajlar gizlenir** (PLAN R4): 1-1 şifreli DM'de bu cihazın katılımından önceki, yerelde olmayan mesajlar sohbette, önizlemede ve bildirimde görünmez.
- **D. "Sohbeti temizle" boşluğu** (E5a §4.8): temizlenen mesajlar yedeğe ve aktarıma girmez.

**Kapsam DIŞI:** QR ile doğrulama (§9-1, sonraki tur) · grup DM aktarımı (E2 aynı yoldan gelir, kanal türünden bağımsız tasarlanır) · medya (DM medyası şifresiz, E6) · aktarımın arka planda/uygulama kapalıyken sürmesi · eski cihaz yokken aktarım (o durumun yolu E5a yedeği).

## §1 İlkeler

1. **Sunucuya güvenilmez (kurul k.1).** Sunucu iki cihaz arasındaki anahtar değişimini taşır ama araya giremez: kod eşleşmesi ve taahhüt (commit) adımı sahte anahtarı yakalar. Sunucu düz metin, ortak anahtar ya da kodu görmez.
2. **Kullanıcı onayı eski cihazda.** Geçmişi veren cihaz isteği görür (cihaz adı, platform, saat), kodu yeni cihazdaki kodla karşılaştırır, "Kodlar aynı" der. Onaysız hiçbir şey gönderilmez.
3. **Tek kullanımlık, kısa ömürlü.** İstek 10 dk'da düşer; tamamlanan ya da iptal edilen isteğin şifreli verisi sunucudan hemen silinir. Kullanıcı başına aynı anda tek açık istek.
4. **Herkes haberdar (kurul k.1).** Aktarım tamamlanınca hesabın tüm cihazlarına bildirim gider.
5. **Aynı içerik kuralı.** Aktarılan kayıtlar E5a görüntüsüyle aynı biçim ve süzgeçten geçer (§4.2 alanları, silinen/temizlenen mesaj girmez, `fk`/`sentAt` korunur: aktarılan mesaj şikâyette doğrulanır).
6. **Birleştirme yereli bozmaz.** E5a §4.5 kuralı aynen.

## §2 Kripto (`shared/e2ee-core`, yeni bağımlılık YOK: `@noble/curves` X25519, `@noble/hashes` SHA-256/HKDF, `@noble/ciphers` AES-GCM)

### §2.1 El sıkışma (N = yeni cihaz, O = eski cihaz)
1. **N:** geçici X25519 anahtar çifti `(eN, EN)`, rastgele `rN` (32 bayt). Taahhüt `C = SHA256("kv-e5b-commit-v1" | EN | rN)`. Sunucuya yalnız `C` gider.
2. **O:** isteği görür, kullanıcı "Devam et" der. Geçici `(eO, EO)` üretir, sunucuya `EO` gider.
3. **N:** `EO` gelince `EN` ve `rN`'yi açar. Sunucu `C`'yi doğrular (yanlışsa 400), O da kendi tarafında doğrular (yanlışsa iptal, hata türü `TransferCommitError`).
4. **İki taraf:** `Z = X25519(e*, E*)` (sıfır çıktı reddedilir). Döküm `T = pack("kv-e5b-v1", userId, transferId, deviceN, deviceO, EN, EO, rN)` (her alan uzunluk önekli, e2ee-core `pack`; ayraçlı birleştirmenin belirsizliği yok).
   - Kod: `SAS = HKDF-SHA256(Z, salt = SHA256(T), info = "kv-e5b-sas-v1", 4 bayt)` → büyük uçlu uint32 `mod 1 000 000`, 6 hane, başta sıfır korunur.
   - Anahtar: `K = HKDF-SHA256(Z, salt = SHA256(T), info = "kv-e5b-key-v1", 32 bayt)`.
5. **Neden taahhüt:** N anahtarını O'nunkini görmeden kilitler; araya giren sunucu kodu tutturmak için anahtarını sonradan seçemez. Başarı şansı tek denemede 1/1 000 000 ve her deneme kullanıcıya görünür bir istek demek.
6. Geçici gizli anahtarlar yalnız bellekte; aktarım bitince ya da iptalde sıfırlanır. Kod da `K` de diske ve log'a yazılmaz.

### §2.2 Yük
- `plaintext` = E5a §2.2 görüntü JSON'u ile aynı şema: `{ v: 1, kind: "transfer", deviceId: O, createdAt, messages: StoredMessage[] }`.
- `blob = nonce12 | AES-256-GCM(K, nonce12, plaintext, aad = "kv-e5b-blob-v1|" + userId + "|" + transferId)`.
- Sınır 25 MB (E5a ile aynı). Aşarsa O tarafı "Geçmiş çok büyük, yedekten geri yükle" der (§9-4).

### §2.3 Testler
Sabit girdilerle vektör (SAS ve K); iki tarafın aynı SAS'ı bulması; taahhüt uyuşmazlığı; değiştirilmiş `EO` ile SAS'ın değişmesi (araya girme simülasyonu); kurcalanmış AAD/blob reddi; 6 hane biçimi (başta sıfır).

## §3 API

### §3.1 Şema
```prisma
enum E2eeTransferStatus { PENDING ACCEPTED REVEALED UPLOADED DONE CANCELLED EXPIRED }

model E2eeTransfer {
  id          String             @id @default(cuid())
  userId      String
  newDeviceId String             // isteği açan (N), çağıranın kendi aktif cihazı
  oldDeviceId String?            // kabul eden (O)
  commit      Bytes              // C (32)
  newPub      Bytes?             // EN, reveal'da
  newNonce    Bytes?             // rN, reveal'da
  oldPub      Bytes?             // EO, accept'te
  objectKey   String?            // e2ee-transfer/{userId}/{transferId}
  size        Int?
  sha256      String?
  status      E2eeTransferStatus @default(PENDING)
  createdAt   DateTime           @default(now())
  expiresAt   DateTime           // createdAt + 10 dk
  user        User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, status])
  @@index([expiresAt])
}
```

### §3.2 Uçlar (hepsi `JwtAuthGuard` + `E2eeEnabledGuard` + bayrak `E2EE_TRANSFER`, kullanıcı başı throttle)
| Uç | Kim | Ne |
|---|---|---|
| `POST /e2ee/transfer` | N | Gövde `{ deviceId, commit }`. `deviceId` çağıranın aktif cihazı (403). Kullanıcının açık isteği varsa İPTAL edilir (tek açık istek). Yanıt `{ id, expiresAt }`. Kullanıcının diğer cihazlarına soket `e2ee.transfer.requested { id, device: { platform, name, createdAt } }`. |
| `GET /e2ee/transfer/pending` | O | Kullanıcının açık isteği (varsa): `{ id, newDevice: { platform, name, createdAt }, createdAt, expiresAt }`. Çağıran isteği açan cihazsa boş (kendine onay veremez). `name` = o cihazın oturumundaki `Session.device` (ör. "Chrome, Windows", "Redmi 14C"). IP göstermez. |
| `POST /e2ee/transfer/:id/accept` | O | Gövde `{ deviceId, pub }`. `deviceId` çağıranın aktif cihazı ve N'den farklı (403). Durum `PENDING` olmalı (409). → `ACCEPTED`. N'ye soket `e2ee.transfer.accepted`. |
| `POST /e2ee/transfer/:id/reveal` | N | Gövde `{ pub, nonce }`. Yalnız N (403). Durum `ACCEPTED` (409). Sunucu `C`'yi doğrular (400 `E2EE_TRANSFER_COMMIT`). → `REVEALED`. O'ya soket `e2ee.transfer.revealed`. |
| `GET /e2ee/transfer/:id` | N, O | Durum + karşı tarafın açık anahtarı (`oldPub` N'ye, `newPub`/`newNonce` O'ya). Soket kaçarsa yoklama yolu. |
| `POST /e2ee/transfer/:id/upload` | O | Gövde `{ size, sha256 }`. Durum `REVEALED`. `size ≤ 25 MB` (413). Presigned PUT. |
| `POST /e2ee/transfer/:id/commit` | O | Nesne var ve boyut tutuyor → `UPLOADED`. N'ye soket `e2ee.transfer.ready`. |
| `GET /e2ee/transfer/:id/blob` | N | Durum `UPLOADED`. Presigned GET (kısa ömür). |
| `POST /e2ee/transfer/:id/done` | N | → `DONE`, nesne silinir. **Tüm cihazlara** soket `e2ee.transfer.completed` + push (§4.5). |
| `POST /e2ee/transfer/:id/cancel` | N, O | Herhangi bir ara durumdan → `CANCELLED`, nesne silinir, karşı tarafa soket. |

- Durum makinesi dışı her geçiş 409 `E2EE_TRANSFER_STATE`. Süresi geçmiş istek her uçta 410 `E2EE_TRANSFER_EXPIRED`.
- **Temizlik işi** (mevcut zamanlanmış iş deseninde, dakikada bir): `expiresAt < now` ve bitmemiş istekler → `EXPIRED`, nesne silinir. `DONE/CANCELLED/EXPIRED` satırları 7 gün sonra silinir (iz için kısa süre).
- **Bucket:** özel bucket, önek `e2ee-transfer/{userId}/{transferId}`. Public/CDN yok.
- **Hesap silme:** `purge.job.ts` açık aktarımları ve nesneleri siler.
- `GET /e2ee/status` → `transfer: boolean`. Bayrak `E2EE_TRANSFER` (varsayılan `false`), izin listesi E1 ile aynı.
- Audit: `e2ee.transfer.request`, `.accept`, `.done`, `.cancel`, `.expire` (içerik, anahtar, kod YOK; yalnız cihaz kimlikleri).

### §3.3 `exists` süzgecine temizleme (parça D, R7)
`POST /e2ee/messages/exists` "var" sayarken çağıranın o kanaldaki `ChannelMember.clearedAt`'inden önce oluşturulan mesajları da dışlar (silinmiş gibi). Görüntü kurulumu (E5a), geri yükleme (E5a) ve aktarım (§4.2) bu ucu zaten kullanır: temizlenen mesaj sonraki yedekten düşer, geri yüklemede ve aktarımda gelmez. Yerel kayıt da `exists` "yok" dediği için silinir (E5a §4.7 davranışı).

### §3.4 Testler (api)
Durum makinesinin her geçişi ve her yasak geçişi (409); başkasının isteğine erişim 403; N kendi isteğini kabul edemez; iptal edilmiş/başka kullanıcının cihazıyla accept 403; commit doğrulama (doğru/yanlış); 10 dk sonra 410 ve temizlik işinin nesneyi silmesi; yeni istek eskisini iptal eder; 25 MB sınırı; `done` sonrası nesne silinir ve tüm cihazlara olay gider; bayrak kapalıyken uçlar kapalı; hesap purge; `exists` clearedAt süzgeci (öncesi yok, sonrası var, clearedAt boşken eski davranış).

## §4 İstemci (`shared/e2ee-client` + web + mobil)

### §4.1 Motor (`engine.transfer`)
- `start(): { id, sas: Promise<string> }` (N), `listPending()`, `accept(id)` (O), `confirm(id)` (O: kod onaylandı → yük kur, şifrele, yükle), `receive(id)` (N: indir, çöz, birleştir, `done`), `cancel(id)`.
- Yük kurulumu E5a görüntü kurulumunu yeniden kullanır (aynı durum süzgeci, `exists` ile kanal başı süzme; ağ hatasında aktarım durur, eksik kontrolle yük GÖNDERİLMEZ).
- Birleştirme E5a §4.5 fonksiyonunun aynısı (yeni kod yazılmaz). Biten aktarım `markBackupDirty` yapar (bu cihazın yedeği güncellensin).
- Testler (sahte sunucu): iki motor uçtan uca; araya giren sahte anahtar → kodlar farklı ve O onaylamadıkça yük gitmez; yarıda iptal; süresi dolmuş istek; silinmiş/temizlenmiş mesajın yüke girmemesi; birleştirme tablosu.

### §4.2 Akış: yeni cihaz (N)
1. Bant (parça B, §4.4) ya da Hesap güvenliği → Sohbet yedeği → **"Eski cihazımdan aktar"**.
2. Ekran: "Diğer cihazında Kankaverse uygulamasını aç. Aktarım isteği görünecek." Bekleme, 10 dk geri sayım, İptal.
3. O kabul edince ekranda **6 haneli kod** (büyük, `123 456` biçiminde) + "Bu kodu diğer cihazındaki kodla karşılaştır."
4. Yük gelince "Aktarılıyor", bitince "N mesaj aktarıldı" ve açık sohbetler yeniden hidrate edilir.

### §4.3 Akış: eski cihaz (O)
1. Soket olayıyla (uygulama açıksa) ya da uygulama açılışında `pending` yoklamasıyla **tam ekran olmayan bir sayfa/modal:** "Yeni bir cihaz geçmişini istiyor: {name} ({platform}), {saat}. Sen misin?" · [Devam et] [Ben değilim].
2. [Devam et] → kod görünür: "Yeni cihazdaki kod bununla aynı mı?" · [Kodlar aynı, aktar] [Farklı, iptal et].
3. [Ben değilim] / [Farklı] → `cancel` + "İstek reddedildi. Hesabına başkası girmiş olabilir: şifreni değiştir ve Oturumlar'dan bilmediğin cihazı kapat." (Oturumlar ekranına bağlantı.)
4. Aktarım sırasında O ön planda kalmalı (MIUI kuralı): "Aktarım bitene kadar uygulamayı kapatma." Yarıda kalırsa N tarafı hata görür, istek iptal edilir, yeniden başlatılır.
5. Web de O olabilir (kurul: kabul).

### §4.4 Parça B: bant Rev.3 (E5a §4.8'in uygulaması)
- Yeni cihazda (bu cihazda hiç mesaj kaydı yok ya da `undecryptable` var) sohbet listesinde **bir kez**: "Eski mesajlarını bu cihaza getirmek ister misin?" · [Eski cihazımdan aktar] (bayrak açıksa) · [Yedekten geri yükle] (yedek varsa) · [Hayır].
- "Soruldu" kaydı cihaz + kullanıcı başına kalıcı (cihaz deposu, çıkışta silinir), bant göründüğü oturum bitince yazılır. Cevap ne olursa olsun tekrar çıkmaz. Key-dropped durumunda da çıkmaz.
- **Yedek açma ile geçmiş ayrılır:** "Bu cihazda yedeği aç" ekranında "Eski mesajları da geri yükle" seçeneği (bant [Yedekten geri yükle] ile geldiyse işaretli, ayarlardan geldiyse işaretsiz). Motor: `unlockBackup(password, { restoreHistory })`.
- [Hayır] sonrası bu cihaz yedeklenmez; Sohbet yedeği ekranının durum satırı bunu söyler ve açma satırı orada durur.
- Sessiz kapı: Hesap güvenliği → Sohbet yedeği ekranında "Eski cihazımdan aktar" ve "Yedekten geri yükle" her zaman var.

### §4.5 Bildirim (kurul k.1)
`done` sonrası hesabın **tüm cihazlarına** (N ve O dahil): uygulama içi bildirim + push (veri-yalnız değil, düz bildirim; içerik yok): "Şifreli mesaj geçmişin yeni bir cihaza aktarıldı: {name}, {saat}. Bu sen değilsen hemen şifreni değiştir." Bildirim türü yeni `E2EE_TRANSFER`; bildirim tercihlerinden kapatılamaz (güvenlik bildirimi).

### §4.6 Parça C: cihaz öncesi mesajlar gizlenir (1-1 şifreli DM)
- **Kural:** motorun `undecryptable` durumu (= bu cihazın kanala katılımından önce gönderilmiş ve yerelde çözümü yok, `hydrate.ts failureStatus`) ekranda HİÇ çizilmez. Geri yüklenen/aktarılan (`ok`, `unverified`) kayıtlar katılım öncesi olsa da görünür.
- Görünür kalan durumlar: `unsupported` ("güncelle"), `failed` ("çözülemedi", katılım sonrası), `unverified`.
- **Sayfalama:** eski sayfa yüklenirken sayfadaki her mesaj gizli (`undecryptable`) çıkarsa daha eskisi istenmez ("cihaz öncesi sınırı"). Sayfada en az bir görünür mesaj varsa devam. Sohbet tamamen gizliyse boş sohbet durumu ("Henüz mesaj yok" değil, "Bu cihazdan önceki mesajlar burada görünmez" tek satırlık bilgi; metin §5).
- **Önizleme:** DM listesinin son mesajı gizliyse önizleme "Şifreli mesaj" yazmaz, boş kalır (istemci). `prefetchPreview` gizli sonucu `plainTick` artırmadan geçer.
- **Bildirim:** yeni cihaz katıldıktan sonra gelen mesaj zaten katılım sonrası; push yolunda ek iş yok. Uygulama içi bildirim listesinde gizli mesaja ait satır gösterilmez.
- **Okunmamış sayısı:** §9-2.
- Grup DM: E2 sözleşmesinde sunucu tarafında (katılım öncesi mesaj yeni üyeye gönderilmez); bu bölüm yalnız 1-1.

### §4.7 Metinler
Tümü i18n (`e2ee.transfer.*`, `e2ee.history.*`). Web `{'@'}` kaçışı. Em dash yok. Tarih/saat TR biçimi.

## §5 Kullanıcıya görünen metinler (taslak, sahip onayı)
- Bant: "Eski mesajlarını bu cihaza getirmek ister misin?" · "Eski cihazımdan aktar" · "Yedekten geri yükle" · "Hayır"
- N bekleme: "Diğer cihazında Kankaverse uygulamasını aç. Aktarım isteği orada görünecek."
- N kod: "Bu kodu diğer cihazındaki kodla karşılaştır. Aynıysa diğer cihazında onayla."
- O istek: "Yeni bir cihaz mesaj geçmişini istiyor: {name}, {saat}. Bu sen misin?" · "Devam et" · "Ben değilim"
- O kod: "Yeni cihazdaki kod bununla aynı mı?" · "Kodlar aynı, aktar" · "Farklı, iptal et"
- O sırada: "Aktarım bitene kadar uygulamayı kapatma."
- Red: "İstek reddedildi. Hesabına başkası girmiş olabilir: şifreni değiştir ve Oturumlar'dan tanımadığın cihazı kapat."
- Bitti (N): "{n} mesaj aktarıldı."
- Süre doldu: "İstek zaman aşımına uğradı. Yeniden başlat."
- Bildirim: "Şifreli mesaj geçmişin yeni bir cihaza aktarıldı: {name}, {saat}. Bu sen değilsen hemen şifreni değiştir."
- Gizli sohbet: "Bu cihazdan önceki mesajlar burada görünmez."

## §6 Gizlilik metni eki (E4 §5.1 listesine, herkese açılışla, sahip onayı)
`s3Item6` (yeni): "Mesaj geçmişini eski cihazından yeni cihazına aktarırsan geçmiş, yalnız bu iki cihazın açabileceği biçimde şifrelenip sunucumuz üzerinden iletilir ve aktarım bitince sunucudan silinir." (Kurul k.5: mutlak iddia yok.)

## §7 Uygulama sırası
1. `e2ee-core`: §2 + vektörler → **R7-1**
2. api: §3.1-3.2 + migration + temizlik işi + bildirim türü + §3.3 süzgeç + §3.4 testleri → **R7-2**
3. `e2ee-client`: §4.1 motor + uçtan uca testler + §4.6 gizleme kuralının motor tarafı (sayfalama sınırı yardımcısı) → **R7-3**
4. web + mobil: §4.2-4.6 ekranları, bant Rev.3, gizleme, metinler → **R7-4** (yalnız akış ve metin)
5. Deploy (`E2EE_TRANSFER=false`), bayrak izin listesinde açılır, cihaz turu.
6. Gizlilik metni (§6) herkese açılışla.

Native değişiklik beklenmiyor (QR yok, kripto saf JS ve küçük: X25519 + HKDF milisaniyeler). Mobil yine release derlemesi ister (yeni ekranlar), vc71.

## §8 DoD
- Testler yeşil: core vektörleri + §2.3; api §3.4; client §4.1 uçtan uca.
- `migrate status` canlıda temiz. `nest build`, web `vue-tsc -b` (yalnız bilinen 6 hata) + `vite build`, mobil `tsc` (yalnız bilinen rota tipi hataları) + `check-i18n`.
- **Cihaz turu (sahip):**
  1. Telefonda (O) şifreli DM'de 20+ mesaj. Yeni tarayıcıda (N) giriş: bant bir kez çıkar, "Eski cihazımdan aktar".
  2. Telefonda istek görünür (cihaz adı doğru), iki ekranda kod aynı, onay: N'de mesajlar okunur, "{n} mesaj aktarıldı".
  3. İki cihazda da (ve varsa üçüncüde) "geçmiş aktarıldı" bildirimi.
  4. Aktarılan bir mesajı şikâyet et: moderasyonda "Doğrulandı".
  5. Bir mesajı sil, "Sohbeti temizle" ile bir sohbeti temizle, yeni aktarım: silinen ve temizlenen gelmez; bir sonraki yedek de onları içermez.
  6. O'da "Ben değilim": N'de istek reddedildi, sunucuda nesne yok. 10 dk bekle: süre doldu, nesne yok (PM DB + bucket kontrolü).
  7. Bant: [Hayır] de, uygulamayı kapat/aç: bant çıkmaz; Sohbet yedeği ekranında durum satırı ve iki seçenek var.
  8. Aktarım yapılmamış yeni cihazda eski sohbet: cihaz öncesi mesajlar görünmez, kaydırınca sonsuz yükleme yok, tek satırlık bilgi var; DM listesi önizlemesi "Şifreli mesaj" göstermez.
  9. Yedekten geri yükleme "Eski mesajları da geri yükle" işaretsizken yalnız yedek açılır, geçmiş gelmez.
- Sunucu log'larında `Z`, `K`, kod, gizli anahtar ya da düz mesaj yok (PM grep).

## §9 Açık sorular (PM önerisiyle, sahip itiraz etmezse geçerli)
1. **QR mı, 6 haneli kod mu?** **Öneri: bu sprintte yalnız kod.** Kurul ikisinden birini istiyor. QR üç yeni bağımlılık ister (mobilde kamera/okuyucu + native derleme, web'de QR üretici) ve web-web aktarımında zaten işe yaramaz (dizüstünde kamera okutmak zor). Kod her cihaz çiftinde çalışır, yeni bağımlılık yok. QR, kullanım verisi isterse sonraki turda "kodu okut" kısayolu olarak eklenir (aynı el sıkışma, `EN` + `rN` QR'a konur).
2. **Okunmamış sayısı gizli mesajları sayar mı?** **Öneri: sunucudaki sayı değişmez.** Okundu bilgisi hesap düzeyinde; sunucu hangi cihazın neyi göremediğini bilmez (bilmemeli). Pratikte cihaz öncesi mesajlar genelde diğer cihazda zaten okunmuştur; okunmamışsa sohbete girince sıfırlanır. Sahip kararı ("okunmamış sayısına girmez") 1-1'de istemci tarafında tam uygulanamaz; bu sapma burada kayıt altına alınır. Grup DM'de E2 sunucu süzgeci bunu kendiliğinden çözer.
3. **Aktarım onayını web verebilir mi?** Evet (kurul kabul etti, E1 §4 sınırı).
4. **25 MB'ı aşan geçmiş:** aktarım yapılmaz, "Geçmiş çok büyük, yedekten geri yükle" denir. Parçalı aktarım YAGNI; 25 MB yaklaşık 100 bin kısa mesaj.
5. **Aktarım yedeği de açar mı?** Hayır. Yedek şifresi ayrı bir sırdır; aktarım yalnız geçmişi taşır. Bant/ekran yedeğin bu cihazda kapalı olduğunu söyler.
6. **"Yeni cihaz eklendi" bildirimi** (cihaz kaydı anında, aktarım olmasa da): bu sprintte değil. Giriş e-postası zaten var; sohbet içi "yeni cihaz" uyarısı E2'de teyit ediliyor (PLAN R4). Aktarım bildirimi kurul k.1'i karşılar.
