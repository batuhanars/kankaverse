# SPRINT E4: Şikâyette kanıt (şifreli DM dahil) + mesaj parmak izi (franking)

> Durum: **TASARIM KİLİTLİ (2026-11-11, sahip onayı; §7 açık sorular PM önerisiyle kabul). Rev.1 (aynı gün, api adımı PM incelemesi: erişim kapısı + ayrıntı ucu, §3.6). Rev.2 (aynı gün, sahip kararı: mobil şikâyet akışı, §4.1).** PM compose (Opus). **e2ee-core + e2ee-client + api + web + mobil.**
> Yol haritası: E0 ✅ → E1 ✅ → E3 ✅ → **E4 bu sprint** → E5 yedek → E2 grup DM → **yayın** → E7 → E8 (E6 medya ertelendi).
> 🔴 **R7 bölgesi, tamamı:** T&S karar fonksiyonları (şikâyet, kanıt, moderasyon görünümü) + E2EE yük biçimi.
> Dayanak: `SPRINT_E1_DM_E2EE_CONTRACT.md` (§1 ilkeler, §3.2 yük biçimi), sahip kararı 2026-11-05 (şikâyet modeli), sahip kararları 2026-11-11 (aşağıda).

## §0 Karar ve kapsam

**Sahip kararları:**
- 2026-11-05 (KAPALI, bir daha açılmaz): platform DM okumaz; şikâyet edilince şikâyet edilen mesajlar şikâyetçinin cihazından iletilir; sahtecilik parmak iziyle (franking) önlenir.
- 2026-11-11: (1) **kanıt saklama bütün mesaj şikâyetlerinde** (şifreli ve şifresiz); şemadaki "KURUL §0: içerik yakalanmaz" kuralı KALKAR. (2) **Saklama: şikâyet kapandıktan 90 gün sonra silinir.** (3) **Bağlam: şikâyet edilen mesaj + sohbetteki önceki 5 mesaj.**

**Bugünkü durum (kod teyitli):** `reports.service.ts` `contextSnapshot` yalnız referans tutar; moderasyon kuyruğu içerik göstermez; şifreli mesajda veritabanında yalnız şifreli yük var. Fail mesajı silerse kanıt kaybolur.

**Kapsam:** mesaj (MESSAGE) hedefli şikâyetler: ortam kanalı, 1-1 DM (şifreli/şifresiz), grup DM. Diğer hedefler (kullanıcı, ortam, profil) bugünkü gibi.
**Kapsam DIŞI:** medya kopyası (E6 ertelendi; ekler yalnız referans), grup DM şifrelemesi (E2; grup DM bugün şifresiz → sunucu yolu), kanıtın kolluğa aktarım süreci (hukuk), panic butonu (ayrı backlog).

## §1 İlkeler

1. **Sunucu şifreli DM'yi yalnız şikâyetle görür,** yalnız şikâyetçinin ilettiği mesajları, yalnız moderasyon için.
2. **Sahte kanıt üretilemez:** şifreli mesajın içeriği, gönderim anında sunucuya kaydedilen bir taahhütle (commitment) doğrulanır. Doğrulanamayan içerik "doğrulanmamış" etiketiyle saklanır, karar verilirken buna göre tartılır.
3. **Medya kopyalanmaz** (özellikle CSAM şikâyetinde: kopya tutmak başlı başına hukuki risk). Ek varsa kanıtta ek kimliği, türü, boyutu ve depolama anahtarı referansı tutulur.
4. **Kanıta erişim kaydedilir:** her görüntüleme denetim kaydına düşer (kim, ne zaman, hangi şikâyet).
5. **Süre dolunca silinir:** kapanıştan 90 gün sonra kanıt satırları kalıcı silinir (iş her gün çalışır).

## §2 Mesaj parmak izi (franking)

