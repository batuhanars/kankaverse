# SPRINT E2: Grup DM uçtan uca şifreleme (metin)

> Durum: **TASLAK (2026-11-13), PM compose (Opus).** api + shared/e2ee-client + web + mobil.
> Yol haritası (sahip, 2026-11-12): E5b ✅ → **E2 bu sprint** → E8 aramalar → E7 güvenlik kodu + yerel arama. E6 ertelenmiş.
> 🔴 **R7 bölgesi, tamamı** (grup üyelik kapıları + E2EE). Hiçbir parça sahibin satır satır incelemesi olmadan main'e girmez.
> Temel: E1 sözleşmesi (`SPRINT_E1_DM_E2EE_CONTRACT.md`) ve sonraki revizyonları aynen geçerli; bu belge yalnız FARKI yazar.

## §0 Karar ve kapsam

**Sahip kararları:** ortam dışı tüm DM'ler (grup dahil) E2EE (2026-11-05); grup DM yayında şifreli (2026-11-11); cihaz/üye öncesi şifreli mesaj sohbette hiç görünmez, grup için bunu **sunucu** uygular (2026-11-12, PLAN R4); E2'de "yeni cihaz eklendi" uyarısı sohbette görünür (2026-11-12, E7'ye kadar sunucuya güvenmenin bedeline karşı). **Cihazsız üye (2026-11-13):** grup, cihazı olan üyelerle şifrelenir; cihazsız üye cihaz kaydedince gruba eklenir, öncesini görmez.

**Kapsam:** `GROUP_DM` kanallarında mesaj metni; üye ekleme / ayrılma / çıkarma ile MLS grubunun eşitlenmesi; yeni üyeye katılım öncesi şifreli mesajın sunucuda süzülmesi; "yeni cihaz eklendi" satırı (1-1 ve grup); yedek (E5a), aktarım (E5b), şikâyet (E4), push (E1/E3) yollarının grup kanallarını kapsaması.

**Kapsam DIŞI:** grup araması şifreleme (E8), güvenlik kodu (E7), medya (E6), grup adı / üye listesi / tepki gibi üst veriler (düz kalır, sunucu görür; gizlilik metni zaten "mesaj içeriği" der, dev metni grep ile teyit eder, gerekirse PM'e bildirir). Bahsetmeler: **Rev.2 §4.2'ye bakın** (kimlik listesi düz üst veri).

## §1 İlkeler (E1 §1'e ek)
1. **Grup = kanal.** 1 `GROUP_DM` kanalı = 1 MLS grubu, yapraklar cihazlar (E1 ile aynı model). Yeni tablo yalnız eski üye kaydı için (§2.1).
2. **Çıkarma eklemeden önce, gönderimden önce.** Ayrılan/çıkarılan üyenin cihazı gruptayken yeni mesaj şifrelenmez (§3.2).
3. **Sunucu kim olduğunu bilir, ne dediğini bilmez.** Üyelik, katılım zamanı, kimin hangi cihazı sunucuda; içerik değil.

## §2 API

### §2.1 Şema
```prisma
model E2eeFormerMember {
  id        String   @id @default(cuid())
  channelId String
  userId    String
  leftAt    DateTime @default(now())
  @@unique([channelId, userId])
  @@index([channelId])
}
```
- Kayıt yalnız kanalda `E2eeGroup` varsa yazılır: ayrılma, çıkarma ve hesap silme yollarında, `ChannelMember` silen **aynı transaction** içinde (upsert; tekrar ayrılmada `leftAt` güncellenir).
- Aynı kullanıcı yeniden eklenince satır **silinir** (artık üye).
- Katılım zamanı = mevcut `ChannelMember.createdAt` (yeniden eklenen üyenin satırı yeni olduğu için doğru). Yeni alan yok.
- Migration yaz, yerel DB'ye uygula, `migrate status` temiz, `prisma generate`.

### §2.2 Uygunluk (E1 §2.2 yerine, grup için)
- **Kanal şifreli olabilir ⇔** tip `DM` veya `GROUP_DM`; **tüm üyeler** bayrak açısından uygun (`E2EE_USER_IDS`); 1-1'de iki üyenin de, grupta **gönderen dahil en az iki üyenin** etkin cihazı ve tüketilebilir KeyPackage'ı var (sahip kararı §0).
- `E2eeChannelService.requireDmMembers` / `assertAllEligible` buna göre genelleşir; 1-1 davranışı DEĞİŞMEZ (mevcut spec'ler yeşil kalır).
- **Şifreli gruba üye ekleme:** hedef bayrak açısından uygun değilse `addGroupMember` 422 `E2EE_MEMBER_NOT_ELIGIBLE` ("Bu kişi şifreli sohbetlere henüz katılamıyor."). Yalnız izin listesi döneminde anlamlı; liste boşken (herkese açık) hiç tetiklenmez. Hedefin cihazı olmaması engel DEĞİL (§0).

### §2.3 Kanal durumu
`GET /e2ee/channels/:channelId` dönüşüne eklenir:
```jsonc
{ ..., "formerMembers": [{ "userId", "leftAt", "devices": [{ "deviceId", "signatureKey", "revokedAt" }] }] }
```
- `formerMembers` = kanalın `E2eeFormerMember` kayıtları + o kullanıcıların kayıtlı TÜM cihazları. 1-1'de hep `[]`.
- Neden: eski üyenin yaprakları hâlâ gruptayken doğrulama onları tanımalı (yoksa "tanınmayan cihaz" sahte alarmı), ve çıkarma planı onları bulmalı.
- `members[].joinedAt` (ISO, `ChannelMember.createdAt`) eklenir; istemci "yeni cihaz eklendi" satırında üye/cihaz ayrımı için kullanır (§3.3).

### §2.4 Üyelik değişince
`dm.service.ts` grup yollarında, kanalda `E2eeGroup` varsa:
- **Ekleme** (`addGroupMember`): `e2ee:devices-changed { channelId, userId: hedef }` kanal odasına (commit sonrası). Çevrimiçi bir üye cihaz eksik cihazları ekler (E1 §2.4 mekanizması, değişmez).
- **Ayrılma / çıkarma** (`leaveGroupDm`, `removeGroupMember`; kanal silinmiyorsa): `E2eeFormerMember` upsert + o kullanıcının cihazlarına bu kanal için bekleyen `E2eeWelcome`'lar silinir (aynı transaction) + commit sonrası `e2ee:devices-changed { channelId, userId }`.
- 🔴 **Soket odası:** çıkan/çıkarılan kullanıcının tüm soketleri kanal odasından **hemen** çıkarılır (yoksa bir sonraki `message.created` şifreli yükünü alır ve henüz eski epoch'u bildiği için çözebilir). Bugün ne yapıldığını dev önce koddan teyit eder; eksikse `RealtimeService`'e oda çıkarma eklenir. Test zorunlu.
- **Kanal silinirse** (kalan < 2 ya da kurucu siler): E2EE satırlarına dokunulmaz (kanal yumuşak silinir, bugünkü gibi).
- `e2ee-notify.service.ts devicesChanged`: `type: 'DM'` süzgeci `in: ['DM', 'GROUP_DM']` olur (kullanıcının yeni/iptal cihazı gruplarına da yayılır).

### §2.5 Katılım öncesi süzgeç (sunucu, grup)
Bir kullanıcıya dönen her yüzeyde, `GROUP_DM`'de `encrypted = true` VE `createdAt < o kullanıcının ChannelMember.createdAt` olan mesaj **yoktur**:
- mesaj listesi (sayfalama dahil), tek mesaj / yanıt alıntısı, DM listesi `lastMessage`, okunmamış sayısı / rozet, push, sabitlenenler, `message.created` yayını (zaten katılım sonrası).
- Düz (şifreleme öncesi) eski mesajlar bugünkü gibi kalır.
- Uygulama tek yardımcıda (`clearedAt` süzgecinin yanında, aynı kalıp); dev tüm yüzeyleri grep ile listeler, rapor eder.

### §2.6 Mesaj
E1 §2.5 aynen. Gönderen kanal üyesi değilse bugünkü üyelik kapısı (403) zaten reddeder. Ek kural yok.

### §2.7 Push
Şifreli grup mesajında push metni E1 §2.7 kuralı (sabit "🔒 Yeni mesaj"), başlık grup adı + gönderen bugünkü gibi (C50 grup biçimi). E3 şifreli önizleme bayrağı kapalı; açıldığında grup da aynı yoldan geçer, ek iş yok (dev teyit eder).

### §2.8 Testler (api)
Grup şifreli kurulur (3 üye, biri cihazsız → kurulur; yalnız gönderen cihazlı → 422); izin listesi dışı üye varken 422; şifreli gruba uygun olmayan üye eklenemez (422), cihazsız ama uygun üye eklenir; ayrılma/çıkarma `E2eeFormerMember` yazar, bekleyen Welcome siler, olay yayar, soketi odadan çıkarır; yeniden ekleme kaydı siler; `formerMembers` durumda döner, 1-1'de `[]`; eski üye `/e2ee/channels/:id/*` çağıramaz (403); katılım öncesi şifreli mesaj listede/`lastMessage`'ta/okunmamışta yok, düz eski mesaj var; 1-1 spec'leri değişmeden geçer.
DoD: spec'ler yeşil, `prisma generate` + `tsc -p tsconfig.build.json` temiz, `migrate status` temiz.

## §3 İstemci motoru (`shared/e2ee-client`) + web + mobil

### §3.1 Kapı
`isOneToOneDm` kapıları (web `stores/e2ee.ts`, mobil `stores/e2ee.ts`) ve yedek/aktarım süzgeçleri (`e2eeBackup.ts`, `e2eeTransfer.ts`, iki istemci) `DM` + `GROUP_DM` olur. E4 şikâyet akışının grup mesajında da çalıştığı teyit edilir (franking kanal tipinden bağımsız olmalı).

### §3.2 Kayıt ve çıkarma
- `registry.ts devicesOf`: `formerMembers` cihazları `registered` listesine girer (doğrulama tanısın), `active`'e GİRMEZ; yeni alan `former: Map<deviceId, leftAtMs>`.
- `reconcile.ts plan`: `remove` = gruptaki yapraklardan iptal edilmiş **veya eski üyeye ait** olanlar (kendi cihazı hariç). Sıra değişmez: önce çıkar, sonra ekle.
- 🔴 **Gönderim kapısı:** `groupForSend` şifrelemeden önce senkronu çalıştırır; plan sonrası `remove` boş değilse (çıkarma commit'i kabul edilemedi) mesaj gönderilmez, `GroupNotReadyError` ("Sohbet şifreleniyor...") döner. Eski üyeye yeni mesaj sızmaz.
- Eski üye cihazından gelen ve `createdAt >= leftAt` olan mesaj gösterilmez (E1 §6.2 iptal kuralının aynısı); öncekiler kalır.
- `groupCreate.ts`: `everyMemberHasDevice` / `otherMembersCovered` grupta "gönderen + en az bir üye daha" olur (§2.2); 1-1'de bugünkü kural.

### §3.3 "Yeni cihaz eklendi" satırı (1-1 + grup)
- Bu cihaz bir commit işlediğinde (kendi gönderdiği değil), commit **başka bir kullanıcının, o kullanıcının zaten üye olduğu sırada** yeni bir cihazını ekliyorsa sohbete gri bilgi satırı düşer: **"{ad} yeni bir cihaz ekledi"**. Zaman = commit zamanı.
- Yeni üyenin ilk cihazları satır üretmez (üye ekleme zaten görünür). Kendi yeni cihazım satır üretmez (E5b aktarım bildirimi var). Cihaz çıkarma satır üretmez.
- Ayırt etme: eklenen cihazın sahibinin `joinedAt`'i commit'ten önce VE o kullanıcının bu grupta zaten yaprağı vardı ya da daha önce vardı → satır.
- Satırlar yerel depoda tutulur (mesaj değildir, sunucuya gitmez, yedeğe girmez). Metin i18n'de (iki istemci). Web ve mobil aynı yardımcıyı `shared/e2ee-client`'tan kullanır.

### §3.4 Görünüm
Grup başlığında kilit, ayraç, "çözülemedi", "güncelle" metinleri 1-1 ile aynı bileşenler. Yeni üye şifreli bölümü boş görür (sunucu süzer, §2.5). Gruptan çıkarılan kullanıcının cihazında bugünkü "Bu cihaz bu sohbetten çıkarıldı" uyarısı yerine grup zaten listeden düştüğü için ek iş yok (dev teyit eder).

### §3.5 Testler (çekirdek/istemci, vitest)
3 kullanıcı × 2 cihaz grup kurma; cihazsız üye sonradan eklenir, öncesini çözemez; üye çıkarma: eski üyenin yaprakları tanınır (sahte alarm yok), çıkarılır, sonraki mesajı çözemez; gönderim kapısı (çıkarma commit'i 409 sürerken gönderim engellenir); "yeni cihaz eklendi" yalnız §3.3 koşulunda; 1-1 testleri değişmeden yeşil.
**Ölçüm:** 10 kullanıcı × 2 cihaz (20 yaprak) grup kurma + katılma süresi, Node'da ve sahip telefonunda (dev build). Hedef telefonda kurma < 3 sn, katılma < 2 sn. Aşılırsa dev DURUR, bildirir. Welcome / commit boyutu DTO sınırına karşı ölçülür, raporlanır.

## §4 Uygulama sırası ve teslim
1. api (§2) + spec'ler → **R7 incelemesi 1** (özellikle `dm.service.ts` grup yolları, soket odası, §2.5 süzgeci).
2. `shared/e2ee-client` (§3.2-3.3) + web (§3.1, §3.4) + testler → web ↔ web üç tarayıcı denemesi → **R7 incelemesi 2**.
3. mobil (§3) → yerel derleme (native değişmiyor; yalnız JS, ama versionCode 73 AAB'si için proje içi derleme kuralı geçerli) → **R7 incelemesi 3**.
4. Push + deploy + migration teyidi (`migrate status`, disk, yeni uç 401) → cihaz turu.

**Cihaz turu DoD (sahip; hesaplar Kaan, Okan, Sena; web + Opera + Redmi):**
1. Üç kişilik grupta ilk mesaj: grup kurulur, ayraç çıkar, tüm cihazlar çözer.
2. Dördüncü kişi (izin listesinde, cihazlı) eklenir: şifreli eski mesajları görmez, yeni mesajı çözer; listede önizleme ve okunmamış doğru.
3. Bir üye çıkarılır: çıkarılan cihazda yeni mesaj gelmez; kalanlarda "tanınmayan cihaz" bandı ÇIKMAZ; çıkarmadan sonraki mesaj çözülür.
4. Çıkarılan üye yeniden eklenir: aradaki şifreli mesajları görmez, sonrakini çözer.
5. Bir üye yeni tarayıcıda giriş yapar: diğerlerinde "{ad} yeni bir cihaz ekledi" satırı bir kez görünür.
6. Grupta mesaj şikâyeti: admin panelinde Doğrulandı (E4).
7. Yedek al + yeni cihazda geri yükle: grup mesajları da gelir (E5a); cihazdan cihaza aktarımda da (E5b).
8. 1-1 DM'de davranış değişmedi (gönder, al, şikâyet).
9. Log taraması temiz (yeni hata kodu dışında 5xx yok).

## §4.1 Rev.1 (2026-11-13, adım 1 bulguları)
- **Hesap silme** `ChannelMember` silmiyor (anonimleştirir, cihazları iptal eder). §2.1'deki "hesap silme yolu" maddesi düşer; silinen kullanıcının yaprakları "iptal edilmiş" olarak zaten çıkarılır.
- **Soket odasından çıkarma** yalnız şifreli grupta değil, TÜM `GROUP_DM` ayrılma/çıkarmalarında yapılır: düz grupta da çıkarılan üye bağlantısı kopana dek mesaj alıyordu (mevcut açık kapandı).
- **`message.updated` (R7):** GROUP_DM'de şifreli mesajın düzenleme yayını odaya değil, katılımı mesajdan önce olan üyelerin kişisel odalarına gider. Neden: düzenleme şimdiki epoch'la yeniden şifrelenir, yeni üye çözebilirdi.
- **Bilinen sınırlar (kabul):** `message.created` yanıt alıntısında katılım öncesi şifreli mesajın yazar adı görünebilir (içerik yok); id tahminiyle şikâyet/tepki kapıları katılıma bakmaz (cuid, listeden görünmez); kriptografik çıkarma istemciye bağlı, sunucu yalnız iletmemeyi garanti eder.
- **Borçlar (PLAN):** grup okundu bilgisi üyelik değişince yeniden hesaplanmıyor; çıkarılan üye `voice:` odasında kalıyor (E8'de); `E2eeFormerMember` temizliği yok; hesap silmede `devices-changed` yayını yok (E1'den).

## §4.2 Rev.2 (2026-11-13, adım 2 bulguları)
- **Bahsetme (sahip kararı):** şifreli mesajda bahsedilen kullanıcı kimlikleri **düz üst veri** olarak gider (`mentionUserIds?: string[]`, yalnız şifreli gönderim/düzenlemede; içerik şifreli kalır). Sunucu her kimliğin kanal üyesi olduğunu doğrular (değilse sessizce atar), gönderenin kendisini atar, en çok 20; sonra bugünkü bahsetme yolu (zil kaydı + "senden bahsetti" push) aynen çalışır. Şifresiz mesajda alan gelirse 422 (sunucu içerikten çıkarır, bugünkü gibi). İstemci listeyi gönderdiği düz metindeki `<@id>` token'larından üretir. 1-1 DM'de de gönderilebilir, etkisi bugünkü 1-1 kuralı. §0'daki "`mentions = []`" maddesinin yerine geçer. Bilinen bedel: sunucu içeriği değil, "kim anıldı" bilgisini görür; kurcalanmış istemci metinde anmadığı bir grup üyesine etiket bildirimi gönderebilir (yalnız üyelere, mevcut kapılarla); mevcut anti-spam sınırıyla en çok 10 kişiye bildirim. **GEÇİCİ (sahip, 2026-11-13):** E3 Rev.2 (bildirimde cihazda çözme) gelince liste şifreli içeriğe taşınır, bildirim kararı cihazda verilir (WhatsApp modeli), düz alan kalkar.
- **Gizlilik metni (sahip onaylı, 2026-11-13):** E4 §5.1 metnine herkese açılışla aynı deploy'da eklenir: "Şifreleme mesajın içeriğini korur. Kimlerle konuştuğun, mesajın zamanı, grup adı ve üyeleri, tepkiler ve bir mesajda kimden bahsedildiği gibi bilgiler hizmetin çalışması için sunucuda kalır."
- **Sapmalar kabul:** (a) "yeni cihaz eklendi" satırı commit'i gönderen cihazda da çıkar (yoksa 1-1'de ekleyen taraf hiç görmezdi); (b) grup kurulurken üye olan ama cihazı olmayan kullanıcının ilk cihazı da satır üretir (sahte cihaz sessiz geçmesin); (c) gönderim kapısı 1-1'i de kapsar (iptal yaprağı çıkarılmadan gönderim yok); (d) claim ve Welcome sunucuda 20 ile sınırlı, istemci 20'lik parçalarla ekler.
- **Satır zamanı:** commit listesi `createdAt` döner; "yeni cihaz eklendi" satırı sunucu zamanıyla yerleşir.
- **Bilinen sınırlar:** yeni üye kanala katıldığı an ile MLS grubuna eklendiği an arasındaki (saniyeler; KeyPackage'ı yoksa daha uzun) mesajları görmez. Satır geçmişi yerel, yeni girişte sıfırlanır.

## §5 Açık sorular (PM önerisiyle, sahip itiraz etmezse geçerli)
- **Grup boyutu:** üye sınırı 10, cihaz sınırı kullanıcı başı 10 → en çok 100 yaprak. Ölçüm 20 yaprakla; 100 yaprak teorik, gerçek kullanımda beklenmez. Ölçüm kötü çıkarsa cihaz sınırı tartışılır.
- **Grup kurucusu/yönetici yetkisi** MLS'e taşınmaz: kim ekleyip çıkarabileceği bugünkü gibi sunucuda (`canModerateGroupTarget`); MLS commit'ini herhangi bir üye cihaz gönderir. Bilinen sınır: kötü niyetli sunucu sahte üye ekleyebilir; azaltma §3.3 satırı, tam çözüm E7.
