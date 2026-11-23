# SPRINT E7: Güvenlik kodu (kimlik anahtarı + cihaz imzalama) ve şifreli grup DM'de yerel arama

> Durum: **TASARIM KİLİTLİ (2026-11-23, sahip onayı; §10 PM önerileriyle kabul, §6 metinler ve §7 gizlilik metni onaylı).**
> PM compose (Opus). **e2ee-core + e2ee-client + api + web + mobil.**
> Yol haritası: E1-E5, E2, E8 ✅ (E8 herkese açık 2026-11-23) → **E7 bu sprint**. E6 ertelenmiş, E9 aday.
> 🔴 **R7 bölgesi:** kimlik anahtarı, cihaz imzası ve güvenlik kodu (e2ee-core); kimlik/imza uçları ve sıfırlama (api); doğrulama kuralı, sabitleme (TOFU), geçiş ve imza yolları (e2ee-client). Yerel arama R7 değildir.
> Dayanak: kurul verdikti `knowledge/kurul/verdicts/2026-11-23-e7-guvenlik-kodu.md` (⚠ ŞARTLI, 7 koşul, sahip kabul); `SPRINT_E1_DM_E2EE_CONTRACT.md` §3 (credential, yaprak eşleme); `SPRINT_E2_E2EE_GROUP_DM_CONTRACT.md` §3.3 ("yeni cihaz eklendi" satırı); `SPRINT_E5A_E2EE_BACKUP_CONTRACT.md` §2.2 (BMK), §4.4, §4.8; `SPRINT_E5B_E2EE_DEVICE_TRANSFER_CONTRACT.md` §2 (el sıkışma).

## §0 Karar ve kapsam

**Sorun 1:** bir kullanıcının hangi cihaz anahtarlarına sahip olduğunu yalnız sunucu söylüyor. İstemci yaprağı sunucunun listesiyle eşler (E1 §3) ama listenin doğruluğunu sınayamaz: kötü niyetli ya da ele geçirilmiş sunucu sohbete sahte cihaz ekleyip mesajları okuyabilir. Bugünkü azaltma yalnız "yeni cihaz eklendi" satırı (E2 §3.3): fark ettirir, kanıtlamaz.

**Sorun 2:** şifreli mesaj sunucuda aranamıyor. Arama kutusu "Şifreli mesajlar bu cihazda henüz aranamıyor" diyor. 1-1 DM'de arama zaten yok (sahip kararı 2026-08-01, iki istemcide); etkilenen yüzey **grup DM** (E2'den beri tümü şifreli).

**Bu sprint iki parça:**
- **A. Kimlik ve güvenlik kodu:** her kullanıcının bir kimlik anahtarı olur; cihazlarını bu anahtar imzalar. İstemci kişilerin kimliğini ilk gördüğünde sabitler (TOFU) ve cihazlarını kendisi doğrular. İmzalı cihaz sessiz eklenir, imzasız cihaz engellenmez ama görünür. İki kişi isterse güvenlik kodunu karşılaştırır.
- **B. Yerel arama:** şifreli grup DM'de arama cihazdaki şifreli yerel depoda yapılır; sunucuya sorgu gitmez.

**Kapsam DIŞI:** sahte **üye** (sunucunun gruba gerçek ama yabancı bir hesap eklemesi; kurul k.7, bilinen sınır, §1-6) · QR ile kod doğrulama (kurul k.7, sonraki tur) · doğrulama işaretlerinin cihazlar arası eşitlenmesi (§10-2) · 1-1 DM'ye arama eklemek (sahip kararı) · tüm DM'lerde ortak arama · MLS credential değişikliği (kurul k.4) · ortam kanalları.

## §1 İlkeler

