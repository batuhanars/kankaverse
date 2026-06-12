# TASK.md — Canlı Sprint İlerlemesi

> Dev session **checkbox işaretler**, item EKLEMEZ. Yeni item = scope creep = PM onayı.
> Aktif sprint sözleşmesi: `contracts/SPRINT_1_CONTRACT.md`.

---

## Sprint 1 — Walking Skeleton

### Ortak / Kurulum
- [x] PostgreSQL + Redis dev ortamı → kök `docker-compose.yml` + `.env.example` (PM sağladı). Dev: `cp .env.example .env && docker compose up -d`
- [x] Git: kök depo başlatıldı, GitHub'a push edildi (yuva-git sorunu kalmadı)

### Backend (`api/`)
- [x] Prisma + PostgreSQL kurulumu, `schema.prisma` (contract §2), ilk migration
- [x] `PrismaModule` (global) + `PrismaService`
- [x] `common/`: `TransformInterceptor`, `GlobalExceptionFilter` (envelope), `JwtAuthGuard`, `@CurrentUser()`
- [x] `main.ts`: global `ValidationPipe` + interceptor + filter + `@nestjs/swagger` (`/api/docs`) + Socket.IO Redis adapter
- [x] `auth` modülü: register, login, refresh (rotasyon + reuse tespiti), logout, me — **R7 insan incelemesi**
- [x] argon2id hash + JWT access (15dk) + rotasyonlu refresh + `Session` kaydı + httpOnly cookie
- [x] `guilds` modülü: POST (atomik: guild + OWNER member + `#genel-sohbet`), GET, POST join
- [x] `channels` modülü: POST (OWNER/ADMIN), GET (üye)
- [x] `messages` modülü: GET (cursor `before`, 50), POST (+ WS broadcast tetikle)
- [x] WS gateway: handshake auth, `channel:join`/`channel:leave`, `message.created` broadcast

### Frontend (`web/`)
- [x] Altyapı: Tailwind + `styles/tokens.css` (design-tokens), Figtree + JetBrains Mono fontları
- [x] Pinia + vue-router + vue-i18n (`i18n/tr.json`)
- [x] `api/` axios instance + envelope-aware interceptor + 401→refresh (in-flight promise)
- [x] `stores/`: auth, guilds, channels, messages
- [x] `useSocket` composable (Socket.IO client, token handshake, room join/leave)
- [x] `LoginView` (tasarım giris_yap; e-Devlet butonu disabled placeholder)
- [x] `RegisterView` (doğum tarihi zorunlu alan)
- [x] App shell: `ServerRail` (altıgen ikon + "+") · `ChannelPanel` · mesaj alanı · `MemberPanel` (statik stub)
- [x] Guild oluştur / guild'e join akışı (kısmen — bkz. PM notu ↓)
- [x] Gerçek zamanlı mesaj gönder/al + geçmiş yükleme

> **PM notu (2026-06-11) — join-by-ID UI bağlama ertelendi.** Backend `POST /guilds/:id/join` ve
> frontend `JoinGuildModal.vue` + `guildsApi.join` hazır, ama ServerRail'de modalı açan düğme ve guild
> ID'yi gösterip kopyalama affordance'ı **bilinçli olarak yazılmadı**. `onJoinGuild` prop'u + modal şu an
> öksüz kod; bu kabul edilmiş bir karar (scope creep değil), gerçek davet sistemiyle (Sprint 7) birleştirilecek.
> Ham guild ID paylaşımı zaten atılacak geçici köprüydü; Sprint 7'de davet kodu/linki + T&S kapıları
> (`adultsOnly`/minor) ile değişecek. → DoD §10 "ikinci kullanıcı join olur" maddesi UI'dan o zamana kadar açık.

### Sprint 1 DoD (contract §10)
- [ ] İki kullanıcı uçtan uca gerçek zamanlı mesajlaşma
- [ ] Mesaj geçmişi yenilemede REST'ten yükleniyor
- [ ] 401 → otomatik refresh şeffaf
- [ ] Tüm UI metni i18n'den (gömülü string yok)
- [ ] Envelope tutarlı + Swagger üretiyor + Redis adapter bağlı
- [x] Auth modülü diff'i kullanıcı incelemesinden geçti (R7)

