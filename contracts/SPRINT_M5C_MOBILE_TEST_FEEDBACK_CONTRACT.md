# Sprint M5c — Kapalı Test Geri Bildirimleri (mobil)

> **Tier:** yalnız `mobile/`. `api/` ve `web/` diffi **sıfır**. Bir maddede bile backend değişikliği
> gerektiği hissi doğarsa **DUR ve PM'e bildir** — bu sprint bilerek istemci-yalnız.
> **Kaynak:** Play kapalı testi ilk turundan gelen testçi geri bildirimleri (TASK.md 2026-08-10 akşamı)
> \+ sahibin onayladığı tasarım kararları.
> **Native diff YOK** → yeni dev build gerekmez, `npx expo start --dev-client` yeterli.
> **R7 yüzeyi yok:** auth mantığına ve T&S karar fonksiyonlarına dokunulmuyor. §1 yalnız bir alanın
> görünürlüğünü değiştiriyor, doğrulama akışını DEĞİŞTİRMİYOR.

## §0 Çalışma biçimi

Maddeler **tek tek** yapılır. Her maddeden sonra `npm run typecheck` + `npm run lint` çalıştırılır ve
o madde kendi başına bitmiş olur. Beş maddeyi tek seferde yazıp sona bırakma — sahip cihazda tek tek
doğrulayacak, yarım kalan madde hepsini bloke eder.

Sıra bilerek böyle: **§1 → §2 → §3 → §4 → §5**. Önce kesin ve küçük olanlar, sonra tasarım kararı
gerektirenler.

---

## §1 Şifre göster düğmesi (giriş + kayıt)

**Sorun:** Mobilde şifre alanlarının yanında göz simgesi yok. Webde var. Testçi şikayeti: yazdığını
göremeden uzun şifre girmek zor, özellikle telefonda.

**Dosyalar:**
- `src/app/(auth)/login.tsx:81` — şifre alanı
- `src/app/(auth)/register.tsx:157` — şifre · `:173` — şifre tekrar (**ikisi de kapsamda**)

**Kural:**
- Her alan **kendi** göster/gizle durumunu taşır. Kayıt ekranında şifre ve şifre tekrar alanları
  birbirinden bağımsız açılıp kapanır (tek bayrakla ikisini birden çevirme).
- Varsayılan **gizli** (`secureTextEntry` açık). Kullanıcı isteyerek gösterir.
- İkon `Ionicons` `eye-outline` / `eye-off-outline`, boyut ve renk çevredeki ikonlarla aynı
  (`theme.colors.textSecondary`), kendi uydurduğun değer yok.
- Dokunma hedefi **44dp** (bkz. `MessageComposer.iconButton` deseni). İkon 20-24px olabilir, basılabilir
  alan küçülmez.
- `accessibilityRole="button"` + `accessibilityLabel` — metin i18n'den (`mobile.auth.*` altına yeni iki
  anahtar: göster / gizle). **Koda string gömme.**

🔴 **Kapsam sınırı:** `security-password.tsx` ve `ReauthFields.tsx` **bu sprintte YOK**. Onlar ayrı
akışlar; testçi şikayeti giriş ve kayıt için geldi. Genişletme = scope creep.

**Yeniden kullanım:** Bu üç alan aynı deseni tekrarlıyor. **Rule of Three:** üçüncü tekrarda küçük bir
bileşene çıkar (`src/components/auth/PasswordField.tsx` gibi) ve üçünü de ondan besle. İki tanesi olsa
bekle derdim, üç var, çıkar.

---

## §2 Arama ekranındayken mesaj bildirimi banner olarak düşsün

**Sorun:** Sesli görüşmedeyken mesaj gelince yalnız durum çubuğunda simge beliriyor, kullanıcı elle
aşağı çekmek zorunda kalıyor.

**Kök neden ZATEN BULUNDU (PM, teşhis gerekmiyor):** `src/notifications/push.ts:56`

```
shouldShowBanner: isIncomingCall,
```

Banner **yalnız gelen aramada** açık. Mesaj bildirimi uygulama ön plandayken tanımı gereği banner
olarak düşmüyor. Bu bir kusur değil, dar yazılmış bir kural; genişletilecek.

**Dosya:** `src/notifications/push.ts` — `setNotificationHandler` içi.

**Kural:**
- Mesaj bildirimleri de banner gösterecek.
- 🔴 **İSTİSNA (sahip kararı 2026-08-10):** kullanıcı **o DM'in kendi sohbet ekranındayken** banner
  ÇIKMAZ. Okuduğu mesaj için bildirim almak saçma. Sinyal `stores/dm.ts` içindeki
  `activeDmChannelId` — mevcut, yeni altyapı kurma.
- Gelen arama davranışı **DEĞİŞMEZ**: `isIncomingCall` dalındaki bastırma mantığı (`source !== 'ws'`
  + `isChannelRinging`) olduğu gibi kalır. Ses de yalnız aramada çalar; mesaj için `shouldPlaySound`
  **açılmayacak** (görüşme ortasında sesli bildirim rahatsız edicidir, banner yeterli).
- `shouldSetBadge` **değişmez**.

