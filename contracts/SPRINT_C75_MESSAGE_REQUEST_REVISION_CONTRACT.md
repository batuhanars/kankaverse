# SPRINT C75: Mesaj isteği revizyonu (ilk mesajla doğan istek, anlık bildirim + push, şifreli önizleme)

> Durum: **AÇIK (2026-11-26).** PM compose (Opus). api + web + mobile. Desktop kabuğu değişmez (load-remote).
> **R7 kapsamında:** istek kapısı (`messages.service` C9 bloğu, `getMessageRequests` görünürlüğü) ve E2EE çözme yolu
> (`isEncryptableDm` genişlemesi) T&S/şifreleme karar bölgesi. Dev **commit ETMEZ**; diff sahibe sunulur, onaydan sonra commit.
> Önkoşul: C9 (Mesaj İstekleri), E1/E3 (DM E2EE + liste önizlemesi).

## §0 Sahip bulguları (2026-11-26, masaüstü + web, iki hesap)
1. "Mesaj at" basılınca, **mesaj yazılmadan** PENDING istek kanalı oluşuyor. Gönderende "Mesaj isteğin gönderildi" bandı
   sohbet kartının dışında, üst barın altında asılı duruyor (kötü görüntü). Mobilde gönderen tarafa hiç bant yok.
2. Alıcıda anlık hiçbir şey olmuyor: ne "Mesaj İstekleri" sayacı ne zil rozeti. Sayfa yenilenince istek beliriyor.
   Kök: `dm.request` olayı yalnız ilk MESAJDA yayılıyor (`messages.gateway.ts` C9 dalı), ama `getMessageRequests`
   mesajsız boş istekleri de listeliyor. İkisi tutarsız.
