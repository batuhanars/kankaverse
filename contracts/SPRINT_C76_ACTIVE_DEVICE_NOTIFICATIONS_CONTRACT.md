# SPRINT C76: Aktif cihaz kuralı (bildirim yalnız bakmadığın cihaza)

> Durum: **AÇIK (2026-11-26).** PM compose (Opus). api + web + mobile. Desktop kabuğu değişmez (load-remote).
> R7: `PresenceService` T&S karar yüzeyidir ve bu sprintte DEĞİŞMEZ; aktiflik ayrı, yeni bir serviste tutulur.
> Native değişiklik beklenmiyor. Dev commit ETMEZ; diff PM'e, PM sahibe.

## §0 Sahip bulgusu (2026-11-26)
Masaüstünde bir DM'de yazışırken gelen her mesaj telefona da push olarak düşüyor; telefondan yazışırken masaüstünde
sistem bildirimi çıkıyor. Kullanıcı zaten baktığı cihazdan başka bir cihazda rahatsız ediliyor.

## §1 Sahip kararları (2026-11-26)
- **K1** Masaüstünde ya da web'de **aktifken** (son 5 dk içinde hareket) telefona push GİTMEZ. Boşta kalınca push'lar döner.
- **K2** Telefonda uygulama **ön plandayken** masaüstü/web sistem (OS) bildirimi GÖSTERMEZ.
- **K3** Bir cihazda okunan sohbetin bildirimi diğer cihazdan da kalkar. Telefon tarafı ZATEN VAR (`read` push'u,
  `push.service.ts` `kind:'read'`, mobil `dismissConversationNotification`). Eksik olan masaüstü/web tarafı.
- **Kapsam dışı (her cihazda çalmaya devam):** aramalar (zil, cevapsız arama), `E2EE_TRANSFER` güvenlik bildirimi.

## §2 api
### §2.1 Bağlantı türü
- Soket handshake `auth.client`: `'web' | 'desktop' | 'mobile'`. Yoksa ya da tanınmıyorsa `unknown`.
  `unknown` bağlantı hiçbir bastırma kararına katılmaz (eski istemci: bugünkü davranış, push gider).

### §2.2 `ClientActivityService` (yeni, `api/src/shared/`)
- Bellek içi (presence ile aynı ilke, şema yok): `connectionId → { userId, client, active }`.
- Bağlanınca kayıt `active: true` (web/desktop: açılan pencere aktif sayılır; mobil: ön planda bağlanır).
  Kopunca silinir.
- Olay `client:activity` `{ active: boolean }`: bağlantının aktifliğini günceller. Web/desktop bunu hareketsizlik
  algısından (5 dk, `useIdlePresence` ile AYNI eşik) gönderir; mobil `AppState` değişiminden (`active` → true,
  `background`/`inactive` → false).
- Sorgular: `isDesktopActive(userId)` = `web`/`desktop` türünde en az bir `active` bağlantı var mı.
  `isMobileForeground(userId)` = `mobile` türünde en az bir `active` bağlantı var mı.
- Mobil ön plan durumu değişince (hesap düzeyinde false→true / true→false geçişi) kullanıcının kendi
  soketlerine `client:mobile_foreground` `{ active }` yayılır (K2 için). Kullanıcı bağlanınca o anki değer
  ona bir kez gönderilir.
- **PresenceService'e dokunulmaz.** Manuel "Rahatsız Etmeyin"/"Boşta" seçimleri bu kuralı etkilemez.

### §2.3 Push bastırma (K1)
- Mobile giden **mesaj türü** push'lar, `isDesktopActive(alıcı)` true ise o alıcıya GÖNDERİLMEZ:
  DM mesajı (`sendDmPush`), ortam kanalı mesajı, kalıcı bildirim push'ları (MENTION, REACTION, MESSAGE_REQUEST,
  FRIEND_REQUEST, FRIEND_ACCEPT, GUILD_INVITE, EVENT_CREATED, AI_VIDEO_*).
- **Bastırılmaz:** arama push'ları (`call_*`, grup araması, cevapsız), `E2EE_TRANSFER`, `read` push'u (K3 sürmeli).
- Kalıcı bildirim KAYDI her durumda yazılır (zil listesi). Yalnız push atlanır.
- Karar tek yerde: push gönderim fonksiyonlarının alıcı süzgecine eklenen ortak bir yardımcı; her çağrı yerine
  ayrı kopya yazılmaz.

