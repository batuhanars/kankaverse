# Sprint M1b — Mobil Sosyal Çekirdek (Track F2)

> **Tek doğruluk kaynağı.** Endpoint yolu, DTO alan adı, ekran sayısı, gezinme deseni bu dosyadan **sapamaz**.
> Sapma ihtiyacı → dev **DURUR**, kullanıcıya bildirir, PM revize eder. `TASK.md`'ye item eklenmez, kutu işaretlenir.
>
> PM compose: 2026-07-30. Önceki sprint: `SPRINT_M1A_MOBILE_SHELL_CONTRACT.md` (kabuk + mesajlaşma, bitti).
> Kapsam kararı sahip onaylı 2026-07-30: **sosyal çekirdek + "Sohbeti temizle" + engelle/arkadaşlıktan çıkar.**

---

## 0. Neden bu sprint

M1a'dan sonra mobil uygulama mesaj **okuyup cevaplayabiliyor** ama **hiçbir ilişki kuramıyor**: arkadaş
ekleyemiyor, yeni bir sohbet başlatamıyor, grup kuramıyor, arama yapamıyor. Yani var olan bir DM'e cevap
veren bir istemci. M1b bu boşluğu kapatır.

Ayrıca M1a §8.1-A/4'te bilinçli olarak **yapılmamış** iki buton var (arama + Arkadaş Ekle): sözleşme
"olmayan özelliğe kapı açma" kuralı gereği butonlar açtıkları ekranlarla aynı sprint'te gelir. O ekranlar
burada geliyor, **butonlar da bu sprint'te konur.**

### İki ders, sözleşmeye gömülü

1. **Endpoint tablosu bir yol listesidir; DTO alan adları ve doğrulama kuralları DOSYADAN okunur.** (M0 dersi.)
   §2'deki alan adları PM tarafından kaynaktan doğrulanmıştır — yine de dev dokunduğu her DTO'yu açıp bakar.
2. **Emülatör gerçeği temsil etmez.** (M1a dersi: klavye kusuru emülatörde hiç görülmedi, yazılım klavyesi
   bile açılmadı; gezinme çubuğu sorunu emülatörde ÜRETİLEMEDİ.) Bu sprint'in DoD'u **fiziksel cihazda**
   kapanır.

---

## 1. DoD — görülerek kapanır (fiziksel cihaz)

1. Kanka kodumu görüp paylaşabiliyorum; kod girip arkadaşlık isteği gönderebiliyorum.
2. Gelen arkadaşlık isteğini kabul/ret edebiliyorum, liste anlık güncelleniyor.
3. Bir arkadaşımla **sıfırdan DM başlatabiliyorum** (mevcut kanal varsa aynısına düşüyor, kopya açılmıyor).
4. Grup DM kurabiliyorum; ad değiştirme / üye ekleme / üye çıkarma / gruptan ayrılma / grubu silme
   **yetkim olan** işlemlerde çalışıyor, yetkim olmayanlar UI'da **hiç görünmüyor** (403 yiyen buton yok).
