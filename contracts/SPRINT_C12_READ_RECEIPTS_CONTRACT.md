# Sprint C12 — Okundu Bilgisi (tek tik / çift tik)

> **Kaynak:** sahip isteği 2026-08-11, referans WhatsApp. PM görüşü aynı gün verildi ve onaylandı.
> **Tier:** `api/` + `web/` + `mobile/`. Üçü de bu sözleşmeye bakar; tek doğruluk kaynağı burasıdır.
> **Kapsam:** yalnız **1-1 DM**. Grup DM ve ortam kanalı bu sprintte YOK (§8).
> **R7:** §2 (gizlilik anahtarı) ve §3.2 (kimin görebileceği kararı) T&S karar yüzeyidir, satır satır
> insan incelemesi zorunlu. Sahip onayı olmadan merge edilmez.

---

## §0 Ne inşa ediyoruz, neyi inşa etmiyoruz

Gönderdiğin mesajın altında/yanında iki durumlu bir gösterge:

| Gösterge | Anlamı | Nereden geliyor |
|---|---|---|
| tek tik | mesaj sunucuda | mesaj listede görünüyorsa zaten doğru |
| çift tik | karşı taraf okudu | karşı tarafın `lastReadAt` >= mesajın `createdAt` |

**Tek tikin bugün bir bilgi taşımadığını bilerek yazıyoruz.** Bizde mesaj listeye ancak sunucu
onayladıktan sonra giriyor, yani tek tik her zaman anında doğru. Üçüncü ve asıl anlamlı durum
(**gönderiliyor / gönderilemedi**) iyimser ekleme gerektiriyor ve **ayrı bir sprintin işi** —
bkz. §8. Tek tik burada tek başına bir iddia değil, çift tikin okunabilir olmasını sağlayan
dinlenme durumudur. Bu sıralamayı değiştirme, sırayı PM belirledi.

**Yeni tablo YOK. Mesaj başına yeni alan YOK.** Okundu bilgisi tek bir tarihten türetilir.

---

## §1 Veri modeli

### 1.1 Var olan, dokunulmayacak

`ChannelMember.lastReadAt` (şemada zaten var, `POST /dm/channels/:id/read` bunu yazıyor).
Okundu hesabının tamamı bu alandan çıkar. **Yeni bir okuma tablosu açma.**

### 1.2 Eklenecek tek alan

```prisma
model User {
  // ...
  readReceipts Boolean @default(true) // C12 — okundu bilgisi paylaşımı (karşılıklı, §2)
}
```

Migration zorunlu ve **DB'ye uygulanmış olacak** (`prisma migrate status` temiz). Build ve testler
mock Prisma kullandığı için bunu yakalamaz; DoD maddesi olarak sayılır.

---

## §2 Gizlilik anahtarı — R7

Okundu bilgisi bir baskı aracıdır ("okudun ama cevap vermedin"). WhatsApp, Instagram ve Telegram'ın
üçünde de kapatma anahtarı olmasının sebebi budur. Anahtarsız açmıyoruz.

**Kural (karşılıklı):** `readReceipts = false` olan kullanıcı kendi okuma bilgisini paylaşmaz **ve
karşı tarafınkini de göremez.** Tek yönlü kullanım (ben göreyim, beni görmesinler) yok.

- Uç: mevcut `PATCH /users/me` (`UpdateProfileDto`). **Yeni endpoint açma.**
  ```ts
  @ApiPropertyOptional({ description: 'Okundu bilgisi paylaşımı (karşılıklı).' })
  @IsOptional()
  @IsBoolean()
  readReceipts?: boolean;
  ```
- `UserDto`ya `readReceipts: boolean` eklenir (istemciler kendi durumunu okur).
- Varsayılan **açık** (`true`). Minör için ayrı varsayılan YOK; anahtar herkes için aynı yerde ve
  aynı şekilde çalışır.
- Arayüz yeri **hazır, yeni ekran açma**: web'de Ayarlar → Gizlilik (dmPolicy'nin yanı),
  mobilde `src/app/(app)/dm-privacy.tsx`. Anahtarın altına kuralı açık yazan tek satır açıklama
  konur: karşılıklı olduğu kullanıcıya söylenmeden açılmaz.