### §2.1 Yük biçimi v2 (E1 §3.2'nin devamı)
MLS uygulama mesajının düz içeriği: `{ "v": 2, "t": "text", "body": string, "sentAt": number, "fk": string }`
- `fk`: gönderen cihazın her mesaj için ürettiği 32 bayt rastgele **parmak izi anahtarı** (base64).
- **Taahhüt:** `tag = HMAC-SHA256(fk, canon)`; `canon` = UTF-8 JSON, anahtar sırası sabit: `{"c":channelId,"d":senderDeviceId,"b":body,"s":sentAt}`. Kanonik biçim çekirdekte TEK fonksiyon; istemci ve sunucu aynı test vektörleriyle sınanır.
- Gönderimde istemci `ciphertext` ile birlikte `frankingTag` (base64, 32 bayt) gönderir. Sunucu içeriği görmeden `tag`'i mesaj satırına yazar.
- Okuyan cihaz çözdüğünde `tag`'i yeniden hesaplar ve sunucunun mesajla birlikte döndürdüğü `frankingTag` ile karşılaştırır; uyuşmazsa mesaj **gösterilmez**, "Bu mesaj doğrulanamadı" (gönderenin sunucuya ve alıcıya farklı şey söylemesini engeller). Çözülen `fk` yerel depoda mesaj kaydıyla birlikte saklanır (şikâyette gerekir; E5 yedeğine de girer).
- HMAC/SHA-256 `@noble/hashes` (E1 §1.1: kripto kodu yazılmaz). Çekirdekte `frank(payload, channelId, deviceId)` ve `verifyFrank(...)`; testte bilinen vektörler.

### §2.2 Geçiş (eski istemciler)
- E1 §3.2: bilinmeyen `v` → "uygulamayı güncelle". v1 okuyabilen ama v2 okuyamayan istemci (Play vc66/vc67) v2 mesajı açamaz. Bu yüzden **iki aşama:**
  1. **Okuma:** web + mobil v2'yi okur ve doğrular (v1 de okunmaya devam eder). Mobil sürüm (vc68) Play'e çıkar.
  2. **Gönderme:** sunucu `GET /e2ee/status` yanıtına `franking: boolean` ekler (config `E2EE_FRANKING`, varsayılan false). İstemci yalnız `franking: true` iken v2 gönderir. Bayrak, izin listesindeki tüm cihazlar okuyabilir hale gelince açılır.
- v1 (parmak izsiz) mesajlar şikâyette "doğrulanmamış" etiketiyle iletilir.

## §3 API

Tüm uçlar envelope'lu, JWT korumalı.

### §3.1 Şema
```prisma
// Message'a:
frankingTag  Bytes?   // E4: şifreli mesajda gönderen taahhüdü (32 bayt); şifresizde null

model ReportEvidence {
  id             String   @id @default(cuid())
  reportId       String
  report         Report   @relation(fields: [reportId], references: [id], onDelete: Cascade)
  messageId      String   // referans (mesaj sonradan silinse de kanıt kalır)
  authorId       String?
  channelId      String
  content        String   // düz metin (şifrelide şikâyetçinin ilettiği; şifresizde sunucunun okuduğu)
  attachments    Json     // [{ id, contentType, size, storageKey }] — KOPYA YOK
  messageAt      DateTime // mesajın createdAt'i
  source         String   // 'server' | 'reporter'
  verified       Boolean  // server: true; reporter: parmak izi doğrulandıysa true
  isTarget       Boolean  // şikâyet edilen mesaj mı (bağlam değil)
  createdAt      DateTime @default(now())
  @@index([reportId])
}
```
`Report`'a `evidencePurgeAt DateTime?` (kapanışta `resolvedAt + 90 gün`). `contextSnapshot` minimal referans olarak kalır; şemadaki "KURUL §0" yorumu yeni kurala göre güncellenir. Migration + yerel DB + `migrate status` temiz + `prisma generate`.