## §3 web (masaüstü dahil)
- Handshake'e `client`: Electron köprüsü varsa `'desktop'`, yoksa `'web'`.
- `client:activity`: hareketsizlik başlayınca `false`, hareket dönünce `true` (5 dk eşik, `useIdlePresence`'in
  `useIdle` kaynağı paylaşılır, ikinci zamanlayıcı yazılmaz). Yeniden bağlanınca mevcut değer tekrar gönderilir.
- **K2:** `client:mobile_foreground` true iken `useNativeNotifications` ve `useMessageToasts` sistem (OS)
  bildirimi ÇİZMEZ. Uygulama içi rozetler/sayaçlar/sesler değişmez (ses dahil susar mı: **susar**, OS bildirimiyle
  birlikte giden mesaj sesi de çalmaz). Arama penceresi/zili etkilenmez.
- **K3 (masaüstü/web tarafı):** `read:self` gelince o kanala ait açık OS bildirimleri kapatılır (bildirim nesneleri
  kanal kimliğiyle tutulur; Electron köprüsünde ayrı bir kapatma yolu gerekiyorsa köprü yoksa no-op). Köprüde yeni
  IPC gerekiyorsa **dur, PM'e dön** (desktop sürümü gerektirir).

## §4 mobile
- Handshake'e `client: 'mobile'`.
- `AppState` değişiminde `client:activity` gönderilir; yeniden bağlanınca mevcut değer tekrar gönderilir.
- Başka değişiklik yok (K3 telefon tarafı mevcut).

## §4b Rev.1 (2026-11-26): tepside masaüstü aktif sayılmaz, ön plandaki telefon her zaman alır
Sahip bulgusu: masaüstü tepsideyken (pencere gizli) ve telefon uygulaması ön plandayken bile telefona hiç push gelmedi.
Kök: web/desktop bağlantısı bağlanınca `active: true` başlıyor ve yalnız 5 dk hareketsizlikle düşüyordu; gizli
pencere "aktif" sayılıyordu.
- **web/desktop aktiflik tanımı:** `document.visibilityState === 'visible'` VE 5 dk içinde hareket. Pencere gizlenince
  (tepsi, simge durumu, arka plan sekmesi) hemen `client:activity { active: false }`; görünür olunca idle değilse `true`.
- **Sunucu bağlanma varsayılanı:** web/desktop bağlantı `active: false` başlar; istemci bağlanınca gerçek değeri gönderir
  (gizli açılan masaüstü yanlışlıkla aktif sayılmasın). Mobil bağlantı `active: true` başlar (ön planda bağlanır).
- **Bastırma kuralı:** `isDesktopActive(alıcı) && !isMobileForeground(alıcı)` ise atlanır. Telefon ön plandaysa push
  her durumda gider.

## §5 Kapsam dışı
Telefon ön plandayken telefona gelen uygulama içi bildirimler (zaten mevcut kural). Birden çok masaüstü arasında
bastırma. Kullanıcıya bu kuralı açıp kapatan ayar. Çok instance'lı sunucu (aktiflik Redis'e taşınmaz, presence borcuyla aynı).

## §6 Doğrulama
- api: `tsc -p tsconfig.build.json`, yeni servis + bastırma yardımcısı + push çağrı yerleri için jest (aktif masaüstünde
  DM/mention push atlanır, arama ve E2EE_TRANSFER atlanmaz, `unknown` bağlantı bastırmaz, kayıt yine yazılır).
- web: `vue-tsc -b` (bilinen 6), eslint (dokunulan), `vite build`, vitest (mobile_foreground iken OS bildirimi yok).
- mobile: `typecheck`, eslint.
- **Sahip cihaz turu:**
  1. Masaüstünde aktifken DM gelir: telefona push YOK.
  2. Masaüstünü 5 dk ellemeden bırak: DM gelir, telefona push VAR.
  3. Telefonda uygulama açıkken DM gelir: masaüstünde OS bildirimi YOK.
  4. Telefon arka planda, masaüstü boşta: iki tarafta bildirim olağan.
  5. Masaüstünde bildirim varken sohbeti telefonda oku: masaüstü bildirimi kalkar. Tersi: telefonda bildirim varken
     masaüstünde oku, telefondaki kalkar (mevcut).
  6. Masaüstünde aktifken arama gelir: telefon yine çalar.
