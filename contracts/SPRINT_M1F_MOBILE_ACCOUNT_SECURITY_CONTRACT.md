# Sprint M1f — Mobil Hesap Güvenliği (Track F2, PM compose 2026-08-01)

> **Tek doğruluk kaynağı.** Uç imzası, DTO şekli ve hata kodu bu dosyadan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
>
> **Varlık sebebi — bu bir cila sprinti DEĞİL, açık bir boşluk:** mobilde kullanıcı şifresini
> değiştiremiyor, oturumlarını göremiyor/kapatamıyor, 2FA kuramıyor, e-postasını değiştiremiyor,
> hesabını silemiyor. Web'de hepsi var. 2FA'lı hesapla mobilden **giriş yapılabiliyor** ama
> **kurulamıyor** — yani kullanıcı güvenliğini yalnız masaüstünden yönetebiliyor.
>
> 🔴 **R7 KAPSAMINDA.** Bu sprint auth/oturum katmanına dokunuyor. `api/`'ye dokunma **beklenmiyor**
> (tüm uçlar mevcut), ama mobil tarafta reauth akışı ve oturum yönetimi **satır satır sahip
> incelemesinden geçmeden** kapanmaz (kök CLAUDE.md R7).

---

## 0. Kaynaktan doğrulanmış uçlar (2026-08-01, `auth.controller.ts`den okundu)

| Uç | Gövde | Not |
|---|---|---|
| `POST /auth/2fa/setup` | `ReauthFieldsDto` | otplib + QR üretir |
| `POST /auth/2fa/enable` | kod | kurtarma kodlarını döner |
| `POST /auth/2fa/disable` | `ReauthFieldsDto` | |
| `GET /auth/sessions` · `DELETE /auth/sessions/:id` · `POST /auth/sessions/revoke-others` | | oturum listesi/kapatma |
| `POST /auth/password/change` | reauth + `newPassword` (min 8) | **diğer oturumları düşürür** |
| `POST /auth/email/change` | reauth + `newEmail` | onay + geri-al postası gider |
| `POST /auth/username/change` | reauth + `newUsername` (3-32, `^[a-zA-Z0-9_]+$`) | 🔴 aşağıya bak |
| `POST /auth/account/delete` | `ReauthFieldsDto` | grace + oturum düşür; girişte iptal |

**`ReauthFieldsDto` (birebir):** `currentPassword` (zorunlu) + `totpCode` (opsiyonel, 2FA açıksa).

🔴 **Kullanıcı adı değişimi — çelişki, sahibe soruldu:** uç **var** (`POST /auth/username/change`)
ama web'de `settings.usernameReadonlyHint` = *"Kullanıcı adı şu an değiştirilemez."* diyor.
İkisinden biri yanlış. **Karar gelene kadar mobilde bu satır KONMAZ** — web "değiştirilemez" derken
mobilin değiştirmesi iki istemciyi çelişkiye düşürür.

---

## 1. DoD — **fiziksel cihazda**
1. **Sen** sekmesinde dişli → Hesap Güvenliği ekranı açılıyor.
2. **Şifremi değiştirebiliyorum**; işlem sonrası diğer oturumların düştüğünü görüyorum.
3. **Oturumlarımı görüyorum**, tekini kapatabiliyorum, "diğerlerini kapat" çalışıyor.
4. **2FA kurabiliyorum** (gizli anahtar → doğrulama kodu → kurtarma kodları) ve kapatabiliyorum.
5. **Kurtarma kodlarını kopyalayabiliyorum** ve bir daha gösterilmediğini biliyorum.
6. **E-posta değiştirebiliyorum**; onay postası gittiğini görüyorum.
7. **Hesabımı silebiliyorum** (grace süresiyle) ve ne olacağını okuyorum.
8. **Hassas işlemler şifre (ve 2FA açıksa kod) istiyor**; yanlış girişte sunucunun mesajı görünüyor.
9. Metin `tr.json`'dan; `typecheck` + `lint` temiz; `api/`'ye dokunulmadı.
10. 🔴 **R7:** reauth akışı + oturum yönetimi sahip incelemesinden geçti.

