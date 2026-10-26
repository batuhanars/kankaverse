# SPRINT C13b: Avatar ve afişte kullanıcı konumlandırması

> Durum: **TASARIM KİLİTLİ (2026-10-26).** PM compose (Opus). Sahip isteği: "konumlandırmayı kullanıcı yapsın,
> hem mobil hem web". C13'ün devamı (`SPRINT_C13_ANIMATED_PROFILE_CONTRACT.md`), D25 (kırpma UI yok) ve
> D28 (görsel boyutlandırılmıyor) borçlarını kapatır. Sıra: **api → web + mobil paralel.** Mobil yalnız JS:
> yeni native paket YOK, mevcut debug APK geçerli. Mağaza sürümü (versionCode 25) bu sprintle birlikte çıkar.
> **R7:** güvenilmeyen dosya işleme hattı genişliyor (görsel girişi). Diff sahibe sunulur.

---

## §0 Kapsam ve kararlar

**Sorun:** sunucu her görseli merkezden kırpıyor. 5:2 afişte dikey kaynaktan yalnız ortadaki şerit kalıyor
(sahip örneği: yürüyen köpeğin yüzü değil ayakları görünüyor).

**IN:** avatar (1:1) ve profil afişi (5:2) için, **statik görsel, GIF ve video kesiti** dahil her kaynakta
kullanıcı kaynağı sabit bir çerçeve içinde **sürükler ve yakınlaştırır**. Seçtiği alan sunucuya gönderilir.

**Kilitli kararlar:**
- **Kırpma sunucuda, istemci yalnız dikdörtgen gönderir.** İstemcide kırpma reddedildi: mobilde görsel
  işleme için yeni native paket gerekir, GIF/videoda istemci zaten kırpamaz. Tek hat = üç istemci aynı sonuç.
- **Statik görseller de sunucu hattına geçer.** Yeni istemciler (web, mobil versionCode 25+) statik PNG/JPEG/WebP'yi
  de C13 presign + işleme uçlarından gönderir. Bu aynı zamanda D28'i kapatır: görsel boyutlandırılıp WebP'ye çevrilir.
- **C8 statik yolu (`POST /users/me/avatar/presign` + `PATCH /users/me/avatar`, banner eşi) KALIR.** Mağazadaki eski
  mobil sürümler onu kullanıyor. Yeni istemciler yalnız *kaldırma* (`PATCH` + `storageKey: null`) için onu çağırır.
- **Uç adları değişmez.** `/users/me/animated/presign` ve `/users/me/{avatar,banner}/animated` artık statik görseli
  de işliyor. Ad yanıltıcı ama web canlıda; yeniden adlandırma = iki istemcide kırılma riski, kazanç kozmetik.
- **Statik görsel için `sharp` (api'ye yeni bağımlılık, PM onaylı).** Gerekçe: JPEG EXIF yönünü uygular (telefon
  fotoğrafı yan dönmez), görsel için ffmpeg'den hızlı ve uygun araç. GIF ve video ffmpeg'de kalır.
- **Kaydırma + yakınlaştırma, döndürme yok.** Çerçeve hedefin oranında sabit (avatar daire maskeli kare, afiş 5:2).
  Yakınlaştırma 1x (kaynak çerçeveyi "cover" ile doldurur) ile 4x arası. Kaynak çerçeveden taşamaz, boşluk bırakılamaz.

**OUT:** döndürme, filtre · ortam afişi/ikonu (aynı desen ileride) · eski C8 yolunun kaldırılması (eski mobil
sürümler emekliye ayrılınca, ayrı karar) · liste avatarlarında hover animasyonu.

---

## §1 Veri modeli
Değişiklik YOK. Migration YOK.

---

## §2 Backend

### §2.1 İstek gövdesi (iki işleme ucu)
```jsonc
{
  "stagingKey": "...",
  "startMs": 0, "durationMs": 3000,          // C13'teki gibi, yalnız video
  "crop": { "x": 0.10, "y": 0.25, "width": 0.80, "height": 0.32 }   // opsiyonel
}
```
- `crop` değerleri **kaynağın genişlik ve yüksekliğine oranla 0 ile 1 arası kesirler** (görüntülenen çözünürlükten
  bağımsız; istemci küçültülmüş önizleme üzerinden hesaplar, sonuç aynıdır).
- Doğrulama (`class-validator`): her biri sonlu sayı, `x,y >= 0`, `width,height > 0`, `x+width <= 1.0001`,
  `y+height <= 1.0001`. Aksi → `INVALID_CROP` 400.
- **Oran düzeltmesi sunucuda:** kesirler kaynak piksellere çevrilir, dikdörtgen hedef oranına (1:1 / 5:2)
  **merkezi korunarak** küçültülerek oturtulur, kaynak sınırına kıstırılır. İstemcinin yuvarlama hatası
  böylece reddedilmez, düzeltilir.
- `crop` yoksa C13 davranışı: merkezden kırp (eski istemciler için).

### §2.2 Görsel girişi
- Presign allowlist'ine `image/png`, `image/jpeg`, `image/webp` eklenir. Girdi tavanı 15 MB.
- Görsel girişte `startMs/durationMs` yok sayılır. Çıktı: **yalnız statik WebP**. DB'de `avatarUrl = static`,
  `avatarAnimatedUrl = null` (banner eşi). Kendi değiştirmede önceki nesnelerin silinmesi (C13 adım 8) burada da geçerli.
- Hareketli WebP **girişi** C8'deki gibi desteklenmez (`image/webp` statik kabul edilir; hareketli WebP gelirse ilk kare).
- Statik çıktı boyutu (yüksek DPI için 2x): avatar 512×512, afiş 1200×480. Kalite 85.