1. **İmzasız cihaz engellenmez, görünür olur (kurul k.1).** MLS akışı bugünkü gibi sürer; yalnız sohbetteki satır değişir. Girişte imza zorunlu değil.
2. **İmzayı sunucu atamaz.** Kimlik özel anahtarı yalnız cihazlarda ve BMK ile sarılı olarak yedekte durur (kurul k.2). Sunucu yedek şifresini bilmez, E5b koduna giremez.
3. **Otomatik koruma, isteğe bağlı karşılaştırma (kurul k.3).** Kullanıcı kod karşılaştırmasa da istemci, sabitlenmiş kimlikle imzalanmamış cihazı yakalar. Kod karşılaştırma bunun üzerine "bu kimlik gerçekten o kişi" teyidini ekler.
4. **MLS'e dokunulmaz (kurul k.4).** `BasicCredential = deviceId` ve E1 §3 yaprak eşleme kuralı aynen kalır. Kimlik imzası sunucunun cihaz listesinin yanında ek alandır, istemcide ayrıca doğrulanır.
5. **Kimlik değişimi yüksek sesle olur.** Kimlik yalnız sıfırlamayla değişir; kişilerin sohbetinde bir kez "güvenlik kodu değişti" satırı çıkar, doğrulama işareti düşer. Sessiz kimlik değişimi yoktur.
6. **Bilinen sınır dürüstçe söylenir (kurul k.6).** E7 sahte cihazı yakalar, sahte üyeyi yakalamaz: grup üyeliğini sunucu yönetir, savunma üye listesinde ve sohbette görünürlüktür. Gizlilik metni mutlak iddia içermez (§7).
7. **Kullanıcıyı boğma.** Yeni bant, ısrar, ek onay ekranı yok. Bugünkü "yeni cihaz eklendi" satırı imzalı cihazlar için kalkar; net satır sayısı azalır.

## §2 Kripto (`shared/e2ee-core`, yeni bağımlılık YOK: `@noble/curves` Ed25519, `@noble/hashes` SHA-512, `@noble/ciphers` AES-GCM)