### §3.2 Mesaj gönderme
`CreateMessageDto` + `frankingTag?: string` (base64, tam 32 bayt). Şifreli kanalda `ciphertext` ile birlikte isteğe bağlı (v1 istemci göndermez); şifresiz kanalda gelirse 422. Mesaj DTO'su şifreli mesajda `frankingTag`'i (varsa) döndürür (liste, soket, sabitlenenler, `dm.message` e2ee alanı, push `e2ee` alanı). Düzenlemede (`PATCH`) yeni `frankingTag` eskisinin yerine geçer.

### §3.3 Şikâyet oluşturma (`POST /reports`, mevcut uç)
`CreateReportDto` + `evidence?: [{ messageId, body, sentAt, fk? }]` (en çok 6 öğe; yalnız `targetType = MESSAGE`).
- **Şifresiz mesaj (ortam, şifresiz DM, grup DM):** `evidence` YOK SAYILIR. Sunucu şikâyet edilen mesajı ve aynı kanalda ondan önceki 5 mesajı (silinmemiş, `createdAt` sırasıyla) kendisi okur, `source: 'server'`, `verified: true`.
- **Şifreli mesaj:** sunucu `evidence`'i doğrular: her öğe aynı kanalda, şikâyetçi kanal üyesi, mesaj var ve şifreli, hedef mesaj listede. `fk` ve `frankingTag` varsa `HMAC(fk, canon)` mesajın kayıtlı `frankingTag`'iyle karşılaştırılır → `verified`. `canon`'daki `senderDeviceId` sunucunun kaydındaki değerdir (şikâyetçi değil). Uyuşmazsa ya da `fk`/`frankingTag` yoksa `verified: false`. Listede olmayan, başka kanala ait ya da şikâyetçinin erişemediği mesaj → 422 `REPORT_EVIDENCE_INVALID`. `evidence` hiç yoksa şikâyet yine oluşur (yalnız referans), moderatör "kanıt iletilmedi" görür.
- Ekler (her iki yol): `attachments` referans listesi; dosya kopyalanmaz.
- Rapor oluşturma bugünkü önceliklendirme (CSAM/MINOR_SAFETY P100 vb.) kurallarını değiştirmez.

### §3.4 Moderasyon
- `GET moderation/queue` (ve şikâyet ayrıntısı): kanıt satırları (`isTarget` önce, sonra zaman sırası), `verified` ve `source` ile. Her ayrıntı görüntülemesi denetim kaydına `EVIDENCE_VIEW` olarak yazılır (mevcut audit altyapısı; yeni tablo açılmaz).
- Şikâyet kapanınca (`resolvedAt` dolunca) `evidencePurgeAt = resolvedAt + 90 gün`.
- **Silme işi:** günde bir (`@Cron`), `evidencePurgeAt < now` olan raporların kanıt satırlarını siler. Sayısı loglanır, içerik ASLA loglanmaz.

### §3.5 Testler (api)
Şifresiz: hedef + önceki 5 sunucudan, `verified: true`; mesaj silinse de kanıt kalır. Şifreli: geçerli parmak izi → `verified: true`; değiştirilmiş `body` → `false`; başka kanalın mesajı → 422; üye olmayan şikâyetçi → mevcut yetki hatası; 7 öğe → 400. `frankingTag` uzunluk ve kanal kuralları. Moderasyon görüntülemesi audit yazar. Silme işi süresi dolanı siler, dolmayana dokunmaz. Kanonik biçim test vektörleri çekirdekle aynı. Mevcut reports/moderation spec'leri yeni kurala göre güncellenir (hangileri değişti listelenir).