### §2.3 sharp kullanımı (R7)
- `sharp(input, { limitInputPixels: 8192 * 8192, failOn: 'error' })` → `.rotate()` (EXIF yönü) →
  `.extract({ left, top, width, height })` → `.resize(w, h)` → `.webp({ quality: 85 })`. Metadata yazılmaz
  (sharp varsayılanı: `withMetadata` çağrılmaz).
- **Dikkat:** crop kesirleri EXIF yönü **uygulandıktan sonraki** boyutlara göre çevrilir (istemci de döndürülmüş
  görseli gösteriyor). `sharp().rotate()` sonrası boyut için `metadata()` + `orientation` 5-8 ise genişlik/yükseklik takası.
- Docker: `node:22-alpine` için sharp prebuilt musl ikilisi `npm ci` ile gelir; konteynerde `require('sharp')` doğrulanır.
- Eşzamanlılık sayacı, zaman aşımı (sharp için 30 sn `Promise.race`), staging temizliği C13 ile aynı.

### §2.4 ffmpeg (GIF + video)
`ffmpeg-args.ts` `cropScaleFilter`, crop verilmişse `crop=W:H:X:Y,scale=w:h` üretir (piksel değerleri
`assertSafeNumber` + tamsayı). Crop yoksa mevcut filtre. Filtre sırası: **fps → crop → scale**.

### §2.5 Hata kodları
C13 tablosuna ek: `INVALID_CROP` 400. Görsel çözülemezse `INVALID_MEDIA` 422 (mevcut).

### §2.6 Testler
- Oran düzeltmesi: 1:1 ve 5:2 için kesirden piksele, merkez korunarak oturtma, sınır kıstırma (saf fonksiyon).
- `INVALID_CROP` reddi (negatif, 1'i aşan toplam, NaN).
- ffmpeg argümanı crop'lu ve crop'suz.
- Görsel girişte animated alanının null'lanması.
- Yerelde gerçek deneme: **EXIF yönü 6 olan bir JPEG** (yan çekilmiş telefon fotoğrafı) doğru yönde çıkıyor;
  afişte üst kısım seçilince çıktı üst kısmı içeriyor.

---

## §3 Web

1. **Konumlandırma bileşeni** (`web/src/components/shared/MediaPositioner.vue`, yeni): hedef oranında çerçeve
   (avatar daire maskesi, afiş 5:2 yuvarlatılmış), içinde kaynak (img / video). Fareyle ve dokunmayla sürükle,
   tekerlekle ve kaydırıcıyla yakınlaştır (1x-4x). Kaynak çerçeveyi her zaman doldurur, sınıra kıstırılır.
   Çıktı: §2.1 kesirleri.
2. **Akış:** her türlü dosya seçimi (statik, GIF, video) aynı modala girer (C13'ün `AnimatedClipModal`'ı genişler):
   önce konumlandırma, video ise altında kesit kaydırıcıları. Statik görsel de artık bu modala girer ve C13 uçlarından gider.
3. Kaldırma eskisi gibi C8 `PATCH null`.
4. i18n `profile.animated.*` altına (`position`, `zoom`, `dragHint`), hata kodu `INVALID_CROP`. Uzun çizgi yok.
5. Responsive: modal 390 ve 320 px'te ölçülür.

---

## §4 Mobil (yalnız JS, yeni paket YOK)

1. **Konumlandırma bileşeni** (`mobile/src/components/me/MediaPositioner.tsx`, yeni): mevcut
   `react-native-gesture-handler` (Pan + Pinch) ve `react-native-reanimated` ile. Kurallar web ile aynı.
2. Video önizlemesinde `surfaceType="textureView"` korunur (C13 cihaz turu dersi: SurfaceView kırpılmıyor,
   dönüşümle taşınan videoda da aynı sorun çıkar).
3. Statik görsel de `AnimatedClipSheet` akışına girer ve C13 uçlarından gider. C13 mobil ajanının eklediği
   "2 MB üstü JPEG'e sıkıştırma" kalır (yükleme süresi için), ama crop kesirleri sıkıştırılmış görselin
   boyutlarına göre hesaplanır (oran aynı olduğu için kesirler değişmez).
4. Kaldırma eskisi gibi C8 `PATCH null`.
5. `npm run typecheck` + `npm run lint`. Cihaz testi YOK (sahipte). Native değişiklik olmadığı için derleme gerekmez.

---

## §5 DoD

- [ ] api: `crop` alanı + `INVALID_CROP`; oran düzeltmesi saf fonksiyon + test
- [ ] api: görsel girişi (sharp, EXIF yönü, 512 / 1200×480 WebP), animated alanı null
- [ ] api: ffmpeg crop filtresi (fps → crop → scale), argüman testi
- [ ] api: Docker'da sharp yükleniyor; yerelde EXIF-6 JPEG ve üst-kısım afiş denemesi
- [ ] web: `MediaPositioner` + tüm türler tek modalda; 390/320 ölçüldü
- [ ] mobil: `MediaPositioner` (gesture-handler + reanimated); yeni paket yok
- [ ] build/test: api `nest build` + jest; web `vue-tsc -b` (bilinen 6) + `vite build`; mobil typecheck + lint
- [ ] **R7 insan incelemesi:** sharp hattı + crop doğrulaması diff'i sahibe sunuldu
- [ ] Sahip canlı test web + cihaz turu mobil (EXIF'li telefon fotoğrafı, dikey videodan afiş, GIF avatar)
- [ ] Mağaza sürümü: versionCode 25 release paketi canlıya karşı cihazda denendi

---

## §6 Sapma kuralı
Şunlar → **DUR, PM'e dön:** istemcide kırpma · mobilde yeni paket · döndürme/filtre · C8 statik yolunu kaldırma ·
uç adlarını değiştirme · şema değişikliği · ortam afişi/ikonu.