**Sınır koşulu:** `activeDmChannelId` yalnız DM'leri kapsıyor. Ortam kanalı mesajları için istisna
uygulanmaz; kullanıcı kanaldayken banner çıkabilir. Bunu daraltmak için yeni state ekleme — sahibe
sorulacak bir tasarım sorusu, bu sprintin işi değil. Karşılaşırsan **not düş, geç**.

---

## §3 Arama ekranındaki sohbet düğmesinde okunmamış rozeti

**Sorun:** 1-1 ve grup DM aramasında o DM'e mesaj geldiğinde aksiyon çubuğundaki sohbet (baloncuk)
düğmesinde hiçbir işaret yok.

**Dosyalar:**
- `src/app/(app)/call.tsx:839` — `onOpenChat` prop'unun geçtiği yer
- `CallControls` bileşeni — rozetin çizileceği yer
- `src/stores/dm.ts:165` — `unread` alanı (kanal başına boolean, **hazır**)

**Kural:**
- 🔴 Rozet **NOKTA**, sayı değil (sahip kararı 2026-08-10). Arama ekranı zaten kalabalık; orada gereken
  bilgi "yeni bir şey var", kaç tane olduğu değil. Sayıyı merak eden zaten sohbete giriyor.
- Kaynak `dm` store'daki o kanalın `unread` alanı. **Yeni sayaç, yeni store, yeni endpoint YOK.**
- Sohbete girilince temizlenir — `markRead` zaten `unread`i `false` yapıyor (`dm.ts:179`), rozet
  kendiliğinden söner. Ek temizleme kodu yazma.
- Renk `theme.colors.danger`, konum düğmenin sağ üstü. Ortam ses kanalı aramasında sohbet düğmesi
  zaten çizilmiyor (`isGuildCall ? undefined`), dolayısıyla rozet de yok. **Bu dalı değiştirme.**

---

## §4 Rail'de ortama uzun basma menüsü

**Sorun:** Kullanıcı hangi ortamda olduğunu ve birden fazla ortamı olduğunu göremiyor, kafası
karışıyor (testçi geri bildirimi).

**Dosyalar:**
- `src/components/home/GuildRail.tsx` · `GuildRailItem.tsx` — uzun basma buraya bağlanacak
- `src/components/home/GuildMenuSheet.tsx` — **ZATEN VAR, sıfırdan yazma**
- `ChannelMenuSheet.tsx` — kanal/DM satırlarındaki uzun basma deseni, **örnek al**

**Kural:**
- Rail'deki ortam ikonuna uzun basınca `GuildMenuSheet` açılır. Kısa basış davranışı **DEĞİŞMEZ**.
- Menü içeriği mevcut sheet'te ne varsa odur. Yeni eylem ekleme; eksik bir şey varsa **PM'e bildir**.
- Uzun basma eşiği ve dokunsal geri bildirim `ChannelMenuSheet` ile aynı olmalı — iki farklı his olmasın.

⚠️ **PM notu, dev bunu ÇÖZMEYECEK ama bilsin:** uzun basma gizli bir hareket. "Hangi ortamdayım" diye
kafası karışan kullanıcı onu keşfedemez, yani bu madde şikayetin yarısını çözüyor. Görünür ipucu ayrı
bir tasarım turu; sahip karar verecek. **Bu sprintte ipucu eklenmeyecek** — boş yüzey açmamak için.

---

## §5 Bildirim ikonu — ÖNCE DOĞRULA, kod yazma

**Sorun (iddia):** Sahip bildirim gölgesinde koyu temada eski Expo chevron'unu gördü.

🔬 **Şüphe:** görülen ikon bizim **eski** uyarlanabilir ikonumuzun birebir kendisi (Expo ön planı +
`#E6F4FE` zemin). Bu bir koyu/açık tema kusurundan çok **bayat ikon önbelleği ya da eski kurulum**
gibi duruyor.

**Yapılacak:**
1. `app.json` bildirim ikonu yapılandırmasını oku, `assets/images/` altındaki dosyalarla karşılaştır.
2. Yapılandırma **doğruysa kod yazma.** Bulguyu raporla, sahip temiz kurulumla doğrulasın.
3. Yapılandırma yanlışsa düzelt ve neyin yanlış olduğunu tek cümleyle yaz.

🔴 Bu madde bilerek "belki iş yok" olarak yazıldı. Olmayan bir kusuru düzeltmeye çalışıp ikon
zincirini bozmak, bugünkü durumdan kötüdür.

---

## §6 Doğrulama

Her maddeden sonra:

```
npm run typecheck
npm run lint
```

İkisi de temiz olacak. **Cihaz doğrulaması sende değil** — sahip yapacak, dev build ve Metro döngüsü
hazır. Ekran görüntüsü veya "çalışıyor" beyanı üretme; ne yaptığını ve neyin sınanması gerektiğini yaz.

Bitirince her madde için tek satır: ne değişti, hangi dosya, sahip neyi denemeli.

## §7 Sapma kuralı

Sözleşme dışına çıkma ihtiyacı doğarsa **DUR, PM'e bildir.** Özellikle: yeni bağımlılık, `api/` veya
`web/` değişikliği, yeni store/endpoint, sözleşmede olmayan ekran. Sapmayı gizleyip "yapısal olarak
gerekliydi" diye sonradan anlatma — M4h'te dev doğru davranıp önceden bildirmişti, aynısı beklenir.
