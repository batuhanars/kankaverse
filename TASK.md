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
- [x] **R7:** `canDm` + DM erişim kontrolü incelemesinden geçti *(PM+kullanıcı satır-satır inceleme 2026-06-12: çekirdek mantık T&S-sağlam — her dalda fail-closed, blok arkadaşlıktan önce, tek choke-point REST + her DM send'de `requireNoDmBlock`, WS'de send yok = baypas vektörü yok, `deletedAt`/`isMinor` güvenli yön. Bulgular F1-F5 değerlendirildi, dispozisyonlar PLAN "Sprint 4 girdileri"ne işlendi.)*

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

- [x] **Kol-2 (`ChannelPanel` re-skin):** ortam adı başlığı (64px) + "METİN KANALLARI" + kanal satırları (mevcut `channelsStore`). Yüzen panel görünümü (home sidebar dili). **Sesli kanal bölümü EKLEME** (V2). Aktif/hover durumları Kor ile harmonize.
- [x] **Kol-3 (ortam içeriği = `TopBar` + `MessageArea` re-skin):** kanal başlığı (`#ad`) + mesaj listesi **klasik `MessageItem`** (DM baloncuğu DEĞİL — baloncuk DM'e özel, §Faz 2 kararı) + mesaj input. Yüzen panel + yuvarlak köşe (`AppView` wrapper'ına `mb-4 rounded-[var(--kv-radius-lg)]` eklendi). **Sabitlenmiş duyuru kartı → GÖSTERME** (pin backend'i yok; §3 stub).
- [x] **Kol-4 (`MemberPanel` re-skin):** yüzen panel kabuğuna geçildi (`mb-4 mr-4 rounded-lg overflow-hidden`); **içerik Sprint 6 stub kalır** ("yakında"). Gömülü string `Üye listesi çok yakında.` → `tr.json` `member.comingSoon` (i18n borcu kapatıldı). **Sahte üye listesi gösterme.**
- [x] **Ortam-bilgi paneli:** mevcut `MemberPanel` sağ panel kabuğu yeterli; üye sayısı endpoint'siz gösterilemez (sıfır-backend), ayrı panel eklenmedi.
- [x] **§3 GÖSTERME:** Etkinlikler/Hackathon kartı (V1 dışı) · Paylaşılan Medya (Sprint 5) · Sesli kanal/Sesli Ara (V2) · Sabitlenmiş duyuru (pin yok). Boş bölüm bile koyma.
- [x] **Responsive:** üye paneli `<1280` gizli (mevcut `xl:flex` korunur); kanal paneli `<768` drawer *(shell breakpoint sistemi — tam drawer UX sprint-bağımsız, şimdi visual-only; kanal paneli masaüstünde her zaman görünür)*.
- [x] **i18n + token:** `member.comingSoon` + `channel.selectChannel` `tr.json`'a taşındı; renk/şekil `--kv-*`. Regresyon: kanal seç/mesaj gönder-al çalışıyor.

**Faz 4 — Auth cila (`web/`):** → **TAMAMLANDI (2026-06-15)**
- [x] Auth ekranları görsel cila: 8 ekran (login/kayıt/şifre/2FA/doğrulama/e-posta-değişim) kartına **ince kenarlık + üstte Kor aksan şeridi** (tasarım dili: katman-ayrımı + marka aksanı; gölge yok). Zaten token+Kv* hizalıydı; akış değişmedi. web build temiz.

**DoD:** sıfır backend; §3 özellikleri yapılmadı; tüm ekranlar primitive kullanıyor; metin i18n + renk/şekil token; regresyon yok.

---

## Sprint 4A — Minör Arkadaşlık/DM T&S Kapıları + Tıkla-Ekle + Engel/Inbox (PM onaylı 2026-06-12)

> Aktif sözleşme: `contracts/SPRINT_4A_CONTRACT.md`. **R7: `FriendPermissionService.canSendFriendRequest` +
> blok-obfuscation + yaş-kapılı guard** satır satır insan incelemesi. Dev checkbox işaretler, item EKLEMEZ.
> Türetildiği kararlar: PLAN "Sprint 4 Girdileri G1-G4". **4B (Report/moderasyon) ayrı contract, hukuki görüş sonrası.**

### Backend (`api/`)
- [x] Prisma: `ChannelMember.clearedAt DateTime?` + migration (additive). Register: `isMinor` ise `profileDiscoverable=false`; migration mevcut minörlere backfill
- [x] **`FriendPermissionService.canSendFriendRequest(sender, target, method)` (§3, R7)** — self/blok(jenerik)/zaten-arkadaş/bekleyen; `USER_CLICK`→ortak-ortam zorunlu + **biri minörse jenerik ret (G1)**; `CODE`→minör dahil açık
- [x] `POST /friends/requests` → `canSendFriendRequest(…, CODE)`; **blok artık `USER_NOT_FOUND` jenerik** (G3)
- [x] **`POST /friends/requests/by-user` { userId }** (YENİ, G2) → `canSendFriendRequest(…, USER_CLICK)`; jenerik retler; rate limit 20/saat
- [x] **`GET /users/:id/card`** (YENİ) → `UserProfileCardDto` (friendStatus + selfBlocked); erişim: ortak ortam VEYA ilişki, yoksa `404` **[R7 erişim-darlık inceleme noktası]**
- [x] **G3 blok-obfuscation:** `requireNoDmBlock` + dm/friends blok dalları → jenerik (`DM_NOT_ALLOWED`/`USER_NOT_FOUND`); **`BLOCKED` istemciye dönen hiçbir yolda kalmaz**
- [x] **G4 inbox soft-delete:** `DELETE /dm/channels/:id` → çağıranın `clearedAt=now`; `GET /dm/channels` clearedAt-sonrası-mesajsız kanalı gizler; `findMessages` çağıranın clearedAt'inden sonrasını döner; **mesaj DB'de durur**
- [x] DM DTO: `canMessage` + `selfBlocked` hesapla (selfBlocked = yalnız ben→o; "o→ben" ASLA dönmez)
- [x] **Yaş-kapılı guard:** `requireChannelAccess` — `ageGated && isMinor → 403 AGE_RESTRICTED`
- [x] Yeni hata kodu `AGE_RESTRICTED`; Swagger güncel; WS `friend.request` tıkla-ekle isteğinde de yayılır

### Frontend (`web/`)
- [x] **Kullanıcı detay kartı (G2):** mesaj yazarı ad/avatar tıkla → popover (`GET /users/:id/card`); `+user` → `by-user` istek, ret **jenerik toast** (sebep gösterme); buton minöre göre **gizlenmez**; rumuz → "tam profil" minimal/stub
- [x] **Engel UX (G3):** DM'de `canMessage=false` → textarea pasif; `selfBlocked`→"Engeli kaldır", değilse **jenerik** "mesaj gönderemezsiniz"
- [x] **Inbox temizle (G4):** DM başlık "Sohbeti temizle" → `ConfirmDialog` → `DELETE /dm/channels/:id`; listeden düşer, sıfırdan açılır ("sil" değil "temizle" dili)
- [x] Yeni metin/hata kodları `tr.json`; `--kv-*` token

### Sprint 4A DoD (contract §11)
- [x] `canSendFriendRequest` matrisi birebir; **minör statüsü hiçbir yanıt/event/UI'da sızmıyor** (jenerik kodlar, buton gizlenmiyor) *(PM denetim: 18 birim test geçti)*
- [x] Tıkla-ekle çalışır; G3 engel-belirsizliği; G4 soft-delete (kayıt durur, karşı taraf etkilenmez, yeni mesajda döner) *(PM denetim: **B1 bug bulundu→düzeltildi** — clearedAt cursor'da eziliyordu, `findMessages` createdAt gt+lt tek objede birleştirildi)*
- [x] Minör `profileDiscoverable=false`; yaş-kapılı guard
- [x] **Sıralama kilidi (G1):** tıkla-ekle + minör kapısı **aynı PR** — kapısız canlıya alınmaz
- [x] **R7:** `canSendFriendRequest` + blok-obfuscation + yaş-kapılı guard incelemeden geçti *(PM+kullanıcı 2026-06-12: sızıntı disiplini temiz, blok hiçbir yolda dönmüyor, kart erişimi dar, statü gizli; kullanıcı imzaladı)*
- [ ] **Ertelenen:** uçtan-uca runtime testi (2 hesap + ortak ortam) → ortam join/davet UI gelince (PLAN açık kalem); birim test + R7 kod incelemesi bu sprint'te ✅

> **PM denetim notu (2026-06-12):** Backend+frontend onaylandı. `nest build` temiz, 18/18 test geçti. B1 (G4 clearedAt cursor ezilmesi) PM tarafından düzeltildi. Küçük açık: ölü `auth.errors.BLOCKED` i18n anahtarı (zararsız); DECLINED ters-yön dormant satır (güvenlik etkisi yok). 4B (Report/moderasyon) → hukuki görüş sonrası.

---

## Sprint 6 — Presence + Yazıyor Göstergesi + Bildirimler (gece otonom 2026-06-13)

> Sözleşme: `contracts/SPRINT_6_CONTRACT.md`. **Yalnız 6.1 (yazıyor göstergesi) gece ship edildi — T&S-nötr.**
> 6.2 (presence görünürlük) + 6.3 (bildirim kapsamı) = **proje sahibi sabah kararı** (minör görünürlüğü kilitlenmedi).

### 6.1 — Yazıyor göstergesi (T&S-nötr, ship)
**Backend (`api/`):**
- [x] Gateway `typing:start`/`typing:stop` → `requireChannelAccess` kapılı (sessiz drop) → `room:`'a `typing:update`/`typing:clear` (sender hariç); ephemeral, sıfır DB. handshake'te username önbellek (auth path değişmedi). *(a82b944 — PM incelendi: auth zayıflamadı, build temiz)*

**Frontend (`web/`):**
- [x] Typing emit (debounce 3sn) + dinleme (timeout 5sn + çoklu kullanıcı) DM+guild; i18n `typing.*` *(c5ac63c — PM incelendi: `useTyping` ephemeral, sızıntı yok, vue-tsc+vite build temiz)*
- [x] **Yan-düzeltme:** Sprint 4A `d6ed6ab` HomeView'da `DmConversation`'a `canMessage`/`selfBlocked`/`@cleared` bağlanmamıştı (TS hatası → G3 blok-UX + G4 temizle wire değildi) → düzeltildi *(Sprint 4A frontend incelememde web build çalıştırılmamıştı; açık not edildi)*

### 6.2 — Presence (✅ politika KİLİTLİ: Seçenek A, 2026-06-13 — uygulama bekliyor)

> Karar: **minör presence yalnız karşılıklı arkadaşlara; yetişkin gizlemesiz (arkadaş + ortak-ortam).** Contract §3.
> **R7:** görünürlük filtresi (minör hedef-listesi) satır-satır insan incelemesi. Dev checkbox işaretler, item EKLEMEZ.

**Backend (`api/`):**
- [x] Gateway bağlantı→`online` / disconnect→`offline` (away idle eşiği); `PresenceService` (bellek-içi, şemasız)
- [x] `dnd`/online kullanıcı-seçimi set yolu (`presence:set` WS event)
- [x] **Görünürlük filtresi (R7):** minör→yalnız arkadaş; yetişkin→arkadaş+ortak-ortam; hedef kümesi sunucuda, fail-closed — `canSeePresence` + `audienceFor`
- [x] İlk bağlanışta görülebilir kişilerin presence snapshot'ı (`presence:snapshot`)

**Frontend (`web/`):**
- [x] Durum noktası (arkadaş/DM/üye listesi) gelen veriden; `dnd`/online seçimi (UserCard popover); presence dinleme

### 6.3 — Bildirimler (✅ KİLİTLİ: Minimal/anlık, 2026-06-13)

> Karar: bell yalnız **mevcut** `friend.*` event'lerini **anlık** gösterir. Kalıcılık/Notification modeli/şema/
> mention/DM-bildirimi YOK → V1 sonrası. **Sıfır backend, R7-nötr.** Contract §4. Dev checkbox işaretler, item EKLEMEZ.

**Frontend (`web/`) — backend dokunulmaz:**
- [x] `notifications` store: oturum-içi `friend.request`/`accept`/`remove` biriktir + okunmamış sayaç
- [x] Bell stub → panel (event listesi); açınca okunmuş; sayaç rozeti; metin `tr.json`

### Sprint 6 — Revizyon R1 (sahip feedback 2026-06-13, PM onaylı; contract §4.5)

> Sahip uygulama testi sonrası 3 düzeltme. Scope creep DEĞİL (sahip talebi). R7-nötr. Dev checkbox işaretler.

- [x] **R1-a** (`web`): `FriendsRightPanel` presence'a bağlandı (PresenceDot + dinamik durum; çevrimiçi/çevrimdışı grupla) — sabit "çevrimdışı" bug'ı kapandı
- [x] **R1-b** (`api`): DM typing karşı üyenin `user:<id>` odasına yayılır (guild room-yayını korunur) → DM'e bakmasan da kutucukta görünür
- [x] **R1-b** (`web`): `DmList` kutucuğunda yazan varsa son-mesaj yerine vurgu renkli "yazıyor…"
- [x] **R1-c** (`web`): 1-1 DM sade "yazıyor…" (`useTypingLabel { named:false }`); guild isimli "X yazıyor…" korunur; `typing.simple` i18n

---

## Sprint 7A — Davet Sistemi + adultsOnly Kapısı + Ortam Ayarları (PM onaylı 2026-06-13)

> Aktif sözleşme: `contracts/SPRINT_7A_CONTRACT.md`. **R7: davet-join adultsOnly/minör kapısı + adultsOnly erişim
> enforcement** satır satır insan incelemesi. Dev checkbox işaretler, item EKLEMEZ.

### Backend (`api/`)
- [x] Prisma: `Invite` modeli + `Guild.invites`/`User.createdInvites` ilişki + migration (additive, uygulandı); `generateInviteCode` (8-char, çakışma-retry)
- [x] Invites modülü: `POST /guilds/:id/invites` (OWNER/ADMIN), `GET /guilds/:id/invites`, `DELETE /invites/:code`, `GET /invites/:code` (önizleme)
- [x] **`POST /invites/:code/join` (R7):** davet-geçerlilik → `adultsOnly && isMinor → 403 AGE_RESTRICTED` → zaten-üye → transaction (üye + uses atomik). Minör statüsü sızmıyor
- [x] **Ham-ID `POST /guilds/:id/join` KALDIRILDI** — T1 borcu kapandı (tek katılım yolu davet)
- [x] `PATCH /guilds/:id` (yalnız OWNER) — name/adultsOnly
- [x] **`requireChannelAccess` adultsOnly erişim kapısı (R7):** guild kanalı `ageGated || adultsOnly` tek isMinor sorgusu (DRY) → minör 403
- [x] Hata kodu `INVITE_INVALID`; Swagger güncel; 117 test geçti (yeni invites + adultsOnly testleri)

### Frontend (`web/`)
- [x] `api/invites.ts` + `guildsStore.joinByInvite` (ham-ID `join` kaldırıldı); katıl modalı davet kodu input + önizleme + hata eşlemesi (AGE_RESTRICTED/INVITE_INVALID/ALREADY_MEMBER)
- [x] `GuildSettingsModal` (yalnız OWNER, ChannelPanel dişli): ad düzenle + adultsOnly toggle + davet yönetimi (oluştur/kopyala/listele/iptal)
- [x] Yeni metin/hata kodları `tr.json`; `--kv-*` token; placeholder özellik (ikon/rol/emoji) gösterilmedi

### Sprint 7A DoD (contract §7)
- [x] Invite modeli + migration; davet oluştur/listele/iptal/önizleme; expiry + maxUses uygulanıyor
- [x] Davet ile katılım tek yol; ham-ID join kaldırıldı (**T1 kapandı**)
- [x] Minör adultsOnly ortama join olamaz **VE** kanallara erişemez (iki katman); minör statüsü sızmıyor
- [x] Ortam ayarları: ad + adultsOnly (OWNER) + davet yönetimi
- [x] `nest build` + `vue-tsc` temiz; 117 test geçti
- [x] **2-hesap uçtan-uca** — **sahip test etti 2026-06-13** (2 tarayıcı: davet kopyala → kodla katıl → aynı ortam + mesaj çalışıyor). Minör/adultsOnly reddi ayrıca T&S matris testinde denenecek
- [x] **R7:** davet-join kapısı + adultsOnly enforcement — PM satır-satır inceledi (temiz, fail-closed, minör statüsü sızmıyor); **sahip güven-temelli onay verdi 2026-06-13** (kendi satır-incelemesi yerine PM incelemesine güven beyanı — kayda dürüstçe işlendi)

---

## Sprint 7B — Türkçe Automod + Yeni Üye Karantinası (PM onaylı 2026-06-13)

> Aktif sözleşme: `contracts/SPRINT_7B_CONTRACT.md`. **R7: karantina entegrasyonu (`canDm`/`canSendFriendRequest`)**
> insan incelemesi. Automod = R7-hafif (PM incelemesi). Dev checkbox işaretler, item EKLEMEZ.

### Backend (`api/`)
- [x] `AutomodService.check(content)` (SharedModule) + config yasak-kelime listesi (`automod-words.ts`, 27 kelime); TR normalize (küçük harf/TR→ASCII/tekrar daralt)
- [x] `messages.service.create` automod kapısı → eşleşme `MESSAGE_BLOCKED` (**DM hariç** `if guildId`, sıfır DB/kayıt)
- [x] Karantina = `joinedAt: { lt: cutoff }` cutoff-in-query (config `quarantineHours` default 24, 0=kapalı; ayrı helper'a gerek kalmadı — DRY)
- [x] **Karantina entegrasyonu (R7):** `canDm` 4c + `canSendFriendRequest` 6a ortak-ortam → yalnız sender karantinada değilse sayılır; jenerik retler
- [x] Hata kodu `MESSAGE_BLOCKED`; birim test (automod 38 + karantina + **minör kalkanı 4a/G1 regresyonu**); 168 test geçti
- [x] **İçerik-politikası (PM):** kimlik adı (yahudi/ermeni) + yanlış-pozitif (mal/oğlak) + normalleşmiş kısaltma (amk/aq) + hafif hakaret çıkarıldı; kutsal-değer kategorisi eklendi (block-on-send; ban→4B). Bkz. memory `tr-automod-lokalizasyon`

### Frontend (`web/`)
- [x] `MESSAGE_BLOCKED` → MessageArea inline jenerik uyarı (input temizlenmez, yazınca kaybolur); `tr.json`. **Karantina UI YOK** (sessiz)

### Sprint 7B DoD (contract §6)
- [x] Automod guild kanalında çalışır, DM etkilenmez, sıfır kayıt; liste config'ten
- [x] Karantina yeni üyeyi ortak-ortam basamağıyla DM/friend başlatmaktan alıkoyar; süre dolunca normal; 0=kapalı
- [x] Minör kalkanı bozulmadı (4a/G1 testleri geçer); karantina yalnız ekledi
- [x] `nest build` + `vue-tsc` temiz; 168 test geçer
- [x] **R7:** karantina entegrasyonu — PM satır-satır inceledi (canDm 4c + friend 6a temiz, initiator-only, minör kalkanı korundu); **sahip güven-temelli onay** (automod içerik-politikası sahip yönlendirdi)

### Sprint 7B — Revizyon: Automod yanlış-pozitif sertleştirme (PM denetim, 2026-06-23)

> Açık kayıt öncesi automod denetimi. **Scope creep DEĞİL** — mevcut automod'un eşleşme mantığı
> günlük Türkçeyi yanlış bloklayan iki sistemik kusur taşıyordu (sözleşme §2 "kelime-sınırı"na da aykırı).
> R7-nötr (içerik filtresi, T&S karar yüzeyi değil). Dev checkbox işaretler.

- [x] **B1 — interior substring → token-başı (prefix) eşleşmesi:** `klasik`(→`sik`)/`kapıcı`(→`pic`)/`bisiklet` artık GEÇER; ek'li biçim (`orospusun`/`şerefsizsin`) prefix ile yakalanır
- [x] **B2 — `ı→i` katlaması kaldırıldı:** `ı`≠`i` (ayrı harf) → `sıkıntı`/`sık sık`/`sıkışık`/`şık` GEÇER, `sik`(küfür) ile `sık`(sık) ayrışır. Yan-etki: profanite `ı` içerenler (`amına…`, kutsal-değer ifadeleri) hem `ı` hem `i` yazımıyla listelendi (tembel yazım kaçışı kapandı); apostrof temizliği (`Kur'an`→`kuran`)
- [x] **Bilinen artık (kabul):** `sik` prefix'i `siklet`/`siklon`/`sikke` gibi seyrek kelimeleri yakalar — düşük frekans, `sıkıntı` kurtarmaya değer (config yorumunda belgelendi)
- [x] **Yanlış-pozitif regresyon kilidi:** automod spec 53 test (sıkıntı/sık sık/şık/klasik/kapıcı/bisiklet GEÇMELİ kilitleri); tüm api suite **758/758** + `nest build` temiz
- [x] **Liste eklendi (sahip onayı):** `yarak`/`amcık`/`ipne`/`godoş`/`götveren`/`göt veren`/`götlek` — her biri prefix-çakışma kontrollü
- [x] **Geniş liste genişletmesi → sistem mimarı (vetlenmiş küfür/argo DB'si), sonraki tur** — aynı ı/i disiplini uygulanacak; eşleşme altyapısı hazır

---

## Sprint 5 — Dosya Paylaşımı (S3-uyumlu upload + presigned + Attachment) (PM onaylı 2026-06-13)

> Aktif sözleşme: `contracts/SPRINT_5_CONTRACT.md`. **🔴 CSAM tarama GATED** (R5+hukuk; gerçek tarayıcı lansman-öncesi
> zorunlu). **R7: dosya servis erişimi `requireChannelAccess` yeniden kullanım.** Dev checkbox işaretler, item EKLEMEZ.

### Backend (`api/`)
- [x] Bağımlılık: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. `StorageService` (SharedModule, presign PUT/GET/delete, `forcePathStyle` MinIO)
- [x] MinIO dev: kök `docker-compose.yml` (minio + minio-init bucket) + `.env.example` (kök+api) S3 değişkenleri; config fail-fast
- [x] Prisma: `Attachment` + `ScanStatus` enum + `Message.attachments` + migration (uygulandı)
- [x] `POST /attachments/presign` (boyut `FILE_TOO_LARGE` + contentType allowlist `UNSUPPORTED_TYPE` → Attachment PENDING + presigned PUT)
- [x] Mesaj oluşturma genişledi (`messages.service.create`, DM dahil birleşik yol): `attachmentIds?` → sahiplik+PENDING doğrula → bağla; boş içerik+attachment geçerli
- [x] **`GET /attachments/:id` (R7):** yok/iliştirilmemiş→404 → `requireChannelAccess` → FLAGGED→BLOCKED → CLEAN-değil→NOT_READY → CLEAN→presigned GET (body'de url)
- [x] **Scan gated hook:** `attachmentScanEnabled` (default false→auto-CLEAN); CLEAN değilse servis yok; **gerçek tarama YAZILMADI** (R5 hook, loud yorum)
- [x] Hata kodları; Swagger; 192 test (attachments 16 + messages scan-gate/linking 6, S3 mock)

### Frontend (`web/`)
- [x] Mesaj input ek (📎) açıldı (MessageArea + DmConversation): seç → presign → S3'e ham PUT (ilerleme+kaldır) → `attachmentIds`
- [x] `AttachmentView` (shared, Rule of Three promote): görsel inline (CLEAN→presigned img; PENDING→işleniyor; BLOCKED→gizle); dosya→ikon+ad+indir
- [x] Boyut/tip + `ATTACHMENT_NOT_READY/BLOCKED` UX; `attachment.*` i18n + `--kv-*` token

### Sprint 5 DoD (contract §9)
- [x] StorageService + MinIO dev; presign PUT/GET çalışır
- [x] Attachment + migration; iliştirme (guild + DM birleşik yol); görsel inline + dosya indirme
- [x] Erişim kontrollü indirme; minör/adultsOnly kapıları dosyaya uygulanır (requireChannelAccess miras)
- [x] scanStatus gated: dev auto-CLEAN; CLEAN değilse servis yok; gerçek tarama R5 (hook hazır)
- [x] `nest build` + `vue-tsc` temiz; 192 test geçer
- [x] **R7:** dosya erişim kapısı + scan-gate — PM satır-satır inceledi (fail-closed, T&S kapıları miras); **sahip imzası bekliyor** (MinIO ile manuel test sonrası)
- [x] **Lansman notu PLAN'a işlendi:** `ATTACHMENT_SCAN_ENABLED=true` + gerçek CSAM tarayıcı olmadan canlıya alınmaz (PLAN R5)
- [ ] **Manuel test:** `docker compose up` (MinIO) → görsel/dosya yükle-gör (sahip) — ortam testi

### Sprint 5 — Revizyon R1 (sahip feedback 2026-06-13, PM onaylı; bug fix + UX)
- [x] **Upload reaktivite bug → kökten çözüldü:** inline pending-çentik akışı kaldırıldı (dizi-proxy mutasyon tuzağı)
- [x] **AttachmentComposeModal (WhatsApp-tarzı):** seç → büyük önizleme (görsel anında `createObjectURL`) + progress + caption + gönder; DM+ortam (shared, düz ref reaktivite)
- [x] **Tipli dosya ikonu** (`AttachmentView`): pdf/doc/docx/txt/genel SVG; **PDF "Aç"** (tarayıcı görüntüleyici) + indir. Belge içerik-thumbnail = V2 (sunucu-tarafı dönüştürme)
- [x] **Global temalı scrollbar** (`styles/main.css`): tüm chat/scroll alanları `--kv` token, ince
- [x] Tarayıcı presigned PUT (checksum fix) + DM realtime (`dm.message`) + ServerModal direkt-adım + rail title "Ortam Ekle" *(bu turda doğrulandı/çalışıyor)*

---

## Sprint 4B — Moderasyon Çekirdeği İSKELET (kurul 2026-06-13, CSAM/snapshot stub)

> Sözleşme: `contracts/SPRINT_4B_CONTRACT_DRAFT.md` §0. **R7: moderasyon→erişim enforcement** insan incelemesi.
> Kurul: iskelet kurulur; CSAM akışı + contextSnapshot içerik = STUB (deneyimli hukuk gelince §3 doldurulup revize).

### Backend (`api/`)
- [x] Prisma: `Report`/`ModerationAction`/`AuditLog` + enumlar + `User.isModerator` + migration (uygulandı)
- [x] `POST /reports` (auth, throttle 5/60s) — priority (CSAM/MINOR_SAFETY→100); **contextSnapshot minimal 4 alan** (içerik yok)
- [x] `ModeratorGuard` (`isModerator`); `GET /moderation/queue` (priority sıralı, CSAM içerik render yok); `POST /moderation/actions` (+AuditLog +report RESOLVED); `GET /audit`
- [x] **Enforcement (R7):** `ModerationService` (hasActiveBan/Mute, scope+expiry). BAN→mesaj/canDm/friend; MUTE→mesaj (scope-aware); KICK→GuildMember sil; CONTENT_REMOVE→soft-delete; WARN/SHADOW_LIMIT kayıt
- [x] `toUserDto.isModerator`; 218 test geçti
- [x] **STUB teyit:** CSAM akışı kurulmadı (yalnız priority+flag); retention/5651/legal-hold yok

### Frontend (`web/`)
- [x] `ReportModal` (sebep+açıklama→`POST /reports`, jenerik onay); giriş: mesaj hover/sağ-tık + kullanıcı kartı/DM başlık
- [x] `ModerationView` (`/moderation`, `isModerator` gated): priority-sıralı kuyruk + WARN/MUTE/KICK/BAN aksiyon; CSAM içerik render yok
- [x] `USER_BANNED`/`USER_MUTED` mesaj alanı uyarısı; `UserDto.isModerator`; i18n `report.*`/`moderation.*`/`reason.*`

### Sprint 4B DoD
- [x] Temel şikâyet CANLI; mod kuyruğu + aksiyon; AuditLog; BAN/MUTE erişime bağlı (fail-closed)
- [x] contextSnapshot minimal + CSAM stub (kurul kısıtı korundu); `nest build`+`vue-tsc` temiz, 218 test
- [x] **R7:** moderasyon→erişim enforcement PM satır-satır inceledi (BAN/MUTE doğru, jenerik sızıntısız); **sahip güven-temelli onay**
- [ ] **Deneyimli hukuk görüşü** → §3 doldur + CSAM/retention revize (beklemede; `SPRINT_4B_HUKUK_BRIEF.md`)
- [ ] **Mod yetkisi** şimdilik manuel (`isModerator` DB'den set; UI yok) — kurucu kendi hesabını mod yapar

---

## Sprint 11 — Ortam Derinleştirme V1 (PM compose 2026-06-13; kurul kapsam ŞARTLI)

> Sözleşme: `contracts/SPRINT_11_CONTRACT.md`. **DEFER:** özel kanal/rol (V3), ses (V2), forum/kategori/etkinlik.
> R7-hafif (kanal yetki + ageGated işaretleme; enforcement zaten var). Dev checkbox işaretler.

### Bitti
- [x] **Üye listesi + presence** (`GET /guilds/:id/members` + MemberPanel çevrimiçi/çevrimdışı grupla; minör görünürlük süzülü)
- [x] **Kanal CRUD** (`POST/PATCH/DELETE`, OWNER/ADMIN, son-kanal `LAST_CHANNEL` guard) + UI (+ oluştur/adlandır/sil)
- [x] **Yaş-kapılı kanal** işareti (`Channel.ageGated` toggle + 18+ rozet; minör erişemez — mevcut enforcement)
- [x] **Ortam kuralları** (`Guild.rules` + migration + PATCH + GuildSettingsModal textarea + üye gösterim)
- [x] **Ortam ikonu altıgen** (MinIO `icons/` public-read; `POST .../icon/presign` + `PATCH .../icon` storageKey-prefix güvenli; GuildSettingsModal yükle/kaldır + altıgen önizleme; rail otomatik altıgen)
- [x] `nest build`+`vue-tsc` temiz; **245 test**; migration uygulandı
- [ ] **Borç D14:** ikon scan-gate'siz public → lansman öncesi R5 scan (PLAN)

### Sistem cilası (PM compose, önizleme yolu)
- [x] **Yavaş mod** (kanal başına anti-spam): `Channel.slowModeSeconds` + migration; `PATCH /channels` ayar (OWNER/ADMIN); `messages.create` enforcement (OWNER/ADMIN muaf, DM hariç, `SLOW_MODE` + retryAfter); UI select + saat rozeti + hata gösterimi. 257 test
- [x] **Kanka kodu 6 hane** (8→6, ezberlenebilirlik) + mevcut kullanıcı backfill
- [x] **URL-tabanlı navigasyon** (kanal/DM derin-link + yenileme koruması)
- [x] **DM/grup oluşturma birleşik** ("Sohbet Başlat": 1=DM `canDm`, 2+=grup; iki T&S kapısı ayrı)
- [x] **Grup üye paneli yüzen + üye çıkar (owner) + yöneticiler daima üstte (ortam+grup) + sahip tacı**
- [x] **Mesaj düzenle/sil (kendi mesajı)** — `PATCH`/`DELETE /channels/:id/messages/:messageId` (yazar-only, automod, soft-delete); WS `message.updated`/`message.deleted`; guild+DM+grup UI + "(düzenlendi)". 290 test
- [x] **Ek UX:** görsel lightbox (sekme yok) + ek+açıklama tek birim (WhatsApp) + düzenle yalnız metinli mesajda
- [x] **Ölçü/layout token katmanı** + yan paneller tek genişlik (264) + kontrol boyutu tutarlı
- [x] **Kanal okunmamış sistemi** — `ChannelRead` + `POST /channels/:id/read` + **`unreadCount`** (kanal+guild, kendi-mesaj hariç) + WS `channel.activity`; ChannelPanel + ServerRail **kırmızı sayaç rozeti**; rail sol pill = hover/aktif (unread değil); görsel-ikon bg/hover-turuncu kaldırıldı. 310 test
- [x] **Rail özel tooltip** (Discord-tarzı, anında, ok+pill — native title gecikmesi giderildi)

---

## Sprint 12 — Grup DM (yetişkin-only, arkadaş-tabanlı) (PM compose 2026-06-13)

> Sözleşme: `contracts/SPRINT_12_CONTRACT.md`. **T&S: minör grupta YOK + arkadaş-only ekleme.** R7 incelendi.

### Backend (`api/`)
- [x] `ChannelType.GROUP_DM` + `Channel.ownerId` + migration; `isMutualFriend` helper
- [x] `POST /dm/groups` (R7 kapı: creator-minör → `GROUP_MINOR_FORBIDDEN`; üye minör/arkadaş-değil → **jenerik `NOT_FRIEND`**) + add/leave/delete(owner)/rename
- [x] `requireNoDmBlock` GROUP_DM'de atlanır (1-1'de korunur); `GET /dm/channels` discriminated (DM | GROUP_DM members[])
- [x] **R7 fix:** hedef-minör `GROUP_MINOR_FORBIDDEN` sızdırıyordu → jenerik `NOT_FRIEND` (minör ≡ non-friend, G1 korundu); 276 test

### Frontend (`web/`)
- [x] `CreateGroupModal` (kanka çoklu-seç + ad); `DmList` çoklu-avatar; `DmConversation` grup başlığı + gönderen adı + `GroupManagePanel` (üye/ekle/ayrıl/owner sil-rename)
- [x] `DmChannelDto` discriminated union; jenerik ret toast (statü sızdırma yok)

---

## Sprint 10 — Önizleme-hazırlık (kısmi, PM compose 2026-06-13)

> V1 prod-prep. Hukuki/CSAM ayağı uzman ekibe bağlı (lansman kapısı) — geliştirme bloke değil.

- [x] **Upload feature-flag** `UPLOADS_ENABLED` (default true) → presign'ler `403 UPLOADS_DISABLED` (kapalı önizlemede CSAM-taramasız yüklemeyi tek config ile kapat — D14)
- [x] **WS CORS config** (D5 borcu): gateway `*` → `FRONTEND_URL` (adapter seviyesi, dev-güvenli + `credentials`)
- [x] **Gizlilik & Şeffaflık sayfası** (`/gizlilik`, TASLAK bandı, auth linkleri) — içerik `GIZLILIK_SEFFAFLIK_TASLAK.md`; **nihai metin hukuk onayı bekliyor**
- [ ] **Bekleyen (uzman ekip):** kanıt/log saklama politikası + savcılık teslim süreci + CSAM akışı + nihai KVKK/5651 metinleri → hukukçu + siber güvenlik + CSAM uzmanı
- [ ] Config-tabanlı limit ince-ayar (throttle/cursor — D5 kalıntısı) · entitlement dikişleri → fırsatta

---

## Ortam Yönetimi — ayrıl/devret/ban + menü (sahip onaylı 2026-06-15)

> Rol/izin sistemi (granular) V3'e ertelendi (sahip kararı). Bu tur: temel ortam-yönetimi boşlukları + başlık menüsü.

- [x] **Ayrılma:** `POST /guilds/:id/leave` (OWNER ayrılamaz → `OWNER_CANNOT_LEAVE`); ChannelMember temizlik + `guild.member_left` realtime. Frontend: başlık menüsünde "Ortamdan Ayrıl" (OWNER hariç) + ConfirmDialog + anasayfaya dön.
- [x] **Sahiplik devri (R7):** `POST /guilds/:id/members/:userId/transfer` (OWNER-only; hedef OWNER, eski sahip ADMIN — atomik tx); iki `member_updated` yayını + AuditLog. Frontend: üye menüsünde "Sahipliği Devret" + onay.
- [x] **Ortam-ban (R7):** `GuildBan` modeli + migration (`20260615082326_guild_ban`); `POST .../ban` (kick hiyerarşisi + GuildBan kaydı), `GET .../bans`, `DELETE .../bans/:userId`. **Davet-join ban kontrolü** (`GUILD_BANNED`). Frontend: üye menüsünde "Yasakla" + GuildSettingsModal "Yasaklılar" bölümü (unban).
- [x] **Başlık menüsü (sahip ek-talebi):** ChannelPanel başlığındaki 3 ikon (kanal+/kategori/ayarlar) → **tek buton + Discord-tarzı dropdown** (ikon+başlık satırları): Kanal Oluştur · Kategori Oluştur · Ortam Ayarları · Ortamdan Ayrıl (role göre).
- [x] **R7 + test:** leave/transfer/ban hiyerarşi + ban-join testleri (9 yeni); **497 test** + web build temiz. *Sahip canlı test + R7 imza bekliyor.*

---

## V2 — Özellikler (PM compose, otonom 2026-06-13+)

> V1 kapsamlı bitti; V2 özelliklerine geçildi. (Ertelenenler: ses/video LiveKit, göç+Discord-OAuth, rol/izin matrisi.)

- [x] **Mesaj reaksiyonları (emoji)** — `MessageReaction` + migration; `POST`/`DELETE /channels/:id/messages/:messageId/reactions` (idempotent); MessageDto `reactions[{emoji,count,reactedByMe}]`; WS `reaction.added`/`removed`; emoji popover (8'li hızlı set) + toggle pill; guild+DM+grup. 320 test. **Fix:** çift-sayım (optimistik kaldırıldı, tek kaynak WS)
- [x] **Kapsamlı emoji picker** (`vue3-emoji-picker`, PM onaylı, koyu tema) — mesaj yazarken cursor'a emoji ekleme (guild+DM+grup) + reaksiyona "⋯ daha fazla" (tam set)
- [x] **Mesaj saati baloncuk içine** (WhatsApp) + hover aksiyonları yüzen (layout itmiyor)
- [x] **Mesaja yanıt (reply)** — `Message.replyTo` self-relation; `create` doğrulama (`INVALID_REPLY`, aynı kanal); MessageDto `replyTo{id,content,authorUsername}`; ↩ Yanıtla + input önizleme bandı + alıntı render; guild+DM+grup. 328 test
- [x] **Mesaj düzeni → klasik liste** (baloncuk bırakıldı) — ortak `MessageRow.vue` (avatar 40px + ad 16px kalın · saat 12px · gövde 16px), ardışık-yazar gruplama (>7dk yeni grup), yatay hover araç çubuğu (hızlı emoji/yanıt/⋯), satır hover vurgusu; DM+grup+ortam özdeş. README "Discord alternatifi"→"yerli ve milli"
- [x] **@bahsetme (mentions)** — `Message.mentions String[]` + migration; `resolveMentions` (token parse + erişim + **R7 yaş kapısı**: ageGated/adultsOnly kanalda minör elenir → preview sızıntısı kapalı) + ≤10 cap; MessageDto `mentions`; WS `mention` (preview token→@username, yazar hariç). Frontend: `useMentionAutocomplete` popover + gönderimde `<@id>` dönüşümü + güvenli pill render + kendi-bahsedilme sol-aksan vurgusu + `mention` bildirimi. 347 test. Sözleşme `contracts/SPRINT_V2_MENTIONS_CONTRACT.md`
- [x] **Kanal kategorileri** — `ChannelCategory` modeli + `Channel.categoryId` + migration; ayrı `modules/categories/` CRUD (POST/GET/PATCH/DELETE); cross-guild `INVALID_CATEGORY`; sil→kanallar tx ile kategorisize düşer. Frontend: gruplu katlanabilir ChannelPanel (katlama localStorage) + OWNER/ADMIN yönetim (oluştur/adlandır/sil/ata) + kanal formu kategori dropdown. 369 test. Sözleşme `contracts/SPRINT_V2_CATEGORIES_CONTRACT.md`. **Ertelendi:** sürükle-bırak reorder (position altyapısı hazır, UI yok)
- [x] **Sabitlenen mesajlar (pins)** — `Message.pinnedAt/pinnedById` + migration + `@@index([channelId,pinnedAt])`; `POST/DELETE /channels/:id/messages/:messageId/pin` (idempotent) + `GET /channels/:id/pins`; yetki guild=OWNER/ADMIN, DM/grup=üye; 50 sınırı `PIN_LIMIT`; WS `message.pinned/unpinned`; `toMessageDto.pinnedAt`. Frontend: ⋯ Sabitle/Kaldır (yetki gizleme) + `PinsPopover` (TopBar+DM başlığı) + pin rozeti + WS güncelleme. 387 test. Sözleşme `contracts/SPRINT_V2_PINS_CONTRACT.md`. **Ertelendi:** mesaja zıpla (scroll-to)
- [x] **Bahsetme bildirim fix** — vue-i18n `@` literal kaçışı (`{'@'}`) → `{username}` doğru interpolasyon
- [x] **Ortam kanal yapısı yenileme** — guild create varsayılan "Metin Kanalları" kategorisi (tx); `Channel.isPrivate` + migration; **R7** özel kanal erişimi (OWNER/ADMIN ∨ ChannelMember, jenerik `NOT_CHANNEL_MEMBER`) + `findByGuild` gizleme. Frontend: hardcoded başlık kaldırıldı (DB kategori), kanal-oluştur modal (kategori dropdown yok + üst-seviye + kategorisiz), kanal türü seçici (Metin etkin / Ses-Forum "yakında" devre dışı), özel kanal toggle + kilit rozeti, sidebar 4 köşe radius. 408 test. Sözleşme `contracts/SPRINT_V2_CHANNEL_STRUCTURE_CONTRACT.md`. **Ertelendi:** ses/forum işlevi (LiveKit/forum), "Ses Kanalları" varsayılan kategori, özel kanal üye-ekleme UI
- [x] **Header/layout cilası** — global bildirim çanı (NotificationBell ortak), grup DM Üyeler butonu, sidebar üst boşluk, kategori-oluştur üst başlıkta, kategori aksiyon butonları sabit; compose placeholder hizası + ataç ikonu; DM önizleme `<@id>`→@kullanıcı
- [x] **Mesaj arama** — `GET /channels/:id/messages/search` (requireChannelAccess gated, QUERY_TOO_SHORT, case-insensitive, DM clearedAt, cursor); frontend başlık arama ikonu + SearchPopover (debounce, durumlar). 425 test. `contracts/SPRINT_V2_SEARCH_CONTRACT.md`
- [x] **Markdown biçimlendirme** — markdown-it (html:false) + dompurify allowlist (PM onaylı dep); kalın/italik/kod/alıntı/liste/link güvenli; `<@id>` mention birleşik; XSS vektörleri bloklu; önizlemeler düz kalır. `contracts/SPRINT_V2_MARKDOWN_CONTRACT.md`
- [x] **Özel kanal üye-ekleme** — `GET/POST/DELETE /channels/:id/members` (OWNER/ADMIN; NOT_PRIVATE/NOT_GUILD_MEMBER/AGE_RESTRICTED; **R7** yetki-önce sıralama→özel-mi sızıntısı yok; ChannelMember DM'e sızmıyor doğrulandı); frontend kanal ayarları Üyeler bölümü. 447 test. `contracts/SPRINT_V2_PRIVATE_MEMBERS_CONTRACT.md`
- [x] **Ortam ayarları + üye yönetimi** — `DELETE /guilds/:id` (OWNER); `PATCH .../members/:id/role` (OWNER); `DELETE .../members/:id` (kick, **R7** hiyerarşi: OWNER korumalı, ADMIN→yalnız MEMBER, yetki-önce, ChannelMember temizliği tx). Frontend: ortam sil + MemberPanel rol/at (yetki gizleme). 468 test. `contracts/SPRINT_V2_GUILD_ADMIN_CONTRACT.md`
- [x] **UI cila turu** — emoji picker viewport-clamp/Teleport (kırpılma) + tek-örnek/kalıcı araç çubuğu + gri reaksiyon-ekle ikonu; ortam home-stili üst header (GuildTopBar: sunucu adı + çan); Mesaj İstekleri nav kaldırıldı; home arama butonu ortala/buton stili; ortam mesaj alanı min-h-0 scroll fix; global aramada Gruplar ayrı başlık; bahsetme bildirim @ fix
- [x] **Mesaja zıpla (scroll-to-message)** — pins/arama sonucuna tıkla → listede o mesaja kaydır + aksan-subtle vurgu flaşı. `useMessageJump` (singleton istek yolu + liste tarafı tüketici), `MessageRow data-message-id`, hedef yüklü değilse sınırlı geriye sayfalama (≤20 sayfa), zıplama sırasında alta-kaydırma guard'ı (MessageArea + DmConversation). Yalnız-frontend, backend değişmedi.
- [ ] **LiveKit ses kanalları (audio-only v1)** — V2 en büyük kalem. Kurul + sahip onaylı sınırlar (kayıt YOK · video ertelendi · karantina→konuşma kapalı). Sözleşme `contracts/SPRINT_V2_LIVEKIT_CONTRACT.md`; verdikt vault `kurul/verdicts/2026-06-14-livekit-ses-cocuk-guvenligi.md`. **KOD BİTTİ — R7 incelemesi + canlı test bekliyor.**
  - [x] Backend: dep (`livekit-server-sdk`) · `GUILD_VOICE` enum + `VoiceSession` + migration (uygulandı) · `modules/voice/` (token · webhook · participants) · `RealtimeService.emitToRoom` · main.ts raw-body · config fail-fast · 12 test (480 toplam yeşil)
  - [x] Frontend: dep (`livekit-client`) · `stores/voice.ts` · ses türü etkin + hoparlör ikonu · katıl/ayrıl/sustur kalıcı bar · katılımcı listesi · i18n · create `type` (DTO+servis+store) · vue-tsc+build temiz
  - [x] **Canlı test edildi (sahip):** sese bağlan/konuş/sustur/sağırlaştır çalışıyor. **Bug fix:** `@CurrentUser` obje döndürüyordu → `user.id` (500 giderildi). Discord-tarzı **VoiceRoomView** (merkez katılımcı kartları + animasyonlu konuşma halkası + kontrol barı), ses barı UserCard'a bitişik, mute/unmute-dayanıklı konuşma algısı (per-participant IsSpeakingChanged), sidebar canlı katılımcı listesi.
  - [x] **R7 İNCELEMESİ:** `/voice/token` grant + webhook imza yolu — **PM satır-satır inceledi + sahip onayladı 2026-06-14** (erişim kapısı mint'ten önce/fail-closed, audio-only zorlanıyor [canPublishSources MICROPHONE, canPublishData false], TTL 10dk, karantina konuşma kapatır; webhook ayrı controller JWT'siz + LiveKit imza doğrulamalı [ham gövde express.raw], imza hatası 401, işleme hataları yutulur)
- [x] **Frontend refactor — AppView god-component → AppShell + nested routed views** — URL=ekranın tek doğruluk kaynağı (vault `stack/frontend/component-organization` v0.2 standardı). HomeView/GuildChannelView/DmView nested; HomeSidebar self-route; useAppModals; TextChannelView + `<component :is>` (veri-varyantı). Vault pattern notu yazıldı.
- [ ] **DM sesli arama (1-1 + grup, audio-only)** — kurul + sahip onaylı (davet-anı gate · minör=arkadaş+audit · grup="sese katıl" · kayıt/video yok). Sözleşme `contracts/SPRINT_V2_DM_CALL_CONTRACT.md`; verdikt `kurul/verdicts/2026-06-14-dm-sesli-arama.md`. **UYGULAMADA.**
  - [x] Backend: token endpoint DM/GROUP_DM'e açıldı (`requireNoDmBlock` + 1-1 `canDm` re-check; GROUP_DM block) · WS davet sinyalleri (`voice:call_invite` **davet gate'i canDm**, accept/reject/cancel, `group_call_start`) · 5 yeni test (485 toplam yeşil)
  - [x] Frontend: `stores/call` + `useCall` (ring/timeout 30sn) · useSocket sinyalleri · IncomingCallModal (global) + nötr bilgi şeridi · DmConversation 1-1 telefon + grup "Sese Katıl" · VoiceConnectedBar DM/grup adı · i18n `call.*`
  - [x] **R7 İNCELEMESİ:** davet gate'i (`voice:call_invite` canDm) + DM token kapısı — **PM satır-satır inceledi + sahip onayladı 2026-06-14** (canDm ring callee'ye ulaşmadan önce/jenerik DM_NOT_ALLOWED-statü sızmıyor; token mint requireDmCallGate+canDm re-check+requireNoDmBlock+requireChannelAccess ile fail-closed). **Bulgu DM-1 düzeltildi:** accept/reject/cancel relay'i artık `otherDmMember`'da çağıran-üyelik kontrollü (sahte sinyal engellendi); 485 test geçti
  - [x] **Cila:** DM call katılımcı şeridi (sohbet alanında avatar+halka) — `DmCallPanel` (8012a87) · **giden çağrı global bar** — `OutgoingCallBar` UserCard'da (VoiceConnectedBar üstü); DM'den çıksan da "Aranıyor… {ad}" + iptal görünür, kabul edilince VoiceConnectedBar devralır (2026-06-14)
- [x] **Sahiplik devri/ortam-ban/ayrılma → TAMAMLANDI** (2026-06-15, ortam-yönetimi turu)
- [x] **Sunucu-geneli arama → TAMAMLANDI** (2026-06-15): `GET /guilds/:id/messages/search` (erişilebilir kanallarda — yaş-kapısı/özel-kanal sızıntı-güvenli; kanal-gruplu sonuç). Frontend `GuildSearchPopover` (GuildTopBar büyüteç) + eşleşen kelime highlight + **çapraz-kanal zıplama** (`useMessageJump` mount'ta bekleyen isteği tüketir). 497 test + web build temiz
- [x] **Kanal/kategori drag-reorder → TAMAMLANDI** (2026-06-15): backend toplu sıralama (`PATCH /guilds/:id/channels/reorder` + `.../categories/reorder`, OWNER/ADMIN, realtime channel/category.updated yayını); frontend **native HTML5 DnD** (yeni dep yok) — kanalı sürükle-sırala + kategoriler arası taşı + kategori başlığı sürükle-sırala; optimistik + hata→tazele; drop-hedef aksan göstergesi. **Yan-düzeltme:** kategorili kanallarda eksik `data-channel-row`/mention-highlight (REV-4 replace_all'ı tek bloğu tutmuş) eklendi. 497 test + web build temiz
- [ ] **Ertelenen (V3/CSAM-kapısı):** özel emoji (CSAM tarayıcı gelene dek)

---

## Sprint 1 DoD — PM reconcile (2026-06-13)

> Fonksiyonel olarak Sprint 2A/2B/3/4A boyunca doğrulandı (uygulama uçtan uca çalışıyor); checkbox'lar bayattı.
- [x] Mesaj geçmişi yenilemede REST'ten yükleniyor *(messages.service `findMessages`)*
- [x] 401 → otomatik refresh şeffaf *(axios interceptor, in-flight promise)*
- [x] Tüm UI metni i18n'den *(tr.json; gömülü string denetimi Faz 3'te yapıldı)*
- [x] Envelope tutarlı + Swagger üretiyor + Redis adapter bağlı
- [~] İki kullanıcı uçtan uca gerçek zamanlı mesajlaşma — kod yolu çalışıyor; **2-hesap manuel e2e** PLAN açık kalemi (ortam join UI ile birlikte)

---

## Revizeler — Sahip saha testi (Notion "Kankaverse Revizeler", 2026-06-14)

> Canlı deploy sonrası sahip + arkadaş 2-hesap testinden çıkan eksikler. PM-onaylı (sahip talebi, scope creep değil).
> Sıra: hızlı FE → ses bug'ları → bildirim yeniden-kurgu → arama genişletme. Dev checkbox işaretler.

**Hızlı FE batch (düşük risk):**
- [x] **REV-1 — Oto-scroll:** yeni mesajda otomatik dibe kayma çalışmıyordu (kök: `appendMessage` in-place push → dizi referansı değişmiyor → `watch(messages)` tetiklenmiyor). `length` izle + "dipteyse yapış" (near-bottom 120px) → loadMore/geçmiş-okuma yakalanmıyor, kendi mesajım her zaman kayıyor. MessageArea + DmConversation. *(vue-tsc+build temiz)*
- [x] **REV-2 — Textarea reset:** gönderim sonrası büyüyen textarea tek satıra dönmüyordu → `resetComposerHeight` (content temizlenince `height:auto`). İki composer.
- [x] **REV-5 — DM "Kanka Ekle":** 1-1 DM'de karşı taraf arkadaş değilse başlıkta "Kanka Ekle" butonu (Sprint 4A `by-user`; T&S kapısı backend, ret jenerik, statü sızmaz). Engelliyken/arkadaşken/istek-sonrası gizli. `friends.add/addFailed` i18n.

**Ses bug'ları (kritik):**
- [x] **REV-6 — Mikrofon kilitleniyor → ÇÖZÜLDÜ:** kök neden `resolveCanPublish` ses karantinasını OWNER/ADMIN dahil herkese uyguluyordu → sahip kendi yeni ortamında `canPublish=false` → mic kırmızı + toggle erken-return + kontrol barında mic gizli ("görünmüyor"). **Fix:** OWNER/ADMIN karantinadan muaf (anti-spam yalnız yeni MEMBER; minör/erişim kapıları bozulmadı). + Frontend `canPublish=false` iken "Dinleyici modu" pill (sessiz kafa-karışıklığı yerine). 485 test geçti
- [~] **REV-8 — Ses ekranı gecikmesi → İYİLEŞTİRİLDİ:** kabul sonrası `join` async (~1-2sn) bağlanır; o sırada DM'de hiçbir şey yoktu. `connectingChannelId` + DmCallPanel "Bağlanılıyor…" kartı → anında geri bildirim. (Bağlanma süresi inherent; "gelmedi" durumu join hatasıysa `error` görünür.)
- [ ] **REV-7 — Sesten kendiliğinden düşme:** 1-1 DM seste tekrar tekrar düşüyor. **Kök neden runtime'da** (kod-tek-başına teşhis edilemedi; unmount-leave değil). `RoomEvent.Disconnected` reason'ı konsola loglanıyor → **sahip tekrar üretip konsoldaki `[voice] LiveKit Disconnected — reason:` çıktısını paylaşacak** (DUPLICATE_IDENTITY / SERVER_SHUTDOWN / ağ ayrımı için)

**Bildirim yeniden-kurgu (büyük, backend+FE):**
- [x] **REV-4 → TAMAMLANDI:** Backend: `unreadMentionCount` (kanal+guild DTO) `mentions: { has: userId }` + lastReadAt sorgusu. Frontend: rail kırmızı sayaç → `unreadMentionCount` (beyaz pill generic aktivite KALDI); WS `mention` → kanal+guild mention sayacı anlık artış; kanal okununca sıfırlanır. **Bahsetme bandı** (`ChannelPanel` altı, tam genişlik kırmızı): tıkla→sıradaki bahsetme kanalına sidebar'da zıpla+vurgula (katlanmış kategori açılır, içine GİRMEZ), tekrar tıkla→sonraki, hepsi okununca bant kaybolur. 485 test (spec'ler 2-count'a güncellendi) + web build temiz

**Arama genişletme:**
- [x] **REV-3 — Ortam araması → TAMAMLANDI:** (1) mesaj sonuçlarında **eşleşen kelime highlight** (XSS-güvenli `<mark>`, Kor tonu — görsel karşılığı). (2) **aynı kutuda ortam üyesi arama** (`guildId` prop + members store client-side filtre, "ÜYELER" bölümü; tıkla→DM aç `canDm` kapılı + DM'e git). TopBar guildId geçer; DM bağlamında üye-arama yok. Placeholder "Mesaj veya kişi ara". web build temiz

---

## Revizeler — Sahip saha testi 2. tur (2026-06-15)

> İkinci kullanım turundan. PM-onaylı (sahip talebi). Dev checkbox işaretler.

- [ ] **REV-9 — Scroll "yeni mesaj" butonu (REV-1 evrimi):** kullanıcı yukarıda geçmiş okurken yeni mesaj gelince **otomatik kaydırma** okuduğunu böler → onun yerine sohbet sağ-altında **aşağı-ok butonu + kırmızı baloncukta gelen yeni mesaj sayısı**; tıkla→dibe in+sıfırla. Dipteyken davranış aynı (otomatik kayar). MessageArea + DmConversation. (Yan: "ilk mesajda kaymıyor 2.'de kayıyor" bug'ı da bu yapıyla biter.)
- [x] **REV-10 — Kanka Ekle re-add (R7) → TAMAMLANDI + sahip onaylı:** `canSendFriendRequest`'e mevcut 1-1 DM yolu (blok kontrolünden SONRA): DM var → izin (eski-arkadaş re-add, ortak-ortam gerekmez). Güvenli: minörün 1-1 DM'i yalnız arkadaşlıkla oluşur → cold-add vektörü yok. **REV-10b (sahip ek-talebi): engel varsa kullanıcı kendi rızasıyla kaldırmadan mesaj+arkadaş-ekle YOK** → blok Kural 3'te (REV-10'dan önce) jenerik reddedilir; 1-1 mesaj `requireNoDmBlock` ile kesilir; selfBlocked'ta "Engeli kaldır" band'ı + add-friend gizli + defansif guard. 3 yeni test (DM-izin / blok-yine-ret / DM-yok-ortak-ortam), 488 geçti
- [x] **REV-11 — Devam eden çağrıya "Sese Katıl" → TAMAMLANDI:** Backend `listParticipants` DM/GROUP_DM'e açıldı (snapshot). Frontend: DM açılışta `loadParticipants`; `hasOngoingCall` (participantsFor>0). 1-1 buton: çalıyor→İptal · **aktif çağrı→Sese Katıl (doğrudan join, ring yok)** · yoksa→telefon; bağlıyken buton yok. Grup: ongoing→doğrudan join (tekrar "başlattı" bildirimi yok), yoksa başlat+katıl. Token mint kapısı (requireDmCallGate) join'de aynen geçerli. 488 test + web build temiz
- [x] **REV-12 — Tek kişi → otomatik bitir → TAMAMLANDI:** voice store `autoEndWhenAlone` (DM/grup join'lerde true; guild ses'te false) + roomParticipants.length watcher: tek kişi (yalnız ben) 60sn sürerse `leave()`; biri katılırsa iptal. acceptCall/startGroupCall/call_accepted/REV-11 direkt-join hepsi flag'li.
- [x] **REV-13a — Görüşme süresi (Sese bağlısın barı) → TAMAMLANDI:** voice store `connectedAt`; VoiceConnectedBar anlık artan sayaç (mm:ss / h:mm:ss, tabular-nums) "SESE BAĞLISIN · 00:42". Guild ses dahil bağlı her oturumda.
- [x] **REV-13b — Ortam ses kanalı sidebar süresi (yeşil) → TAMAMLANDI:** Backend `listParticipants` → `{ startedAt, participants }` (en erken LiveKit joinedAt). voice store `channelStartedAt`/`startedAtFor` (loadParticipants snapshot + WS add/remove yönetimi). ChannelPanel: GUILD_VOICE satırında saniyede-tik **yeşil aktif-süre** rozeti. 488 test + web build temiz
- [x] **REV-14 — Realtime üye olayları → TAMAMLANDI (çekirdek):** Backend `RealtimeService.emitToUsers` + invite-join→`guild.member_joined`, kick→`guild.member_left`, rol→`guild.member_updated` (guild üyelerine yayın). Frontend: **yeni `members` store** (tek kaynak); MemberPanel + MessageArea mention autocomplete ona bağlandı (ayrı local fetch'ler kaldı); useSocket 3 event→store anlık güncelleme; atılan kişi ortamı yerel düşürür (`removeGuildLocal`), kendi rolü değişen `setMyRole`. Artık ortama katılan/atılan/rolü değişen **sayfa yenilemeden** üye listesinde+mention'da görünür. 485 test + web build temiz.
  - [x] **Kalan realtime tarama → TAMAMLANDI (kanal/kategori CRUD):** channel.created/updated/deleted + category.created/updated/deleted WS yayını (özel-kanal sızıntı-güvenli); frontend store mutasyonları + useSocket handler'ları. Artık kanal/kategori oluştur/sil/düzenle diğer üyelerde anlık. *(ortam ad/ikon değişimi → guild fetch ile; ileride istenirse guild.updated event'i)*
- [ ] **REV-6 (uzun-süre):** mic kilitlenme tek seferde gitmiş görünüyor; uzun-soluklu kullanımda tekrar çıkarsa yeniden bakılacak (sahip notu)

---

## Revizeler — Sahip saha testi 3. tur (2026-06-15)

- [x] **R3-2 — Ortama katılınca otomatik gir:** ServerModal join/create `enterGuild()` ile `router.push` (kanal route'una) → AppShell refactor sonrası `setActiveChannel` store'u güncelliyordu ama route değişmediği için ekran boştu ("rail aktif/ekran boş"). Karar: **otomatik gir** (Discord gibi); kanal yoksa yalnız aktif yap. (`5828a0c..f6c8264`)
- [x] **R3-3 — Reaksiyon ⋯ menü tıklanamıyor:** açık-menülü `MessageRow` hover-toolbar'ı `z-10`'du; sonraki mesajın toolbar'ı (DOM'da sonra, aynı z) üste boyanıp Sabitle/Şikayet tıklamasını çalıyordu → menü açıkken toolbar **z-40**. Tek fix DM+grup+ortam (hepsi MessageRow).
- [~] **R3-1 — REV-9 ortam kanalında:** kod doğrulandı — MessageArea'da REV-9 zaten **var ve DM ile özdeş** (d90f3e1'den canlı). Sahip hard-reload sonrası teyit edecek; hâlâ sorunsa spesifik repro istenecek.
- [~] **REV-7 (sesten düşme):** sahip 3. tur testinde **tekrarlanmadı**; konsol sağlıklı (LiveKit connected + publishing track), yalnız zararsız `/auth/me 401` (normal ilk-yük refresh). Muhtemelen REV-6 ile çözüldü / transient. Disconnect log'u izlemede kalır.
- [x] **REV-15 — Otomatik çevrimdışı düşme → TAMAMLANDI (sahip talebi):** Teşhis: idle/away timer YOKtu; çevrimdışı yalnız WS kopunca (connectionCount=0). Kök neden: reconnect handshake bayat access token (~15dk) ile reddediliyor → `auth_error` frontend'i **kalıcı disconnect** ediyordu → sayfa yenilenene dek çevrimdışı. **(A) Auto-boşta:** `useIdlePresence` (`@vueuse/core` `useIdle`, 5dk) → hareketsizlikte `away`, etkileşimde `online`; **manuel DND/away'a saygılı** (presence store `manualStatus`). **(B) Reconnect dayanıklılığı:** `auth_error` → token tazele (`refreshAccessToken`, axios in-flight dedup paylaşımı) + yeniden bağlan (3 deneme guard); reconnect sonrası manuel durum (DND/away) sunucuya geri uygulanır. vue-tsc + vite build temiz. **R7-nötr** (presence görünürlük karar fonksiyonu `canSeePresence` DOKUNULMADI; yalnız transport dayanıklılığı + client-side away).

---

## Sprint V3 — Rol/İzin Sistemi · Faz 3 (İzin ENFORCEMENT, R7-AĞIR)

> Aktif sözleşme: `contracts/SPRINT_V3_ROLES_CONTRACT.md` §44-81 (Faz 3 detaylı plan, sahip onaylı 2026-06-15).
> **R7-AĞIR: merge öncesi PM satır-satır inceleme + sahip imzası ZORUNLU** (kök CLAUDE.md). Dev checkbox işaretler, item EKLEMEZ.
> **Dokunulmaz (madde 6):** minör/yaş join kapıları + adultsOnly erişim enforcement'ı + CSAM kapıları izin sisteminin ÜSTÜNDE — hiçbir bayrak (ADMINISTRATOR dahil) reşit-olmayan korumasını DELMEZ.

### Backend (`api/`)
- [x] **ADMINISTRATOR bayrağı:** `common/permissions.ts` `PERMISSION_FLAGS`'a `ADMINISTRATOR` ekle (en üst). Bir rolde varsa → o rol TÜM izinlere sahip (Ortam Sil + Sahiplik Devri HARİÇ — yalnız OWNER).
- [x] **`PermissionsService` (shared):** `shared/permissions/permissions.service.ts` + `hasGuildPermission(userId, guildId, flag)` + `effectivePermissions` (DRY):
  1. üye değil → `false`
  2. `guild.ownerId === userId` veya `membership.role === OWNER` → `true`
  3. `membership.role === ADMIN` (enum, geçiş-uyum) → `true`
  4. efektif = `@everyone izinleri` ∪ `üyenin atanmış rollerinin izinleri`; `ADMINISTRATOR` içeriyorsa → `true`; aksi `flag ∈ efektif`
  - SharedModule provider + export; fail-closed.
- [x] **Hiyerarşi helper'ları:** `actorHighestPosition` (OWNER=∞, **enum-ADMIN=MAX_SAFE_INTEGER [F2]**, MEMBER=max rol position / 0).
  - Rol yönet (düzenle/sil/ata/sırala): hedef rol position < aktör; ADMINISTRATOR muaf DEĞİL; OWNER muaf. İhlal → 403 `ROLE_HIERARCHY`.
  - Üye aksiyonu (kick/ban/rol-ata): hedef üye position < aktör; OWNER asla hedef alınamaz; OWNER muaf; ADMIN-vs-ADMIN beraberlik bloklanır. İhlal → 403 `MEMBER_HIERARCHY`.
- [x] **F1 (R7, sahip onaylı):** `createRole`/`updateRole` "sahip olmadığın izni veremezsin" → `requireCanGrant` (yalnız aktörün efektif izinleri; OWNER/ADMIN/ADMINISTRATOR muaf). İhlal → 403 `CANNOT_GRANT_PERMISSION`.
- [x] **Enforcement geçişi (`requireAdminRole`/`requireOwnerOrAdmin`/inline OWNER → `hasGuildPermission`):**
  - [x] channels: kanal CRUD + reorder + özel-kanal üye → `MANAGE_CHANNELS`
  - [x] categories: kategori CRUD + reorder → `MANAGE_CHANNELS`
  - [x] roles: create/update/delete/assign/remove/reorder → `MANAGE_ROLES` + hiyerarşi
  - [x] guilds kick → `KICK_MEMBERS` + hiyerarşi; ban/unban + ban listesi → `BAN_MEMBERS` + hiyerarşi
  - [x] guilds ortam ayar (ad/ikon/kurallar) → `MANAGE_GUILD`; **`adultsOnly` GERÇEK değişim → YALNIZ OWNER [F3]**
  - [x] invites: oluştur → `CREATE_INVITE`; listele/iptal → `MANAGE_GUILD`
  - [x] messages: başkasının mesajını sil / pin → `MANAGE_MESSAGES` (kendi mesajını silme her zaman serbest)
- [x] **OWNER-only KORUNUR (bayrakla verilemez):** deleteGuild · transferOwnership · updateMemberRole (enum ADMIN/MEMBER ataması)
- [x] **Testler:** `hasGuildPermission` + `effectivePermissions` matrisi + hiyerarşi (F2 ADMIN dahil) + F1 `CANNOT_GRANT_PERMISSION` + enforcement noktaları; geriye-uyum testleri yeşil. **562 test geçti.**
- [x] **DoD:** fail-closed; izinsiz aksiyon 403; OWNER/ADMIN geriye-uyum korundu; `nest build` temiz; `prisma migrate status` temiz (şema değişikliği YOK).
- [x] **R7:** PM satır-satır inceledi (F1-F4/F6 bulundu + düzeltildi) → **sahip imzaladı 2026-06-15** (effectivePermissions fail-closed; ADMINISTRATOR `requireChannelAccess` minör/adultsOnly kapısını DELMİYOR [madde 6 korundu]; hiyerarşi OWNER'ı her durumda koruyor; sızıntı-güvenli sıra korundu). `nest build` temiz, **562 test geçti**. Ölü `requireAdminRole` util'i temizlendi.

### Frontend (`web/`) — İzinler sekmesi (sözleşme §5)
- [x] **Rol detayında "İzinler" sekmesi** (Görünüm | İzinler | Üyeleri Yönet): 16 bayrak gruplu (Genel/Üyelik/Mesaj/Ses) `KvSwitch` toggle'larıyla; **ADMINISTRATOR en üstte** danger-vurgulu kart + "tüm izinleri verir" uyarısı; admin açıkken grup toggle'ları on+disabled (görsel "hepsi verildi"). `@everyone` izinleri düzenlenebilir (Üyeler sekmesi @everyone'da gizli, İzinler görünür). Kaydet → `PATCH /roles/:id { permissions }` (mevcut `saveRole` payload'a `permissions` eklendi; `isDirty` küme-karşılaştırması). `CANNOT_GRANT_PERMISSION` i18n eklendi. Türkçe etiket/açıklamalar `tr.json`. `vue-tsc` + build temiz.
- [x] **UI yetki-kapısı izin-tabanlı — İNCE DİLİM:** `useGuildPermissions` composable (client-tarafı efektif-izin çözücü, backend `effectivePermissions` 4 adımını aynalar; backend otorite kalır — UX gating). Bağlanan noktalar: ChannelPanel settings girişi → `canOpenSettings` (artık owner-only değil; MANAGE_GUILD/ROLES/CREATE_INVITE/BAN_MEMBERS olan herkes — latent admin-erişemiyor tutarsızlığı da düzeldi), GuildSettingsView "Roller" nav → `MANAGE_ROLES`, RolesSettingsSection `canEdit` → `MANAGE_ROLES`. Ortama girince roller+üyeler yüklenir (granular çözüm için). Görünmeyen bölümde kalmama guard'ı. vue-tsc+build temiz.
- [x] **SWEEP — TAMAMLANDI:** kalan enum kontrolleri → `can(flag)`:
  - ChannelPanel `isAdmin` computed → `can('MANAGE_CHANNELS')` (kanal/kategori CRUD+reorder+özel-üye tüm ref'leri miras aldı).
  - MemberPanel: kick → `can('KICK_MEMBERS')`, ban → `can('BAN_MEMBERS')` (ayrıldı; eski `canBan=canKick` birleşikti); menü `canActOnMembers`; **rol-ata/devret OWNER-only korundu**; enum-ADMIN hedef yalnız OWNER (hiyerarşi yaklaşığı).
  - MessageArea: pin + **başkasının mesajını silme** → `can('MANAGE_MESSAGES')`; `canManageMessages` prop'u MessageItem→MessageRow→MessageActionsMenu zincirinde geçirildi (sil artık `isMine || canManageMessages`); DM'de varsayılan false (etkilenmez).
  - GuildSettingsView nav: genel→`MANAGE_GUILD`, davetler→`CREATE_INVITE`/`MANAGE_GUILD` (form CREATE_INVITE, liste/iptal MANAGE_GUILD), yasaklar→`BAN_MEMBERS`; **adultsOnly toggle OWNER-only** (non-owner disabled + not).
  - OWNER-only korundu: ortam sil/devret/adultsOnly/enum-rol-ata. Backend hiyerarşi+izni zorlar; UI gating UX. vue-tsc+build temiz.
- [x] **Küçük borç temizliği (2026-06-15):**
  - **member_updated gerçek roller:** rol-enum değişimi + sahiplik devri emit'i artık `roles: []` yerine üyenin gerçek `roleLinks`'ini gönderir (`mapRoleLinks` ortak helper, getMembers de ona geçti). Helper defansif (`?? []`) → include unutulsa çökmez. Lokal üye listesinde özel roller artık devir/rol-değişiminde sıfırlanmaz.
  - **F1 UX:** Rol İzinler sekmesinde aktörün veremeyeceği bayrak toggle'ı **gri** (`canToggleFlag` = hasAll ∨ can(flag) ∨ rolde-zaten-var); başta "yalnız sahip olduğun izni verebilirsin" notu. Backend F1'i zaten zorluyordu; bu UX katmanı.
  - **rules→description rename → YAPILDI (2026-06-16, sahip talebi):** backend kolon+DTO+servis+tipler + frontend tip/api/store/`draftDescription` + i18n DTO mesajı. Migration **veri-koruyan `RENAME COLUMN`** (drop+add DEĞİL; yerel DB'de 1 dolu değer korundu), `migrate status` temiz. i18n UI etiketleri zaten `guildSettings.description*`. **PROD migration OTOMATİK:** Railway Custom Start Command = `npx prisma migrate deploy && npm run start:prod` → her deploy'da bekleyen migration'lar app başlamadan uygulanır (başarısızsa app başlamaz = güvenli). Elle adım gerekmez. *(Not: package.json `start:prod`=düz node; Railway start command'ı override edip migrate ekliyor — repo'dan görünmez.)* Borç kapandı.
  - 562 api testi + vue-tsc + build temiz.

---

## Sprint V3 — Ortam Etkinlikleri (TASARIM KİLİTLİ 2026-06-15, uygulama 2026-06-16)

> Sözleşme: `contracts/SPRINT_V3_EVENTS_CONTRACT.md`. Sahip onaylı kapsam (3 karar). **R7-hafif:** ses-kanalı görünürlük (minör/yaş) süzme PM incelemesi.
> Ortam serüveninin **son** kalemi — etkinlik bitince ortamlar için planlı iş kalmıyor (sonra V3 yol haritası).

**Kapsam (MVP):** oluştur (3-adım sihirbaz) · listele (sidebar "Etkinlikler" sekmesi → modal kartlar) · "İlgileniyor" toggle · ses-kanalı/dış-konum · `MANAGE_EVENTS` izni · görünürlük `requireChannelAccess` mirası.

**Ertelendi (şemaya baştan düşünüldü → yarın additive):** tekrarlama motoru (`recurrence` enum hazır) · hatırlatma/otomatik başlatma/bildirim (`status` enum hazır) · kapak görseli (`coverImageId` kolon hazır; CSAM tarayıcı gelene dek kapalı) · davet-event paylaş linki · takvim görünümü.

- [x] Backend: model+enum+migration (uygulandı, `migrate status` temiz) · `MANAGE_EVENTS` (DEFAULT_EVERYONE'a girmedi) · CRUD+interest endpoint'leri · görünürlük choke-point (`canViewEvent`) · WS event_* · 24/24 test
- [x] Frontend: CreateEventWizard (3 adım+başarı) · Etkinlikler sidebar sekmesi + liste modalı · "İlgileniyor" optimistik toggle · events store/api/realtime · i18n `event.*`; `vue-tsc`+`vite build` temiz
- [x] R7-hafif inceleme (PM, görünürlük choke-point satır-satır: tek choke-point/fail-closed/jenerik 404/WS süzülü/creator kapısı sağlam; **F1 düzeltildi** — `removeInterest` görünürlük kapısı kaldırıldı, §4 "üye" semantiği + öksüz-ilgi tuzağı önlendi)
- [x] **Sahip canlı test geçti** (2026-06-16): oluştur→listele→İlgileniyor çalışıyor. Cila turu: sihirbaz varsayılanları (konum seçimsiz, ilk-kanal otomatik, bugün+1 saat) + konum butonları cursor-pointer + zengin placeholder + **kart açıklaması markdown+link render** (`renderMessageHtml`, DOMPurify-güvenli; hint "Markdown, yeni satırlar ve bağlantılar desteklenir" artık gerçek). Açık kalem: derin link `?event=` açan handler yok (sözleşmede ertelenmiş)
- [x] **Rol yönetimi UX (sahip saha-testi):** (1) rol oluşturunca **detaya gider** (geri alındı). (2) **Discord-tarzı sabit alt kaydet barı** (Teleport, `position:fixed`) — Görünüm+İzinler+Üyeler **tek "Değişiklikleri Kaydet" + "Sıfırla"**; sekme değiştirince bar kalır. (3) **Üye değişiklikleri batch'lendi** (pendingAdd/pendingRemove diff, kaydet'te uygulanır — anlık değil). (4) Üyeleri Yönet: **yalnız role sahip üyeler** + arama yanında **"Üye Ekle" modalı** (ortam üyelerinden seç). (5) **Kaydedilmemiş değişiklik guard'ı**: rol detayında dirty iken nav bölümü değiştir / kapat / listeye dön → onay (`ConfirmDialog`); "Sıfırla" sunucu durumuna döner. Rolü Sil → Görünüm sekmesi altı (kaydet'ten bağımsız). `vue-tsc`+build temiz.
- [x] **Ortam ayarları cilası (sahip):** "Ortam Kuralları" → **"Açıklama"** (Discord-tarzı alt-başlık + placeholder; backend `rules` alanı açıklama olarak yeniden kullanılır — **isim borcu**, ileride `description` rename). "Ortam İkonu" → **"Ortam Simgesi"**, "Resim Seç" → "Simge Seç". *(Gelecek vizyon — sahip notu: sunucu profili ilgi-alanı etiketleri (max 5), oynanan oyunlar, Steam/Spotify bağlama → ileride, şimdi YOK.)*

---

## Sprint V3 — Etkinlik Motoru (Track B, Faz 2) — TASARIM KİLİTLİ 2026-06-16

> Sözleşme: `contracts/SPRINT_V3_EVENTS_ENGINE_CONTRACT.md`. **Kurul budaması: SIFIR-job tasarım** (3-job motor reddedildi).
> Sahip kararları: (1) ilgi **seri üzerinde** → sanal occurrence; (2) status-job sil + reminder C1'e ertele.
> V3+ yol haritası Track B. **R7-nötr** (görünürlük/T&S choke-point değişmiyor; occurrence channelId'yi etkilemez).

**Kapsam (IN):** tekrarlama (sanal/computed occurrence, DAILY/WEEKLY/MONTHLY) · status türetme genişletmesi (ACTIVE) · `?event=` deep-link handler.
**Kapsam DIŞI:** hatırlatma/bildirim (C1) · kapak görseli (CSAM/A1) · CANCELED aksiyonu · örnek-başı ilgi/tek-örnek iptali · takvim görünümü · `recurrenceEndAt` · **yeni job · yeni migration** (her ikisi de YOK).

- [x] Backend: `computeOccurrence` saf util + birim test (40/40) · CreateEventDto recurrence kilidi kaldırıldı · EventDto computed alanlar (occurrenceStartAt/EndAt + ACTIVE status) · GET listesi occurrenceStartAt sıralı · görünürlük/WS/T&S choke-point **değişmedi** (diff'te kanıtlı)
- [x] Frontend: sihirbaz sıklık seçenekleri etkin · kart occurrence tarihi + 🔁 tekrar rozeti + ACTIVE "şu an sürüyor" rozeti · `?event=` deep-link modalı açar (MVP açık kalemi kapandı) · i18n · occurrence backend'den (FE yeniden hesaplamaz); external placeholder cilası
- [x] DoD: SIFIR job · SIFIR migration · build'ler temiz (`nest build`+`vue-tsc`+`vite build`). **Sahip testi: tekrarlama girilebiliyor ✓** (kalan canlı doğrulamalar — ACTIVE rozeti/deep-link/minör görünürlük — sahip rutininde)

---

## Sprint V3 — Etkinlik Kapak Görseli (gated) — TASARIM KİLİTLİ 2026-06-16

> Sözleşme: `contracts/SPRINT_V3_EVENTS_COVER_CONTRACT.md`. **Strateji (sahip):** kapalı/ekip-içi test için gated upload; gerçek CSAM tarayıcı = lansman paketi (şirket+hukuk). **R7-hafif:** yeni baypas YOK — mevcut scan-gated Attachment hattı (mesaj-eki ile aynı seviye).
> **Karar zinciri:** Cloudflare CSAM aracı bu mimariye uymaz (serve-time/cache, presigned erişim-kontrolünü deler) → gerçek tarama = upload-anı PhotoDNA/Safer (şirket+hukuk gerektirir, R5/A2/R6). Kapak şimdi gated yapılır, `UPLOADS_ENABLED` ile gerçek kitleye kapalı.

- [ ] Backend: `CreateEventDto.coverImageId` · `attachCover` (mesaj-eki deseni birebir: sahiplik+messageId-null+`scanEnabled?PENDING:CLEAN`) · `EventDto.coverImageUrl` (yalnız CLEAN presignGet, liste paralel) · update null/undefined/string semantiği · `INVALID_COVER_IMAGE`/`INVALID_COVER_TYPE` · SIFIR migration/scan-motoru · birim test
- [ ] Frontend: sihirbaz kapak yükleme (mevcut presign+uploadToS3) + önizleme/kaldır · `UPLOADS_ENABLED` kapalıyken alan gizli · kart kapak render · i18n + token
- [ ] DoD: build'ler temiz · sahip canlı test (UPLOADS_ENABLED=true dev MinIO → yükle/gör; false → alan yok)
- [ ] **Sahip paralel görevi:** Cloudflare R2 storage kurulumu (bucket + S3 API token → Railway `S3_*` env) — prod depolama (tarama değil)

---

## Sprint C1 — Kalıcı Bildirim Sistemi — TASARIM KİLİTLİ 2026-06-16

> Sözleşme: `contracts/SPRINT_C1_NOTIFICATIONS_CONTRACT.md`. V3+ yol haritası Track C1. **R7-hafif:** üretim yalnız T&S-süzülmüş tetikleyicilerden (resolveMentions çıktısı, friend hedefleri); friend_remove sessiz → bildirim yok.
> Sprint 6.3 oturum-içi bildirimi → kalıcı modele yükseltir. Türler: MENTION · FRIEND_REQUEST · FRIEND_ACCEPT.
> **Ertelendi:** DM mesaj bildirimi · web push · etkinlik hatırlatma (zaman-tabanlı job, ayrı follow-up) · friend_remove (T&S sessiz) · retention temizlik (D-listesi).

- [x] Backend: `Notification` model+enum+`User` ilişki+migration (uygulandı, `migrate status` temiz) · `NotificationsService`+controller (liste-cursor/okundu/sayaç) · üretim (MENTION notifyMentions paralel · FRIEND_REQUEST/ACCEPT friends.service paralel · **FRIEND_REMOVE üretmez** ✓) · WS `notification`+`notification:snapshot` (mevcut mention/friend.* DEĞİŞMEDİ) · 638 test
- [x] Frontend: store kalıcı-destekli yeniden-kurgu · bell navigasyon/zıplama (`useMessageJump`: mention→mesaja zıpla, friend→ilgili görünüm) · i18n · yenilemede durur · `vue-tsc`+`vite build` temiz
- [x] R7-hafif inceleme (PM): üretim noktaları teyit — MENTION `resolveMentions` çıktısı kaynak (yeni sorgu yok, author atlanır), FRIEND_REQUEST/ACCEPT mevcut hedeflere paralel, **friend.remove→create YOK** (sessiz korundu); sızıntı yolu yok
- [ ] **Ertelenen:** sahip 2-hesap canlı test (mention→bell→zıpla; kanka isteği→bell; yenile→durur; minör 18+ kanal mention'ı almaz)

---

## Sprint C5 — Kullanıcı Profilleri + Birleşik Ayarlar Modalı — TASARIM KİLİTLİ 2026-06-16

> Sözleşme: `contracts/SPRINT_C5_PROFILES_CONTRACT.md`. V3+ Track C5 (masaüstü-öncesi). **Var olan veri/özellikle** (Discord boş sekmeleri YOK — anti-placeholder). **R7-hafif:** card erişim + minör koruma korunur, dmPolicy minör korumayı delmez.
> Sahip kararları: avatar ERTELENDİ (D14 public-borç sınıfı genişletmemek için); kapsam = bio + dmPolicy-gizlilik + profil-görüntüleme + ayarlar modalı.
> **Ertelendi:** avatar/banner upload · bildirim-toggle (Electron) · Bağlantılar OAuth · Faturalandırma · aktivite · username değişimi · not · profileDiscoverable/mediaPolicy toggle (enforcement yok).

- [x] Backend: `User.bio`+migration (uygulı, temiz) · `PATCH /users/me` (bio≤512/dmPolicy doğrulama) · `GET /users/:id/card` genişletildi (bio/memberSince/mutualFriends/mutualGuilds, **erişim kapısı + minör koruma KORUNDU**) · `toUserDto` bio/dmPolicy · 650 test
- [x] Frontend: birleşik ayarlar modalı (`UserSettingsView`; Hesap=mevcut Section'lar taşındı/akış bozulmadı · Profil=bio · Gizlilik=dmPolicy; UserCard popover'dan; **boş sekme yok**) · profil görüntüleme (DmProfilePanel genişletildi + `FullProfileModal`, bio `renderMessageHtml` güvenli+link, ortak kanka/ortam, mevcut aksiyonlar) · i18n · `vue-tsc`+`vite build` temiz
- [x] R7-hafif inceleme (PM): card erişim kapısı (satır 100-103 `hasRelation`→404) AYNEN korundu, ek veri kapıdan SONRA; `select`'te minör/yaş alanı yok; `selfBlocked` yalnız callerBlock; dmPolicy değişimi `canDm` minör-gate'ten bağımsız (dokunulmadı)
- [ ] **Ertelenen:** sahip canlı test (profil+bio/link → başka hesaptan tam-profil; dmPolicy; minör sızmaz)

---

## Sprint C6 — Keşfet (Sunucu Keşfi) + İlgi Etiketleri + Renk Afişi — TASARIM KİLİTLİ 2026-06-16

> Sözleşme: `contracts/SPRINT_C6_DISCOVERY_CONTRACT.md`. V3+ Track C6 (masaüstü-öncesi). **R7-hafif:** Keşfet temas-genişletme → adultsOnly minöre süzülür + discoverable opt-in + Sprint 7A join gate'leri.
> Sahip kararları: minör adultsOnly görmez/gerisi görünür · max 5 ilgi etiketi (Özellikler) · afiş = **renk/gradient** (görsel afiş CSAM/ikon-scan bundle'a ertelendi) · ikon `accept="image/*"`.
> **Ertelendi:** görsel afiş · sabit-taksonomi · online sayısı · öneri algoritması.

- [x] Backend: `Guild.discoverable/tags/bannerColor`+migration (uygulı) · PATCH genişletildi · `GET /discovery/guilds` (adultsOnly minöre süzülü, **fail-closed**, memberCount) · `GET /discovery/tags` · `POST /guilds/:id/join-discovery` (**`GuildJoinService` ortak gate — Sprint 7A duplikasyonsuz reuse**; joinByInvite de ona delege) · 666 test
- [x] Frontend: Keşfet görünümü (ray pusula girişi, arama, etiket-filtre, renk-afişli kartlar, Katıl) · ayarlar Afiş(swatch)/Özellikler(5 etiket)/Keşfet-Göster · ikon `accept="image/*"` · i18n · `vue-tsc`+`vite build` temiz
- [x] R7-hafif inceleme (PM): discovery süzme `isMinor ?? true` (fail-closed) + `where adultsOnly:false`; GuildJoinService tek-kaynak gate (AGE_RESTRICTED jenerik/GUILD_BANNED); discoverable opt-in default false
- [ ] **Ertelenen:** sahip canlı test (discoverable+etiket+afiş → Keşfet görünür/filtre/katıl; minör adultsOnly görmez)

---

## Sprint Kapalı-Kayıt — Davet-Kodlu Platform Kaydı + Açık-Kayıt Anahtarı (PM compose 2026-06-18)

> Sözleşme: `contracts/SPRINT_CLOSED_REGISTRATION_CONTRACT.md`. PLAN Track G1 (kapalı-test/yayıncı-demosu fazı).
> **R7 ZORUNLU:** register mod-kapısı + atomik davet-claim + admin guard = auth/kayıt yüzeyi, satır-satır insan incelemesi.
> **KAVRAM AYRIMI:** `PlatformInvite` (hesap kaydı daveti) ≠ Sprint 7A `Invite` (guild/ortam daveti) — ayrı model, `Invite`'a dokunma.
> **T&S ORTOGONAL:** davet ≠ yaş doğrulaması; isMinor + tüm minör kısıtları aynen kalır. Dev checkbox işaretler, item EKLEMEZ.

### Backend (`api/`)
- [x] Prisma: `PlatformInvite` modeli + `User.platformInviteId`(nullable) + ilişkiler + migration (additive); **`migrate status` temiz (uygulı)**
- [x] `generateInviteCode` (8-char, çakışmada yenile; guild üreteciyle birebir aynıysa ortak util'e çıkar — Rule of Three, değilse ayrı)
- [x] `REGISTRATION_MODE` config (`open`/`invite`/`closed`, default `open`, geçersiz→`closed`) + `.env.example`
- [x] `PlatformAdminGuard` (`user.isModerator` → değilse `403 FORBIDDEN` jenerik)
- [x] **Admin:** `POST /admin/platform-invites` (maxUses/expiresInHours/note ops.) · `GET /admin/platform-invites` (durum türetilir) · `DELETE /admin/platform-invites/:id` (soft `disabledAt`)
- [x] **Public:** `GET /auth/registration-mode` → `{ mode }` (sızıntı yok)
- [x] **`register()` mod-kapısı [R7]:** `closed`→`REGISTRATION_CLOSED` · `invite`→kodsuz `INVITE_CODE_REQUIRED`, **atomik claim** (`updateMany` disabled/expiry/maxUses koşullu; null-maxUses dalı; affected!==1→`INVITE_CODE_INVALID` jenerik) + user-create aynı `$transaction` + `platformInviteId` set + rollback claim'i geri alır · `open`→kod yok sayılır
- [x] `RegisterDto.inviteCode?` (`@IsOptional @Length(8,8)`); yeni hata kodları; Swagger güncel
- [x] **D11 tekrarı YOK** — kayıt kapısı baştan atomik

### Frontend (`web/`)
- [x] `RegisterView`: mount'ta `GET /auth/registration-mode` → `open` mevcut form · `invite` davet-kodu input (zod zorunlu) · `closed` kapalı-kart; hata→Türkçe mesaj
- [x] `RegisterPayload.inviteCode?` + `api/auth.ts` + zod `lib/validation/auth.ts`
- [x] Admin davet paneli (yalnız `isModerator`): oluştur (maxUses/süre/not) → kod+kopyala · liste (uses/durum) · iptal (ConfirmDialog); non-admin giriş gizli; **placeholder/boş bölüm YOK**
- [x] i18n (`register.invite.*`, `admin.platformInvite.*`, hata kodları); `--kv-*` token; `vue-tsc`(bilinen hata hariç)+`vite build` temiz

### DoD (contract §8)
- [ ] Model+migration uygulı · bayrak 3 mod (geçersiz→closed) · admin CRUD (non-admin 403) · public mode endpoint sızıntısız
- [ ] `invite`: kodsuz→required, geçersiz→invalid (jenerik), geçerli→kayıt+uses atomik+platformInviteId · `closed`: hep kapalı · `open`: regresyon yok
- [ ] Atomik claim eşzamanlıda maxUses aşmaz; user-create hatası claim rollback; minör kodla kaydolur ama isMinor+kısıtlar aynen
- [x] **R7 (BACKEND):** mod-kapısı + atomik claim + admin guard incelendi (sahip imzası 2026-06-18) — PM satır-satır temiz; SAPMA (`$executeRaw` vs `updateMany`, Prisma kolon-kolon compare desteklemiyor) onaylandı, atomik TOCTOU-güvenli ruh korundu; fail-closed (geçersiz mode→closed) + jenerik INVITE_CODE_INVALID + T&S ortogonallik doğrulandı
- [ ] Regresyon: kayıt/giriş/guild/DM bozulmadı; `nest build`+`vue-tsc`+`vite build` temiz; testler geçer

---

## Sprint Electron — Masaüstü İstemci v1 (PM compose 2026-06-18)

> Sözleşme: `contracts/SPRINT_ELECTRON_CONTRACT.md`. PLAN Track F1. **R7-NÖTR** (istemci kabuğu; auth/T&S'e dokunmaz).
> **Mimari (sahip onaylı):** load-remote — pencere `https://kankaverse.com` yükler, bundle YOK (cookie sameSite=lax korunur).
> Dev checkbox işaretler, item EKLEMEZ.

### Yeni tier `desktop/`
- [x] `desktop/` iskelet: package.json (electron + electron-builder), src/main.js, src/preload.js, build/ ikon
- [x] **main:** BrowserWindow `loadURL(KANKAVERSE_URL ?? https://kankaverse.com)`; güvenlik (contextIsolation+sandbox açık, nodeIntegration kapalı, preload); min boyut/başlık/ikon; harici link → sistem tarayıcısı
- [x] **Tray:** ikon + menü (Aç/Çıkış); kapatma(X) → tepsiye gizle (arka planda çalış); tek-instance lock (2. başlatma öne getir); isQuitting ayrımı
- [x] **Opsiyonel:** açılışta-başlat toggle (tray, default kapalı — basit tut)
- [x] **preload:** `window.kankaverse` dar API (isElectron / focusWindow / setBadge) — IPC köprüsü

### Web (`web/`) — native bildirim katmanı (mevcut mantığı değiştirmeden)
- [x] `notifications` store yeni olayında + `document.hidden` + `window.kankaverse?.isElectron` → `new Notification(...)` (i18n metin)
- [x] `notification.onclick` → `window.kankaverse.focusWindow()` + ilgili görünüme yönlendir (mevcut router/hedef)
- [x] (opsiyonel) okunmamış sayısı → `window.kankaverse?.setBadge?.(count)`
- [x] Backend'e DOKUNMA; over-engineering yok (ses/ayar paneli yok, sadece toast); `vite build` temiz

### Paketleme
- [x] electron-builder: Windows NSIS installer (appId, productName "Kankaverse", build/icon.ico marka logodan); `npm run dist` → desktop/dist
- [x] Mac(dmg)/Linux(AppImage) config yazılı ama build edilmedi (v1 Windows)

### DoD (contract §7)
- [x] Electron canlı siteyi güvenli pencerede yükler; tray+kapat-tepsiye+tek-instance çalışır
- [x] Native toast: görünür-değilken yeni bildirim → OS toast (yalnız Electron); tıkla → pencere öne + görünüm
- [ ] Auth sürer: giriş→kapat-aç→oturum açık (cookie kavanozu kalıcı, sameSite=lax)
- [x] `npm run dist` çalışan Windows installer üretir; kurulum sonrası açılıp giriş yapılabiliyor
- [x] i18n + web build temiz; R7-nötr (auth/T&S kodu değişmedi)
