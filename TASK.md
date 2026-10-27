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
  > ⚠️ **DÜZELTME (2026-07-30):** kod bugün **6 karakter** (`send-friend-request.dto.ts` `@Length(6,6)`, örnek `K7M2QX`). Yukarıdaki "8-char" satırları o günün durumu; sonradan değişmiş. **Uzunluk DTO'dan okunur, bu dosyadan değil** — M1b sözleşmesi yazılırken bu satır yanıltma noktası oldu.
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

---

## Sprint C7 — Medya Genel Kanallara Açılım (PM compose 2026-06-30)

> Sözleşme: `contracts/SPRINT_C7_MEDIA_OPEN_CONTRACT.md` (**tek doğruluk kaynağı**). PLAN brief §4 gevşetme + D23.
> **🔴 R7 ZORUNLU:** `resolveVideoSources` revizyonu + yetki-baypas invariant'ı T&S karar fonksiyonu — diff sahip onayına
> sunulmadan merge EDİLMEZ ("AI yazdı geçti" yok). Dev checkbox işaretler, **item EKLEMEZ** (sapma → DUR, PM'e dön).

### Backend (`api/`)
- [x] **Şema:** `Channel.mediaEnabled Boolean @default(false)`; migration üret + **DB'ye uygula** (`migrate dev`→prod `migrate deploy`; `migrate status` temiz) — `20260630160812_add_channel_media_enabled` uygulandı, status temiz
- [x] **Toggle endpoint:** mevcut kanal-güncelleme yolu `mediaEnabled?: boolean` kabul eder (OWNER/ADMIN, mevcut yetki kontrolü reuse; yeni RBAC YOK); `ChannelDto.mediaEnabled` eklenir
- [x] **`resolveVideoSources` revizyon (R7 çekirdek):** kapı 2 (minör mutlak ret) GUILD_VOICE'tan KALK (DM minör reti KORUN); kapı 5 GUILD_VOICE = `mediaEnabled || ageGated || adultsOnly` ise grant, değilse `[]`; fail-closed korunur
- [x] **Yetki-baypas invariant (R7):** R11 `moveParticipant` + erişim/join + rol-grant yollarında "minör + (`ageGated` kanal | `adultsOnly` guild) → ret"; tek-katmana güvenme (savunma derinliği)
- [x] **Re-mint:** bağlam-bayatlama tetikleyicisine `mediaEnabled` değişimi eklenir (C4-C3 deseni korunur) — `channel.updated` payload'ı `mediaEnabled` taşır
- [x] **Metadata kanıt:** video oturumu metadata'sı (kim/kiminle/kanal/zaman) loglanır — mevcut `VoiceSession` + A4 snapshot reuse; ayrı tablo YAGNI
- [x] Envelope tutarlı; Swagger güncel; `nest build` temiz

### Frontend (`web/`)
- [x] **Admin toggle UI:** mevcut kanal-ayar yüzeyine `mediaEnabled` aç/kapa (GUILD_VOICE); yeni ekran açma — `ChannelPanel` ayar bölümü
- [x] **Medya kontrolleri:** kamera/ekran butonları `canPublishCamera/Screen` token bayraklarına bağlı (C4-D1 deseni); grant yoksa buton YOK (disabled placeholder bile değil)
- [x] **Kamera nudge (E2):** genel/açık kanalda ilk kamera açışta, yaş-nötr, sakin ton + çıkış-yolu eşli, bir kez (hatırla); DM/kapalı-küçük/minör-yok bağlamda çıkmaz
- [x] **Ekran nudge (E3):** ilk ekran paylaşımda tek-satır gizlilik uyarısı; detaylar ayrı "Güvenlik ipuçları" sayfasına link (modal vaaz değil) — `/guvenlik-ipuclari`
- [x] **Sade tut (E4):** yalnız 2 nudge yüzeyi; yapılandırılabilir motor KURMA; hatırlama state'i istemci-taraf basit; tüm metin i18n (`voice.nudge.*`, `--kv-*`)
- [x] **Yaş-bandı ifşa YOK:** katılımcı minör/yetişkin durumu UI'da hiçbir yerde gösterilmez; `vue-tsc`(bilinen hata hariç)+`vite build` temiz

### DoD (contract §G)
- [x] `mediaEnabled` model+migration uygulı; toggle endpoint (non-admin 403); `ChannelDto.mediaEnabled`
- [x] **Testler yeşil:** genel `mediaEnabled=false`→video yok · genel `=true`→**minör dahil** medya · `adultsOnly`/`ageGated`→`mediaEnabled`'dan bağımsız (regresyon yok) · minör→18+ move/erişim/rol=ret · DM minör↔yetişkin→video `[]` (değişmedi) · bayrak kapalı→audio-only birebir (147 test yeşil, 11 yeni C7)
- [x] Frontend: toggle UI · yetenek-kapılı kontroller · 2 nudge · güvenlik-ipuçları linki · yaş-bandı gizli
- [x] `nest build`+`vue-tsc`+`vite build` temiz; envelope+Swagger; tüm yeni metin i18n
- [x] **R7 (SAHİP İMZASI 2026-06-30):** `resolveVideoSources` (kapı 5 = `mediaEnabled||ageGated||adultsOnly`, DM minör reti korundu, fail-closed) + yetki-baypas invariant'ı (`moveParticipant` owner-muafiyetinden ÖNCE, tüm aktörlere) PM satır-satır incelendi + sahip onayladı; `requireChannelAccess` include→`mediaEnabled` dolu (sessiz-off bug yok); rol-baypas isMinor kapısıyla yapısal kapalı

---

## Sprint C8 — Avatar + Profil Afişi + Ortam Afişi (PM compose 2026-07-05)

> Sözleşme: `contracts/SPRINT_C8_AVATAR_BANNER_CONTRACT.md` (**tek doğruluk kaynağı**). Statik görsel yükleme; GIF ertelendi (premium faz).
> **🔴 R7:** `MEDIA_REMOVE` takedown + T&S DTO-yayılımı diff'i sahip onayına sunulmadan merge EDİLMEZ. Dev checkbox işaretler, **item EKLEMEZ** (sapma → DUR, PM'e dön).
> **KİLİTLİ KARAR:** minör-görünür ilk kullanıcı-upload yüzeyi; public-URL deseni (ikon/D14) + rapor+takedown (A1 tarayıcı geldiğinde bağlanır). Bkz. sözleşme §0.

### Backend (`api/`)
- [x] **Şema:** `User.bannerUrl String?` + `Guild.bannerUrl String?` + `enum ModActionType += MEDIA_REMOVE`; migration üret + **DB'ye uygula** (`migrate status` temiz)
- [x] **`ImageUploadService`** (SharedModule, exported): allowlist png/jpeg/webp (**gif yok**)+ext map · `presign(prefix,ownerId,contentType)` (uploadsEnabled/type/key) · `assertKeyPrefix` · `publicUrl` — **ikon kodu yeniden yazılmaz**
- [x] **Avatar (self):** `POST /users/me/avatar/presign` + `PATCH /users/me/avatar` (`JwtAuthGuard`+`VerifiedEmailGuard`); prefix `avatars/${userId}`; set→prefix doğrula+uploadsEnabled savunma; null→kaldır
- [x] **Profil afişi (self):** `POST /users/me/banner/presign` + `PATCH /users/me/banner`; prefix `banners/${userId}`; alan `bannerUrl`
- [x] **Ortam afişi (owner):** `POST /guilds/:id/banner/presign` + `PATCH /guilds/:id/banner` (`requireOwner`, ikon deseni); prefix `guild-banners/${guildId}`; `GuildDto.bannerUrl`
- [x] **DTO yayılımı:** `avatarUrl`+`bannerUrl` (user) → auth me · profil/kart select · üye-listesi DTO; guild `bannerUrl` → GuildDto+select
- [x] **R7 — `MEDIA_REMOVE`:** `CreateActionDto += mediaTarget` (USER_AVATAR/USER_BANNER/GUILD_BANNER/GUILD_ICON; MEDIA_REMOVE'da zorunlu); `applyInstantEnforcement` 4 hedefi null'lar (**S3 obje silmez** — referans düşer); ModeratorGuard; mesaj `CONTENT_REMOVE` yolu değişmez; audit
- [x] Envelope+Swagger; `nest build` temiz; birim test (presign type/uploadsEnabled ret · set prefix ret · MEDIA_REMOVE 4 hedef · mediaTarget-zorunlu · VerifiedEmail kapısı)
  - [x] **R7 (SAHİP İMZASI 2026-07-05):** PM satır-satır inceledi + sahip onayladı. Değişmezler: avatar/afiş set prefix'i oturum-userId'ye bağlı (kaçırma yok, `users.service.ts:209-215`) · ortam afişi requireOwner+guildId-prefix (`guilds.service.ts:388-403`) · 4 endpoint VerifiedEmailGuard · uploadsEnabled presign+set · `MEDIA_REMOVE` ModeratorGuard-gated, doğru alan null, S3 obje silmez, mesaj `CONTENT_REMOVE` yolu değişmedi, mediaTarget kayıt-öncesi zorunlu (`moderation.service.ts:66-73,189-237`). Açık küçük not: guild-hedef `MEDIA_REMOVE` yine geçerli targetUserId ister (semantik, güvenlik değil).

### Frontend (`web/`)
- [x] **API client:** `usersApi.avatarPresign/setAvatar/bannerPresign/setBanner` + `guildsApi.bannerPresign/setBanner` (mevcut `uploadToS3` reuse)
- [x] **Profil (`UserSettingsView`, Profil sekmesi):** avatar + profil afişi yükle/kaldır (progress+önizleme, tip+boyut istemci kontrolü); gating kapalıysa alan gizli
- [x] **Ortam (`GuildSettingsView`):** afiş yükle/kaldır (yalnız owner), ikon alanı yanına
- [x] **Gösterim:** avatar `UserAvatar` (mevcut) · profil afişi profil kartı üst-banner · ortam afişi ortam başlığı (`object-cover`, `--kv-radius`, `bannerColor` fallback); **placeholder şişirme yok**
- [x] **Rapor girişi:** profil→USER, ortam→GUILD `ReportModal` mevcutsa dokunma, yoksa bağla (yeni modal yok)
- [x] i18n (`profile.*`/`guild.banner*`/hata kodları) + `--kv-*`; `vue-tsc`(bilinen auth.ts hariç)+`vite build` temiz

### DoD (contract §6)
- [x] Şema+migration uygulı (`migrate status` temiz); `ImageUploadService` gif-siz; ikon kodu değişmedi
- [x] 3 yüzey presign+set (prefix+uploadsEnabled+VerifiedEmail kapıları); null→kaldır; DTO yayılımı
- [x] **R7:** `MEDIA_REMOVE` 4 hedef null (obje silmez) + mesaj yolu değişmedi + audit; rapor mevcut USER/GUILD hedefleri
- [x] Web: profil/ortam yükleme+kaldır+önizleme; gating gizleme; afiş gösterim; rapor; i18n
- [ ] `UPLOADS_ENABLED=false`→yüzeyler karanlık; build'ler temiz; sahip canlı test (canlı doğrulama sahibe kalır)
- [x] **R7 insan incelemesi:** takedown+T&S diff'i sahip imzası (2026-07-05)

---

## Sprint M0 — Mobil İskele (Track F2, PM compose 2026-07-28)

> Sözleşme: `contracts/SPRINT_M0_MOBILE_CONTRACT.md` (**tek doğruluk kaynağı**). Yeni `mobile/` tier (RN + Expo).
> **🔴 R7:** `api/` auth diff'i (bearer refresh teslimi + `Session.clientType`) sahip onayına sunulmadan merge EDİLMEZ.
> Dev checkbox işaretler, **item EKLEMEZ** (sapma → DUR, PM'e dön).
> **KİLİTLİ KARAR:** teslim kanalı oturum tipine bağlı — web session'ının refresh token'ı gövdede ASLA dönmez (sözleşme §2).

### Backend (`api/`) — R7
- [x] **Şema:** `Session.clientType String?` (null=web); additive migration üretildi + DB'ye uygulandı (`migrate status` temiz, kolon `information_schema`'da doğrulandı)
- [x] **Session açan uçlar** (`login`, `login/2fa`, `register`): `X-Client-Type` allowlist'ten (**yalnız `mobile`**, trim+lowercase) okunuyor → session o tiple açılıyor + gövdeye `refreshToken` ekleniyor; **başlıksız davranış birebir eski** (gerçek sunucuda doğrulandı)
- [x] `POST /auth/logout` **değişmedi** (dokunulmadı)
- [x] **`POST /auth/refresh`:** cookie yoksa gövdeden `{ refreshToken }` kabul; kapı çalışıyor → web token'ı gövdeden `401 REFRESH_CHANNEL_MISMATCH` (canlı doğrulandı); mobil akışta yeni refresh gövdede dönüyor + rotasyonda `clientType` devralınıyor
- [x] Rotasyon / `tokenFamily` / reuse-detection / revoke mantığı **değişmedi**; mobil akışta reuse → aile revoke canlı doğrulandı; access ömrü mobilde de aynı
- [x] Envelope + Swagger (`X-Client-Type` başlığı + yeni gövde alanları); `nest build` temiz
- [x] Birim test: 26 suite / **876 test** yeşil (auth modülü ilk kez test altında: controller + service spec)
- [x] **R7 insan incelemesi:** PM satır satır inceledi + ayrı portta gerçek sunucu/gerçek DB ile uçtan uca doğruladı; **sahip diff'i onayladı (2026-07-29)**

### Mobil (`mobile/`)
- [x] ~~Expo (TS) projesi + Expo Router iskeleti~~ + ~~`mobile/CLAUDE.md`~~ **PM kurdu 2026-07-29** (SDK 57 / RN 0.86; demo ekran+bağımlılık temizliği; `tsc` + android bundle temiz). Dev'e kalan: `EXPO_PUBLIC_API_URL` + README
- [x] README + `.env.example` (API adresi tablosu, ön koşullar, CORS uyarısı, test hesabı reçetesi)
- [x] **axios envelope client:** `Bearer` + `X-Client-Type: mobile` · `response.data.data` unwrap · 401 → tek-uçuş refresh dedup + yanıt tip doğrulaması (bozuk yanıtta `undefined` secure store'a gitmez)
- [x] **Token saklama:** refresh → `expo-secure-store`; access **yalnız bellekte**; AsyncStorage kullanılmadı
- [x] **Auth store (zustand):** iki adımlı bootstrap (tek-uçuş guard'lı) · login · 2FA challenge · logout (sunucu hatasında da yerel temizlik) · oturum-düştü geri çağrısı → `(app)` guard girişe yollar; her refresh yanıtındaki yeni token secure store'a yazılıyor
- [x] **i18n:** metro `watchFolders` çözülemedi → sözleşme §6'daki **önceden onaylı kaçış yolu** (`prestart`/`pretypecheck` kancalarıyla `tr.generated.json` üretimi, gitignore'da). Tek kaynak yine `web/src/i18n/tr.json`; kopya yok, elle bakım yok
- [x] **Tema:** design-token → `src/theme/tokens.ts`; renk/ölçü bileşene gömülmedi
- [x] **Ekranlar (üç):** Açılış (bootstrap yönlendirme) · Giriş + 2FA kod · Ortam listesi (read-only, başlıkta **çıkış yap**) + boş durum + hata durumu
- [x] Ön koşullar README'de: **emülatörde `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`** (port **3001**, fiziksel cihazda LAN IP `192.168.1.50`; `localhost` ikisinde de yanlış) + yerel DB'de 2FA'lı hesap (`Azeroth`, canlıdaki hesap değil) + Docker + `api` ayakta. **Güvenlik duvarı işi yok** (`node.exe` izni mevcut, PM doğruladı). ⚠️ **`api` CORS'una dokunma** (native'de CORS yok)

### DoD (sözleşme §1) — M0, emülatörde doğrulandı 2026-07-29
- [x] Giriş yapılıyor; **2FA'lı hesapta challenge akışı çalışıyor** (sahip `Azeroth` ile TOTP girip tamamladı)
- [x] Ortam listesi sunucudan geliyor ve görünüyor (PM doğruladı, ekran görüntülü)
- [x] Uygulama kapatılıp açılınca oturum korunuyor (PM doğruladı: `force-stop` → yeniden açılış → giriş sormadan ortam listesi; DB'de rotasyon kaydı)
- [ ] Access süresi dolunca sessiz yenileme — **kısmen doğrulandı.** Refresh + rotasyon cihazda çalışıyor (bootstrap yolu, DB'de kanıtlı) ama **401 → yeniden dene yolu zorlanarak test edilmedi.** Kapatmak için yerelde access TTL'i kısaltıp bir istek tekrarı gözlenmeli (5 dk'lık iş, M1 başında yapılabilir)
- [x] Çıkışta sunucu session'ı revoke + yerel temizlik (sahip çıkış yaptı, PM DB'den doğruladı: tüm mobil session'lar iptal)
- [ ] **Web regresyon yok:** birim testler + gerçek sunucu curl'ü ile kanıtlandı; **sahibin canlıda gözle doğrulaması kalıyor**
- [x] `mobile/` içinde gömülü kullanıcı-görünür string yok; `tr.json` kopyası yok (üretilmiş dosya gitignore'da)

---

## Sprint M1a — Mobil Gezinme Kabuğu + Mesajlaşma (Track F2, PM compose 2026-07-29)

> Sözleşme: `contracts/SPRINT_M1A_MOBILE_SHELL_CONTRACT.md` (**tek doğruluk kaynağı**).
> **R7-nötr olmalı:** kapılar backend'de, mobil yalnız sonucu gösterir. `api/`'ye dokunma ihtiyacı → **DUR**.
> Dev checkbox işaretler, **item EKLEMEZ**. Sapma → DUR, PM'e dön.
> **M0 dersi sözleşmeye gömüldü:** endpoint tablosu yol listesidir; DTO alan adları **dosyadan** okunur.

### Kabuk
- [x] **Rail + sidebar** ana ekranı (ortam ikonları altıgen · seçili ortamın kanal listesi VEYA DM listesi); M0'ın "Ortamların" ekranı **kaldırılır** (not: ilk pass rounded-square çizmişti; `react-native-svg` PM onayıyla eklendi → ortam ikonları artık web `ServerRail.vue` ile **birebir aynı 6 noktalı altıgen** maske ile çiziliyor)
- [x] **Alt tab çubuğu (3):** Ana Sayfa · Bildirimler · Sen (adlar `tr.json` → `mobile.tabs.*`)
- [x] İçerik **ayrı tam ekran** + geri oku; sağ üye paneli **YOK**

### Mesajlaşma
- [x] **Mesaj ekranı:** cursor'lu geçmiş (yukarı kaydır → eskisi), gönderme, boş/hata durumu
- [x] **WebSocket** (`socket.io-client`): token **callback ile** verilir (sabit token reconnect'te bayat kalır — web denetim bulgusu) · `channel:join/leave` · `typing:start/stop` · `message.created/updated/deleted` · `typing:update/clear`
- [x] **Arka plan/ön plan:** arka planda soket kapanır; dönüşte yeniden bağlan + **açık kanalın mesajlarını yeniden çek** (boşluk bırakma) + `channel:join` tekrar — emülatörde canlı doğrulandı
- [x] **Mention gösterimi:** `<@id>` → `@kullanıcıadı`, `<@&id>` → `@everyone` (ham token ekrana basılmaz)
- [x] **Ekler (🔴 T&S):** `GET /attachments/:id` ile adres alınır; `CLEAN` → görsel önizleme / dosya rozeti · `PENDING` → **yüklenmez**, "taranıyor" · `FLAGGED` → engellendi. Yükleme kapsam dışı (ataş düğmesi konmaz)

### DM
- [x] DM listesi (son mesaj önizleme + okunmamış) · DM mesaj ekranı · başlıkta karşı taraf → salt okunur profil kartı
- [x] **DM istekleri:** liste + kabul/ret (mobilde görünmezse kullanıcı isteği hiç göremez — dilsizlik kabul edilemez)

### Diğer ekranlar
- [x] **Bildirimler sekmesi:** liste + okunmamış vurgusu + dokunuşta ilgili kanala git (yalnız MENTION tıklanabilir — diğer tipler M1a'da hedefsiz, rapora bak)
- [x] **Sen sekmesi:** salt okunur profil + çıkış yap (ayarlar M1b — boş iskele konmaz)

### Fast-follow — sahip görsel geri bildirimi 2026-07-29 akşamı (sözleşme §8.1-A)
- [x] **Kanal listesi belirginleşsin:** metin `textSecondary`→`textBody` + `sm`→`md`, `#` ön eki `textSecondary`+`lg`, satır 40dp min yükseklik + 2dp ritim boşluğu, **seçili satır `bgElevated` dolgu + Kor `#`**. Ayırıcı çizgi konmadı (Discord ritimle ayırır). Gömülü `#fff` rozet metni token'a çevrildi. *(vurgu = **en son açılan** kanal; mobilde içerik ayrı tam ekran olduğu için "açık kanal" kalıcı değil — sözleşme okuması raporda)*
- [x] **DM rail girişi:** "M" harfi yerine **Ionicons baloncuğu** (`chatbubble` seçili / `chatbubble-outline` değil); ortam ikonları altıgen kaldı, ikon seti alt tab çubuğuyla ortak
- [x] **"Mesajlar" başlığı** büyük + kalın (`xl`/700/`textPrimary`, `mobile.home.dmEntry`); web'in `dm.sectionHeader` bölüm etiketine dokunulmadı
- [ ] Başlık altına tek satır: **dar/ikon arama** + **geniş "Arkadaş Ekle"** butonu — ⚠️ **ekranlarıyla birlikte gelir** (boş buton yasak, sözleşme §8.1-B)

### Fast-follow 2 — fiziksel cihaz turu (sözleşme §8.2, sahip 2026-07-30)
- [x] **Klavye giriş kutusunu kapatıyordu** (mesajlaşma kullanılamaz durumdaydı): `KeyboardAvoidingView` Android'de `behavior: undefined` → hiçbir şey yapmıyordu; edge-to-edge'de pencere küçülmediği için uygulama klavyenin altına çiziyordu → Android'de de `behavior="padding"`. **✅ sahip cihazda doğruladı** (girdiği yazı görünüyor, klavyeyi kapatmadan gönderebiliyor); kanıtlandığı için aynı düzeltme `login.tsx` + `two-factor.tsx`'e de uygulandı
- [x] **Ortam görseli rail'de görünüyor ✅ sahip doğruladı** → `react-native-svg`'nin uzak resmi Android'de çizdiği de böylece kanıtlandı (açık soru kapandı); tetikleyici yerel `localhost` adresiydi
- [x] **Görünmez ortam ikonu:** yedek katman (altıgen + baş harf, SVG `<Text>`) artık HER ZAMAN resmin altında → resim yüklenemezse harfe düşer, görünmez-ama-dokunulabilir öğe kalmaz. *(Yerel ayaktaki sebep ayrı: `iconUrl` = `localhost:9000` MinIO, telefondan çözülemez — kod kusuru değil, üretimde `cdn.kankaverse.com`)*
- [x] **Yeni mesaj davranışı web ile eşit:** yukarıda okurken gelen mesajlar sayılır + "aşağı in" düğmesi (`message.newMessages`); dipteysem veya mesaj benimse otomatik dibe kayar (web `MessageArea.vue` REV-1/REV-9, 120px eşiği dahil)
- [x] **Yan kusur — sonsuz dönen tekerlek:** axios'ta timeout yoktu, ulaşılamaz adreste istek askıda kalıyordu → 15sn timeout (instance + bootstrap refresh); `.env.example` LAN IP'yi varsayılan yaptı (emülatör adresi tuzağı kapandı)
- [~] **Gezinme çubuğu açık şerit → M2'YE ERTELENDİ** (sahip kararı 2026-07-30). `userInterfaceStyle` `automatic` → `dark` yapıldı (tek temamız var, beyan yanlıştı) ama sorun sürüyor. Sahip ölçümü: **yalnız ilk açılışta**, o anda tüm ekranlarda; bir kez gezinilince kalıcı olarak kayboluyor. Sebep Expo Go: native tema ayarları Expo Go'da uygulanmaz, ilk kare sistem temasıyla çizilir. Gerçek derlemede kalkması beklenir. **Varsayarak kapatılmadı → M2 ilk dev build'de doğrulanacak** (bkz. sözleşme §8.2/3 + PLAN M2 maddesi); test edilemeyecek düzeltme şimdi eklenmedi

### Fast-follow 3 — DM canlı güncelleme boşlukları (sözleşme §8.3, sahip denetim talebi 2026-07-30)

> Kök neden: mobil yalnız kanal-kapsamlı olayları dinliyordu; `user:<id>` odasına gelen olaylara kimse
> kulak vermiyordu. Kod `typecheck`+`lint` temiz, **cihazda doğrulanmadı** (bkz. sözleşme §8.3-C).

- [x] **`dm.message` → DM listesi canlı** + yeni `stores/dm.ts` (web `applyActivity` semantiği birebir); liste artık store'da, mount'a bağlı değil. **✅ sahip cihazda doğruladı:** son mesaj güncelleniyor + okunmadı noktası çıkıyor + kutucuk en üste kayıyor
- [x] **`dm.request` → mesaj isteği rozeti canlı** (web gibi sessiz)
- [x] **`notification` → bildirim sekmesi + rozeti canlı.** `mention` BİLİNÇLİ dinlenmiyor: kalıcı bildirim susturma tercihinden süzülüyor, `mention`'ı rozete bağlamak kullanıcının kapattığı bildirimi geri açardı
- [x] **DM listesinde "yazıyor…"** (web Sprint 6 R1-b/R1-c karşılığı)
- [x] **Sızıntı kapandı:** DM durumu oturum kapsamlı — çıkışta tamamen silinir (store'a taşımak, temizlenmezse sıradaki kullanıcının öncekinin listesini görmesi demekti)
- [x] **Yerel ortam:** `S3_ENDPOINT` + `S3_PUBLIC_URL` LAN IP'sine çevrildi, kayıtlı 3 adres yeniden yazıldı → ek/ikon/afiş görselleri cihazdan yüklenebilir (yoksa M1a'nın "ekler" maddesi kanıtsız kalıyordu). Yedek `api/.env.bak-localhost9000`

### M1b'ye eklenenler (sözleşme §8.1-B + §8.3-B — sözleşmesi yazılacak)
- [ ] **Yeni DM başlatma** (`POST /dm/channels`) — mobil şu an sohbet **başlatamıyor**, yalnız cevap verebiliyor
- [ ] **Grup DM yönetimi** (kur / adlandır / üye ekle-çıkar / ayrıl / sil)
- [ ] **"Sohbeti temizle"** (G4 soft-delete) · **profil kartından engelle / arkadaşlıktan çıkar**
- [ ] **`channel.activity`** — guild kanal okunmamışı canlı (DM değil, aynı sınıf boşluk)
- [ ] **Arama ekranı** — açık karar: liste içinde yerel süzme + sohbet içinde mesaj arama (mevcut uçlar); Discord'un sekmeli arama ekranı kopyalanmaz
- [ ] **Arkadaş Ekle ekranı** — 🔴 **Kanka kodu** ile (`friendCode`, 6 karakter); kendi kodunu paylaş. **Kullanıcı adıyla arama/ekleme YOK** (uç yok + brief §4 "ulaşımı zorlaştır"); rehber senkronizasyonu kapsam dışı (KVKK)

### DoD (sözleşme §1 — 11 madde; **görülerek** kapatılır)
- [x] Emülatörde doğrulandı
- [x] **Fiziksel cihazda doğrulandı** — sahip 2026-07-30'da SDK 54 sonrası kendi telefonunda uçtan uca kullandı (giriş, kanal/DM gezinme, mesaj yazma, klavye, canlı DM listesi, ortam görselleri)
- [~] İki istemci testi: **web → mobil çift yönlü akışın web ayağı gerçek sekmeyle doğrulandı** (sahip web'ten mesaj attı, mobilde anlık göründü: yeni-mesaj düğmesi + DM kutucuğu güncellemesi). **Mobil → web yönü açıkça gözlenmedi** (mobilde gönderim çalışıyor, web sekmesinde anlık görünmesi teyit edilmedi)
- [x] **Kasıtlı boşluk testi:** mobil arka plandayken web'den 3 mesaj at → ön plana dönünce üçü de görünüyor
- [ ] Reconnect bayat token'la düşmüyor (access ömrü dolduktan sonra da toparlıyor) — dolaylı kanıt var (~30dk kesintisiz oturum, 401 hiç görülmedi), **açık kanıt (log) yok**, raporda detay
- [x] `typecheck` + `lint` temiz; gömülü string yok; `api/`'ye dokunulmadı

---

## Sprint M1b — Mobil Sosyal Çekirdek (Track F2, PM compose 2026-07-30)

> Sözleşme: `contracts/SPRINT_M1B_MOBILE_SOCIAL_CONTRACT.md` (**tek doğruluk kaynağı**).
> **R7-nötr olmalı:** kapılar backend'de, mobil yalnız sonucu gösterir. `api/`'ye dokunma ihtiyacı → **DUR**.
> Kapsam sahip onaylı: sosyal çekirdek + temizle/engelle. Dev checkbox işaretler, **item EKLEMEZ**.
> **İki ders gömülü:** DTO alan adları dosyadan okunur (M0) · DoD **fiziksel cihazda** kapanır (M1a).

### Arkadaşlık
- [x] **Arkadaş Ekle ekranı** (M1a'da yeri hazırlanan geniş butondan): kendi Kanka kodum + **kopyala** + **paylaş** · kod gir → istek gönder (**`friendCode` TAM 6 KARAKTER**) · bekleyen istekler kabul/ret. *(Dev bağımlılık için doğru davranıp DURDU; **PM `expo-clipboard`'ı onayladı** — birinci-parti Expo modülü, Expo Go ile geliyor, dev build gerektirmiyor, `expo-secure-store` ile aynı sınıf. PM ekledi; metinler web'in mevcut `friends.copy`/`friends.copied` anahtarlarından, yeni anahtar açılmadı.)*
- [x] `friend.*` WS olayları dinlenir → arkadaş + istek listeleri anlık (M1a'da eklenmemişti)
- [x] Mobil `UserDto` tipine `friendCode` eklenir (sunucu zaten dönüyor — sıfır backend)
- [x] 🔴 **Kullanıcı adıyla arama/ekleme YOK** (uç yok + brief §4 "ulaşımı zorlaştır"); rehber senkronizasyonu kapsam dışı (KVKK)

### DM
- [x] **Yeni DM başlat:** arkadaş seç → `POST /dm/channels { userId }`; kanal varsa mevcut olana düşer, kopya kutucuk oluşmaz *(kod: `new-chat.tsx` + `stores/dm.ts` `createChannel` — cihazda doğrulanmadı)*
- [x] **"Sohbeti temizle"** (`DELETE /dm/channels/:id`) + onay; **dil "sil" değil "temizle"** (mesaj DB'de kalır, karşı taraf etkilenmez) *(cihazda doğrulanmadı)*
- [x] Profil kartına aksiyonlar: **engelle** (`POST /blocks`) + **arkadaşlıktan çıkar** (`DELETE /friends/:userId`), ikisi de onaylı; engel kaldır *(cihazda doğrulanmadı)*
- [x] Engel sonrası giriş kutusu M1a'daki `canMessage`/`selfBlocked` yolundan kapanır — **yeni kapı yazılmadı** (route param'ları yerel override state'e alındı, engelle/kaldır sonrası `dmApi.listChannels()` ile tazelenir) *(cihazda doğrulanmadı)*

### Grup DM
- [x] **Kur:** arkadaşlardan çoklu seçim (**1–9 üye**) + opsiyonel ad → `POST /dm/groups` *(`new-chat.tsx`, cihazda doğrulanmadı)*
- [x] **Yönet:** ad değiştir · üye ekle · üye çıkar · ayrıl · grubu sil — **yetki tablosuna göre** (ekle+ayrıl her üye; çıkar/adlandır/sil yalnız `ownerId`); yetkisiz işlem **hiç render edilmez** (disabled değil) *(`group/[id].tsx`, cihazda doğrulanmadı)*
- [x] 🔴 **T&S:** minör grup kuramaz/üye olamaz (`GROUP_MINOR_FORBIDDEN`) · üyeler arkadaş olmak zorunda (`NOT_FRIEND`); retler **jenerik**, istemci sebebi tahmin edip açıklamaya ÇALIŞMAZ (her mutasyon `extractErrorMessage` ile sunucunun hazır Türkçe mesajını gösterir, ek çeviri katmanı yok)

### Arama
- [x] **Listede yerel süzme** (M1a'da yeri hazırlanan dar/ikon buton): DM+ortam+kanal, gruplu sonuç, boş durum; ek uç yok *(`search.tsx`, cihazda doğrulanmadı)*
- [x] **Sohbet içinde mesaj arama:** `GET /channels/:id/messages/search?q=` (max 30) → sonuca dokun → mesaja git *(`MessageSearchModal.tsx` + `MessageScreen.tsx` jump-to-message; cihazda doğrulanmadı — özellikle `scrollToIndex` değişken satır yüksekliğinde RN'in bilinen kırılganlığı taşıyor, `onScrollToIndexFailed` ile telafi edildi ama gerçek cihazda görülmedi)*
- [x] **Ortam-geneli arama KULLANILMAZ** (`/guilds/:id/messages/search`) — ayrı ekran tasarımı, sözleşme §3.5

### Fast-follow — kanka isteği keşfedilebilirliği (sözleşme §10, sahip bulgusu 2026-07-30 akşamı)
- [x] **`FRIEND_REQUEST` bildirimi tıklanabilir** → Kanka Ekle ekranına gider. M1a'da hedefi olmadığı için ölüydü, M1b hedefi getirdi. `FRIEND_ACCEPT`/`GUILD_INVITE` hâlâ tıklanamaz (hedef yok, uydurulmadı)
- [x] **Sidebar'a "kanka isteği" satırı** (`notification.friendRequests`) — mesaj-isteği satırının birebir kardeşi, yalnız **gelen** istek varken görünür; sayı oturum başında çekilip `friend.*` ile canlı kalır
- [ ] **AÇIK YAPISAL BOŞLUK (§11):** mobilde "Kankalar" varış noktası yok — kanka listesi yalnız seçici ve istekler olarak beliriyor; `FRIEND_ACCEPT` hedefi de bu yüzden boş. **M1c/M1d kararı**, M1b kapsamına alınmadı

### Revizyon R1 + R2 (sahip onaylı 2026-07-30, sözleşme §12-§13)

**R1 — işlem görmüş kankalık isteği bildirimi (`api/` dokunuşu, sahip onaylı istisna):**
- [x] `notifications.service.markFriendRequestActioned` — alıcının o kişiden gelen okunmamış `FRIEND_REQUEST` bildirimleri okundu işaretlenir (silinmez; geçmiş kullanıcının kaydı)
- [x] `friends.service` **üç** yolda çağırır: kabul · ret · **karşılıklı-istek otomatik kabul dalı** (atlanırsa kullanıcı hiç "kabul et"e basmadan arkadaş olur, rozet bayat kalır)
- [x] Mobil: kabul/ret sonrası `refreshUnreadCount()` — sayı **sunucudan** yeniden okunur, istemci kendi eksiltmez
- [x] `nest build` temiz · **881 test / 26 suite yeşil** (spec mock'una yeni metot eklendi; eksikken 2 kabul testi düşüyordu). **Web de bu düzeltmeden faydalanır** ama web'de gözle doğrulanmadı

**R2 — FAB + "Yeni Mesaj" akışı (mobil):**
- [x] **FAB** sağ-altta (yalnız DM sekmesinde) → "Yeni Mesaj"; "Mesajlar" yanındaki "+" **kaldırıldı**; gölge kullanılmadı (tasarım sistemi "gölge YOK")
- [x] Sidebar'daki geniş **"Kanka Ekle" KALDI** (sahip kararı — iki kapı: sidebar + Yeni Mesaj satırı)
- [x] **"Yeni Mesaj" ekranı:** arama (yalnız kendi kanka listesinde yerel süzme) + "Yeni Grup"/"Kanka Ekle" satırları + alfabetik gruplu liste; kankaya dokun → DM
- [x] **"Yeni Grup" ekranı:** **"n/9 üye"** sayacı (kaynaktan: `@ArrayMaxSize(9)`; Discord'un "1/10"u KOPYALANMADI) + Oluştur + seçim kutulu liste; 9'da kalan satırlar devre dışı
- [x] **Türkçe yerel sıralama** (`localeCompare('tr')` + `toLocaleUpperCase('tr')`) — İ/I/Ö/Ş/Ü doğru yere düşsün
- [x] `new-chat.tsx` örtük davranışı (1 seç→DM, 2+→grup) **kaldırıldı**; paylaşılan `FriendPickerList` iki ekranda ortak (dosyalar 147/231/195 satır — 300 eşiğinin altında)

**R3 — grup kurma cilası (sözleşme §14):**
- [x] **FAB tek glif** (`MaterialCommunityIcons message-plus`) — bindirilmiş rozet düzeneği ve ölü stiller kaldırıldı; Ionicons'ta bu glif gerçekten yok, `@expo/vector-icons` seti zaten içeriyor (yeni bağımlılık yok)
- [x] **Grup adı alanı kurma ekranından kaldırıldı** (PM kararı) — grup adsız kurulur; **adlandırma yönetim ekranında KALIYOR** (mobil + web), yetenek kaldırılmadı, yalnız kurma anındaki soru kaldırıldı
- [x] **Çipli arama çubuğu** (`SelectedFriendsField`): seçilenler çip, yazdıkça süz, sonuca dokun→çip + metin temizlenir, çipten çıkar, boş alanda backspace son çipi alır. `FriendPickerList` kırılmadı, `new-message.tsx` tek-seçim akışına dokunulmadı
- [x] **Sapma düzeltildi:** adsız grup yönetim ekranında jenerik "Grup" görünüyordu (liste ve sohbet başlığı üye adlarını birleştirirken) → mantık `utils/channelTitle.ts`'e çıkarıldı, üç çağrı yeri birleşti. *Dev, PM'in "sunucu üye adlarını varsayılan yapar" ifadesinin yanlış olduğunu kaynaktan gösterdi: sunucu `null` saklıyor, birleştiren istemci.*
- [x] **Karar (§15):** grup yönetimi için sağ tık bağlam menüsü **eklenmedi** — yetenek üç istemcide de erişilebilir (masaüstü web'i yüklüyor); tetikleyici olmadan ikinci kapı açılmaz

### DoD (sözleşme §1 — 11 madde) — ✅ SAHİP CİHAZ YÜRÜYÜŞÜ 2026-07-30
- [x] Kod paylaşma (kopyala + paylaş) + kod ile istek gönderme
- [x] İstek kabul/ret anlık yansıyor · **bildirim rozeti kabul edince düşüyor** (R1 doğrulandı)
- [x] Sıfırdan DM başlatma, **kopya kanal açılmıyor**
- [x] Grup DM kur/yönet · **grup üyesinden profil kartı** (engelle/çıkar) erişilebilir
- [x] Liste süzme · **çipli arama** ile kişi seçme
- [x] Sohbet içi mesaj arama + **sonuca zıplama** (en kırılgan madde, çalıştı)
- [x] Sohbeti temizle
- [x] Adsız grup: üye adları **hem listede hem yönetim ekranında** görünüyor (R3 sapma düzeltmesinin testi)
- [x] FAB akışı: DM başlatma + kanka ekleme; FAB ikonu tek glif olarak okunur
- [x] Metin `tr.json`'dan, renk/ölçü token'dan, gömülü string yok *(PM bağımsız doğruladı: 162 anahtar eksiksiz, gömülü renk yok)*
- [x] `typecheck` + `lint` temiz *(PM yeniden koştu)*; `api/`'ye yalnız **sahip onaylı R1** dokunuşu yapıldı
- [~] **VARSAYILDI, TEST EDİLMEDİ** (yeterli yerel veri yok): çip satırının taşma davranışı · boş alanda backspace'in son çipi alması *(Android yazılım klavyelerinde `onKeyPress` garantili değil — dev açıkça işaretledi)*. Gerçek kitlede ilk fırsatta bakılır
- [ ] **Engel sonrası giriş kutusunun kapanması** — yürüyüşte ayrıca görülmedi (profil kartı erişimi doğrulandı, engelleme sonrası input davranışı değil)

---

## Sprint M1c — Mobil Hesap Yüzeyleri (Track F2, PM compose 2026-07-30)

> Sözleşme: `contracts/SPRINT_M1C_MOBILE_ACCOUNT_CONTRACT.md` (**tek doğruluk kaynağı**).
> **🔴 R7:** kayıt akışı yaş + rıza kapısıdır → diff **sahip onayı olmadan merge EDİLMEZ**.
> Dev checkbox işaretler, **item EKLEMEZ**. Sapma → DUR, PM'e dön. DoD **fiziksel cihazda** kapanır.

### Kayıt
- [x] **Kayıt ekranı** (giriş ekranına "Kayıt ol" + "Şifremi unuttum" bağlantıları)
- [~] `GET /auth/registration-mode` → kod tamam; **üç durum cihazda denenmedi** (canlıda `open`, `invite`/`closed` görülmedi)
- [x] Doğum tarihi **üç sayısal alan GG/AA/YYYY** (PM kilitli kararı — takvim seçici YOK, yeni bağımlılık YOK): `number-pad`, maxLength 2/2/4, **otomatik ilerleme + boş alanda backspace geri döner**, tek hata satırı, `YYYY-MM-DD`→ISO birleştirme
- [x] 🔴 **Yaş kapısı otoritesi sunucuda:** `UNDERAGE` (13 altı) / `INVALID_BIRTHDATE` mesajı **olduğu gibi** gösterilir; istemcide yaş hesabı yeniden yapılmaz, ne gevşetilir ne taklit edilir

### 🔴 Rıza adımı (R7 odağı)
- [x] **Onay adımı olmadan `register` çağrılmaz** — web `RegisterView` deseni birebir (buton doğrudan kaydetmez, onay ekranı açar)
- [x] Metinler web'in **mevcut `legal.*` anahtarlarından** (mobil için kısaltılmış sürüm YOK)
- [~] `/kurallar` + `/gizlilik` bağlantıları gerçekten açılıyor — **cihazda denenmedi**; kod tarafı (`Linking.openURL`); açılamazsa kullanıcı bilgilendirilir
- [x] Onay formun içine gömülü checkbox olarak KONMAZ (karar anında ayrı yüzey — rıza kalitesi)

### Şifre kurtarma
- [x] **"Şifremi unuttum"** → `POST /auth/forgot-password`; yanıt **her koşulda aynı** (hesap varlığı sızmaz), istemci çıkarım yapmaz
- [x] 🔴 `reset-password` + `verify-email` ekranları **UYGULANMADI** (bilinçli): link web'e gider, uygulamayı açması Android App Links + imzalı derleme ister → **M2 dev build**

### E-posta doğrulama (mobilde hiç yoktu)
- [x] Mobil `UserDto`'ya `emailVerified` (sunucu zaten dönüyor — sıfır backend)
- [~] Doğrulanmamışta **görünür bant + "Tekrar gönder"** — kod tamam, **cihazda görülmedi**; (`POST /auth/resend-verification`); yalnız `emailVerified === false` iken render
- [~] Zaten doğrulanmışta `409` → sunucu mesajı gösterilir

### Ortam
- [x] `EXPO_PUBLIC_WEB_URL` `.env.example`'a (yasal sayfaların kökü; `EXPO_PUBLIC_API_URL` ile karıştırılmaz)

### DoD (sözleşme §1 — 10 madde)
- [ ] Mobilden açılan hesap **web'de de çalışıyor** — denenmedi
- [x] **13 altı reddediliyor** ve kullanıcı nedenini görüyor — ✅ **sahip cihazda doğruladı** ("Kayıt için en az 13 yaşında olmalısın")
- [x] **Rıza olmadan kayıt tamamlanamıyor** — ✅ **sahip cihazda doğruladı** (onaya dokunmadan hesap açılmıyor)
- [~] Yasal metinler açılabiliyor — kod tamam, **cihazda denenmedi** (emülatörde `Linking.openURL` tarayıcı seçimi göstermiyor)
- [ ] Doğrulama bandı + "tekrar gönder" — denenmedi
- [ ] Doğrulanmamış kullanıcı ortam kuramadığında sebebi anlıyor — **M1d'de ortam kurma gelince** anlamlı olur
- [x] `forgot-password` hesap varlığını sızdırmıyor — *PM kod incelemesi (try/finally, her koşulda "gönderildi"); davranış olarak sızıntı gözle ayırt edilemez, kanıt koddur*
- [~] Kayıt modu üç durum — yalnız `open` çalışır durumda görüldü; `invite`/`closed` denenmedi
- [x] Metin `tr.json`'dan, renk/ölçü token'dan, gömülü string yok — *PM doğruladı (210 anahtar eksiksiz, gömülü renk yok)*
- [x] `typecheck` + `lint` temiz; **`api/`'ye dokunulmadı** — *PM yeniden koştu*
- [x] 🔴 **R7 — ONAYLANDI 2026-07-30, ama kanıt türü kayda geçirilmiştir:**
  **Sahip cihazda DAVRANIŞ doğrulaması yaptı** (rıza kapısı + yaş kapısı) ve **kod incelemesini bilinçle PM'e devretti** ("tek tek kodu incelemek uzun iş, cihazda çalışanı test ettim").
  Yani bu R7, "sahip satır satır okudu" biçiminde **değildir**. Cihaz testi rıza ve yaş kapılarını kod okumaktan güçlü biçimde kanıtlar; ama **mutlu yolda görünmeyen** üç şeyi kanıtlamaz ve onlar PM incelemesine dayanır: (1) token saklama (access yalnız bellek, refresh secure store, `undefined` yazılmıyor), (2) hiçbir yerde şifre loglanmıyor, (3) `forgot-password` sızıntısızlığı. **Bu ayrım ileride "R7'den geçti" denince ne kastedildiğini bilmek için burada.**

---

## Sprint M1d-0 — Mobil Hesap Merkezi + Engellenenler (Track F2, PM compose 2026-07-30)

> Sözleşme: `contracts/SPRINT_M1D0_MOBILE_FRIENDS_CONTRACT.md` (**tek doğruluk kaynağı**).
> M1c ile M1d arasına giren küçük sprint. **R7-nötr olmalı.** Dev checkbox işaretler, **item EKLEMEZ**.
> **Varlık sebebi:** engellemek şu an mobilde **geri alınamaz** olabiliyor (hiç DM'leşmediğin birini
> engellersen arkadaşlık da silindiği için kişi hiçbir yüzeyde kalmıyor).

### Yerleşim kararı (sahip itirazıyla revize edildi)
- [x] **Üst seviye "Kankalar" ekranı YOK** · alt tab çubuğu **3 eleman kalır** (4. sekme eklenmez)
- [x] **"Sen" sekmesi hesap merkezine dönüşür:** mevcut içerik korunur + iki satır (Kankalar · Engellenenler)
- [x] Sidebar'daki geniş **"Kanka Ekle" KALIR** — hızlı yol sidebar'da, yönetim "Sen"de
- [x] 🔴 **"Kankalık istekleri" satırı EKLENMEZ** — istekler zaten iki yoldan yönetiliyor (sidebar rozetli satırı + tıklanabilir bildirim); üçüncü kapı gürültü

### Ekranlar
- [x] **Kankalar** (yeni): `GET /friends`; satırda **Mesaj Gönder** (`POST /dm/channels`) + **Kankalıktan Çıkar** (onaylı); boş durum
- [x] **Engellenenler** (yeni): `blocksApi.list` eklenir (`GET /blocks` — **tek yeni uç bağlaması**); **Engeli Kaldır** (onaylı); boş durum
- [x] 🔴 Yalnız **benim engellediklerim** listelenir; "beni kim engelledi" sunucudan dönmez, istemci tahmin etmez (G3)
- [x] `FRIEND_ACCEPT` bildirimi **tıklanabilir olur** → Kankalar ekranı (M1b §10'da hedefi yoktu)
- [x] Engellenenler listesi `stores/friends.ts`'e girer → çıkışta `reset()` ile temizlenir (sızıntı sınıfı)

### Kapsam dışı (bilinçli sadelik — sahip gözlemleri)
- [ ] Profil zenginleştirme (biyografi, afiş, **GIF afiş**, üyelik tarihi) — Discord mobil de göstermiyor; mobilde afiş ekranın yarısını dekorasyona verir
- [ ] Ayarlar ekranı — sahip kuralı: "Ayarlar sekmesi sadece ayarlara özel olur, hesap merkezinden erişiriz"
- [ ] Presence noktası (altyapı yok — sahte "çevrimdışı" gösterilmez) · kanka arama · `GUILD_INVITE` hedefi (M1d)

### Revizyon R1 — DoD turu bulguları (sahip cihaz yürüyüşü 2026-07-31, sözleşme §9)

> Tur dört bulgu üretti. **Üçü var olan kusuru görünür yaptı, sprint üretmedi** (aynı desen dünkü
> 153b6bb'de de yaşandı). Biri sahip kararıyla kapsam ekledi. Gerekçelerin tamamı sözleşme §9'da.

- [x] **R1-a — engelleme yolu açıldı:** Kankalar satırında ada/avatara dokunmak profil kartını açar.
  Sözleşme §3.2 (satır aksiyonları) ile DoD #2 **kendi içinde çelişiyordu** — engelleme yalnız profil
  kartından yapılabiliyor, o kart da hiç DM'leşmediğin kişi için erişilemiyordu. **Sahip kararı:**
  satıra üçüncü düğme eklenmedi, ekran engellemenin mevcut evine bağlandı (ikinci kapı açılmadı)
- [x] **R1-b — bildirim okundu işaretlenmiyordu** (M1a'dan kalma, `FRIEND_ACCEPT` hedef alınca görünür
  oldu): işaretleme mount'ta bir kez çalışıyordu, sekmeler oturum boyunca mount'lu kaldığı için o andan
  sonra gelen hiçbir bildirim okunmuyordu + dokunuş tekil işaretleme yapmıyordu (`:id/read` mobilde hiç
  bağlı değildi). Web paritesi: **odaklanmada** + **dokunuşta**; sayı sunucudan okunur (M1b R1 kuralı)
- [x] **R1-c — engellenenin DM'inde giriş kutusu açık kalıyordu:** dünkü düzeltmenin yarım kalan yarısı.
  DM bayrak tazelemesi yalnız `unblock`'a konmuştu; profil kartı `blocksApi`'yi **doğrudan** çağırıp
  store'u atlıyordu (kartın kendi "engeli kaldır"ı dahil). **Dördüncü kopya değil sahiplik toplandı:**
  üç mutasyon da store'dan geçer, tazeleme tek yerde. *Sızıntı değildi — sunucu fail-closed reddediyordu,
  kusur arayüzün yanlış durum göstermesiydi*
- [x] 🔴 **R1-d — grup DM'de kankalık isteği** (`api/` dokunuşu, **R7**, sahip kararı): eksik olan düğme
  değil kuraldı — `canSendFriendRequest` USER_CLICK dalı ortak ortam arıyordu, grup DM sayılmıyordu.
  **Kural 6a-2:** ortak alan = ortak ortam VEYA ortak grup DM. Asıl gerekçe sahibin "onay süzgeci"
  gerekçesi değil (PM onu yarım buldu, §9'da kayıtlı): **grup DM'e minör hiçbir yoldan giremez**, yani
  yeni kapı ortak ortamdan **dar**. Minör kapısı grup dalında da açık bırakıldı (invaryanta güvenilmedi),
  blok önce reddedilir, gruptan ayrılmak izni geri alır, karantina bilinçle uygulanmadı
- [x] **R1 doğrulama:** `nest build` temiz · **887 test / 26 suite yeşil** (6 yeni) · mobil `typecheck` +
  `lint` temiz · yeni i18n anahtarı gerekmedi · hiçbir dosya 300 satırı geçmiyor

> **Klavye bulgusu kusur DEĞİLDİ:** giriş kutusu klavyenin arkasında kaldı, "gene o sorun" sanıldı.
> Git geçmişi klavye düzeltmesinden sonra yerleşimi bozan değişiklik olmadığını gösterdi → kör yama
> yapılmadı. **Uygulama tam kapatılıp açılınca düzeldi:** Metro fast refresh sonrası
> `KeyboardAvoidingView` konum ölçümü bayatlıyor. Geliştirme aracının artefaktı, kod kusuru değil.

### DoD (sözleşme §7 — **fiziksel cihazda**) — ✅ SAHİP CİHAZ YÜRÜYÜŞÜ 2026-07-31
- [x] "Sen"de iki satır görünüyor
- [x] 🔴 **Hiç DM'leşmediğim birini engelleyip engeli kaldırabiliyorum** *(sprintin varlık sebebi)* —
  engel kaldırma onay soruyor; engellenenin DM'inde "Bu kullanıcıyı engellediniz" bandı çıkıyor, engel
  kalkınca giriş kutusu geri geliyor (R1-c'nin testi)
- [x] Kankalar listesinden DM başlatma + kankalıktan çıkarma (onaylı) — ikisi de doğrulandı
- [x] `FRIEND_ACCEPT` bildirimi Kankalar'a götürüyor — **rozet de düşüyor** (R1-b doğrulandı)
- [x] Boş durumlar doğru
- [x] Metin `tr.json`'dan, token'dan; gömülü string yok *(PM bağımsız taradı: üç ekranda gömülü renk
  yok, gömülü Türkçe string yok, kullanılan anahtarların hepsi mevcut)*
- [x] `typecheck` + `lint` temiz — *PM koştu.* ⚠️ **`api/` dokunuldu:** madde "dokunulmadı" biçiminde
  kapanamaz; R1-d **sahip kararıyla** sözleşme §8'in `api/` yasağını askıya aldı, dokunuş T&S karar
  fonksiyonuna (`canSendFriendRequest`) yapıldı → **R7 kapsamında**
- [x] 🔴 **R7 — grup DM tıkla-ekle:** sahip cihazda **davranış** doğrulaması yaptı (grup DM'de kanka
  olmadığı üyeye istek gönderdi, karşı taraf kabul etti, kanka olundu). M1c'de kurulan ayrım burada da
  geçerli: bu **"sahip satır satır kodu okudu" DEĞİLDİR**. Mutlu yolda görünmeyen ve PM incelemesine
  dayanan üç şey: (1) minör kapısının grup dalında da çalışması, (2) blok önceliğinin bozulmaması,
  (3) gruptan ayrılınca iznin düşmesi. Üçü de **birim testle** sabitlendi (6 yeni test), kanıt orada

---

## Sprint M1d — Mobil Ortam Bütünlüğü (Track F2, PM compose 2026-07-31)

> Sözleşme: `contracts/SPRINT_M1D_MOBILE_GUILDS_CONTRACT.md` (**tek doğruluk kaynağı**).
> **R7-nötr olmalı:** katılma kapıları Sprint 7A'da sunucuya yazıldı ve R7'den geçti, mobil yalnız
> sonucu gösterir. `api/`'ye dokunma ihtiyacı → **DUR** (bu sefer istisna beklenmiyor).
> Dev checkbox işaretler, **item EKLEMEZ**. DoD **fiziksel cihazda** kapanır.
>
> **Varlık sebebi:** mobilde ortama katılmanın **hiçbir yolu yok** — kullanıcı üyesi olduğu ortamları
> görüyor ama yenisine giremiyor, yeni ortam da kuramıyor.
>
> **Kilitli sıra (sahip kararı):** davetle katılma → ortam kurma → davet paylaşma → kategoriler.
> Sprint **iki yarıya bölündü**; DoD-A kapanmadan DoD-B'ye geçilmez.

### A yarısı — ortama girebilmek
- [x] `guildsApi` genişletmesi: `create` · `previewInvite` · `joinByInvite` · `createInvite` · `listInvites` ·
  `getMembers` (yeni uç **yazılmadı**, mevcut uçlar bağlandı). *`revokeInvite` bağlanmadı — davet
  iptal ekranı kapsam dışı (§7), kullanılmayan uç bağlamak ölü kod olurdu.*
- [x] **Ortama Katıl ekranı:** kod girişi (**tam link yapıştırılırsa koda indirgenir**) + önizleme
  (`GET /invites/:code` → **yalnız `guildName`/`adultsOnly`/`valid` döner**, ikon/üye sayısı YOK).
  Giriş büyük harfe zorlanır (`autoCapitalize="characters"`)
- [x] `ALREADY_MEMBER` (409) **hata gibi gösterilmez** → kullanıcı ana ekrana döner, liste tazelenir.
  Tek kod-bazlı dallanma bu; `extractErrorCode` eklendi ve "metin uydurma kapısı değildir" notuyla sınırlandı
- [x] **Ortam Kur ekranı:** ad → `POST /guilds` → içine düş (ad 2-64, DTO sabitinin aynası)
- [x] 🔴 `403 EMAIL_NOT_VERIFIED` → sunucu mesajı + **M1c'nin `EmailVerificationBanner` bileşeni**
  (yeni akış/anahtar yazılmadı) *(M1c'den sarkan DoD maddesi burada kapandı)*
- [x] **Davet üret & paylaş** (OWNER/ADMIN): kopyala + paylaş; link formatı **web ile birebir**
  (`<web-origin>/invite/<code>`); `maxUses`/`expiresInHours` sorulmadı
- [x] **Rail "+" → iki seçenek** (Katıl / Kur), web `ServerModal` `choose` adımının karşılığı
- [x] Katılma/kurma sonrası ray tazelenir — **yeni guild store AÇILMADI** (route parametresiyle
  `fetchGuilds` yeniden çalışır, parametre işlenince temizlenir)

### A yarısı — DoD turu bulguları (sahip cihaz + web yürüyüşü 2026-07-31)

- [x] 🔴 **Davet ekranı her açılışta YENİ kod üretiyordu** (sahip bulgusu). İki sonucu vardı:
  kullanıcı paylaştığı kodun değiştiğini görüyor, ve her açılış veritabanına bir davet satırı daha
  yazıyordu (sessiz çöp). Düzeltme: önce `listInvites`, aktif davet varsa onu göster, yoksa üret;
  kod yalnız kullanıcı bilinçli "Davet Oluştur" derse değişir. **Aynı kusur web'de de vardı**
  (`InvitePeopleModal` mount'ta `create` çağırıyordu) → web'de de düzeltildi
- [x] 🔴 **Web: davet kodu küçük harfle çalışmıyordu** (sahip bulgusu, sahip shift'e basarak farkında
  olmadan atlıyordu). Kozmetik DEĞİL: kodlar büyük harf base32 üretiliyor (`short-code.util.ts`,
  I/O/0/1 yok) ve arama `findUnique({ where: { code } })` yani **harf duyarlı** → küçük harfli kod
  "davet geçersiz" veriyordu. Düzeltme iki katman: `uppercase` sınıfı (yalnız görünüm) **+ gönderim
  öncesi `.toUpperCase()`** — CSS tek başına konsaydı hata gizlenirdi, kod ekranda büyük görünüp
  küçük gönderilirdi. Katılma çağrısına **ve önizleme sorgusuna** ayrı ayrı uygulandı (yoksa
  önizleme "geçersiz" derken Katıl çalışır, iki yüzey birbirini yalanlar). Desen `FriendAddModal`
  ile aynı
- [ ] **Açık kalem:** davet listeleme `MANAGE_GUILD`, üretme `CREATE_INVITE` istiyor → **listeleyemeyen
  ama üretebilen** kullanıcıda eski davranış (her açılışta yeni kod) sürüyor. Backend'e dokunmadan
  çözülmüyor, bilinçle bırakıldı

### B yarısı — ortamı düzenlemek (kapsam revize: sahip kararı 2026-07-31, sözleşme §10)

> Sahip Discord mobil sunucu yönetimini ekran ekran inceleyip aktardı → **dört karar kapsamı büyüttü.**
> Ölçü kuralı değişmedi: Discord'da olup bizde olmayan özellik EKLENMEZ; web'de olan mobile gelir.

> **Kod tarafı commit edildi: `a1d0ad5`** (20 dosya, typecheck + lint temiz). Aşağıdaki kutular
> **uygulama** kutularıdır; **cihaz DoD turu ayrı** (bkz. §DoD, hâlâ açık).

- [x] **Kategori render:** kanallar kategori başlığı altında gruplu; **kategorisiz kanallar en üstte
  başlıksız** akar (web `ChannelPanel` okuması)
- [x] **Collapse** + tercih kalıcı; anahtar şeması web ile aynı (`kv:cat-collapsed:<guildId>:<categoryId>`)
- [x] **Ortam adı → alt panel** (§10.2): Davet Et · Kanal Oluştur · Kategori Oluştur. A yarısındaki
  tekil davet ikonu **kalktı** (bilinçli: doğrulanmış bir öğe değişti). Panelde **yalnız sahip
  olduğumuz** aksiyonlar; Takviye/Topluluk/Entegrasyon/Emoji/İstila-Bildir/Sunucu-ID **konmadı**
- [x] **Kanal CRUD M1d-B'ye çekildi** (§10.1, önce M1e'deydi): oluştur · adlandır · sil.
  Gerekçe: kategori ile kanal aynı yüzeyin iki yarısı; ayrılsa "kategori açabilen ama içine kanal
  koyamayan" kullanıcı çıkardı
- [x] 🔴 **Tuzak 1 — kanal adı deseni:** `@Matches(/^[a-z0-9çğıöşü-]+$/)` + 2-50. Mobil girdiyi
  **yazarken normalize ediyor** (`normalizeChannelName`). *Web'de bu normalize YOK, sunucu
  reddediyor — davet-kodu-büyük-harf vakasıyla aynı sınıf, web'e geri taşıma ayrı karar*
- [x] 🔴 **Tuzak 2 — ses kanalı oluşturma YOK:** uç destekliyor ama mobil ses kanallarını listelemiyor
  (M1a `GUILD_TEXT` süzgeci) → oluşturulsa kullanıcı kendi yarattığını göremezdi. Tür seçici
  **sorulmuyor** (Discord'un Metin/Ses seçicisi kopyalanmadı); M4 ses fazına ertelendi
- [x] Kanal oluştururken **sorulan:** `isPrivate` + `ageGated` (ikisi de erişim kararı; `ageGated`
  T&S kapısı). **Sorulmayan:** `slowModeSeconds` · `userLimit` · `bitrate` · `mediaEnabled`
- [x] **Son kanal silinemez** → `409 LAST_CHANNEL`; sunucunun mesajı `extractErrorMessage` ile gösterilir
- [x] **Ortam afişi GÖSTERİLİR** (§10.3) — `GuildDto.bannerUrl` C8'den beri var.
  🔴 **Kalıcı kural: görsel yükleme yüzeyleri web/masaüstüne mahsus, mobil yalnız gösterir**
  (avatar · profil afişi · ortam ikonu · ortam afişi hepsi için geçerli)
- [x] Yetkisizde kategori/kanal aksiyonları **hiç render edilmiyor** (disabled değil) — `canManage`
- [x] **Sürükle-sırala YOK** (`reorder` uçları bağlanmadı)
- [x] `ChannelSidebar` 300 satır eşiğinin altında (270) — kategori başlığı `CategorySection`/`ChannelRow`'a çıktı
- [x] 🔴 `GUILD_INVITE` bildirimi **tıklanabilir** → Ortama Katıl ekranı, **davet kodu hazır geçiliyor**.
  **Sözleşme §2.6 REVİZE EDİLDİ (PM 2026-08-01):** özgün metin "guildId'ye git, üye değilse tıklanamaz
  kalsın" diyordu ve **yanlıştı** — bildirim davet **kodunu** `preview` alanında taşıyor ve alıcı
  tanımı gereği çoğunlukla üye DEĞİL, davet edilmiş. O kural bildirimi tam da işe yarayacağı yerde ölü
  bırakırdı. Hedef artık web ile birebir (`NotificationBell.vue` → `/invite/<kod>`). Yeni ekran
  açılmadı. *Hata sınıfı sözleşmenin §0'da kendi uyardığı sınıf: DTO hatırdan yazıldı*
- [x] 🔴 **Yan bulgu — mobilde de davet kodu küçük harfle çalışmıyordu:** dün web'de düzeltilen kusurun
  (`97d7c44`) aynısı mobilde duruyordu. `autoCapitalize="characters"` yalnız **yazarken** çalışır,
  **yapıştırılan** kod/link olduğu gibi gider — paylaşılan şey link olduğu için asıl yol yapıştırmadır.
  Düzeltme `extractInviteCode` içinde, tek çıkış noktasında (önizleme + katılma aynı kodu görsün diye)

### B yarısı — sahip revizeleri (2026-07-31 akşamı, cihaz turu sonrası) — **commit `a1d0ad5`**

- [x] **Ortam paneli yeniden yazıldı** — ilk sürüm üç satırlık dar kutuydu, sahip "çok küçük" dedi.
  Discord düzeni alındı (büyük ikon + iri ad + yuvarlak aksiyon şeridi + gruplu bloklar), **içerik
  alınmadı**: Takviye/Bildirimler/Ayarlar/Etkinlik/profil-düzenle/susturma-anahtarları/ID **konmadı**
- [x] **Kanal uzun basışı artık PANEL açıyor**, doğrudan düzenleme ekranına atlamıyor. İçinde:
  Okunmuş İşaretle + Kanalı Düzenle. Silme **panelde YOK**, düzenleme ekranında (yıkıcı işlem bir
  dokunuş daha derinde; Discord da böyle yapıyor — sahip onayladı)
- [x] **Kategori uzun basışı panel açıyor:** Kategoriyi Düzenle + **Kanal Oluştur**.
  🔴 Bu satır sprintin eksik halkasıydı: `channel-new` `categoryId` alıyordu ama geçen giriş yoktu →
  sahip DoD-B/14'ü test edemiyordu
- [x] **Etiket tutarlılığı:** "Yeniden Adlandır" → **"Düzenle"** (ekran ad değişiminden fazlasını
  yapıyor: 18+ kapısı + silme). Yeni anahtarlar `channel.editTitle` + `category.editTitle`,
  kaynak `web/src/i18n/tr.json`. *Sahip aynı hatayı iki kez yakaladı — önce kanalda, sonra kategoride*
- [x] **Afiş** 88 → 132 px + sol üst köşe yarıçapı · **ok** ortam adının yanına alındı
  (başlık `flex: 1` iken ok panelin en sağına itiliyordu)
- [x] **Ray "+" düğmesi altıgen** (web `ServerRail` dili) — `HexGuildIcon` ile aynı `HEX_POINTS`,
  ikinci şekil tanımı girmedi; nötr zemin + Kor artı
- [x] **Bağımlılık: `@react-native-async-storage/async-storage` 2.2.0** (PM onaylı, sahip
  bilgilendirildi). Gerekçe: collapse tercihinin kalıcılığı DoD şartı; `expo-secure-store` gizli veri
  içindir. Expo Go'da geliyor, dev build gerektirmiyor, `expo-doctor` 18/18 temiz
- [x] **"Son kanal silinemez" HATA DEĞİL** (sahip bulgusu, DB'den doğrulandı): koruma **tüm** kanalları
  sayıyor, her ortam bir `genel-sohbet` + bir `ses-kanalı` ile kuruluyor ve mobil ses kanallarını
  göstermiyor → sunucu haklı, mobildeki "son kanal" algısı farklı. Sunucuya dokunulmadı.
  *Açık: mobil "görünen son kanalı siliyorsun" uyarısı verebilir (sahip kararı bekliyor)*

### B yarısı — sahip cihaz turu bulguları (2026-08-01)

- [x] 🔴 **Davetiye ekranı web paritesine getirildi** (sahip talebi, hafızası doğru çıktı): bildirimden
  ya da linkten gelindiğinde mobil **kod giriş kutusu** gösteriyordu — kullanıcıya zaten bildiği kodu
  düzenletmek. Web (`InviteAcceptView.vue`) o yolda input göstermiyor, **davetiye kartı** gösteriyor:
  altıgen baş harfler + ortam adı + 18+ rozeti + tek "Katıl". Mobil artık **iki modlu**: kod
  parametreyle geldiyse kart, ray "+" → Katıl'dan gelindiyse eski kod girişi.
  *Ayrım korundu: katılma reddi (18+/yasak) "davet geçersiz" ekranına DÜŞMEZ — kart ekranda kalır,
  sunucunun mesajı kartın içinde görünür. Tek bayrağa bindirilseydi sebep yanlış anlatılırdı.*
  Yeni i18n anahtarı YOK (`inviteAccept.*` web'de zaten vardı). Altıgen tanımı `components/hexShape.ts`'e
  çıktı (ray ikonu · ray "+" · davetiye kartı = üçüncü kullanım, Rule of Three doldu)
- [x] 🔴 **Sistem gezinme çubuğu payı yoktu** (sahip bulgusu, ÜÇ TUŞLU gezinmeli ikinci cihaz):
  SDK 54'te edge-to-edge varsayılan açık olduğu için uygulama gezinme çubuğunun altına çiziyordu →
  **mesaj kutusu tuşların arkasında** kalıyordu. Sahibin kendi telefonu jest gezinmeli olduğu için
  kusur görünmüyordu. Düzeltme `MessageScreen`'de gerçek `insets.bottom` ile; **klavye açıkken pay
  verilmez** (`KeyboardAvoidingView` zaten itiyor, üstüne eklenirse kutu havada kalırdı).
  *Aynı kusur DÖRT alt panelde de vardı* (sabit `paddingBottom: 28` jest gezinmede kazara yetiyordu) →
  `components/home/sheetInsets.ts` ile hepsi gerçek insete bağlandı
- [x] 🔴 **Sistem gezinme çubuğu ilk açılışta BEYAZ** (sahip bulgusu) — düzeltildi. Kök sebep
  gezinme çubuğunun rengi DEĞİL: edge-to-edge'de çubuk **şeffaf** çizilir ve arkasındaki **pencere
  zemini** görünür; Android pencere zemini varsayılan açık renk, uygulamanın koyu View'ı üstüne
  çizilene kadar beyaz görünüyordu (login'e çıkıp dönünce düzelmesi bu yüzden). `expo-system-ui`
  ile pencere zemini native tarafta `bgRail`e çekildi (**yeni bağımlılık değil**, zaten kuruluydu);
  ayrıca `app.json` `androidNavigationBar.barStyle: light-content` (bu yalnız gerçek build'de etkili)
- [x] 🔴 **Klavye açılınca mesaj kutusu doğru kaymıyordu** (üç tuşlu cihaz). `KeyboardAvoidingView`
  Android'de yüksekliği görünüm çerçevesi ile klavyenin ekran koordinatı farkından türetiyor ve bu
  fark edge-to-edge'de gezinme türüne göre değişiyor → **doğruluğu cihaza bağlıydı**. Kaldırıldı;
  alt boşluk tek yerde `max(klavye yüksekliği, insets.bottom)` ile hesaplanıyor. Toplama YAPILMAZ:
  Android'in IME inset'i klavye görünürken gezinme çubuğu alanını zaten kapsar
- [~] **Klavye — sahip kararı 2026-08-01: OLDUĞU GİBİ KALIYOR.** Sahibin cihazında sorunsuz, üç tuşlu
  cihazda mesaj kutusu klavyenin arkasında kalmaya devam ediyor; sahip "yapacak bir şey yok, kalsın"
  dedi. *PM notu: yapılabilecek bir şey VAR ama bugün ulaşılabilir değil —
  `react-native-keyboard-controller` klavye inset'ini native tarafta okur ve bu sınıfı kökten çözer,
  ancak **native modül olduğu için Expo Go'da çalışmaz**, dev build (M2) şartı. Dev build'e geçince
  masaya gelsin.*
- [ ] **Aynı `KeyboardAvoidingView` deseni 13 ekranda daha var** (formlar: login/register/kanal-kur/
  kanka-ekle…). Aynı cihaz-bağımlılığı sınıfı, ama içerik üstte olduğu için etkisi küçük.
  **Mesaj ekranındaki düzeltme üç tuşlu cihazda doğrulandıktan SONRA** süpürülecek — doğrulanmamış
  bir formülü 13 ekrana yaymak, tek ekranda yanılmaktan pahalıya patlar
- [ ] **Teknik borç:** `MessageScreen.tsx` **561 satır** (300 eşiği). Bugünkü inset düzeltmesi 23
  satır ekledi, dosya zaten eşiği aşmıştı. Bölme ayrı iş, PM kararı

### 🔴 YARINA DEVİR — yeni iş: kanal/kategori bildirim ayarları (sahip talebi 2026-07-31 akşamı)

> **Kendi sözleşmesiyle ele alınacak** (PM önerisi, sahip onayladı): M1d-B'nin içine sıkıştırılırsa
> B yarısı bir daha kapanmaz. Backend R12 bildirim tercihleri modülü VAR ama **mobilde hiç bağlı
> değil** → uç bağlama işi de var.

- [ ] **Bildirim seviyesi ekranı** (ayrı ekran): Bütün mesajlar · Sadece @bahsetmeler · Hiçbiri.
  En üstte `#kanal-adı`. En altta "Kanalı Sustur" girişi
- [ ] **Susturma paneli** (alt panel): 15 dk … 24 saat aralığı + **"ben tekrar açana kadar"**
- [ ] Discord'da susturma paneli ile bildirim ekranı birbirini karşılıklı açıyor; **sahip kararı:
  ayrı panel yerine mevcut ekrana yönlendirmek serbest** ("fark etmez")
- [ ] **Aynı düzenek kategori için de** (Kategoriyi Sustur + Bildirim Ayarları)
- [ ] 🔴 **Okunmuş olarak işaretle ÜÇ panelde de olacak:** kanal (**var**) · kategori (yok) ·
  **ortam paneli (yok — sahip son anda ekledi)**. Web'de bu sistem mevcut (`guildMenu.markRead`)
- [ ] 🔴 **Okunmamış yoksa satır PASİF + soluk** (sahip talebi 2026-07-31). **Web'de de aynısı
  yapılacak** — orada da okundu-işaretle her zaman aktif duruyor.
  > **Kuralımızla çelişmiyor, ayrımı kayda geçiriyorum:** "yetkisiz aksiyon hiç render edilmez,
  > disabled gösterilmez" kuralı **YETKİ** hakkındadır ("bunu yapamazsın" bilgisi gürültüdür).
  > Bu ise **DURUM** hakkında ("zaten okunmuş"), ve bu bilgi kullanıcıya lazım — gizlersek
  > okunmamış olup olmadığını anlayamaz. Yetki yoksa gizle, durum uygun değilse soluklaştır.

---

## Sprint M1d-C — Mobil Sohbet Aksiyonları + Hesap Merkezi (Track F2, PM compose 2026-08-01)

> Sözleşme: `contracts/SPRINT_M1DC_MOBILE_CHAT_ACCOUNT_CONTRACT.md` (**tek doğruluk kaynağı**).
> **R7-nötr olmalı:** düzenle/sil/sabitle yetkileri ve `canDm` sunucuda, mobil sonucu gösterir.
> Sahip kararı: **ortam sistemine devam etmeden önce burası sağlam otursun.**
> A yarısı kapanmadan B'ye geçilmez. DoD **hem jest hem üç tuşlu gezinmeli cihazda**.

### A yarısı — sohbet aksiyonları
- [x] **ÖNCE `MessageScreen` bölündü** (561 → 299): `MessageComposer` · `useTypingEmitter` ·
  `useMessageListController` · `MessageStates`. Saf taşıma, davranış değişmedi *(e010d49)*
- [x] 🔴 **1-1 DM'de mesaj arama KALDIRILDI — sahip kararı 2026-08-01, web + mobil.** Gerekçe: arama
  ortam kanallarında değerli (çok kişi, çok gün, kaybolan mesaj); 1-1'de karşında tek kişi var,
  konuşma doğrusal. **Grup DM'de ve ortam kanalında KALIYOR.** *(31b4420)*
- [x] **DM başlığı sağ üst tamamen boşaldı** (orası sesli/görüntülü aramaya ayrıldı). Yer tutucu
  ikon KONMADI. Ada dokunuş: 1-1 → profil kartı, grup → grup ekranı
- [x] **DM alt paneli — yalnız listede uzun basış** (sahip kararı: sohbetin içinden açılmıyor):
  Profil · Kanka Ekle (yalnız 1-1) · Okunmuş İşaretle · Sohbeti Temizle (`ConfirmDialog`).
  **Konmadı:** Favori · Sustur/Bildirim (kendi sözleşmesi) · Kanal ID · "DM'yi Kapat" (aynı işe iki ad).
  Okunmamış yoksa "Okunmuş İşaretle" **soluk + pasif** (yetki değil DURUM kuralı).
  *Yan iş: `DmSidebar` 312 satırdı → `DmRow` ayrıldı; panelin iç akışı `DmMenuHost`ta (ana ekran 284)*
- [x] **Mesaj alt paneli** (mesaja uzun basış): hızlı emoji şeridi + Yanıtla · İlet · Düzenle
  (yalnız kendi) · Metni Kopyala · Sil (yalnız kendi, `ConfirmDialog`) — **tamamı bağlı**
  - 🔴 **Sabitle KONMADI (PM kararı, sözleşme §2.4 revizesi):** uç var ama mobilde sabitlenmiş
    mesajları GÖSTEREN yüzey yok (web'de `PinsPopover`, mobilde yok) → sabitlenen mesaj görülemezdi.
    M1d-B'deki ses kanalı kararının aynısı: **görülemeyen sonuç üretilmez**
  - Yetki sunucudan okundu, uydurulmadı: **düzenleme ve silme yalnız YAZAR** (`messages.controller`),
    tepki her üye. Yetkisizde satır **hiç render edilmiyor**
- [x] **Emoji picker** (sahip talebi 2026-08-01, web paritesi): şeridin sonunda "+" → tam liste.
  **Yeni bağımlılık `rn-emoji-keyboard` (PM onaylı):** MIT · **sıfır bağımlılık** · peer yalnız
  react/react-native → **native modül yok, Expo Go'da çalışır, dev build gerektirmez** (M2'ye kadar
  kritik şart). Alternatif `react-native-emoji-selector` 2022'de kalmış, elendi. `expo-doctor` 18/18.
  Kategori/arama metinleri kütüphanenin **kendi Türkçe paketinden**, tr.json'a emoji sözlüğü
  kopyalanmadı; renkler `src/theme` token'larından. *Picker'dan seçim EKLER (toggle etmez) — web
  `MessageItem.addReaction` ile aynı; toggle yalnız baloncuktaki pill'de.*
  ⚠️ Kütüphanenin son yayını 2024-05; native tarafı olmadığı için RN yükseltmelerinde kırılma riski
  düşük ama **cihaz doğrulaması gerekli** (React 19 uyumu fiilen görülmedi)
- [x] **Tepki gösterimi + canlı güncelleme:** `MessageDto.reactions` tiplendi, baloncuk altında
  pill'ler (kendi tepkim Kor kenarlıklı), tekrar dokun → kalkar.
  🔴 **`reaction.added`/`reaction.removed` WS olayları mobilde HİÇ dinlenmiyordu** → eklendi.
  Sunucu mesajın tamamını değil **delta** yayıyor, toplamı istemci tutuyor (`applyReaction`).
  **İyimser güncelleme YOK** — tek yazma yolu WS olayı; yoksa kendi tepkim iki kez sayılırdı
  (M1a `message.created` echo dersi)
- [x] **Yanıt + düzenleme:** giriş kutusunun ÜÇ modu (normal · yanıtlıyorum · düzenliyorum),
  üstte şerit + × iptal; gönderimde `replyToId` (**uç M1a'dan beri destekliyordu, mobil
  göndermiyordu**). Gelen mesajda alıntı gösterimi de eklendi — alıntılanan mesaj silinmişse
  "Silinen mesaj" yazılır, satır gizlenmez (yoksa yanıt bağlamsız kalırdı).
  *İki mod aynı kutuyu paylaşır, aynı anda ikisi birden olamaz. Düzenlerken "yazıyor" YAYINLANMAZ:
  karşı taraf yeni mesaj bekler, oysa eski mesaj değişiyor. Web'in `message.editHint` metni
  ("Enter kaydet · Esc iptal") mobilde KULLANILMADI — Esc yok, görünür × var.*
- [x] **İlet** (sahip talebi, web `ForwardMessageModal` paritesi): ayrı uç DEĞİL, mesajın metni
  seçilen DM'e yeni mesaj olarak gider. Metin boşsa ilk ekin dosya adı (web ile aynı)
- [x] **Hızlı şerit 5 emojiye çıktı** (👍 ❤️ 😂 😮 😢) — sağ boş kalıyordu; **web de aynı beşliye
  çekildi** (`8da78d9`), iki istemci ayrışmasın
- [ ] **Okunmuş işaretle:** okunmamış yoksa **soluk + pasif** (yetki değil DURUM kuralı)

### A yarısı — DoD turu (sahip cihaz turu 2026-08-01) ✅
- [x] **A yarısı cihazda yürünmüş durumda, sorun çıkmadı** (sahip): paneller açılıyor · emoji picker
  açılıyor (**`rn-emoji-keyboard` React 19 uyumu böylece fiilen doğrulandı**) · yanıt veriliyor ·
  mesaj iletiliyor · düzenleme çalışıyor.
  *Not: `MessageScreen` bu sprintte üç kez bölündü; tur regresyon göstermedi.*

### B yarısı — hesap merkezi + profil
- [x] **"Sen" sekmesi profil görünümü:** afiş · avatar · ad · biyografi · üyelik tarihi (TR formatı).
  Veri **`GET /users/:id/card` kendi id'mle** — yeni uç yazılmadı. Durum ekle · sunucu profilleri ·
  rozetler **konmadı**. Engellenenler satırı **korundu** (sahip talimatı)
- [x] **Kankalar satırı:** en fazla 5 avatar + "+N" + sağ ok → Kankalar ekranı. Liste store'dan,
  ayrı çekim yok (`(app)/_layout` oturum açılışında çekiyor, soket anlık güncelliyor)
- [~] 🔴 **Sağ üstte dişli → Ayarlar — BİLİNÇLE KONMADI (PM önerisi, sahip onayladı 2026-08-01).**
  Rotalar sayıldı: mobilde gruplanacak hesap ekranı **yok**. Kankalar + Engellenenler zaten profil
  ekranında, Mesaj İstekleri DM listesinde. Web'deki Ayarlar'ın asıl içeriği güvenlik (2FA ·
  oturumlarım · şifre değiştir · e-posta değiştir · hesap silme) ve **bunların hiçbiri mobilde yok**.
  Dişli koyup içine aynı iki satırı dizmek kendi "boş yüzey açma" kuralımızı çiğnerdi.
  → **Tetikleyici:** mobil güvenlik ekranları sprinti. O gelince dişli anlamlı olur.
  ⚠️ **Kayda geçen eksik:** 2FA'lı hesapla mobilden GİRİLEBİLİYOR ama 2FA mobilden **kurulamıyor**,
  oturumlar görülemiyor, şifre/e-posta değiştirilemiyor, hesap silinemiyor
- [ ] 🔴 **Profili Düzenle: biyografi + avatar/afiş YÜKLEME — sahip istisnası (2026-08-01).**
  M1d §10.3 kuralı **daraltıldı, silinmedi**: ortam ikonu/afişi mobilde hâlâ yalnız gösterilir;
  istisna **yalnız kullanıcının kendi profili**. Akış `presign` → PUT → `PATCH storageKey`;
  `403 EMAIL_NOT_VERIFIED` → M1c doğrulama bandı
- [ ] **Yeni bağımlılık (PM onaylı, sahip bilgilendirildi):** `expo-image-picker` + `expo-file-system`
  (ikisi de SDK 54 içinde, **Expo Go'da çalışır, dev build gerekmez**)

---

## Sprint M1e — Mobil Ortam Yönetimi (Track F2, PM compose 2026-08-01)

> Sözleşme: `contracts/SPRINT_M1E_MOBILE_GUILD_ADMIN_CONTRACT.md` (**tek doğruluk kaynağı**).
> Referans: sahibin Discord mobil ekran görüntüleri. **Düzen alınır, içerik alınmaz.**
> A kapanmadan B'ye geçilmez. DoD **fiziksel cihazda**.
>
> **Varlık sebebi:** mobilde ortamı yönetmenin hiçbir yolu yok — üye atılamıyor, rol verilemiyor,
> yasak konulamıyor, ayar değiştirilemiyor.

### A yarısı — ortamı yönet (insanlar)
> **A yarısı cihazda yürüdü, sorun çıkmadı (sahip, 2026-08-01)** — commit `a7d1e15`.

- [x] Ortam paneline **Ortam Ayarları** girişi (yetkisizde hiç render edilmez)
- [x] **Ortam Ayarları ekranı** (gruplu liste). **Konmadı:** Moderasyon/AutoMod · Entegrasyonlar ·
  Emoji · Topluluk · Güvenlik · Şablonlar
- [x] 🔴 **Kanallar bölümü KONULDU (sahip kararı 2026-08-01).** PM önerisi koymamaktı (kanal CRUD
  zaten ortam panelinde + kanal satırında); sahip *"dolu görünsün, her yerden erişilsin"* dedi.
  **Endişe şöyle karşılandı:** ekran düzenlemeyi yeniden yazmıyor, mevcut `channel-edit` /
  `category-edit` / `channel-new` ekranlarına yönlendiriyor → **iki giriş, tek uygulama**.
  Çekim/sıralama sidebar ile aynı; ses kanalları burada da listelenmiyor
- [x] 🔴 **Ortam simgesi mobilden değiştirilebiliyor** (sahip talebi 2026-08-01): simgeye binen
  kalem → galeri → presign/PUT/PATCH. **Yalnız OWNER'a render edilir** (uçlar `yalnız OWNER`
  istiyor; ADMIN'e gösterilse dokunduğunda 403 alırdı).
  **Görsel yükleme kuralının güncel hâli:** kullanıcı avatarı ✅ · kullanıcı afişi ✅ ·
  **ortam simgesi ✅** · **ortam afişi ❌** (Discord mobilde de yok, sahip doğruladı).
  Yani "mobil yüklemez" artık yalnız ortam afişi için geçerli
- [x] **Üyeler:** arama + rol rozetleri (rolün kendi rengiyle). *Rozetler `GuildMemberDto.roles`
  içinde HAZIR geliyor — rozet için ayrıca rol ucu çağrılmadı. Arama istemci tarafında (sunucuda
  üye arama ucu yok)*
- [x] **Üye ekranı:** roller (gösterim) · ortam rolü (yalnız OWNER) · At · Yasakla ·
  **Sahipliği Devret**. 🔴 **Takma ad alanı YOK** — `GuildMember`de alan yok
  (izin anahtarları i18n'de var ama özellik uygulanmamış).
  *Rol ATAMA B yarısında; hedefi olmayan "Rolleri Düzenle" satırı konmadı*
- [x] **Yasaklar** listesi + yasağı kaldır (onaylı). Sebep boşsa satır yazılmaz, dolgu metin yok
- [x] **Ortamdan Ayrıl** — OWNER'da "önce devret ya da sil" sebebi **önceden** yazılır;
  metin sunucunun ret mesajıyla aynı şeyi söyler (iki yerde farklı cümle olmasın)

### B yarısı — ortamı yapılandır
- [x] **Genel Ayarlar:** ad · **açıklama** · `adultsOnly` (T&S kapısı, açıklamasıyla) ·
  **Keşfet'te görünürlük** · **etiketler** · **Ortamı Sil**. *Sözleşme §3.1 revize: orada yalnız
  "ad + adultsOnly + sil" yazıyordu; `UpdateGuildDto` kaynaktan okununca description/discoverable/
  tags da çıktı, parite gereği alındı. Hepsi `toGuildDto`'da zaten dönüyordu*
- [x] **Roller:** `@everyone` + liste (üye sayısıyla) + oluştur. **Sürükle-sırala YOK**
- [x] 🔴 **Rol rengi SERBEST HEX** (`@Matches(/^#[0-9a-fA-F]{6}$/)`) — afiş rengindeki preset kısıtı
  burada YOK, backend değişikliği gerekmedi.
  🔴 **`reanimated-color-picker` DENENDİ ve KALDIRILDI (sahip bulgusu: uygulama renk seçerken
  ÇÖKÜYORDU).** Kök sebep sürüm uyumsuzluğu: kütüphane `Animated.addWhitelistedNativeProps`
  çağırıyor, o API **Reanimated 4'te kaldırılmış** (bizde ~4.1.1). Paket `reanimated >=2.0.0`
  diyordu — **peer bildirimi uyumluluk kanıtı değil.**
  → Yerine **bağımlılıksız** seçici: swatch ızgarası + "Özel (hex)" girişi. Jest yok, worklet yok,
  çökme sınıfı ortadan kalktı. **Web zaten böyle yapıyor** (`RolesSettingsSection.vue`), renkler
  web'in `COLOR_PRESETS`iyle birebir → aynı zamanda parite. Serbest hex kaybolmadı
- [x] **Rol ekranı:** ad · renk · ayrı göster · bahsedilebilir · izinler · üyeler · sil.
  `@everyone`de ad/hoist/sil hiç render edilmez, sebebi yazılır; PATCH'te de gönderilmez
- [x] **İzin matrisi:** 16 bayrak gruplu; metinler i18n'den, mobilde izin metni yazılmadı.
  🔴 **Kusur ve düzeltmesi:** ekranda ham anahtarlar göründü → yol `guildSettings.permsFlags` değil
  **`guildSettings.roles.permsFlags`** imiş. *Ders: iç içe i18n yolu da kaynaktan doğrulanır.*
  `CANNOT_GRANT_PERMISSION` sunucudan gelir; ret gelince anahtarlar kaydedilmiş hâline döner
  (ekranda verilmemiş bir izin açık görünmesin)
- [x] **Rol üyeleri:** tek liste + tik ile ekle/çıkar (Discord'un ayrı "Üye ekle" akışı kopyalanmadı)
- [x] **Davetler (PM kararı):** Discord'daki "Davetleri Duraklat" bizde YOK, uydurulmadı →
  ekran = aktif davet listesi (kod · kullanım · süre) + kopyala + iptal + oluştur.
  *M1d-A'daki "davet listeleme ekranı kapsam dışı" ve "listeleyemeyen ama üretebilen kullanıcı"
  açık kalemleri kapandı: liste 403 alırsa bölüm hiç render edilmiyor, oluştur duruyor*
- [x] **Denetim Kaydı:** cursor'lu liste. **Filtre YOK** (uç yok; istemci-tarafı filtre yanıltıcı
  olur). Bilinmeyen aksiyonda `audit.action.fallback` — yeni aksiyon eklenince ham anahtar basılmaz
- [x] 🔴 **Ortam simgesi ray'e anlık yansımıyordu** (sahip bulgusu): ana ekran sekme olduğu için
  oturum boyunca mount'lu kalıyor ve liste bir kez çekiliyordu → `useFocusEffect` ile odaklanmada
  tazeleme. *Parametreyle haber vermek yetmezdi: Ayarlar ad/ikon/afiş değiştirebiliyor*

> **Renk seçici yayılımı — sahip kararı 2026-08-01 (GÜNCEL: ERTELENDİ).** Önce "profil afiş rengi
> hem web hem mobil hex olsun" denmişti; rol renginde yaşanan **kütüphane çökmesi** sonrası sahip
> **iki afiş rengi için de hex geçişini erteledi.** Bugünkü durum korunuyor:
> preset swatch'lar (10 anahtar) hem web hem mobilde, ortam afişi mobilde düzenlenmiyor.
> *Not: mobilde **profil afişi** yükleme + preset renk seçme VAR (M1d-C'de yapıldı, sahip test etti);
> olmayan ortam afişi. Ertelenen şey preset→hex geçişi, seçicinin kendisi değil.*
> Sürükle-panelli seçici de ertelendi (aceleye gerek yok, sahip 2026-08-01).

### 🔴 Açık karar — afiş rengi: preset mi, serbest hex mi (sahip 2026-08-01, ERTELENDİ)

> Sahip serbest hex istedi, sonra "şimdilik böyle olsun" dedi. **Bugün preset kaldı** (10 anahtar),
> mobil paneli de web Ayarlar'daki aynı swatch'ları gösteriyor. Karar ertelendi, kapanmadı.

- [ ] **Serbest hex'e geçiş — kapsam (PM tahmini):**
  - `api/`: `UpdateProfileDto.bannerColor` allowlist (`@IsIn(BANNER_PRESET_KEYS)`) → hex deseni
    (`#RRGGBB`). Alan zaten `String`, **migration gerekmez**. T&S etkisi yok (kozmetik)
  - `web/`: `bannerColor.ts` eşlemesi + Ayarlar swatch seçici → hex seçici
  - `mobile/`: `BannerSheet` swatch paneli → hex seçici (`reanimated-color-picker` MIT, peer'ları
    zaten kurulu: reanimated + gesture-handler). Yeni bağımlılık = PM onayı
  - 🔴 **Asıl incelik — geriye dönük veri:** mevcut kullanıcılarda DB'de `'blue'`, `'cream'` gibi
    ANAHTARLAR duruyor. Hex'e geçilirse `bannerColors()` **iki biçimi de tanımalı** (anahtar → eski
    gradient, `#RRGGBB` → düz renk), yoksa eski profillerin afişi sessizce varsayılana düşer.
    Alternatif: tek seferlik veri dönüşümü (anahtar → temsilci hex) — ama o gradient'i düz renge
    indirger, görsel kayıp olur
  - **Not:** gradient'ten düz renge geçiş bir tasarım kaybıdır; hex tek renk verir, bugünkü
    presetler iki renkli gradient. Hex'e geçerken "gradient'i koru" istenirse iki hex gerekir
  - 🔴 **ORTAM AFİŞİ DE DAHİL (sahip 2026-08-01):** aynı preset listesi ortam afişlerinde de
    kullanılıyor (`Guild.bannerColor`, Keşfet kartı + ortam ayarları). Hex'e geçiş **tek iş olarak**
    yapılır — yalnız profil değişirse iki yüzey farklı renk modeli konuşur. Yani kapsam:
    `api/` iki DTO (kullanıcı + ortam) · `web/` iki seçici · `mobile/` profil paneli (+ ortam
    ayarları mobile gelince o da)

### Diğer açık kalemler (yarın)

- [ ] **B yarısının DoD turu baştan yürünecek** — paneller/afiş/uzun-basış bugün çok değişti
- [ ] **Ortam içi arama:** ayrı sözleşme (karar verildi). Ortam adının altına arama + davet +
  etkinlik şeridi; Discord'un sekmeli arama ekranı **kopyalanmayacak** (M1b §3.5 kararı sürüyor)
- [ ] **Etkinlikler:** M1e'ye mi ayrı sprinte mi — **PM kapsam tahmini çıkaracak**, sonra sahip karar verir
- [ ] **M1c'den sarkan doğrulanmamış hesap turu:** sahip mail hesabı bulunca (doğrulama bandı,
  yasal linkler, kayıt modu `invite`/`closed`)

> **M1e sınırı (§10.4):** roller · üyeler · yasaklar · denetim kaydı · ortam ayarları → **ayrı
> sözleşme**. M1d-B "ortamı KULLAN", M1e "ortamı YÖNET".
> **Açık karar (§10.5):** etkinlikler web'de VAR (`CreateEventWizard`), mobile gelecek ama M1e'ye mi
> yoksa kendi sprintine mi — **sahip henüz karar vermedi**.

### DoD (sözleşme §1 — **fiziksel cihazda**)
- [x] Davet kodu/linki ile katılıyorum, ortam ray'da anında beliriyor *(düz kod + tam link ikisi de)*
- [x] Geçersiz/süresi dolmuş kodda sebebi anlıyorum (sunucunun mesajı)
- [x] Zaten üye olduğum kodda ortama götürülüyorum, hata ekranında bırakılmıyorum
- [x] Yeni ortam kurabiliyorum, kurunca içine düşüyorum
- [~] 🔴 Doğrulanmamış e-posta ortam kuramıyor **ve sebebini görüyor** — *kod tamam + bant mevcut
  bileşenden geliyor; sahip doğrulanmamış hesapla DENEMEDİ (test hesabı doğrulanmış). M1c'deki
  aynı sınıf açık kalemle birlikte kapatılacak.*
- [x] Kendi ortamıma davet üretip paylaşabiliyorum *(sahip cihazda: kod üretimi + paylaşım + ikinci
  hesapla katılma uçtan uca)*
- [ ] Kanallar kategorili görünüyor, kategorisizler kaybolmuyor
- [ ] Kategori aç/kapa çalışıyor, tercih yeniden açılışta korunuyor
- [ ] Yetkisizde kategori aksiyonları **hiç render edilmiyor**
- [ ] `GUILD_INVITE` bildirimi hedefli
- [ ] Metin `tr.json`'dan, token'dan; gömülü string yok
- [ ] `typecheck` + `lint` temiz; **`api/`'ye dokunulmadı**

---

## Sprint M1f — Mobil Hesap Güvenliği (Track F2, PM compose 2026-08-01)

> Sözleşme: `contracts/SPRINT_M1F_MOBILE_ACCOUNT_SECURITY_CONTRACT.md` = **tek doğruluk kaynağı**.
> 🔴 **R7 kapsamında** — reauth akışı + oturum yönetimi sahip incelemesinden geçmeden kapanmaz.
> `api/`'ye dokunulmadı: sekiz ucun hepsi zaten vardı, mobil yalnız çağırmıyordu.

- [x] `authApi` güvenlik uçları (oturumlar, 2FA, şifre, e-posta, hesap silme) + `twoFactorEnabled`
- [x] Paylaşılan `ReauthFields` (şifre + 2FA açıksa TOTP) — beş ekranda aynı, satır içi
- [x] `SecurityForm` ortak kabuk (başlık · klavye · hata · başarı · tek düğme)
- [x] Hesap Güvenliği merkezi + "Sen" sekmesine dişli *(M1a'da bilinçle boş bırakılan yüzeyin tetikleyicisi)*
- [x] Şifre Değiştir *(diğer oturumların düşeceği ekranda yazılı)*
- [x] E-posta Değiştir *(talep + link akışı anlatılıyor, sahte onay ekranı YOK)*
- [x] Oturumlarım *(tek kapat · diğerlerini kapat · mevcut oturumu kapatmak = çıkış)*
- [x] İki Adımlı Doğrulama *(kur → metin anahtar → kod → kurtarma kodları; kapat)*
- [x] Hesabımı Sil *(30 gün grace metni + onay diyaloğu)*
- [x] `typecheck` + `lint` temiz

### Bilinçli farklar (sapma DEĞİL, sözleşmede yazılı)
- [x] **QR çizilmiyor**, gizli anahtar metin + kopyala — telefonun kendi QR'ı aynı telefondaki
  authenticator'a okutulamaz; web'de QR doğru olan, orada duruyor
- [x] Kurtarma kodları **.txt indirme yok**, kopyala var (mobilde dosya yönetimi açmak istemedik)
- [x] **Kullanıcı adı değişimi YOK** — uç var ama web "değiştirilemez" diyor; iki istemci çelişemez,
  🔴 **sahip kararı bekliyor**

### DoD (sözleşme §1 — **fiziksel cihazda**, sahip turu 2026-08-01)
- [x] Dişli → Hesap Güvenliği açılıyor *(dişli önce durum çubuğunun altında kaldı → afişe göre
  konumlandırılarak düzeltildi; `SafeAreaView` üst dolgusu mutlak konumlu çocuğa uygulanmıyormuş)*
- [x] Şifre değişiyor; diğer oturumların düştüğünü görüyorum
- [x] Oturum listesi geliyor; tek kapatma + diğerlerini kapatma çalışıyor
- [x] 2FA **kapatıldı ve tekrar kuruldu** — iki yön de yürüdü (anahtar → kod → kurtarma kodları)
- [x] E-posta değişim talebi gidiyor, posta geliyor
- [x] Hesap silme — **test hesabında uçtan uca yürütüldü** (30 gün grace başladı)
- [x] Yanlış şifre/koda sunucunun Türkçe mesajı görünüyor
- [ ] 🔴 **R7:** reauth + oturum yönetimi sahip incelemesinden geçti — **açık, sahipte**

---

## Sprint M1g — Mobil Ortam İçi Arama + Aksiyon Şeridi (Track F2, PM compose 2026-08-01)

> Sözleşme: `contracts/SPRINT_M1G_MOBILE_GUILD_SEARCH_CONTRACT.md`.
> **Zaman kutulu:** sahip 20.20'de bırakmak istedi; etkinlikler bilinçli olarak yarına bırakıldı.
> `api/`'ye dokunulmadı — uç (`GET /guilds/:id/messages/search`) zaten gelişmişti.

- [x] Ortam adının altına aksiyon şeridi: geniş **Ara** + dar **davet** ikonu
- [x] `messagesApi.searchGuild` (q · from · mentions · in · has, kanal-gruplu sonuç)
- [x] Ortamda Ara ekranı: debounce, kanal-gruplu sonuç, sonuç sayısı, boş/hata durumları
- [x] Filtre paneli: kanal (`in`) + tür (`has`), "Uygula" ile uygulanır
- [x] Etkin filtre çipleri — dokununca kalkar
- [x] `typecheck` + `lint` temiz

### Bilinçli kararlar
- [x] **Takvim düğmesi KONMADI** — etkinlik yokken dokununca hiçbir şey yapmayan düğme olurdu
  ("boş yüzey açma"). Şeridin yeri ayrıldı, düğme ayrılmadı.
- [x] Discord'un **sekmeli** arama ekranı kopyalanmadı (sabitleme/medya sekmelerinin arkasında
  bizde özellik yok) — M1b §3.5 kararı sürüyor

### R1 — sahip cihaz turu sonrası (2026-08-01, aynı akşam)
- [x] **Mesaja atlama + vurgu** — sonuç artık kanalı açıp mesaja kaydırıyor ve yanıp sönüyor.
  *Makine zaten `useMessageListController`'daydı (kanal içi arama kullanıyordu); eksik olan tek şey
  dışarıdan tetiklenmesiydi → `initialJumpId`.*
- [x] **`from` / `mentions` filtreleri** — üye seçici filtre paneline eklendi (`GET /guilds/:id/members`
  zaten vardı). Artık dört filtrenin dördü de bağlı.
- [x] **Davet ekranına kanka listesi** — web `InvitePeopleModal` karşılığı: liste + yerel süzme +
  kişi başına "Davet Et" → "Davet Edildi ✓" (`POST /guilds/:id/invite-friend`).
  *Davet düğmesi yalnız kod alanına götürüyordu.*

### Kapsam dışı
- [ ] **Etkinlikler** — kendi sprinti (web'de `CreateEventWizard` + `EventsModal` var)

### DoD (sözleşme §1 — **fiziksel cihazda**)
- [ ] Şerit görünüyor; aramaya dokununca tam ekran açılıyor
- [ ] Sonuçlar kanal başlıkları altında gruplu geliyor
- [ ] Filtre paneli çalışıyor; çipler görünüyor ve kaldırılabiliyor
- [ ] Sonuca dokununca ilgili kanal açılıyor
- [ ] Metin `tr.json`'dan; `typecheck` + `lint` temiz


---

## Sprint M1i — Mobil Sürükle-Bırak Sıralama (Track F2, 2026-08-01)

> `api/`'ye dokunulmadı — `PATCH /guilds/:id/{channels,categories,roles}/reorder` zaten duruyordu.

- [x] **Rol hiyerarşisi sıralaması** — Roller ekranı sağ üstünde ikon, sürükle-bırak
- [x] 🔴 **Rol pozisyonu ters eşleme hatası düzeltildi** — roller `position` DESC gösteriliyor,
  en üste `position: 0` yazmak hiyerarşiyi baş aşağı çeviriyordu ("sıralama yansımıyor" bulgusu)
- [x] `@everyone` listede yok (sunucu kabul etmiyor — reddettirmek yerine hiç gösterme)
- [x] Kütüphane: `react-native-reorderable-list` *(peer `>=3.12.0`; `draggable-flatlist`'in
  `>=2.8.0`'ı bugün çöken paketin deseni. Kaldırılan API'yi çağırmadığı kaynak taranarak doğrulandı)*

### 🔴 Kapsam kararı: kanal/kategori sıralaması KALDIRILDI (sahip, 2026-08-01)
Yapıldı, çalıştı, sonra bilinçle çıkarıldı:
- **Discord mobilde de yok**, yalnız rollerde var — kanal sırası kurulum anında bir kez yapılan iş
- Web'de zaten var, doğal yeri orası
- Tek ekranda **beş revize turu** döndü; emek özelliğin değerini aştı

*Geri istenirse git geçmişinde: birleşik liste + `reorderModel.ts` (kategori taşınınca kanalları
peşinden gelir, kanal bırakıldığı kategoriye girer).*

### DoD (**fiziksel cihazda**)
- [ ] Roller ekranından sıralama açılıyor, sürükleme çalışıyor
- [ ] Değiştirilen sıra ekrandan çıkıp dönünce **korunuyor** (ters eşleme düzeltmesinin turu)
- [ ] Yetkisiz kullanıcıda sunucunun Türkçe reddi görünüyor ve liste eski hâline dönüyor

---

## Sprint M1j — Mobil Ortam Etkinlikleri (Track F2, 2026-08-02)

> Sözleşme: `contracts/SPRINT_M1J_MOBILE_EVENTS_CONTRACT.md`. Kapsam kararları sahip onaylı:
> **tam CRUD** + kapak **yalnız gösterim**. Referans: sahip Discord mobil akışının 7 ekran görüntüsü.
> `api/`'ye **dokunulmadı** — etkinlik hattı V3'te uçtan uca yazılmıştı (CRUD + ilgi + tekrarlama +
> kapak + `canViewEvent` görünürlük choke-point'i). `web/`'de yalnız `tr.json`'a iki mobil metni.

- [x] `api/events.ts` — 7 uç (liste, tekil, oluştur, güncelle, sil, ilgi ekle/kaldır) + tipler
- [x] Aksiyon şeridine **takvim düğmesi** (M1g'de yeri ayrılmış, düğmesi bilinçli konmamıştı)
- [x] Etkinlikler ekranı: liste · boş durum · **Oluştur** (yalnız `MANAGE_EVENTS`) · odaklanmada tazeleme
- [x] Kart: occurrence tarihi · konum · "şu an sürüyor" + 🔁 rozetleri · kapak · açıklama ·
  **İlgileniyor** iyimser toggle + sayaç · ⋯ (Düzenle/Sil)
- [x] 3 adımlı form (nerede → ne → önizleme), **oluştur ve düzenle aynı ekran**; donanım geri tuşu
  adımlar arasında geri gider
- [x] Tarih/saat: `@react-native-community/datetimepicker` 8.4.4 (**PM onaylı tek yeni bağımlılık**,
  `npx expo install` ile SDK 54 eşleşmesi)
- [x] `typecheck` + `lint` temiz

### Bilinçli kararlar
- [x] 🔴 **`coverImageId` hiçbir payload'a girmiyor** — mobilde kapak yükleme yok ve alanı `null`
  göndermek backend semantiğinde **web'den yüklenmiş kapağı silerdi**. Tipe bile koyulmadı.
- [x] **Liste sheet değil tam ekran route** (sözleşme revizesi): RN `Modal` Android'de her şeyin
  üstünde kalır, üstüne `router.push` ile form açılamazdı. Proje deseni de route yönünde.
- [x] **Açıklama düz metin** — mobilde markdown boru hattı hiç yok (mesajlar bile öyle); web'in
  "Markdown desteklenir" ipucu mobile taşınmadı (söz verilmeyen şey yazılmaz).
- [x] Tarih **`occurrenceStartAt`**'tan, düzenlemede **`startAt`** (çapa) yüklenir — occurrence
  istemcide yeniden hesaplanmaz.

### R1 — sahip cihaz turu sonrası (2026-08-02)
> Sahip testi: "etkinlik sistemi çalışıyor, etkinlik oluşturdum". Ayrı ekrandan yönetim kabul edildi
> (alt panel tercih ediliyordu ama liste büyüyünce ayrı ekran mantıklı bulundu).

- [x] **Sıklık ve kanal seçimi açılır kutu oldu** — inline radyo listesi yerine dokununca alttan
  panel (`SelectSheet`, Discord deseni). Sahip yalnız sıklığı söyledi; kanal seçimi de aynı
  etkileşime çekildi (ikisi de Discord'da kapalı kutu, tek bileşen iki yerde)
- [x] 🔴 **Bitiş tarihi + saati eklendi — HEM WEB HEM MOBİL.** Sahip bulgusu: alan web'de de
  yoktu, gözden kaçmış. **Backend'de `endAt` baştan vardı** (opsiyonel, `endAt <= startAt` reddi,
  update'te `null` → kaldır) — eksik olan yalnız UI'dı, `api/`'ye yine dokunulmadı
- [x] Bitiş kartlarda da görünür: "bugün saat 21.00 - 23.00" (aynı gün → yalnız saat, farklı gün →
  tam tarih); web + mobil ortak `formatEventRange`
- [x] Sihirbaz ekranına **sağ üst X** — vazgeçen kullanıcı geri okuna adım adım basmasın
- [x] `vue-tsc --noEmit` + `vite build` + mobil `typecheck` + `lint` temiz

### R1-b — bitiş ZORUNLU oldu (sahip kararı, aynı gün)
- [x] Bitiş artık boş kalamaz: varsayılan **başlangıç + 1 saat**, "Bitişi kaldır" düğmesi kaldırıldı
  (web + mobil). Eski bitişsiz etkinlik düzenlenirken de aynı kuralla dolar
- [x] **Süre korumalı kaydırma:** başlangıç saati/tarihi değişince bitiş de aynı kadar kayar —
  yoksa başlangıcı ileri alan kullanıcı her seferinde "bitiş başlangıçtan sonra olmalı" hatasına
  çarpardı (Discord da böyle davranıyor)
- [x] *Not: Discord'da ses kanalı etkinliğinde bitiş HİÇ sorulmuyor, yalnız dış konumda zorunlu.
  Bizde her ikisinde de zorunlu — gerekçe kodda: `computeOccurrence` bitişsiz etkinliğin süresini
  sıfır sayıyor, yani "şu an sürüyor" rozeti hiç yanmıyordu.*

### Kapsam dışı (borç)
- [ ] Kapak görseli **yükleme** (sahip kararı) · **paylaş bağlantısı** (web'in `?event=` yakalayıcısı
  aktif-ortam bağlamına bağlı, link yolu doğrulanmadı) · açıklamada **markdown** · `guild.event_*` **WS**
- [ ] **Ses kanalı listeleme davranışı** — mobilde ses kanalları hiç listelenmediği için etkinlik
  formundaki kanal seçicisi gerçek veriyle görülemedi; ses fazı (M4) gelince bakılacak (sahip notu)

### DoD (**fiziksel cihazda** — sahipte)
- [ ] Şeritte takvim ikonu var, dokununca Etkinlikler açılıyor
- [ ] Etkinlik yokken boş durum; yetkisiz hesapta "Oluştur" yok
- [ ] 3 adımdan geçip etkinlik oluşuyor; liste dönünce güncel
- [ ] Ses kanalı ve "Başka Bir Yer" iki yol da yürüyor
- [ ] Tekrarlayan etkinlikte 🔁 rozeti + **doğru sonraki tarih**
- [ ] "İlgileniyor" iki yönde çalışıyor, sayaç doğru
- [ ] Düzenle → alanlar dolu geliyor, kaydedince değişiyor; **web'den yüklenen kapak silinmiyor**
- [ ] Sil → onay çıkıyor, listeden düşüyor
- [ ] Geçmiş tarih / boş ad → Türkçe hata; sunucunun 403'ü Türkçe görünüyor

---

## Sprint M2a — Mobil Okunmamış Görsel Dili (Track F2, PM compose 2026-08-02)

> Sözleşme: `contracts/SPRINT_M2A_MOBILE_UNREAD_CONTRACT.md`. **M2 üçe bölündü** (sahip "bildirim
> sistemi" başlığı altında üç ayrı iş tarif etti): **M2a** okunmamış görsel dili · **M2b** sustur +
> bildirim seviyesi yüzeyi (R12 backend'i hazır, mobilde hiç bağlı değil) · **M2c** push (dev build +
> PushToken + gönderim). Referans: sahibin Discord mobil ekran görüntüleri.
>
> `api/`'ye **SIFIR dokunuş** — gereken her alan sunucudan zaten dönüyor, mobil ya tiplememiş ya hiç
> okumamış. Delege: Sonnet dev oturumu.

- [x] Rail: beyaz okunmamış pip (aktif ortamda dikey çubuğa uzar) + sağ altta kırmızı bahsetme rozeti
- [x] Kanal satırı: okunmamış = ad **ve ikon** parlar; bahsetme = sağda kırmızı sayaç
- [x] Ana Sayfa sekmesi + sohbet ekranlarının geri okunda **toplam ping** rozeti (etkinlik formu hariç)
- [x] Canlı güncelleme: `channel.activity` / `mention` soket olayları rozetleri anında büyütür
- [x] Merkezi `stores/unread.ts` (bugün: kanal sayacı ekran-yerel, ortam sayacı hiç yok)
- [x] Okundu işaretle: ortam paneli + kategori paneli eklendi; kanal paneli **her üyeye** açıldı
- [x] `typecheck` + `lint` temiz; `api/` ve `web/` diffi **boş**

### PM doğrulaması (dev teslimi sonrası)
- [x] **Çift sayım riski elendi:** `mention` olayı yalnız bahsetme sayacını artırıyor, genel
  okunmamışı değil. Gerekçe koddan teyit edildi — `messages.controller.ts:70-71` her mesajda
  `notifyChannelActivity` **ve** `notifyMentions` çağırıyor, yani bahsetmeli mesaj iki olayla
  geliyor; ikisinde de artırmak sunucunun kendi sayımından saptırırdı
- [x] **Sözleşme hatası düzeltildi (dev bulgusu):** §4.4 `group/[id].tsx`'i sohbet ekranı sanıyordu;
  o route grup **yönetim** ekranı, gerçek grup sohbeti `dm/[id].tsx` `kind=group`. İki ekran üç
  sohbet yüzeyini de kapsıyor
- [x] Bonus düzeltme: hex `ClipPath` id'si yalnız baş harfe göre üretiliyordu → aynı harfle başlayan
  iki ortam çakışabilirdi; artık `guild.id` ile anahtarlı

### 🔴 Düzeltilen tutarsızlık (PM denetimi)
Mobilde genel okunmamış **kırmızı** rozetle çiziliyordu; web'de kırmızı = **bahsetme**, beyaz =
okunmamış. İki istemci aynı renge farklı anlam yüklüyordu. `unreadMentionCount` mobilde tiplenmiş ama
hiç kullanılmıyordu. M2a mobili web semantiğine hizalar.

### M2 sonrası kalem (sahip kararı 2026-08-02)
Üçü aynı backend dokunuşunu paylaştığı için tek pakette: **etkinlik bildirimi** (bugün hiç
üretilmiyor → "Yeni Etkinlikleri Sustur" ancak bundan sonra anlamlı) · **@everyone/@here bastırma** ·
**tüm @Rol bahsetmelerini sustur**. *Öne Çıkanlar* karşılığı bizde yok, alınmadı.

### DoD (**fiziksel cihazda** — sahipte)
- [ ] Okunmamışta beyaz pip, aktif ortamda dikey çubuk; bahsetmede kırmızı sayaç doğru
- [ ] Kanal listesinde okunmamış parlıyor, bahsetme sağda kırmızı sayaçla
- [ ] Ana Sayfa sekmesi ve geri okundaki sayı **aynı**; etkinlik sihirbazında rozet yok
- [ ] Ana ekranda dururken gelen mesaj rozeti **anında** büyütüyor (yenilemeden)
- [ ] Ortam panelinden "Okundu işaretle" ortamın tümünü temizliyor
- [ ] Sıradan üye kanal panelinden okundu işaretleyebiliyor

---

## Sprint M2b — Mobil Bildirim Tercihleri (Sustur + Seviye) — 2026-08-02

> Sözleşme: `contracts/SPRINT_M2B_MOBILE_NOTIF_PREFS_CONTRACT.md`. R12 backend'i (NotificationPref,
> süreli sustur, seviye) hazırdı, mobilde hiç bağlı değildi. Delege: Sonnet dev oturumları.

- [x] `notificationPrefs` store + `GET/PUT /notifications/prefs` bağlantısı (iyimser yaz, hata → geri al)
- [x] DM paneli: Konuşmayı Sustur (15dk/1s/3s/8s/24s/süresiz) + Bildirim Ayarları
- [x] Kanal paneli: aynı ikili + başlıkta **ortam simgesi** (hangi ortama ait olduğu belli olsun)
- [x] Ortam paneli: üçüncü aksiyon **Bildirimler** (her üyeye açık) + **ortam açıklaması**
- [x] `guild-notifications.tsx`: ortamı sustur (süre) + seviye; seçince anında kaydediyor
- [x] Rozetler tercihe göre süzülüyor (M2a'nın üstüne); susturulmuş kanal listede sönük
- [x] Süre/seviye seçicileri M2a'nın `SelectSheet`'ini tekrar kullanıyor — yeni bileşen yok

### R1 — sahip cihaz turu (aynı gün)
- [x] 🔴 **Ortam rozeti kanal tercihlerini bilmiyordu (`api/` düzeltmesi):** bir kanalı susturunca
  o kanaldan gelen mesaj **ortam pill'ini yakıyordu**; "Hiçbiri" seçeneği de kanal düzeyinde
  etkisiz görünüyordu. Kök neden `guilds.service.ts findMyGuilds` toplamının `NotificationPref`'e
  hiç bakmaması. İstemcide çözülemezdi — rail'de **girilmemiş ortamların kanal listesi yok**.
  Düzeltme: tek ek sorguyla (`userId` + `targetType: CHANNEL`) tercihler çekilip toplama uygulanıyor;
  kanal başına sorgu eklenmedi, migration/yeni alan/yeni uç YOK. **Web de aynı düzeltmeyi aldı.**
  `isMuteActive` `notifications.service.ts`'e çıkarıldı (tek kaynak), 6 yeni birim test.
- [x] 🔴 **Susturma = TAM SESSİZLİK (sahip kararı, sözleşme §5 revize):** ilk tablo susturulmuşta
  bahsetme rozetini açık bırakıyor, gerekçe olarak web'i gösteriyordu — **gerekçe yanlıştı**, web de
  gizliyor. Sahip gerekçesi: *"susturma zaten tamamen susturuyorsun; ince ayarı bildirim seviyesiyle
  yapıyorsun. Kullanıcı ayarlara girmeden 'şu ortam kafamı ağrıtıyor' diyebilmeli."* Backend de bunu
  destekliyor (susturulmuşta MENTION bildirimi bile üretmiyor). Mobil web ile birebir aynı davranışta.
- [x] Kanal panelindeki ortam simgesi büyütüldü (22 → 36)
- [x] `nest build` + 893 test yeşil · `migrate status` temiz (şema değişmedi) · mobil `typecheck`+`lint` temiz

### DoD (**fiziksel cihazda** — sahipte)
- [ ] Kanalı susturunca **ortam pill'i artık yanmıyor**; susturulmamış kanaldan mesaj gelince yanıyor
- [ ] Kanal seviyesi "Hiçbiri" → o kanal hiçbir sayaca katkı vermiyor
- [ ] Susturulmuş ortam/kanalda bahsetme rozeti de çıkmıyor (tam sessizlik)
- [ ] DM 8 saat susturulunca panel "Susturmayı Kaldır" + bitiş saatini gösteriyor
- [ ] Kanal panelinde ortam simgesi okunaklı boyutta
- [ ] Web'den yapılan susturma mobilde görünüyor (tek kaynak)

---

## Sprint M2c — Mobil Kanal Detay Ekranı — 2026-08-02

> Sözleşme: `contracts/SPRINT_M2C_MOBILE_CHANNEL_DETAILS_CONTRACT.md`. Sahip Discord'da kanal adının
> tıklanabilir olduğunu fark etti, aynısını istedi. İki tier: küçük `api/` eklentisi + mobil ekran.

- [x] `api/` — arama `has` filtresi üçe ayrıldı: `link` (aynı) · **`image`** (yeni: image/* + video/*) ·
  `file` (**daraltıldı**: medya OLMAYAN ekler). Migration yok, yeni uç yok. 899 test yeşil;
  testler `application/pdf`'in `image`'e, `image/png`'nin `file`'a düşmediğini ayrı ayrı doğruluyor
- [x] Kanal başlığı tıklanabilir + chevron → kanal detay ekranı
- [x] Aksiyon şeridi: **Ara** (kanal ön-seçili arama) · **Sustur** (M2b süre seçicisi) ·
  **Ayarlar** (yalnız yetkilide render edilir)
- [x] Beş sekme: Üyeler (davet satırı + rol gruplu) · Medya (3 sütun ızgara) · Sabitlemeler ·
  Bağlantılar · Dosyalar
- [x] `pins.tsx` içeriği `PinnedMessagesList`'e çıkarıldı — iki yüzey aynı bileşeni kullanıyor
- [x] `typecheck` + `lint` temiz; `web/` diffi yalnız `tr.json`

### Bilinçli kararlar / dev bulguları
- [x] **Alt Başlıklar (threads) KONMADI** — Discord'un dördüncü aksiyonu; bizde thread özelliği yok
- [x] 🔴 **Dev yan etki yakaladı (PM'in sözleşmede atladığı):** mobildeki mevcut M1g "Medya" arama
  sekmesi `has=file` kullanıyordu; `file` daraltılınca sessizce boşalacaktı → `has=image`'e çevrildi.
  Sözleşme yalnız web'in "Dosya" filtresini yan etki olarak saymıştı
- [x] **Chevron yalnız `guildId` bilinen girişlerde** — bildirimler sekmesi/arama/pins kanal ekranına
  `guildId` taşımıyor (önceden var olan boşluk). Kırık navigasyon vaat etmektense başlık düz metin kalıyor
- [ ] **Borç:** video ekleri Medya ızgarasında küçük resim değil rozet olarak görünüyor
  (`AttachmentView`'da video önizleme desteği hiç yoktu)

### DoD (**fiziksel cihazda** — sahipte, API yeniden başlatılmalı)
- [ ] Kanal başlığında chevron var, dokununca detay açılıyor
- [ ] Ara → o kanalda arama; Sustur → süre seçimi; yetkisizde Ayarlar yok, şeritte boşluk kalmıyor
- [ ] Beş sekme de veri getiriyor, boş kanalda boş durum çıkıyor
- [ ] Medya'da yalnız görsel/video, Dosyalar'da yalnız diğer dosyalar
- [ ] Üyeler sekmesinde roller gruplu, rolsüz üyeler en altta


---

## Küçük Revizeler — 2026-08-03 (sahip turu, PM onaylı)

> M2a/M2b/M2c cihaz turu **temiz geçti** (sahip doğruladı 2026-08-03). Aşağıdakiler o turda ve
> web kullanımında biriken küçük kalemler. Scope creep DEĞİL (sahip talebi). Dev kutu işaretler, item EKLEMEZ.

### R-a — Mobil: etkinlik kartı ⋯ menüsü kartın üstünde açılsın (`mobile/`)

Bugün menü `EventCard.tsx:122` kartın **en altında**, ayraçlı blok olarak açılıyor: iki öğe için
kartı uzatıyor ve kartın yapısını bozuyor. Sahip "kartın üzerinde açılsın, iki buton zaten, küçük
bir menü güzel durur" dedi.

- [x] Menü, kart gövdesi içinde **mutlak konumlu küçük popover**: ⋯ düğmesinin **altına**, sağa yaslı
      (`top` ~34-40, `right` ~10), `minWidth` ~150, `bgContent` + `borderStrong` + `radius.md`
      (kart `bgElevated` olduğu için kontrast şart), Android'de `elevation`, `zIndex`
- [x] Menü açıkken kart içini kaplayan **saydam kapatıcı** (`StyleSheet.absoluteFill` `Pressable`) →
      karta dokununca menü kapanır. **Yeni `Modal` AÇMA** — liste zaten bir sheet Modal'ı, iç içe
      Modal Android'de kırılgan (mevcut dosyadaki not aynen geçerli)
- [x] Kart akışı menü açılınca **yer değiştirmez** (bugün ittiriyor)
- [x] 🔴 **Taşma kontrolü:** kart `overflow: 'hidden'`. En kısa kartta (kapaksız + açıklamasız +
      rozetsiz) menü kartın altından **kırpılmamalı**. Kırpılıyorsa çözüm: kartı `overflow: 'visible'`
      yap + kapak görseline kendi `borderTopLeftRadius`/`borderTopRightRadius` değerlerini ver
      (yarıçap kaybolmasın). Üçüncü bir yol arama, sapma hissi → DUR
- [x] `typecheck` + `lint` temiz; yeni bağımlılık yok; metinler `tr.json`, ölçü/renk `theme`

### R-b — Web: DM sağ-tık menüsü + başlık sadeleşmesi (`web/`)

Sözleşme: `contracts/SPRINT_DM_MENU_CONTRACT.md` (tek doğruluk kaynağı). Kutular orada, DoD §6.

### Ertelendi (sahip kararı, **yapılmayacak**)

- **Mobil: nick'e basınca açılan profil kartına "Kanka Ekle"** → sahip erteledi. Gerekçe: o kart
  ileride **ayrı bir profil ekranına** dönüşecek ve asıl doldurma o zaman yapılacak. Bugün oraya
  düğme koymak, yarın taşınacak bir yüzeye yatırım olur. Kanka ekleme mobilde **DM panelinden**
  erişilebilir durumda, dilsiz değil.


---

## Sprint R14 — Bildirim Kapsamı: Etkinlik Bildirimi + @everyone Bastırma — 2026-08-03

> Sözleşme: `contracts/SPRINT_R14_NOTIFICATION_SCOPE_CONTRACT.md` = **tek doğruluk kaynağı**.
> Sahip kararı 2026-08-02 ("M2 sonrası kalem"), PM compose 2026-08-03. **R7-nötr** (yeni erişim
> kararı yok; bastırma yalnız kullanıcının kendi bildirim yüzeyini kısar). Dev kutu işaretler, item EKLEMEZ.
>
> Sahip onaylı kapsam kararları: **@here OUT** (özellik hiç yok) · **rol bahsetmesi susturma → R15**
> (özelliğin kendisi orada yazılır, anahtar orada anlam kazanır).

### Backend (`api/`) — sözleşme §2
- [x] Şema: `NotificationType.EVENT_CREATED` + `NotificationPref.suppressEveryone/suppressEvents`
      (additive, tek migration, DB'ye **uygulanır**)
- [x] `setPref`: iki bayrak yalnız `targetType=GUILD` ile kabul; aksi → `400 INVALID_PREF_TARGET`
- [x] `events.service.create` → `EVENT_CREATED` üretimi (alıcı kümesi `eventRecipients`'tan aynen;
      tercih süzgeci tek sorgu, insert tek `createManyAndReturn`, alıcı başına sorgu YOK)
- [x] `NotificationsService.createMany` (actor/guild çözümü bir kez, emit kullanıcı başına)
- [x] @everyone bastırma üç yüzeyde: `notifyMentions` (emit + persist) · `findMyGuilds` rozeti ·
      `findByGuild` kanal rozeti. **Doğrudan bahsetme her zaman geçer**
- [x] Testler §2.5 (özellikle: bastırma açıkken doğrudan bahsedilen bildirim ALIR)
- [x] `nest build` + tüm testler yeşil + `prisma migrate status` temiz

### R1 — DM push kapsama alındı (sahip kararı 2026-08-03) ✅
- [x] Sahip: *"push bildirim DM'i kapsamalı, tartışmasız bir eksik"* → sözleşmeye §2.6 eklendi
- [x] **Karar: DM push gider, kalıcı bildirim kaydı AÇILMAZ.** DM'in kendi okunmamış yüzeyi var
      (liste + rozetler); çana da düşerse aynı olay iki yerde birikir ve iki kez temizlenir.
      Çan bugünkü anlamını koruyor: bahsetme · kanka · davet · etkinlik
- [x] `notifyDmActivity` yolunda; alıcı kümesi o yolun zaten hesapladığı yerden alınıyor,
      yazar filtreleniyor, tercih kapısı **mevcut** `shouldNotifyChannel(userId, null, channelId)`
- [x] **Dev doğrulaması (koddan):** `shouldNotifyChannel` `guildId=null` verilince yalnız `CHANNEL`
      tercihini sorguluyor, ortam fallback'i devreye girmiyor → DM'e birebir uygun. Web'in
      `useDmMenuActions` da susturmayı her zaman `CHANNEL + dmChannelId` ile yazıyor. **İkinci
      süzgeç kopyası yazılmadı** (R14/R15'te bedeli görülmüştü)
- [x] 7 yeni test (susturulmuşa gitmez · yazara gitmez · grupta diğer herkese gider · kalıcı kayıt
      oluşmaz · gövde 100 karaktere kırpılır · PENDING istekte ve guild kanalında gönderilmez);
      **975 test yeşil**

### Dev build ön yapılandırması (§5 hazırlığı) ✅
- [x] `app.json`: `android.package = com.kankaverse.app` (**kalıcı kimlik**, Play'e çıkınca
      değişmez) + `googleServicesFile` + `expo-notifications` plugin kaydı
- [x] `eas.json`: `development` (dev client, internal, apk) · `preview` (internal, apk) ·
      `production` (app-bundle). `cli.version` bilinçli boş — sahibin kurulu sürümüne göre
- [x] `.gitignore`: Firebase **servis hesabı** anahtarı desenleri (gizli); `google-services.json`
      bilinçle ignore EDİLMEDİ (herkese açık tanımlayıcılar, commit'lenir)
- [x] `expo-notifications@~0.32.17` + `expo-device@~8.0.10` kuruldu (SDK 54 uyumlu, `expo install`
      seçti). Ekran/izin kodu bu işte YOK — build hazır olunca §3 ayağı

### Mobil (`mobile/`) — sözleşme §3
- [x] `guild-notifications.tsx`: iki anahtar (@everyone Bastır · Yeni Etkinlikleri Sustur), anında kaydet,
      iyimser yaz + hata geri al; yeni bileşen yok (RN `Switch`)
- [x] `notifications.tsx`: `EVENT_CREATED` satırı (takvim ikonu) → ortamın etkinlikler ekranı;
      `guildId` yoksa satır tıklanmaz
- [x] `notificationPrefs` store iki alanı taşır; `typecheck` + `lint` temiz

### Web (`web/`) — sözleşme §4
- [x] Aynı iki anahtar ortam bildirim yüzeyinde — **iki yüzeye birden** (`ServerRail` sağ-tık menüsü +
      `ChannelPanel` ortam başlığı dropdown'ı); ikisi de `useGuildMenuActions`'ı paylaşıyor, tıklayınca
      menü kapanmıyor (arka arkaya iki anahtar çevrilebilsin)
- [x] **Yerleşim düzeltmesi (sahip 2026-08-03, Discord ekran görüntüsüyle):** iki bayrak önce menünün
      **üst seviyesine** satır olarak konmuştu; sahip Discord'un bunları "Bildirim Ayarları" alt
      panelinin içinde, seviye radyolarının altında kutucuk olarak tuttuğunu gösterdi. Satırlar
      söküldü, `NotifLevelFlyout`'a opsiyonel `suppressEveryone`/`suppressEvents` prop'u eklendi:
      prop verilmezse bölüm hiç render edilmiyor → **kanal menüsünde çıkmıyor** (sunucu zaten kanal
      hedefini `INVALID_PREF_TARGET` ile reddediyor, gösterilseydi tıklanınca hata verirdi).
      Kutucuğa basınca panel kapanmıyor; panel genişliği/yüksekliği bayraklı halde büyüyor
      (konumlama sabitleri computed'e çevrildi, kenar-taşma clamp'i bozulmasın)
- [x] `NotificationBell` + `useNativeNotifications` `EVENT_CREATED` tanır (metin mobille birebir)
- [x] Metinler `tr.json`'a **bir kez** (mobil oradan import eder); `vue-tsc --noEmit` temiz

> **Dev notu — bildirime tıklayınca etkinlikler nasıl açılıyor:** bildirimde etkinlik ID'si YOK
> (`preview` = etkinlik adı), o yüzden kart vurgusu yapılmıyor; satır ortamın ilk kanalına gidip
> `?events=1` ile modalı açtırıyor (mevcut `?event=<id>` derin-link yolunun ikizi). Bu sırada
> `ChannelPanel`'deki derin-link yakalayıcısı `onMounted`'dan **watcher**'a çevrildi: panel ortam
> sidebar'ı olarak mounted kaldığı için, **aynı ortamdayken** gelen bildirime tıklamak query'yi
> değiştiriyor ama mount'u tetiklemiyordu → tıklama sessizce ölürdü. Kanalsız ortamda satır hiçbir
> yere götürmüyor (kırık navigasyon vaat etme kuralı).

### DoD (**cihaz + tarayıcı** — sahipte)
- [x] Etkinlik oluştur → diğer hesapta bildirim satırı çıkıyor, dokununca etkinliğe gidiyor
- [x] "Yeni Etkinlikleri Sustur" açıkken bildirim gelmiyor; ortam susturulmuşken de gelmiyor
- [x] "@everyone Bastır" açıkken: rail rozeti yanmıyor, kanal rozeti yanmıyor, bildirim düşmüyor
      — bir tur geri açılıp **tekrar kapandı** (aşağıdaki test-yöntemi notu)
- [~] Aynı mesajda doğrudan bahsedilen kullanıcı bildirimi **alıyor** — **birim testiyle kilitli**
      (§2.5), sahip elle tetikleyemedi (aşağıdaki mobil kısıtı)
- [x] Web'den açılan anahtar mobilde görünüyor

### Sahip DoD turu — 2026-08-03 (kapandı)

- **Bastırma testi web'den tetiklendi, mobilden değil:** mobilde `@` girişi henüz yok (ne kişi ne
  everyone bahsedilebiliyor), bahsetme yalnız web'den üretilebiliyor. Bastırmanın **mobil rozetine**
  etkisi bu turda doğrulanmadı; süzgeç sunucuda olduğu için istemciden bağımsız, ama kayda geçsin.
- **🟢 Doğru davranış (bastırma AÇIKKEN):** bastırılmış bir @everyone mesajı beyaz pill üretir.
  Bastırma yalnız *bahsetme* yolunu keser (kırmızı rozet + kalıcı bildirim + anlık `mention` olayı);
  mesajın kendisi o kanala düşmüş bir mesaj olduğu için normal okunmamış sayılmaya devam eder.
  Sahip seviyeyi "Hiçbiri" yapınca beyaz pill de kayboldu → iki katman bağımsız, sözleşme §2.4 ile birebir.
- **Test yöntemi tuzağı (iki taraf da yanıldı, kayda geçsin):** sahip "bastırmayı kaldırdım, kırmızı
  rozet yine çıkmadı" dedi; PM bunu kabul edip maddeyi geri açtı. Gerçek sebep ikisinden de basitti:
  o sırada **bildirim seviyesi "Hiçbiri"ydi**, yani zaten hiçbir rozet çıkmazdı. Seviye "Tümü"ye
  alınınca @everyone kırmızı baloncuğu üretti. **Ders:** bastırma testinde seviye ALL olmalı, yoksa
  iki süzgeç üst üste biner ve hangisinin kestiği anlaşılmaz.
- **🔴 Yan bulgu (R15'e devredildi) — `@everyone` iki kapı arkasında:** **(1)** `@everyone` rolünün
  `mentionable` alanı **varsayılan `false`** (`guilds.service.ts:195`; yerel DB'de 12 ortamın 10'unda
  kapalı) → `@` listesinde "everyone" önerisi hiç çıkmaz; **(2)** anahtar açık olsa bile öneriyi
  **listeden seçmek** şart: `pendingEveryone` yalnız `selectSuggestion`'da set ediliyor, elle yazılan
  `@everyone` token'a çevrilmiyor ve kullanıcıya **hiçbir uyarı verilmiyor** (sessiz başarısızlık;
  Discord'da yazmak yeter). Sunucu doğru davranıyor: token yoksa `mentionsEveryone=false`
  (`messages.service.ts:143-151`). R15 kapı modelini (`mentionable` + `MENTION_EVERYONE`) ve rol
  çipini getirince ikisi de kapanır.
- **🔴 Sahip bulgusu → R15'e devredildi:** bir rolün "bahsedilebilir" anahtarı açıkken mesaj
  kutusunda `@` yazınca o rol öneri listesinde **çıkmıyor**. Kodda doğrulandı: `useMentionAutocomplete.ts`
  yalnız üyeleri + `everyoneRoleId`'yi öneriyor, normal rol hiç listelenmiyor. R14 regresyonu DEĞİL,
  özellik henüz yazılmadı. PLAN C1-c'deki ölü-ayar bulgusunun görünen yüzü (rol ayarlarında
  "bahsedilebilir" ve `MENTION_EVERYONE` gösteriliyor + kaydediliyor ama backend okumuyor).
  R15 sözleşmesi bunu kapsıyor.

### R-c — Mobil: etkinlik kartında ⋯ menüsü KALKSIN, iki ikon doğrudan kartta (`mobile/`)

Sahip cihazda R-a'yı denedi: popover çalışıyor ama karar değişti — *"menü olmasın, o iki butonu
direkt kart üzerinde gösterelim, ikon bazlı"*. R-a'nın popover'ı ve kapatıcısı **tamamen sökülür**
(ölü kod bırakma).

- [x] `EventCard.tsx`: ⋯ düğmesi + `menuOpen`/`onToggleMenu` prop'u + popover + kapatıcı **kaldırılır**;
      çağıran ekran (`guild-events.tsx`) menü state'inden arındırılır
- [x] Yerine `canManage` olduğunda **iki ikon düğmesi** kartın sağ üstünde (başlık satırında, ⋯'nin yeri):
      **dişli** (`settings-outline`) → düzenle · **X** (`close-outline`) → sil. X `theme.colors.danger`
- [x] Dokunma hedefi ≥40dp (`hitSlop` ile), ikonlar arası boşluk kartı sıkıştırmasın; başlık `titleBlock`
      daralmasın (uzun etkinlik adı hâlâ iki satır)
- [x] Silme onayı **korunur** (mevcut `ConfirmDialog` akışı) — tek dokunuşla silme YOK
- [x] R-a'nın kırpılma çözümü (`overflow: 'visible'` + kapak köşe yarıçapları) artık **gereksizse geri alınır**
      (popover gitti); kartın kapak köşeleri bozulmadan eski `overflow: 'hidden'` haline dönmeli
- [x] `typecheck` + `lint` temiz; erişilebilirlik etiketleri (`accessibilityLabel`) iki düğmede de var

---

## Sprint WEB-PARITE — Rozet Paritesi + Menü Cilası + DM Profil Paneli — 2026-08-03

> Sözleşme: `contracts/SPRINT_WEB_NOTIF_PARITY_CONTRACT.md` = **tek doğruluk kaynağı**.
> Kaynak: **sahip canlı web testi** 2026-08-03. Saf `web/`, **sıfır backend**. Kutular sözleşme §5'te,
> özet aşağıda. Dev kutu işaretler, item EKLEMEZ.

- [x] Canlı rozet paritesi: `channelBadgeEffect` (mobil ikizi) + `useSocket` üç handler'da süzgeç
      (`channel.activity` · `mention` · `dm.message`)
- [x] `DmList`: susturulmuş DM sönük + rozetsiz, ama listede kalıyor ve son mesajı güncelleniyor
- [x] Kanal sağ-tık menüsünde **süreli sustur** (`MuteDurationFlyout`; `useChannelMenuActions`'a
      `muteChannelFor`/`unmuteChannel`)
- [x] `MuteDurationFlyout` + `NotifLevelFlyout` **hover** ile açılıyor (150ms kapanma gecikmesi),
      tıklama ve klavye korunuyor, alt-sayfa modunda davranış değişmiyor
- [x] `<1280`'de DM profil paneli toggle + overlay (üye paneli deseni)
- [x] `vue-tsc --noEmit` temiz · `vite build` geçer · `api/` diffi yok

### 🔴 Sahip canlı testi bulgusu (2026-08-03) — hover yarım bağlanmıştı

Sahip web'de denedi: **Bildirim Ayarları hover ile açılıyor, Sustur açılmıyor.** Kök neden:
`MuteDurationFlyout` `useFlyoutMenu`'yu import edip handler'ları destructure etmiş ama
**template'e hiç bağlamamış** — tetikleyicide yalnız `@click` vardı, `@mouseenter`/`@mouseleave`/
`@keydown` yoktu, teleport edilen panelde de yoktu. Yani composable takılıydı, kablosu yoktu;
ayrıca `open.value` doğrudan yazıldığı için "aynı anda tek flyout" koordinasyonu da devre dışıydı.
Düzeltme: `NotifLevelFlyout` ile birebir aynı bağlanış (`toggleFlyout(positionFlyout)` +
üç hover/klavye handler'ı + panelde `onPanelEnter/Leave/Keydown`), `pick`/dış-tık/scroll
kapanışları `closeFlyout()`e çevrildi. **Ders:** composable'ı çağırmak davranışı getirmez;
şablon bağlanışı ayrı bir doğrulama adımı (typecheck bunu yakalamaz — kullanılmayan destructure
uyarı üretmiyor).

---

## Sprint M2d — Mobil Bahsetme Yazma (@üye + @everyone) — 2026-08-03

> Sözleşme: `contracts/SPRINT_M2D_MOBILE_MENTION_COMPOSE_CONTRACT.md` = **tek doğruluk kaynağı**.
> Kaynak: sahip cihaz turu 2026-08-03 ("mobilde @everyone yazınca liste çıkmıyor"). Yalnız `mobile/`,
> `api/` diffi YOK, `web/` diffi yalnız `tr.json`. **R7-nötr.** Dev kutu işaretler, item EKLEMEZ.
>
> **Sıra kilidi:** R15 bu sprint bitmeden başlamaz — R15'in mobil ayağı ("rolleri öneri listesine
> ekle") bu listenin var olmasına dayanıyor.

- [x] `useMentionCompose` kancası: `@` sorgusu (imleç takibi `onSelectionChange` ile), süzme, en fazla
      8 öneri; `@everyone` yalnız rol `mentionable` ise ve listenin en üstünde
- [x] Veri kaynakları: ortam kanalında `guildsApi.getMembers` + `rolesApi.listByGuild`;
      DM'de karşı taraf, grup DM'de üyeler. Ekran açılışında bir kez, `@` yazınca istek YOK
      *(sözleşme `listMembers` yazıyordu, uçun gerçek adı `getMembers` — imza sapması değil, düzeltildi)*
- [x] Öneri listesi mesaj kutusunun üstünde (yeni `Modal` yok, yeni bağımlılık yok),
      `keyboardShouldPersistTaps`, ≥44dp dokunma hedefi
- [x] Gönderimde token dönüşümü: `@ad` → `<@userId>` (yalnız seçilenler),
      `@everyone` → `<@&roleId>`; başarıda temizle, hatada KORU
- [x] 🔴 §4.4 — elle yazılan `@everyone` de token'a çevrilir; kullanıcı adlarında bu YAPILMAZ
      (asimetri bilinçli, sözleşmede gerekçesi var). **Web bu davranışa çekildi** (sahip kararı
      2026-08-03, aşağıdaki ek madde) → mobil ikizini uygular, iki istemci aynı
- [x] `guildId`siz açılan kanal ekranında liste hiç açılmaz (yarım liste = yanlış vaat)
- [x] `typecheck` + `lint` temiz; metinler `tr.json`'a bir kez; `MessageComposer.tsx` 230 satır

### Uygulama notları (PM, aynı gün)
- 🔴 **İmleç hesabı ilk yazımda yanlıştı, düzeltildi:** `onSelectionChange` yalnız imleci saklıyordu,
  sorguyu yeniden hesaplamıyordu. RN'de `onChangeText` `onSelectionChange`'ten ÖNCE tetiklendiği
  için metnin ORTASINA dokunup yazan kullanıcıda sorgu metnin SONUNDAN okunuyordu (DoD'un o maddesi
  düşerdi). Artık iki giriş noktası da ortak `recompute(text, pos)`'u çağırıyor; kanca son metni
  `textRef`'te tutuyor. Yan fayda: var olan bir `@kelime`'nin içine dokunmak da listeyi açıyor.
- **Geri tuşu maddesi uygulanmadı:** liste `Modal` değil, giriş şeridiyle aynı ağaçta sıradan bir
  `View`. Android geri tuşu onu zaten görmüyor, ilk basış klavyeyi kapatıyor ve liste onunla birlikte
  görünmez oluyor. `BackHandler` eklemek olmayan bir soruna kod yazmak olurdu; DoD maddesi cihaz
  turunda "geri tuşu ekrandan atmıyor" olarak doğrulanmalı.
### R1 — sahip cihaz turu (aynı gün)
- [x] **Bahsetmeler mobilde düz yazı rengindeydi**, web'de Kor aksanlı (`.kv-mention`: soluk Kor
      zemin + Kor metin). Mobil aynı dile çekildi: `utils/mentions.ts`'e `splitMentions` eklendi
      (metni "sıradan" ve "bahsetme" parçalarına böler), `MessageBubble` vurgulu parçaları iç içe
      `<Text>` ile boyuyor. `formatMentionsPlain` artık onun üstünde ince bir sarmalayıcı — iki ayrı
      regex hattı tutulmuyor (alıntı/önizleme yüzeyleri düz metni kullanmaya devam ediyor).
      *Yatay dolgu konmadı: RN'de iç içe `<Text>` padding'i Android'de güvenilmez.*
- [x] Bahsetme listesinde **kendini gösterme** (dört yüzey: web ortam kanalı + grup DM, mobil ortam
      kanalı + grup DM). Sunucu kendi bahsetmeni zaten yok sayıyor (`messages.gateway.ts` alıcı
      döngüsü yazarı atlıyor) → satır seçilse bile hiçbir bildirim üretmiyordu

- **`MessageScreen.tsx` 344 → 370 satır.** Kök `CLAUDE.md` eşiğini (300) bu sprint ÖNCESİNDE de
  aşıyordu; bölme yapılmadı (erken soyutlama yerine gerçek acıyı bekle). Tetikleyici: bu ekrana
  bir sonraki özellik geldiğinde liste/başlık parçalarını çıkar.

### DoD (**fiziksel cihazda** — sahipte)
- [ ] Ortam kanalında `@` yazınca üye listesi çıkıyor ve yazdıkça süzülüyor
- [ ] Seçilen üye gönderilince karşı hesapta **kırmızı bahsetme rozeti** + bildirim oluşuyor
- [ ] `@everyone` bahsedilebilir ortamda listede çıkıyor ve çalışıyor; bahsedilebilir olmayan ortamda
      ne listede çıkıyor ne elle yazılınca bahsetme oluyor
- [ ] Elle yazılan `@everyone` (listeden seçmeden) bahsedilebilir ortamda çalışıyor
- [ ] 1-1 DM'de karşı taraf, grup DM'de üyeler listede; DM'de `@everyone` yok
- [ ] Liste açıkken klavye kapanmıyor; metnin ortasına dokunup `@` yazınca doğru sorguyla açılıyor
- [ ] Bildirimlerden açılan kanalda (guildId yok) liste açılmıyor, ekran normal çalışıyor

### Web ayağı (sahip kararı 2026-08-03) — M2d'den ÖNCE yapıldı
- [x] `useMentionAutocomplete`: `@everyone` dönüşümü artık **listeden seçime bağlı değil**, tek kapı
      rolün `mentionable` olması. `pendingEveryone` bayrağı ölü kaldığı için kaldırıldı (set eden
      satır, `clearPending` sıfırlaması ve koşul birlikte temizlendi). Sunucu kapısı bağımsız
      duruyor: `mentionable` değilse `resolveMentions` `mentionsEveryone` yazmaz, istemci ne
      gönderirse göndersin. `vue-tsc --noEmit` + `vite build` temiz


---

## Sprint R15 — Rol Bahsetmesi (@Rol) + Rol Bahsetmelerini Sustur — 2026-08-03

> Sözleşme: `contracts/SPRINT_R15_ROLE_MENTIONS_CONTRACT.md` = **tek doğruluk kaynağı**.
> R14 merge edildikten sonra başlatıldı (sıra kilidi tutuldu). **R7-hafif** (§2.8).
> Dev kutu işaretler, item EKLEMEZ.

### Sözleşme revizyonu (PM, başlarken)
- [x] §0/§4 "mobilde bahsetme yazma yok" diyordu; **M2d o boşluğu kapatmıştı**. Olduğu gibi
      uygulansa mobilde kişi ve @everyone etiketlenip rol etiketlenemezdi (liste ortada dururken
      savunulamaz asimetri). §4 genişletildi: roller mobil öneri listesine de girer

### Backend (`api/`) — sözleşme §2
- [x] Şema: `Message.mentionRoles` (≤3, everyone hariç) + `NotificationPref.suppressRoleMentions`;
      üye id'leri GÖMÜLMÜYOR (rol üyeliği değişir, alıcı kümesi okuma anında çözülür)
- [x] `resolveMentions` kapı modeli: mentionable rol → herkes · mentionable olmayan → yalnız
      `MENTION_EVERYONE` · @everyone → **iki kapı**. Kapıya takılan token sessizce düşer.
      İzin **tembel** ve en fazla bir kez çözülür
- [x] `notifyMentions` rol genişlemesi: rol üyeleri tek sorgu, özel kanalda **görünür kümeyle
      kesiştirme**, yaş kapısında minör eleme — iki süzgeç de @everyone yolundakiyle birebir
- [x] Susturma: bir kullanıcı hem everyone hem rolden gelebilir → **susturulmayan kaynak yeter**
      (tek bayrağa bakıp elemek kullanıcının açık bıraktığı kanalı da kapatırdı)
- [x] Rozet üçüncü dalı: `findMyGuilds` (tüm ortamların rol bağları TEK sorgu) + `findByGuild`
- [x] `preview` rol token'ını **rol adına** çözer (sabit "@everyone" değil)
- [x] 🔴 Göç telafisi migration: everyone rolü mentionable olan ortamlara `MENTION_EVERYONE`
      eklendi → **2 ortam etkilendi** (`Test hoo`, `test 2`); bugün @everyone yazabilen sıradan
      üyeler yazabilmeye devam ediyor, kısma artık elle yapılabiliyor
- [x] 17 yeni test (kapı matrisi, özel kanal, yaş kapısı, susturma regresyon kilidi, ≤3 sınırı,
      izin tek-çözüm); **946 test yeşil**, `nest build` + `migrate status` temiz

### Web (`web/`) — sözleşme §3
- [x] Öneri listesinde roller (kapı kuralı uygulanmış) + rol satırı rolün kendi rengiyle
- [x] Render: `<@&id>` → rol adı + rengi. Renk **yalnız `#rrggbb`** kalıbına uyarsa gömülüyor
      (bu HTML sanitize'dan SONRA üretiliyor, DOMPurify görmüyor → doğrulama tek kemer)
- [x] Bahsetme bandı rol bahsetmesinde de yanıyor (`mentionRoles` ∩ kendi rollerim)
- [x] Bildirim Ayarları panelinde üçüncü kutucuk; `vue-tsc` + `vite build` temiz

### Mobil (`mobile/`) — sözleşme §4 (revize)
- [x] `splitMentions` rol adını çözüyor (sabit "@everyone" kalktı); rol parçası Kor aksanıyla çizilir
- [x] Öneri listesine roller (kanal ekranı rolleri zaten çekiyordu — **yeni istek yok**)
- [x] Üçüncü anahtar: Rol Bahsetmelerini Sustur; `typecheck` + `lint` temiz

### Bilinçli karar — rol adları elle yazılınca çevrilmez
`@everyone` için "listeden seçmesen de çalışsın" kuralı vardı; **rollere taşınmadı** (iki istemcide
de). Gerekçe: rol adı serbest metinle çakışabilir ("@Test yaptım") ve yanlış gruba ping atmak yanlış
kişiye ping atmaktan daha gürültülü. `@everyone` tek ve sabit bir hedef, rol adı değil.

### 🔴 R1 — web'de mention listesi hiç açılmıyordu (sahip bulgusu, aynı gün)

**Belirti:** web'de `@` yazınca öneri listesi açılmıyor; mobil sorunsuz. Sahip yeniden başlattı, geçmedi.

**Kök neden (bende):** `utils/markdown.ts`'te `toRolePlaceholder` ve `ROLE_PLACEHOLDER_RE`
**kullanılıyor ama hiç tanımlanmamıştı** — sabit bloğunu değiştiren düzenlemem sessizce tutmamış,
dosyada eski `EVERYONE_PLACEHOLDER` sabitleri kalmıştı. Zincir: mesaj render'ı `ReferenceError`
atıyor → `MessageRow` mount olamıyor (instance `null`) → sonraki her patch Vue'da
`emitsOptions of null` ile çöküyor → **mesaj alanının tamamı güncellenmiyor**, dolayısıyla
`showPopover=true` olmasına rağmen liste DOM'a hiç basılmıyor.

**Neden doğrulamalarım yakalamadı — kalıcı ders:**
- `vue-tsc --noEmit` bu depoda **hiçbir şeyi denetlemiyor** (proje referansları yüzünden 0 çıktı
  veriyor). Tanımsız değişkeni bile görmedi. **Gerçek denetim `vue-tsc -b`** (bilinen 6 önceden-var
  hata: livekit + ModerationView; sayı 6'dan büyükse yeni hata var demektir)
- `vite build` tip denetlemez (esbuild tipleri siler) → `ReferenceError` iki kapıdan da geçti
- Tarayıcıda **sert yenileme** şart: normal yenileme bayat modül servis ediyordu, ilk bisect
  turumu tamamen yanılttı (geri aldığım dosyanın etkisi görünmedi)

**Düzeltme:** eksik sabitler tanımlandı (`ROLE_PLACEHOLDER_PREFIX` + `ROLE_PLACEHOLDER_RE` +
`toRolePlaceholder`), ölü `EVERYONE_PLACEHOLDER` çifti kaldırıldı. Tarayıcıda doğrulandı: liste
açılıyor, roller kendi renkleriyle listeleniyor, mesajlar çiziliyor.

### DoD (**uçtan uca** — sahipte)
- [ ] `mentionable` rolü etiketle → o roldeki üyeler bildirim + rozet alıyor, almayanlar almıyor
- [ ] `mentionable` olmayan rolü sıradan üye etiketleyince hiçbir şey olmuyor (mesaj gidiyor, ping yok)
- [ ] İzinli kullanıcı aynı rolü etiketleyince ping düşüyor
- [ ] Etiketlenen rol ekranda **kendi adıyla** görünüyor (web ve mobil), "@everyone" yazmıyor
- [ ] **Mobilde** `@` yazınca roller de listede; `mentionable` olmayan rol sıradan üyeye görünmüyor
- [ ] Özel kanalda rol etiketi kanal üyesi olmayanlara gitmiyor
- [ ] "Rol Bahsetmelerini Sustur" açıkken rol pingi gelmiyor, adınla etiketlenince geliyor
- [ ] @everyone bugünkü gibi çalışmaya devam ediyor (göç telafisi tuttu)


---

## Sprint M3 — Mobil Push Bildirimi — 2026-08-03

> Sözleşme: `contracts/SPRINT_M3_MOBILE_PUSH_CONTRACT.md` = **tek doğruluk kaynağı**.
> Sahip kararı: "push'u bitirelim, ses en sona". **Kod dev oturumlarına delege edildi**
> ([[pm-dev-cift-yonlu-denetim]] — PM sözleşme + inceleme, kod dev'de).

### Backend (`api/`) — sözleşme §2 ✅
- [x] `PushToken` modeli + migration (DB'ye uygulandı). Token **kullanıcıya** bağlı: aynı cihazda
      hesap değişince `token` upsert'ü `userId`'yi **taşıyor** (eski kullanıcının bildirimi yeni
      kullanıcıya düşmez — T&S kritik madde, PM koddan doğruladı)
- [x] `POST /notifications/push-tokens` (upsert) · `DELETE /notifications/push-tokens/:token`
      (yalnız kendi token'ı, aksi jenerik 404 — varlık sızdırmaz)
- [x] `PushService` (SharedModule): Expo Push API, ≤100'lük chunk, `DeviceNotRegistered` →
      token silinir, tüm hatalar yutulur + loglanır. **Yeni bağımlılık yok** (fetch yeterli)
- [x] `EXPO_PUSH_ENABLED` (default `false`) → kapalıyken hiç istek atılmaz; `.env.example` güncel
- [x] §2.4 — push **kalıcı bildirim üretilen noktaya** takıldı (`create`/`createMany`); ayrı bir
      "kime gitsin" mantığı YAZILMADI, tüm tercih süzgeçleri oraya kadar zaten uygulanmış oluyor
- [x] 21 yeni test; **968 test yeşil**, `nest build` + `migrate status` temiz

### Dev bulguları (delegasyonun karşılığı — PM'in sözleşmede atladıkları)
- **DM push'u bu sprintte YOK, gerekçesi koddan okundu:** `notifyDmActivity` yalnız WS eventi
  yayıyor, `NotificationsService.create` çağırmıyor → DM için **kalıcı bildirim üretilmiyor**.
  Sözleşme "kalıcı bildirim varsa push" dediği için DM doğal olarak kapsam dışı kaldı.
  🔴 **Ürün açığı olarak kayda geçsin:** DM en çok push beklenen yüzey; ayrı kalem.
- **Sözleşme "push gövdesi = `preview`" diyordu, bu 5 bildirim tipinin 3'ünde çalışmıyor:**
  `FRIEND_REQUEST`/`FRIEND_ACCEPT`'te `preview` null, `GUILD_INVITE`'ta ham davet **kodu**
  (mobil zaten metin olarak göstermiyor). Dev, web `tr.json`'daki `notification.*` ifadelerinin
  aynısını sunucuya düz metin olarak yazdı (backend'de zaten Türkçe düz metinler var).
  🔴 **Borç:** push metni ile istemci metni iki ayrı yerde → ilk değişiklikte ayrışır.
- Gönderim **await edilmiyor** (fire-and-forget + `.catch`): `create` mesaj POST'unun içinde
  çağrılıyor, await etmek Expo gecikmesini gönderenin yanıtına eklerdi. PM doğruladı, kabul.

### Mobil (`mobile/`) — sözleşme §3 ✅ (kod; cihaz turu sahipte)
- [x] İzin akışı oturum başlangıcında (`(app)/_layout.tsx` mevcut oturum efekti); `canAskAgain`
      gözetiliyor → kesin ret sonrası tekrar sorulmuyor
- [x] Token: `projectId` `app.json`'dan okunuyor (hardcode yok) → `POST /notifications/push-tokens`
- [x] 🔴 **Çıkışta silme sırası doğru:** `clearPushToken()` **`clearAccessToken()`'dan ÖNCE**
      çağrılıyor — uç `Authorization` istiyor, sıra ters olsa 401 alınır ve token sunucuda asılı
      kalırdı (PM koddan doğruladı)
- [x] Yönlendirme `utils/pushNavigation.ts`: MENTION → kanal/DM · DM_MESSAGE → DM ·
      EVENT_CREATED → etkinlikler · FRIEND_* → mevcut ekranlar · çözülemeyen → **yalnız uygulama
      açılır** (kırık navigasyon vaat edilmiyor). Soğuk açılış da yakalanıyor
      (`getLastNotificationResponse`)
- [x] Ön planda banner yok; emülatör/izinsiz/ağ hatası sessizce geçiliyor, uygulamayı bloke etmiyor
- [x] `typecheck` + `lint` temiz; `api/` ve `web/` diffi yok

### Dev bulgusu — `expo-dev-client` eksikti (PM kurdu)
`eas.json`'daki `development` profili `developmentClient: true` diyor ama paket kurulu değildi;
dev build çıksa bile `expo start --dev-client` ile bağlanmazdı. Dev bunu lint'in yan etkisi olarak
fark edip bildirdi (kendi başına bağımlılık eklemedi — doğru davranış). PM onayıyla
`expo-dev-client@~6.0.21` kuruldu. **Sahip build'i bundan önce başlattıysa yeniden alması gerekiyor.**

### Sahip adımları (§5 — bunlar olmadan mobil ayak başlamaz)
- [ ] **Dev build (APK)** — push Expo Go'da Android'de çalışmaz
- [ ] **FCM kimlik bilgisi** Expo hesabına tanımlı (Firebase projesi + anahtar)

### R2 — sahip cihaz turu (dev build, fiziksel telefon) — 2026-08-03
**Çalışan:** bildirim düşüyor (ikon rozeti + üst çekmece) · susturma **DM, ortam ve kanalda**
sorunsuz · DM ve bahsetme bildirimleri geliyor.

**Üç kusur çıktı, üçü de düzeltildi:**
- [x] 🔴 **Bildirime dokununca çöküyordu:** "Attempted to navigate before mounting the Root Layout".
      Soğuk açılışta yönlendirme, kök navigasyon bağlanmadan çalışıyordu. Dev, expo-router'ın
      kaynağını okuyup `router.push`'un tam olarak `navigationRef.isReady()`e baktığını gösterdi ve
      **aynı ref/aynı şarta** bağladı: hazır değilse yanıt bekletiliyor, `'ready'` olayında
      işleniyor. Uygulama açıkken yol anında çalışmaya devam ediyor
- [x] 🔴 **DM'de etiketlenince İKİ bildirim:** aynı mesaj hem bahsetme hem DM yolundan push
      üretiyordu. `sendDmPush` artık doğrudan bahsedilenleri alıcı kümesinden çıkarıyor.
      Çan davranışı değişmedi
- [x] 🔴 **DM push gövdesi ham token gösteriyordu** (`<@cmq93ul...>`). Sözleşme açığı: §2.6 "gövde =
      önizleme" derken token çözümünü şart koşmamıştı. Çözüm `notifyMentions`'la **ortak yardımcıya**
      (`resolveMentionPreview`) çıkarıldı — kopya yazılsaydı aynı mesaj için iki farklı metin çıkardı
- [x] 978 test yeşil (3 yeni); mobil `typecheck` + `lint` temiz

### R3 — sahip cihaz turu, ikinci geçiş — 2026-08-03
- [x] 🟢 **T&S: hesap devri temiz.** Aynı telefonda ikinci hesaba geçilince önceki kullanıcının
      bildirimi cihaza **düşmüyor** (token upsert'ü `userId`'yi taşıyor). En kritik madde geçti
- [x] 🟢 Çıkış/tekrar giriş sonrası bildirim yine geliyor; **dokununca çökme kusuru gitmiş**
- [x] 🔴 **Ama dokununca DM yerine GİRİŞ EKRANINA atıyordu.** Sebep: navigasyonun hazır olmasını
      bekliyorduk, **oturumun** hazır olmasını beklemiyorduk. Soğuk açılışta `'ready'` olayı,
      `bootstrap()` (refresh + me) bitmeden ateşleniyor; o anda `(app)/_layout.tsx:54` guard'ı
      `status !== 'authenticated'` görüp `/login`'e yönlendirip bizim push yönlendirmemizi eziyordu.
      Düzeltme: flush artık **iki şart** istiyor (navigasyon hazır **VE** `status !== 'booting'`).
      `unauthenticated`'a düşerse bekleyen hedef **düşürülüyor** — kullanıcı beş dakika sonra elle
      giriş yapınca beklenmedik biçimde eski bir sohbete atlamasın

### R4 — push'tan açılan ekran bağlamsız geliyordu — 2026-08-03
Sahip turu: bildirime dokununca doğru ekrana gidiliyor ve mesajlar yükleniyor, **ama** DM başlığı ve
avatarı boş, kanal başlığı boş, kanal mesajlarında rol etiketleri `@rol` diye çiziliyor (kişi
bahsetmeleri düzgün). Üçünün kökü aynı: bu ekranlara normalde **listeden** giriliyor ve başlık,
avatar, `guildId` yol parametresi olarak taşınıyor; bildirimden gelince o bağlam yok.
- [x] DM ekranı başlık/avatar/`otherUserId`'yi **store'dan** türetiyor, parametre yalnız yedek.
      Reaktif: soğuk açılışta DM listesi dolunca başlık kendiliğinden yerine geliyor
- [x] Kanal adı `channelsApi.listByGuild(guildId)` ile çözülüyor — **yeni uç yok**, `channel-details`
      ekranı aynı sorunu zaten böyle çözüyordu
- [x] `pushNavigation` kanal hedefine `guildId` taşıyor (sunucu zaten gönderiyordu, istemci
      taşımıyordu) → `rolesApi.listByGuild` çalışıyor → rol adları ve `@everyone` düzgün çiziliyor
- [x] **Aynı kusur `notifications.tsx`'te de vardı** (bildirimler sekmesinden kanala giderken
      `guildId` geçilmiyordu) → orada da düzeltildi, kusur iki yerde durmasın
- [x] 🔴 **Dev'in fazladan yakaladığı:** `isDm` `params.kind !== 'group'` ile hesaplanıyordu; `kind`
      gelmeyince (push yolu) **her zaman 1-1'e** düşüyordu → push'tan açılan **grup DM'i 1-1 sanılıyordu**
      (profil kartı davranışı, yanlış yer tutucu metin, arama görünürlüğü). Artık store'daki tip önce
- [x] `typecheck` + `lint` temiz; `api/` ve `web/` diffi yok

### Turda HENÜZ yapılmayanlar (sahipte)
- [ ] R4 sonrası: push'tan açılan DM'de ad+avatar, kanalda başlık, rol etiketleri adlarıyla geliyor mu
- [ ] Push'tan açılan **grup DM** 1-1 sanılmıyor mu (dev'in yakaladığı kusur)
- [ ] Arka planda uzun kalıp dönünce reconnect (dev build devri; beyaz gezinme şeridi ✅ kalkmış)

### DoD (cihazda — sahipte) ✅ KAPANDI 2026-08-03
- [x] Uygulama kapalıyken bahsedilince bildirim geliyor, dokununca doğru kanala gidiyor
- [x] **DM mesajı gelince bildirim geliyor**, dokununca o sohbete gidiyor
- [x] Susturulmuş ortam/kanaldan bildirim gelmiyor (DM, ortam, kanal üçünde de doğrulandı)
- [x] Etkinlik bildirimi geliyor ve etkinlikler ekranına götürüyor
- [x] Çıkışta bildirim kesiliyor; **aynı cihazda başka hesap açınca öncekinin bildirimi gelmiyor**
      (T&S'de en kritik madde — token devri çalışıyor)
- [x] Dev build: gezinme çubuğu beyaz şeridi **kalkmış**; push'tan açılan ekranlar bağlamıyla geliyor

> **M3 KAPANDI.** Dört revizyon turu sürdü (R1 DM kapsamı · R2 navigasyon + çift bildirim + ham
> token · R3 oturum beklemesi · R4 ekran bağlamı). Hepsi sahibin **fiziksel cihaz** turlarından
> çıktı; hiçbiri birim testiyle yakalanabilecek türden değildi. **Ders:** push gibi süreç-dışı
> yüzeylerde emülatör ve yeşil test yetmiyor, gerçek derleme + gerçek telefon şart.


---

## Küçük Revizeler — 2026-08-03 akşamı (sahip web turu)

### 🔴 Bastırma kutucukları DM ve kanal menüsünde de çıkıyordu — Vue boolean-cast tuzağı
Sahip grup DM'e sağ tıklayıp "Bildirim Ayarları"nı açtı: **@everyone Bastır · Yeni Etkinlikleri
Sustur · Rol Bahsetmelerini Sustur** üçü de orada. Grup DM'de @everyone diye bir şey yok, etkinlik
ve rol de yok.

**Kök neden (PM'in R14'te kurduğu mekanizma yanlıştı):** `NotifLevelFlyout` bölümü
`props.suppressEveryone !== undefined || ...` ile gösteriyordu, yani "prop verildi mi" tahminine
dayanıyordu. Vue 3'te **boolean prop dönüşümü** var: type-only `defineProps` ile `x?: boolean`
tanımlanınca prop hiç geçilmese bile değer `undefined` DEĞİL **`false`** oluyor → koşul her zaman
doğru → bölüm her menüde çıkıyordu.

🔴 **PM'in sahibe verdiği "kanal menüsünde çıkmaz" güvencesi de bu yüzden YANLIŞTI.**

- [x] Görünürlük artık **açık bayrağa** bağlı (`showSuppressions`), varsayılan gizli; tahmin yok
- [x] Dört yüzey tek tek: ServerRail ortam menüsü **gösterir** · ChannelPanel ortam dropdown'ı
      **gösterir** · ChannelPanel **kanal** menüsü göstermez · DmList (1-1 + grup) göstermez
- [x] `vue-tsc -b` 6 (bilinen), `vite build` geçiyor

### Grup DM aksiyonları sağ-tık menüsüne taşındı (sahip isteği)
- [x] "Üye Ekle" ve "Gruptan Ayrıl" `GroupManagePanel`'in dibinden **DM satırı menüsüne** taşındı;
      yalnız GROUP_DM satırında görünüyor, 1-1 DM'de yok
- [x] Mevcut akışlar tekrar kullanıldı (`dmStore.addGroupMember` / `leaveGroup`, üye-ekle modal
      görünümü, `ConfirmDialog` ile ayrılma onayı) — **tek tıkla gruptan çıkma yok**
- [x] Panelde artık tetiklenmeyen `left` emit zinciri temizlendi (ölü kod bırakılmadı)

### 🟢 Etkinlik ⋯ menüsü — kusur DEĞİLMİŞ
Sahip "yetkisiz hesapta etkinlik silme düğmesini görüyorum" dedi. Kod ve DB incelendi: web'de menü
zaten `v-if="canManage"` ile gizli (Haziran'dan beri) ve `canManage` sunucudaki kuralı birebir
aynalıyor (`MANAGE_EVENTS`; yaratıcıya özel ayrıcalık **yok**). Sebep hesabın kendisiydi:
test hesabı `Test hoo` ortamında `Test` rolüne sahip ve o rolde **ADMINISTRATOR** bayrağı var →
tam yetki → menüyü görmesi **doğru**. Yetkisiz davranışı görmek için `Hoop` ya da `test 2`
ortamında denenmeli (orada düz üye).

---

## Sprint M3b — DM Detay Ekranı + Profil Alt-Paneli — 2026-08-04

> Sözleşme: `contracts/SPRINT_M3B_MOBILE_PROFILE_REVISIONS_CONTRACT.md` = **tek doğruluk kaynağı**.
> Sahip görselleri sabah gönderdi, sözleşme revize edildi, **kod iki dev oturumuna delege edildi**
> (api + mobile paralel). PM sözleşme + inceleme, kod dev'de ([[pm-dev-cift-yonlu-denetim]]).

### Backend (`api/`) — sözleşme §5
- [x] §5.1 `has=` süzgeci kanal kapsamlı arama ucuna eklendi; `link|image|file` değerleri ortam
      ucuyla aynı, `has` doluyken `q` opsiyonel, `has` yokken bugünkü davranış birebir
- [x] §5.1 süzgeç mantığı **ortak private helper'a çıkarıldı** (`buildSearchContentFilter`),
      kopyalanmadı — kopya olsaydı aynı ek DM'de "dosya" ortamda "medya" sayılabilirdi
- [x] §5.1 G4 `clearedAt` filtresi korundu, cursor `lt` ile tek `createdAt` objesinde (B1/D5 dersi)
- [x] §5.1 `take: 30` → `50` (ortam ucuyla eşitleme; iki istemcide de sayfalama ve `length===30`
      sezgiseli olmadığı PM tarafından doğrulandı → D5 sınıfı sessiz kırılma yok)
- [x] §5.2 `getUserCard` erişimine **1-1 DM üyeliği** eklendi + fail-closed kısıt (yalnız-DM
      erişiminde `mutualFriends`/`mutualGuilds` boş) — **R7, sahip onayı bekliyor**
- [x] §5.2 **PENDING istek erişim saymıyor** (PM revizyonu, aşağı bkz.) + GROUP_DM kapısına
      `deletedAt: null` (silinmiş grubun üyeleri süresiz kart açıyordu)
- [x] `nest build` temiz · **1000 test yeşil** (10 yeni) · `migrate status` temiz, şema değişmedi

### Mobil (`mobile/`) — sözleşme §1-§4
- [x] §1 kankalar listesi aksiyonları ikon-only (44×44, `accessibilityLabel` zorunlu)
- [x] §4 DM panelinde "Kanka Ekle" kapısı web'le eşitlendi (`!selfBlocked && !isFriend && !requestSent`);
      web'in yerel bayrağı yerine store'daki giden istek kaydı kullanıldı (mobilde ekran değişiyor)
- [x] §3 `ProfileCardModal` → `ProfileSheet` alt-paneli; afiş + Hakkımda + üyelik tarihi + roller +
      ortak ortam/kanka. Aksiyonlar korundu, mutasyonlar `useFriendsStore` üzerinden (M1d-0 dersi).
      `me/ProfileHeader` yeniden kullanıldı (fork edilseydi iki cihaz kusuru düzeltmesi geri gelirdi)
- [x] §3.1 **mesaj yazarına dokunma → profil** (zorunlu madde; ortamda profile ulaşmanın tek yolu)
- [x] §2 `dm-details.tsx` yeni ekran; sekmeler M2c bileşenlerinden, `ChannelMembersTab` **yeniden
      kullanılmadı** (rol bölümlemesi grup DM'de karşılıksız) → `GroupMembersTab`
- [x] §2.3.1 `group/[id].tsx` **silindi**, üye listesi sekmeye katlandı; 👑 rozeti, ✕ üye çıkarma
      (yalnız sahip + onay), kendi satırın dokunulmaz — hepsi taşındı. Ölü rota kalmadı (tek gerçek
      yönlendirme `dm/[id].tsx:136` idi, kalanlar yorum)
- [x] §5.1 istemci ayağı: `useChannelSearchTab` kanal ucuna geçti, `guildId` prop'u üç sekmeden düştü,
      `flatMap` katmanı kalktı; `NOT_CHANNEL_MEMBER` → boş liste (tek yerde), **`AGE_RESTRICTED` hata
      olarak KALDI** (yaş kapısı sessizce gizlenmez — dev'in doğru ayrımı)
- [x] i18n'e tek yeni anahtar (`mobile.dmDetails.menuRow`); kalanı mevcut anahtarlarla karşılandı
- [x] `typecheck` + `lint` temiz; `api/` diffi yok

### R1 — PM incelemesi: sözleşmenin ÜÇ hatası dev'ler tarafından yakalandı
- [x] 🔴 **PENDING isteği profil keşif yoluna dönüşüyordu** (backend dev). Sözleşme gerekçeyi
      "isteği **kabul etmiş**" üzerinden kurup kuralı "açık DM kanalı var" diye yazmıştı; kanal
      istek **gönderildiği anda** oluşuyor (`dm.service:212`) → yabancı tek taraflı istek atarak
      karşı tarafın kartını açabilirdi. Düzeltme: başlatan taraf kabul edilene kadar erişim
      kazanmaz, alıcı kazanır. PM doğrulaması: `PENDING` satırda `dmRequesterId` her zaman dolu
      (tek nesnede birlikte yazılıyor, başka yerde set edilmiyor); üç kollu `OR` nullable alanda
      `NOT` üç-değerli mantık tuzağından kaçınıyor
- [x] 🔴 **1-1 DM'de engellemeye ulaşılamıyordu** (mobil dev). §3.1 profilin tek yolunu "mesaj
      yazarı" yaptı; karşı taraf hiç yazmadıysa **veya sohbet temizlendiyse** (G4) yazar satırı yok,
      kanka değilse listede yok, `DmMenuSheet`'te engelleme yok → §3.3'e "engelleme kaybolmayacak"
      yazıp §2.1 ile delmişim, M1d-0 sınıfı. Düzeltme: 1-1 detay başlığındaki avatar/ad → profil paneli
- [x] 🔴 **Sahibin 2026-08-01 kararı çiğnenmişti** (mobil dev). "1-1 DM'de mesaj arama KALDIRILDI,
      web + mobil" (bu dosya satır 1428) — sözleşme Ara'yı ayrım yapmadan başlığa koymuştu.
      Düzeltme: Ara yalnız grup DM'de; sohbet ekranındaki `searchable={!isDm}` dokunulmadı
- [x] ⚠️ Kayıt düzeltmesi: §3.3'teki "Mesaj" **korunan aksiyon değil YENİ aksiyon** — eski kartta
      hiç yoktu, `canMessage` mobilde tiplenmemişti bile. Kalıyor, ama etiket yanlıştı

### Ertelenenler (PM kararı, sprint ortasında sessizce daraltılmadı)
- D33 `getUserCard` fail-closed kısıtı GROUP_DM'i kapsamıyor (grup üyeleri birbirine yabancı olabilir)
- D34 grup silme/ayrılma sonrası geri tuşu ölü sohbete düşüyor (yeni değil, eski ekranda da vardı)

### DoD (cihazda — SAHİPTE, henüz yapılmadı)
- [ ] Kankalar listesinde aksiyonlar ikon-only, dokunma hedefi rahat
- [ ] DM başlığına dokununca detay ekranı açılıyor (profil kartı değil)
- [ ] Grup DM başlığına dokununca **üye listesine ATMIYOR**, sekmeli ekran açılıyor
- [ ] DM detayında Medya / Sabitlemeler / Bağlantılar / Dosyalar **gerçekten doluyor**
- [ ] 🔴 **Karşı tarafın hiç yazmadığı bir 1-1 DM'de engelleyebiliyorsun** (başlıktaki avatara dokun
      → profil → Engelle); **sohbeti temizledikten sonra da** aynı yol çalışıyor. T&S kilidi
- [ ] 1-1 DM detayında Ara YOK (yalnız Sustur, ortalanmış), grup DM detayında Ara + Sustur var
- [ ] Grup DM Üyeler sekmesinde 👑 · **sahip üye çıkarabiliyor (✕ + onay)** · kendi satırın dokunulmaz
- [ ] Grup DM ⋯ menüsünde Üye Ekle · Yeniden Adlandır · Gruptan Ayrıl · Grubu Sil; onaylar duruyor
- [ ] 1-1 DM ⋯ menüsünde Sohbeti Temizle çalışıyor
- [ ] Mesaj yazarına dokununca profil alt-paneli açılıyor (kanal ve DM)
- [ ] Panelde afiş, Hakkımda, üyelik tarihi, ortak ortam/kanka geliyor; boş olanlar çizilmiyor
- [ ] Zaten kanka olduğun kişinin DM panelinde "Kanka Ekle" yok
- [ ] Ortam üye listesi hâlâ yönetim ekranına gidiyor (değişmedi)
- [ ] Sesli/Görüntülü Arama düğmesi hiçbir yerde yok (M4)
- [ ] Özel kanalın (üye değilken) detayında sekmeler **boş**, kırmızı hata değil
- [ ] Alt panel üstünde `ConfirmDialog` çift perde kararması yapmıyor
- [ ] Üç tuşlu gezinmede panel son satırı tuşların arkasında kalmıyor

### R7 — sahip onayı BEKLİYOR
- [ ] §5.2 `getUserCard` erişim genişletmesi satır satır inceleme. **Onay gelene kadar commit YOK.**

### R2 — sahip cihaz turu (görsel) + header düzeltmesi — 2026-08-04

**Sahip onayladı:** profil paneli ✅ · 1-1 DM detay ✅ · grup DM detay ✅ (görsel).

**Header sorunu — sahibin teşhisi PM'inkinden iyiydi.** PM "aynı sorun her ekranda, global düzeltelim"
demişti. Sahip ekran ekran bakıp gösterdi ki sorun şeridin **rengi değil boş olması**: Ortam
Ayarları'nda içi dolu (ok + başlık) → kasıtlı duruyor; DM sohbet ekranında altındaki mesaj
listesinden ayrışması **işe yarıyor**. Yalnız içi boşken kötü duruyor. → global `screenOptions`'a
dokunulmadı, diğer ~40 ekran olduğu gibi kaldı.

Sahibin ikinci tespiti: kanal başlığı M2c'de **bu boş şeridi doldurmak için** header'a alınmıştı,
yani semptom tedavi edilmişti. Header kalkınca başlık kendi yerine dönebilir (Discord mantığı).

- [x] `dm-details` + `channel-details` → `headerShown: false` (geri oku dahil; Android'de sistem
      geri tuşu jest ve üç tuşlu gezinmede evrensel, Discord da buna güveniyor)
- [x] ⋯ sabit üst bloğun sağ üstüne taşındı — blok kayan sekme gövdesinin **kardeşi** olduğu için
      içerik kayarken çakışmıyor; başlığa ⋯ genişliğinde iki yana dolgu (uzun ad altına girmiyor)
- [x] Üst güvenli alan **gerçek inset** (`useSafeAreaInsets`), sabit dolgu yazılmadı ([[cihaz-farkliliklari-hesaba-kat]])
- [x] Kanal başlığı (`#ad`) header'dan içeriğe döndü; iki detay ekranı aynı başlık ölçüsünü kullanıyor
- [x] Ekran okuyucu: iki başlık da `accessibilityRole="header"` (native başlık gidince ekran isimsiz
      kalmasın); ⋯ etiketli; grup DM'de dokunulamaz kimlik bloğuna rol/etiket **verilmiyor**
- [x] Grup DM detayında avatar kaldırıldı (başlık-only, kanal gibi); **1-1'de avatar KALDI** —
      R1'in T&S deliğini kapatan dokunma hedefi o
- [x] `typecheck` + `lint` temiz

**Dev'in işaretlediği, sahibin cihazda bakması gerekenler:**
- Sohbet ekranı → detay ekranı geçişinde şerit "atlıyor" (birinde header var, diğerinde yok);
  native-stack'te görünür sıçrama yapabilir. Kabul edilemezse çözüm `animation: 'fade'`,
  **önce görülmeli** — dev şimdiden değiştirmedi
- Grup DM'de ekranın adı yalnız üye adlarından üretilen başlıktan okunuyor (native başlık gidince
  geri yığınındaki bağlam kayboldu); 1-1 ve kanalda yeterli, grupta daha zayıf

### M3b — sahipte kalan
- [x] ⚠️ **PM kayıt düzeltmesi (sahip itirazı, akşam):** bu madde "T&S kilidi" diye yazılmıştı,
      çerçeve **yanlıştı**. (1) Engelleme, karşı taraf ısrarla yazdığında ihtiyaç olur; o anda
      ekranda mesaj vardır → yazar dokunuşu zaten çalışır. İki taraf sessizce ayrıldıysa kimse engel
      atmaz. (2) "Sohbeti temizledikten sonra" senaryosu **zaten imkânsız** — G4 gereği temizlenen
      ve sonrasında mesaj gelmeyen DM listeden tamamen düşüyor, o ekrana gidilemiyor.
      Avatar dokunuşu **kalıyor** ama gerekçesi profil erişimi, engelleme değil
- [ ] Durum çubuğu çakışması (çentikli cihaz), ⋯ konumu, uzun grup adı kesiliyor mu
- [ ] Üç ekranda sistem geri tuşu (jest + üç tuşlu) çalışıyor mu
- [ ] Diğer ekranların header'ı bozulmadı mı (Ortam Ayarları, sohbet ekranları)
- [ ] **R7:** §5.2 `getUserCard` onayı → **onay gelene kadar kod commit'i YOK**

### R3 — profil paneli Discord yerleşimine hizalandı — 2026-08-04

> Sahip cihazda gördü: panel her şeyi **sığdırmaya** çalışıyor (ortak ortamlar listesi kesiliyor),
> altta üç tam genişlikte düğme var, panel **kaymıyor**. Discord'unki kayıyor ve aksiyonlar üstte,
> kimlik kartının içinde ikon + küçük etiket olarak duruyor.

- [x] Panel `maxHeight: '90%'` + `ScrollView` `flexShrink: 1` → kısa profilde içerik kadar, uzunda
      kaydırıyor. **Hiçbir listeye yükseklik sınırı / `slice` yok** (kesilen bölüm kalmadı)
- [x] Alt güvenli alan `sheetBottomPadding` ile, **`ScrollView`in dışında** → son bölüm üç tuşlu
      gezinmede tuşların arkasına girmiyor
- [x] Yeni `ProfileActionStrip` (ikon üstte, etiket altta): Mesaj + Kanka Ekle. `flexDirection: row`
      + her öğe `flex: 1` + `gap` → **sabit sütun sayısı yok**; M4'te Sesli/Görüntülü diziye iki
      eleman eklenerek girer, bileşen değişmez. 360dp'de 4 öğe ≈ 76dp, dokunma hedefi 44dp üstünde
- [x] Yeni `ProfileMoreSheet` (⋯): Kankalıktan Çıkar · Engelle · Engeli Kaldır. Alttaki üç tam
      genişlikte kutu kalktı
- [x] **Katman makinesi:** tek `layer` state (`profile|more|confirmBlock|confirmRemove`) → aynı anda
      **yalnız bir modal** görünür, üst üste binen perde yok (`DmMenuHost` deseni). Vazgeç → profile
      döner (⋯'ye değil); hata → profile döner + mesaj (`ConfirmDialog`ın hata yüzeyi yok, orada
      bırakılsa kullanıcı sebebi hiç göremezdi)
- [x] **T&S kemeri:** `canRemoveFriend`/`canBlock`/`canUnblock` **ayrı ayrı** hesaplanıp
      `showMore` OR'landı (R7'de satır satır denetlenebilsin diye tek boolean'a sıkıştırılmadı);
      ⋯ `ScrollView`in kardeşi → kaydırınca kaybolmuyor; kendi profilinde üçü de false → ⋯ yok
- [x] **i18n'e yeni anahtar YOK** (mevcut `settings.bioLabel`/`userCard.moreActions`/`friends.*`)
- [x] `typecheck` + `lint` temiz; header ekranlarına ve `api/`ye dokunulmadı

**Dev'in bilinçli sapması (PM onayladı):** sözleşmenin iki maddesi çelişiyordu — §3.2.1 "⋯ afişin
sağ üstünde" (afiş kayan içerikte) ve §3.3 "kaydırma ardına saklama yok". Dev ⋯'yi `ScrollView`
dışına alıp T&S kemerini görsel birebirliğe tercih etti: durağan hâlde afişin sağ üstünde, kaydırınca
içeriğin üstünde **sabit kalıyor** (Discord'da banner'la kayar). **Sahip cihazda karar verecek**,
"kaysın" derse tek satır.

🔴 **Dev'in yakaladığı canlı-öncesi bağımlılık:** kart **404** dönerse ⋯ hiç gelmiyor → o kullanıcıyı
panelden engelleyemezsin. Sabah kapattığımız T&S deliği **ancak §5.2 canlıya çıkınca** tam kapanıyor.
§5.2 R7 onayı beklediği için commit edilmedi → **ikisi birlikte çıkmalı.**

⚠️ **Eşik uyarısı (dev):** `ProfileHeader` artık iki bayrak prop taşıyor (`surfaceColor`,
`showDetails`). **Üçüncüsü gelirse** bu "prop genişletme" değil gizli fork olur ve bileşen bölünmeli.
`ProfileSheet` 355 satır — bilinçli bölünmedi (T&S kemeri + katman makinesi + mutasyonlar R7'de
birbirine bakarak okunmalı); şerit ve ⋯ menüsü zaten ayrı dosyalara çıkarıldı.

### R4 — ⋯ düğmesi sadeleşti — 2026-08-04

> Sahip: "güzel olmuş" (panel yerleşimi, kaydırma, ikon şeridi, bölümler onaylandı). İki görsel not.

- [x] ⋯ üstten/sağdan boşluk `16` → `24` (`MORE_INSET`); ikonun görünen kenar boşluğu 35dp
      (44dp kutu içinde 22dp ikon → her yanda 11dp görünmez pay)
- [x] Arka plan dairesi + `borderRadius` **kaldırıldı**, üç nokta düz duruyor (sahip isteği)
- [x] 🔴 **Okunabilirlik telafisi (PM şartı):** daire aynı zamanda **açık renkli afişte** ⋯'nin
      okunmasını sağlıyordu (afiş kullanıcı görseli, beyaza yakın olabilir). Arka plan bloğu geri
      getirilmeden `textShadow` ile çözüldü (`Ionicons` altta `Text` çizdiği için geçerli); koyu
      afişte ve panel zemininde gölge görünmüyor, kirlilik eklemiyor
- [x] Dokunma hedefi **44×44 korundu** (daire gitti diye küçültülmedi); `accessibilityRole`/label
      yerinde; ⋯ hâlâ `ScrollView` kardeşi (T&S kemeri duruyor)
- [x] `typecheck` + `lint` temiz; tek dosya değişti, panelin geri kalanına dokunulmadı

**Cihazda bakılacak:** açık renkli afişli bir profilde üç nokta kayboluyor mu (gölge yetiyor mu).

---

### R5 — ⋯ ayrı panel değil menü — 2026-08-04

> Sahip: "3 nokta butonuna basınca kırmızı butonlar **ayrı panel** olarak açılıyor, menü olarak
> açılsa daha iyi olur." R3'te ayrı `Modal` olduğu için profil paneli kaybolup yerine yeni bir alt
> panel geliyordu.

- [x] `ProfileMoreSheet` **silindi** → `ProfileMoreMenu` (ad artık yalan söylemiyor: alt panel değil).
      İçindeki `Modal` tamamen kalktı — import bile edilmiyor, yalnız yorumda anılıyor
- [x] Menü profil panelinin **içinde**, ⋯'nin tam altına ankrajlı (`top: MORE_INSET + MORE_HIT`,
      `right: MORE_INSET`); panel arkada **görünür kalıyor**
- [x] 🔴 **Ölçüler tek yerde:** `MORE_HIT`/`MORE_INSET` menü dosyasından export, `ProfileSheet`
      import ediyor — ayrı yazılsaydı ilk değişiklikte menü düğmenin altında değil ortasında açardı
- [x] 🔴 **Android geri tuşu** tek yerde dallandı (`dismissTopLayer`): menü açıkken geri **yalnız
      menüyü** kapatıyor, bir daha geri paneli kapatıyor. Aynı fonksiyon karartı dokunuşuna da
      bağlandı — yoksa "dışarı dokunuş menüyü kapatır" kuralı yakalayıcıda geçerli, karartıda
      geçersiz olurdu
- [x] Onay akışı korundu: Engelle → **önce menü kapanır** → onay; Vazgeç → profile döner (menüye
      değil); hata → profile döner + mesaj. Üç katman üst üste binmiyor
- [x] R3'teki "profil panelini gizle ki iki perde binmesin" numarasına **gerek kalmadı** —
      `Modal.visible` artık yalnız onay diyaloğunda kapanıyor
- [x] T&S kemeri ve R4 görünümü aynen korundu; `typecheck` + `lint` temiz

---

### R6 — Mesaj isteğinde "Reddet ve Engelle" (sahip onaylı ek kalem) — 2026-08-04

> Sahip itirazından çıktı: engelleme asıl **yabancı mesaj isteğiyle taciz ettiğinde** gerekiyor.
> Mobilde o ekranda yalnız Reddet vardı; web'de "Reddet ve Engelle" var ve backend destekliyor
> (`rejectRequest` ikinci parametresi), mobil hep `false` geçiyordu. Kodda gerekçesi yazılıydı:
> M1 sözleşmesi orada yalnız kabul/ret istemiş.

- [x] Üçüncü aksiyon: **Reddet ve Engelle** (düz metin, `danger`, görsel ağırlığı Reddet'ten düşük;
      `minHeight: 44` — silik olmak küçük olmak değil) + `ConfirmDialog` (kişinin adı geçiyor)
- [x] **Sıfır yeni şey:** uç mobilde zaten vardı, dört i18n anahtarı `tr.json`'da zaten vardı,
      `api/` diffi yok
- [x] `privacyNote` duruyor; ret jenerik (engelleyip engellemediğin karşı tarafa sızmıyor)

**Dev'in sormadığım soruyu araştırırken bulduğu ÜÇ kusur — üçü de M1d-0'ın aynı sınıfı:**
- [x] 🔴 **"Mesaj İstekleri (n)" rozeti bayat kalıyordu.** Ekran `dmApi`'yi **doğrudan** çağırıp
      yalnız kendi yerel listesini süzüyordu; `useDmStore` haberdar olmuyordu. Store'da tam bu iş
      için yazılmış tazeleme fonksiyonu vardı, hiç çağrılmıyordu. → mutasyonlar `useDmStore`
      üzerinden (`rejectRequest`/`acceptRequest` + `fetchAll`)
- [x] 🔴 **Kabul edilen kanal DM listesine girmiyordu** (`PENDING`→`ACCEPTED` sonrası bir sonraki
      `fetchAll`'a kadar `visibleChannels` dışarıda bırakıyordu)
- [x] 🔴 **T&S bayrakları istemcide GÖMÜLÜYDÜ.** Kabul sonrası yönlendirmede `canMessage: 'true'`,
      `selfBlocked: 'false'` düz metin yazılıydı — sunucunun ne dediğine bakılmadan "mesaj kutusu
      açık" varsayılıyordu. `mobile/CLAUDE.md`'nin "kapıyı istemcide kurma, backend'in kararını
      istemcide gevşetme" kuralının ihlali. → `dmRouteParams(channel)` ile sunucu yanıtından taşınıyor
- [x] Dev `accept`'i kapsam sınırı gereği **düzeltmeyip sordu** (doğru davranış); PM onayladı,
      gerekçe: yarım bırakmak iki durumdan da kötü (aynı dosyada iki desen + rozet bir yolda
      güncellenip diğerinde güncellenmiyor)
- [x] Ekranda artık tek desen: **mutasyonlar store'dan, okumalar doğrudan API'den**
- [x] `useFriendsStore` dm store'undan çağrılmadı — `friends.ts` zaten `dm.ts`'i import ediyor,
      ters yön döngü kurardı; gerek de yok (engellenenler listesi kendi ekranının mount'unda çekiliyor)
- [x] `typecheck` + `lint` temiz

---

> **M3b KOD TARAFI KAPANDI.** api 1008 test yeşil + build/migrate temiz · mobile typecheck + lint
> temiz. Altı revizyon turu: R1 (sözleşmenin üç hatası) · R2 (header) · R3 (Discord yerleşimi) ·
> R4 (⋯ cilası) · R5 (menü) · R6 (Reddet ve Engelle + üç bayat-store kusuru).
> **Commit atılmadı — §5.2 R7 onayı bekliyor.**
>
> **Günün dersi:** delegasyon bugün PM'in **beş** hatasını yakaladı (üçü dev'lerden, ikisi sahipten:
> global header yanlış teşhis, "engelleme T&S kilidi" yanlış ürün muhakemesi). Hiçbiri birim
> testiyle çıkmazdı. Ayrıca dev'lere sorulan "store/yan-etki sahibi kim" sorusu, sözleşmede hiç
> olmayan üç kusur ortaya çıkardı. [[pm-dev-cift-yonlu-denetim]] doğrulandı.


---

## Sprint M3c — Mobil Medya: Ek Gönderme + Emoji — 2026-08-04

> Sözleşme: `contracts/SPRINT_M3C_MOBILE_MEDIA_CONTRACT.md`. **Faz sırası sahip kararıyla ters
> çevrildi:** özgün harita "ses → medya" diyordu, medya sesin önüne alındı. Gerekçe: M3b'de DM
> detayına üç medya sekmesi konuldu ve mobil kullanıcı onları dolduramıyordu; ayrıca M4 ağır ve uzun,
> ondan önce uğraştırmayan işlerin bitmesi isteniyor. **Ad M3c, M4 değil** — "M4 = ses" onlarca yerde
> geçiyor, medyayı M4 yapmak sesi M5'e kaydırıp o referansları bozardı.

### Mobil (`mobile/`) — §1-§4
- [x] `+` düğmesi → alttan panel; kısa hâlde **Galeriden Seç** + **Dosyalar** satırları + galeri
      ızgarası (ilk hücre kamera); yukarı sürüklenince tam ekran (Geri / Tüm Albümler)
- [x] Uygulama içi ızgara `expo-media-library` ile **(sahip kararı, PM itirazına rağmen)** — PM sistem
      seçicisini önermişti (sıfır izin/bağımlılık/Play beyanı); sahip Discord birebir hizalamayı seçti
- [x] 🔴 **İzin reddedilirse uygulama kilitlenmiyor:** ızgara çizilmez, üç yol açık kalır
      (Galeriden Seç · Dosyalar · Kamera — üçü de galeri iznine bağlı değil)
- [x] 🔴 **Android 14+ kısmi erişim:** "daha fazla fotoğraf seç" + `AppState` dinleyicisi. Dev'in
      yakaladığı incelik: `presentPermissionsPickerAsync` **ekranı gösterince** çözülüyor, kullanıcı
      seçimini bitirince değil → dinleyici olmasa "yeni fotoğraf paylaştım ama ızgarada yok" olurdu
- [x] Belge gönderme `expo-document-picker` **(sahip onayı)** — sunucu zaten pdf/txt kabul ediyordu,
      web gönderebiliyordu, yalnız mobil gönderemiyordu. `copyToCacheDirectory` şart: Android
      `content://` URI'sini `uploadAsync` okuyamıyor (sessiz "PDF seçtim ama patladı" tuzağı)
- [x] **Dört kaynak tek huniden** (ızgara · foto seçici · belge seçici · kamera): her kaynağın tek işi
      ortak şekle çevirmek, doğrulama yalnız `attachmentDraft`'ta, izin listesi sunucununkinin **aynası**
- [x] 🔴 **Kısmi başarısızlıkta mesaj GÖNDERİLMEZ**, seçim korunur, yüklenmiş olanlar tekrar yüklenmez
- [x] `UPLOADS_ENABLED` istemciye taşınmadı, `presign` 403'ü otorite (web ile aynı)
- [x] Emoji düğmesi → `rn-emoji-keyboard` (**zaten kurulu**, tepkilerde kullanılıyor; yeni paket yok).
      Emoji **imlecin olduğu yere** yazılıyor; `onChangeText` sonra `setSelection` sırası kritik
- [x] Düzenleme modunda `+` gizli (`PATCH` yalnız `content` alıyor, sonradan ek bağlanamıyor)
- [x] `typecheck` + `lint` temiz; `api/` diffi yok

### Web (`web/`) — §5
- [x] Ölü **"Forum"** kanal türü seçeneği kaldırıldı + öksüz kalan `channelTypeSoon` anahtarı
- [x] `vue-tsc -b` 6 bilinen hata (değişmedi), `vite build` temiz

### PM sözleşme hataları (dev'ler yakaladı)
- [x] 🔴 **DoD'a "video gönderiliyor" yazmıştım, İMKÂNSIZDI.** Sunucu izin listesi
      (`ALLOWED_CONTENT_TYPES`) = `png/jpeg/gif/webp/pdf/txt`; **video yok**. PM yazarken sunucuyu
      kontrol etmemişti. Dev durdu, `api/`ye dokunmadı, bildirdi → **doğru davranış** (kendi başına
      eklese R7 yüzeyine habersiz dokunmuş olurdu). Sahip kararı: video şimdi açılmıyor → **D35**.
      **Yan kazanç:** ızgara yalnız fotoğrafa kısılınca `READ_MEDIA_VIDEO` Play beyanı gereksizleşti
- [x] 🔴 **Tek "Dosyalar" satırı yazıp galeri seçicisine bağlamıştım.** Dev bunu **UI yalanı** sayıp
      durdu ve haklıydı (onaylı paket belge vermiyor) → `expo-document-picker` onaylandı, iki ayrı satır
- [x] ⚠️ "Android 13+ kısmi erişim" yazmıştım, doğrusu **14+**; 13'te izin ya hep ya hiç
- [x] `MAX_UPLOAD_MB` istemciye taşınmıyor → `.env.example`'a uyarı yazıldı (düşürülürse istemci
      sınırı sunucudan gevşek kalır, kullanıcı uyarı almadan 400 yer)

### 🔴 PM operasyon hatası — `tr.json` değişiklikleri silindi ve geri alındı
`git add -p` etkileşimini `/dev/null` ile atlamaya çalışıp ardından **`git checkout -- web/src/i18n/tr.json`**
çalıştırdım. Commit edilmemiş oldukları için mobil oturumun eklediği **19 i18n anahtarı** ve web
oturumunun sildiği `channel.*` anahtarları **kayboldu**; git'te iz yok (dangling blob taraması boş).
Kod dosyalarının hiçbiri etkilenmedi. Anahtarlar metinleri yazan oturumdan geri alındı, kodla
**birebir karşılaştırılarak** doğrulandı (19/19, eksik ve fazla yok).
**Ders:** commit edilmemiş çalışma varken, hele iki oturum aynı dosyaya yazarken, `git checkout --`
çalıştırılmaz. Doğru sıra: önce commit, sonra düzenleme. Dev de aynı riski raporunda uyarmıştı.

### DoD (cihazda — SAHİPTE)
- [ ] `+` → panel; ızgarada son fotoğraflar, ilk hücre kamera; sürükleyince tam ekran
- [ ] Görsel gönderiliyor ve karşı tarafta (web dahil) görünüyor · **PDF** gönderiliyor
- [ ] Çoklu seçim tek mesajda gidiyor; 10 sınırı uyarıyor; boyut aşımında Türkçe uyarı
- [ ] 🔴 Galeri izni reddedilince kilitlenmiyor, üç yol da çalışıyor
- [ ] 🔴 Kısmi erişimde (Android 14+) "daha fazla seç"ten dönünce ızgara tazeleniyor
- [ ] Emoji imlecin olduğu yere giriyor; **emoji sonrası harf yazınca imleç geri sıçramıyor**
- [ ] Tepki emoji akışı bozulmadı
- [ ] Ek gönderilen mesaj **DM detayının Medya/Dosyalar sekmesinde** görünüyor (M3b halkası kapanıyor)
- [ ] Web'de kanal oluştururken Forum seçeneği yok

### R1 — mesaj kutusu cilası — 2026-08-04

> Sahip cihaz turu: **ek gönderme ve emoji çalışıyor**, galeri ızgarası sorunsuz, görsel gönderiliyor.
> Tek şikâyet: kutu Discord'unkiyle yan yana **sıkışık** duruyor.

- [x] Gönder **ikon-only** ve yalnız `canSend` iken görünür. 🔴 Koşul **metne değil `canSend`'e**
      bağlı — ek seçip yazı yazmayan kullanıcı da gönderebilmeli (`canSend` ifadesi değişmedi)
- [x] Görünürlük `(canSend || sending)`: saf `canSend` olsaydı basıldığı anda düğme kaybolur, kutu
      genişler, metin yeniden sarılır, gönderim bitince geri sıçrardı — tek dokunuşa iki yerleşim
      oynaması. Yuva gönderim boyunca soluk duruyor
- [x] Emoji ikonu **input'un içinde**; `EMOJI_SLOT` tek sabit hem `paddingRight` hem düğme genişliği
      (iki ayrı sayı olsaydı biri değişip diğeri unutulurdu — `DmDetailsHeader`'daki ⋯ ile aynı sınıf).
      Çok satırda ikon son satır hizasında kalıyor
- [x] **Sol ok mekanizması YAPILMADI (sahip kararı, PM önerisi):** Discord'da o ok üç düğmeyi
      katlıyor, bizde solda tek `+` var ve ok da `+` da ~44dp → yer kazandırmıyor, bir dokunuş
      ekliyor. **Tetikleyici:** M4'te ses kaydı düğmesi gelince solda iki düğme olur, ok anlamlanır
- [x] `typecheck` + `lint` temiz

**Sahibin bakacağı en riskli nokta:** ek seçip **hiç yazmadan** gönderme — panel kapandıktan sonra
kutuda yazı yokken gönder ikonu **görünür** olmalı (regresyon riski en yüksek yer).

### R2 + R3 — eke dokunma + klavye regresyonu — 2026-08-04

**🔴 Klavye regresyonu (PM çözdü, sprint kapsamı dışı ama bloke ediciydi).** Yeni dev build alınınca
**bütün sohbet ekranlarında** mesaj kutusu klavyenin arkasında kaldı. Kod değişmemişti; native kabuk
değişince davranış terse döndü (eski build'de pencere klavye açılınca kendini küçültüyordu, yenisinde
küçültmüyor). `KeyboardAvoidingView` kaldırıldı — kendi hesabı ekran-koordinatı ile pencere-koordinatını
karıştırıyor, Android edge-to-edge ile güvenilir değil.
- [x] Sahip cihazında **ÖLÇÜLDÜ** ve sayılar dosyaya yazıldı: screen 872.7 · window 822.9 ·
      insets.top 33.8 · insets.bottom 16 · klavye 287 · klavye tepesi 570.
      `window = screen − insets.top − insets.bottom` doğrulandı; örtüşme = 822.9 − (570 − 33.8) =
      286.7 ≈ klavye yüksekliği → gereken pay **klavyenin kendi yüksekliği**, sihirli sayı değil özdeşlik
- [x] Blok artık **dört denemenin** kaydını taşıyor. Ortak kök: **cihazın davranışını varsaymak**.
      Dördüncüde ölçüldü ve tek turda oturdu. Sonda için ekrana geçici ölçüm şeridi kondu, sonra silindi

**Eke dokunma (sahip onaylı ek kapsam):**
- [x] Görsele dokun → tam ekran · dosyaya dokun → sistemde açılır (`Linking`, yeni bağımlılık yok)
- [x] 🔴 **Viewer adresi açılırken tazeleniyor.** Presigned URL 300 sn ömürlü; PM'in "tekrar istek atma"
      talimatı viewer'a da uygulanınca 5 dakikadan eski fotoğrafta tam ekran **sessizce siyah** kalıyordu.
      Dev bunu bulup önerdi. **Yan kazanç:** tarama kapısı büyütme anında **ikinci kez** doğrulanıyor
- [x] T&S kapısı **yapısal**: PENDING/FLAGGED ek `Pressable`'a hiç dönüşmüyor (erken dönüşler önce);
      `interactive` varsayılanı false → Medya/Dosyalar sekmelerindeki "mesaja git" bozulmadı
- [x] Taslak şeridi başarılı gönderimde artık parlamıyor; koruma daralmadan tek yere toplandı
- [x] Gönderim sürerken çip silme devre dışı → yarış kaynağında öldü (PM, dev'in merge önerisi yerine:
      kurtarma yolunun sade kalması hata anında çalışması gereken tek şey olduğu için önemli)
- [x] **Erişilebilirlik:** çipin ×'i 38dp, yanıt/düzenleme iptali 40dp bulundu — ikisi de 44 kuralının
      altındaydı ve **ikisi de PM incelemesinden geçmişti**. Düzeltildi → **D37**
- [x] `uploadLabel` görünür bırakıldı (dev'in bilinçli sapması, PM onayladı): parlamanın kaynağı
      `setAttachments`'tı, etiket değil; kaldırılsaydı 8 MB'lık fotoğrafta 3-10 sn sessiz ekran kalırdı

**Yeni borçlar:** D36 (presigned adres tarayıcı geçmişine düşüyor) · D37 (dokunma hedefi ölçülmüyor,
göz kararı denetleniyor) · D35'e ek (video açılınca tam ekran oynatıcı beklentisi doğar)

> **M3c KAPANDI.** Üç revizyon turu + bir bloke edici regresyon. Sahip cihazda doğruladı:
> ek gönderme · galeri ızgarası · emoji · kutu cilası · klavye.

---

## Sprint M4a — Mobil Sesli Arama: 1-1 DM — 2026-08-06

> Sözleşme: `contracts/SPRINT_M4A_MOBILE_VOICE_CONTRACT.md`. Faz sırası PLAN.md'de kesin
> (1-1 DM → grup DM → ortam kanalı → aynı sırayla görüntülü). Bu sprint yalnız **1-1 DM sesli**.
> **`api/` DEĞİŞMEZ** — M4a-3 hariç: **sözleşme 2026-08-07'de revize edildi** (§2 istisna notu + §9
> baştan yazıldı), `api/` kapsamı §9.1'in üç dosyasıyla sınırlı. Dördüncü dosya = sapma.
>
> Sözleşme sahibin 12 Discord ekran görüntüsüyle yazıldı → `design-refs/m4-ses/`.
> 🔴 **Görsel eksiği kayda geçti:** gelen arama ekranının görüntüsü yok; web davranışından
> türetilecek, ilk revizyon turunun oraya gelmesi bekleniyor.
>
> 🔴 **Arama modeli "oda önce" (sahip gözlemi 2026-08-06, sözleşme §0.1).** Discord DM aramasını
> klasik telefon modelinden çıkarmış: telefon düğmesi doğrudan odaya sokuyor, karşı taraf çalıyor,
> cevap gelmezse arayan boş odada bekliyor. Mobil bunu uygular; **web klasik kalıyor → D39**.
> Kazanç: ayrı "Aranıyor…" ekranı, geri-zil, iptal-vs-kapat ayrımı ve arayan-tarafı zaman aşımı
> **hiç yazılmıyor**. Sunucu değişmiyor, iki model birbiriyle çalışıyor.

### İç sıralama (PM kararı — faz sırası bozulmadan)
- [x] **M4a-1** — odaya girme: **başlatma = katılma** (ağır platform işinin tamamı burada) — ✅ CİHAZDA DOĞRULANDI
- [x] **M4a-2** — mobilde **gelen** arama, uygulama açıkken — ✅ CİHAZDA DOĞRULANDI 2026-08-07
      (tek açık kalem **heads-up** → kök nedeni bulundu, düzeltmesi M4a-3'ün zil kanalı işiyle
      birleşti; aşağıdaki "sahip turu #2" bölümü)
- [ ] **M4a-3** — uygulama kapalıyken gelen arama (en riskli parça, bilerek sonda)

### M4a-1 — Mobil (`mobile/`) — sözleşme §1-§7
- [x] Native paketler + **tek dev build** (`expo-audio` M4a-2'de kullanılacak olsa da ŞİMDİ kurulur;
      **D38** `expo-web-browser` de bu derlemeye biner — ikinci derleme alınmayacak)
- [x] LiveKit RN SDK'nın Expo 54 / RN 0.81 / React 19.1 uyumlu sürümü **doğrulandı** (hatırdan değil,
      sürümlü dokümandan); uyumsuzsa DUR ve bildir
- [x] `voice:subscribe` + `GET voice/participants` + katıl/ayrıl akışı; `voice/leave` atlanmıyor
- [x] DM başlığında telefon düğmesi: aramada kimse yoksa **davet + odaya gir** (sıra: davet ÖNCE),
      arama sürüyorsa **davet göndermeden katıl**, bağlıysak arama ekranına dön
- [x] DM ekranında "arama sürüyor → Katıl" şeridi + odada tek başınayken soluk kutucuk + "Çalıyor…"
- [x] Odadan çıkarken karşı taraf henüz katılmadıysa `voice:call_cancel` de gönderiliyor
      (çalan telefon sussun; `api/` değişmeden çözülüyor)
- [x] İki eşik: hiç katılan olmadıysa **3 dk**, katılıp çıktıysa **60 sn** → otomatik bitiş;
      açık reddedilmede (`call_rejected`) odadan çıkılır + nötr mesaj
- [x] Arama ekranı: iki kutucuk, konuşan yeşil kenarlık, mikrofon rozeti, süre sayacı, 5 sn'de
      kontrollerin gizlenmesi; **kamera/ekran/roket düğmesi YOK**
- [x] Mikrofon izni reddinde uygulama kilitlenmiyor: açıklama + "Ayarları aç"
- [x] Ses çıkışı seçici (telefon/hoparlör/bluetooth/kablolu); varsayılan hoparlör
- [x] 🔴 Foreground service (mikrofon türü) + kalıcı bildirim (Bağlantıyı Kes · Sustur)
- [x] 🔴 GSM araması kesintisinde mikrofon susuyor, bitince dönüyor
- [x] Mini pencere (uygulama içi katman, sistem overlay değil; sürükleme YOK)
- [x] Beklenmedik kopmada (ağ/sunucu/R11B disconnect) ekran kapanıyor, hayalet katılımcı kalmıyor
- [x] Tek kişi kalınca 60 sn sonra otomatik bitiyor
- [x] `typecheck` + `lint` temiz; `api/` ve `web/` diffi sıfır

### M4a-2 — sözleşme §8 (SIRADAKİ)
> 🔴 **Sunum tam ekran DEĞİL, bildirim** (sahip görselleri 2026-08-06 → `design-refs/m4-ses/13`, `14`).
> Discord hem kilit ekranında hem uygulama açıkken aynı bildirimi gösteriyor: "Gelen Arama /
> <ad> seni arıyor!" + **Reddet** · **Aramaya Katıl**. Sözleşmenin ilk hâli tam ekran ekran diyordu,
> düzeltildi. Kazanç üç katlı: ayrı ekranın sökülme kusurları hiç doğmuyor (M4a-1'deki beyaz ekranın
> kaynağı buydu), M4a-3 aynı arayüzü kullanacak, **`USE_FULL_SCREEN_INTENT` riski konusuz kaldı**.

- [x] Yüksek önemli **ayrı** bildirim kanalı (M4a-1'in "arama sürüyor" kanalı düşük önemli, karışmaz);
      uygulama önplandayken de üstte görünüyor
- [x] Eylemler: Reddet → `call_reject` · Aramaya Katıl → `call_accept` + katılma akışı + arama ekranı
- [x] Gövdeye dokunma → o DM'e götürür (arama ekranı yalnız kabulde açılır)
- [x] 30 sn cevapsız → bildirim kalkar *(oda arayan tarafta 3 dk yaşar — iki süre bilerek farklı)*
- [x] `voice.call_canceled` → bildirim kendiliğinden kaybolur; kabul/reddet sonrası da asılı kalmaz
- [~] Zil **`expo-audio` ile döngüde** çalınır, kanal sesi ile değil (kanal sesi tek atış) — YAPILDI.
      **Titreşim var — YAPILDI** (`Vibration.vibrate`, ringer modundan bağımsız çalışan RN çekirdek
      API'si). 🔴 **"Cihaz sessizdeyken zil çalmıyor" YAPILAMADI** — kurulu paketlerde (`expo-audio`,
      `expo-notifications`) Android ringer modunu (sessiz/titreşim/normal) sorgulayan bir API yok;
      bunu doğru çözmenin bilinen yolu native koda inmek, bu sprintte yeni native modül YASAK. Zil şu an
      cihaz sessizde de KOŞULSUZ çalıyor. Sahibe/PM'e raporlandı, karar bekliyor (native modül mü,
      kabul edilebilir borç mu). Geri-zil üretilmedi (kapsam dışı, doğru).

### Sahip turu #2 (2026-08-07) — M4a-2 geçti, heads-up kök nedeni bulundu

Kabul/reddet, gövdeye dokunma, arayan iptali ve nötr mesaj **çalışıyor**. Açık kalan tek kalem
bildirimin ekranın üstünde belirmemesiydi (yalnız durum çubuğu ikonu). DND hipotezi elendi: kapalıyken
de olmuyordu.

🟢 **Kök neden kesinleşti — tahminle değil, kontrollü karşılaştırmayla.** Sahibin ekran görüntüsünde
aynı telefonda, aynı arama sırasında **iki bildirim yan yana** düştü:
- bizim `incoming_call_v2` kanalımız (sessiz, `vibrationPattern: [0, 1]`) → **heads-up YOK**
- `api/` push'ı, `incoming_call_v3` cihazda kurulu olmadığı için varsayılan kanala düşmüş → **heads-up VAR**

Fark eden tek değişken kanalın sesi. **M4a-2'nin 1 ms titreşim numarası Android'i ikna etmiyor**
(f542190'ın denediği çözüm), kanalın gerçek bir sesi olmak zorunda. Düzeltme M4a-3 §9.2.1'in zaten
gerektirdiği şey → **üç sorun tek hamlede kapanıyor**: bu heads-up kusuru + [[D40]] (sessiz kipte zil
çalıyor) + uygulama kapalıyken çalma.

⚠️ **"Arka planda çalışıyordu" gözlemi yanıltıcıydı** — arka planda soket kapalı, JS bildirimi hiç
üretilmiyor; orada görülen heads-up **push'ın kendisiydi**. İki yolu ayırt etmeden "çalışıyor" demek
bu turda yanlış sonuca götürecekti.

**İki yan bulgu (ikisi de sözleşmeye alındı):**
- **Ön planda çift bildirim** — biri butonlu (JS/WS), biri butonsuz (push). `api/` ayağı mobilden
  önce gittiği için **bugün canlı bir kusur**; §9.2.5 kapatıyor. Fazlar arası sıra bedeli, beklenen
  ara durum
- **Ayarlarda iki "Gelen arama" kanalı birikmiş** (v1 + v2, aynı adla) — kullanıcı hangisinin gerçek
  olduğunu ayırt edemiyor, yanlış olanı kapatabilir → §9.2.1b: yeni kanal kurulurken eskiler silinir

**Açık ürün sorusu (sahibe soruldu, yanıt bekliyor):** Discord'un gelen arama bildiriminde sağda
arayanın avatarı var, bizde yok. Küçük bir parite kalemi; mobil ayağına eklenir ya da kapsam dışı kalır.

### M4a-3 — sözleşme §9 (M4a-2 sahip onayından SONRA) — 🔵 MOBİL AYAĞI DELEGE EDİLDİ 2026-08-07
> ✅ **Sözleşme revize edildi 2026-08-07.** §9 baştan yazıldı: sunucu kapsamı üç dosyaya sabitlendi,
> uygulama ölüyken çalışmayan üç ayak (tetikleyici · zil · kurulum) tabloya döküldü, iki karar
> gerekçesiyle bağlandı (reddet sinyali gönderilemez · susturulmuş DM sessiz kalır).
> Tam ekran arayüz maddesi **düştü**: `USE_FULL_SCREEN_INTENT` hiç istenmeyecek (2026-08-06).

**`api/` — §9.1 (üç dosya, dördüncüsü sapma)** — ✅ KOD BİTTİ, 🔴 **R7 MERGE ONAYI SAHİPTE** (commit edilmedi)
- [x] `PushPayload` opsiyonel alanlarla genişledi (`priority`, `androidChannelId`, `categoryId`,
      `ttlSeconds`, `data.callerId/callerName`); alanlar verilmeyince **mesaj push'ı birebir aynı**
      (`undefined` alanları `JSON.stringify` düşürüyor → gövde bit bit aynı, regresyon testiyle bağlandı)
- [x] `handleCallInvite` → `emitToUser`'ın hemen ardına fire-and-forget push (kalıcı `Notification`
      kaydı ÜRETİLMEZ, `canDm` ikinci kez uygulanmaz)
- [x] Susturulmuş DM'de ne WS ne push; ack yine `{ ok: true }` (nötrlük, §10)
      🔴 **PM sözleşme hatası, incelemede yakalandı:** ilk hâli yalnız `isMuteActive` diyordu;
      DM menüsünde bildirim **seviyesi** de var → `level=NONE` dalı eklendi (`MENTIONS` hariç).
      Delegasyonun iki yönlü yakalaması burada işe yaradı ([[pm-dev-cift-yonlu-denetim]])
- [x] Test: yeni alanlar + mesaj push'ı regresyonu + mute/NONE/MENTIONS dalları — **1017/1017**
- [ ] 🔴 **`npm run lint` temiz DEĞİL — sprint dışı borç, sahip kararı bekliyor.** Sebep: repoda
      checked-in kod ile prettier ayarı ayrışmış (dokunulmamış `roles.service.ts` tek başına 50 hata,
      repo geneli ~793). Dev `--fix` çalıştırınca 151 dosya biçimlendi, geri alıp dört dosyasını elle
      yeniden kurdu — doğru karar, aksi hâlde R7 onayına 151 dosyalık okunamaz diff giderdi.
      Öneri: M4a bitince tek mekanik commit ile hizala; DoD'un "lint temiz" satırı da gözden geçirilmeli
      (bu repoda hiçbir sprintte karşılanmamış görünüyor)

**`mobile/` — §9.2** — ✅ KOD BİTTİ, 🔴 **EAS BUILD + CİHAZ TURU SAHİPTE**
- [x] 🔴 Zil kararı: **1. seçenek — tek kanal** `incoming_call_v3` (sunucudaki `androidChannelId` ile
      birebir aynı string). Kanala gömülü ~30 sn'lik döngülü zil; ön plandaki `expo-audio` zili
      **kaldırıldı**, iki yol da kanal sesini kullanıyor. Dosya `ffmpeg -stream_loop` ile mevcut
      `incoming-call.wav`'dan üretildi (yeni kayıt yok), mono/22kHz/16-bit → **1.29 MB**
      ⚠️ **Ölçümün 2. adımı SAHİPTE:** kabul/reddet/iptalde kanal sesi gerçekten **kesiliyor mu**?
      Kesilmezse §9.2.1'in 3. seçeneğine düşülür (iki kanal) ve o zaman `api/`deki
      `androidChannelId` de **birlikte** güncellenir
      🟢 Tutarsa [[D40]] da kapanır: ringer moduna saygıyı sistem gösterir (sessize alıp iki yolu da ölç)
      🔴 **Tuzak kayda geçti:** Android ham kaynak adı `[a-z0-9_]` dışına çıkamaz — dosya adındaki
      **tire** `expo prebuild`'i "Resource name is not valid" ile düşürüyor. Yerelde 1 dakikada
      bulundu; EAS'ta "unknown error" olarak dönerdi ([[native-degisince-once-yerel-derle]])
- [x] §9.2.1b Eski kanallar siliniyor (v1 + v2 birikmişti, aynı adla — kullanıcı hangisinin gerçek
      olduğunu ayırt edemiyordu)
- [x] Kanal + kategori **açılışta** kuruluyor (`(app)/_layout.tsx`, `syncPushToken` ile aynı yer)
- [x] Kabul → soğuk açılış zinciri: bekletme deseni `notifications/responseGate.ts`'e **çıkarıldı**,
      push responder ile gelen-arama responder'ı **aynı** hook'u kullanıyor (kopya değil)
- [x] Reddet yerel (§9.2.4); `notification.date` ile 30 sn'den eski yanıtta sinyal **denenmiyor**
- [x] Ön planda çift bildirim bastırılıyor (`isChannelRinging` → handler); `AppState` 'active'
      geçişinde asılı `incoming_call` bildirimleri temizleniyor
- [x] Native diff → yerelde `expo prebuild --clean` + `gradlew` **BUILD SUCCESSFUL**, emülatörde
      açıldı, logcat temiz (M4a-1'in "derleme geçti ama açılmadı" tuzağı yok)
- [x] Ölü kalıntılar: **`expo-audio` kaldırıldı** (M4a-1'in "tek derleme kuralı" gerekçesi düştü;
      blip sesleri gelirse zaten yeni build alınır). Eski `incoming-call.wav` **kaynak olarak
      korundu**, üretim komutu dosya başı yorumuna bağlandı
- [x] Ön planda titreşim **iki kaynaktan** geliyor (kanal deseni + JS döngüsü). M4a-2'nin "tek
      kaynak" kararı **bilerek** tersine çevrildi: arka planda JS koşmuyor, kanal titreşimi olmazsa
      hiç titreşim olmaz. Çakışma kaldırılmadı, **yorumda açıkça belgelendi** → cihazda garip bir
      titreşim hissedilirse bu bilinen ve kabul edilmiş, yeni tur açılmaz

> 📏 **PM tahmini düzeltildi (dev haklıydı):** ses dosyası için "~300 KB'a iner" demiştim; WAV
> sıkıştırmasız PCM olduğu için boyut matematik olarak sabit (`22050 × 2 × 1 × 30 = 1.29 MB`).
> 300 KB'a inmek 8 kHz'e düşmeyi (zil kabalaşır) veya süreyi kısaltmayı (aramanın bir kısmında
> sessizlik) gerektirirdi. 2.6 MB → 1.29 MB kazancı yeterli, daha fazlası ödünleşme.


### M4a-3 cihaz turu #1 (2026-08-07) — iki kök neden + bir platform sınırı

**Geçenler:** heads-up düşüyor · uygulama açıkken tek bildirim · kabul/reddet çalışıyor · reddedince
ses kesiliyor (§9.2.1 ölçüm 2. adımı **GEÇTİ** → tek kanalda kalıyoruz, `api/` kimliği değişmiyor) ·
ayarlarda tek "Gelen arama" kanalı kaldı · uygulama tamamen kapalıyken bildirim geliyor.

**🔴 Bulunan iki kök neden (ikisi de düzeltildi):**
1. **Çift bildirim bastırması kendi bildirimimizi öldürüyordu.** `current` state'i `await`ten sonra
   senkron set ediliyor, handler sonraki tick'te geliyor → `isChannelRinging` kendi bildirimimize
   `true` diyordu. Semptom: "titriyor ama bildirim yok". Yerel bildirime `data.source: 'ws'` işareti
   kondu. **Ders:** iki taşıyıcının payload'ını "tutarlılık için" birebir aynı yapmak, sonradan
   ayırt etmeyi imkânsız kıldı.
2. **`trigger: null` → bildirimlerimiz bizim kanalımıza HİÇ gitmiyordu.** `expo-notifications`
   Android'de kanal kimliğini içerikten değil **trigger'dan** okuyor; null trigger her zaman
   kütüphanenin fallback kanalına düşüyor. Yani kanal önemi/sesi/titreşimi **M4a-2'den beri**
   hiç uygulanmamış. `trigger: { channelId: CHANNEL_ID }` ile düzeltildi.
   🔴 **PM teşhis hatası:** sabahki "sessiz kanal heads-up çıkarmıyor" teşhisi eksikti — kanıt
   (iki bildirim yan yana) doğruydu, yorumu yanlıştı. Kanalımız hiç kullanılmıyormuş. Dev bunu
   **dokümandan değil kütüphanenin native kaynağından** buldu; bu refleks bu turda iki kez kazandırdı.

**Kabul edilen sınır → [[D43]]:** uygulama **tamamen ölüyken** gelen bildirimde eylem düğmeleri
(Reddet · Aramaya Katıl) çıkmıyor. Platform davranışı: Expo üst düzey `title`/`body` ile FCM
notification-type mesaj üretiyor, süreç ölüyken Play Services bildirimi **kendisi** gösteriyor,
uygulamanın `onMessageReceived`'ı hiç çağrılmıyor, düğmeler yalnız orada ekleniyor. Kanal ve ses
çalışıyor çünkü onlar Play Services'in tanıdığı gerçek FCM alanları. **Sahip kararı: şimdilik böyle
kalsın** (işlev kaybı yok, gövdeye dokunup DM'den katılınıyor); alternatifi data-only push, çalışan
teslimatı riske atıyor ve gerçek cihaz doğrulaması istiyor.

**Yan bulgu → `api/` geri alması:** sahip mobilden web'i aradı, web'de hiçbir şey olmadı. Sebep
sabah eklediğimiz `level === NONE` dalıydı (o DM için `muted=false, level=NONE` kaydı duruyordu) ve
ancak **veritabanına bakılarak** bulunabildi. Sahip kararıyla geri alındı: `level` bir mesaj bildirim
seviyesi, aramayı susturmaz; yalnız `muted` susturur. Sözleşme §9.1 madde 3 güncellendi, iki test
geri almanın regresyon koruması oldu.


### ✅ M4a KAPANDI — sahip onayı 2026-08-07

Sahip cihazda tam turu attı: **"her şey normal, bildirimlerde sorun yok"**. Web tarafı (D39) da
tarayıcıda doğrulandı. 1-1 DM sesli arama uçtan uca çalışıyor: mobilden başlatma, webden arandığında
çalma, kabul/reddet, uygulama kapalıyken bildirim, mini pencere, arka planda ses.

**Açık kalan iki kalem borca çevrildi (sahip kararı: "takılmayalım, devam edelim"):**
- [[D43]] uygulama tamamen ölüyken bildirimde eylem düğmeleri yok (platform sınırı, işlev kaybı yok)
- [[D44]] zil sesi duyulmuyor (ölçüldü: dosya sağlam ama tepe -14.9 dB; normalize + yeni build gerek)

⚠️ **[[D40]] doğrulanamadı, kapanmadı.** "Cihaz sessizdeyken zil çalmasın" borcunun kanal sesine
geçişle kendiliğinden kapanması bekleniyordu; zil hiç duyulmadığı için (D44) test edilemedi.
D44 düzelince **birlikte** doğrulanır: sessize al, ara, çalmamalı; sesi aç, ara, çalmalı.

### DoD (cihazda) — ✅ SAHİP DOĞRULADI 2026-08-06
> Tam liste sözleşme §13'te. Sahip turu: arama başlatma, karşılıklı konuşma, arka planda ses,
> bildirim eylemleri, küçültme, mini pencere ve regresyonlar **tamam**. Bulunan kusurlar aşağıda.

### 🔴 Derleme ve açılış: üç ayrı hata, üçü de sahip build almadan önce görülmedi

1. **Kotlin derleme hatası** — parametresiz `AsyncFunction("stop")` içinde `return@AsyncFunction`
   kullanılmış; o aşırı yükleme lambda dönüş tipini `Any?` çözüyor, boş `return@` yalnız `Unit`
   beklenirken geçerli. İki fonksiyon derlenip üçüncüsü patlıyordu. **EAS "unknown error" deyip
   satırı göstermedi**, hata yerelde (`expo prebuild` + `gradlew`) 4 dakikada bulundu.
2. **`expo-asset` sürüm çakışması** — `expo-audio`'nun peer'ı `expo-asset: "*"` diyor, npm latest'i
   (57.0.8) kurmuş; proje SDK 54, `expo` paketi `~12.0.13` istiyor. SDK 57 hattından native modül
   → açılışta `NoClassDefFoundError`. `npx expo install expo-asset` ile sabitlendi, `expo-doctor` 18/18.
   ⚠️ Bu, config plugin sürümünde yaşananın aynı sınıfı: **latest ≠ SDK'ya uygun**. Bu sefer peer
   bağımlılığı üzerinden arka kapıdan girdi, kimse bakmadı.
3. **`DOMException` yok** — `livekit-client` modül seviyesinde `DeferrableMapAbortError extends
   DOMException` tanımlıyor, Hermes'te bu sınıf yok. Polyfill `@livekit/react-native` import edilince
   kuruluyor ama `registerGlobals()` `_layout.tsx`'teydi ve **yetmiyordu**: expo-router rota
   dosyalarını `require.context` ile topluca yüklüyor, `stores/voice.ts` o gövdeden önce
   değerlendiriliyor. Çözüm: `mobile/index.js` giriş noktası (`main` oraya bakıyor), `require` ile
   deterministik sıra.

> **Ders (hafızaya yazıldı):** native diff varsa buluta göndermeden önce yerelde derle **ve
> emülatörde aç**. Bugün ikisi ayrı ayrı patladı: derleme başarılı olup uygulama açılmayabiliyor.

### Sahip cihaz turu — üç kusur, üçü de JS (yeni derleme gerekmedi)

- [x] 🔴 **Ret mesajı eziliyordu.** `leave()` içindeki `room.disconnect()` LiveKit'in `Disconnected`
      olayını tetikliyor, dinleyici bunu beklenmedik kopma sanıp **ikinci bir `leave()`** başlatıyor
      ve nötr mesajı ("Şu anda ulaşılamıyor") "Bağlantı kesildi" ile eziyordu. Sözleşme §3.3 sapması,
      üstelik R7 nötr-mesaj şartına dokunuyordu. Düzeltme: `leaving` bayrağı — `leave()` yeniden
      girişe kapalı, dinleyici ayrılışı biz başlattıysak sessizce çıkıyor
- [x] 🔴 **Çift `voice/leave` isteği** — aynı kökün ikinci sonucu, aynı bayrakla kapandı
- [x] 🔴 **Kapatınca beyaz ekran** (`addViewAt: The specified child already has a parent`).
      **İki denemede çözüldü.** İlk hipotez (Alert'in sökülme sırasında açılması + sürekli kurulu
      `Modal`) yanlıştı. Gerçek sebep: `leave()` durumu sıfırlayınca ekran **kapanma animasyonunun
      ortasında** bambaşka bir ağaçla yeniden çiziliyordu (kutucuklar gidiyor, "tek başınasın" ve
      "dinleyici" satırları geliyor) → Fabric sökülmekte olan yüzeye görünüm ekliyor. Düzeltme:
      store'a `isLeaving`, ekran **durum boşalmadan önce** yığından çıkıyor, çıkarken görünüm
      donduruluyor, gizleme sayacı susturuluyor
      ⚠️ **Kanıtlanmadan düzeltildi:** iki hesapla gerçek arama gerektiği için yerelde üretilemedi.
      Bu sınıf bir kusur tekrar ederse **önce logcat** (telefonda USB hata ayıklama), tahmin turu yok

### Web ↔ mobil boşluğu (kusur değil, sıradaki iş)
Sahip "web'den arayınca mobile düşmüyor" dedi. **Beklenen:** çalma M4a-2'nin işi. Ayrıca web klasik
modelde olduğu için arayan odaya girmiyor → mobilde "arama sürüyor" şeridi de çıkmıyor. M4a-2 bu
halkayı kapatıyor: web `voice:call_invite` zaten gönderiyor, mobil onu karşılayınca uçtan uca çalışır
(D39/web revizyonu bunun için şart DEĞİL).

---

## Sprint D39 — Web DM Arama Modeli: "oda önce" — 2026-08-07

> Sözleşme: `contracts/SPRINT_D39_WEB_CALL_MODEL_CONTRACT.md`. Tier **yalnız `web/`**;
> `api/` + `mobile/` diffi sıfır, sunucu sözleşmesi hiç değişmiyor.
>
> **Sıra kararı:** PLAN.md D39 kaydında tetikleyici "M4 kapanışı" yazıyordu; sahip 2026-08-07'de
> öne aldı. Boşa gitme riski büyük ölçüde düşmüştü, çünkü oda-önce modeli M4a-1'de **cihazda
> doğrulandı** → "mobil klasiğe döner, borç düşer" ihtimali fiilen kalmadı.

### Web (`web/`) — ✅ KOD BİTTİ, tarayıcı DoD sahipte
- [x] `startCall` daveti gönderip **beklemeden** odaya katılıyor (ack `{ok:false}` ise girmiyor)
- [x] `call_accepted` artık `join` ETMİYOR, yalnız "çalıyor" göstergesini düşürüyor (çift-join tuzağı §3)
- [x] `call_rejected` / iptal → nötr mesaj + **odadan çıkış**; çıkışta `call_cancel` gidiyor
      (karşı tarafın zili asılı kalmasın) — kapanış **tek noktadan**, dört yere serpilmiyor
      (`cancelRingingIfNeeded`; `leave()` VE beklenmedik `Disconnected` yolu ikisi de oradan geçiyor)
- [x] 🔴 Yalnız-kalma zaman aşımı ikiye ayrıldı: hiç kimse katılmadıysa **3 dk**, biri katılıp
      çıktıysa **60 sn**. Tek sabit bırakılırsa cevapsız arama 60 saniyede düşerdi (§4).
      Referans: `mobile/src/stores/voice.ts` (`peerEverJoined`)
- [x] `OutgoingCallBar` kalktı; oda görünümünde **bekleyen katılımcı** kutucuğu (soluk + "Çalıyor…"),
      mobil M4a-1 pariteti. Geri-zil `useCall`'a taşındı — bileşen yaşam döngüsünden **ayrık**
      `effectScope` ile (DM'den çıkınca susmasın diye; dev'in kendi çözümü, gerekçesi raporlandı)
- [x] `pendingVideoCall` + `consumePendingVideoCall` **kaldırıldı**; ölü kalan `call.calling` /
      `call.cancel` i18n anahtarları da temizlendi (hiçbir tier'da kullanılmıyordu)
- [x] Nötr mesaj DEĞİŞMEDİ (R7): "Şu anda ulaşılamıyor." — `error` kodu açımlanmıyor
- [x] `vue-tsc -b`: bilinen **6 önceden-var** hata, yeni hata yok (🔴 `--noEmit` yalancı yeşil)

### 🔴 İncelemede yakalanan blocker — kodda kapatıldı, tarayıcıda üretilemezdi
**Arayan odaya katılamazsa arama "çalıyor" durumunda kilitleniyordu.** `startCall` daveti gönderip
`setOutgoing` yaptıktan sonra `join()` patlarsa (token 403 `CHANNEL_FULL` · LiveKit hatası · ağ ·
env eksikken 503), `join`'in catch'i `leave()` çağırıyor ama `leave()` temizliği
`connectedChannelId`'ye bakıyordu — o değer yalnız `room.connect()` **başarılı olduktan sonra**
set ediliyor, hata ondan önce olursa `null`. Sonuç zinciri: geri-zil sonsuza kadar çalar · iptal
düğmesi no-op'a düşer (`isConnectedTo` false) · karşı tarafa `call_cancel` hiç gitmez · kullanıcının
çıkışı kalmaz. Düzeltme: temizlik çağrısı bağlanma aşamasındaki kanal kimliğini de görüyor
(`leftChannelId ?? connectingChannelId.value`).
> Dev **daha dar** bir düzeltme seçti ve gerekçelendirdi: `leftChannelId`'nin kendisini genişletmek
> ayrılma sesi + `voiceApi.leave` davranışını da sessizce değiştirirdi (dosyada o niyeti belgeleyen
> bir yorum zaten duruyordu). PM önerisinden bilinçli ve **doğru** sapma.

### PM sözleşme hataları (dev yakaladı, sessiz geçmedi)
- §1 tablosu bekleyen-katılımcı kutucuğu için `VoiceRoomView.vue` diyordu → o **guild ses** yolu;
  DM aramaları `DmCallPanel.vue`'den çiziliyor, guild kanalları hiç çalmıyor. Sözleşme düzeltildi
- DoD'a `npm run lint` koydum → `web/`'de ne script ne ESLint yapılandırması **var**. Madde geçersiz
  kılındı, borç **D42** açıldı ([[D41]] ile aynı turda). Karşılığı olmayan bir DoD maddesi diğer
  maddelere "işaretle geç" alışkanlığı bulaştırır
- `DmConversation.vue` + `UserCard.vue` §1 listesinde eksikti (biri `pendingVideoCall` kalkınca
  derlenmiyor, diğeri silinen bileşeni import ediyor) — ikisi de kaçınılmazdı

### DoD (tarayıcıda, iki hesap — SAHİPTE)
> Tam liste sözleşme §10'da. Kritik üçü: arayan **anında odada** + karşı taraf soluk kutucukla
> "Çalıyor…", cevapsız arama **60 sn'de düşmüyor** (3 dk yaşıyor), arayan çıkınca karşı tarafın
> zili susuyor.

---

## Sprint M4c — Mobil Ortam Sesli Kanalı — 2026-08-07

> Sözleşme: `contracts/SPRINT_M4C_MOBILE_GUILD_VOICE_CONTRACT.md`. Tier yalnız `mobile/`;
> `api/` + `web/` diffi sıfır (i18n kaynağı hariç).
>
> 🔄 **Faz sırası takas edildi (sahip kararı 2026-08-07):** PLAN sırası (1) 1-1 DM → (2) grup DM →
> (3) ortam kanalı idi. M4a bitince (3) öne alındı. Gerekçe: mobilde ortam ses kanalları **hiç
> görünmüyor** ve topluluk platformunun asıl kullanımı bu; grup DM araması daha niş. Ağır platform
> işi M4a'da bittiği için geriye kanal listesi + katılma akışı kalıyor. **M4b sıraya geri düştü.**

### Mobil (`mobile/`) — ✅ KOD BİTTİ, 🔴 CİHAZ TURU SAHİPTE
- [x] Kanal listesi süzgeci kalktı: ses kanalları kendi sırasında, hoparlör ikonuyla görünüyor
- [x] Satıra dokunma **doğrudan katılıyor** (web pariteti), ara ekran/onay yok
- [x] 🔴 **Yalnız-kalma zaman aşımı guild kanalında KAPALI.** `autoEndWhenAlone` bayrağı her
      `startOrJoin`de `!isGuild` ile hesaplanıyor, iki ayrı yerde kontrol ediliyor (zamanlayıcı
      kurulumu + callback). DM'in iki sabiti dokunulmadı
- [x] Katılma **davetsiz**: guild dalında `alreadyOngoing` koşulsuz `true` zorlanarak invite bloğu,
      `didInvite` ve `leave()`teki `callCancel` **tek noktadan** kapatıldı — DM kod yoluna hiç
      dokunmadan. Dev'in çözümü, zarif
- [x] Arama ekranı ızgaraya açıldı. **Ek sort yazılmadı:** LiveKit `remoteParticipants` bir `Map`,
      insert sırasını koruyor → sıralama zaten kararlı. Dev bunu ölçüp gereksiz kod yazmadı
- [x] Kanal satırının altında içeridekiler görünüyor (M4a presence altyapısı, yeni uç yok)
- [x] Kanal oluşturmada tür seçici (Metin/Ses), varsayılan Metin
- [x] Kilitli özel kanalda Türkçe uyarı — **metin kanallarını da kapsıyor**. Web'de
      (`ChannelPanel.vue:375`) bu kontrol zaten vardı, mobilde hiç yoktu → kapsam kayması değil,
      parite düzeltmesi
- [x] İki UI yalanı kapatıldı: ses kanalı menüsünde "Okundu İşaretle" gizlendi (ses kanalının
      mesajı yok), guild aramasında "Sohbet" düğmesi gizlendi (minimize'ın aynısını yapıp başka
      şey vaat ediyordu). `onOpenChat` opsiyonel yapıldı, DM tarafı birebir aynı
- [x] **Native diff YOK** (saf JS/TS) → yeni dev build gerekmiyor. ⚠️ Bu yüzden [[D44]] zil sesi
      düzeltmesi bu sprinte **bindirilemedi**, build fırsatı beklemeye devam ediyor
- [x] `typecheck` · `lint` · `expo-doctor` temiz; `api/` diffi sıfır, `web/` yalnız `tr.json` (+4)

### Bu sprintte yakalananlar
- 🔴 **PM atıf hatası:** sözleşme §0 kanal süzgecini `home.tsx:165/178` diye gösteriyordu, o satırlar
  `markRead` süzgeciydi ve `GUILD_TEXT`te kalmaları **doğruydu**. Dev yanlış satırı değiştirmedi,
  gerçek yeri (`ChannelSidebar.tsx`) buldu ve bildirdi. Sözleşme düzeltildi + not eklendi:
  **satır atıfları kanıt değil işaret**
- 🔴 **Mimari sınır → [[D45]]:** presence aboneliği tek-değerli izleyiciye bağlı (M4a'nın "ekranda
  tek DM var" varsayımı). Ortam listesinde çok kanal aynı anda mount olduğu için reconnect sonrası
  yalnız sonuncusu tazeleniyor. Dev **DUR kuralına uydu**, `realtime/socket.ts` §1'de yoktu
- Dev dördüncü bir dosyaya (`CallControls.tsx`) dokunduğunu **açıkça bildirdi** ve gerekçelendirdi
  (düğmeyi gizlemenin tek temiz yolu); kabul edildi

### DoD (cihazda — SAHİPTE)
> Tam liste sözleşme §11'de. İki kritik madde: **kanalda tek başına 5 dakika durup atılmamak** (§4)
> ve **DM aramasının regresyonsuz kalması** (§3/§4 ayrımı DM yolunu bozmamalı).

---

## Sprint M4b — Mobil Grup DM Sesli + Zil Sesi (D44) — 2026-08-07

> Sözleşme: `contracts/SPRINT_M4B_MOBILE_GROUP_VOICE_CONTRACT.md`. Tier yalnız `mobile/`.
> **M4 sesin son durağı** — bu bitince sıradaki faz görüntülü.
>
> 🔴 **İki iş tek sprintte, bilinçli:** D44 native build gerektiriyor (ses dosyası native varlık),
> M4b zaten cihaz turu gerektiriyor. Ayrı yapılsalar iki build iki tur olurdu. **Üçüncü iş
> eklenmedi:** [[D43]] (push eylem düğmeleri) bilerek dışarıda — çalışan bir yolu riske atıyor ve
> karışık turda teşhis zorlaşır (bugün M4a-3'te tam bu yaşandı).

### Mobil (`mobile/`) — ✅ KOD BİTTİ, 🔴 EAS BUILD + CİHAZ TURU SAHİPTE
- [x] Grup DM **kendi sinyalini** kullanıyor: `voice:group_call_start`
- [x] 🔴 Grup DM'de **kimse çalmıyor** — dahası **uygulama içi bildirim de yok** (PM kararı).
      Dev `Alert.alert` ile bilgilendirme koymuştu; `Alert` **modal** bir diyalog, kullanıcı yazı
      yazarken ekranı keser ve dokunmadan kapanmaz — "hafif bilgilendirme" değil. Web'deki karşılığı
      kendiliğinden kaybolan pasif bir şerit. Yanlış ağırlıkta bildirim koymaktansa hiç koymadık;
      kullanıcı DM'i açınca şeridi zaten görüyor. Ölü i18n anahtarı da temizlendi
- [x] Yalnız-kalma zaman aşımı grup DM'de **AÇIK**. M4c'nin `!isGuild` hesabı zaten doğru veriyordu,
      **yeni koşul eklenmedi** (sözleşme §3 bunu şart koşmuştu, dev doğruladı)
- [x] Üç dal ayrıldı (`dm`/`group`/`guild`): `isGroup` **ayrı bayrak**, `isGuild`e dokunulmadı →
      DM ve ortam kanalı kod yolları değişmedi
- [x] `didInvite` grupta koşulsuz `false`; başarısız katılmada `callCancel` **gönderilmiyor**
      (sunucudaki `otherDmMember` grup kanalında rastgele tek bir üyeye giderdi — dev'in yakalaması)
- [x] Telefon düğmesi + "sese katıl" şeridi grup DM'de açıldı; arama ekranı M4c'nin ızgarası
- [x] **D44:** ses tepe **-14.9 → -1.0 dB**, ortalama -28.4 → -14.5. Süre/format/kanal/örnekleme ve
      boyut aynen korundu, yalnız kazanç. 🟢 **Native `res/raw` kopyasında da doğrulandı** — prebuild
      dosyayı aldı, yani APK'ya girecek olan normalize edilmiş hali
- [x] `typecheck` · `lint` · `api`+`web` diffi sıfır (`tr.json` hariç)

> ⚠️ **Emülatör açılış doğrulaması YAPILAMADI.** Dev üç kez emülatör boot beklerken takıldı, ortam
> yanıt vermedi. PM kod incelemesiyle ve **native `res/raw` dosyasını ölçerek** doğruladı; uygulamanın
> emülatörde açılışı görülmedi. Bu turda native diff yalnız bir **ses varlığı** (kod yok), yani
> M4a-1'deki "derleme geçti ama açılmadı" sınıfı risk düşük — ama sıfır değil, sahip build alırken
> ilk açılışa dikkat etsin.

### DoD (cihazda — SAHİPTE)
> Tam liste sözleşme §10'da. Dört kritik madde:
> **(1) zil sesi DUYULUYOR** (D44'ün asıl testi), **(2) telefon sessizdeyken çalmıyor** → [[D40]]
> kapanır, **(3) grup DM'de kimse katılmazsa arama 3 dakikada düşüyor** (ortam kanalından farkı),
> **(4) 1-1 DM ve ortam kanalı REGRESYONSUZ**.

---

## Sprint M4z — M4 Kapanış Temizliği — 2026-08-08 ✅ KAPANDI

> Sözleşme: `contracts/SPRINT_M4Z_KAPANIS_CONTRACT.md`. Altı kalem, hepsi cihazda doğrulandı.

- [x] **D47** web'de DM listesi ses göstergesi — 🔴 dev özellik yazmadan önce aboneliği kontrol etti
      ve aynı kusur sınıfını web'de de buldu (uykudaydı): sayaç yokluğu yüzünden açık grup DM'den
      çıkınca listedeki gösterge sessizce ölecekti. Özellik önce yazılsaydı kusuru kendi eliyle
      üretecekti
- [x] **D48** ses kanalına girmeden önce ara panel — mevcut sheet deseni yeniden kullanıldı
- [x] **D49** iki kişilik grup → DM yönlendirmesi — dev iki store'da kopya-satır kusurunu yakaladı
      (sunucu artık **mevcut** bir DM döndürebiliyor, körü körüne listeye ekleniyordu)
- [x] **§E** grup aramasında bekleyen üyeler soluk görünüyor — altyapı iki tarafta da vardı
      (1-1 için yazılmıştı), çoğullaştırıldı. Bekleyende "Çalıyor…" **yok**: grup daveti tek
      seferlik, 60 sn sonra kimse çalmıyor, etiket yalan olurdu
- [x] **§F** 🔴 grup çağrısı iptali — arayan kapatınca zil/titreşim/bildirim **anında** susuyor
      (sahip doğruladı). Sunucu sinyali seçildi, presence tabanlı alternatif elendi (çalan tarafın
      o kanalı dinliyor olması ekrana bağlıydı → bazen çalışan bir çözüm olurdu)
- [x] Web'de grup çağrısında **sunucu cevabı kontrol edilmiyordu** — sunucu reddetse bile sessizce
      odaya giriliyor, karşı taraf çalmıyor, kullanıcı hiçbir uyarı görmüyordu ("web'ten çağrı
      düşmüyor" semptomu buydu). Mobil bu kontrolü baştan yapıyordu
- [x] Mobilde grup DM'de telefon yerine **hoparlör** ikonu (web ve Discord mobil ile aynı ayrım:
      grup sesli bir çağrı değil, girilen bir oda)

### 🔴 PM dersi — kabul edilen sınırlar cihazda sınanmalı
Bu sprintte sahibin turu **üç kez** PM'in "kabul edilebilir" dediği şeyi kusur olarak geri getirdi:
grup DM'de çalma olmaması (§5 kararı, geri alındı) · grup iptalinin olmaması ("30 sn'de kendi
kendine susar" — cihazda ortada olmayan bir çağrı yarım dakika çalıyor) · ızgara düzeni (dar ekranda
sesli aramada bakılan tek şeyi zorlaştırıyordu). Üçü de kağıt üstünde savunulabilirdi.
**Sonuç:** PM'in kapsam kısıtları bir tasarım kararı değil, **doğrulanmamış bir varsayımdır**;
sahip turundan geçmeden "kabul edildi" sayılmaz.

---

## Sprint C11 — Mesaj Listesinde Tarih Ayracı — 2026-08-08 ✅ KOD BİTTİ

> Sözleşme: `contracts/SPRINT_C11_TARIH_AYRACI_CONTRACT.md`. Tier `web/` + `mobile/`, `api/` sıfır.

- [x] **Bugün** · **Dün** · **25 Ekim 2026** — altı yüzey (kanal · 1-1 DM · grup DM × iki istemci),
      **üç** bağlama noktasıyla karşılandı (web'de DM bileşeni 1-1 ve grubu birlikte çiziyor)
- [x] Gün kimliği **yerel gün başlangıcı damgası**; saat farkı hiç kullanılmadı (23.50'de atılan
      mesaj 00.10'da "bugün" sayılırdı)
- [x] Etiket render anında hesaplanıyor, mesaja iliştirilmiyor. Gece yarısı kayması için **tek**
      dakikalık zamanlayıcı, yalnız gün değişince yazıyor; mobilde son abone gidince duruyor
- [x] Ayraçlar listeden **türetiliyor**, diziye gömülmüyor → sonsuz kaydırmada yerleri kendiliğinden
      düzeliyor
- [x] 🔴 **RN tuzağı yakalandı:** `inverted` FlatList hücre kabını `column-reverse` + `scaleY(-1)`
      ile kuruyor, yani hücrenin doğrudan çocukları ekranda **ters** çiziliyor. Fragment
      kullanılsaydı ayraç mesajın **altında** görünürdü. Sarmalayıcı `View` konuldu, gerekçesi
      yorumda (ileride "gereksiz View" diye kaldırılmasın)
- [x] Gruplama iki istemcide de vardı; "yeni gün = grup başı" kuralı eklendi → ayraçtan sonraki ilk
      mesaj aynı yazara ait olsa bile tam başlıkla çiziliyor. Saat gösterimi değişmedi
- [x] `vue-tsc` bilinen 6 · `vite build` başarılı · mobil temiz · `api/` sıfır · native diff yok

### Dev bulgusu → [[D50]]
Web'de eski mesaj yüklerken ekran zıplıyor ve son mesaj çağırana aitse liste dibe atılıyor.
**C11 ile gelmedi, önceden vardı**; mobilde korumalar var, webde yok. Dev kapsam dışı olduğu için
dokunmadı (doğru davranış).

### DoD (cihaz/tarayıcı) — 🟢 SAHİP ONAYLADI 2026-08-07
Sahip aynı gün "tamam" dedi; **PM kutuları işaretlemeyi unuttu**, 2026-08-08'de sahip hatırlattı.
- [x] Kanal · 1-1 DM · grup DM'de gün geçişleri doğru (web + mobil)
- [x] Yukarı kaydırıp eski paket yükle: ayraçlar doğru yerde
- [x] Ayraçtan sonraki ilk mesaj avatar + ad ile çiziliyor
- [x] Gece yarısını geçirip ekranı açık bırak: **Bugün → Dün** kayıyor

---

## Sprint M4d — Mobil Görüntülü Arama: 1-1 DM — 2026-08-08 🟡 AÇILDI

> Sözleşme: `contracts/SPRINT_M4D_MOBILE_VIDEO_DM_CONTRACT.md`. Tier yalnız `mobile/`;
> `api/` + `web/` kod diffi sıfır (i18n kaynağı hariç). **Native diff YOK → yeni dev build YOK.**
>
> Sahip faz bölmesinin görüntülü yarısının ilk parçası: (4) 1-1 DM · (5) grup DM · (6) ortam kanalı.

- [x] Token yanıtındaki `canPublishCamera` store'a alınıyor (bugün okunmadan atılıyor)
- [x] Kamera aç/kapat + ön-arka çevirme; publication `null` dönerse state geri alınıyor (web tuzağı)
- [x] Kamera izni reddedilince arama düşmüyor, "Ayarları Aç" çıkıyor (`camera_denied` ayrık kodu)
- [x] DM başlığında görüntülü ara düğmesi (`startWithCamera`), web'deki `pendingCameraStart` deseni
- [x] Video kutucuğu mevcut `ParticipantTile`'a dal olarak eklendi, yeni bileşen yazılmadı
- [x] 🔴 Arka plan: kamera durur, ses devam eder, öne dönünce kamera **kendiliğinden** geri gelir
      (`cameraIntent` ≠ `isCameraOn` ayrımı)
- [x] T&S: kapı sunucuda, `canPublishCamera=false` iken düğme çizilmiyor (görünür-kilitli **değil** —
      1-1 DM'de açıklama karşı tarafın minör olduğunu ifşa ederdi, brief §5/G1)
- [x] **§3-R düzen revizyonu** — video artık 88px avatar dairesinde değil: kamera açılınca tam alan
      karşı taraf, sağ üst köşe kendi önizlemen. Kimsenin kamerası açık değilken iki-kutucuk düzeni
      **aynen** duruyor (sesli arama regresyonsuz)

### 🔴 PM dersi — referans uygulamaya İLK turda bak
Sözleşmenin ilk §3'ü "video avatarın yerine çizilir" diyordu; dev harfiyen uyguladı ve sonuç görüntülü
aramada karşı tarafın **88 piksellik daire** içinde görünmesi oldu. Discord'da 1-1 görüntülü arama tam
alan. Sahip düzeni seçti, ikinci tur yazıldı. [[revize-turu-esigi]] tam bunu söylüyordu: referansa ilk
turda bakılsaydı ikinci tur hiç olmayacaktı. Kusur dev'in değil sözleşmenindi.

### PM incelemesinde yakalananlar (dev raporundan bağımsız)
- "Bu aramada tek başınasın" yazısı tam-alan düzeninde ortalanmış kaplamaydı → tam alandaki avatar+ad
  ile üst üste biniyordu, hem de en sık yaşanacak anda (görüntülü ara → karşı taraf henüz katılmadı).
  Akışa alındı
- Dev'in "köşe kutusu üst bardaki küçült ikonuyla çakışabilir" riski **doğrulanmadı**: üst bar akışta,
  `focusArea` onun altından başlıyor
- Dev web'de bir kusur buldu (`isCameraOn` publication kontrol edilmeden yazılıyor) → [[D51]]

### DoD (cihazda) — 🟢 SAHİP TURU GEÇTİ 2026-08-08 (bir madde hariç)
Sahip iki yönde de denedi (mobil→web, web→mobil).
- [x] **(1)** görüntülü ara düğmesi aramayı kamera açık başlatıyor
- [x] **(2)** arka plana alınca ses sürüyor, dönünce görüntü kaldığı yerden devam ediyor
- [x] **(3)** izin reddi aramayı düşürmüyor — sahip cihazda "her seferinde sor"a çevirip **reddetti**:
      istem çıkıyor, reddedince arama düşmüyor ve "Ayarları Aç" modalı açılıyor. Dal uçtan uca görüldü
- [x] **(4)** kamerasız 1-1 DM araması, grup DM ve ortam sesli kanalı regresyonsuz

**Sahip ürün kararı:** aramayı kabul eden tarafın kamerası **otomatik açılmıyor**, tercihe bırakıldı
(arayanın kamerası açılıyor — o zaten görüntülü aramayı başlatan taraf, açılmasaydı tezat olurdu).
Karşı taraf kamerasını açmak istemeyebilir. Bu davranış bilinçli, kusur değil.

---

## Sprint M4e — Mobil Görüntülü Arama: Grup DM — 2026-08-08 🟡 AÇILDI

> Sözleşme: `contracts/SPRINT_M4E_MOBILE_VIDEO_GROUP_CONTRACT.md`. Tier yalnız `mobile/`;
> `api/` + `web/` kod diffi sıfır, **native diff yok**.
>
> Kamera altyapısının tamamı M4d'de yazıldı ve cihazda doğrulandı; bu sprint onu **çoğullaştırıyor**.

- [x] 🔴 Uzak kamera state'i tek slottan **userId anahtarlı** yapıya çıktı (grupta ikinci kamera
      birincisini eziyordu); 1-1 DM aynı kaynaktan türetiyor, paralel state yok
- [x] Kamera düğmesi kapısı grup DM'i kapsıyor (guild hariç — M4f)
- [x] Kamera açıkken **iki sütunlu ızgara**; kimse açmadığında bugünkü tek sütun alt alta düzen aynen
- [x] Kendi kutucuğun ızgaranın elemanı (1-1'deki köşe önizlemesi grupta yok)
- [x] T&S: grupta bir minör bile varsa video yok (sunucu kararı), düğme çizilmiyor

### DoD (cihazda) — 🟢 SAHİP TURU GEÇTİ 2026-08-08 (altı maddenin altısı)
- [x] 1-1 DM görüntülü arama **regresyonsuz** (map refactor'ünün bozabileceği tek yer — temiz)
- [x] Grup DM'de kamera açılıyor, diğerleri görüyor
- [x] İki kişi aynı anda kamera açınca ikisi de görünüyor (tek slot ezilme kusuru gitti)
- [x] Biri kamerasını kapatınca yalnız onun kutucuğu avatara dönüyor
- [x] Kimse kamera açmadığında sesli grup araması bugünkü gibi (tek sütun, alt alta)
- [x] Ortam sesli kanalı regresyonsuz

---

## Sprint M4f — Mobil Görüntülü: Ortam Sesli Kanalı — 2026-08-08 🟡 AÇILDI

> Sözleşme: `contracts/SPRINT_M4F_MOBILE_VIDEO_GUILD_CONTRACT.md`. Tier yalnız `mobile/`;
> `api/` + `web/` kod diffi sıfır, native diff yok. Görüntülü yarının **son** parçası.

- [x] Kamera kapısı guild'i kapsıyor; ızgara düzeni ortam kanalında da açılıyor (kimse kamera
      açmayınca bugünkü tek sütun liste aynen). `callKind` bazlı kapı tamamen kalktı, tek kapı
      `canPublishCamera`
- [x] 🔴 **Sunucu yayını kestiğinde istemci uyuyor** (R11 `stop-broadcast`): `LocalTrackUnpublished` →
      kamera kapanır, `ParticipantPermissionsChanged` → `canPublishCamera` güncellenir.
      ⚠️ **Dev bulgusu:** LiveKit SDK bizim kendi unpublish'imizle sunucunun zorla indirmesini AYIRT
      ETMİYOR (ikisi de aynı olay) → `localCameraStopping` bayrağı (mevcut `leaving` deseni)
- [x] 🔴 `cameraIntent` de sıfırlanıyor — yoksa arka plandan dönünce kamera kendiliğinden açılıp
      moderatörün kararıyla çekişir (sessiz T&S delinmesi)
- [x] Kullanıcı sessiz bırakılmıyor ama gerekçe söylenmiyor ("moderatör" denmez — o bilgi istemcide yok)

### 🔴 PM incelemesinde yakalanan bug
Kamera açıkken aramayı kapatınca `room.disconnect()` yerel track'leri de unpublish ediyor →
`LocalTrackUnpublished` ateşleniyor → bayrak `false` olduğu için olay **sunucu kaynaklı** sayılıyordu:
kullanıcı aramayı kaparken "Kameran kapatıldı" uyarısı alacaktı, üstelik ekran yığından çıktığı için
uyarı DM ekranının üstünde belirecekti. `leave()` artık bayrağı en başta işaretliyor, dinleyici de
`leaving`i ayrıca kontrol ediyor.

### Cihaz turunda görülen, kusur OLMAYAN log (2026-08-08)
Odadan atılan tarafta (mobil) `publisher data channel 'RELIABLE' closed unexpectedly` konsol hatası
çıkıyor. **LiveKit'in kendi log'u**, bizim kodumuzdan değil: sunucu katılımcıyı odadan çıkarınca
bağlantı aniden kopuyor, SDK bunu beklenmedik kapanma diye yazıyor. Zorla çıkarmada normal, akışı
bozmuyor (atılma davranışı sahip turunda temiz geçti). Kırmızı kutu yalnız geliştirme derlemesinde
(LogBox `console.error`ı yakalıyor); mağaza sürümünde kullanıcı görmez. **Susturulmayacak** —
kütüphane log'unu bastırmak gerçek hataları da gizler. Tekrar raporlanmasın diye yazıldı.

### Web pariteti → [[D52]]
Aynı üç maddenin hiçbiri webde yok (`LocalTrackUnpublished`/`ParticipantPermissionsChanged` grep: sıfır).
Yayını durdurulan web kullanıcısının düğmesi "kamera açık" göstermeye devam ediyor. D51 ile aynı dosya,
aynı turda düzeltilecek.

### DoD (cihazda — SAHİPTE)
> Tam liste sözleşme §5'te. En kritik iki madde: **(1)** web'den "yayını durdur" → mobilde kamera
> düşüyor, ses devam ediyor · **(2)** sonrasında arka plana alıp dönünce kamera **kendiliğinden geri
> açılmıyor**.

---

## Sprint M4t — Mobil T&S Pariteti: Kamera Uyarısı + Acil Buton — 2026-08-08 🟡 AÇILDI

> Sözleşme: `contracts/SPRINT_M4T_MOBILE_TS_PARITY_CONTRACT.md`. Sahip isteği: webde canlı olan iki
> T&S yüzeyi mobilde hiç yok. Tier yalnız `mobile/`; sunucu tarafı hazır, native diff yok.

- [x] Kamera uyarısı (C7 §E2) — yalnız genel/açık ortam ses kanalında, kanal başına bir kez,
      bellekte (kalıcı saklama YOK — webde de sessionStorage)
- [x] Acil buton (A4) — onay → `POST /emergency` → sunucu odadan çeker → geri bildirim ekranı
      (metin beyanı isteğe bağlı, `PATCH /emergency/:id`)
- [x] 🔴 Acil basıldığında "Bağlantı kesildi." hata mesajı gösterilmiyor (sunucu attı, kusur değil)
- [x] 🔴 Acil buton otomatik gizlenmeye tabi değil — panik anındaki kullanıcı "ekrana dokun" adımını
      yapamaz
- [x] Yerleşim: arama ekranının üst barı. Soluklaşan `topBar`ın İÇİNDE değil KARDEŞİ olarak çizildi —
      RN'de `opacity` alt ağaca iniyor, iç içe konsaydı acil buton da solardı

### PM incelemesi (2026-08-08)
- **Sözleşme sapması, dev bildirdi:** `home.tsx`e dokunuldu (§1 tablosunda yoktu). Gerekçe geçerli:
  nudge kapısı hem `channel.ageGated` hem `guild.adultsOnly` istiyor, ikisi bir arada YALNIZ orada
  var. Kabul edildi — ama kural "sapma gerekirse DUR ve sor"du; sonradan bildirmek ikinci en iyisi
- ⚠️ **Kırılganlık notu:** nudge kapısı `startOrJoin`e parametre olarak taşınıyor ve bugün guild
  sesine tek giriş var (`home.tsx`, kodda doğrulandı). İleride ikinci giriş yolu eklenip bayrak
  geçilmezse uyarı **sessizce kaybolur** ve kaybolduğu fark edilmez (bir uyarının yokluğu göze
  batmaz). İkinci giriş yolu açıldığında bu satır hatırlanacak
- **Acil akış incelendi, üç şey doğru:** istek başarısız olsa bile kullanıcı aramadan çıkarılıyor ve
  hata açıkça gösteriliyor (sessiz başarısızlık yok) · Android geri tuşu `closeFeedback`e bağlı ·
  `emergencyPending` bir sonraki `startOrJoin`de sıfırlanıyor, takılı kalıp sonraki aramanın
  gezinmesini kilitlemiyor

### DoD (cihazda — SAHİPTE)
> Tam liste sözleşme §5'te. Kod tarafı (typecheck/lint/kapsam) tamamlandı; cihaz doğrulaması
> YAPILMADI (dev talimatı). En kritik maddeler: genel kanalda kamera uyarısı bir kez çıkıyor mu ·
> yaş-kapılı/DM'de hiç çıkmıyor mu · acil buton kontrolü soluklaştıktan sonra da basılabiliyor mu ·
> "Bağlantı kesildi." mesajı acilde görünmüyor mu.

---

## Sprint R16 — Susturma Durumu Görünür Olsun (D53) — 2026-08-08 🟡 AÇILDI

> Sözleşme: `contracts/SPRINT_R16_VOICE_MUTE_STATE_CONTRACT.md`. Tier: `api/` + `web/`.
> Mobil karşılığı ayrı turda (sözleşme §6).

- [ ] `api`: `voice/participants` yanıtına `mutedUserIds` eklendi (yalnız GUILD_VOICE; DM'de boş),
      var olan alanlar değişmedi
- [ ] `web`: susturulmuş listesi sunucudan hidrate ediliyor → **sayfa yenilendikten sonra da**
      "Susturmayı Kaldır" görünüyor (kusurun kökü buydu: bilgi yalnız oturum belleğindeydi)
- [ ] 🔴 `web`: susturma kalkınca kullanıcı **yeniden bağlanmadan** konuşabiliyor
      (`ParticipantPermissionsChanged` — M4f'te kamera için yazılanın ses karşılığı)
- [ ] 🔴 Kullanıcının kendi mikrofon tercihi ezilmiyor — sunucunun izni geri vermesi "mikrofonunu aç"
      demek değil
- [ ] `voice.listenerOnly` metni düzeltildi (var olmayan karantinayı gerekçe gösteriyordu)

### 🔴 Dev bulgusu — sözleşmenin kendi DoD'u karşılanamıyordu
`serverMutedUserIds` **düz bir Set**'ti (kanal kırılımı yok). Bu, yalnız "yazan tek yol bağlı olduğun
kanaldı" varsayımıyla güvenliydi. Ama `VoiceParticipantList` kenar çubuğunda **her ses kanalı için bir
kez** çiziliyor ve hepsi aynı store'u okuyor → hidrasyon düz Set'e yazılsa bir kanalın susturma
görüntüsü diğerinin etiketine sızardı; tam da bu sprintin düzeltmeye çalıştığı akışı sessizce bozardı.
Dev yapıyı `Record<channelId, Set<userId>>`e çevirdi (aynı dosyadaki `participantsByChannel` deseni).
WS kapısının **anlamı değişmedi**, yalnız depolama kanal-anahtarlı oldu. PM kabul etti: sözleşmenin
"bağlı değilken sustur, etiket doğru olsun" maddesi düz Set'le zaten imkânsızdı.

### PM incelemesi
- `isMuted`e sunucu kaynaklı hiçbir yolun yazmadığını doğruladım (yalnız kullanıcı eylemleri:
  toggle, sağırlaştırma, mikrofon hatası). Yani "kendi tercihini koruma" mantığının dayandığı varsayım
  gerçekten geçerli
- `api` build ✅ · 1033/1033 test ✅ · `vue-tsc` bilinen 6 ✅ · `vite build` ✅ (kendim çalıştırdım)

### DoD (tarayıcıda — SAHİPTE)
> Tam liste sözleşme §5'te. Gerçek kabul testi: **sahibin kilitli kalmış ikinci hesabı bu akışla
> kurtarılabiliyor** (bugün UI'da geri alma yolu yok).

---

## Sprint R16m — Susturma Kalkınca Mobil de Tazelensin — 2026-08-08 🟡 AÇILDI

> R16 §6'nın mobil ayağı. Sözleşme: `contracts/SPRINT_R16_VOICE_MUTE_STATE_CONTRACT.md` §3.2 (web'de
> yazıldı, mobil ayrı tura bırakılmıştı — M4t o sırada aynı dosyalardaydı).
>
> 🔴 **Sahip turu 2026-08-08 bunu ortaya çıkardı:** susturulan hesap MOBİLDE olduğu için, sunucu izni
> geri verse de mobil öğrenmiyor; kullanıcı kanaldan çıkıp girmeden konuşamıyor. Kapsam kararı PM'e ait.

- [x] `ParticipantPermissionsChanged` (yerel katılımcı) → `canPublish` güncelleniyor
- [x] İzin geri geldiğinde mikrofon yeniden yayınlanıyor — **ama kullanıcı kendi isteğiyle
      kapatmışsa açılmıyor** (`isMuted` yalnız okunuyor; web'deki aynı ayrım)
- [x] İzin düştüğünde (susturulma anında) `canPublish=false` yansıyor, gösterge doğru metni veriyor

---

## Sprint R17 — Ses İzinlerinin Sadakati — 2026-08-08 🟡 AÇILDI

> Sözleşme: `contracts/SPRINT_R17_VOICE_PERMISSION_FIDELITY_CONTRACT.md`. Tier `api/` + `web/`;
> `mobile/` diffi sıfır (mobil ayağı M4p sonrası).

- [x] 🔴 `api`: moderasyon uçları izin yazarken `canPublishSources`ı da yazıyor. **LiveKit'te boş
      liste "hiçbiri" değil "HEPSİ SERBEST" demek** — bugün susturup açılan kullanıcıya kanalın
      kuralına bakılmaksızın tüm kaynaklar veriliyor (kamera dahil). UI kusuru bu sızıntıyı gizliyordu
- [x] `web` D51: `setCameraEnabled` publication kontrolü (mobil doğrusu yazılı)
- [x] `web` D52: kamera tarafı izin/unpublish dinleyicisi (R16 yalnız sesi ekledi)

### PM incelemesi (2026-08-08)
- Kaynak hesabı `resolveCanPublishSources` olarak tek metoda çıktı; `mintToken` ve `unmuteParticipant`
  paylaşıyor (kopyalanmadı)
- `updateParticipant`ın **üç** çağrı yerinin hepsi denetlendi: sustur `canPublish:false` (+ boş-dizi
  tuzağını açıklayan uyarı yorumu) · susturmayı kaldır açık liste · yayın-durdur `[MICROPHONE]`.
  Dördüncü çağrı yeri yok
- Webde "kendi kapatmamız" ile "sunucunun kesmesi" ayrımı mobildeki `localCameraStopping` deseniyle
  yapıldı; boş `canPublishSources` istemcide **fail-closed** okunuyor (LiveKit'in "hepsi serbest"
  varsayımı istemcide benimsenmedi — savunma derinliği)
- `api` build ✅ · 1036/1036 test ✅ (3 yeni) · `vue-tsc` bilinen 6 ✅ · `vite build` ✅ (kendim çalıştırdım)

### DoD (SAHİPTE)
> En kritik iki madde: **(1)** sustur→aç sonrası kamera düğmesi çıkıp girmeden geri geliyor ·
> **(2)** kameranın kapalı olduğu genel kanalda sustur→aç sonrası kullanıcı kamera **açamıyor**.

---

## Sprint M4p — Mobil PiP + D44 — 2026-08-08 🟡 AÇILDI

> Sözleşme: `contracts/SPRINT_M4P_MOBILE_PIP_CONTRACT.md`. 🔴 **Native diff var → yeni dev build.**
> M4 fazının son sprinti.

- [x] PiP: çağrı aktifken uygulamadan çıkınca sistem PiP penceresi
- [x] PiP içeriği kompakt: 1-1'de karşı taraf, grup/ortamda **konuşan** kişi; kontrol/metin yok
- [x] PiP'teyken kamera DURMUYOR (M4d §6'nın istisnası); PiP yoksa bugünkü davranış
- [x] FGS tipi `microphone` kalıyor — kamera FGS tipi eklenmiyor (Play beyanı, Discord da girmiyor)
- [x] **D44 zil sesi** bu derlemeye biniyor (kanal v4) — zaten kod tarafında v4'tü (önceki sprint),
      bu derleme yalnız taşıyor, yeni değişiklik yok
- [x] 🔴 MIUI'de PiP izni kapalıyken çökmüyor, bugünkü davranışa düşüyor — native `try/catch` +
      JS senkron okuma ile kod tarafında garanti; gerçek MIUI cihazında görsel doğrulama SAHİPTE
- [x] 🔴 Yerel derleme (`prebuild` + `gradlew`) EAS'tan ÖNCE — `assembleDebug` BUILD SUCCESSFUL

### Cihaz turunda çıkan, BİZİM kusurumuz OLMAYAN hata (2026-08-08)
PiP'e geçince `java.lang.IllegalArgumentException: Cannot coerce value...` ekranı çıkıyor. Yığın izi
`expo.modules.devmenu.fab.FabUtilsKt.calculateTargetPosition` → **Expo dev menüsünün yüzen düğmesi**
("Action button"). Düğme konumunu pencere boyutundan hesaplıyor; PiP penceresi çok küçük olduğu için
aralık tersine dönüyor (`min > max`) ve `coerceIn` patlıyor. Dev menüsü dar pencereyi hesaba katmıyor.

🔴 **Mağaza sürümünde bu bileşen YOK** (`expo-dev-menu` yalnız geliştirme derlemesinde). Kullanıcı
asla görmeyecek.

⚠️ **PM'in ilk önerisi YANLIŞTI:** "dev menüde Action button'ı kapat" dedim, sahip denedi, hata devam
etti. Kaynağı okuyunca sebebi net: `BindingView.kt` `MovableFloatingActionButton`ı **koşulsuz**
compose ediyor; `showFab` yalnız `visible` parametresi (satır 92), yani görünürlüğü kapatıyor ama
konum hesabını durdurmuyor. Hesap `LaunchedEffect(bounds.x, bounds.y)` ile **pencere boyutu her
değiştiğinde** çalışıyor — PiP'e geçiş tam olarak bu. `coerceIn(0f, bounds.x)` çağrısında `bounds`
negatife düşünce aralık boş kalıyor ve Kotlin istisna fırlatıyor. **Ayarla önlenemez.**

**Doğru yol:** PiP doğrulaması `preview` profiliyle yapılır (`eas.json`da mevcut; `developmentClient`
yok → dev menü yok → FAB yok). ⚠️ Preview derlemesi `EXPO_PUBLIC_API_URL`i derleme anında gömer, yani
LAN IP ile derlenirse yalnız o ağda çalışır. **Bize yama YAZILMAYACAK** — Expo'nun paketine yama SDK
yükseltmesinde kaybolur ve gerçek kullanıcıya hiçbir şey kazandırmaz.

---

## Sprint M4g — Mobil Ses Kanalı Ayarları — 2026-08-08 🟡 AÇILDI

> Sözleşme: `contracts/SPRINT_M4G_MOBILE_CHANNEL_SETTINGS_CONTRACT.md`. Tier yalnız `mobile/`;
> sunucu üç alanı zaten kabul ediyor ve döndürüyor, metinler `tr.json`da hazır. Native diff yok.
>
> Sahip Discord mobili açıp ekran görüntüsüyle gösterdi; **oluşturma formu sade kalıyor, ayarlar
> ekranı taşıyor** ayrımı sahibin bulgusu.

- [x] `ChannelSummaryDto`ya `userLimit` · `bitrate` · `mediaEnabled` tiplendi (yeni backend alanı DEĞİL)
- [x] Üç kontrol `channel-edit.tsx`e eklendi; kanal **oluşturma** formu değişmedi
- [x] 🔴 Kanal türü üç çağıran ekrandan da taşınıyor; `type` yoksa ses alanları **çizilmiyor**
      (M4c dersi: route parametresine güvenen ekran, bir çağıran unutunca sessizce yanlış moda düşer)
- [x] `mediaEnabledDesc` açıklaması gösteriliyor (C7 anahtarı — minör dahil kamera açan ayar)

### DoD (cihazda — SAHİPTE)
> Tam liste sözleşme §5'te. Kritik: metin kanalında bu üç alan **görünmemeli**, ses kanalında
> görünmeli; oluşturma formu değişmemeli.

---

## Sprint R18 — Grup DM Menüsü: Düzenle + Grubu Sil — 2026-08-08 🟡 AÇILDI

> Sözleşme: `contracts/SPRINT_R18_GROUP_DM_MENU_CONTRACT.md`. Tier yalnız `web/`; uçlar ve store
> eylemleri hazır, eksik olan tek şey menüden erişim.

- [x] Bağlam menüsüne **Düzenle** (grup ayarlarını açar — yeni modal YAZILMAZ, mevcut panel açılır)
- [x] Bağlam menüsüne **Grubu Sil** (yalnız sahip görür, onaylı, geri alınamaz)
- [x] Etiket "Yeniden Adlandır" değil **"Düzenle"** (sahip kararı — ayar yüzeyi açılsın)
- [x] Yeniden adlandırma/silme mantığı kopyalanmadı, mevcut store eylemleri çağrıldı

---

## Sprint M4i — Kamera Düğmesi Görünür-Kilitli — 2026-08-08 🟡 AÇILDI

> Sözleşme: `contracts/SPRINT_M4I_MOBILE_CAMERA_LOCKED_CONTRACT.md`. Tier yalnız `mobile/`, native
> diff yok. Sahip isteği: "kamera butonu kalkmasın, üstü çizilsin."

- [x] Ortam kanalında `canPublishCamera=false` → düğme çiziliyor ama pasif/üstü çizili
- [x] 🔴 1-1 DM ve grup DM'de **hâlâ gizli** — orada video kapısı YAŞ kapısı, görünür-kilitli düğme
      karşı tarafın minör olduğunu ifşa ederdi (brief §5/G1). Bilinçli ayrım, sadeleştirilmeyecek
- [x] İzin geri gelince düğme kendiliğinden etkinleşiyor (R17 + M4f dinleyicisi besliyor)

### PM incelemesi (2026-08-08)
Panelin açık/kapalı durumu `DmConversation`ın **lokal ref**'iydi, `DmList`ten erişilemiyordu. Dev onu
`useAppShellNav`e taşıdı — aynı dosyadaki 1-1 DM profil paneli deseninin (`rightPanelOpen`) ikizi,
ayrı singleton (iki panel farklı DM tiplerinde bağımsız yaşıyor). `router.afterEach` sıfırlaması da
oraya eklendi; bu yüzden "Düzenle" önce `await router.push` yapıp **sonra** paneli açıyor, yoksa
gezinme paneli hemen kapatırdı. Yapısal ama gerekli bir değişiklik, kabul edildi.
`vue-tsc` bilinen 6 ✅ · `vite build` ✅ (kendim çalıştırdım).

---

## Kanal detayı "18+" yazısı — sahip kararı 2026-08-08
Kanal **listesinde** "18+" yazısı uyarı üçgeniyle değiştirildi (web pariteti). **Kanal detay
ekranındaki** "18+" yazısı **KALIYOR** — sahip cihazda gördü ve sorun görmedi. Orada kullanıcı zaten
bilgi almaya girmiş oluyor, yazı doğru bilgi veriyor. Kapanmış karar, tekrar açılmayacak.

---

## Sprint R19 — Susturma Gerçekten Kessin + D54 — 2026-08-08 ✅ KOD BİTTİ

> Sözleşme: `contracts/SPRINT_R19_MUTE_ENFORCEMENT_CONTRACT.md`. Tier yalnız `api/`.

- [x] 🔴 **Kök neden:** susturma LiveKit'e yalnız **izin** yazıyordu, zaten **yayında olan** track'lere
      dokunmuyordu. Kesilmeleri LiveKit'in yan etkisine bırakılmıştı ve güvenilmez çıktı — aynı gün bir
      turda kesti, ötekinde kesmedi (sahip: "susturdum, hâlâ konuşabiliyor, kamera açık kalıyor")
- [x] `mutePublishedTrack` (SDK'da vardı, hiç kullanılmıyordu) ile yayındaki track'ler zorla kesiliyor:
      **sustur** → hepsi (ses+video+ekran) · **yayını durdur** → yalnız video/ekran, ses kalıyor
- [x] 🔴 **Susturmayı kaldırma zorla AÇMIYOR** — kullanıcı kendi isteğiyle susmuşsa öyle kalıyor;
      regresyon testi bunu koruyor
- [x] **D54** kapandı (bkz. PLAN)
- [x] `api` build ✅ · 1055/1055 test ✅ (PM kendi çalıştırdı) · `web`+`mobile` diffi sıfır

### DoD (SAHİPTE)
- [ ] Sustur → hedefin sesi VE kamerası **anında** kesiliyor
- [ ] Yayını durdur → video kesiliyor, **ses sürüyor**
- [ ] Susturmayı kaldır → kendi isteğiyle kapatmışsa mikrofon **açılmıyor**
- [ ] Kanalda medyayı kapat → o an kamerası açık olanın kamerası **düşüyor** (yeniden bağlanmadan)

---

## Sprint M4j — Mobilde "Taşındın" Akışı (D55) — 2026-08-08 ✅ KOD BİTTİ

> Sözleşme: `contracts/SPRINT_M4J_MOBILE_MOVED_CONTRACT.md`. Tier yalnız `mobile/`, native diff yok.

- [x] `voice.moved` dinleniyor; kaynaktan çıkılıp hedefe katılınıyor
- [x] 🔴 Kopma "Bağlantı kesildi." diye gösterilmiyor (`movePending`, `emergencyPending` ikizi)
- [x] Katılım başarısızsa sunucunun Türkçe sebebi gösteriliyor (sessiz başarısızlık yok)
- [x] 🔴 **PM eki — ters-sıra yarışı kapatıldı:** dev, eski `leave()`in bekleyen `disconnect()`inin
      yeni odanın referansını sıfırlayabileceğini raporladı (gizlemedi, iyi davranış). İki
      `room = null` noktasına kimlik kontrolü kondu — yalnız hâlâ aynı odaysa sıfırlanıyor

### DoD (cihazda — SAHİPTE)
- [ ] Webden mobil kullanıcıyı başka ses kanalına taşı → mobil **hedef kanalda** beliriyor
- [ ] Moderatör hedef kanalda kullanıcıyı **görüyor**
- [ ] "Bağlantın kesildi" uyarısı **çıkmıyor**, taşındığı bilgisi görünüyor
- [ ] Dolu/yaş-kapılı hedefe taşımada kullanıcı **sebebi görüyor**
> ⚠️ Kırmızı konsol kutusu (LiveKit `console.error`) yine çıkabilir — bağlantı gerçekten kopuyor.
> Başarı ölçütü yukarıdaki dört madde; kutu mağaza sürümünde zaten yok.

---

## Sahip doğrulaması 2026-08-08 (akşam) — web yığını kapandı
Sahip webde bakıp onayladı, ayrı ayrı işaretlemeye gerek kalmadı:
- **R18** grup DM menüsü (Düzenle + Grubu Sil) ✅
- **D50** eski mesaj yüklerken ekran zıplaması ✅
- **Taşı alt menüsü** menünün sağında ayrı kutu ✅
- **M4j** taşıma akışı ✅ (hedef kanal adı da sunucudan gelir hâle getirildi)
- **M4i · M4g · M4p · M4t · R17 · R19** cihazda doğrulandı

---

## Sprint M4h — Mobil Ses Moderasyonu — 2026-08-08 ✅ KOD BİTTİ

> Sözleşme: `contracts/SPRINT_M4H_MOBILE_VOICE_MODERATION_CONTRACT.md`. Tier yalnız `mobile/`,
> native diff yok. Sunucudaki dört uç bugüne dek mobilde hiç kullanılmıyordu.

- [x] Arama ekranında katılımcıya dokununca moderasyon alt sayfası (mevcut sheet deseni; yeni altyapı yok)
- [x] Sustur / Susturmayı Kaldır · Yayını Durdur · Taşı · Odadan Çıkar (onaylı)
- [x] 🔴 **D53 tuzağı mobilde tekrarlanmadı:** susturulma durumu eylemin İLK satırında yerel sabite
      alınıyor, sheet kapanışı okumayı etkilemiyor. Ayrıca durum kaynağı ayrıştırıldı —
      `serverMutedUserIds` (kalıcı sunucu susturması) ≠ `mutedUserIds` (LiveKit track mute)
- [x] `mutedUserIds` mobilde tiplendi + WS ile canlı güncelleniyor (R16'da sunucuya eklenmişti,
      yalnız web kullanıyordu)
- [x] Yetki `useGuildPermission` ile; kendine ve ortam sahibine eylem yok; yetkisizde sheet açılmıyor
- [x] `typecheck` + `lint` temiz · `api/`+`web/` diffi sıfır (PM doğruladı)

### Sözleşme sapması (dev bildirdi, PM kabul etti)
`home.tsx`e 3 satır: `startOrJoin`e `guildId` geçiliyor. Sözleşmenin dosya listesinde yoktu ama
yapısal olarak zorunluydu — `call.tsx` guildId almadan yetki kapısı hiç açılamazdı, özellik kalıcı
kapalı kalırdı. Dev bunu gizlemek yerine raporladı.

### DoD (cihazda — SAHİPTE)
- [ ] Yetkili olarak katılımcıya dokun → eylemler görünüyor; yetkisiz hesapta **hiçbiri** görünmüyor
- [ ] Sustur → ses **ve** kamera kesiliyor, etiket "Susturmayı Kaldır"a dönüyor
- [ ] Susturmayı kaldır → gerçekten kalkıyor (webdeki D53 tuzağı tekrarlanmadı)
- [ ] Yayını durdur → video düşüyor, **ses sürüyor**
- [ ] Taşı → hedefe geçiyor; dolu/yaş-kapılı hedefte **sebep** görünüyor
- [ ] Odadan çıkar → onay çıkıyor, sonra hedef odadan düşüyor
- [ ] Kendine ve ortam sahibine eylem görünmüyor

---

## Sprint M5a — Mobil Ses Paneli + Sahne Temizliği + Çaldır — 2026-08-10 (PM compose)

> Sözleşme: `contracts/SPRINT_M5A_MOBILE_VOICE_PANEL_CONTRACT.md`. Tier `mobile/` + `api/` (tek WS
> olayı). Native diff yok → yeni build gerekmez. Kaynak: sahip Discord mobil karşılaştırması.

- [x] Grup DM sahnesinden `pendingMembers` (soluk kart) kaldırıldı; "Tek başınasın" koşulu sadeleşti
- [x] Ses ekranına alt panel (`VoiceContextSheet`) — üç bağlam: 1-1 DM · grup DM · ortam ses kanalı
- [x] Üst bardaki hoparlör ikonu üç noktaya döndü, çıkış seçimi panelin satırı oldu
- [x] Sağırlaştır mobilde ilk kez (web `applyDeafen` hesabı taşındı, `preferDeafened` kapsam dışı)
- [x] `api/`: `voice:group_call_ring` (tek kişiyi çaldır) — mevcut `voice.group_call_started` olayını yayar
- [x] 🔴 Blok kontrolü **çağıran ↔ hedef çifti** için (grupta `requireNoDmBlock` rastgele üye seçiyor)
- [x] 🔴 Hız sınırı: aynı hedefe 60 sn'de 1, aşımda Türkçe mesaj (backend `RATE_LIMITED` — Türkçe mesaj mobil istemcide)
- [x] 1-1 DM'de Çaldır mevcut `voice:call_invite` ile (yeni uç yok)

### DoD (cihazda — SAHİPTE)
- [ ] Grup aramasında seste olmayanların kartı sahnede yok, panelde var
- [ ] Çaldır karşı tarafı çaldırıyor; üst üste basınca sınır mesajı çıkıyor
- [ ] Engellenen kişide Çaldır çalışmıyor, engellenme bilgisi sızmıyor
- [ ] Sağırlaştır ses+mikrofonu kesiyor, kaldırınca eski hâline dönüyor
- [ ] Kanal Ayarları / Davet et yalnız yetkiliye görünüyor

---

## Sprint M5b — Mobilde Ekran Paylaşımını İZLEME — 2026-08-10 (PM compose)

> Sözleşme: `contracts/SPRINT_M5B_MOBILE_SCREEN_VIEW_CONTRACT.md`. Tier yalnız `mobile/`.
> 🔴 Native diff VAR (`expo-screen-orientation`) → yeni dev build; EAS'tan önce yerel derleme şart.
> Telefondan ekran YAYINLAMA kapsam dışı (MediaProjection + ayrı T&S turu).

- [x] `remoteScreenPublications` (kameradan ayrı map); `wireRoom`daki beş kamera noktasına ekran dalı
- [x] `frozenRef` + `leave()` yeni map'i kapsıyor (Fabric çökme sınıfı geri gelmesin)
- [x] Spotlight düzeni: paylaşılan ekran üstte `contain`, katılımcı şeridi altta
- [x] Tek odak kuralı: seçim korunur, yeni paylaşımda odak zıplamaz
- [x] Tam ekran + yatay yalnız o görünümde; `app.json` global `orientation` `portrait` kalır
- [x] Acil buton tam ekranda da erişilebilir

### DoD (cihazda — SAHİPTE)
- [x] Masaüstünden paylaşılan ekran telefonda **görünüyor** (sahip doğruladı 2026-08-10)
- [x] Ekranın **sesi** duyuluyor — kök neden ikiliydi: web `{ audio: true }` vermiyordu (§3.5) VE
      Chrome'un ses kutusu varsayılan işaretsiz geliyor. İkisi de kapandı, sahip doğruladı
- [ ] Kamera + ekran aynı anda karışmıyor (ayrıca sınanmadı, düzen kodu ayrı map kullanıyor)
- [x] Yan çevirince yatay doluyor, geri dönünce uygulama dikey kilitli kalıyor (sahip doğruladı)

### Addendum'lar (cihaz turundan SONRA eklendi)
- [x] §3.4 tam ekran kontrolleri: dokunma yerine düğme, alt çubuk tam ekranda, acil buton çubuğun
      içinde, geri tuşu tam ekrandan çıkarır — **sahip "kusursuz çalışıyor" dedi 2026-08-10**
- [x] §3.5 web ekran sesi yayını (`{ audio: true }`) — kod bitti, ses cihazda henüz doğrulanmadı
- [x] §3.6 PiP paylaşılan ekranı gösteriyor — **sahip doğruladı 2026-08-10**
- [x] Görsel rötuşlar (sahip istekleri): tam ekran düğmesi sağ altta + arka plansız, tam ekran
      kontrollerine saydam zemin, acil buton dolu kırmızı


---

## Yayın engelleyici tur — 2026-08-10 (release derlemesi canlıya karşı)

> Sahip Play kapalı testine göndermeden önce release APK'sını kendi cihazına kurup CANLI sunucuya
> bağlandı. Çekirdek akışların çoğu çalışmadı. Üçü de "geliştirmede çalışıyordu" diye kapanmış
> sayılan işlerdi; ders hafızaya yazıldı ([[release-yapilandirmasi-sinanmali]]).

- [x] 🔴 **Soket release'de hiç bağlanmıyordu** — `io(API_BASE)` prod adresindeki `/api` yolunu
      NAMESPACE sanıyordu. Mesaj alma, arama zili, gelen arama ekranı ve DM önizlemesi bu yüzden
      ölüydü; mesaj GÖNDERME HTTP olduğu için sorun ekranda gizlendi. Origin ayıklanıyor,
      `connect_error` artık denenen adresi de yazıyor
- [x] 🔴 **Yerel release derlemesi LAN adresini gömüyordu** — `eas.json` env'i yalnız EAS'ta
      geçerli. `.env.production` eklendi, pakette doğrulandı (LAN adresi sıfır kez geçiyor)
- [x] 🔴 **Push bildirimleri üretimde kapalıydı** — `EXPO_PUSH_ENABLED` VPS `.env.production`
      dosyasına hiç girmemişti, `push.service.ts` gönderime başlamadan sessizce dönüyordu.
      Bayrak açıldı, API yeniden başlatıldı, konteyner içinde doğrulandı
- [x] Play imzalama altyapısı: kendi upload anahtarımız (depo dışı), `withReleaseSigning` config
      plugin'i, `versionCode`, imza ve gömülü adres pakette doğrulandı
- [x] Marka ikonları: Expo varsayılanları (mavi açılış + şablon ikonu) çıktı; altıgen Canva'daki
      vektörden 1000 piksele büyütülüp üretildi, üç katman + açılış görseli + favicon değişti
- [x] Çocuk güvenliği standartları sayfası canlıda (`/cocuk-guvenligi`) — Play beyan formu için

### Sahip doğrulaması (cihazda, 2026-08-10)
- [x] Mesaj, arama ve bildirimler çalışıyor
- [x] Uygulama ikonu pakete giriyor
- [ ] Play kapalı test sürümü yüklendi ve testçilere açıldı

---

## Play kapalı test hazırlığı — 2026-08-10 ✅ MAĞAZA TARAFI KAPANDI

> Sahip tüm beyanları doldurdu, kontrol panelinde kırmızı madde kalmadı.
> Paket: `versionCode 5` (1, 2, 3 ve 4 tüketildi — Play kullanılan numarayı geri vermiyor).

- [x] Kendi upload anahtarımız + `withReleaseSigning` config plugin'i (parolalar depo dışında)
- [x] `.env.production` (yerel release derlemesi `eas.json`u okumuyor, LAN adresi gömüyordu)
- [x] Marka ikonları: beyaz zemin + turuncu altıgen; açılış ekranı kömür; bildirim küçük ikonu
- [x] Yasal sayfalar canlıda: `/gizlilik` · `/kurallar` · `/cocuk-guvenligi` · `/hesap-silme`
- [x] Asgari hesap silme gerçekten imha ediyor (R6a) + `PURGE_ENABLED=true` üretimde
- [x] Beyanlar: finans yok · sağlık yok · ön plan hizmeti (mikrofon, video kanıtı) · fotoğraf izni
      (uygulama içi ızgara gerekçesi) · oturum açma bilgileri (test hesabı) · hedef kitle 13-15 ·
      veri güvenliği · içerik derecelendirme (13+/12+) · reklam kimliği YOK · çocuk güvenliği standartları
- [x] Mağaza girişi: metinler, 512 ikon, 1024x500 afiş, ekran görüntüleri
- [x] Masaüstü paketleri yayında: `kankaverse.com/indir/kankaverse-setup.exe` · `kankaverse.AppImage`

### Sırada (sahipte)
- [ ] Sürümü incelemeye gönder, kapalı testi 17 kişilik listeye aç
- [ ] 🔴 Google'ın saydığı şey **kesintisiz 14 gün boyunca yüklü kalan 12 testçi** — testçilere
      "silmeyin" demek şart

### Bilerek ertelenenler (PLAN.md borç tablosunda)
- D62 uygulama kapalıyken bildirimden aramayı REDDETME (kabul çalışıyor)
- R6 tam imha (mesaj/dosya/moderasyon kayıtları — KVKK ayağı)
- `SYSTEM_ALERT_WINDOW` izni gerçekten gerekli mi (kütüphaneden geliyor, Play dikkatini çekebilir)
- Çocuk güvenliği sayfasındaki "iş birliği yaparız" ifadesi, Play beyanındaki "yetkililere rapor
  veririz" taahhüdüyle birebir örtüşecek şekilde netleştirilebilir

---

## Sıradaki tur — kapalı test geri bildirimleri (2026-08-10 akşamı, sahip notu)

> İlk kapalı test turundan gelen üç madde. Üçü de `mobile/`. Sprint yarın compose edilecek.

1. **Şifre göster düğmesi mobilde yok** — giriş ve kayıt ekranlarında şifre alanının yanında
   göz simgesi yok; webde var, mobile hiç konmamış. Testçi şikayeti. Kayıt ekranındaki şifre
   tekrar alanı da kapsama girer.
2. **Sesli görüşmedeyken mesaj bildirimi headsup olmuyor** — bildirim geliyor ama yalnız durum
   çubuğunda simge beliriyor, kullanıcı elle aşağı çekmek zorunda kalıyor. Uygulama ÖN PLANDA
   olduğu için bildirim sunumu `setNotificationHandler`ın kararına düşüyor; banner kapalı
   görünüyor. Beklenen: arama ekranındayken gelen mesaj banner olarak düşsün.
3. **Arama ekranındaki sohbet düğmesinde okunmamış rozeti yok** — 1-1 ve grup DM aramasında,
   o DM'e mesaj geldiğinde aksiyon çubuğundaki sohbet (baloncuk) düğmesinin üstünde kırmızı
   bildirim rozeti görünsün. Sohbete girilince temizlensin.

4. **Rail'de ortama uzun basma menüsü yok** — kullanıcı hangi ortamda olduğunu ve birden fazla
   ortamı olduğunu göremiyor, kafası karışıyor (testçi geri bildirimi). Uzun basınca ortam adı +
   sustur + bildirim ayarları paneli açılsın. ✅ `GuildMenuSheet.tsx` mobilde ZATEN VAR, kanal/DM
   satırlarında uzun basma deseni de kurulu — sıfırdan yazılmayacak, rail'e bağlanacak.
   ⚠️ PM notu: uzun basma GİZLİ bir hareket; "hangi ortamdayım" diye kafası karışan kullanıcı onu
   keşfedemez. Menü gerekli ama görünür bir ipucu da gerekebilir, tasarım turunda bakılacak.
5. **Bildirimde eski Expo ikonu görünüyor (koyu temada)** — sahip bildirim gölgesinde açık mavi
   zeminli Expo chevron'unu gördü; açık temada marka ikonu geliyor. 🔬 Dikkat: gördüğü ikon bizim
   ESKİ uyarlanabilir ikonumuzun birebir kendisi (Expo ön planı + `#E6F4FE` zemin), yani bu bir
   koyu/açık tema kusurundan çok **bayat ikon önbelleği ya da eski kurulum** gibi duruyor.
   Doğrulama: v5'i temiz kuran BAŞKA bir cihazda koyu temada bak; hâlâ çıkıyorsa gerçek tema kusuru.

### 🔴 Dağıtım sonrası bayat parça sorunu (KÖK NEDEN, sınıf düzeyinde)
- [ ] Uygulama açıkken dağıtım yapılırsa istemcinin elindeki sayfa ESKİ parça adlarını tutuyor;
      kullanıcı o ana kadar girmediği bir ekrana tıklayınca parça çekilemiyor ve ekran hiç açılmıyor.
      Kullanıcı için tablo "uygulama bozuldu"; hiçbir hata mesajı yok. Masaüstü tepside günlerce
      açık kaldığı için orada KESİN tekrarlar, webde de sekme açık bırakanlarda olur.
      Çözüm: Vite'ın `vite:preloadError` olayını dinleyip sayfayı BİR KEZ yenilemek (kendi kendini
      onaran davranış). ⚠️ Döngü koruması şart: yenileme çözmediyse ikinci kez denenmemeli
      (ör. sessionStorage bayrağı), yoksa uygulama sonsuz yenilenir.
      Sahip cihazında doğrulandı 2026-08-10: "Disable cache" ile ortam ekranı açıldı.

### Masaüstü — ortam ekranına girilemiyor (2026-08-10 gecesi)
- [ ] 🔴 Konsol: `/assets/GuildChannelView-*.js` ve `ChannelPanel-*.js` için `ERR_TOO_MANY_REDIRECTS`
      → `Failed to fetch dynamically imported module`. Sunucu tarafı TEMİZ doğrulandı (aynı dosyalar
      curl ile 200 ve geçerli JS dönüyor, yönlendirme yok). Yani kusur istemcide. İlk şüpheli:
      Chromium'un önbelleğe aldığı kalıcı yönlendirme (bugün Caddy @app listesini değiştirdik).
      Sahip sert yenileme + site verisi temizleme deneyecek; geçmezse Network sekmesindeki
      `Location` başlığına bakılacak. Konsolun sonunda bir de 502 var, aynı turda incelenecek.

---

## Sprint D63 — Bayat Parça Öz-Onarımı — 2026-08-11 ✅ KOD BİTTİ

> Sözleşme: `contracts/SPRINT_D63_STALE_CHUNK_CONTRACT.md`. Tier yalnız `web/`.
> `api/`, `mobile/`, `desktop/` diffi sıfır.

- [x] `web/src/lib/chunkReload.ts` — `vite:preloadError` dinleniyor, sayfa BİR KEZ yenileniyor
- [x] 🔴 Döngü koruması: `sessionStorage` damgası, 15 sn içinde ikinci yenileme YOK
      (yenileme çözmediyse hata toast'ı çıkıyor, sessiz kalmıyor)
- [x] 🔴 **Aramadaki kullanıcı düşürülmüyor** (sahip onayladı 2026-08-11): `connectedChannelId`
      doluysa yenileme ertelenir, bilgi toast'ı çıkar, arama biter bitmez kendi kendine onarır.
      O dalda `preventDefault` çağrılmıyor: gezinme normal yolundan başarısız olsun, kullanıcı
      bulunduğu ekranda kalsın
- [x] i18n: `toast.updateAfterCall` + `toast.chunkLoadFailed` (kodda gömülü string yok)
- [x] `nginx.conf` / `Caddyfile` DEĞİŞMEDİ — önbellek başlıkları zaten doğruydu, kusur istemcide
- [x] `vue-tsc -b` bilinen 6 önceden-var hata (fazlası yok) · değişen dosyalarda lint temiz ·
      `vite build` ✅

- [x] 🔴 **§2.3 addendum (sınamadan SONRA, sahip onayladı):** yenileme aynı adrese değil HEDEFE
      yapılıyor (`location.assign`). İlk hâl `location.reload()` idi ve ölçümde yetersiz çıktı:
      import patlayınca gezinme commit edilmiyor, URL eski ekranda kalıyor, kullanıcı hedefe varmak
      için **ikinci kez tıklamak** zorunda kalıyordu. Hedef `router.beforeEach`te tutuluyor

### DoD — PM davranış sınaması ✅ (2026-08-11, derlenmiş pakete karşı ölçüldü)
Sınama düzeneği: `vite preview`, açık sekme eski `index.html`i tutuyor, kaynak değiştirilip yeniden
derlenerek parça hash'i değiştirildi (gerçek dağıtımın birebir taklidi).
- [x] Eksik parçaya gidilince sayfa kendini bir kez onarıyor (`navType: reload`, damga yazıldı)
- [x] **Tek tıklamayla hedef ekran açılıyor** (`path: /register`, başlık "Hesap Oluştur")
- [x] 15 sn içinde ikinci hata → yenileme YOK, Türkçe toast çıkıyor
- [x] Sonsuz yenileme döngüsü yok (§2.3 değişikliğinden sonra ayrı parçayla regresyon sınandı)
- [ ] 🔬 **Sınanmayan tek dal: §2.2** (aramadayken erteleme + arama bitince onarım). İki hesap +
      canlı ses oturumu gerektiriyor, sahip turunda doğrulanacak

> Geçici sınama değişikliği geri alındı, `dist/` yeniden derlendi, preview sunucusu kapatıldı.

### Ayrı kalem — masaüstü `ERR_TOO_MANY_REDIRECTS` (§7, bu sprintte kod yok)
PM taradı: `desktop/src/main.js` içinde `webRequest`/`onBeforeRequest` türü hiçbir yönlendirme
kancası YOK, sunucu tarafı da temiz doğrulanmıştı. Kaynak istemci önbelleğindeki eski kalıcı
yönlendirme. Öz-onarım semptomu büyük olasılıkla kapatır ama kanıtlanmadı. Sahip turunda hâlâ
görülürse istenecek kanıt: Network sekmesinde `Location` başlığı + aynı turdaki 502'nin isteği.

---

---

## Klavye payı — 3 tuşlu gezinme kusuru (D65) — 2026-08-11 ✅ CİHAZDA DOĞRULANDI

> Tier yalnız `mobile/`. Testçi bildirimi: mesaj kutusunun bir kısmı klavyenin arkasında kalıyor.
> Sahip cihazında sorun yoktu → "benim cihazımda çalışıyor" tuzağının bir örneği daha.

- [x] 🔴 **Kök neden:** `keyboardPad`teki `+ panelGap` (sabit 16) bir tasarım boşluğu değil,
      **gezinme çubuğu payının yerine geçmiş tesadüftü**. Kaydırma kipinde `insets.bottom` da 16
      olduğu için formül doğru görünüyordu; 3 tuşlu gezinmede pay ~47'ye çıkıyor, sabit tepki
      vermiyor, kutu aradaki fark kadar (~31dp) örtülüyordu
- [x] Düzeltme tek satır: `kbGeom.h + theme.layout.panelGap` → `kbGeom.h + insets.bottom`
- [x] Sahip kendi cihazında **gezinme kipini değiştirerek yeniden üretti** — testçiye bağımlı
      olmayan yerel bir üretim kuruldu (ölçüm düzeneği geçiciydi, kaldırıldı)
- [x] 🔬 **Ölçüm bir hipotezi çürüttü:** PM'in ilk önerdiği geometri formülü iki kipte de klavye
      yüksekliğiyle aynı sonucu veriyordu (286.9 / 254.9), yani kusuru hiç kapatmazdı. Kodda
      yazılıydı, ölçülmeden gönderilseydi dördüncü başarısız deneme olacaktı
- [x] `+` düğmesi 8dp sola çekildi (44dp dokunma hedefi korundu) — yazı alanı o kadar genişledi
- [x] `typecheck` + `lint` temiz · `api/`, `web/` diffi sıfır

### Cihaz doğrulaması (sahip, 2026-08-11) — her iki gezinme kipinde
- [x] Kaydırma kipi: örtüşme **0** (pay 303, eskisiyle birebir aynı → regresyon yok)
- [x] 3 tuşlu kip: örtüşme **0** (pay 302.3, eskiden 31 eksikti)
- [ ] Testçinin Redmi Note 9 cihazında doğrulama — yeni sürüm paketi gerekiyor, mobil geri
      bildirim sprintiyle birlikte tek pakete binecek

---

---

## Sprint M5c — Kapalı Test Geri Bildirimleri — 2026-08-11 ✅ KOD BİTTİ

> Sözleşme: `contracts/SPRINT_M5C_MOBILE_TEST_FEEDBACK_CONTRACT.md`. Tier yalnız `mobile/`
> (+ `web/src/i18n/tr.json` iki anahtar — i18n tek kaynak kuralı gereği). Native diff YOK.
> PM sözleşmeyi yazdı, dev oturumu maddeleri tek tek uyguladı, PM iddiaları kaynak koddan doğruladı.

- [x] **§1 Şifre göster** — giriş + kayıt, her alan bağımsız, 44dp dokunma hedefi korundu
- [x] 🔬 **Dev sözleşmedeki hatayı yakaladı:** `register.tsx:173` şifre tekrar değil **davet kodu**
      alanıymış. PM doğruladı, dev haklı. Kayıt ekranında şifre tekrarı hiç yok; **eklenmedi**
      (testçi şikayeti değil, yeni özellik olurdu). İki kullanım için ortak bileşen de çıkarılmadı
      (Rule of Three: ikide bekle)
- [x] **§2 Banner** — kök neden `push.ts` `shouldShowBanner: isIncomingCall` idi, banner yalnız
      gelen aramaya açıktı. Mesaj bildirimleri eklendi; kullanıcı O DM'in ekranındaysa çıkmıyor
      (`activeDmChannelId`, mevcut alan). Ses hâlâ yalnız aramada
- [x] 🔬 PM doğrulaması: `DM_MESSAGE` ve `MENTION` sabitleri `messages.gateway.ts`'te gerçekten
      gönderilen değerler. Yanlış olsalardı banner **sessizce** hiç çıkmaz, ancak testçiden
      öğrenirdik
- [x] **§3 Nokta rozeti** — `CallControls`e `hasUnreadChat`, kaynak `dm` store `unread`. Yeni
      sayaç/store/endpoint yok; sohbete girince kendiliğinden sönüyor
- [x] **§4 Rail uzun basma** — `GuildMenuSheet` rail'e bağlandı
- [x] 🔴 **PM ilk turu REDDETTİ:** uzun basış menüyü açarken kanal panelini de o ortama geçiriyordu.
      Gerekçe kullanıcı tarafı: maddenin varlık sebebi "hangi ortamdayım" karışıklığı, uzun basınca
      habersizce başka ortama düşmek onu artırır (referans uygulama da ortam değiştirmiyor).
      Dev'in "ayrı state kapsam aşan refactor" gerekçesi ölçüldü ve reddedildi — aynı desen
      `menuChannel` olarak dosyada zaten kuruluydu
- [x] 🔴 **PM incelemede dev'in görmediği sessiz kusuru buldu:** rol yalnız SEÇİLİ ortam için
      çekiliyordu. Menü seçimden ayrılınca, ziyaret edilmemiş bir ortama uzun basan ADMIN kendi
      yönettiği ortamda Ayarlar/Davet/Kanal Oluştur'u göremezdi (`canManage` sessizce false).
      Rol çekme effect'i menü ortamını da kapsayacak şekilde genelleştirildi
- [x] **§5 Bildirim ikonu — KOD YAZILMADI (doğru karar).** Asset 288x288, opak piksellerin tamamı
      beyaz, Android alfa kuralına uygun; `app.json` bağı doğru. Dün akşamki commit'le gelmiş, yani
      görülen eski ikon o düzeltmeden önceki kurulum. Uygulama bugün tamamen kaldırılıp yeniden
      kuruldu → yeniden bakılacak
- [x] `typecheck` + `lint` temiz (PM bağımsız koştu) · `web` vue-tsc hâlâ bilinen 6 hata ·
      yeni i18n anahtarlarında kaçırılmamış `@` yok (sayfa boşaltan tuzak)

### DoD (cihazda — SAHİPTE, dev build + Metro hazır)
- [ ] Giriş ve kayıt: göz ikonu şifreyi gösterip gizliyor, alanlar birbirinden bağımsız
- [ ] Sesli görüşmedeyken DM gelince **banner düşüyor**, ses çalmıyor
- [ ] O DM'in sohbet ekranındayken banner **çıkmıyor**
- [ ] Aramada sohbet düğmesinde kırmızı nokta beliriyor, sohbete girince sönüyor
- [ ] Rail'de **seçili olmayan** ortama uzun bas → menü açılıyor, **kanal paneli değişmiyor**
- [ ] Menüden bir eylem (ör. Davet Et) doğru ortama gidiyor
- [ ] Yönettiğin ama hiç açmadığın ortama uzun bas → Ayarlar/Davet görünüyor (ADMIN'de kısa gecikme)
- [ ] Kısa basış ve sidebar başlığına dokunma eskisi gibi
- [ ] Bildirim ikonu: temiz kurulumdan sonra koyu temada marka ikonu geliyor mu

---

---

## Kullanıcı isteği — video yükleme (2026-08-11) — REDDEDİLDİ, gerekçesiyle

> Bir kullanıcı video yükleme istedi. Sahip maliyet/kota endişesiyle temkinli yaklaştı.

- [ ] **Açılmayacak.** Ama gerekçe maliyet DEĞİL, PM notu: R2'de çıkış trafiği ücretsiz, yani
      servis etmek yakmaz. Ücretlenen depolama ve bir kez yüklenen dosya silinene dek yakmaya
      devam eder (telefon videosu 200-500 MB, görselden iki-üç mertebe büyük). Bu çözülebilir bir
      mühendislik problemi.
- [ ] 🔴 **Asıl engel güvenlik:** yüklemeler `SCAN=false` ile açık, hiçbir içerik taraması yok.
      Görselde bu bilinçli kabul edilmiş bir riskti; video o riski kat kat büyütür (hacim, tespit
      zorluğu, barındırabileceği zararın ağırlığı). Play'e verilen çocuk güvenliği beyanıyla da
      çelişir. **Tarama altyapısı gelmeden video açılmaz.**
- [ ] Tartışılabilir ara çözüm (bugün DEĞİL): kısa süre + küçük boyut sınırı (ör. 15 sn / 25 MB),
      yalnız onaylı yetişkinler arası. Sahip karar verirse ayrı sözleşme.

---

## Sprint R20 — enum-ADMIN Katmanı Kaldırıldı — 2026-08-11 ✅ CİHAZDA DOĞRULANDI

> Sözleşme: `contracts/SPRINT_R20_ADMIN_TIER_REMOVAL_CONTRACT.md`. Üç tier paralel.
> 🔴 R7. Sahip iki davranış değişikliğini açıkça onayladı (aşağıda).
> Kaynak: sahip sorusu "yetkileri rol üzerinden yönetiyoruz, rol dışında neden yönetici yetkisi var".

- [x] 🔴 **Kök gerekçe:** iki paralel yetki sistemi vardı. Rol sistemi doğru çalışıyordu, kalıntı
      enum'dan geliyordu. Kodun kendi yorumu bu katmanı zaten "enum geçiş-uyum" diye etiketlemişti
- [x] `permissions.service.ts`e `hasFullAccess` + toplu `guildPrivilegedUserIds` eklendi; "yönetici
      mi" soran her yer buraya bağlandı. 🔴 Hiçbir yerde `role === 'OWNER'`'a İNDİRGENMEDİ —
      indirgenseydi rolüyle yönetici olanlar yetkisiz kalırdı (§0.1)
- [x] 🔴 Dev, sözleşmede olmayan iki yeri kendi buldu: `messages.gateway.ts` özel kanal sızıntı
      kapısı + toplu bahsetme alıcı kümesi. T&S yüzeyi, kaçsaydı özel kanal varlığı sızabilirdi
- [x] `PATCH /guilds/:id/members/:userId/role` ucu + DTO silindi; mobil rol arayüzü kaldırıldı
- [x] Migration iki adımlı (önce veri, sonra tip), yerelde gerçek `ADMIN` kaydıyla sınandı,
      `migrate status` temiz · `build` ✅ · 1070 test ✅
- [x] Mobilde tip daraltıldı (`GuildRole` → OWNER|MEMBER) → derleyici kalan dallanmaları kanıtladı

### Sahip onayladığı davranış değişiklikleri (2026-08-11)
- [x] **ADMINISTRATOR rolü artık özel kanalları görüyor** (önceden kapı doğrudan enum'a bakıyordu,
      bayraklı rol giremiyordu). Gizlilik yüzeyinde bilinçli genişleme
- [x] **ADMINISTRATOR artık hiyerarşinin tepesinde değil**, kendi rol konumuna göre sıralanıyor

### Cihaz doğrulaması (sahip, 2026-08-11) — İKİ YÖN DE
- [x] Yetkisiz kullanıcı ortam ayarlarını **göremiyor** (kalıntı yetki temizlendi, "Yönetici"
      ibaresi gitti)
- [x] 🔴 **Rolle yetki verilmiş kullanıcı kanal/kategori ekleme ve ayarları GÖREBİLİYOR** —
      asıl riskli yön buydu, sessiz regresyon olmadığı doğrulandı

### Borç (PLAN'a yazılacak)
- `guildPrivilegedUserIds`, `effectivePermissions` kuralını ikinci kez uyguluyor (N+1'den kaçınmak
  için). Gerekçe geçerli ama iki uygulama ayrışabilir — bugün kaldırdığımız kusurun doğduğu desen
- İstemci sunucudaki rol hiyerarşisini yansıtmıyor: moderatör üstündeki kişiye at düğmesi görebilir,
  sunucu reddeder (web `MemberPanel.canKick`)
- `api/` tarafında `npm run build` + `npm test`, **spec dosyalarındaki tip hatalarını yakalamıyor**;
  ayrı `npx tsc --noEmit` gerekiyor (webdeki `vue-tsc` dersinin api karşılığı). Dev bu taramayla
  gerçek bir hata buldu, ayrıca `categories.service.spec.ts:408`de önceden var olan bir hata çıktı

---

## Sprint M5e — Bildirim Yığılması + Üstten İnme — 2026-08-11 ✅ CİHAZDA DOĞRULANDI

> Sözleşme: `contracts/SPRINT_M5E_NOTIFICATION_STACKING_CONTRACT.md`. Kaynak: canlı kullanıcı.

- [x] O DM'in ekranındayken bildirim **hiç gösterilmiyor** (M5c yalnız banner'ı kapatmıştı,
      `shouldShowList` açık kaldığı için gölgeye giriyordu)
- [x] Sohbete girince o kanalın bekleyen bildirimleri temizleniyor (M5d odak kancası yeniden
      kullanıldı, yeni yaşam döngüsü kurulmadı)
- [x] Yığılma: istemci JS canlıyken aynı kanalın eskilerini düşürüyor **+ sunucuda `tag` alanı**
      (uygulama tamamen kapalıyken kalan boşluk). `tag` yalnız DM ve bahsetmede; kanka isteği,
      davet, etkinlik bildirimlerine VERİLMEDİ (birbirinin yerine geçmemeli)
- [x] 🔴 **Üstten inme (heads-up) kusuru CİHAZDA ÖLÇÜLEREK çözüldü.** Kanal önemi (4/HIGH), renk ve
      kanal adı doğruydu; `dumpsys` `sound=null defaults=0x0 groupKey=silent` gösterdi. Android
      sessiz sunulan bildirimi üstten İNDİRMİYOR. Sebep bizim `shouldPlaySound: isIncomingCall`
      kararımızdı — "görüşmede ses rahatsız eder" varsayımı, bedeli "sessiz = görünmez" çıktı
- [x] Sahip kararı: mesajda da ses açık. Gerekçe: bizim push hacmimiz zaten düşük (ortam
      kanallarında yalnız bahsetme push ediliyor, Discord gibi her mesaj değil), rahatsız olan
      kullanıcı sohbeti kendi susturur
- [x] Sahip doğrulaması: uygulama açıkken, başka DM'deyken ve **sesli görüşmedeyken** bildirim
      üstten iniyor, yığılma yok, o DM'in ekranındayken hiç gelmiyor

---

## Canlı kullanıcı geri bildirimi — bildirim yığılması (2026-08-11 öğlen)

> Kaynak: canlıdaki bir kullanıcı, mağaza sürümü (`versionCode 5`). Ekran görüntüsüyle geldi.
> 🔬 Yan bulgu: o ekran görüntüsünde **bildirim ikonu bizim turuncu altıgen**. Yani ikon mağaza
> sürümünde DOĞRU; sahibin cihazındaki Expo simgesi geliştirme paketine özgü (bkz. ikon maddesi).

- [ ] 🔴 **Bildirimler üst üste yığılıyor** — her mesaj yeni bir bildirim kaydı açıyor, yedi mesaj
      yedi satır. Beklenen (WhatsApp): aynı sohbetin bildirimi öncekinin ÜSTÜNE yazsın, tek satır
      kalsın. Bugün ne istemci ne sunucu tarafında sabit bir bildirim kimliği var
      (`push.service.ts` payload'ında böyle bir alan yok).
      ⚠️ Çözüm yolu **doğrulanmadan yazılmayacak**: sunucu tarafında birleştirme kimliği mi
      gönderilecek, yoksa istemci veri-yalnız push alıp bildirimi sabit kimlikle kendisi mi kuracak?
      İkincisi D62'deki aynı ödünleşmeye giriyor (uygulama tamamen kapalıyken agresif pil
      optimizasyonlu cihazlarda çalışacağının garantisi yok). Expo SDK 54 dokümanı okunmadan karar
      verilmeyecek (`mobile/AGENTS.md` kuralı).
- [ ] 🔴 **Kullanıcı O DM'in ekranındayken bile bildirim geliyor** — M5c §2 banner'ı bastırıyor ama
      `shouldShowList: true` olduğu için bildirim yine gölgeye düşüyor. O durumda **hiç
      gösterilmemeli** (banner da liste de kapalı). Tek satırlık değişiklik ama M5c'nin eksik kalan
      yarısı; o sprint yalnız banner'ı düşünmüştü.
- [ ] Sohbete girilince o kanalın bekleyen bildirimleri **temizlensin** (WhatsApp davranışı).
      Yukarıdaki iki maddeyle aynı aileden, birlikte ele alınmalı.

---

---

## Sürüm paketi v6 — cihazda canlıya karşı doğrulandı (2026-08-11)

> `versionCode 6`, yerel `bundleRelease` + `assembleRelease`. Sahip release APK'sını kendi
> cihazına kurup CANLI sunucuya karşı denedi (release-yapilandirmasi-sinanmali dersi uygulandı).

- [x] Paket doğrulaması (PM, derleme sonrası): gömülü adres `https://kankaverse.com/api`,
      **LAN adresi sıfır kez** geçiyor, `versionCode=6`
- [x] Bugünkü işlerin pakette olduğu anahtar bazında doğrulandı (`showPassword`, `hidePassword`,
      `updateAfterCall`, `chunkLoadFailed`)
- [x] **Sahip: yapılan tüm değişiklikler APK'da sorunsuz çalışıyor**

### 🔬 Bugünün üç yanlış alarmı — üçü de aynı kökten
Kod suçsuzdu, ortam doğrulanmamıştı. Bir sonraki sürüm turunda ÖNCE bunlara bak:
1. **Dünkü APK kuruldu** (dosya tarihi kontrol edilmemişti) → "değişiklikler yok" sanıldı.
   `gradlew clean` bu projede ZARARLI (RN kütüphanelerinin üretilmiş native kodunu siliyor,
   derleme patlıyor); eski çıktı şüphesi varsa `clean` değil **dosya tarihine** bak.
2. **Bildirim izni verilmemişti** (`POST_NOTIFICATIONS granted=false`) — tam kaldırma sonrası
   Android izni sıfırlıyor. Belirti aldatıcı: telefon TİTRİYOR ama bildirim yok, çünkü titreşim
   uygulamanın kendi zili, bildirim ayrı katman. İzin akışının kendisi sağlam (veri silinip
   yeniden girilince diyalog çıktı, testçilerde çalışacak).
3. **PM yanlış desenle aradı**: paket i18n metinlerini kaçışlı sakladığı için düz Türkçe arama
   "yok" sonucu verdi. Anahtar adıyla aranmalı.

### Açık kalan metin kararı (sahip cevaplamadı)
- [ ] Mobilde arama reddedilince `mobile.call.unreachable` "Şu anda ulaşılamıyor." diyor. PM görüşü:
      reddedildi bilgisi GÖSTERİLMEMELİ (reddeden kişiyi ifşa eder, rahatsız edici kullanıcıya
      "oradaydı, gördü, istemedi" sinyali verir — T&S ilkesi "mağdura çıkış yolu"). Ama mevcut metin
      yanlış yönlendirici: teknik arıza/çevrimdışı ima ediyor. Öneri: **"Cevap alınamadı."** — hem
      reddi hem cevapsızlığı hem gerçek bağlantı sorununu dürüstçe kapsar, kimseyi ifşa etmez.
      Tek i18n anahtarı, ama yeniden derleme gerektirir (~7 dk).

---

## Revize turu son eklemeler — 2026-08-11 (akşam)

- [x] **Bildirim izni görünürlüğü.** `readExpoPushToken` izin reddedilip Android "bir daha sorma"
      bayrağı düşünce sessizce `return null` yapıyor. Bu davranış BİLİNÇLİ ve korundu (ısrar yok).
      Eksik olan görünürlüktü: sahip bugün İKİ KEZ "push bildirimler gitmiş" diye kod aradı, halbuki
      izin kapalıydı. Bildirimler sekmesine, yalnız izin kapalıyken çıkan uyarı şeridi + sistem
      ayarlarını açan düğme eklendi (odakta tazeleniyor, izin verilip dönülünce kendiliğinden kayboluyor)
- [x] **Sistem bildirim ayarları kısayolu** (`me.tsx`) — şerit yalnız izin kapalıyken çıkıyor, bu satır
      HER ZAMAN duruyor: kullanıcı izin açıkken de ses/titreşim ayarını değiştirmek isteyebilir
      (sahip talimatı, Discord referansı)
- [x] **DM gizlilik ayarı (`dmPolicy`) mobile geldi.** Webde vardı, API destekliyordu
      (`PATCH /users/me`), i18n metinleri hazırdı; mobilde HİÇ yoktu, yani mobil kullanıcı "bana
      kimler mesaj atabilir" ayarını değiştiremiyordu. Yeni uç/store/bağımlılık YOK.
      🔬 Dev, `SelectSheet` yerine açıklamalı seçenek kartı deseni seçti: "Herkes" aslında doğrudan
      sohbet açmıyor, mesaj isteğine düşürüyor — açıklamasız bir gizlilik ayarı yanlış anlaşılır
- [x] **Arama reddedilince doğru metin.** Mobil reddi genel `unreachable` kovasına atıyordu
      ("Şu anda ulaşılamıyor" — teknik arıza ima ediyor). 🔬 PM ilk önerisi "reddi hiç gösterme"ydi
      ve YANLIŞTI: web bu ayrımı zaten yapmış, `call.rejected` düz reddi söylüyor, `call.unreachable`
      ise engellenme/ilişki durumunu SIZDIRMAMAK için nötr kalıyor. Mobil web'in anahtarını kullanıyor.
      Ayrıca `unreachable` dört yerde paylaşılıyordu; metni değiştirmek üç yeri bozardı

### Discord ayar listesi karşılaştırması (sahip 2026-08-11) — sonuç
Sahip Discord mobil ayarlarının ekran görüntülerini getirdi. PM envanteri: **bizde karşılığı olup
mobilden ulaşılamayan TEK madde `dmPolicy`'ydi**, o da eklendi. Eklenmeyenler ve sebepleri:
- **Genel bildirim ayarı:** bizde yok, tercihlerimiz ortam/kanal bazlı ve zaten ulaşılabilir. Üst
  seviye ekran yeni özellik olurdu
- **Ses · Görünüm · Erişilebilirlik · Dil · Web Tarayıcısı · Uygulama Simgesi · Gelişmiş:** hiçbirinin
  arkasında bizde ayar yok → boş yüzey açılmaz (`mobile/CLAUDE.md` kuralı)

### 🔴 Yeni bulgu — ekran paylaşımında görüntü takılıyor (İNCELENMEDİ)
- [ ] Sahip bir arkadaşına ekran paylaştı: **ses net, görüntü hafif takılıyor**. Sesin temiz olması
      ağ/bant genişliği sorununu tek başına elemez ama video yayın ayarlarını birinci şüpheli yapar
      (çözünürlük, kare hızı, bit hızı, simulcast/adaptive stream). Ölçülmeden dokunulmayacak:
      LiveKit yayın parametreleri + gerçek bir oturumda istatistik. Tek kullanıcı raporu, tek ölçüm
      yok — bugünün dersi gereği ikinci bir gözlem ve gerçek ölçüm olmadan ayar değiştirilmeyecek

---

## 🔬 Bildirim tekilleştirmede yapısal sınır (2026-08-11, kayda geçti, ÇÖZÜLMEDİ)

> Sahip bulgusu, sürüm paketi turunda. `tag` alanını eklediğimiz için ortaya çıktı; öncesinde her
> mesaj ayrı satır olduğundan görünmüyordu. Sahibin teşhisi doğruydu, PM doğruladı.

**Belirti:** Aynı sohbetten en fazla İKİ bildirim yan yana kalabiliyor. Uygulama içinden mesaj
gelince biri, dışarıdan gelince öteki tazeleniyor; biri diğerinin yerine geçmiyor.

**Kök neden:** İki yol, Android'in gözünde iki farklı kimlik.
- Ön planda bildirimi BİZ kuruyoruz (`expo-notifications`). İstemci SDK'sı bildirime `tag`
  atamayı SUNMUYOR (SDK 54 doğrulandı) → etiketsiz.
- Arka planda/kapalıyken bildirimi FCM kuruyor ve sunucudaki `tag = channelId` alanını kullanıyor.
- Android yer değiştirmeyi `(tag, id)` çiftine göre yapıyor → etiketli, etiketsizin yerine geçmez.

**Neden bugün çözülmedi (PM kararı, sahip onayladı):**
- İstemciye etiket verilemiyor (SDK sınırı).
- Sunucuyu veri-yalnız push'a çevirip bildirimi her durumda istemcinin kurması tek aile yaratırdı
  AMA D62 ödünleşmesine giriyor: uygulama tamamen kapalıyken agresif pil optimizasyonlu cihazlarda
  (Xiaomi/Huawei) çalışacağı garanti değil ve bugün ÇALIŞAN bildirim yolunu riske atar.
- Kalıntı sınırlı: en fazla BİR eski bildirim kalıyor, üst üste yığılma geri gelmiyor. Kullanıcı o
  sohbete girince o kanalın bekleyenleri zaten temizleniyor (M5e §2) → kalıntı ilk açılışta yok oluyor.

**Tetikleyici (ne zaman yeniden ele alınır):** testçilerden şikayet gelirse, ya da veri-yalnız push'a
başka bir sebeple (ör. D62 arama reddetme) zaten geçilecekse aynı turda çözülür.

### Ayrıca netleşen davranışlar (kusur DEĞİL, sahip sordu, PM doğruladı)
- **Rail DM rozeti okunmamış DM SAYISINI sayıyor, mesaj sayısını değil** (`useDmUnreadCount`:
  `dmChannels.filter(c => c.unread).length`). DM verisi sunucudan `unread: boolean` geliyor, sohbet
  başına sayaç yok. Mesaj sayısı istenirse backend'in DM başına okunmamış sayısını dönmesi gerekir →
  yeni alan + yeni hesap, yani yeni özellik. Karar sahipte, bugün yapılmadı.
- **Ortam rozeti:** bahsetme kırmızı ve sayılı, normal mesaj beyaz nokta. Bilinçli: ortam
  kanallarında yalnız bahsetme push ediliyor, normal mesaj yalnız görsel işaret bırakıyor.

### Tasarım kararları (sahip onayladı 2026-08-10 akşamı)
- Rozet **NOKTA** olacak, sayı değil. Arama ekranı zaten kalabalık; orada gereken bilgi "yeni bir
  şey var", kaç tane olduğu değil. Sayıyı merak eden zaten sohbete giriyor.
- Banner, kullanıcı O DM'in sohbet ekranındayken ÇIKMAZ (okuduğu mesaj için bildirim almasın);
  arama ekranındayken çıkar, çünkü sohbet görünmüyor.

---

## Sprint M6a — Mobil sohbet baloncukları — 2026-10-02

> Sözleşme: `contracts/SPRINT_M6A_MOBILE_CHAT_BUBBLES_CONTRACT.md`. Yalnız `mobile/`, saf JS.
> Sıra (sahip onayı 2026-10-02): M6a baloncuk → M6b sesli mesaj → M6c video.

- [x] §1 `bubbleOwn` token
- [x] §2 sağlı sollu düzen + `showIdentity` prop (1-1 DM false, grup DM/kanal true)
- [x] §3 baloncuk içi sıra + meta satırı + tepkiler dışarıda
- [x] §4 kendi baloncuğumda Kor çakışmaları
- [x] §5 regresyon listesi korunuyor
- [x] §6 typecheck + lint temiz
- [x] Emülatör turu (sahip + PM) — emülatör belleği yetmedi, doğrudan cihazda yapıldı
- [x] Cihaz turu (sahip) — 2026-10-02 onaylandı. Açık öneri: kısa mesajda saati metnin yanına almak (sahip yanıtlamadı)

---

## Sprint M6b — Sesli mesaj — 2026-10-02

> Sözleşme: `contracts/SPRINT_M6B_VOICE_MESSAGES_CONTRACT.md`. Sıra: api → mobile + web (paralel).

- [ ] §1.1 `Attachment.durationMs` + migration (yerelde uygulandı)
- [x] §1.2 presign: ses türleri + `durationMs` + 5 dk sınırı
- [x] §1.3 ek-yalnız önizleme metni (DM push + DM listesi)
- [x] §1.4 api testleri
- [x] §4 mobil kayıt + oynatıcı
- [x] §5 web kayıt + oynatıcı
- [x] §6 tip/lint/build temiz (üç tier)
- [x] Cihaz/tarayıcı turu (sahip + PM) — 3 tur, 2026-10-02 onaylandı. 1. tur 2026-10-02: kayıt çalışıyor; oynatıcı tasarımı revize (§7), e-posta uyarı metni yanlış (§7.5)
- [x] §7.1 api `waveform`
- [x] §7.2-§7.5 mobil
- [x] §7.2-§7.5 web
- [x] §8 mobil: bitince dur, tek ses, otomatik geçiş (2. cihaz turu bulguları)
- [x] §8 web: kayıt kaldırıldı + aynı oynatma kuralları

---

## Sprint M6c — Video gönderme — 2026-10-02

> Sözleşme: `contracts/SPRINT_M6C_VIDEO_MESSAGES_CONTRACT.md`. api → mobile + web. Mobilde yeni native
> paket: yeni dev build şart. Mağaza sürümü bu sprint sonunda (M6a + M6b mobil ile birlikte).

- [x] §1 api: video türleri, thumbnail/width/height, 60 sn sınırı, önizleme, testler
- [x] §3.1 mobil paketler + uyumluluk teyidi
- [x] §3.2-§3.4 mobil seçme, sıkıştırma, kart, oynatıcı
- [x] §3.5 yerel prebuild + assembleDebug
- [x] §4 web yükleme, kart, oynatma
- [x] §5 tip/lint/build temiz
- [x] Cihaz turu (sahip + PM) — 2026-10-02 mobil + masaüstü onaylandı
- [x] Mağaza sürümü — versionCode 22, release APK canlıya karşı cihazda denendi, AAB sahip tarafından Play'e yüklendi (2026-10-02). R8 (D68) bilerek dahil edilmedi: sürüm iki yeni native paket taşıyor

## Sprint C13 — Hareketli avatar ve profil afişi — 2026-10-26

> Sözleşme: `contracts/SPRINT_C13_ANIMATED_PROFILE_CONTRACT.md`. api → web → mobil. R7: takedown + işleme hattı
> diff'i sahibe sunulur. Mobil native ayar taşır: yerel derleme şart.

- [x] §1 şema + migration uygulandı
- [x] §2.1 yapılandırma + Dockerfile ffmpeg
- [x] §2.2-§2.3 presign + işleme endpoint'leri + ffmpeg hattı (güvenlik kuralları)
- [x] §3 statik yol hareketli alanı null'luyor
- [x] §4 R7 `MEDIA_REMOVE` iki alan
- [x] §5 web: GIF + video kesit akışı + gösterim
- [x] §7 tip/lint/build/test temiz (api 1145 test, nest build; web vue-tsc -b bilinen 6, vite build)
- [x] R7 insan incelemesi (sahip) — 2026-10-26 onaylandı
- [x] Sahip canlı test (web, yerel) — 2026-10-26: GIF avatar + afiş, videodan avatar + afiş, oynatma, tüm maddeler geçti
- [x] §6 mobil: native ayar, seçme, kesit, gösterim, yerel derleme — 2026-10-26 cihaz turu geçti (afiş önizleme taşması textureView ile düzeltildi)
- [x] Cihaz turu + mağaza sürümü — C13b/C15 ile çıktı (versionCode 25-26), vc26 Play incelemesinden geçti (2026-10-27)

## Sprint C13b — Avatar ve afişte konumlandırma — 2026-10-26

> Sözleşme: `contracts/SPRINT_C13B_MEDIA_POSITIONING_CONTRACT.md`. api → web + mobil. Mobil yalnız JS.
> Mağaza sürümü (versionCode 25) bu sprintle çıkar.

- [x] §2 api: crop + oran düzeltmesi + sharp görsel girişi + ffmpeg crop filtresi + testler
- [x] §3 web: MediaPositioner + tek modal (390/320 ölçümü sahipte)
- [x] §4 mobil: MediaPositioner
- [x] §5 build/test temiz (api 1168 test + Docker sharp; web vue-tsc -b bilinen 6 + vite build; mobil typecheck + lint)
- [x] R7 insan incelemesi (sahip) — 2026-10-26 onaylandı
- [x] Sahip canlı test (web) + cihaz turu (mobil) — 2026-10-26 yerel API, tüm maddeler geçti
- [x] Mağaza sürümü — versionCode 25 release APK canlıya karşı cihazda denendi (giriş, soket, konumlandırma, hareketli avatar), AAB sahipte Play yüklemesi için (2026-10-26)

## Sprint C15 — Sohbet medyasını indirme — 2026-10-26

> Sözleşme: `contracts/SPRINT_C15_MEDIA_DOWNLOAD_CONTRACT.md`. api → web + mobil. Mobil yalnız JS.

- [x] §1 api: `download=1` + güvenli dosya adı + testler
- [x] §2 web: ortak indirme yardımcısı + video kartı simgesi
- [x] §3 mobil: galeriye kaydet (görsel + video)
- [x] §4 build/test temiz (api 1181 test; web vue-tsc -b bilinen 6 + vite build; mobil typecheck + lint)
- [x] R7 insan incelemesi (sahip) — 2026-10-26 onaylandı
- [x] Sahip turu (web + masaüstü + mobil) — 2026-10-26 hepsi geçti (masaüstü canlıda)
- [x] Mağaza sürümü — versionCode 26 release APK canlıya karşı cihazda denendi (galeriye kaydet), AAB sahipte Play yüklemesi için (2026-10-26)

## Sprint C16 — Hareketli avatar: DM paneli + mesaj hover — 2026-10-26

> Sözleşme: `contracts/SPRINT_C16_ANIMATED_AVATAR_SURFACES_CONTRACT.md`. api → web. Mobil kapsam dışı.

- [x] §1 api: yazar select'i tek sabit + avatarAnimatedUrl (REST + WS)
- [x] §2 web: DM paneli + mesaj avatarı hover
- [x] Sahip turu (web, yerel) — 2026-10-26 DM paneli + hover (1-1 DM, grup DM, kanal, yeni mesaj) geçti
- [x] §3b ek: üye listeleri (ortam paneli + grup DM katılımcıları) hover'da hareketli — sahip kararıyla elle test edilmeden deploy (2026-10-26); tsc + 1183 test + vue-tsc temiz

## Sprint C17 — Huni paneli — 2026-10-27

> Sözleşme: `contracts/SPRINT_C17_FUNNEL_PANEL_CONTRACT.md`. api → web. Şema yok, mobil yok, R7-nötr.
> Taban çizgisi (elle sorgu 2026-10-27): kayıt 49 → ortam 17 → mesaj 15; son 7 gün aktif 8.

- [x] §1 api: `GET /admin/funnel` + DTO + testler
- [x] §1 api: sorgu yerel DB'de çalıştırıldı, elle sayımla tutarlı
- [ ] §2 web: Huni alt sekmesi + kohort seçici (kod bitti; 390/320 ölçümü sahip turunda)
- [x] §3 build/test temiz
- [ ] Sahip turu (canlı) — 2026-10-27 deploy edildi (6fa3f4f), uç canlıda

## Sprint C18 — Karşılama ve mobil Keşfet — 2026-10-27

> Sözleşme: `contracts/SPRINT_C18_WELCOME_DISCOVER_CONTRACT.md`. mobil + web, api yok, R7-nötr.
> Taban: mobilden gelenlerin %10'u ortama giriyor (web %50). Otomatik katılma yok.

- [x] §1 mobil: discovery api + Keşfet ekranı
- [x] §1 mobil: AddGuildSheet girişi + ortamsız ana ekran öneri bloğu
- [x] §2 web: Keşfet kutucuğu + öneri bloğu + ortak katılma composable'ı
- [x] §3 build/test temiz
- [x] Sahip turu (mobil dev build) — 2026-10-27 geçti. ⚠ reşit olmayan hesapta 18+ süzmesi bu turda ayrıca teyit edilmedi (sunucu tarafı, C6'dan beri testli)
- [x] Sahip turu (web) — 2026-10-27 geçti (masaüstü ve 390/320 ölçümü ayrıca bildirilmedi)
- [x] Mağaza sürümü (versionCode 27) — release APK canlıya karşı cihazda geçti (giriş, DM + bildirim, Keşfet, hareketli simge/afiş), AAB sahipte Play yüklemesi için (2026-10-27)
- [ ] 2 hafta sonra huni panelinde mobil ortama girme oranı

## Sprint C19 — Ortam simgesi ve afişi: hareketli + konumlandırma — 2026-10-27

> Sözleşme: `contracts/SPRINT_C19_GUILD_ANIMATED_MEDIA_CONTRACT.md`. api → web + mobil. R7: takedown + işleme hattı.
> Ön koşul (acil önlem, ayrı commit): ham GIF ortam simgesi Android'de uygulamayı çökertiyordu → ikon allowlist'inden GIF çıkarıldı.

- [x] §1 şema + migration, `migrate status` temiz
- [x] §2 api: uçlar + DTO + takedown + veri onarımı + testler
- [x] §3 web: akış + gösterim
- [x] §4 mobil: akış, SVG yüzeyleri statik
- [x] build/test temiz
- [x] R7 insan incelemesi (sahip) — 2026-10-27 onaylandı; imha işine hareketli avatar/afiş temizliği eklendi (sahip onayı)
- [x] Sahip turu web + mobil (yerel) — 2026-10-27 geçti, GIF'ler oynuyor
- [ ] vc26 (Play) ile hareketli simgeli ortamda çökme yok — canlı deploy sonrası
- [x] Tur revizeleri (sahip, 2026-10-27): kendi kartında avatar hover · "Ortamlarım" kartları hover'da oynar · Keşfet'te üye kartının tamamı tıklanır ("Git" düğmesi kalktı) · mobil seçili simgede harf titremesi giderildi (statik altta, hareketli onLoad ile üstte) · mobil Keşfet rayda pusula ("+" menüsünden çıktı) · mobil Keşfet tek sütun afişli kart · mobil DM panelinde yatay kanka şeridi (statik avatar + durum noktası) · "Sunucuya Git" → "Ortama Git"
- [x] §7 ek: ray/Keşfet/öneri hareketli (web + mobil)
- [x] Mağaza sürümü (C18 ile birlikte versionCode 27) — 2026-10-27

## Sprint C20 — Cihazlar arası okundu senkronu — 2026-10-27

> Sözleşme: `contracts/SPRINT_C20_CROSS_DEVICE_READ_CONTRACT.md`. api → web + mobil. Şema yok. vc27'ye girer.
> Kök sebep: DM'de göndermek gönderenin `lastReadAt`ini ilerletmiyordu. Ortam kanalında kusur yok.

- [x] api: göndermek DM işaretçisini ilerletiyor + `read:self` yayını + testler (1204 test)
- [x] web + mobil: `read:self` ve kendi `dm.message`'ım unread düşürüyor; mobilde açık uygulamada bildirim temizleniyor
- [x] build/test temiz (api tsc bilinen 2; web vue-tsc bilinen 6 + vite build; mobil typecheck + lint)
- [x] PLAN D62 dördüncü gerekçe
- [x] Sahip turu (iki cihaz, yerel) — 2026-10-27 geçti
