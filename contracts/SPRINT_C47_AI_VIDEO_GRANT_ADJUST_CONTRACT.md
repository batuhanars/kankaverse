# SPRINT C47: Yapay zeka: admin kredi ayarı (ekle / düş)

> Durum: **TASARIM KİLİTLİ (2026-11-02).** PM compose (Opus). Sahip isteği. **api + web**. Mobil değişmez (mobilde admin yüzeyi yok).
> **R7:** yapay zeka hak bütçesi yazma yolu. Diff sahip onayına sunulur, onaysız merge yok.
> **C44 ile ilişki:** C44 taslağındaki "Kredi ekle" sahip kararıyla düşmüştü ("tek araç Yenile"). Sahip 2026-11-02'de bilinçli olarak
> tersine çevirdi: yanlış verilen krediyi düşürmek gerekiyor, artırma da aynı araçta olsun. Ek kredi SATIŞI ve abonelik hâlâ OUT.

## §0 Sorun ve karar
Tek bütçe aracı `PUT` Yenile. O yalnız artırır, yeni dönem açar (harcanan sıfırlanır), süren üretimde 409 verir, küsuratı düşürür,
boş not gelirse notu siler. Yanlışlıkla fazla verilen kredi geri alınamıyor (iptal + yenile dışında; o da geçmişi siler).

**Karar:** etkin hakta bütçeyi göreli değiştiren tek uç. Dönem açmaz. `PUT` Yenile davranışı ve imzası DEĞİŞMEZ.

## §1 API (`api/src/modules/ai-video/`)
Envelope standart. Kapı: `JwtAuthGuard` + `PlatformAdminGuard` (mevcut controller).

`POST /admin/ai-video/grants/:userId/adjust`
- Gövde `AdjustAiVideoGrantDto`: `deltaCredits` tam sayı, -100000 ile 100000 arası, `0` geçersiz. `note?` en fazla 200, trim (Upsert ile aynı kural).
- Dönüş: `AiVideoGrantRowDto` (200).

Kurallar, hepsi `lockAiVideoUser` transaction'ı içinde:
1. Kayıt yok: 404 "Erişim hakkı bulunamadı."
2. İptal edilmiş ya da süresi dolmuş hak: 409 `AI_VIDEO_GRANT_NOT_ADJUSTABLE` ("Bu hak için Yenile kullan.").
3. Artırmada (`delta > 0`) hedef kullanıcı silinmiş: 404; reşit değil: 403 `MINOR_NOT_ALLOWED`. **Düşürme her durumda serbest** (kapatmak güvenli yön).
4. Düşürmede: `|delta|` mikro karşılığı `max(0, bütçe - spentSinceMicro(startsAt))` değerini aşarsa 400 `AI_VIDEO_GRANT_REDUCE_TOO_MUCH`
   ("Kalan krediden fazlası düşülemez."). Bütçe asla harcananın altına inmez. Süren üretim engel DEĞİL: rezerv `spentSinceMicro` içinde zaten sayılı.
5. Artırmada yeni bütçe `INT4_MAX` üstündeyse 400 `AI_VIDEO_GRANT_TOO_BIG` (mevcut kod).
6. `startsAt`, `expiresAt`, `revokedAt`, `grantedById` değişmez. `note` geldiyse yerine geçer, gelmediyse korunur.
7. AuditLog: `ai_video.adjust`, metadata `{ deltaCredits, beforeCredits, afterCredits, note }` (önce/sonra = BÜTÇE; kalan harcamayla değiştiği için kayıtta kalıcı anlam taşımaz). Boş not "gelmedi" sayılır, mevcut not korunur. Kullanıcıya `note` hiçbir yüzeyde dönmez (mevcut kural).

Testler (`ai-video-grants.service.spec.ts`): artırma; düşürme; kalanın tamamını düşürme (durum EXHAUSTED); kalandan fazla 400;
süren üretim varken düşürme çalışır ve rezerv korunur; iptal ve süresi dolmuşta 409; yok 404; minöre artırma 403, minörden düşürme çalışır;
tavan 400; `startsAt` ve not korunur; audit metadata. DTO: `0` ve tam sayı olmayan reddedilir. Yetki: mevcut controller sınıf guard'ı altında.

## §2 Web (admin, `views/settings/components/`)
1. `adminApi.adjustAiVideoGrant(userId, { deltaCredits, note? })`.
2. Yeni pencere: **Kredi ayarla**. `Ekle / Düş` seçimi, miktar (1-100000), isteğe bağlı not, önizleme: "Kalan 80 → 130".
   Düş seçiliyken miktar `remainingCredits` üstündeyse kaydet kapalı + açıklama. Sunucu hatasının `message`'ı gösterilir. Doğrulama vee-validate + zod.
3. Satır eylemleri: `ACTIVE` ve `EXHAUSTED`: **Kredi ayarla** + **İptal et**. `EXPIRED`: **Yenile** + **İptal et**. `REVOKED`: **Yenile**.
4. `AiGrantFormModal`: yenilemede kredi alanı **boş açılır** (bugün mevcut bütçeyle dolu; hiçbir şeye dokunmadan Kaydet bütçeyi ikiye katlıyor).
5. "Erişim ver" kullanıcı seçicisi, listede satırı olan kullanıcıları göstermez. Aksi halde etkin haktaki kullanıcıya bu yoldan fark ettirmeden yeni dönem açılır.
6. Kaydetten sonra tablo ve bakiye kartı birlikte tazelenir (`refreshAll`). Metinler `tr.json`; em dash yok.

## §3 DoD
api: tüm testler + `prisma generate` gerekmiyor (şema değişmez) + `tsc -p tsconfig.build.json --noEmit`.
web: `vue-tsc -b` (6 önceden-var dışında hata yok) + dokunulan dosyalarda eslint + `vite build`.
Elle: sahip masaüstü admin sekmesinde ekle, düş, kalandan fazla düş, bitmiş hakka ekle dener; hedef kullanıcının yapay zeka ekranında kalan kredi doğrulanır. Sahip R7 onayı.

## §3b Bilinen, bilinçli bırakılan
- Kalan küsuratlıysa (1,6 kredi) ekranda en çok tam kısım düşülür; 1 krediden az artık kalır, satır "Etkin, 0 kalan" görünür, kapı üretimi yine reddeder. Normal harcamada da oluşan mevcut durum.
- Bakiye kartındaki "harcanmamış" toplamı sunucuda 60 sn önbellekli (`ai-video-balance.service.ts`), ayardan sonra en çok 60 sn eski kalabilir. Tablo anında güncel.
- "Erişim ver" seçicisi yalnız arayüz koruması; `PUT` etkin hakta yeni dönem açmayı sürdürür (Yenile davranışı OUT).

## §4 OUT
Kredi satışı, abonelik, mobil admin, `PUT` Yenile davranış değişikliği, kullanıcıya kredi değişim bildirimi, satır bazında işlem geçmişi ekranı (AuditLog yeterli).