---

## Sprint 2A — E-posta Doğrulama & Şifre Kurtarma

> Aktif sözleşme: `contracts/SPRINT_2A_CONTRACT.md`. **R7: tamamı insan incelemesi.** Dev checkbox işaretler, item EKLEMEZ.

### Backend (`api/`)
- [x] Prisma: `AuthToken` modeli + `AuthTokenType` enum + `User.authTokens` ilişki + migration (additive)
- [x] `EmailService` (SharedModule): Resend adaptörü + konsol fallback (anahtarsız dev); `RESEND_API_KEY` prod fail-fast
- [x] Token util: 32-byte rastgele üret + `SHA-256` hash + tek-kullanım/süre doğrulama
- [x] `POST /auth/verify-email` (token → emailVerifiedAt set, usedAt)
- [x] `POST /auth/resend-verification` (auth, rate-limit, zaten-doğrulanmış 409)
- [x] `POST /auth/forgot-password` (her zaman 200, sızıntı yok, rate-limit)
- [x] `POST /auth/reset-password` (şifre set + TÜM oturum revoke + emailVerifiedAt set)
- [x] `register` yan etkisi: doğrulama e-postası gönder (gönderim register'ı bloke etmez)
- [x] `VerifiedEmailGuard` → `POST /guilds` doğrulanmamışta 403 EMAIL_NOT_VERIFIED
- [x] `toUserDto`: `emailVerified` alanı; Swagger güncel
- [x] Yeni env: `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL` → `.env.example`

### Frontend (`web/`)
- [x] `UserDto.emailVerified` tip + tüketim
- [x] Doğrulama bandı (emailVerified=false → uyarı + "Tekrar gönder")
- [x] `VerifyEmailView` (`/verify-email`), `ForgotPasswordView` (`/forgot-password`), `ResetPasswordView` (`/reset-password`)
- [x] Login'e "Şifremi unuttum" linki
- [x] Guild oluşturmada 403 EMAIL_NOT_VERIFIED ele alımı (buton disabled/tooltip)
- [x] Yeni hata kodları i18n map + tüm yeni metinler `tr.json`

### Sprint 2A DoD (contract §9)
- [x] Doğrulanmamış girer ama sunucu kuramaz; link doğrular
- [x] forgot sızdırmaz; reset tüm oturumları düşürür + emailVerified yapar
- [x] Token tek-kullanım + süreli; EmailService soyut (anahtarsız konsol)
- [x] **R7:** 2A diff'i satır satır kullanıcı incelemesinden geçti (PM review: F1/F3 düzeltildi; kullanıcı görünen tarafı test etti)

---

## Sprint 2B — 2FA, Oturum Yönetimi, Hassas İşlemler & Hesap Silme

> Aktif sözleşme: `contracts/SPRINT_2B_CONTRACT.md`. **R7: tamamı insan incelemesi.** Dev checkbox işaretler, item EKLEMEZ.

### Backend (`api/`)
- [x] Prisma: `User.twoFactorEnabled/totpSecret/deletionRequestedAt`, `RecoveryCode` modeli, `AuthToken.payload` + `EMAIL_CHANGE`/`EMAIL_CHANGE_UNDO` tipleri + migration
- [x] `crypto.util`: AES-256-GCM `encryptSecret`/`decryptSecret`; `TOTP_ENC_KEY` prod fail-fast
- [x] 2FA: `setup` (otplib+qrcode, reauth), `enable` (kod→kurtarma kodları), `disable` (reauth)
- [x] Login 2 adım: `login` challenge dönüşü + `login/2fa` (TOTP/kurtarma kodu); JwtStrategy challenge token'ı reddeder
- [x] `verifyReauth` paylaşılan helper (şifre + varsa TOTP)
- [x] Oturumlar: `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/sessions/revoke-others`
- [x] Şifre değiştir (reauth, diğer oturumları düşür) + e-posta değiştir/confirm/undo
- [x] Hesap silme (reauth → deletionRequestedAt + oturum düşür), grace'te giriş=iptal, cancel
- [x] EmailService: yeni-cihaz + e-posta-değişim bildirim/geri-al
- [x] `@nestjs/schedule`: `isMinor` 18-yaş job + 30-gün purge **GATED** (no-op, `PURGE_ENABLED` default false)
- [x] `toUserDto`: `twoFactorEnabled`; yeni env `.env.example`'a

### Frontend (`web/`)
- [x] Ayarlar → Güvenlik ekranı (2FA kur/kapat, kurtarma kodları, şifre/e-posta değiştir, oturumlarım, hesap sil)
- [x] Login 2FA adımı (challenge → TOTP/kurtarma kodu)
- [x] Paylaşılan reauth modalı
- [x] E-posta değişim confirm/undo landing'leri + deaktif/grace uyarı akışı
- [x] `UserDto.twoFactorEnabled`; yeni hata kodları i18n map + metinler `tr.json`

### Sprint 2B DoD (contract §10)
- [x] 2FA kur→etkinleştir→2 adım login; kurtarma kodu login + tek-kullanım
- [x] `totpSecret` şifreli; oturumlarım liste+çıkış; yeni-cihaz bildirimi
- [x] Hassas işlemler reauth ister; e-posta değişim+geri-al; hesap silme gated (purge no-op)
- [x] `isMinor` job; challenge token access kabul edilmiyor
- [x] **R7:** 2B diff'i satır satır incelemesinden geçti (PM review: çekirdek güvenlik doğru; #2 düzeltildi, #1/#4 debt, #3 §7 senkron)

---

## Sprint 3 — DM + Arkadaşlık + Engelleme + Merkezi DM Karar Fonksiyonu

> Aktif sözleşme: `contracts/SPRINT_3_CONTRACT.md`. **R7: `DmPermissionService` + DM erişim kontrolü** (T&S karar fonksiyonu) insan incelemesi. Dev checkbox işaretler, item EKLEMEZ.

### Backend (`api/`)
- [x] Prisma: `User.friendCode` (unique, register'da üret + backfill), `Friendship`/`FriendshipStatus`, `UserBlock`, `ChannelMember` + migration
- [x] **`DmPermissionService.canDm`** — §3 matrisi: blok→arkadaş→minor→**yeni hesap (§5.1.b, `NEW_ACCOUNT_DM_LOCK` config)**→dmPolicy→ortak sunucu; `verificationStatus` okuma + davranış/report/karantina no-op hook **[R7]**
- [x] `friendCode` util (8-char base32, çakışmada yeniden üret); register yan etkisi
- [x] Arkadaşlık: GET friends/requests, POST request (kodla, karşılıklı otomatik kabul), accept/decline, DELETE
- [x] Engelleme: GET/POST/DELETE blocks (block → arkadaşlık sil + istek iptal, transaction)
- [x] DM: GET/POST `/dm/channels` (canDm kapısı), POST read; `DmChannelDto` (son mesaj + unread)
- [x] **`MembershipService.requireChannelAccess` DM `ChannelMember` kontrolü** (güvenlik açığı kapanışı) **[R7]** + DM send blok kontrolü
- [x] `toUserDto`: `friendCode`; yeni hata kodları

### Frontend (`web/`)

> **PM reconcile (2026-06-12):** aşağıdakiler home redesign (Faz 1) içinde teslim edildi; kodda doğrulandı
> (`HomeView`/`DmList`/`FriendsPanel`/`FriendAddModal`/`DmConversation`). DM görünümü **fonksiyonel** çalışıyor;
> prototip re-skin'i (yuvarlak baloncuk + sağ profil paneli) ayrı iş = **UI Redesign Faz 2**.
- [x] Home ekranı (rail hexagon → DM listesi + Arkadaşlar sekmesi); kendi kodunu göster/kopyala (`useClipboard`)
- [x] Arkadaş ekle (kod gir), bekleyen istekler, kabul/reddet/sil
- [x] DM görünümü (mevcut mesaj bileşenleri) + unread rozeti *(fonksiyonel; görsel re-skin Faz 2)*
- [x] Engelle/arkadaşlıktan çıkar (bağlam menüsü + ConfirmDialog)
- [x] `UserDto.friendCode`; yeni hata kodları i18n map + metinler `tr.json`

### Sprint 3 DoD (contract §11)
- [x] Kod ile arkadaşlık (karşılıklı otomatik kabul); username araması yok
- [x] `canDm` matrisi birebir: blok yener, minor↔yabancı DM kapalı, arkadaş izinli, dmPolicy kapıları
- [x] DM erişim açığı kapandı (ChannelMember olmayan erişemez, REST+WS); blok sonradan DM keser
- [x] DM gerçek zamanlı + unread `lastReadAt`
- [ ] **R7:** `canDm` + DM erişim kontrolü incelemesinden geçti *(backend `[R7]`-tag'li teslim; PM satır-satır imzası bekliyor — kullanıcı teyidi)*

### Sprint 3 — Revizyon R1+R2 (2026-06-12, PM onaylı kapsam; bkz. contract "Revizyon R1+R2")

> Çekirdek merge sonrası proje-sahibi talebi. **Scope creep DEĞİL** (PM onayı var). Dev checkbox işaretler, item EKLEMEZ.

**R1 — Arkadaş kimliği `rumuz#etiket` (Backend `api/`):** ~~[x] uygulandı~~ → **R3 İLE GERİ ALINDI** (aşağı bkz.)

**R3 — Arkadaş kimliği A modeline geri (Backend `api/`) — `rumuz#etiket` revert (PM onaylı, /kurul sonrası):** ✅ *(PM reconcile 2026-06-12: `..._friend_code_revert` migration + `friend-code.util` + DTO + `toUserDto` kodda doğrulandı)*
- [x] Prisma: `User.friendTag` **drop** → `friendCode String @unique` **geri** + migration (friendCode backfill üret, friendTag kaldır)
- [x] `friend-tag.util` → `friend-code.util` (`generateFriendCode` 8-char base32, çakışmada yenile); register yan etkisi geri
- [x] `SendFriendRequestDto`: `handle` → `friendCode` (`@Length(8,8)`); servis `findUnique({ where: { friendCode } })`; bulunamaz → `USER_NOT_FOUND`; `handle` ayrıştırma + `INVALID_HANDLE` **kaldır**
- [x] `toUserDto`: `friendTag` → `friendCode`; Swagger + hata kodları geri

**R1 — UI Discord yerleşimine hizalama (Frontend `web/`):** ⚠️ *(PM reconcile: bu R1 Discord-hizalama UI Redesign Faz 1 ile **YERİNİ ALDI** — özgün tasarım diline geçildi, Discord referansı terk edildi. Fonksiyonel yapı [sekmeler/arkadaş-ekle/liste/sidebar] `FriendsPanel`+`HomeSidebar`'da mevcut; görsel dil artık `anasayfa.png`. R1 "Discord'a hizala" maddesi olarak kapanmaz → **SUPERSEDED**.)*
- [~] Üst bar / Arkadaş Ekle / Liste / Sol sidebar → fonksiyonel yapı var; görsel dil Faz 1 (özgün) ile değişti
- [x] **R3:** `UserDto` `friendCode` geri; `INVALID_HANDLE` i18n kaldırıldı (tr.json'da yok); `friendTag`/`handle` UI referansları → `friendCode`

**R2 — Arkadaşlık eventleri anlık (Backend `api/`):** ✅ *(PM reconcile: `RealtimeService`+`emitToUser`+`friend.*` event'leri kodda doğrulandı)*
- [x] WS gateway handshake'te `user:<userId>` odasına katıl
- [x] `SharedModule` `RealtimeService` (`Server` ref + `emitToUser`); gateway init'te ref set eder
- [x] `friends.service`: istek→`friend.request` (addressee), kabul→`friend.accept` (karşı taraf), sil→`friend.remove`; emit transaction SONRASI
- [x] `blocks.service`: engelleme yan etkisinde engellenen tarafa `friend.remove` (sessiz kaldırma)

**R2 — Arkadaşlık eventleri anlık (Frontend `web/`):** ✅ *(`useSocket.ts` `friend.*` dinliyor — doğrulandı)*
- [x] `useSocket`/friends store `friend.request`/`friend.accept`/`friend.remove` dinler → bekleyen+arkadaş listeleri reaktif; manuel yenileme yok

### Sprint 3 R2+R3 DoD (contract §11 ekleri)
- [x] **R3:** Arkadaş kimliği = gizli `friendCode` (A); username public ama anahtar değil; `friendTag`/`handle`/`INVALID_HANDLE` geri alındı
- [x] Arkadaş isteği gönder/kabul/sil anlık yansır (yenileme yok)
- [~] UI hizalı — **NOT:** R1'in "Discord referansı" kriteri SUPERSEDED; UI artık özgün tasarım dili (Faz 1). Arkadaş Ekle input'u kod (`friendCode`) ✓

---

## UI Polish — Sunucu Oluştur/Katıl modalı Discord hizalaması (sprint-bağımsız, PM onaylı 2026-06-12)

> Frontend-only görsel hizalama; backend değişmez. Referans + sınırlar: `design-refs/discord/INDEX.md` §B
> (`server-create-modal.png`). Dev checkbox işaretler. **Tema daima `tokens.css` — Discord düzenini al, rengini alma.**

**Frontend (`web/`):**
- [ ] `CreateGuildModal.vue` + `JoinGuildModal.vue` → tek `ServerModal.vue` (adım: `choose | create | join`)
- [ ] Adım `choose`: "Kendin Oluştur" + alt bölüm "Zaten davetin var mı?" → "Bir Sunucuya Katıl" (Discord düzeni)
- [ ] Adım `create`: sunucu adı input + Oluştur + geri ok; mevcut `guildsStore.createGuild` aynen
- [ ] Adım `join`: davet/ID input + Katıl + geri ok; mevcut `guildsStore.joinGuild` aynen (ham ID interim)
- [ ] ServerRail "+" düğmesi yeni `ServerModal`'ı `choose` adımında açar

**Kapsam DIŞI (yapma — Sprint 7/sonrası):** tematik şablonlar (backend), sunucu ikonu yükleme (upload altyapısı yok),
gerçek davet linkleri/kodları + T&S kapıları (Sprint 7 davet sistemi). Bunlara dokunma → sapma + PM'e dön.

---

## UI Redesign — Özgün tasarım diline geçiş (frontend-only, PM onaylı 2026-06-12)

> Sözleşme: `contracts/UI_REDESIGN_CONTRACT.md`. Görsel: `design-refs/{anasayfa,dm-chat,sunucu-detay}.png` (yerelde Read).
> **SIFIR backend. §3 "şimdi yapma" haritasındaki gelecek özellikleri İNŞA ETME.** Dev checkbox işaretler.

**Terminoloji (i18n sweep, /kurul kararı):** ✅ *(tr.json: 0 "Sunucu", 28 "Ortam" — doğrulandı)*
- [x] `tr.json` "Sunucu" → "Ortam" ("Ortam Oluştur"/"Ortama Katıl"/"3 ortamdasın"); kod İngilizce (`guild`) kalır

**Faz 0 — Foundation (`web/`):** ⚠️ *(PM reconcile 2026-06-12: layout shell yapıldı; ama `Card`/`ContextPanel`/`QuickActionTile` **ayrı primitive dosyası olarak çıkarılmadı** — panel/kart stilleri home bileşenlerine inline. Bkz. PLAN.md teknik borç **D9**. Faz 2 kararı: aşağıda.)*
- [~] Design-system primitive'leri: `Card`, `ContextPanel`, `QuickActionTile`, mesaj baloncuğu — **inline yazıldı**, `components/ui/`'a promote EDİLMEDİ (Rule of Three henüz tetiklenmedi; bkz. D9)
- [x] Layout shell (ray + nav-kolon + içerik + sağ-bağlam paneli); header 64px sistemi korunur

**Faz 1 — Anasayfa (`web/`, `anasayfa.png`):** ✅ *(ana ekran tamamlandı — kullanıcı onayı 2026-06-12)*
- [x] Dashboard kabuğu: karşılama + hızlı-aksiyonlar (Kanka Ekle/Alan Oluştur/Katıl, mevcut akışlar) + Kankalar paneli + son sunucular (`GET /guilds`)
- [x] Keşfet/Önerilen/Son Aktiviteler → gizli ya da "yakında" stub (boş bölüm gösterme)

**Faz 1 — RAFİNE (kullanıcı feedback 2026-06-12, ilk pass sonrası):** ✅
- [x] **3-KOLON segment layout (iç-içe kart DEĞİL):** sol sidebar / orta alan / sağ Kankalar = **3 ayrı yüzen yuvarlak panel**, aralarında **boşluk** (arada en koyu sayfa zemini görünür). Sol sidebar **rail'e yapışık** (sol kenar flush) ama panel görünümünde. **Orta panelin içindeki "HIZLI AKSİYONLAR"/"ORTAMLARIN" border-kutuları KALDIR** → orta panelde başlıklı bölüm olarak akar. Sayfa bg en koyu, paneller `--kv-bg-sidebar/content`. (`anasayfa.png`)
- [x] **Sidebar arama:** "Sohbet bul ya da başlat" butonu KALK → üstte **arama input'u**; yazınca **gruplu sonuç** (KANKALAR / ORTAMLAR / DM başlıkları altında client-side filtre: friends+guilds+dm store); boşken normal sidebar
- [~] **Kanka Ekle modalı → ara-ve-ekle:** ⚠️ **ERTELENDİ — alternatif seçildi.** `FriendAddModal` şu an **tek-adım submit** (kod gir → direkt `sendRequest`; önizleme/lookup yok). "Ara-ve-ekle önizleme" akışı `POST /friends/lookup` gerektirir → eklenmedi. Yeni dile uygun modal var, akış sade.
- [x] **Polish:** "+ Yeni Kanka Ekle" sağ-alt bar → Kankalar paneli başlığına taşı; dashboard boşluğunu dengele

**Faz 1 — RAFİNE 2 (üst bar + bildirim, 2026-06-12):** ✅
- [x] **Üst arama çubuğu (tasarım-only):** ekranın en üstünde, orta HomeDashboard panelinin **HEMEN ÜSTÜNDE ve DIŞINDA** (canvas'ta, panel içinde değil), geniş arama çubuğu — `anasayfa.png` gibi. Davranış BACKEND fazında: tıkla → aşağı açılır menü, **KANKALAR** + **ORTAMLAR** başlıkları + listeleri. → redundant olan sidebar "Sohbet bul ya da başlat" butonunu KALDIR (tek arama kalsın)
- [x] **Bildirim zili (tasarım-only):** ekranın sağ üstünde, yüzen panellerden **bağımsız** zil ikonu → tıkla bildirim paneli (şimdilik stub/boş). Bildirim SİSTEMİ → Sprint 6, şimdi yalnız ikon+giriş noktası
- [x] **UserCard → niş pill + popover (karar A):** şişman kart yerine kompakt **avatar + durum pill**; tıkla → **popover** (profil / durum / ayarlar / çıkış yap). **Çıkış Yap buraya girer → home sağ-üstteki geçici "Çıkış Yap" (U1 borcu) KALKAR**; ayarlar çarkı da popover'a taşınır. Ses ikonları (mic/kulaklık) → V2'ye ertelenir, yer rezerve. Konum bottom-left, yüzen mini-panel.

> **Kanka-ekle "lookup" backend istisnası — KAPANDI (PM reconcile 2026-06-12):** RAFİNE'deki ara-ve-ekle önizleme akışı
> `POST /friends/lookup` gerektiriyordu; **endpoint eklenMEDİ** (`friends.service`'te `lookup` metodu/route yok, yalnız
> `toFriendCodeUserDto` helper'ı mevcut endpoint'lerde). `FriendAddModal` tek-adım submit ile kaldı. Yani **"sıfır backend"
> istisnası kullanılmadı** — redesign saf frontend kaldı. İleride önizleme istenirse Sprint-bağımsız küçük backend işi (PM kararı).

**Faz 2 — DM ekranı (`web/`, `dm-chat.png`) — KİLİTLİ spec (PM, 2026-06-12):**

> 3 bağlamsal kolon; **ray (`ServerRail`) dokunulmaz (§2.5)**. SIFIR backend. Mevcut `DmConversation`+`DmList`
> fonksiyonel → iş **re-skin + yeni sağ profil paneli**. §3 haritasındaki öğeler **gösterilmez** (stub/gizle, "yakında" yok).
>
> **Primitive kararı (D9 tetikleyici):** DM panelleri home'daki panel/kart desenini tekrar kullanır. Bu **2.-3. tekrar** →
> Rule of Three eşiği. **Gerçek kopya-stil acısı varsa** `components/ui/Card`+`ContextPanel`'a promote et (home'u da ona geçir);
> **yoksa inline kal** — temiz kod uğruna erken soyutlama YAPMA (kullanıcı uyarısı). Sapma hissi → dur, PM'e dön.

- [x] **Kol-2 (DM listesi):** mevcut `HomeSidebar` arama + "DİREKT MESAJLAR" başlığı + `DmList` korunur. Prototipteki "Mesaj İstekleri" sekmesi → Sprint 3'te yok, **GÖSTERME** (yeni sekme/nav ekleme).
- [x] **Kol-3 (`DmConversation` re-skin) — yuvarlak baloncuk:** kendi mesajın → **Kor-vurgulu, sağa hizalı**; karşının → nötr `--kv-bg-elevated`, sola. Baloncuk **DM-özel** (sunucu mesajı klasik liste kalır → `MessageItem`'a DOKUNMA, Rule of Three: baloncuk şimdilik tek yerde).
- [x] **Başlık çubuğu (64px korunur):** daire avatar + ad. Sağdaki **Sesli/Görüntülü Ara** ikonları → V2, **GÖSTERME** (buton bile değil). **Mesaj arama / sabitlenmiş** ikonları → V2, gizle. Sağda en çok profil-panel toggle (opsiyonel) — minimal tut.
- [x] **Embed/medya kartları (markalı, müzik):** link-önizleme + medya → V1'de yok (Sprint 5), **GÖSTERME** → yalnız düz metin mesaj.
- [x] **Mesaj input (mevcut, min 44px):** ek (📎)=Sprint 5 gizle · emoji=V1 dışı gizle · gönder=Enter zaten (opsiyonel işlevsel gönder ikonu eklenebilir). Dekoratif ikon ekleme.
- [x] **Kol-4 (`DmProfilePanel`, YENİ component):** büyük daire avatar + ad *(not: `friendCode` `FriendCodeUserDto`'da yok — backend DTO değişikliği olmadan gösterilemiyor; sıfır-backend kuralı gereği atlandı)*. Aksiyonlar = **yalnız mevcut akışlar:** [Engelle] + [Arkadaşlıktan Çıkar] (Sprint 3 blocks/friends store + `ConfirmDialog`). "Profil Gör" zengin modal → §3 yok. **Sesli/Görüntülü Ara** → V2 GÖSTERME.
- [x] **Sağ panel stub bölümleri GÖSTERME:** "ORTAK ALANLAR" (yeni sorgu = backend) + "PAYLAŞILAN MEDYA" (Sprint 5) → boş bölüm bile koyma (§3, "boş bölüm gösterme" kuralı).
- [x] **Presence:** çevrimiçi yeşil nokta/durum metni → Sprint 6, **statik gösterme**. (DmList unread rozeti gerçek veri → kalır.)
- [x] **Entegrasyon:** `HomeView` aktif DM'de Kol-3=`DmConversation` + Kol-4=`DmProfilePanel` render eder. Responsive: sağ panel <1280 gizli (`hidden xl:flex` wrapper), DM listesi <768 drawer (shell breakpoint sistemi).
- [x] **i18n:** tüm yeni metin `tr.json`; renk/şekil token (`--kv-*`). Gömülü string/stil yok.

**Faz 3 — Ortam detay (`web/`, `sunucu-detay.png`) — KİLİTLİ spec (PM, 2026-06-12):**

> **YALIN re-skin.** Ortam görünümü (`AppView` `guildsStore.activeGuildId` dalı) yüzen-panel diline geçer —
> home ile aynı dil (gap-4 + yuvarlak panel + `--kv-bg-sidebar/content`). SIFIR backend. **Boşluğu placeholder'la
> ŞİŞİRME** — olmayan özellik §3 gereği gizli; "yakında" stub'ı yalnız mevcut stub'da (üye paneli). Ray dokunulmaz (§2.5).
> Mevcut: `ChannelPanel` (fonksiyonel) · `TopBar` · `MessageArea` · `MemberPanel` (zaten stub).

- [ ] **Kol-2 (`ChannelPanel` re-skin):** ortam adı başlığı (64px) + "METİN KANALLARI" + kanal satırları (mevcut `channelsStore`). Yüzen panel görünümü (home sidebar dili). **Sesli kanal bölümü EKLEME** (V2). Aktif/hover durumları Kor ile harmonize.
- [ ] **Kol-3 (ortam içeriği = `TopBar` + `MessageArea` re-skin):** kanal başlığı (`#ad`) + mesaj listesi **klasik `MessageItem`** (DM baloncuğu DEĞİL — baloncuk DM'e özel, §Faz 2 kararı) + mesaj input. Yüzen panel + yuvarlak köşe. **Sabitlenmiş duyuru kartı → GÖSTERME** (pin backend'i yok; §3 stub).
- [ ] **Kol-4 (`MemberPanel` re-skin):** yüzen panel kabuğuna geçir; **içerik Sprint 6 stub kalır** ("yakında"). ⚠️ Mevcut gömülü string `Üye listesi çok yakında.` → `tr.json`'a taşı (i18n borcu, re-skin'le birlikte kapat). **Sahte üye listesi gösterme.**
- [ ] **Ortam-bilgi paneli:** prototipteki sağ-üst zengin ortam kartı → yalnız **temel** (ad; üye sayısı VARSA). Yoksa ekleme. Fazlası stub.
- [ ] **§3 GÖSTERME:** Etkinlikler/Hackathon kartı (V1 dışı) · Paylaşılan Medya (Sprint 5) · Sesli kanal/Sesli Ara (V2) · Sabitlenmiş duyuru (pin yok). Boş bölüm bile koyma.
- [ ] **Responsive:** üye paneli `<1280` gizli (mevcut `xl:flex` korunur); kanal paneli `<768` drawer (shell breakpoint).
- [ ] **i18n + token:** yeni metin `tr.json`; renk/şekil `--kv-*`. Regresyon: kanal seç/mesaj gönder-al çalışıyor.

**Faz 4 — Auth cila (`web/`):** *(kullanıcı 2026-06-12: ortam son ekran, sonra sprint'lere dönülüyor → **ERTELENDİ**)*
- [ ] Auth ekranlarına yeni görsel dil (kart/buton/input); akış değişmez. **Düşük öncelik** — feature sprint'leri arası fırsat işi.

**Faz 4 — Auth (`web/`):**
- [ ] Auth ekranlarına yeni görsel dil (kart/buton/input); akış değişmez

**DoD:** sıfır backend; §3 özellikleri yapılmadı; tüm ekranlar primitive kullanıyor; metin i18n + renk/şekil token; regresyon yok.