- i18n: yeni metinler `web/src/i18n/tr.json`'a. Mobil kopyalamaz, `i18n:sync` ile alır.

---

## §3 Sunucu

### 3.1 DTO alanı

`toDmChannelDto` (`api/src/modules/dm/dm.service.ts`) dönüşüne tek alan eklenir:

```ts
receiptsEnabled: boolean     // tik çizilecek mi (gizlilik kapısı)
otherReadAt: string | null   // karşı tarafın okuma anı; null = henüz hiç okumamış (TEK tik)
```

Kanal listesi (`GET /dm/channels`) ve tekil DM dönüşleri aynı alanı taşır. Kaynak: karşı tarafın
`ChannelMember.lastReadAt` değeri.

### 3.2 `receiptsEnabled` ne zaman `false` döner — R7, fail-closed

🔴 **İki soru ayrıdır** (ilk sürümün kusuru, sahip bulgusu 2026-08-11): "tik çizilecek mi" bir
gizlilik kararı, "karşı taraf ne zaman okudu" bir veridir. İkisi tek alana sıkıştırılınca "henüz
hiç okumamış" ile "gizlilik kapalı" aynı sonuca düşüyor ve karşı taraf sohbeti bir kez bile
açmadıysa tik HİÇ çizilmiyordu, yani ilk mesajda "İletildi" asla görünmüyordu.

Aşağıdakilerden **herhangi biri** doğruysa `receiptsEnabled: false`:

1. Kanal 1-1 DM değil (grup DM → bu sprintte alan hep `null`).
2. Karşı tarafın `readReceipts = false`.
3. **Benim** `readReceipts = false` (karşılıklılık — §2).
4. Kanal `dmRequestStatus = 'PENDING'`. **Bekleyen mesaj isteğinde okundu sızmaz.** İstek kabul
   edilmeden "okudu" bilgisi vermek, isteği süzgeç olmaktan çıkarır (C9'un amacını bozar).
5. Taraflardan biri diğerini engellemiş (`canMessage = false` hâli).

Karşı taraf hiç okumamışsa (`lastReadAt` null) `receiptsEnabled` **true kalır**, yalnız
`otherReadAt` null olur → istemci TEK tik çizer. Belirsizlikte `false` dönülür. Bu liste tek yerde, tek fonksiyonda uygulanır; §3.3'teki olay yayını
**aynı fonksiyonu** kullanır (iki ayrı yerde iki ayrı kural yazma).

### 3.3 Canlı güncelleme — yeni soket olayı

Bugün `markRead` karşı tarafa hiçbir şey söylemiyor. Bu hâliyle tik ancak ekran kapatılıp
açılınca dönerdi.

```
dm:read  →  { channelId: string, userId: string, readAt: string }
```

- `markRead` başarıyla `lastReadAt` yazdıktan sonra, kanalın **diğer** üyesine `emitToUser` ile
  gönderilir (`user:<id>` odası, mevcut desen).
- §3.2'deki kurallar burada da geçerli: alıcının görmeye hakkı yoksa **olay hiç gönderilmez**.
  Kararı istemciye bırakma.
- Yeni oda, yeni namespace, yeni handshake YOK.

---

## §4 İstemci (web + mobil, aynı kural)

### 4.1 Hesap

Kanal başına tek bir `otherReadAt` tutulur (DM store'unda, kanal kaydının yanında). Benim
yazdığım bir mesaj için:

```
tik var mı = receiptsEnabled
çift tik  = otherReadAt !== null && mesaj.createdAt <= otherReadAt
```

**Mesaj başına durum saklama.** Tek tarihten türet; `dm:read` gelince tarih güncellenir ve o
kanaldaki tüm kendi mesajlarım tek seferde doğru duruma geçer.

### 4.2 Gösterim

- Yalnız **kendi** mesajlarımda. Karşı tarafın mesajında tik yok.
- Yalnız 1-1 DM'de. Grup DM ve ortam kanalında hiçbir şey çizilmez.
- `receiptsEnabled === false` ise (gizlilik kapalı, istek bekliyor, engel, grup DM) **tik hiç çizilmez** — "tek tik
  takılı kaldı" görüntüsü vermez, gösterge tamamen yok olur.
- Yerleşim: mesaj saatinin yanına, saatle aynı ikincil renkte; okununca aksan rengine döner.
  Yeni bir satır/şerit açma, mesaj yüksekliğini artırma.
- Erişilebilirlik: ikonun `accessibilityLabel`/`title` karşılığı i18n'den ("İletildi" / "Görüldü").
  İkon tek başına bilgi taşımaz.

### 4.3 🔴 Ekran açıkken okundu işaretleme

Bugün `markRead` ekrana girişte çağrılıyor. A ekrana bakarken B mesaj gönderirse A'nın istemcisi
`markRead`'i **yeniden** çağırmazsa B'nin tiki hiç dönmez ve özellik bozuk görünür.

Yapılacak: kanal ekranı **odaktayken** yeni mesaj geldiğinde `markRead` tekrar çağrılır. Mevcut odak
kancası kullanılır (`dm/[id].tsx` M5d §1 deseni; web'de `activeDmChannelId`). Yeni yaşam döngüsü
mekanizması kurma. Uygulama arka plandayken çağırma — arka planda okunmuş sayılmaz.

---

## §5 Doğrulama

- `api/`: `npm run build` + `npm test` yeşil · `npx prisma migrate status` temiz.
- `web/`: `npx vue-tsc -b` (bilinen 6 önceden-var hata, fazlası senin) · dokunduğun dosyalarda
  `npx eslint` temiz · `npx vite build` yeşil.
- `mobile/`: `npm run typecheck` + `npm run lint` temiz.
- **Cihaz/tarayıcı turu sahipte.** "Çalışıyor" beyanı üretme; hangi akışların elle gezilmesi
  gerektiğini yaz.

### Sahibin elle geçeceği akışlar (dev bunları listeler, kendisi geçemez)

1. A yazar, B kapalı → tek tik. B açar → çift tike döner (**B ekranı açarken A ekranda beklerken**).
2. İkisi de ekranda açıkken A yazar → tik doğrudan çifte gider (§4.3 sınavı).
3. B anahtarı kapatır → A'da tik **tamamen kaybolur** (tek tikte donmaz), B de A'nınkini göremez.
4. Bekleyen mesaj isteğinde tik yok; kabul edildikten sonra çalışıyor.
5. Grup DM ve ortam kanalında hiçbir tik görünmüyor.
6. Web'de gönder → mobilde oku → web'de tik dönüyor (çapraz istemci).

---

## §6 Yapmayacakların

- Mesaj tablosuna okundu alanı ekleme, okundu için yeni tablo açma.
- "Kim okudu" listesi (grup işi, §8).
- Yazıyor/son görülme gibi yeni bir ifşa alanı ekleme. Bu sprint yalnız okundu.
- Ortam kanallarına tik koyma. Orada okundu bilgisi anlamsız ve gürültülü.
- Gizlilik anahtarını tek yönlü yapma.

---

## §7 Sapma kuralı

Buradaki endpoint imzası, DTO alanı, olay adı veya `null` kuralı sana yanlış geliyorsa **kod yazma:
dur, sahibe bildir, PM revize etsin.** Özellikle §3.2 listesini kendiliğinden genişletme veya daralt‑
ma — orası R7 yüzeyi.

---

## §8 Bu sprintte YOK, sırası kayıtlı

**C12b — gönderim durumu (iyimser ekleme).** Saat ikonu (gidiyor) ve gönderilemedi + tekrar dene.
Tek tiki anlamlı kılan parça budur. Ayrı sprint çünkü mesaj listesine iyimser ekleme getiriyor ve
kendi soket yankısıyla tekilleştirme gerektiriyor (kendi mesajın `message.created` ile geri
geliyor) — okundu bilgisiyle aynı sprinte sıkıştırılırsa ikisi birden riske girer.

**C12c — grup DM'de okundu.** Karar verilecek soru: çift tik "herkes okudu" mu demek? 5 kişilik
grupta bir kişi bir hafta girmezse çift tik hiç gelmez ve bozuk görünür. Muhtemel çözüm tike
dokununca "kim okudu" listesi. Karar alınmadan yazılmaz.

İkisi de `PLAN.md` teknik borç/sıradaki tablosuna işlenir.