---

## 2. Ekranlar

### 2.1 Hesap Güvenliği (giriş noktası)
"Sen" sekmesine **dişli** (sağ üst) → gruplu liste:
**Hesap:** Şifre Değiştir · E-posta Değiştir · İki Adımlı Doğrulama · Oturumlarım
**Tehlikeli:** Hesabımı Sil

*M1d-C'de dişli "içi boş kalır" diye bilinçle konmamıştı; tetikleyici buydu, artık dolu.*

### 2.2 Paylaşılan **reauth** bileşeni
Hassas her işlem önce şifre ister; **2FA açıksa** TOTP alanı da görünür (`user.twoFactorEnabled`).
Tek bileşen, her ekranda aynı: web'deki reauth modalının karşılığı.
🔴 Şifre alanı **asla** saklanmaz/loglanmaz; istek dışında bir yere yazılmaz.

### 2.3 Şifre Değiştir
reauth + yeni şifre (min 8) + tekrar. Başarıda **diğer oturumların düştüğü yazılır** (sunucu
davranışı; kullanıcı "neden diğer cihazım çıktı" diye şaşırmasın).

### 2.4 Oturumlarım
Liste: cihaz/UA özeti · son görülme · **mevcut oturum işaretli**. Tek oturum kapatma + "Diğerlerini
Kapat". Mevcut oturumu kapatmak = çıkış; ayrı bir "çıkış" yolu icat edilmez.

### 2.5 İki Adımlı Doğrulama
- Kapalıysa: **Kur** → reauth → sunucudan gizli anahtar + otpauth URI → kullanıcı authenticator'a
  girer → 6 haneli kod → **kurtarma kodları** (kopyala).
- 🔴 **QR ÇİZİLMEZ, gizli anahtar metin olarak gösterilir + kopyalanır.** Sebep: telefonun kendi
  ekranındaki QR'ı yine aynı telefondaki authenticator ile okutmak mümkün değil; metin anahtar
  mobilde doğru affordance. (Web QR gösteriyor, orada doğru olan o.)
- 🔴 **Kurtarma kodları bir kez gösterilir**; ekranda bu açıkça yazılır.
- Açıksa: **Kapat** → reauth.

### 2.6 E-posta Değiştir
reauth + yeni e-posta → "onay postası gitti" durumu. Onay/geri-al **linkten** yürür (web'de
landing var); mobil kendi onay ekranını **açmaz**, uydurma akış kurmaz.

### 2.7 Hesabımı Sil
reauth + **ne olacağının açık metni** (grace süresi, girişte iptal) + `ConfirmDialog`.
Silme sonrası oturum düşer → giriş ekranına.

---

## 3. 🔴 T&S / R7 sınırları
- Reauth kararı **sunucudadır**; istemci "şifre doğru mu" tahmininde bulunmaz, 401/403'ü gösterir.
- **Kurtarma kodları** ekranda bir kez; kopyalama dışında bir yere yazılmaz (AsyncStorage'a ASLA).
- **TOTP gizli anahtarı** yalnız kurulum akışında bellekte; saklanmaz.
- Oturum listesi **başka kullanıcının** oturumunu göstermez (sunucu zaten kendi oturumlarını döner).
- Hesap silme **geri alınabilir** (grace) — metin bunu net söyler, korkutucu ya da yanıltıcı olmaz.

## 4. Kapsam DIŞI
- **Kullanıcı adı değişimi** (§0 çelişkisi çözülene kadar)
- E-posta onay/geri-al **landing ekranları** (linkten web'e gider)
- Cihaz adlandırma, oturum konumu/harita, giriş geçmişi (uç yok)
- Şifre kurtarma (giriş öncesi akış — `forgot-password` zaten var, bu sprint oturum-içi)

## 5. Sapma kuralı
Uç imzaları, reauth zorunluluğu, "kurtarma kodları bir kez", QR yerine metin anahtar kararı ve §4
bu dosyadan **sapamaz**. `api/`'ye dokunma ihtiyacı → **DUR**.
