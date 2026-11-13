# SPRINT C69: Çıkışta şifreli mesajlar cihazda kalır

> Durum: **KİLİTLİ (2026-11-13, sahip onayı; kurul şartlı onayı). Sıra: E8 öncesi.** PM compose (Opus). api + e2ee istemci + web(masaüstü) + mobile.
> 🔴 **R7:** auth/oturum (logout, login, revoke) + E2EE cihaz yaşam döngüsü. Her adım sahibin satır satır onayıyla.

## §0 Hedef
Bugün çıkış = E2EE cihaz iptali + yerel şifreli depo silinir; tekrar girişte geçmiş yalnız yedekten döner.
Yeni: **tek "Çıkış yap" butonu, hiçbir şey silinmez.** Aynı hesapla aynı cihazda tekrar giriş yapan (normal parola
+ 2FA) mesajlarını olduğu gibi görür; çıkışta kaldığı süre içinde gelenler de çözülür. Yedek/aktarım akışı yalnız
**cihaz değişince** çıkar. İkinci buton, uyarı metni, ek parola YOK (sahip kararı: kullanıcıyı boğma).

Kapsam: **mobil + masaüstü uygulaması.** Tarayıcı (web) bugünkü gibi çıkışta siler (ortak bilgisayar riski;
kurul şartı). Masaüstü ayrımı: `window.kankaverse` köprüsü (desktop/src/preload.js; web bugün güncelleme bandı ve bildirimlerde aynı yolu kullanıyor). Köprü varsa koru, yoksa (düz tarayıcı) sil.

## §1 Sunucu: park edilmiş cihaz
- Çıkış (`logout`) artık cihazı **iptal etmez**: `E2eeDevice.tokenFamily = null`, yeni alan `parkedAt = now()`.
  Oturum zinciri bugünkü gibi kapanır. Cihaz MLS gruplarında üye kalır, KeyPackage'ları durur.
  (Şema: `tokenFamily String? @unique`, `parkedAt DateTime?`. Migration + `migrate status` temiz.)
- **Yeniden bağlama:** tam girişten sonra istemci `POST /e2ee/devices/rebind/challenge` → `{ nonce }` (tek kullanımlık,
  kısa ömürlü), sonra `POST /e2ee/devices/rebind { deviceId, signature }` (Ed25519, cihaz imza anahtarıyla
  `nonce || userId || deviceId`). Koşullar: aynı userId, `revokedAt null`, `parkedAt` dolu, imza geçerli →
  `tokenFamily = yeni aile`, `parkedAt = null`, `lastSeenAt = now`. Herhangi biri tutmazsa 4xx; istemci
  bugünkü yeni cihaz akışına düşer (yerel depo silinir, yeni kayıt). Hata döngüsü yok.
- **Park edilmiş cihazı iptal eden olaylar (bugünkü iptal noktalarına EK):** parola değişimi/sıfırlama, hesap silme,
  Oturumlarım'dan kaldırma, temizlik işi (**30 gün** park). Refresh reuse aile iptali bugünkü gibi aktif cihazı iptal eder.
- Yeniden bağlama mevcut "yeni giriş" bildirim/kaydına ek bir şey üretmez (giriş zaten bildirilir); audit satırı `rebind`.
- Testler: çıkış sonrası cihaz aktif değil ama iptal de değil; doğru imzayla bağlanır; başka kullanıcı/iptal/park
  olmayan/yanlış imza/eski nonce reddedilir; parola değişince park iptal; 30 gün işi; park cihaz `/e2ee` uçlarını
  (oturumu olmadığı için) çağıramaz.

## §2 Oturumlarım (kurul şartı, sessiz güvenlik ağı)
- Park edilmiş cihazlar listede ayrı satır: "Çıkış yapılmış · {platform} · son görülme {tarih}" + "Kaldır"
  (iptal; o cihazdaki mesajlar bir sonraki açılışta silinir). Web ve mobil Oturumlarım ekranı.

## §3 İstemci
- Çıkış: depo SİLİNMEZ (mobil + masaüstü). Tarayıcıda `wipeE2ee` aynen.
- Giriş sonrası: yerel depoda bu kullanıcının cihazı varsa önce rebind; başarılıysa normal açılış (geri yükleme bandı,
  "cihaz öncesi gizli" çıkmaz). Başarısızsa bugünkü yeni cihaz akışı.
- **Başka hesap girerse:** yerel depodaki önceki hesabın verisi silinir (sunucudaki park kaydı 30 günde düşer).
- ~~Geri dönüşte birikmiş commit işlenemezse yeni cihaz akışı~~ → **D110 borcuna alındı** (sahip onayı 2026-11-13; C69 dışı, bugün de var).
- Açılışta park sırasında iptal edilmiş cihaz (Oturumlarım'dan kaldırılmış / parola değişmiş): rebind reddedilir → yerel silinir.

## §4 Adımlar (her biri R7)
1. api (şema, logout/park, rebind, iptal noktaları, 30 gün işi, Oturumlarım verisi) + testler.
2. e2ee istemci çekirdeği + web/masaüstü (tarayıcı ayrımı, Oturumlarım satırı).
3. mobil (vc77).
4. Cihaz turu: çıkış → giriş geçmiş yerinde; çıkıştayken gelen mesaj çözülür (1-1 + grup); başka hesapla giriş
   önceki veriyi siler; Oturumlarım'dan kaldır → tekrar girişte yeni cihaz; parola değiştir → aynı; tarayıcıda bugünkü davranış.

## §5 OUT
Parolasız tek dokunuş giriş · ikinci "sil" butonu · çıkış uyarı metni · imzayla kendi kendini iptal ucu.
