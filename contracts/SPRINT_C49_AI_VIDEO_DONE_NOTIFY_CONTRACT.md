# SPRINT C49: Yapay zeka video bitince bildirim

> Durum: **TASARIM KİLİTLİ (2026-11-08).** PM compose (Opus). Sahip isteği. **api + web + mobil**.
> R7 dışı (auth/T&S karar fonksiyonu yok; yapay zeka video zaten yalnız hak sahibi yetişkine açık, bu sprint erişim kararı vermez).

## §0 Sorun ve karar
Kullanıcı üretimi başlatıp formu kapatınca video bittiğinde hiçbir haber almıyor. Sonucu görmek için formu kendisi yeniden açmak zorunda.

**Sahip kararları (2026-11-08):**
1. Üretim **arka planda** bitince kullanıcıya bildirim gider: çan kaydı + soket + push (mevcut `NotificationsService.create` yolu).
2. Başarısız olursa da bildirim gider, kredinin düşülmediği yazılır (`sumSpentMicro` FAILED'ı saymaz, yani bu doğru).
3. Bildirime tıklayınca **yapay zeka video sayfası o sonuç açık** gelir. Sohbet bağlamı olmadığı için yeni `view` kipi: izle + kaydet (indir), gönder/kullan yok.

## §1 API

### §1.1 Şema
- `NotificationType` enum'una `AI_VIDEO_READY`, `AI_VIDEO_FAILED`.
- `Notification` modeline `aiVideoId String?` (ilişki ŞART DEĞİL; eklenirse `onDelete: SetNull`). Migration yaz ve yerel DB'ye uygula, `prisma migrate status` temiz, `prisma generate` koş.

### §1.2 DTO
`NotificationDto`'ya `aiVideoId: string | null` (Swagger dahil). `toNotificationDto` ve `toNotificationDtos` ikisi de doldurur. `CreateNotificationData`'ya `aiVideoId?`.
`create()` ve `createMany()` insert'leri alanı yazar.

### §1.3 Tetik (tam bir kez, yalnız arka plan geçişi)
Bildirim yalnız satır **QUEUED/RUNNING'den terminal duruma arka planda** geçtiğinde üretilir:
- `AiVideoPoller.downloadAndStore` başarı yolu (COMPLETED yazıldıktan SONRA) → `AI_VIDEO_READY`.
- `AiVideoPoller.fail()` → `AI_VIDEO_FAILED`.
- Kurtarma (`AiVideoRecoveryService`) satırı COMPLETED yapmaz, `RUNNING + DOWNLOAD_PENDING`e alır; READY indirme bitince poller başarı yolundan gider (Revize 2026-11-08, dev bulgusu: recovery anında atmak erken + çift READY üretirdi). Önceki FAILED bildirimi silinmez.
- Oluşturma çağrısı içindeki senkron hatalar (`ai-video.service.ts` `markFailed`, oluşturmada FAILED yazılan yol) bildirim ÜRETMEZ: kullanıcı o an formda, hatayı yanıtta görüyor.
- Satır silinmişse (`deletedAt` dolu / `isGone`) bildirim yok.
- Aynı satır için ikinci kez aynı tip üretilmez (poller tekrar turları, recheckBilling vb.). Geçişin gerçekten olduğu noktaya bağla; gerekirse `updateMany where status in ACTIVE` sayısıyla koru.
- Bildirim hatası poller'ı/kurtarmayı ASLA bozmaz: `.catch` ile logla, devam et.

Alanlar: `userId = row.userId`, `actorId = null`, `aiVideoId = row.id`, `preview` = kullanıcının istemi, boşlukları sadeleştirilmiş, en çok 120 karakter (aşarsa `…` ile kes). İstem boşsa (yalnız görselle üretim) `preview = null`.
Modül bağımlılığı: `AiVideoModule` → `NotificationsModule` (döngü çıkarsa `forwardRef`).

### §1.4 Push metni (`toPushPayload`)
- Başlık: actor yok, `'Biri'` YAZILMAZ. İki tipte de başlık `Yapay zeka video`.
- `AI_VIDEO_READY` gövde: preview varsa `Videon hazır: <preview>`, yoksa `Videon hazır.`
- `AI_VIDEO_FAILED` gövde: preview varsa `Videon üretilemedi, kredin düşülmedi: <preview>`, yoksa `Videon üretilemedi, kredin düşülmedi.`
- `data`'ya `aiVideoId` eklenir (tip imzası genişler). `tag = aiVideoId` (aynı üretimin kurtarılmış READY'si FAILED'ın yerine geçsin).
- `androidChannelId` mevcut `messages_v6`. Görsel yok (`pushImageFor` guildId'siz null döner, değişiklik yok).

### §1.5 Testler
`ai-video.poller.spec.ts`: başarıda READY bir kez, fail'de FAILED bir kez, silinmiş satırda yok, bildirim hatası poller'ı düşürmez. Kurtarma spec'inde READY. `notifications.service.spec.ts`: iki tipin push gövdesi/başlığı, `aiVideoId` DTO'da.
DoD: `npm run test` ilgili spec'ler yeşil, `npx prisma generate` + `npx tsc -p tsconfig.build.json` temiz, `npx prisma migrate status` temiz.

## §2 Web
1. `types/index.ts`: iki yeni tip + `aiVideoId: string | null`.
2. `NotificationBell.vue`: satır metni (i18n), alt satırda preview (istem). Tıklanınca bildirim okundu + `AiVideoDialog` `mode="view"` ile açılır, `initialId = aiVideoId`. Diyalog bell'in kendisinde ya da uygulama düzeyinde bir host'ta mount edilebilir; tek örnek olsun.
3. `AiVideoDialog`: `mode` tipine `'view'`. `initialId` verilirse açılışta o satır çekilir (mevcut liste/getir API'si) ve COMPLETED ise önizleme açık gelir; FAILED/bulunamadı ise normal form + Son üretimler. `view` kipinde `AiVideoResultActions` yalnız **Kaydet** gösterir (birincil gönder/kullan düğmesi yok). Form `view` kipinde de çalışır; yeni üretim yapılabilir, sonucu yalnız kaydedilir.
4. Masaüstü/yerel bildirim (`useNativeNotifications`) ve varsa toast: iki tip için başlık/gövde §1.4 ile aynı anlam (i18n'den). `AiVideoDialog` açıkken bu iki tip için açılır bildirim gösterilmez (çan kaydı kalır).
5. Metinler `tr.json` (`notification.aiVideoReady`, `notification.aiVideoFailed` ya da mevcut düzen). `@` kullanma.
DoD: `vue-tsc -b` (bilinen 6 hata dışında yeni hata yok), lint, build.

## §3 Mobil
1. `api/notifications.ts` tipleri: iki yeni tip + `aiVideoId`.
2. `(tabs)/notifications.tsx`: satır metni + preview; tıklayınca §3.4 görüntüleyici açılır.
3. `utils/pushNavigation.ts`: `AI_VIDEO_READY`/`AI_VIDEO_FAILED` → §3.4 görüntüleyiciyi `aiVideoId` ile aç.
4. Görüntüleyici host: küçük bir zustand store (`stores/aiVideoViewer.ts`: `openId`, `open(id)`, `close()`) + `(app)` düzeyinde tek `AiVideoSheet` `mode="view"` mount'u. `AiVideoSheet` `mode` tipine `'view'` + `initialId`: açılışta o satır getirilir, COMPLETED ise önizleme açık; değilse normal form. `view` kipinde önizlemede yalnız kaydet; gönder/kullan yok. Yeni bağımlılık yok (zustand zaten var).
5. Ön plan bastırma (`push.ts` `setNotificationHandler`): herhangi bir `AiVideoSheet` açıkken (sohbet, medya ya da view) bu iki tip banner/ses göstermez. Açıklık bilgisi aynı store'da (`sheetOpen` sayacı ya da bayrak) tutulur.
6. Metinler web `tr.json`'dan (import, kopyalama yok).
7. `app.json` `versionCode` 56 → 57.
DoD: `npm run typecheck`, `npm run lint` temiz. Cihaz doğrulaması sahipte.

## §4 Kapsam dışı
- Bildirim tercihi/sessize alma (ileride gerekirse).
- Üretim sürerken ilerleme bildirimi.

## §5 Revize 1 (2026-11-08, sahip kararı): bildirimden açılan ekranda "Kaydet ve gönder" + hedef seçici
Gerekçe: §0.3'teki "yalnız kaydet" sahibin beklentisi değildi. Sahip, sonuç ekranında gönderme seçeneğini istiyor; hedefi kullanıcı seçer. Üretimin hangi sohbetten başlatıldığı TUTULMAZ (şema değişmez, api değişmez).

- `view` kipinde önizleme düğmeleri: **Kaydet** + **Kaydet ve gönder** (chat kipindeki etiket ve görünüm). `chat` ve `media` kipleri DEĞİŞMEZ (chat kipinde gönderme bulunduğu sohbete gider, bugünkü davranış).
- `view` kipinde "Kaydet ve gönder" → hedef seçici açılır → seçilince mevcut yol: `aiVideoApi.createAttachment(id)` → dönen `attachmentId` ile seçilen kanala ek'li mesaj, istemcinin bugün sohbet içi AI video gönderiminde kullandığı mesaj gönderme çağrısıyla (yeni endpoint YOK). Başarıda seçici + sayfa kapanır, kısa bilgi (toast/yerel bildirim kalıbı neyse) "Gönderildi". Hata `response.data.message`.
- Hedef seçici yeniden yazılmaz:
  - mobil: `components/share/ShareTargetList.tsx` (C41) olduğu gibi kullanılır (DM, grup DM, ortam kanalları).
  - web: `components/shared/ForwardMessageModal.vue`'nun hedef listesi. Modal mesaja bağlıysa hedef listesini ayrıştırmak ya da modal'a "hedef seç ve döndür" kipi eklemek serbest; iletme davranışı DEĞİŞMEZ.
- Sunucu kapıları otoritedir (DM izni, kanal yazma/ek izni, medya kapıları); istemci ek süzgeç kurmaz, reddi mesajıyla gösterir.
- Ekran hiçbir koşulda kendiliğinden açılmaz (sahip onayı): bildirime dokununca açılır.
- Yeni metinler web `tr.json`'a (web ajanı ekler, mobil import eder): `aiVideo.sendTargetTitle` = "Nereye gönderilsin?", `aiVideo.sent` = "Gönderildi". Var olan anahtar uyuyorsa onu kullan.

## §5b Revize 2 (2026-11-08, sahip netleştirmesi): hedef listesi = tüm sohbetler
"DM listesi" sahibin dilinde 1-1 DM + grup DM + **ortam kanalları** demek. Mobil `ShareTargetList` zaten üçünü gösteriyor (doğru).
- web: AI video hedef seçicisi (`AiVideoSendTargetModal`) DM + grup DM'e ek olarak kullanıcının yazabildiği ortam metin kanallarını ortam başlıkları altında listeler (mobil `ShareTargetList`'in kaynak/süzgeç mantığıyla aynı: aynı API çağrıları, aynı kanal türü süzgeci, kilitli kanal yok). Arama üçünde de çalışır. `ForwardMessageModal`'ın davranışı DEĞİŞMEZ.
- mobil: seçici açıkken Android geri tuşu önce seçiciyi kapatır, ikinci basış sayfayı.

## §6 Revize 3 (2026-11-08, sahip onayı): üretim sürerken görünürlük (web + mobil, api değişmez)
Gerekçe: kullanıcı formu kapatınca üretimin sürdüğünü bilmiyor ("iptal mi oldu?"). Üst şerit REDDEDİLDİ (yüzen panel dili, her ekranda yer kaplar).
1. **Kapatırken bilgi:** etkin (QUEUED/RUNNING) bir üretim varken AI video formu/sayfası kapatılırsa kısa bilgi: `aiVideo.backgroundNote` = "Videon arka planda üretiliyor, bitince bildirim gelecek." (web: toast; mobil: projede var olan hafif bilgi kalıbı, Alert değilse daha iyi ama yeni bağımlılık yok). Etkin üretim yoksa bilgi yok.
2. **Giriş butonunda gösterge:** etkin üretim varken sohbetteki AI video giriş butonunda (web `AiVideoButton`, mobil ComposerHost'taki AI video girişi; medya seçicisindeki giriş de varsa aynı) küçük bir "sürüyor" göstergesi (tema aksanında nokta ya da küçük dönen halka, token'lardan). Basınca form açılır, süren üretimin ilerleme ekranı gelir (mevcut davranış; açılışta süren iş seçili değilse seçili gelsin).
3. **Durum kaynağı (ek yoklama YOK):** tek global "etkin üretim" durumu (web: mevcut `useAiVideoViewer` ya da yeni küçük composable; mobil: `stores/aiVideoViewer.ts`). Üretim başlatılınca set, C49 `AI_VIDEO_READY`/`AI_VIDEO_FAILED` soket bildirimi ya da form içi yoklamanın terminal durumu gelince temizlenir. Uygulama/sayfa açılışında ve mobilde ön plana dönüşte tek `aiVideoApi.list()` ile QUEUED/RUNNING satır varsa geri yüklenir. Kişi başı tek eşzamanlı üretim (C43), yani durum tek kimlik.
4. Metin `web/src/i18n/tr.json` (web ajanı ekler, mobil import eder). Mobil versionCode 57 → 58.