### §2.1 Kimlik anahtarı
- `IdentityKey = Ed25519` anahtar çifti, kullanıcı başına. `version` (1'den başlar, sıfırlamada artar).
- Üretim yalnız istemcide (`createIdentity()`), özel anahtar düz olarak yalnız Vault'un `device` bölümünde (Vault zaten şifreli). Log'a, hata mesajına yazılmaz.
- Masaüstü (Electron 36) WebCrypto Ed25519 yok: E1'deki gibi saf `@noble` yolu (D93 ile aynı `detectWebProvider` kararı).

### §2.2 Cihaz imzası
- `sig = Ed25519.sign(idPriv, pack("kv-e7-dev-v1", userId, idVersion, deviceId, signatureKey))` (`pack` = e2ee-core uzunluk önekli birleştirme, E5b §2.1 ile aynı).
- `verifyDevice(identity, device) → boolean`: imza, sabitlenmiş kimliğin açık anahtarıyla ve **aynı `version`** ile doğrulanır. Eski sürümle atılmış imza geçersizdir.

### §2.3 Kimliğin yedekte taşınması
- `wrappedIdentity = nonce12 | AES-256-GCM(BMK, nonce12, idPriv, aad = "kv-e7-id-v1|" + userId + "|" + idVersion + "|" + keyVersion)`.
- BMK zaten iki katmanlı (E5a §2.2); şifre değişimi kimliği yeniden sarmayı gerektirmez. E5a yedek sıfırlaması (yeni BMK) sonrası kimliği taşıyan cihaz yeniden sarar (§4.6).

### §2.4 Güvenlik kodu
- Kullanıcı parmak izi: `F(u) = SHA-512(pack("kv-e7-fp-v1", userId, idVersion, idPub))` ilk 30 bayt → 6 parça × 5 bayt, her parça büyük uçlu `mod 100000` → 6 grup × 5 hane (başta sıfır korunur).
- Kod: iki kullanıcının parmak izleri `userId` sırasına göre art arda → **12 grup × 5 hane** (60 hane). İki tarafta aynı görünür.
- Güvenlik payı: sunucunun 30 hanelik parmak izini tutturan sahte kimlik üretmesi ~2^99 deneme ister.

### §2.5 Testler
Sabit girdilerle vektör (imza, parmak izi, kod); iki tarafın aynı kodu bulması; sürüm farkında imzanın reddi; başka kullanıcının kimliğiyle imzanın reddi; kurcalanmış `signatureKey`; `wrappedIdentity` sarma/açma, yanlış BMK, kurcalanmış AAD; kod biçimi (başta sıfır).

## §3 API

### §3.1 Şema
```prisma
model E2eeIdentity {
  userId    String   @id
  publicKey Bytes    // Ed25519, 32 bayt
  version   Int      // sıfırlamada artar
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
// E2eeDevice'a:
//   identitySig     Bytes?  // §2.2 imzası; null = imzasız
//   identityVersion Int?    // imzanın atıldığı kimlik sürümü
// E2eeBackup'a:
//   wrappedIdentity Bytes?  // §2.3
//   identityVersion Int?
```

### §3.2 Uçlar (hepsi `JwtAuthGuard` + `E2eeEnabledGuard` + bayrak `E2EE_IDENTITY`, kullanıcı başı throttle)
| Uç | Ne |
|---|---|
| `GET /e2ee/users/:userId/devices` | **Genişler:** yanıt `{ identity: { publicKey, version } \| null, devices: [{ deviceId, platform, signatureKey, createdAt, identitySig, identityVersion }] }`. Erişim kuralı aynı (ortak DM ya da kendisi). 🔴 Dizi yerine nesne: istemci sözleşmesi değişir, eski istemci için §3.4. |
| `GET /e2ee/channels/:channelId` | `members[]`'e `identity: { publicKey, version } \| null`, `devices[]`'e `identitySig`, `identityVersion` eklenir. |
| `PUT /e2ee/identity` | İlk kurulum. Gövde `{ publicKey, signatures: [{ deviceId, sig }] }`. Kimlik yoksa `version = 1` ile yazılır, imzalar kendi aktif cihazlarına işlenir. Kimlik varsa 409 `E2EE_IDENTITY_EXISTS`. |
| `POST /e2ee/identity/reset` | **Reauth zorunlu** (Sprint 2B hassas işlem akışı). Gövde aynı. `version + 1`, kullanıcının TÜM cihaz imzaları silinir, gövdedeki imzalar işlenir, `E2eeBackup.wrappedIdentity` silinir. Audit `e2ee.identity.reset`. |
| `POST /e2ee/devices/:deviceId/signature` | Gövde `{ identityVersion, sig }`. Hedef çağıranın **kendi aktif** cihazı olmalı (403). `identityVersion` güncel olmalı (409 `E2EE_IDENTITY_VERSION`). |
| `PUT /e2ee/backup/identity` | Gövde `{ wrappedIdentity, identityVersion, keyVersion }`. Yedek yoksa 404 `E2EE_BACKUP_NOT_CONFIGURED`; `keyVersion` ya da `identityVersion` güncel değilse 409. |
| `GET /e2ee/backup` | Yanıta `wrappedIdentity?`, `identityVersion?` eklenir. |

- **Savunma doğrulaması:** sunucu her imzayı kayıtlı açık anahtarla doğrular, geçersizse 400 `E2EE_IDENTITY_SIG_INVALID`. Bu güvenlik değil hijyendir (güvenlik istemcide); bozuk istemcinin çöp yazmasını önler. Node `crypto` Ed25519 yeterli, yeni bağımlılık yok.
- **Olay:** imza yazılınca ya da kimlik sıfırlanınca kullanıcının DM kanallarındaki üyelere `e2ee:identity` soket olayı (`{ userId }`), istemci önbelleğini tazeler. İçerik taşımaz.
- **Hesap silme:** `purge.job.ts` `E2eeIdentity`'yi siler (Cascade yeterli, dev teyit eder).
- `GET /e2ee/status` → `identity: boolean` (bayrak).

### §3.3 Testler (api)
İlk kurulum; ikinci kurulum 409; başkasının cihazına imza 403; iptal edilmiş cihaza imza 403; eski sürümle imza 409; geçersiz imza 400; reset reauth'suz 401/403; reset tüm imzaları ve `wrappedIdentity`'yi siler, `version` artar; yedek yokken `PUT backup/identity` 404; uçlar bayrak kapalıyken kapalı; `GET devices` yeni şekli; hesap silmede kimlik gider.

### §3.4 Geriye uyum
`GET /e2ee/users/:userId/devices` şekli değişiyor. Dev, iki istemcide bu ucun tüm çağrılarını grep ile bulur. Eski mobil sürüm (Play'de yayılım süresince) dizi bekler: uç `?v=2` parametresi olmadan bugünkü diziyi döner, `v=2` ile yeni nesneyi. Eski sürüm yayılımdan düşünce (E8'deki gibi yayılım sorgusu) `v` parametresiz yol PLAN borcuna yazılır.

### §3.5 Rev.1 (2026-11-23, adım 2 PM): iki sadeleştirme
- **§3.4 geçiş düzeni gereksiz:** `GET /e2ee/users/:userId/devices` ucunu bugün hiçbir istemci çağırmıyor (web, mobil, e2ee-client grep). Şekil doğrudan nesneye döndü, `?v=2` yok, PLAN borcu yok.
- **Yeni soket olayı yok:** `e2ee:identity` yerine mevcut `e2ee:devices-changed` (`E2eeNotifyService.devicesChanged`) kullanılır; istemci bu olayda zaten kanal durumunu tazeliyor. İmza ve kimlik değişimi "cihaz değişimi" sayılır.
- **Bayrak:** `E2EE_IDENTITY` + ilk aşama listesi `E2EE_IDENTITY_USER_IDS`. Okuma (yanıttaki kimlik/imza alanları) bayrağa bağlı, yazma ayrıca listeye. Bayrağı kapatmak geri almadır: alanlar null döner, istemci bugünkü davranışa düşer, imzalar DB'de kalır.
- `GET /e2ee/status` → `identity` = bu kullanıcı kimlik kurup imza atabilir mi.

## §4 İstemci (`shared/e2ee-client` + web + mobil)

### §4.1 Depo
- `device` bölümü: `identity: { priv, pub, version } | null` (bu cihaz kimliği taşıyorsa).
- Yeni `pins` bölümü: `userId → { publicKey, version, verified: boolean, verifiedAt? }`. Mesaj değildir, sunucuya ve yedeğe gitmez (§10-2).

### §4.2 Sabitleme (TOFU)
- Bir kişinin kimliği ilk görüldüğünde (`GET channels`/`devices` yanıtı) `pins`'e yazılır, `verified: false`.
- Sonraki yanıtta kimlik farklıysa (açık anahtar ya da sürüm): pin güncellenir, `verified` düşer, o kişiyle ortak her şifreli sohbete bir kez **"{ad} güvenlik kodunu değiştirdi"** satırı düşer (yerel, zaman = gözlem anı).
- Kimliği olmayan kişi (`identity: null`, henüz güncellememiş): bugünkü davranış, E2 §3.3 kuralı aynen.

### §4.3 Cihaz satırı (E2 §3.3'ün yerine, 1-1 + grup)
E2 §3.3'teki tetikleme koşulu aynen (başka kullanıcının, zaten üyeyken eklediği cihaz; kendi cihazım ve yeni üyenin ilk cihazı satır üretmez). Fark yalnız sonuçta:
- Kişinin sabitlenmiş kimliği var ve eklenen cihaz `verifyDevice` ile geçiyor → **satır yok**.
- Kimliği var, cihaz imzasız ya da imza geçmiyor → **"{ad} doğrulanmamış bir cihaz ekledi"**.
- Kimliği yok → bugünkü **"{ad} yeni bir cihaz ekledi"**.
- Yeni üyenin ilk cihazları da imza denetiminden geçer: imzasızsa üye ekleme satırının yanında aynı "doğrulanmamış cihaz" satırı (sahte cihaz üye eklemesine gizlenmesin). Kimliği yoksa satır yok (bugünkü gibi).
- İmza sonradan gelirse (cihaz aktarımla imzalandı) geçmişe dönük satır silinmez; satır o anki gözlemdir.

### §4.4 Geçiş (kurul k.5)
- Bayrak açıkken istemci açılışta: sunucuda kimlik **yoksa** ve bu cihazda da yoksa → `createIdentity()`, kendi aktif cihazlarının tümünü imzalar, `PUT /e2ee/identity`. 409 dönerse (başka cihaz önce davrandı) kimliği tazeler ve §4.5 yollarını bekler.
- Bu cihazda BMK açıksa kimliği hemen yedeğe sarar (`PUT backup/identity`).
- Sunucuda kimlik **var**, bu cihazda yok, BMK açık ve yedekte `wrappedIdentity` var → sessizce açar, kendini imzalar (imzalı değilse). Ekran yok.

### §4.5 İmza yolları (kurul k.2, yalnız bunlar)
1. **Yedek şifresi (E5a akış 2/3):** BMK açıldığı anda `wrappedIdentity` açılır, cihaz kendini imzalar. Geçmişi geri yüklemek şart değil (E5a Rev.3: yedek açma ile geri yükleme ayrı).
2. **Aktarım (E5b):** blob şemasına `identity?: { priv, version }` eklenir (`v: 2`; `v: 1` blob kabul edilmeye devam eder). Yeni cihaz blobu açınca kendini imzalar. El sıkışma ve döküm (T) DEĞİŞMEZ; kimlik zaten kodla doğrulanmış kanaldan geliyor.
3. **"Bu cihazı doğrula" (sessiz kapı, §10-1):** Hesap güvenliği → Cihazlar ekranında, bu cihaz imzasızsa satır. E5b el sıkışmasının aynısı, mesaj listesi boş (`messages: []`), yalnız kimlik taşır. Bant, bildirim, ısrar yok.

### §4.6 Kimlik sıfırlama
- Hesap güvenliği → Cihazlar'da, **yalnız bu cihazda kimlik yoksa ve §4.5'in üç yolu da mümkün değilse** anlamlı; metin bunu söyler: "Kişilerinin sohbetinde güvenlik kodunun değiştiği görünür." Reauth → yeni kimlik → `POST /e2ee/identity/reset` (bu cihaz kendini imzalar, diğer cihazlar imzasız kalır).
- E5a yedek sıfırlaması (yeni BMK) sonrası: kimliği taşıyan cihaz yeni BMK ile yeniden sarar.

### §4.7 Güvenlik kodu ekranı
- Giriş: 1-1 DM ayrıntıları ve grup DM'de üyenin profil satırı → "Güvenlik kodu".
- İçerik: 12 grup × 5 hane, açıklama metni (§6), **"Doğrulandı olarak işaretle"** düğmesi (işaretliyse "İşareti kaldır").
- Kişinin kimliği yoksa: "{ad} uygulamayı güncelleyince güvenlik kodu görünecek."
- İşaret yalnız bu ekranda görünür; başlıkta, listede rozet YOK (kullanıcıyı boğma, §10-3).
- Doğrulanmış kişinin kimliği değişirse §4.2 satırı "güvenlik kodu değişti, yeniden doğrula" metniyle çıkar.

### §4.8 Kendi cihazlarım
Hesap güvenliği → Cihazlar (Oturumlarım) listesinde her cihazın yanında "doğrulanmış" / "doğrulanmamış". Doğrulanmamış bu cihazsa §4.5-3 satırı.

## §5 Parça B: yerel arama (R7 DEĞİL)

### §5.1 Kapsam
- Yalnız şifreli **grup DM** (1-1 DM'de arama yok, sahip kararı). Web `SearchPopover.vue` ve mobil grup DM arama yüzeyi.
- Sonuç = sunucu sonucu (şifreleme ayracından önceki düz mesajlar) ∪ yerel sonuç; `id` ile tekilleştirilir, zamana göre sıralanır. `e2ee.searchNote` metni kalkar.
- Yerel kaynak: `LocalStore` `messages` bölümünde bu kanalın `status: 'ok'` kayıtları. `unverified`/`undecryptable`/`failed`/`unsupported` aranmaz. Görünmeyen mesaj (E5b C: cihaz öncesi, temizlenmiş, silinmiş) yerel depoda zaten yok ya da gizli; gizlenen kayıt sonuçta görünmez (dev `historyVisibility` kuralıyla teyit eder).

### §5.2 Eşleme
- Sunucu aramasıyla aynı his: dev, `GET /channels/:id/messages/search`'ün eşleme kuralını (büyük/küçük harf, Türkçe İ/ı, en az 2 karakter) okur ve yerelde aynısını uygular; `toLocaleLowerCase('tr')`. Bahsetmeler `formatMentionsPlain` ile düz metne çevrilip aranır.
- Sonuca tıklama: mevcut `useMessageJump` (web) / mobil atlama yolu.

### §5.3 Tarama ve ölçüm
- **Önce düz tarama:** `vault.keys('messages')` → her kayıt açılır → `channelId` süzülür → eşleşenler. Sorgu başına bellekte, sonuç sayısı sınırı 50 (sunucuyla aynı sayfa boyu; dev teyit eder).
- Aynı oturumda kanalın çözülmüş kayıtları bellekte tutulabilir (sohbet kapanınca bırakılır); kalıcı düz indeks YAZILMAZ.
- **Ölçüm (DoD):** 10 000 kayıtlı depoda Redmi 14C release'te ilk arama süresi. Hedef < 1,5 sn. Aşılırsa dev DURUR ve bildirir; indeks kararı PM'de (şifreli kanal-başı id listesi gibi).

## §6 Kullanıcıya görünen metinler (taslak, sahip onayı)
- Satırlar: "{ad} doğrulanmamış bir cihaz ekledi" · "{ad} güvenlik kodunu değiştirdi" · (değişmeyen) "{ad} yeni bir cihaz ekledi".
- Kod ekranı açıklaması: "Bu kodu {ad} ile yüz yüze ya da sesli aramada karşılaştır. Aynıysa mesajlarınız ve aramalarınız araya kimse girmeden şifreleniyor."
- Kimliği olmayan kişi: "{ad} uygulamayı güncelleyince güvenlik kodu görünecek."
- Cihazlar: "Doğrulanmış" · "Doğrulanmamış" · "Bu cihazı doğrula" · alt metin: "Başka bir cihazındaki kodla bu cihazı doğrula. Doğrulanmamış cihazlar kişilerinin sohbetinde görünür."
- Sıfırlama: "Güvenlik kimliğini yeniden oluştur" · uyarı: "Bunu yalnız başka cihazın ve yedek şifren yoksa yap. Kişilerinin sohbetinde güvenlik kodunun değiştiği görünür."
- Tümü i18n (`e2ee.identity.*`), web `{'@'}` kaçışı, em dash yok.

## §7 Gizlilik metni eki (E4 §5.1 listesine, sahip onayı)
"Bir kişiyle güvenlik kodunu karşılaştırarak konuşmanıza kimsenin araya girmediğini doğrulayabilirsin. Bir sohbete doğrulanmamış bir cihaz eklenirse sohbette görünür. Gruplara kimin eklendiğini sunucumuz yönetir; yeni üyeler sohbette görünür." (Kurul k.6: mutlak iddia yok.)

## §8 Uygulama sırası
1. e2ee-core §2 + vektörler → **R7-1**.
2. api §3 (şema + migration DB'ye uygulanır, `migrate status` temiz; `prisma generate` + `tsc -p tsconfig.build.json`) → **R7-2**.
3. e2ee-client §4.1-4.6 + testler (§9) → **R7-3**.
4. web §4.7-4.8 + metinler; web ↔ web üç tarayıcı denemesi.
5. mobil aynı yüzeyler; web ↔ telefon denemesi (dev build).
6. Parça B (§5) web + mobil; 4-5 ile paralel yürüyebilir, R7 dışı. Redmi ölçümü.
7. Cihaz turu (sahip) → bayrak `E2EE_IDENTITY` izin listesiyle canlı (E8 kalıbı: `E2EE_IDENTITY_USER_IDS`) → yayılım sorgusu → herkese açılış.

## §9 DoD
- §2.5, §3.3 testleri yeşil; e2ee-client testleri: geçiş (iki cihaz yarışı 409), sabitleme ve kimlik değişimi satırı, §4.3'ün dört dalı, üç imza yolu, sıfırlama, eski (`v: 1`) aktarım blobu.
- Saldırı simülasyonu (çekirdek/istemci testi): sunucu yanıtına imzasız sahte cihaz eklenir → MLS akışı sürer, satır "doğrulanmamış"; sunucu sahte kimlik koyar → "güvenlik kodu değişti" satırı, işaret düşer.
- Cihaz turu: (1) güncelleme sonrası geçiş, iki cihaz imzalı; (2) web'e giriş + yedek şifresi → karşı tarafta satır yok; (3) web'e giriş + "Hayır" → karşı tarafta "doğrulanmamış" satırı; ardından "Bu cihazı doğrula" → yeni satır yok; (4) iki hesapta kod aynı; işaretle, sıfırla, karşı tarafta "değişti" ve işaret düşmüş; (5) grup DM'de 3 kişi, biri yeni cihaz ekliyor; (6) eski sürüm telefon ile yeni web: kimliksiz kişi davranışı bugünkü gibi; (7) grup DM'de yerel arama: ayraç öncesi + sonrası sonuçlar birlikte, atlama çalışıyor, Türkçe karakter.
- Ölçüm §5.3 raporlandı. Tip denetimi web'de `vue-tsc -b` (bilinen 6 hata dışı yeni hata yok).
- Gizlilik metni (§7) herkese açılışla aynı deploy'da.

## §10 Açık sorular (sahip 2026-11-23: dördü de PM önerisiyle kabul)
1. **Sessiz kapı "Bu cihazı doğrula" (§4.5-3).** Kurul "yeni akış icat etme" dedi; bu yeni akış değil, E5b el sıkışmasının boş geçmişle çalışması. Gerekçe: E5a bandında "Hayır" diyen ya da yedeği hiç kurmamış kullanıcının web girişleri kişilerine "doğrulanmamış" görünür; bu kapı olmadan bunu düzeltmenin yolu yok. **Öneri: var, yalnız ayarlarda, bant yok.**
2. **Doğrulama işaretleri yalnız o cihazda.** Telefonda doğruladığın kişi web'de doğrulanmamış görünür. Yedeğe koymak mümkün ama E5a §4.2 içeriğini genişletir. **Öneri: ilk sürümde cihazda kalsın**; şikâyet gelirse yedeğe eklenir.
3. **Doğrulanmış rozeti.** Başlıkta/listede rozet yok, işaret yalnız kod ekranında. **Öneri: rozet yok** (kullanıcıyı boğma ilkesi; kurul tetiği ölçülene dek).
4. **Bilinen gürültü riski (kurul tetiği):** web çıkışı cihazı sildiği için yedek şifresi girmeyen kullanıcının her web girişi kişilerine bir "doğrulanmamış cihaz" satırı üretir. Yayından 1 ay sonra imzasız yeni cihaz oranı ölçülür (>%30 → kurul yeniden açılır). Ölçüm sorgusu sözleşmeye bağlı borç olarak PLAN'a yazılır.
