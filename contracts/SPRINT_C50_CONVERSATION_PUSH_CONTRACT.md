# SPRINT C50: Veri-yalnız mesaj bildirimi (WhatsApp tarzı sohbet bildirimi)

> Durum: **TASARIM KİLİTLİ (2026-11-09).** PM compose (Opus). Sahip isteği. **api + mobil** (web dokunulmaz).
> Yol haritasında **1a**: 1a bu sprint → 1c bildirimden hızlı cevap → 1b aramalar → E2EE.
> R7 dışı: alıcı kümesi bugünkü süzgeçlerden gelir, bu sprint kime bildirim gideceğine karar VERMEZ; auth/oturum kodu yok.
> Deneme (spike) sahip MIUI cihazında 4 durumda geçti: dal `spike/data-only-push` (8c24ed2, 50d62a3). Başlangıç noktası o dal.

## §0 Sorun ve karar

Bugün mesaj push'u Expo'ya `title`/`body` ile gidiyor. Uygulama kapalıyken bildirimi Firebase'in varsayılan yolu çiziyor ve biz görünüme karışamıyoruz. Sahip WhatsApp görünümünü istiyor: gönderen avatarı solda, uygulama logosu köşede rozet, aynı sohbetin mesajları alt alta, Android'in "Sohbetler" bölümü.

**Karar (sahip, 2026-11-09):**
1. Mesaj push'ları **veri-yalnız** gider. Telefonda bir arka plan JS görevi veriyi alır, küçük bir Kotlin modülü bildirimi `MessagingStyle` ile çizer.
2. **Kripto tek dilde kuralı (E2EE hazırlığı):** veri JS görevinden geçer, Kotlin yalnız çizer. E2EE geldiğinde şifre çözme JS görevine eklenecek, Kotlin değişmeyecek. Bu sprintte şifreleme YOK, ama Kotlin modülüne iş mantığı (metin üretme, kime gösterileceği kararı) KONMAZ.
3. Geri dönüş: eski uygulama sürümleri bugünkü biçimi almaya devam eder; sunucuda tek anahtarla herkes eski yola döner, mobil sürüm gerekmez.

**Kapsam:** DM mesajı (1-1 + grup), ortam kanalı mesajı, bahsetme (MENTION). Diğer tipler (kanka isteği, davet, etkinlik, tepki, yapay zeka video, gelen arama) **eski yolda kalır**.

## §1 Veri biçimi v2 (sözleşme)

Sunucu, v2 destekleyen cihaza üst düzeyde `title`/`body`/`channelId`/`richContent` **olmadan**, yalnız `data` + `priority: 'high'` gönderir. `data`:

```ts
// kind: 'message'
{
  v: 2,
  kind: 'message',
  type: 'DM_MESSAGE' | 'CHANNEL_MESSAGE' | 'MENTION', // yönlendirme için, resolvePushTarget ile aynı anlam
  conversationId: string,        // DM kanal id'si ya da ortam kanal id'si (bildirim anahtarı)
  guildId: string | null,
  messageId: string | null,
  senderId: string,
  senderName: string,
  senderAvatarUrl: string | null, // statik avatar, herkese açık cdn adresi
  isGroup: boolean,               // grup DM ve ortam kanalı true, 1-1 DM false
  conversationTitle: string | null, // 1-1: null · grup DM: grup adı · ortam: "#kanal · Ortam Adı"
  conversationIconUrl: string | null, // ortam: guild iconUrl · grup DM: null (Channel'da simge alanı yok) · 1-1: null
  text: string,                   // bugünkü gövdeyle aynı önizleme (bahsetme çözülmüş, ek varsa "📷 Görsel" vb.)
  timestamp: number,              // mesajın createdAt'i, ms
}

// kind: 'read' (başka cihazda okundu, §2.4)
{ v: 2, kind: 'read', conversationIds: string[] }
```