3. Bildirim listesine kayıt düşmüyor, push gitmiyor (C9'da bilinçli kapatılmıştı; sahip kararıyla açılıyor, §3).
4. İstek ekranında ilk mesaj "🔒 Şifreli mesaj" görünüyor. Kök: `useE2eeStore.isEncryptableDm` yalnız
   `dmStore.channels`taki kanallarda çalışıyor; PENDING kanallar alıcının DM listesine girmediği için motor istek
   mesajını hiç çözmüyor. Mobilde aynı.
5. İstek kabul edilince DM ekranı **boş açılıyor** (ilk mesaj görünmüyor). Kök henüz bulunmadı, §5'te teşhis şart.

Reddedince gönderene bildirim gitmemesi **doğru**, değişmez. Alıcı istek ekranı (Kabul / Reddet / Reddet ve Engelle) iyi, korunur.

## §1 Sahip kararları (2026-11-26)
- **K1, istek ilk mesajla doğar.** "Mesaj at" yalnız sohbet ekranını açar; alıcı hiçbir şey görmez. İlk mesaj gönderilince
  istek alıcıya görünür, bildirim + push gider. Kabule kadar gönderen başka mesaj yazamaz (sunucudaki tek-mesaj kuralı aynen).
- **K2, bildirimde içerik yok.** Push ve kalıcı bildirim yalnız "X sana mesaj isteği gönderdi." der. Yabancı içeriği
  kabul edilmeden bildirim yüzeyine basılmaz. İçerik yalnız istek ekranında görülür (§4, şifreliyse çözülerek).

## §2 api
### §2.1 Görünürlük (K1)
- `getMessageRequests`: yalnız **silinmemiş en az bir mesajı olan** PENDING kanalları döner (`messages: { some: { deletedAt: null } }`).
  Mesajsız PENDING kanal alıcıya görünmez. Kanal oluşturma (`openChannel`) **değişmez**: kanal yine "Mesaj at"ta
  oluşur (gönderen tarafı ve E2EE grubu bunun üstüne kurulu), yalnız alıcı tarafı ilk mesaja dek kör.
- Bugün duran mesajsız PENDING kanallar bu filtreyle kendiliğinden gizlenir; veri temizliği/migration YOK.

### §2.2 Kalıcı bildirim türü
- `NotificationType` enum'una `MESSAGE_REQUEST` eklenir (migration; `prisma generate` + `migrate status` temiz, DoD).
- Üretim yeri: istek sahibinin PENDING kanaldaki **ilk** mesajı başarıyla kaydedilince (`notifyDmActivity` PENDING dalı,
  mevcut `dm.request` yayınının yanında). `notifications.create(recipientId, { type: 'MESSAGE_REQUEST', actorId: requesterId, channelId })`.
  `preview` **verilmez** (K2).
- `NotificationDto.type` yorumu ve swagger enum'u güncellenir (sözleşme tek kaynak).

### §2.3 Push
- Kalıcı bildirimin mevcut push yolu (`toPushPayload`) kullanılır. Yeni dal: `case 'MESSAGE_REQUEST': body = \`${actor} sana mesaj isteği gönderdi.\``.
  `data: { type: 'MESSAGE_REQUEST', channelId }`. Android kanalı mevcut genel bildirim kanalı (FRIEND_REQUEST ile aynı).
  E2EE önizleme alanı EKLENMEZ.
- **Kötüye kullanım sınırı:** reddet → aynı kişi yeniden "Mesaj at" → yeni PENDING kanal → yeni push döngüsü tacizi
  büyütür. Kural: aynı `actorId → userId` çifti için son **24 saatte** `MESSAGE_REQUEST` bildirimi varsa yenisi
  **üretilmez** (kayıt da push da yok). `dm.request` soket olayı yine gider (istek kutusu güncel kalır). Sorgu
  `notification` tablosunda `(userId, actorId, type, createdAt)` üzerinden.

### §2.4 Bildirimi kapatma
- `markMessageRequestActioned(recipientId, channelId)`: o kanala ait okunmamış `MESSAGE_REQUEST` bildirimlerini okundu
  işaretler (`markFriendRequestActioned` deseni, silme değil). Çağrı yerleri: `acceptMessageRequest`,
  `rejectMessageRequest`, alıcının cevap yazmasıyla örtük kabul (`messages.service` C9 `else` dalı).

### §2.6 Rev.1 (2026-11-26): gönderene kabul olayı
- `acceptMessageRequest` başarıyla bitince istek sahibine (`dmRequesterId`) soket olayı: `dm.request_accepted` `{ channelId }`.
  Yalnız durum senkronu: kalıcı bildirim YOK, push YOK, zil YOK. Gerekçe: alıcı yalnız "Kabul Et"e basıp yazmazsa
  gönderenin kilitli kutusu başka hiçbir olayla açılmıyordu. Ret için olay YOK (§0, bilinçli).
- Örtük kabulde (alıcı cevap yazınca) olay gerekmez: gönderene zaten `dm.message` gidiyor, istemci onu ACCEPTED sayar.

### §2.7 Rev.3 (2026-11-26): alıcının diğer cihazlarında istek temizliği
Sahip bulgusu: masaüstünde reddedilen istek mobilde (ve tersi) istek ekranında kalıyor.
- Alıcı isteği çözünce **alıcının kendisine** (tüm soketleri: `emitToUser(userId, ...)`) `dm.request_resolved`
  `{ channelId, outcome: 'accepted' | 'rejected' }`. Çağrı yerleri: `acceptMessageRequest` (accepted),
  `rejectMessageRequest` (rejected, engelle dahil), `messages.service` C9 örtük kabul dalı (accepted).
- İstemci (web + mobil): `requests`ten o kanalı düşürür (sayaç dahil); `accepted` ise DM listesini tazeler
  (web `fetchChannels`, mobil `fetchAll`). İşlemi yapan cihazda zaten yerel olarak düşmüştür: işleyici idempotent.
- Bildirim/push YOK. İstek sahibine giden olaylar değişmez (§2.6).

### Rev.6 (2026-11-26): "görüldü", tek satır liste, cihazlar arası bildirim kaldırma
Sahip kararları (2026-11-26):
**(a) Listede tek satır.** Zil listesinde (web + mobil) tekil `MESSAGE_REQUEST` bildirim satırı GÖSTERİLMEZ; yalnız
"Mesaj istekleri (n)" kısayol satırı. Push/OS bildiriminin kendisi değişmez.
**(b) Görüldü.** İstekler sayfası açılınca istekler "görüldü" sayılır; zil rozeti ve kenar çubuğu "Mesaj İstekleri" sayacı
yalnız GÖRÜLMEMİŞ istekleri sayar. Sayfa başlığındaki sayı ve kısayol satırı toplam bekleyeni göstermeye devam eder.
- api: `User.messageRequestsSeenAt DateTime?` (migration). `POST /dm/requests/seen` (gövdesiz): `now` yazar; o kullanıcının
  okunmamış `MESSAGE_REQUEST` bildirimlerini okundu işaretler; kullanıcının kendi soketlerine `dm.requests_seen` `{ seenAt }`;
  bekleyen istek kanalları için §(c) okundu push'u.
- `GET /dm/requests` her öğeye `unseen: boolean` ekler: ilk mesajın zamanı `messageRequestsSeenAt`'ten sonraysa (ya da seenAt
  null ise) true. Öğenin `createdAt`'i değişmez.
