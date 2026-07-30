# Sprint M1c — Mobil Hesap Yüzeyleri (Kayıt + Şifre Kurtarma + E-posta Doğrulama)

> **Tek doğruluk kaynağı.** Endpoint yolu, DTO alan adı, ekran sayısı, doğrulama kuralı bu dosyadan
> **sapamaz**. Sapma ihtiyacı → dev **DURUR**, kullanıcıya bildirir, PM revize eder.
>
> PM compose: 2026-07-30. Önceki: `SPRINT_M1B_MOBILE_SOCIAL_CONTRACT.md` (sosyal çekirdek, bitti).
> Sıralama sahip kararı (PLAN Track F2): M1c ortam işlemlerinden ÖNCE.
>
> ## 🔴 BU SPRINT R7 KAPSAMINDADIR
> Kayıt akışı bir **yaş kapısı** ve bir **rıza kapısıdır**. Diff satır satır sahip onayına sunulur;
> "AI yazdı, geçti" yoktur (kök `CLAUDE.md` R7). Aşağıdaki §4 bu incelemenin kontrol listesidir.

---

## 0. Neden bu sprint

Mobil uygulama şu an **yalnız var olan bir hesapla** kullanılabiliyor: kayıt ekranı yok, şifresini unutan
için hiçbir yol yok, ve **e-posta doğrulama diye bir şey hiç yok** (`mobile/src` içinde `emailVerified`
geçen tek satır bile bulunmuyor — doğrulandı). Sonuç:

1. **Play incelemesi:** kayıt ekranı olmayan uygulama mağaza incelemesinden geçmez; kapalı testte
   12 testçiyi web'e mecbur eder (PLAN Track F2 notu).
2. **Sessiz çıkmaz:** mobilden kayıt olan kullanıcı doğrulanmamış durumda kalır, ortam kurmaya
   çalışınca `EMAIL_NOT_VERIFIED` yer — ekranda ne sebep ne de "tekrar gönder" olmadığı için
   kullanıcı ne olduğunu anlamaz. Bu, sözleşmelerin baştan beri reddettiği **dilsizlik**tir.

---

## 1. DoD — **fiziksel cihazda** görülerek kapanır

1. Mobilden sıfırdan hesap açılıyor; hesap web'de de çalışıyor (aynı sunucu, aynı kurallar).
2. **13 yaşından küçük doğum tarihi kaydı REDDEDİLİYOR** ve kullanıcı nedenini görüyor.
3. **Rıza adımı olmadan kayıt TAMAMLANAMIYOR**; kurallar ve gizlilik metinleri açılabiliyor.
4. Kayıt sonrası doğrulama durumu görünür; "tekrar gönder" çalışıyor.
5. Doğrulanmamış kullanıcı ortam kurmaya çalışınca **ne olduğunu anlıyor** (sessiz 403 yok).
6. "Şifremi unuttum" e-posta gönderiyor; **var olmayan e-posta için de aynı yanıt** veriliyor (sızıntı yok).
7. Kayıt modu `invite` iken davet kodu alanı görünüyor, `open` iken görünmüyor, `closed` iken kayıt kapalı.
8. Tüm metin `tr.json`'dan; renk/ölçü token'dan; gömülü string yok.
9. `typecheck` + `lint` temiz; **`api/`'ye dokunulmadı**.
10. **R7:** diff sahip onayından geçti.

---

## 2. Endpoint tablosu (kaynaktan doğrulandı 2026-07-30)

| yol | gövde / dönüş | not |
|---|---|---|
| `GET /auth/registration-mode` | → `{ mode: 'open' \| 'invite' \| 'closed' }` | **auth YOK** (public meta). Davet alanı buna göre gösterilir |
| `POST /auth/register` | `{ username, email, password, birthDate, inviteCode? }` | alan kuralları ↓ |
| `POST /auth/resend-verification` | — (auth gerekir) | rate-limit; zaten doğrulanmışta `409` |
| `POST /auth/forgot-password` | `{ email }` | **her zaman 200** — hesap var/yok sızdırmaz |
| `POST /auth/reset-password` | token + yeni şifre | **mobil KULLANMAZ**, bkz. §3.3 |
| `POST /auth/verify-email` | token | **mobil KULLANMAZ**, bkz. §3.4 |