- **`channelId` anahtarı v2 `data`sında KULLANILMAZ** (expo-notifications onu Android bildirim kanalı sanıyor, D43 notu). Yerine `conversationId`.
- Ortam mesajında `text` bugünkü gibi `"kullanıcı: önizleme"` DEĞİL, yalnız önizleme. Gönderen adı `senderName`'den satırda zaten yazılıyor.
- Android'de Expo bu nesneyi `data.dataString` altında JSON metni olarak teslim ediyor (spike bulgusu, kütüphane kaynağından). İstemci savunmacı çözer (`dataString` → `body` → düz `data`).
- FCM 4 KB sınırı: `text` en çok 200 karakter (aşarsa `…`). Adlar ve adresler zaten kısa.

## §2 API

### §2.1 Şema
`PushToken`'a `format Int @default(1)`. Migration yaz, yerel DB'ye uygula, `prisma migrate status` temiz, `prisma generate`.

### §2.2 DTO
`CreatePushTokenDto`'ya isteğe bağlı `format?: 1 | 2` (`@IsOptional() @IsIn([1, 2])`, Swagger dahil). Verilmezse 1. `registerPushToken` upsert'ü alanı yazar (aynı token yeniden kaydolunca güncellenir; yeni sürüme geçen cihaz 2 olur).

