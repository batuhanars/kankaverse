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