### `RegisterDto` alan kuralları (`register.dto.ts`'ten birebir)
- `username`: `@MinLength(3)` `@MaxLength(32)` `@Matches(/^[a-zA-Z0-9_]+$/)` → yalnız harf, rakam, alt çizgi
- `email`: `@IsEmail`
- `password`: `@MinLength(8)` `@MaxLength(128)`
- `birthDate`: `@IsISO8601` — **`YYYY-MM-DD`**; istemci `new Date(...).toISOString()` ile gönderir (web deseni)
- `inviteCode`: opsiyonel, `@Length(8,8)`

### 🔴 Yaş kapısı — otorite SUNUCUDA (`birthdate.util.ts`)
`MIN_AGE = 13`, `MAX_AGE = 120`. `validateBirthDate` sırası: geçersiz tarih → `INVALID_BIRTHDATE` ·
gelecek tarih → `INVALID_BIRTHDATE` · yaş > 120 → `INVALID_BIRTHDATE` · **yaş < 13 → `UNDERAGE`**
("Kayıt için en az 13 yaşında olmalısın."). `isMinor = yaş < 18` ve minör hesap **register anında**
kısıtlı doğar: `dmPolicy: 'NONE'`, `mediaPolicy: 'NONE'`, `profileDiscoverable: false`.

**İstemci bu kararı ne gevşetir ne taklit eder.** Web de client-side yaş hesabı yapmıyor (form şemasında
yaş kuralı yok, doğrulama:1 grep ile bakıldı) — sunucunun `message`'ını gösteriyor. Mobil **aynısını**
yapar: eşit sıkılık budur. İstemcide "13'ten küçükse butonu kapat" gibi bir kolaylık **eklenmez** (yanlış
güven verir, asıl kapı yine sunucudur) ve **gevşetme de eklenmez**.

---

## 3. Ekranlar