### §2.3 Gönderim (`PushService`)
- `PushPayload`'a isteğe bağlı `v2?: V2MessageData` (§1 `kind: 'message'` nesnesi). Çağıran ikisini birden verir; `PushService` token başına seçer.
- Config: `PUSH_V2_ENABLED` (boolean, varsayılan **false**) + `PUSH_V2_USER_IDS` (virgüllü kullanıcı id listesi, isteğe bağlı). Kural: v2 gönderilir ⇔ `PUSH_V2_ENABLED === true` VE `token.format === 2` VE `v2` verilmiş VE (`PUSH_V2_USER_IDS` boş VEYA alıcı listede). Aksi halde bugünkü mesaj birebir aynı gider (regresyon güvencesi; mevcut spec'ler değişmeden geçmeli).
- v2 mesajı: `{ to, data: v2, priority: 'high' }` (+ varsa mevcut `ttl`). `title`/`body`/`channelId`/`categoryId`/`tag` YOK.
- Çağıranlar: `sendDmPush` (DM), ortam kanalı push'u (`messages.gateway.ts` ~1057), `NotificationsService` MENTION push'u. Üçü de §1 alanlarını doldurur. Grup DM adı/simgesi ve ortam adı/simgesi için gerekiyorsa tek ek sorgu (mevcut `channel.findUnique` select'ine alan ekle; yeni sorgu döngüsü açma).
- 1-1 DM'de bahsetme bugün DM push'undan çıkarılıp MENTION olarak gidiyor. v2'de ikisi de **aynı `conversationId`** taşıdığı için telefonda aynı sohbet bildirimine eklenir; bu bilinçli.

### §2.4 Başka cihazda okundu → bildirimi sil
Bugün `read:self` yalnız soketle gidiyor; uygulama kapalı telefonun çekmecesi temizlenmiyor (C20 sınırı).
- v2 mesaj push'u bir kullanıcıya bir kanal için gönderildiğinde Redis'e (mevcut `shared/redis/redis.service.ts`) işaret: `push:pending:{userId}:{conversationId}` (TTL 7 gün).
- `read:self` yayılan üç yerde (`channels.service.ts` iki yer, `dm.service.ts`) aynı anda: işareti olan kanallar için o kullanıcının **v2 tokenlarına** `{ v:2, kind:'read', conversationIds }` gönderilir, işaret silinir. İşaret yoksa push YOK (her okumada push atılmaz).
- "Tümünü okundu" (`channelIds`) yolunda işaretli olanlar tek mesajda, en çok 50 id.
- Okuyan cihazın kendisi de alır; zararsız (zaten silmiştir).
- Hata ana akışı bozmaz (`.catch` + log).

### §2.5 Testler
`push.service.spec.ts`: bayrak kapalı → v1; açık + format 2 → v2 gövdesi (üst düzey title/body yok); açık + format 1 → v1; allowlist dışı → v1; karışık tokenlar doğru ayrışır. Gateway/notifications spec'leri: üç çağıranın v2 alanları (1-1 `isGroup:false, conversationTitle:null`; grup DM; ortam başlığı `#kanal · Ortam`). Okundu: işaret varken bir push, yokken hiç, tümünü okundu tek mesaj.
DoD: ilgili spec'ler yeşil, `prisma generate` + `tsc -p tsconfig.build.json` temiz, `migrate status` temiz. Prod'a bayrak **kapalı** gider.

## §3 Mobil

### §3.1 Bağımlılık ve kayıt
- `expo-task-manager` (spike dalında eklendi, onaylı). Native → yeni derleme gerekir.
- Push token kaydında `format: 2` gönderilir (yalnız `conversation-notification` modülü yüklüyse; modül yoksa 1).
- Spike'taki `[spike-push] token` logu ve `__DEV__` dışı tüm spike logları KALDIRILIR. Teşhis logu kalacaksa `__DEV__` korumalı.

### §3.2 Arka plan görevi (`src/notifications/conversationPush.ts`)
Spike dosyası temel alınır, `dataOnlyPushSpike.ts` adı kalkar. Görev `index.js`'ten kök düzeyde kaydolur (headless açılışta tanımlı olsun, spike'taki gibi).
- `v !== 2` → hiçbir şey yapma (eski biçim zaten expo/Firebase yolundan gösteriliyor).
- `kind: 'message'`:
  - Uygulama ön plandaysa ve `conversationId` aktif sohbetse (mevcut `isActiveDm` mantığı: `useDmStore.activeDmChannelId` ya da `getActiveChannelId()`) → gösterme. 🔴 Görevin ön planda UI ile aynı JS çalışma ortamında koşup koşmadığını (store'lara erişim) cihazda doğrula. Erişemiyorsa DUR, PM'e bildir.
  - Aksi halde `showConversationNotification(...)`.
- `kind: 'read'` → her id için `dismissConversationNotification(id)`.
- Görev hata yutar, ana akışı bozmaz; ama çözülemeyen veriyi `__DEV__`'de loglar.

### §3.3 Kotlin modülü (`modules/conversation-notification`)
Spike modülü temel alınır. Değişiklikler:
- `setColor(#FF6B3D)` (app.json `expo-notifications.color` ile aynı; tek kaynak: değeri JS'ten parametre olarak ver ya da `app.json`'dan okunan kaynaktan al, iki yere elle yazma). Spike'ta bir kez gri rozet görüldü.
- "Ben" kişisinin adı JS'ten parametre (i18n `mobile.notifications.me`, `tr.json`'a eklenir). Kotlin'e Türkçe metin gömülmez.
- Kanal kimliği parametre: `push.ts`'teki `MESSAGE_CHANNEL_ID` **export edilir** ve o geçirilir (spike'taki `'messages_v6'` kopyası kalkar).
- Ekleme davranışı: aynı `conversationId`'nin görünen bildirimi varsa stili çıkarıp yeni mesaj eklenir (spike). Çekmecede en çok son 10 mesaj tutulur.
- 🔴 **Küçük hâlde son mesaj görünmeli** (WhatsApp davranışı). Sahip spike'ta küçük hâlde ilk mesajı gördüğünü bildirdi. Mesajların `timestamp` sırası ve `MessagingStyle` sırası kontrol edilip cihazda doğrulanır.
- Avatar/simge indirilemezse bildirim yine çıkar (spike davranışı korunur, 3 sn zaman aşımı).
- Uzun ömürlü kısayol + `setShortcutId` + `setLocusId` (spike). Kısayol sayısı sınırına (`getMaxShortcutCountPerActivity`) takılırsa en eskisi düşer; sohbet bildirimi kısayol olmadan da çıkar.
- Yeni fonksiyon `dismiss(conversationId)`: o bildirimi kaldırır.
- **Dokunma:** bildirim uygulamayı açar ve `{ type, conversationId, guildId, messageId }` JS'e ulaşır. Mekanizma serbest (intent extra + modül olayı + soğuk açılış için `getInitialTap()` gibi), şartlar: (a) yönlendirme mevcut `resolvePushTarget` ile yapılır (`channelId = conversationId` eşlenerek), yeni rota açılmaz; (b) soğuk açılışta mevcut `responseGate.ts` kapısından geçer (nav + oturum hazır olmadan push yapılmaz); (c) dokununca o bildirim kapanır.
- `PendingIntent` bayrakları Android 12+ kuralına uygun (`FLAG_IMMUTABLE`), her sohbete ayrı request code.