5. Listede arama: yazdıkça DM/ortam/kanal süzülüyor; boş sonuç durumu var.
6. Sohbet içinde mesaj arama: sonuç listesi + sonuca dokununca o mesaja gidiyor (ya da o kanala düşüyor).
7. "Sohbeti temizle" çalışıyor: liste kutucuğu düşüyor, **karşı taraf etkilenmiyor**, yeni mesajda kanal geri geliyor.
8. Profil kartından engelle / arkadaşlıktan çıkar çalışıyor, ikisi de **onay soruyor**.
9. Engelledikten sonra DM giriş kutusu kapanıyor (M1a'daki `canMessage`/`selfBlocked` yolu).
10. Tüm yeni metin `tr.json`'dan; gömülü kullanıcı-görünür string yok; renk/ölçü tema token'ından.
11. `typecheck` + `lint` temiz; **`api/`'ye dokunulmadı.**

---

## 2. Endpoint tablosu (yol listesi — alan adları kaynaktan doğrulandı 2026-07-30)

Envelope her yanıtta `{ success, statusCode, data }`; gerçek veri `response.data.data`. Hata mesajı
`message` (Türkçe) gösterilir, `error` kodu loglanır.

### Arkadaşlık
| yol | gövde / sorgu | not |
|---|---|---|
| `GET /friends` | — | arkadaş listesi |
| `GET /friends/requests` | — | bekleyen istekler |
| `POST /friends/requests` | `{ friendCode }` | **`friendCode` TAM 6 KARAKTER** (`@Length(6,6)`, örnek `K7M2QX`) |
| `POST /friends/requests/:id/accept` | — | |
| `POST /friends/requests/:id/decline` | — | |
| `DELETE /friends/:userId` | — | arkadaşlıktan çıkar |

> **🔴 `friendCode` 6 karakterdir, 8 değil.** `TASK.md`'nin Sprint 3 satırında "8-char base32" yazıyor —
> **o satır eskimiş** (R1/R3 revizyonlarından kalma). Kaynak: `send-friend-request.dto.ts`. Dev DTO'ya bakar,
> TASK.md'ye değil. Girişte 6 karakter maskesi/limiti uygulanır.

Kendi kodum: `GET /auth/me` yanıtındaki `friendCode` alanı (`toUserDto`'da mevcut, doğrulandı).
**Mobil `UserDto` tipinde bu alan tanımlı değil → tipe eklenir. Sıfır backend.**

### DM
| yol | gövde / sorgu | not |
|---|---|---|
| `GET /dm/channels` | — | M1a'da kullanılıyor |
| `POST /dm/channels` | `{ userId }` | **DM başlat.** `canDm` kapılı; kanal varsa **mevcut olanı döner** (kopya açmaz). 30/saat limit |
| `DELETE /dm/channels/:id` | — | **"Sohbeti temizle"** (G4 soft-delete: yalnız çağıranın `clearedAt`'i; mesajlar DB'de kalır, karşı taraf etkilenmez) |
| `POST /dm/channels/:id/read` | — | M1a'da kullanılıyor |
| `GET /dm/requests` · `POST /dm/requests/:id/accept` · `POST /dm/requests/:id/reject` | reject: `{ block? }` | M1a'da kullanılıyor |

### Grup DM
| yol | gövde | yetki (kaynaktan doğrulandı) |
|---|---|---|
| `POST /dm/groups` | `{ memberIds: string[], name? }` | `memberIds` **1–9 arası** (`@ArrayMinSize(1)`, `@ArrayMaxSize(9)`) |
| `POST /dm/groups/:id/members` | `{ userId }` | **her üye ekleyebilir** |
| `DELETE /dm/groups/:id/members/me` | — | gruptan ayrıl — her üye |
| `DELETE /dm/groups/:id/members/:userId` | — | **yalnız `ownerId`** |
| `PATCH /dm/groups/:id` | `{ name }` | **yalnız `ownerId`** |
| `DELETE /dm/groups/:id` | — | **yalnız `ownerId`** |

`GROUP_DM` kanalının `ownerId`'si `GET /dm/channels` yanıtındaki DTO'da geliyor (M1a'da tiplendi) →
sahiplik istemcide **sorgusuz** bilinir, yetki-dışı butonlar hiç render edilmez.

### Engelleme
| yol | gövde |
|---|---|
| `GET /blocks` | — |
| `POST /blocks` | `{ userId }` |
| `DELETE /blocks/:userId` | — |

### Arama
| yol | sorgu | not |
|---|---|---|
| `GET /channels/:id/messages/search` | `q`, `before?` | **kanal içi** mesaj arama, case-insensitive, **max 30 sonuç** |
| `GET /guilds/:id/messages/search` | `q?`, `from?`, `mentions?` | ortam-geneli, kanal-gruplu — **bu sprint KULLANILMIYOR** (bkz. §3.5) |

### Profil kartı
`GET /users/:id/card` → `UserProfileCardDto` (`friendStatus` + `selfBlocked`). M1a'da salt-okunur kart için
kullanılıyor; bu sprint aksiyonlar eklenir.

---

## 3. Ekranlar

### 3.1 Arkadaş Ekle (YENİ tam ekran)
M1a'da yeri hazırlanan **geniş "Arkadaş Ekle" butonundan** açılır (§8.1-A/4).

- **Kendi kodum:** büyük/okunur gösterim + **kopyala** + **paylaş** (native paylaşım; `expo-clipboard`/`Share`
  ihtiyacı doğarsa **PM onayı** — Expo Go ile gelen modül tercih edilir).
- **Kod gir → istek gönder:** 6 karakter girişi, `POST /friends/requests`.
- **🔴 Kullanıcı adıyla arama veya ekleme YOK.** Sunucuda böyle bir uç yok (`users.controller.ts`'te yalnız
  `:id/card`) **ve** bu bir T&S duruşudur: brief §4 "ulaşımı zorlaştır" — herkesin kullanıcı adıyla
  bulunabilir olması yabancıya erişimi kolaylaştırır. Değişmesi **kurul + sahip kararı** ister.
  Rehber senkronizasyonu (Discord "Find friends") **kapsam dışı** — kişi listesi okumak KVKK yüzeyi açar.
- **Bekleyen istekler** aynı ekranda: kabul / ret. `friend.*` WS olayları **dinlenir** (M1a'da eklenmedi;
  bu sprint eklenir → liste anlık).

### 3.2 Yeni DM başlat (YENİ)
Arkadaş listesinden kişi seç → `POST /dm/channels { userId }` → dönen kanala git.
Kanal zaten varsa sunucu **mevcut olanı** döner; istemci kopya kutucuk oluşturmaz (store'da id ile eşleştir).

### 3.3 Grup DM (YENİ)
- **Kur:** arkadaşlardan çoklu seçim (1–9) + opsiyonel ad → `POST /dm/groups`.
- **Yönet:** ad değiştir · üye ekle · üye çıkar · ayrıl · grubu sil — **§2'deki yetki tablosuna göre**;
  yetkisi olmayan işlem **görünmez** (disabled değil, hiç yok).
- **🔴 T&S — minör kapısı:** grup kurma/üyelik minöre kapalı (`GROUP_MINOR_FORBIDDEN`) ve üyeler
  **arkadaş olmak zorunda** (`NOT_FRIEND`). Sunucu bu retleri **jenerik** verir ("Kullanıcı eklenemedi",
  "Bu işlem için yetkiniz yok") — **istemci sebebi tahmin edip açıklamaya ÇALIŞMAZ**, `message`'ı gösterir.
  Yaş/statü sızdırmak M1a'dan beri süren disiplinin ihlalidir.

### 3.4 Listede arama (M1a §8.1-A/4'ün dar/ikon butonu)
DM + ortam + kanal listesinde **yerel süzme** (istemci tarafı, ek uç yok): yazdıkça filtrele, gruplu sonuç
(KANKALAR / ORTAMLAR / DM — web `HomeSidebar` deseni), boş sonuç durumu.

### 3.5 Sohbet içinde mesaj arama
Mesaj ekranı başlığında arama girişi → `GET /channels/:id/messages/search?q=`. Sonuç listesi (max 30),
sonuca dokun → o mesaja git.
**Ortam-geneli arama (`/guilds/:id/messages/search`) bu sprint KULLANILMAZ:** kanal-gruplu sonuç + `from`/
`mentions` süzgeçleri kendi başına bir ekran tasarımıdır, mobilde ayrı iş. Sahip "web'te ne kullanıyorsak"
dedi; kanal içi arama o ihtiyacın karşılığı. Ortam-geneli istenirse **PM revizyonu.**

### 3.6 Sohbeti temizle + engelle/arkadaşlıktan çıkar
- DM başlığı → **"Sohbeti temizle"** (`DELETE /dm/channels/:id`) — `ConfirmDialog`. **Dil "sil" değil
  "temizle"**: mesajlar DB'de kalıyor, karşı tarafta duruyor. Yanlış dil kullanıcıya yanlış güvence verir.
- Profil kartı (M1a, salt-okunur) → **Engelle** (`POST /blocks`) + **Arkadaşlıktan çıkar**
  (`DELETE /friends/:userId`), ikisi de onaylı. Engel kalkma: `DELETE /blocks/:userId`.
- Engel sonrası DM giriş kutusu M1a'daki `canMessage`/`selfBlocked` yolundan kapanır — **yeni kapı yazılmaz.**

---

## 4. T&S ve R7

**Bu sprint R7-nötr olmalı:** tüm kapılar backend'de (`canDm`, `canSendFriendRequest`, grup minör kapısı,
blok obfuscation), mobil yalnız sonucu gösterir. **`api/`'ye dokunma ihtiyacı doğarsa → DUR, PM'e dön.**

Değişmeyen disiplin:
- Minör statüsü hiçbir yanıt/olay/UI'da sızmaz; jenerik hata kodları **jenerik gösterilir**.
- Blok belirsizliği korunur (G3): "engellendim mi" bilgisi karşı tarafa sızmaz. `selfBlocked` yalnız
  **ben→o** yönünü söyler; "o→ben" sunucudan hiç dönmez, istemci de tahmin etmez.
- Buton **minöre göre gizlenmez** (G1 dersi): gizlemek statü sızdırır. Ret jenerik gelir.

---

## 5. i18n + tema

Tüm yeni metin `web/src/i18n/tr.json` → `mobile.*` veya mevcut uygun anahtar. **Kopya dosya yok**
(üretilmiş `tr.generated.json` gitignore'da). Renk/ölçü/yarıçap `src/theme` üzerinden; web'de olmayan token
uydurulmaz. Terminoloji: **arkadaş → Kanka, sunucu → Ortam** (kod İngilizce kalır).

---

## 6. Kapsam DIŞI (yapma — sapma sayılır)

- **Kullanıcı adıyla arama/ekleme** (T&S duruşu, §3.1) · **rehber senkronizasyonu** (KVKK)
- **Ortam-geneli mesaj arama** (§3.5) · Discord'un sekmeli arama ekranı (Kişiler/Medya/Sabitlemeler —
  bizde karşılığı olmayan yüzeyler)
- **Kayıt + şifre sıfırlama** → **M1c** (sahip sıralaması; yaş kapısı web ile birebir aynı sıkılıkta olacak, R7)
- **Ortama davetle katılma + kanal kategorileri** → **M1d**
- **Ses / ekran-kamera paylaşımı** → mobil sürecin sonu (LiveKit, izinler, en yoğun T&S)
- **`channel.activity`** (guild kanal okunmamışı canlı) — M1a §8.3'te tespit edildi, sahip kararıyla bu
  sprint dışında bırakıldı
- **Push bildirimi** → M2 (dev build gerektirir)
- Ek yükleme (ataş düğmesi), tepkiler, sabitleme, presence — hâlâ kapsam dışı

---

## 7. M1a'dan devredilen açık maddeler (bu sprint'te kapanmaz, kaybolmaz)

1. **Gezinme çubuğu ilk-açılış beyaz şeridi** → M2 dev build (M1a §8.2/3 + `PLAN.md`).
2. **Mobil → web yönü** açıkça gözlenmedi (web → mobil doğrulandı).
3. **Reconnect bayat token kanıtı** dolaylı (~30dk kesintisiz oturum, 401 görülmedi; açık log yok).

---

## 8. Sapma kuralı

Endpoint yolu, DTO alan adı, ekran sayısı, yetki tablosu bu dosyadan **sapamaz**. İhtiyaç doğarsa dev
**durur**, kullanıcıya bildirir, PM revize eder. Yeni bağımlılık = **PM onayı** (istisna: `npx expo install`'un
dayattığı peer'lar). `TASK.md`'ye item eklenmez.

---

## 9. PM incelemesi — dev teslimi 2026-07-30

**Bağımsız doğrulama (dev raporu olduğu gibi kabul edilmedi):**
`api/` **dokunulmamış** (git diff'te yalnız `mobile/` + `TASK.md` + izinli i18n istisnası `web/src/i18n/tr.json`).
`typecheck` + `lint` + `expo-doctor` 18/18 PM tarafından yeniden koşuldu, temiz. Gömülü hex renk **YOK**,
gömülü Türkçe string **YOK**, kullanılan **129** i18n anahtarının tamamı `tr.json`'da mevcut (M1a'da 65'ti).
`tr.json`'a yalnız 7 satır eklenmiş — çünkü web'in mevcut anahtarları yeniden kullanılmış; bu **doğru**
davranış (aynı bağlamın Türkçesi orada zaten kararlaştırılmıştı).

**T&S denetimi geçti:** istemci hiçbir yerde hata koduna göre dallanmıyor (`NOT_FRIEND`,
`GROUP_MINOR_FORBIDDEN` vb. grep'lendi — tek eşleşme politikayı açıklayan bir yorum), tüm hatalar
`extractErrorMessage` üzerinden sunucunun Türkçe `message`'ını gösteriyor → sebep tahmin edilmiyor, statü
sızmıyor. Grup ekranında sahiplik kapısı `isOwner && (…)` ile **hiç render etmeme** biçiminde (disabled
değil) — §2 yetki tablosuna uygun. `stores/friends.ts` oturum kapsamlı ve `(app)/_layout.tsx` unmount'unda
`reset()` ediliyor → M1a §8.3'te bulunan sızıntı sınıfı tekrarlanmamış.

### Dispozisyonlar (dev'in durduğu 3 nokta)

1. **"Kopyala" — PM ONAYLADI, eklendi.** Dev bağımlılık için doğru davranıp durdu. `expo-clipboard`
   birinci-parti Expo modülü, **Expo Go ile birlikte geliyor** (dev build gerektirmez, `expo-secure-store`
   ile aynı sınıf) → onaylandı. Metinler web'in mevcut `friends.copy`/`friends.copied` anahtarlarından.
2. **Yeni sohbet TEK ekran (1 seçili → DM, 2+ → grup) — KABUL.** Sözleşme §3.2/§3.3'ü ayrı **madde** olarak
   tanımlıyordu, ayrı **route** şart koşmuyordu. Web `StartChatModal.vue` deseniyle aynı; ayırmak kullanıcıya
   "kiminle" sorusunu iki kez sorardı. Sözleşme bu okumayla uyumlu sayılır.
3. **"+" giriş noktası "Mesajlar" başlığının yanında — KABUL** (sözleşme yeri belirtmiyordu, web DM
   bölümündeki "+" ile aynı). Sahip gözle bakar, istemezse yer değişir — küçük iş.

### PM'in kendi bulduğu, dev'in raporlamadığı

- **Dosya boyu drift'i:** `group/[id].tsx` **456 satır** (163 stil / 293 mantık), `friends-add.tsx` 393
  (169/224). Kök `CLAUDE.md` "dosya 300+ satır → düzelt" diyor. **Şimdi bölünmedi:** grup ekranı 5 ayrı
  işlemi (adlandır/ekle/çıkar/ayrıl/sil) onaylarıyla taşıyor, bölmek erken soyutlama olurdu ("böl yalnız
  gerçek acıda"). **Teknik borç olarak kaydedildi** → altıncı işlem eklenirse ya da mantık 300'ü geçerse bölünür.
- **Zıplama motoru sağlam** (dev'in "en emin olmadığım yer" dediği): 20 denemeyle sınırlı (sonsuz döngü yok),
  `onScrollToIndexFailed` ile değişken satır yüksekliği yedeği var, mevcut yükleme göstergesini kullandığı
  için sessiz beklemiyor, bulamazsa kanalda kalıyor (§3.5 alternatifi). Kalan risk **gerçek cihaz** riski.

### DoD durumu

**11 maddenin 9'u cihazda görülmeyi bekliyor** — bu sprint'in DoD'u zaten "fiziksel cihazda görülerek kapanır"
diye yazıldı ve dev'e emülatör/cihaz testi bilinçli olarak verilmedi (M1a'da o döngüde saatler kaybedildi).
Statik olarak kapanan iki madde (§1/10 i18n+token, §1/11 typecheck+lint+`api/` dokunulmadı) PM tarafından
bağımsız doğrulandı. **Sahip yürüyüşü bekleniyor**, en kırılgan madde: mesaj arama + zıplama.