### 3.1 Kayıt (YENİ tam ekran)
Giriş ekranına **"Hesabın yok mu? Kayıt ol"** bağlantısı eklenir (M0'da bilinçli yoktu — "olmayan
özelliğe kapı açma"; artık ekran var).

Alanlar: kullanıcı adı · e-posta · şifre · **doğum tarihi** · (mod `invite` ise) davet kodu.
Açılışta `GET /auth/registration-mode` çağrılır: `open` → davet alanı **yok** · `invite` → davet alanı
**zorunlu** · `closed` → form yerine sunucunun "Yeni kayıt şu anda kapalı." karşılığı gösterilir.

**Doğum tarihi girişi — KİLİTLİ KARAR (PM, sahip sordu 2026-07-30): üç sayısal alan `GG / AA / YYYY`,
otomatik ilerlemeli. Takvim/tarih seçici KULLANILMAZ, yeni bağımlılık KURULMAZ.**

Gerekçe: doğum tarihi bir "yakın tarih" değildir; takvim seçicileri bugünden açılıp kullanıcıyı 20-40 yıl
geriye kaydırmaya zorlar — takvimin en kötü kullanıldığı senaryo. Web'de bu bir kez yaşandı ve **tek
seçiciden üç alana geçildi**; aynı ders mobilde daha da geçerli (kaydırma alanı küçük). Karşılığında
mobilde sayısal klavye masaüstünden hızlıdır. Ayrıca bağımlılık tarafı belirleyici: native seçici Expo Go
ile gelmezse **test döngüsü tamamen kırılır** (M1a dersi — o döngüyü kurmak bir günün önemli kısmını aldı).

Tek alana maske (`GG/AA/YYYY` tek kutuda) **değerlendirildi ve reddedildi**: ayırıcı üzerinde backspace,
yapıştırma, yarım maske gibi kenar durumlar kod ve hata yüzeyi getiriyor, kazanç marjinal.

**Uygulama detayları (işi rahatlatan kısım bunlar — atlanmaz):**
- `keyboardType="number-pad"`, `maxLength` sırasıyla **2 / 2 / 4**.
- **Otomatik ilerleme:** alan dolunca odak kendiliğinden sonrakine geçer → kullanıcı tek bir yazma
  hareketi yapmış gibi olur ("üç alan kaba durur" itirazı bununla düşer).
- **Boş alanda backspace bir öncekine döner.** Karşılığı olmadan düzeltme acı verir; otomatik ilerlemenin
  eşi budur, ikisi birlikte gelir.
- Yer tutucular/etiketler TR konvansiyonu: **GG · AA · YYYY**.
- Üç alan `YYYY-MM-DD` olarak birleştirilip `new Date(...).toISOString()` ile gönderilir (web deseni).
- **Tek bir hata alanı** — üç alanın altında bir satır; her alana ayrı hata basılmaz.
- 🔴 **İstemci yaş kontrolü YAPMAZ.** Eksik/geçersiz *format* için gönderimi engellemek serbest
  (ağ israfı olmasın), ama **yaş kararı sunucuda**: 13 altı butonu kapatmak/uyarı vermek YASAK — yanlış
  güven verir ve §4/1'in ihlalidir. Sunucu `UNDERAGE` derse mesajı olduğu gibi göster.

### 3.2 🔴 Rıza adımı — ZORUNLU, atlanamaz
Web `RegisterView.vue`'da kayıt butonu **doğrudan kayıt yapmaz**: bir onay modalı açar ve gerçek kayıt
ancak "Okudum, kabul ediyorum" ile gerçekleşir. Koddaki gerekçe: *"onay tam karar anında + açık →
'görmedim duymadım' savunması kapanır."*

**Mobil bunu birebir taşır.** Aynı i18n anahtarları kullanılır (yeni metin yazılmaz, çeviri kopyalanmaz):
`legal.consentTitle` · `legal.consentAccess` · `legal.consentScanning` · `legal.consentAgreePre` ·
`legal.rules.linkLabel` · `legal.and` · `legal.privacy.linkLabel` · `legal.consentAgreePost` ·
`legal.consentConfirm`.

- Bağlantılar web sayfalarını açar: **`/kurallar`** ve **`/gizlilik`** (web router'dan doğrulandı).
  Mobilde `Linking.openURL` ile açılır (`expo-linking` kurulu). **Web kökü için yeni env gerekir** → §7.
- **Onay kutucuğu formun içine gömülmez.** Sürüklenip geçilebilen bir checkbox rıza kalitesini düşürür;
  web'in deseni "karar anında ayrı ekran/modal" ve bu bilinçli. Mobil de öyle yapar.
- Onaylamadan `POST /auth/register` **çağrılmaz**.

### 3.3 Şifremi unuttum (YENİ)
Giriş ekranına bağlantı + e-posta alanı → `POST /auth/forgot-password`.
**Yanıt her koşulda aynı gösterilir** ("e-posta gönderildiyse gelen kutuna bak" tonunda, sunucu mesajı):
hesabın var olup olmadığı sızdırılmaz. İstemci "bu e-posta kayıtlı değil" gibi bir çıkarım **yapmaz**.

**🔴 `reset-password` mobilde UYGULANMAZ (bilinçli kapsam dışı).** Sıfırlama bağlantısı e-postayla
`FRONTEND_URL`'e (web) gider; bağlantının uygulamayı açması için **Android App Links** gerekir — bu da
doğrulanmış alan adı + imzalı derleme ister, yani **dev build (M2) işidir**, Expo Go ile yapılamaz.
Kullanıcı şifresini web'de yeniler, sonra mobilde giriş yapar. Bu bir eksiklik değil, **sıralama**:
M2'de dev build gelince App Links maddesi ile birlikte tekrar masaya gelir (PLAN M2 kontrol listesi).
Aynı gerekçeyle **`verify-email`** de mobilde uygulanmaz — doğrulama linki web'de tamamlanır.

### 3.4 E-posta doğrulama durumu (YENİ — mobilde hiç yoktu)
- `UserDto.emailVerified` mobil tipe eklenir (sunucu zaten dönüyor: `toUserDto`'da mevcut).
- **Doğrulanmamışsa görünür bir bant** + **"Tekrar gönder"** (`POST /auth/resend-verification`).
  Bandın yeri: "Sen" sekmesi **ve** ortam kurma girişiminin engellendiği yer (§3.5). Boş yüzey değil —
  yalnız `emailVerified === false` iken render edilir.
- Zaten doğrulanmışta sunucu `409` döner → sunucu mesajı gösterilir, istemci kendi metnini yazmaz.

### 3.5 `EMAIL_NOT_VERIFIED` sessizliği kapanır
`POST /guilds` doğrulanmamışta `403 EMAIL_NOT_VERIFIED` veriyor (`VerifiedEmailGuard`). Mobilde şu an
ortam **kurma** akışı yok (M1d), ama bant §3.4 ile geldiği için kullanıcı sebebi öğrenmiş olur. M1d'de
ortam kurma eklendiğinde bu hata **jenerik toast'a düşürülmez**, bandın diliyle açıklanır.

---

## 4. 🔴 R7 inceleme kontrol listesi (sahip bu maddeleri arar)

1. **Yaş kapısı gevşetilmedi:** istemcide `MIN_AGE`/`isMinor` yeniden hesaplanmıyor, sunucu kararı
   yorumlanmıyor, `UNDERAGE` mesajı yumuşatılmıyor/gizlenmiyor.
2. **Rıza adımı atlanamıyor:** onay olmadan `register` çağıran hiçbir yol yok (buton, Enter, deep link).
3. **Rıza metni web ile aynı** — aynı i18n anahtarları, "mobil için kısaltılmış" bir sürüm yok.
4. **Yasal bağlantılar gerçekten açılıyor** (ölü link yok; açılamıyorsa kullanıcı bilgilendirilir).
5. **Sızıntı yok:** `forgot-password` yanıtı hesap varlığını ifşa etmiyor; `USERNAME_TAKEN`/`EMAIL_TAKEN`
   sunucunun verdiği gibi gösteriliyor (bunlar bilinçli açık — kayıt UX'i için gerekli, web'de de öyle).
6. **Şifre ekranda saklı** (`secureTextEntry`), loglanmıyor, hiçbir yere yazılmıyor.
7. **Minör varsayılanları istemcide taklit edilmiyor** — `dmPolicy`/`mediaPolicy`/`profileDiscoverable`
   sunucuda set ediliyor; mobil bunları göstermez/değiştirmez.
8. `api/`'ye dokunulmadı (`git status -- api` boş).

---

## 5. i18n + tema

Tüm metin `web/src/i18n/tr.json`'dan. **`auth.*` ve `legal.*` altında zaten var olan anahtarlar
yeniden kullanılır** — web kayıt/şifre ekranları bu metinleri taşıyor, mobil için ikinci bir Türkçe
yazılmaz (ton/terminoloji tek yerden denetlenebilir kalsın, kök `CLAUDE.md` i18n gerekçesi). Gerçekten
mobil-özel bir metin gerekirse `mobile.*` altına eklenir. Renk/ölçü `src/theme`.

---

## 6. Kapsam DIŞI (yapma — sapma sayılır)

- `reset-password` + `verify-email` ekranları (§3.3 — App Links, M2 dev build)
- Sosyal giriş / e-Devlet doğrulama (V1 dışı; e-Devlet lansman şartı, ayrı iş)
- 2FA **kurma** (M0'da login-2FA var; kurma/kurtarma kodları = ayrı sprint)
- Şifre değiştir / e-posta değiştir / hesap silme (web'de var, mobilde ayrı sprint — "Sen" sekmesi
  ayarları M1b'de bilinçle boş bırakıldı)
- Ortam kurma/davetle katılma → **M1d**
- Play veri güvenliği formu + yaş derecelendirmesi → **sahip işi**, kod değil (PLAN: mağaza süreçlerine
  uygulama bittikten sonra girilecek). Bu sprint o formların **tetikleyicisidir**, doldurmaz.

---

## 7. Yeni env değişkeni

`EXPO_PUBLIC_WEB_URL` — yasal sayfaların (`/kurallar`, `/gizlilik`) kökü. `.env.example`'a eklenir,
varsayılan `https://kankaverse.com`. **`EXPO_PUBLIC_API_URL` ile karıştırılmaz:** o API kökü (yerelde
LAN IP + port 3001), bu site kökü. Yerel geliştirmede de canlı siteyi göstermesi kabul edilebilir —
yasal metinler yerelde farklı değil.

---

## 8. Sapma kuralı

Endpoint yolu, DTO alan adı, doğrulama kuralı, rıza akışı bu dosyadan **sapamaz**. İhtiyaç doğarsa dev
**durur**, bildirir, PM revize eder. Yeni bağımlılık = **PM onayı**. `TASK.md`'ye item eklenmez.
**R7 gereği bu sprintin diff'i sahip onayı olmadan merge edilmez.**
