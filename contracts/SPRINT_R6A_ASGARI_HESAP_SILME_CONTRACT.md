# Sprint R6a — Asgari Hesap Silme (gerçek imha)

> **Tier:** yalnız `api/`. `web/` ve `mobile/` sıfır.
> **🔴 R7 yüzeyi:** kimlik + kişisel veri imhası. Diff sahibin satır satır onayından geçmeden merge edilmez.
> **Kaynak:** Play "Hesap silme URL'si" zorunluluğu, 2026-08-10. Sayfayı yazmadan önce kodun gerçekten
> silmesi gerekiyor; aksi hâlde yayımlanan sayfa yanlış beyan olur.

## §0 Bugünkü durum (okundu, doğrulandı)

`auth.service.ts:812 deleteAccount` sağlam çalışıyor: şifre + 2FA ile yeniden kimlik doğrulama,
`deletionRequestedAt` damgası, tüm oturumların iptali. Girişte talep iptal ediliyor
(`cancelPendingDeletionOnLogin`) — 30 günlük geri dönüş penceresi bu.

🔴 Eksik olan: `common/jobs/purge.job.ts` 30 günü dolmuş adayları buluyor ama **hiçbir şey silmiyor**.
`PURGE_ENABLED=false` iken yalnız logluyor; `true` iken bile "kalıcı imha henüz uygulanmadı (R6
bekleniyor)" uyarısı basıyor. Yani kullanıcı sildim sanıyor, veri duruyor.

## §1 Kapsam — ASGARİ, tam imha DEĞİL

Bu sprint **kişisel kimlik verisini** gerçekten yok eder. Tam imha (mesaj içerikleri, yüklenen
dosyalar, moderasyon kayıtlarının saklama süreleri) R6'nın hukuk ayağına bağlı ve BU SPRINTİN
KAPSAMINDA DEĞİL. Sebep: neyin ne kadar saklanacağı KVKK ve istismar bildirimi yükümlülükleriyle
birlikte kararlaştırılmalı; tek başına mühendislik kararı değil.

## §2 30 gün dolunca yapılacaklar

`PurgeJob.run` içinde, `deletionRequestedAt <= now-30gün` ve `deletedAt: null` olan her kullanıcı için
**tek transaction**:

1. `User` kaydında kişisel alanlar temizlenir:
   - `email` → benzersiz yer tutucu (ör. `deleted-<userId>@kankaverse.invalid`) — UNIQUE kısıtı korunur
   - `username` → benzersiz yer tutucu (ör. `silinmis_<userId ilk 8>`) — UNIQUE kısıtı korunur
   - `passwordHash` → tekrar kullanılamaz rastgele değer (giriş imkânsız)
   - `avatarUrl`, `bannerUrl`, varsa görünen ad / hakkında / durum metni → `null`
   - `birthDate` → 🔴 şemada NOT NULL (sahip kararı 2026-08-10): migration YERİNE sabit yer
     tutucu (`1970-01-01`) yazılır; gerçek değer geri getirilemez biçimde yok olur
   - 2FA alanları (`twoFactorEnabled`, `totpSecret`, kurtarma kodları) → kapalı / `null`
   - `deletedAt` → `now()`, `deletionRequestedAt` → `null`
2. Bu kullanıcıya ait şu satırlar **silinir**: `Session`, `PushToken`, `NotificationPref`,
   `RecoveryCode` (kurtarma kodları ayrı tabloda; sahip R7'de onayladı 2026-08-10).
3. İş idempotent olmalı: aynı kullanıcı ikinci kez işlenirse hata vermez, tekrar iş yapmaz
   (`deletedAt: null` koşulu bunu zaten sağlıyor, koru).

**Bilerek DOKUNULMAYANLAR** (sayfada da böyle yazılacak, §4):
- Mesaj içerikleri ve yüklenen dosyalar. Başkalarının sohbetlerinin parçası; imhası R6 kararı.
- Moderasyon ve bildirim kayıtları (rapor, ban, automod). Hukuki yükümlülük alanı.
- `UserBlock` kayıtları: engelleyen tarafın koruması, silinen hesabın dönüşünde geçersiz kalmamalı.

## §3 Bayrak

`PURGE_ENABLED` **kalır** ve varsayılanı `false` kalır. Üretimde açılması sahibin kararı; bu sprint
yalnız "açıldığında gerçekten silen" kodu yazar. Bayrak kapalıyken bugünkü davranış (yalnız log)
DEĞİŞMEZ.

🔴 Log satırı artık gerçeği söylemeli: bayrak kapalıyken "imha edilmedi, bayrak kapalı"; açıkken
"N kullanıcı imha edildi".

## §4 Doğruluk şartı

Bu sprint bitince `web/` tarafında herkese açık bir "Hesap Silme" sayfası yazılacak (ayrı iş, PM).
O sayfa **bu koddan** türetilecek: 30 gün bekleme, girişle iptal, silinen alanlar, saklanan alanlar.
Kod ile sayfa arasında fark kalırsa yanlış beyan olur.

## §5 DoD

- [ ] `npm run build` temiz; `PurgeJob` için birim testi (30 günü dolmamış kullanıcıya dokunmaz,
      dolmuşta alanları temizler, ikinci çalıştırmada tekrar iş yapmaz)
- [ ] Tek transaction; kısmi silme durumu bırakmaz
- [ ] `PURGE_ENABLED=false` iken hiçbir yazma yapılmaz (bugünkü davranış birebir korunur)
- [ ] Benzersizlik kısıtları (email/username) yer tutucularla çakışmaz
- [ ] Prisma şema değişikliği GEREKİYORSA dur ve PM'e bildir (beklenmiyor; alanlar mevcut)
- [ ] 🔴 Sahip diff'i inceledi (R7)