### §3.6 Rev.1 (PM incelemesi, api adımı)
- **Erişim kapısı her MESSAGE şikâyetinde:** şikâyetçi hedef mesajın kanalına erişebilmeli (mevcut `requireChannelAccess`), hedef ve bağlam mesajları şikâyetçinin `clearedAt` sonrası olmalı; aksi 403/422 (mevcut kodlar). Şifresiz yolda bağlam sorgusu da bu kurala uyar (şikâyetçinin göremediği mesaj bağlama girmez). Gerekçe: tahmin edilen mesaj kimliğiyle başkalarının özel yazışmasını moderasyon kuyruğuna taşıma vektörü.
- **Kuyruk içeriksiz, ayrıntı ayrı uç:** `GET moderation/queue` kanıt İÇERİĞİ döndürmez, yalnız `evidenceCount` ve `hasUnverified`. Yeni `GET moderation/reports/:id` (ModeratorGuard) kanıtı döndürür; `AuditLog` `report.evidence_view` yalnız bu uçta yazılır (eylem adı mevcut kalıpla `report.evidence_view`).
- PATCH'te tag verilmezse eski tag silinir (yeni içerikle uyuşmaz) — onaylandı.

## §4 İstemciler (web + mobil)

- **Gönderme:** `franking: true` iken v2 yük + `frankingTag`. Düzenleme de v2.
- **Okuma:** v2 doğrulaması (§2.1); uyuşmazlıkta "Bu mesaj doğrulanamadı" (i18n). `fk` yerel kayda yazılır.
- **Şikâyet (şifreli DM'de bir mesaj):** mevcut şikâyet akışı; gönderimden önce yerel depodan hedef + aynı kanalda önceki 5 **çözülmüş** (`status: 'ok'`) mesaj toplanır (`body`, `sentAt`, `fk`). Şikâyet ekranında açık uyarı: "Şikâyet ettiğinde bu mesaj ve sohbetteki önceki 5 mesaj moderasyon ekibine iletilir." Şifresiz sohbette aynı uyarı (sunucu kendisi okur).
- **Moderasyon paneli (web):** kanıt bölümü: mesajlar, yazar, zaman, "doğrulandı / doğrulanmamış / sunucu kaydı" etiketi, ek referansı (önizleme YOK).
- Tüm metinler i18n (web `{'@'}` kaçışı).

### §4.1 Rev.2 (2026-11-11, sahip kararı): mobil şikâyet akışı
**Bulgu:** mobilde şikâyet akışı hiç yok. §4 "mevcut şikâyet akışı" derken mobilde de var sanıldı. Kök neden: mobil T&S pariteti (M4t) yalnız sahibin fark ettiği iki yüzeyi (kamera uyarısı + acil buton) taşıdı; webdeki şikâyet yüzeyleri hiç envantere girmedi. Bu Rev ile E4 kapsamına alınır, R7-3'e dahildir.

**Kapsam (yalnız `mobile/`; api ve web değişmez, `POST /reports` mevcut uç):**
- `src/api/reports.ts` (yeni): web `web/src/api/reports.ts` ile aynı tipler (`ReportTargetType`, `ReportReason`, `ReportEvidenceItem`, `CreateReportPayload`).
- `ReportSheet` (yeni bileşen): sebep seçimi (7 sebep) + isteğe bağlı açıklama + gönder; başarı/hata toast'ı. Web `ReportModal.vue` davranışı birebir. MESSAGE hedefinde §4 uyarı metni ("bu mesaj ve önceki 5 mesaj iletilir") şifreli ve şifresiz sohbette gösterilir.
- **Giriş noktaları (webdekilerin karşılığı):**
  1. Mesaj uzun basma menüsü (`MessageActionSheet`): "Şikâyet Et", yalnız başkasının mesajında. Şifreli DM'de gönderimden önce `collectEvidence` (e2ee-client, web'le aynı çağrı) ile hedef + önceki 5 `status: 'ok'` mesaj toplanır; şifresiz kanalda `evidence` gönderilmez (sunucu kendisi okur).
  2. DM profil paneli ve kullanıcı kartı: "Kullanıcıyı Şikâyet Et" (USER).
  3. DM listesi uzun basma menüsü: "Kullanıcıyı Şikâyet Et" (USER, karşı taraf).
  4. Ortam menüsü: "Ortamı Şikâyet Et" (GUILD), web C8 §5 karşılığı.