- İstemci: sayfa açılınca (ve sayfa açıkken yeni istek gelince) `seen` çağrılır. `dm.requests_seen` gelince tüm öğeler
  `unseen=false`. Rozet = okunmamış bildirimler (MESSAGE_REQUEST hariç) + görülmemiş istek sayısı; kenar sayacı = görülmemiş.
**(c) Diğer cihazdan kaldırma.** İstek görülünce, kabul ya da ret edilince diğer cihazlardaki istek bildirimi kalkar.
- api: `MESSAGE_REQUEST` push'u gerçekten gönderildiğinde (bastırılmadıysa) mevcut v2 okundu işareti o (alıcı, kanal) için
  yazılır; `seen`, `acceptMessageRequest`, `rejectMessageRequest` ve örtük kabulde `push.notifyRead(alıcı, [kanal(lar)])`.
  Mevcut `kind:'read'` push'u kullanılır, yeni push türü yok.
- mobil: `read` push'u işlenirken mevcut konuşma bildirimi kaldırmaya EK olarak, sistemde gösterilen ve `data.channelId`'si
  listede olan bildirimler (FCM'in çizdiği istek bildirimi) de kaldırılır. Uygulama açıkken `dm.requests_seen` /
  `dm.request_resolved` gelince de aynı kaldırma.
- web/masaüstü: `dm.requests_seen` ve `dm.request_resolved` gelince ilgili kanal(lar)ın OS bildirimi kapanır
  (`closeOsNotificationsForChannel`; istek toast'u kanal kimliğiyle izlenir).
- Sınır: MIUI uygulamayı tamamen dondurduysa telefondaki bildirim bir sonraki açılışa kalabilir (DM'lerle aynı).

### Rev.7 (2026-11-26): istek başına "görüldü", liste görünümü, topluca reddet, mobil canlı liste + rail rozeti
Sahip bulguları: (1) mobil istek ekranı açıkken yeni istek ekrana düşmüyor; (2) masaüstü istek sayfası açık durduğu sürece
gelen her istek anında "görüldü" sayılıyor, diğer cihazlarda rozet hiç yanmıyor; (3) mobil rail'deki sohbet baloncuğunda
rozet hiç çıkmıyor. Sahip kararları: görüldü **sayfa açılınca değil, isteğin detayı açılınca** ve **istek başına** düşer;
"Tümünü reddet" gelir; **"Tümünü kabul et" YOK** (T&S: kabul ulaşımı açar, kişi kişi bilinçli verilir).

**(a) api: istek başına görüldü**
- `ChannelMember.requestSeenAt DateTime?` (migration). Alıcının o PENDING kanaldaki üyelik satırına yazılır.
- 🔴 **`lastReadAt`/`markRead` KULLANILMAZ:** o yol C12 `dm:seen` yayınını tetikler ve istek sahibi "görüldü" bilgisini
  alırdı. İsteğin açılıp açılmadığı karşı tarafa hiçbir yoldan sızmaz (R7). `requestSeenAt` yalnız alıcının kendi
  istemcilerine döner.
- `POST /dm/requests/:channelId/seen` (gövdesiz, data: null). Koşul: kabul/ret ile aynı alıcı kapısı
  (`requirePendingRequestForRecipient`: PENDING değilse 404, istek sahibi ya da üye değilse 403). İdempotent (zaten yazılıysa dokunmaz, olay yine gider). Yan etkiler: o kanalın okunmamış
  `MESSAGE_REQUEST` bildirimleri okundu (`markMessageRequestActioned`), kendi soketlerine `dm.request_seen` `{ channelId }`,
  `push.notifyRead(ben, [channelId])`.
- `GET /dm/requests` `unseen` kuralı: `requestSeenAt` null **ve** (`messageRequestsSeenAt` null ya da ilk mesaj ondan sonra).
- Eski `POST /dm/requests/seen` ve `dm.requests_seen` **kalır** (yayındaki eski mobil sürüm çağırıyor); yeni istemciler
  çağırmaz. Kaldırma ayrı turda.
- `POST /dm/requests/reject-batch` `{ channelIds: string[] }` (1..100, cuid). Yalnız **gönderilen kimlikler** reddedilir
  (onay anı ile işlem arasında gelen, kullanıcının görmediği istek etkilenmez). Her kimlik `rejectMessageRequest(…, block=false)`
  yolundan geçer (aynı jenerik ret, aynı `dm.request_resolved`, aynı bildirim/push kapatma); geçersiz/başkasının kimliği
  sessizce atlanır. data: `{ rejected: string[] }`. Engelle toplu YAPILMAZ.

**(b) web: `MessageRequestsView`**
- Sayfa açılışında `seen` çağrılmaz, ilk istek otomatik seçilmez. Sağda boş durum `messageRequests.selectHint`.
  `?channel=` ile gelindiyse o istek seçilir.
- Bir istek seçilince (tıklama ya da `?channel=`) o istek görülmemişse `POST /dm/requests/:id/seen`. Store: `markRequestSeen(id)`
  + `applyRequestSeen(id)` (`dm.request_seen` işleyicisi, idempotent). Sayfa açıkken gelen istek görülmemiş kalır.
- Satır görünümü: **seçili** = Kor sol kenarlık + yükseltilmiş zemin (DM listesiyle aynı dil); **görülmemiş** = kalın ad,
  birincil renkte önizleme, sağda Kor nokta; görülmüş = normal.
- Başlık: Kor rozet yalnız görülmemiş istek sayısını gösterir, hepsi görülünce kaybolur (sahip turu: gri kalan toplam sayı yanıltıcıydı).
- "Tümünü reddet" düğmesi başlıkta (istek ≥ 2 iken; tek istekte satırın kendi Reddet düğmesi yeter). `ConfirmDialog`: `messageRequests.rejectAllConfirmTitle/Message` ("{n}").
  Gönderilen kimlikler = onay anında listede görünenler. Sonuç toast `messageRequests.rejectedAll`.

**(c) mobile**
- **Canlı liste:** `dm-requests` listesi doğrudan store'daki `requests`ten okunur (yerel kopya kalkar); yeni istek anında düşer.
- Liste satırı sıkı: avatar, ad, tek satır önizleme, zaman, görülmemişse Kor nokta (web ile aynı işaret dili).
  Satıra dokununca yeni ekran `dm-request/[channelId]`: avatar + ad + zaman, mesajın tamamı, Kabul / Reddet /
  Reddet ve Engelle, gizlilik notu. Detay açılınca `markRequestSeen`. İstek başka cihazda çözülürse detay geri döner.
- Açılışta ve sayfa açıkken toplu `seen` çağrısı kalkar; `dm.request_seen` dinlenir.
- Bildirim/push `?channel=` ile gelirse doğrudan detay ekranı açılır.
- "Tümünü reddet": liste başlığında (istek ≥ 2), `ConfirmDialog`, aynı kurallar.
- **Rail rozeti:** sohbet baloncuğu rozeti = okunmamış DM + görülmemiş istek + bekleyen gelen kanka isteği. Bugün kod var
  (`GuildRail.tsx`, yalnız DM) ama sahip hiç görmüyor: dev önce kökü bulur (rozet çizimi mi, `unread`ın canlı güncellenmesi mi),
  bulgu TASK satırına yazılır.

**(d) i18n** tr.json: `messageRequests.selectHint`, `newCount`, `rejectAll`, `rejectAllConfirmTitle`, `rejectAllConfirmMessage`,
`rejectedAll`. Uzun çizgi yok.

**(e) Doğrulama** api spec: per-item seen (yetki, idempotent, `dm:seen` YAYILMAZ), `unseen` kuralı, reject-batch (yalnız
gönderilen + kendi istekleri). Cihaz turu: 3 istek → rozet 3 → her detayda bir azalır, diğer cihazda da; istek sayfası
açıkken gelen istek rozetini korur; mobil ekran açıkken istek anında düşer; tümünü reddet; rail rozeti DM / istek / kanka.

### Rev.5 (2026-11-26): uygulama açıkken istek bildirimi yok
Sahip kuralı: herhangi bir istemcide uygulama açıkken mesaj isteği sistem bildirimi üretmez. Masaüstü görünürken
(OS toast yalnız `document.hidden` iken) ve masaüstü aktifken telefona push gitmez (C76) zaten sağlanıyordu; telefon
ön plandayken masaüstü susuyordu (C76 K2). Eksik: telefon ön plandayken gelen istek push'u bildirim çekmecesine
düşüyordu. Mobil `setNotificationHandler`: `MESSAGE_REQUEST` ön planda banner/liste/ses yok. 24 sa push sınırı aynen.

### Rev.4 (2026-11-26): istek rozeti 24 saat sınırından bağımsız, mobil kısayol, şerit boşluğu
Sahip bulgusu: tekrarlanan isteklerde zil rozeti hiç çıkmıyor; masaüstü açılır listede yalnız "Mesaj istekleri (n)"
kısayolu var, mobilde o da yok. Kök: rozet = okunmamış bildirim sayısı; 24 sa sınırı yüzünden yeni MESSAGE_REQUEST kaydı
üretilmeyince bekleyen istek rozete hiç yansımıyor (§3.2 kararının boşluğu).
- **Rozet kuralı (web + mobil):** zil rozeti = okunmamış bildirimler (MESSAGE_REQUEST türü HARİÇ) + bekleyen gelen istek
  sayısı (`requestCount`). Böylece istek her durumda bir kez sayılır, çift sayım olmaz, 24 sa sınırı yalnız push/kaydı etkiler.
- **Mobil bildirim listesi:** web'deki "Mesaj istekleri (n)" kısayol satırının karşılığı listenin başında (istek varsa);
  dokununca `/dm-requests`.
- **Mobil şerit:** `composeHint` şeridi ile mesaj kutusu arasında boşluk (tema ölçüsünden, sabit sayı gömülmez).
- api değişmez.

### Rev.2 (2026-11-26): giden istek sohbeti boş açılıyordu
Sunucu PENDING kanalları DM listesinde döndürmez; web `fetchChannels` ve mobil `fetchAll` yerelde açılmış giden
bekleyen kanalı (mobilde kimliğini) sunucu cevabında yoksa korur; sunucu döndürürse onunki geçerli. Web dm store'u
oturum kullanıcısı değişince sıfırlanır (hesap değişiminde sızıntı yok).

### §2.5 Spec'ler
`getMessageRequests` (mesajsız kanal görünmez), bildirim üretimi (ilk mesajda bir kez, 24 sa sınırı), push gövdesi
(içeriksiz), actioned işaretleme. `tsc -p tsconfig.build.json` + ilgili jest.

## §3 web
### §3.1 Gönderen sohbeti (K1)
`DmView.vue`'daki üst bant **kaldırılır**. Durum `DmConversation` içinde, mesaj kutusunun bağlamında gösterilir:
- **Mesaj yokken** (PENDING + `requestOutgoing` + kanalda mesaj yok): mesaj kutusunun hemen üstünde şerit:
  `messageRequests.composeHint` = "Kankan değil. İlk mesajın bir mesaj isteği olarak gider; kabul edilene kadar yalnız bir mesaj gönderebilirsin."
- **İlk mesaj gönderildikten sonra**: son (kendi) mesajın altında küçük durum satırı `messageRequests.pendingStatus` =
  "İstek gönderildi · kabul bekleniyor". Mesaj kutusu **devre dışı**, yerinde `messageRequests.lockedComposer` =
  "Mesaj isteğin kabul edilince yazışmaya devam edebilirsin." (ek, GIF, emoji, sesli mesaj, YZ dahil hiçbir gönderim
  yolu açık kalmaz). Sunucunun `MESSAGE_REQUEST_PENDING` hatası yine yakalanır (yedek), ama artık kullanıcının yolu değil.
- Kabul gelince kilit **canlı** kalkar. Gönderene bildirim GİTMEZ. İki yol: alıcı cevap yazarsa `dm.message`
  (istemci karşı taraftan gelen mesajı ACCEPTED sayar); alıcı yalnız "Kabul Et"e basarsa `dm.request_accepted` (§2.6 Rev.1),
  dinleyici kanalın `requestStatus`'unu ACCEPTED yapar.
- Eski `messageRequests.sentBanner` anahtarı silinir.

### §3.2 Alıcı anlık güncelleme
- `notification` soketiyle gelen `MESSAGE_REQUEST` kaydı bildirim listesine düşer (mevcut akış).
  `NotificationBell` satır metni `notification.messageRequest` = "{actor} sana mesaj isteği gönderdi."; tıklama →
  `dm-requests` rotası (istek seçili açılır: `?channel=<id>` sorgusu, `MessageRequestsView` okur).
- Zil rozeti: bugün `unreadCount + requestCount`. `MESSAGE_REQUEST` bildirimi gelince aynı istek iki kez sayılır.
  Yeni kural: **rozet = `unreadCount`**. Açılır listedeki "Mesaj istekleri (n)" kısayol satırı kalır.
- `useNativeNotifications`: `MESSAGE_REQUEST` için masaüstü/OS bildirimi (FRIEND_REQUEST deseni), tıklama → `dm-requests`.
  `dm.request` soket dinleyicisi (`fetchRequests`) kalır: kenar çubuğu sayacı anlık güncellenir.

### §3.3 Şifreli istek önizlemesi (bulgu 4)
- `MessageRequestsView` seçili isteğin ilk mesajını **E2EE motoruyla çözer** (DM liste önizlemesindeki `prefetchPreview`
  yolu). Bunun için `isEncryptableDm`, alıcıya gelen PENDING istek kanallarını da kabul eder (`dmStore.requests`
  içindekiler). Çözme yerel işlemdir: okundu bilgisi göndermez, kabul sayılmaz.
- Çözülürse düz metin gösterilir; çözülemezse bugünkü "🔒 Şifreli mesaj" kalır (boş balon YOK). Ek varsa tür etiketi
  (📷/🎥/🎤/📎) mevcut `previewFromAttachments` mantığıyla.
- Liste satırı önizlemesi de aynı çözülmüş metni kullanır.

### §3.4 i18n
tr.json: `messageRequests.composeHint`, `messageRequests.pendingStatus`, `messageRequests.lockedComposer`,
`notification.messageRequest`. `sentBanner` silinir. Uzun çizgi yok.

## §4 mobile (parite)
- §3.1'in aynısı DM ekranında (mesaj yokken şerit, gönderince kilitli kutu + durum satırı). Bugün mobilde hiç bant yok.
- `notifications.tsx`: `MESSAGE_REQUEST` satırı (metin + tıklama → `/dm-requests`). `api/notifications.ts` türü.
- `pushNavigation.ts`: `case 'MESSAGE_REQUEST': return '/dm-requests'`.
- `dm-requests.tsx`: §3.3 şifreli önizleme çözümü mobil E2EE store'uyla (aynı kural: çözülemezse genel metin).
- Zil/sekme rozeti web'deki §3.2 kuralıyla aynı (çift sayım yok); dev mobilde rozetin nasıl hesaplandığını grep ile teyit eder.
- Native değişiklik **beklenmiyor** (kalıcı bildirim push'u mevcut yoldan çizilir). Native'e dokunma ihtiyacı çıkarsa dur, PM'e dön.
- tr.json yeni anahtarlar (mobil i18n kaynağıyla aynı metinler).

## §5 Kabul sonrası boş DM (bulgu 5), teşhis şart
- Yerelde iki hesapla yeniden üret: B, A'ya (kanka değil) şifreli ilk mesaj atar → A istek ekranından kabul eder →
  A'nın DM ekranında mesaj görünmeli. Bugün boş açılıyor.
- Kök neden bulunmadan düzeltme yazılmaz. Bakılacak yerler: kabul sonrası `dmStore.channels`'a eklenen kanal için
  E2EE `openChannel`/Welcome işleme sırası; `hydrateHistory`'nin "cihaz öncesi mesaj" elemesi (E5b Parça C);
  mesaj önbelleğinin istek ekranında boş listeyle doldurulup kabulden sonra yenilenmemesi.
- §3.3'ün istek ekranında Welcome'ı işlemesi bu sorunu çözebilir ya da değiştirebilir: düzeltme ikisi birlikte sınanır.
- Teşhis notu (kök + kanıt) TASK.md maddesine bir satır olarak yazılır.
- **Rev.1 durum (2026-11-26):** kod okumasıyla kanıtlı mekanizma: ilk çözme kabul anında yapılıyordu; çözme başarısızsa
  mesaj `undecryptable` olarak kalıcı yazılıyor ve `isBeforeDevice` ile gizleniyor (`hydrate.ts` `resolveOne(final)`,
  `historyVisibility.ts`, `web/src/stores/messages.ts`). §3.3 çözmeyi kabulden önceye taşıyor. Kesin kök cihaz turunda
  doğrulanır (§7 adım 3-4); boş açılış sürerse A'nın konsolunda `[e2ee]` logları + IndexedDB'de mesaj `status` alınır,
  ayrı R7 işi açılır. Bu sprintte ek düzeltme yok.

## §6 Kapsam dışı
Reddedilince gönderene bildirim (bilinçli yok). Gönderenin bekleyen giden isteklerini listeleyen ekran. İstek geri çekme.
Grup DM istekleri. İstek sayısı/gün sınırı (24 sa push sınırı dışında). İçerikli push.

## §7 Doğrulama
- api: `prisma generate`, `tsc -p tsconfig.build.json`, ilgili jest, `migrate status` temiz.
- web: `npx vue-tsc -b` (bilinen 6 hata dışında yeni yok), dokunulan dosyalarda eslint, `npx vite build`.
- mobile: `tsc`, dokunulan dosyalarda eslint.
- **Sahip cihaz turu** (iki hesap, biri masaüstü biri mobil, sonra ters):
  1. "Mesaj at" → alıcıda hiçbir şey yok. Gönderende şerit mesaj kutusunun üstünde.
  2. İlk mesaj → alıcıda kenar sayacı + zil rozeti anında, bildirim listesinde kayıt, masaüstü OS bildirimi / mobil push
     (içeriksiz). Gönderende kutu kilitli, mesajın altında "kabul bekleniyor".
  3. İstek ekranında şifreli mesaj düz metin görünür.
  4. Kabul → DM'de ilk mesaj görünür, gönderenin kilidi kalkar, iki taraf yazışır.
  5. Reddet → gönderene bildirim yok. Aynı kişi tekrar istek atar → istek kutusuna düşer ama 24 saat içinde push/kayıt yok.
