# SPRINT C39: Masaüstünde Kick bağlama, yapay zeka erişim notu, profil avatarını büyütme

> Durum: **SÖZLEŞME YAZILDI + SAHİP ONAYI (2026-10-30).** PM compose (Opus). **api (küçük) + web + mobil.** R7 yok
> (§1 yalnız istemci gezinmesi; OAuth kapıları C36'daki gibi sunucuda, değişmez. §2 erişim kapısı `canUseAiVideo` DEĞİŞMEZ).

---

## §1 Masaüstünde Kick bağlama (web)
**Kusur:** masaüstü uygulamasında Bağlantılar > Kick, `window.location.assign` ile Kick giriş sayfasını uygulama penceresinin
içinde açıyor; Kick girişten sonra ekran kararıyor (sahip, 2026-10-30).
1. `ConnectionsSection.vue`: masaüstünde (`window.kankaverse` var) bağlama adresi `window.open(url, '_blank')` ile açılır. Electron'un
   `setWindowOpenHandler`'ı (`desktop/src/main.js:277`) dış adresi sistem tarayıcısına gönderir. **Masaüstü kodu değişmez.**
   Tarayıcıda (web) bugünkü `location.assign` kalır.
2. Masaüstünde düğmeye basınca bilgi bandı: "Bağlantıyı tarayıcında tamamla, sonra buraya dön." Pencere tekrar odaklanınca
   (`focus` / `visibilitychange`) bağlı hesaplar listesi yeniden çekilir; yeni hesap gelince bant "bağlandı"ya döner.
3. Akış tarayıcıda biter, kimlik C36 §2.3 gereği state'ten gelir: tarayıcıda Kankaverse oturumu olmasa da bağlama tamamlanır.
   Tarayıcının son yönlendirmesi (`/settings/connections?link=...`) giriş sayfasına düşebilir; kabul edilir (dev davranışı raporlar).
4. Dev, `desktop/src/main.js`'te uygulama içi gezinmeyi (`will-navigate`) inceleyip karartmanın nedenini kısaca raporlar; düzeltme
   yine §1.1 (dışarıyı tarayıcıya atmak).

## §2 Yapay zeka video kilitli notu (api + web + mobil)
1. **api:** yapılandırma `AI_VIDEO_ACCESS_INVITE_CODE` (varsayılan: sahibin verdiği "Kankaverse Belediyesi" ortamının süresiz davet
   kodu, `configuration.ts`'te sabit; env ile ezilebilir). `GET /ai-video/options` cevabına `accessInviteCode: string | null`
   (yalnız `allowed=false` iken dolu). Kod geçersiz/süresi geçmişse istemci yine notu gösterir, düğme davet ekranının kendi hatasını gösterir.
2. **Metin** (`tr.json`, web + mobil):
   - Not: "Yapay zeka ile video şu an yalnız davetli kullanıcılara açık. Erişim için Kankaverse Belediyesi ortamına katılıp
     yöneticilerle görüşebilirsin."
   - Düğme: "Ortama katıl". `accessInviteCode` yoksa düğme yok, not eski metne döner ("yakında herkese açılacak").
3. **Web:** düğme `/invite/:code` rotasına gider (mevcut davet akışı), yapay zeka penceresi kapanır.
   **Mobil:** mevcut davet/ortama katılma akışına (`join-guild` ya da davet kodu işleyen ekran; dev bulur) kodla gider.
4. Minör bu yüzeyi zaten görmez (C33 §0.1), değişmez.

## §3 Profil avatarını büyütme (web + mobil)
1. Profil yüzeylerinde (web: `UserCardPopover.vue`, `FullProfileModal.vue`, `DmProfilePanel.vue`; mobil: profil sayfası
   `ProfileSheetBody.tsx`; dev render edilenleri teyit eder) **büyük avatara** tıklayınca/dokununca tam ekran görüntüleyici açılır.
   Avatar yoksa (varsayılan simge) tıklanmaz.
2. Görüntüleyici: koyu arka plan, ortada avatar en büyük kaynak boyutunda (ekrana sığacak, büyütmeden); hareketli avatar varsa
   (`avatarAnimatedUrl`) hareketli gösterilir. Kapatma: arka plana tıklama, Esc, kapat düğmesi; mobilde geri tuşu ve aşağı kaydırma
   (mevcut medya görüntüleyicide varsa). **Mevcut sohbet görsel görüntüleyicisi varsa yeniden kullanılır** (web ve mobil; dev bulur,
   yoksa küçük ayrı bileşen). İndir düğmesi YOK (başkasının avatarı).
3. Daire kırpma yok: görüntüleyicide avatar kare/özgün oranında gösterilir. Sunucuda saklanan en büyük boyutu dev raporlar
   (küçükse bulanık görünür; bu sprintte yükleme boyutu değişmez).
4. Mesaj satırındaki küçük avatarlara dokunulmaz (onlar profil kartını açar).

## §4 DoD
- api: ilgili jest + tam koşu, build, eslint (değişen). web: `vue-tsc -b` (bilinen 6), `vite build`, eslint (değişen). mobil: tsc + lint,
  versionCode **41 kalır**.
- **Sahip turu:** masaüstünde Kick bağla → tarayıcı açılır, izin ver, uygulamaya dön → kart görünür · izin listesi dışı yetişkinle
  yapay zeka penceresi → yeni not + "Ortama katıl" → davet ekranı · profilde avatara tıkla → büyük görünüm, hareketli avatar oynuyor,
  Esc/arka plan kapatıyor · mobilde aynısı.

**OUT:** avatar yükleme boyutunu büyütme · afiş büyütme · erişim talep formu.

## §5 Ek (sahip, 2026-10-30)
1. §2.1 davet kodu: **`QGJVTH5K`** (Kankaverse Belediyesi, süresiz). `configuration.ts` varsayılanı bu, env ile ezilebilir.
2. **Davet listelerinde tam bağlantı:** web Ortam ayarları > Davetler listesi (`GuildSettingsView.vue` ~890, yalnız `inv.code`
   yazıyor) ve mobil `guild-invites.tsx` (yalnız kodu kopyalıyor) her satırda **tam davet bağlantısını** gösterir ve kopyalar.
   Bağlantı biçimi mevcut tek kaynakla aynı (`origin + /invite/:code`; web `InvitePeopleModal`, mobil `guild-invite.tsx` yardımcısı;
   üçüncü kopya yazılmaz, yardımcı paylaşılır). Kod yine küçük yazıyla görünebilir. Kopyalandı geri bildirimi mevcut desenle.