- Metinler: web `tr.json` `report.*` anahtarları yeniden kullanılır; mobilde eksik anahtar varsa mobil i18n'e aynı metinle eklenir, **yeni metin uydurulmaz**.
- Kendi mesajını / kendini şikâyet etme seçeneği gösterilmez (web'deki kural).

**Testler (mobil):** payload kurulumu (şifreli: `evidence` dolu, ≤6 öğe, hedef dahil; şifresiz: `evidence` yok); kendi mesajında menü öğesi yok; `collectEvidence` hata verirse şikâyet yine gider, `evidence` olmadan (web `ReportModal.vue` ile aynı; mağdurun şikâyeti yerel depo hatası yüzünden engellenmez), hata loglanır.

**DoD ek:** cihaz turunda şikâyet mobilden de yapılır (şifreli DM mesajı + şifresiz ortam mesajı + kullanıcı); moderasyon panelinde (web) kanıt "doğrulandı" görünür. Native diff yok, yeni dev build gerekmez (vc68 derlemesine biner).

## §5 Gizlilik metni (E4 ile yayına girer)
PM taslağı sahibe sunar, sahip onaylar. İçerik: (a) ortam dışı 1-1 DM metinleri uçtan uca şifreli; DM medyası şifreli değil (E6 ertelendi); (b) şikâyet edilen mesaj ve önceki 5 mesaj moderasyon için saklanır, kapanıştan 90 gün sonra silinir; (c) şifreli sohbette bu mesajları şikâyetçinin cihazı iletir, platform başka türlü okuyamaz; (d) web istemcisinin kodu sunucudan geldiği için web'de güvence mobilden zayıftır (E1 §4). Grup DM ifadesi E2 bitince güncellenir (yayın E2 sonrası).
**Hukuk notu (muhalif görüş, ölçülü):** KVKK dayanağı (meşru menfaat / hukuki yükümlülük) ve 90 günlük süre için yayından önce bir hukuk okuması önerilir; E4'ün kodunu ya da açılışını bekletmez.

## §6 Uygulama sırası
1. `shared/e2ee-core`: `frank` / `verifyFrank` + kanonik biçim + test vektörleri → **R7-1**
2. api (§3) + spec'ler → **R7-2**
3. e2ee-client + web + mobil okuma (v2 + doğrulama + `fk` saklama) + şikâyet akışı + moderasyon paneli → **R7-3**
4. Deploy (`E2EE_FRANKING=false`), vc68 Play. Play yayılınca bayrak açılır.
5. Gizlilik metni (§5) sahip onayıyla aynı deploy'da.

**Cihaz turu DoD (sahip):** iki hesap, şifreli DM: bayrak açıkken mesajlar normal okunur; bir mesajı şikâyet et → moderasyon panelinde hedef + önceki 5 mesaj "doğrulandı" etiketiyle; gönderen mesajı silse de kanıt panelde; şifresiz ortam mesajı şikâyeti → sunucu kaydıyla kanıt; kurcalanmış kanıt (test ucu ya da elle) "doğrulanmamış"; kapanıştan sonra `evidencePurgeAt` dolu.

## §7 Açık sorular (PM önerisiyle, sahip itiraz etmezse geçerli)
- **Şikâyetçinin kendi mesajları bağlamda:** önceki 5 mesaja şikâyetçinin kendi mesajları da girer (konuşmanın gidişatı için); kendi mesajlarının `fk`'si de yerel kayıtta var.
- **Grup DM (E2 sonrası):** aynı şifreli yol; E2 sözleşmesi bu bölüme bağlanır.
- **Moderatör kimdir:** bugünkü moderasyon yetkisi (platform moderatörü); ortam moderatörleri şifreli DM kanıtını GÖRMEZ (DM şikâyetleri platform kuyruğunda).