### §3.4 Mevcut yolla uyum
- `clearChannelNotifications(channelId)` (DM açılınca, `read:self` soketinde) artık **hem** expo bildirimlerini **hem** `dismissConversationNotification(channelId)`'i çağırır. Böylece uygulama açıkken okuma iki biçimde de temizler.
- `setNotificationHandler` değişmez (v1 ve diğer tipler için).
- Bayrak kapalıyken telefon v1 alır ve her şey bugünkü gibi çalışır. Bu, sürümün sunucudan önce çıkabilmesini sağlar.

### §3.5 Sürüm
versionCode 59. Release paketi canlı sunucuya karşı cihazda denenmeden Play'e gönderilmez ([[release-yapilandirmasi-sinanmali]]). Yerel derleme kısa yolda (worktree yolu Windows uzun yol sınırına takılıyor, spike bulgusu).

DoD: `npm run typecheck`, `npm run lint` temiz, yerel `gradlew` derlemesi geçer.

## §4 Açılış sırası (geri dönüşlü)
1. API prod'a gider, `PUSH_V2_ENABLED=false`. Hiçbir şey değişmez.
2. Mobil vc59 sahip telefonuna kurulur (release APK, canlı sunucu).
3. `PUSH_V2_ENABLED=true` + `PUSH_V2_USER_IDS=<sahip id>`. Sahip cihaz turu (§5).
4. İkinci marka cihazda tur (sahip bulur; bulunamazsa testçilerden biri, allowlist'e eklenir).
5. Play'e vc59 gönderilir. Yayılınca allowlist boşaltılır (herkese açılır).
6. Sorun olursa: `PUSH_V2_ENABLED=false` → herkes anında v1. Env değişikliği doğru dizinde yapılır ve `docker compose exec api printenv` ile teyit edilir; yeniden başlatma son deploy `IMAGE_TAG`'iyle.

## §5 Sahip cihaz turu (DoD, ajanlara cihaz testi verilmez)
Her biri için: 1-1 DM, grup DM, ortam kanalı, bahsetme.
- Uygulama açık (başka ekranda) / açık ve o sohbetin içinde (bildirim çıkmamalı) / arka plan / kaydırıp kapatılmış / yeniden başlatma sonrası.
- Avatar solda, logo köşede turuncu; grupta grup/ortam simgesi; ikinci mesaj alt alta; küçük hâlde son mesaj.
- Dokununca doğru sohbet açılıyor (soğuk açılış dahil).
- Web'de okuyunca kapalı telefondaki bildirim siliniyor.
- Bayrak kapatılınca bir sonraki mesaj eski biçimde geliyor.
- Ses ve titreşim bugünkü kanalla aynı.

## §6 Kapsam dışı
Hızlı cevap (1c), arama bildirimleri (1b), E2EE, iOS, web/masaüstü bildirimleri, diğer bildirim tipleri, hareketli avatar (statik kullanılır).

## §7 Bilinen riskler
- Tek cihazda doğrulandı (MIUI). Diğer üreticilerin pil yönetimi farklı olabilir; §4.4 bu yüzden var.
- Yeniden başlatma sonrası mesaj Google'ın push bağlantısı kurulana dek bekliyor (~30 sn). Bugünkü yolla aynı, kusur değil.
- Arka plan görevi her mesajda JS ortamını uyandırıyor; kapalı uygulamada ilk mesaj ~0,5 sn'de çizildi (spike). Kabul edilebilir.
